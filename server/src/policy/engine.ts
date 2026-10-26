import { audit, policies, type AuditEntry } from "../store.js";
import type { ToolArgs } from "../paypal.js";
import { extractAmount } from "./amount.js";
import type { Decision, Policy, PolicyAction } from "./types.js";

const SEVERITY: Record<PolicyAction, number> = { allow: 0, require_approval: 1, deny: 2 };

export function toolMatches(patterns: string[], tool: string): boolean {
  return patterns.some((p) => p === "*" || p === tool || (p.endsWith("*") && tool.startsWith(p.slice(0, -1))));
}

// Calls that already moved (or are about to move) money count toward limits.
const COUNTED: AuditEntry["status"][] = ["executed", "approved", "pending_approval"];

function recent(policy: Policy, sinceMs: number): AuditEntry[] {
  const cutoff = Date.now() - sinceMs;
  return audit.filter(
    (e) => COUNTED.includes(e.status) && toolMatches(policy.tools, e.tool) && Date.parse(e.timestamp) >= cutoff,
  );
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Returns why the policy triggers for this call, or null if it doesn't. */
function triggers(policy: Policy, amount: number | null): string | null {
  if (policy.minAmount !== null) {
    if (amount === null || amount < policy.minAmount) return null;
  }
  if (policy.maxPerHour !== null) {
    const count = recent(policy, 60 * 60 * 1000).length;
    if (count < policy.maxPerHour) return null;
    return `${count} matching calls in the last hour (limit ${policy.maxPerHour})`;
  }
  if (policy.dailyLimit !== null) {
    const spent = recent(policy, Date.now() - startOfToday()).reduce((s, e) => s + (e.amount ?? 0), 0);
    if (spent + (amount ?? 0) <= policy.dailyLimit) return null;
    return `today's total would reach $${(spent + (amount ?? 0)).toFixed(2)} (cap $${policy.dailyLimit})`;
  }
  if (policy.minAmount !== null) return `amount $${amount!.toFixed(2)} ≥ $${policy.minAmount}`;
  return "tool is covered by this rule";
}

/** Most restrictive triggered policy wins; no triggered policy means allow. */
export function evaluate(tool: string, args: ToolArgs): Decision {
  const amount = extractAmount(args);
  let action: PolicyAction = "allow";
  const hits: { policy: Policy; why: string }[] = [];

  for (const policy of policies) {
    if (!policy.enabled || !toolMatches(policy.tools, tool)) continue;
    const why = triggers(policy, amount);
    if (why === null) continue;
    hits.push({ policy, why });
    if (SEVERITY[policy.action] > SEVERITY[action]) action = policy.action;
  }

  const deciding = hits.filter((h) => h.policy.action === action);
  return {
    action,
    amount,
    policyIds: deciding.map((h) => h.policy.id),
    reason: deciding.length
      ? deciding.map((h) => `${h.policy.name}: ${h.why}`).join("; ")
      : "No policy restricts this call",
  };
}

export function spendSummary() {
  const since = startOfToday();
  const today = audit.filter((e) => COUNTED.includes(e.status) && Date.parse(e.timestamp) >= since);
  const byTool = new Map<string, { tool: string; calls: number; amount: number }>();
  for (const e of today) {
    const row = byTool.get(e.tool) ?? { tool: e.tool, calls: 0, amount: 0 };
    row.calls += 1;
    row.amount += e.amount ?? 0;
    byTool.set(e.tool, row);
  }
  const caps = policies
    .filter((p) => p.enabled && p.dailyLimit !== null)
    .map((p) => {
      const used = recent(p, Date.now() - since).reduce((s, e) => s + (e.amount ?? 0), 0);
      return { policyId: p.id, name: p.name, limit: p.dailyLimit!, used };
    });
  return { byTool: [...byTool.values()], caps };
}
