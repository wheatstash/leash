const LABELS: Record<string, string> = {
  executed: "Executed",
  blocked: "Blocked",
  pending_approval: "Awaiting approval",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Failed",
  allow: "Allow",
  deny: "Block",
  require_approval: "Needs approval",
};

const TONE: Record<string, string> = {
  executed: "ok",
  approved: "ok",
  allow: "ok",
  blocked: "bad",
  rejected: "bad",
  failed: "bad",
  deny: "bad",
  pending_approval: "warn",
  pending: "warn",
  require_approval: "warn",
};

export function StatusBadge({ value }: { value: string }) {
  return <span className={`badge badge-${TONE[value] ?? "neutral"}`}>{LABELS[value] ?? value}</span>;
}
