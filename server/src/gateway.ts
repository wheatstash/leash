import { extractAmount } from "./policy/amount.js";
import { evaluate } from "./policy/engine.js";
import { paypalToolsByName, type ToolArgs } from "./paypal.js";
import { approvals, audit, newId, settings, type Approval, type AuditEntry } from "./store.js";

export interface GatewayResult {
  status: AuditEntry["status"];
  auditId: string;
  approvalId?: string;
  message: string;
  result?: unknown;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : JSON.stringify(err);
}

// The toolkit reports PayPal failures as an {"error": ...} result instead of throwing.
function paypalError(result: unknown): string | null {
  let value = result;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (value && typeof value === "object" && "error" in value) {
    const error = (value as { error: unknown }).error;
    if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
    return typeof error === "string" ? error : JSON.stringify(error);
  }
  return null;
}

async function run(entry: AuditEntry): Promise<void> {
  const tool = paypalToolsByName.get(entry.tool)!;
  try {
    entry.result = await tool.execute(entry.args);
    const error = paypalError(entry.result);
    if (error) {
      entry.status = "failed";
      entry.error = error;
    }
  } catch (err) {
    entry.status = "failed";
    entry.error = errorMessage(err);
  }
}

/**
 * The single choke point between any agent and PayPal. Every tool call is
 * evaluated against policy, logged, and only then executed (or not).
 */
export async function guardedCall(toolName: string, args: ToolArgs, source: AuditEntry["source"] = "agent"): Promise<GatewayResult> {
  if (!paypalToolsByName.has(toolName)) {
    throw new Error(`Unknown PayPal tool: ${toolName}`);
  }

  const decision = settings.guardrails
    ? evaluate(toolName, args)
    : { action: "allow" as const, reason: "Guardrails off: no policy checked", policyIds: [], amount: extractAmount(args) };
  const entry: AuditEntry = {
    id: newId(),
    timestamp: new Date().toISOString(),
    tool: toolName,
    args,
    amount: decision.amount,
    decision: decision.action,
    reason: decision.reason,
    policyIds: decision.policyIds,
    status: "executed",
    source,
  };
  audit.unshift(entry);

  if (decision.action === "deny") {
    entry.status = "blocked";
    return { status: "blocked", auditId: entry.id, message: `Blocked by policy. ${decision.reason}` };
  }

  if (decision.action === "require_approval") {
    entry.status = "pending_approval";
    const approval: Approval = {
      id: newId(),
      auditId: entry.id,
      createdAt: entry.timestamp,
      tool: toolName,
      args,
      amount: decision.amount,
      reason: decision.reason,
      status: "pending",
    };
    approvals.unshift(approval);
    return {
      status: "pending_approval",
      auditId: entry.id,
      approvalId: approval.id,
      message: `Held for human approval (approval id ${approval.id}). ${decision.reason}. It will run automatically if approved.`,
    };
  }

  await run(entry);
  return {
    status: entry.status,
    auditId: entry.id,
    message: entry.status === "failed" ? `PayPal error: ${entry.error}` : "Executed",
    result: entry.result,
  };
}

export async function resolveApproval(id: string, approve: boolean): Promise<Approval> {
  const approval = approvals.find((a) => a.id === id);
  if (!approval) throw new Error("Approval not found");
  if (approval.status !== "pending") throw new Error(`Approval already ${approval.status}`);

  const entry = audit.find((e) => e.id === approval.auditId)!;
  approval.status = approve ? "approved" : "rejected";
  approval.resolvedAt = new Date().toISOString();

  if (!approve) {
    entry.status = "rejected";
    return approval;
  }
  entry.status = "approved";
  await run(entry);
  return approval;
}
