import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Decision, Policy } from "./policy/types.js";
import type { ToolArgs } from "./paypal.js";
import type { HttpCall } from "./trace.js";
import { seedEmails, type Email } from "./demo/inbox.js";

// In-memory store, one workspace per signed-in visitor so judges trying the hosted demo at the same
// time don't see (or reset) each other's activity. Swap for SQLite/Postgres to persist.

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

export interface Workspace {
  id: string;
  audit: AuditEntry[];
  approvals: Approval[];
  policies: Policy[];
  // Turning guardrails off lets the demo show what an unprotected agent does.
  settings: { guardrails: boolean };
  inbox: Email[];
  /** Chat transcripts by chat session id (Anthropic message params, owned by agent.ts). */
  chats: Map<string, unknown[]>;
  /** Timestamps of Claude-backed agent runs, for the hourly budget. */
  agentRuns: number[];
  lastSeen: number;
}

const MAX_WORKSPACES = 300;
const IDLE_MS = 12 * 60 * 60 * 1000; // matches the session lifetime
const workspaces = new Map<string, Workspace>();
const current = new AsyncLocalStorage<Workspace>();

export function newId(): string {
  return randomUUID();
}

function createWorkspace(id: string): Workspace {
  const w: Workspace = {
    id,
    audit: [],
    approvals: [],
    policies: [],
    settings: { guardrails: true },
    inbox: seedEmails(),
    chats: new Map(),
    agentRuns: [],
    lastSeen: Date.now(),
  };
  for (const p of SEED) w.policies.push(makePolicy(p));
  return w;
}

/** The workspace for a session, created on first use. Idle and least-recently-used ones are dropped. */
function workspaceFor(id: string): Workspace {
  let w = workspaces.get(id);
  if (!w) {
    const now = Date.now();
    for (const [key, ws] of workspaces) if (now - ws.lastSeen > IDLE_MS) workspaces.delete(key);
    if (workspaces.size >= MAX_WORKSPACES) {
      const oldest = [...workspaces.values()].sort((a, b) => a.lastSeen - b.lastSeen)[0];
      workspaces.delete(oldest.id);
    }
    w = createWorkspace(id);
    workspaces.set(id, w);
  }
  w.lastSeen = Date.now();
  return w;
}

/** Runs `fn` (and everything it awaits) against the given session's workspace. */
export function inWorkspace<T>(sessionId: string, fn: () => T): T {
  return current.run(workspaceFor(sessionId), fn);
}

/** The current visitor's workspace. Only valid inside a request (or `inWorkspace`). */
export function ws(): Workspace {
  const w = current.getStore();
  if (!w) throw new Error("No demo workspace for this request");
  return w;
}

export function activeWorkspaces(): number {
  return workspaces.size;
}

function makePolicy(p: Omit<Policy, "id" | "createdAt" | "enabled"> & { enabled?: boolean }): Policy {
  return { ...p, id: newId(), enabled: p.enabled ?? true, createdAt: new Date().toISOString() };
}

export function addPolicy(p: Omit<Policy, "id" | "createdAt" | "enabled"> & { enabled?: boolean }): Policy {
  const policy = makePolicy(p);
  ws().policies.push(policy);
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

/**
 * Clears this visitor's activity and restores the seeded policies and inbox, for retakes of the
 * demo. The agent budget is kept, so resetting can't be used to get more Claude runs.
 */
export function resetWorkspace() {
  const w = ws();
  const fresh = createWorkspace(w.id);
  Object.assign(w, { ...fresh, agentRuns: w.agentRuns });
}
