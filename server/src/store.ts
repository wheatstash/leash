import { randomUUID } from "node:crypto";
import type { Decision, Policy } from "./policy/types.js";
import type { ToolArgs } from "./paypal.js";
import type { HttpCall } from "./trace.js";

// In-memory store. Fine for a hackathon demo; swap for SQLite/Postgres to persist.

export type AuditStatus = "executed" | "blocked" | "pending_approval" | "approved" | "rejected" | "failed";

/** The Claude API response that produced a tool call. */
export interface ClaudeTrace {
  model: string; // the model that actually served the request
  requestId: string | null;
  toolUseId: string;
  step: number;
  latencyMs: number;
  stopReason: string | null;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export type PolicyCheck = Decision["checks"][number];

/** Everything that happened to one tool call, end to end, for the trace inspector. */
export interface Trace {
  claude?: ClaudeTrace;
  policy: { guardrails: boolean; ms: number; checks: PolicyCheck[] };
  toolkit: { package: string; version: string | null; tool: string; description: string };
  paypal?: { mock: boolean; ms: number; calls: HttpCall[] };
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  tool: string;
  args: ToolArgs;
  amount: number | null;
  decision: Decision["action"];
  reason: string;
  policyIds: string[];
  status: AuditStatus;
  result?: unknown;
  error?: string;
  source: "agent" | "console";
  trace: Trace;
}

export interface Approval {
  id: string;
  auditId: string;
  createdAt: string;
  tool: string;
  args: ToolArgs;
  amount: number | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  resolvedAt?: string;
}

export const audit: AuditEntry[] = [];
export const approvals: Approval[] = [];
export const policies: Policy[] = [];

// Turning guardrails off lets the demo show what an unprotected agent does.
export const settings = { guardrails: true };

export function newId(): string {
  return randomUUID();
}

export function addPolicy(p: Omit<Policy, "id" | "createdAt" | "enabled"> & { enabled?: boolean }): Policy {
  const policy: Policy = { ...p, id: newId(), enabled: p.enabled ?? true, createdAt: new Date().toISOString() };
  policies.push(policy);
  return policy;
}

const SEED: Parameters<typeof addPolicy>[0][] = [
  {
    name: "Never delete records",
    description: "The agent may never permanently delete invoices or recurring series.",
    tools: ["delete_*"],
    minAmount: null, maxPerHour: null, dailyLimit: null,
    action: "deny",
  },
  {
    name: "Refunds over $100 need approval",
    description: "Any refund of $100 or more must be approved by a human.",
    tools: ["create_refund", "record_refund_for_invoice"],
    minAmount: 100, maxPerHour: null, dailyLimit: null,
    action: "require_approval",
  },
  {
    name: "Daily refund cap $500",
    description: "Block refunds once today's refunds would exceed $500.",
    tools: ["create_refund", "record_refund_for_invoice"],
    minAmount: null, maxPerHour: null, dailyLimit: 500,
    action: "deny",
  },
  {
    name: "Disputes and cancellations need approval",
    description: "Accepting a dispute claim or cancelling a subscription needs a human.",
    tools: ["accept_dispute_claim", "cancel_subscription", "cancel_sent_invoice"],
    minAmount: null, maxPerHour: null, dailyLimit: null,
    action: "require_approval",
  },
  {
    name: "Invoice burst limit",
    description: "No more than 10 invoices created or sent per hour.",
    tools: ["create_invoice", "send_invoice"],
    minAmount: null, maxPerHour: 10, dailyLimit: null,
    action: "deny",
  },
];

function seedPolicies() {
  for (const p of SEED) addPolicy(p);
}
seedPolicies();

/** Clears all activity and restores the seeded policies, for retakes of the demo. */
export function resetStore() {
  audit.length = 0;
  approvals.length = 0;
  policies.length = 0;
  seedPolicies();
  settings.guardrails = true;
}
