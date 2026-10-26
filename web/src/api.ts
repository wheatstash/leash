export type Action = "allow" | "deny" | "require_approval";
export type AuditStatus = "executed" | "blocked" | "pending_approval" | "approved" | "rejected" | "failed";

export interface Status {
  paypalMode: "mock" | "sandbox";
  model: string;
  approverName: string;
  toolCount: number;
  sandboxSeeded: boolean;
}

export interface Settings {
  guardrails: boolean;
}

export interface Email {
  id: string;
  from: string;
  fromName: string;
  subject: string;
  body: string;
  orderNumber: string | null;
  suspicious: boolean;
  status: "unread" | "working" | "handled" | "error";
  reply?: string;
  events?: ChatReply["events"];
  error?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  tool: string;
  args: Record<string, unknown>;
  amount: number | null;
  decision: Action;
  reason: string;
  status: AuditStatus;
  result?: unknown;
  error?: string;
  source: "agent" | "console";
}

export interface Approval {
  id: string;
  auditId: string;
  createdAt: string;
  tool: string;
  args: Record<string, unknown>;
  amount: number | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  resolvedAt?: string;
}

export interface PolicyRule {
  name: string;
  tools: string[];
  minAmount: number | null;
  maxPerHour: number | null;
  dailyLimit: number | null;
  action: Action;
}

export interface Policy extends PolicyRule {
  id: string;
  description: string;
  enabled: boolean;
  createdAt: string;
}

export interface Spend {
  byTool: { tool: string; calls: number; amount: number }[];
  caps: { policyId: string; name: string; limit: number; used: number }[];
}

export interface ChatReply {
  sessionId: string;
  text: string;
  events: { tool: string; status: AuditStatus; message: string; auditId: string }[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  status: () => request<Status>("/status"),
  audit: () => request<AuditEntry[]>("/audit"),
  approvals: () => request<Approval[]>("/approvals"),
  spend: () => request<Spend>("/spend"),
  policies: () => request<Policy[]>("/policies"),
  chat: (message: string, sessionId?: string) =>
    request<ChatReply>("/chat", { method: "POST", body: JSON.stringify({ message, sessionId }) }),
  resolve: (id: string, decision: "approve" | "reject") =>
    request<Approval>(`/approvals/${id}/${decision}`, { method: "POST" }),
  parsePolicy: (text: string) =>
    request<PolicyRule & { description: string }>("/policies/parse", { method: "POST", body: JSON.stringify({ text }) }),
  createPolicy: (rule: PolicyRule & { description: string }) =>
    request<Policy>("/policies", { method: "POST", body: JSON.stringify(rule) }),
  togglePolicy: (id: string, enabled: boolean) =>
    request<Policy>(`/policies/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) }),
  deletePolicy: (id: string) => request<void>(`/policies/${id}`, { method: "DELETE" }),
  settings: () => request<Settings>("/settings"),
  setGuardrails: (guardrails: boolean) =>
    request<Settings>("/settings", { method: "POST", body: JSON.stringify({ guardrails }) }),
  inbox: () => request<Email[]>("/inbox"),
  handleEmail: (id: string) => request<Email>(`/inbox/${id}/handle`, { method: "POST" }),
  resetDemo: () => request<void>("/demo/reset", { method: "POST" }),
};

export const money = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
