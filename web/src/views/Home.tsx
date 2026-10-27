import { useState, type ReactNode } from "react";
import { money, time, type Approval, type AuditEntry, type AuditStatus, type Email, type Spend, type Status } from "../api";
import { Bot2D, type BotEvent, type Reaction } from "../Bot2D";
import { Icon } from "../Icons";
import type { Page } from "../Sidebar";
import { StatusBadge } from "../StatusBadge";
import { PolicyComposer } from "./PolicyComposer";

interface Props {
  status: Status | null;
  guardrails: boolean;
  approvals: Approval[];
  audit: AuditEntry[];
  spend: Spend | null;
  inbox: Email[];
  onNavigate: (page: Page) => void;
  onToggleGuardrails: () => void;
  onReset: () => void;
  onChange: () => void;
}

const MOVED: AuditEntry["status"][] = ["executed", "approved"];

const REACTIONS: Record<AuditStatus, Reaction> = {
  executed: "yes",
  approved: "yes",
  blocked: "no",
  failed: "no",
  rejected: "no",
  pending_approval: "hold",
};

const CAPTIONS: Record<AuditStatus, string> = {
  executed: "Done",
  approved: "Approved and sent",
  blocked: "Blocked by policy",
  failed: "PayPal said no",
  rejected: "You rejected that one",
  pending_approval: "Waiting on your sign-off",
};

export function humanize(tool: string): string {
  const s = tool.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export function Home(props: Props) {
  const { status, guardrails, approvals, audit, spend, inbox, onNavigate } = props;
  const [bannerOpen, setBannerOpen] = useState(true);

  const cap = spend?.caps[0];
  const allowance = cap ? Math.max(0, cap.limit - cap.used) : null;
  const pending = approvals.filter((a) => a.status === "pending");
  const today = audit.filter((e) => isToday(e.timestamp));
  const moved = today.filter((e) => MOVED.includes(e.status)).reduce((s, e) => s + (e.amount ?? 0), 0);
  const blocked = today.filter((e) => e.status === "blocked");
  const stopped = blocked.reduce((s, e) => s + (e.amount ?? 0), 0);
  const unread = inbox.filter((e) => e.status === "unread").length;
  const latest = audit[0];
  const botEvent: BotEvent | undefined = latest && { id: latest.id, reaction: REACTIONS[latest.status] };
  const caption = latest ? `${CAPTIONS[latest.status]}: ${humanize(latest.tool).toLowerCase()}` : "Hi! I check every PayPal call.";

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-text">
          <p className="hero-amount">
            {allowance === null ? "—" : money(allowance)}
            <span className="hero-currency">USD</span>
          </p>
          <p className="muted hero-label">
            {cap ? `Refund allowance left today · ${money(cap.limit)} daily cap` : "No daily cap set"}
          </p>
          <button className="btn-pill" onClick={() => onNavigate("policies")}>
            Manage limits <Icon.ChevronDown size={16} />
          </button>
        </div>
        <Bot2D event={botEvent} caption={caption} />
      </section>

      <section className="task-cards">
        <TaskCard
          icon={<Icon.Lock />}
          title={pending.length ? `Review ${pending.length} held payment${pending.length > 1 ? "s" : ""}` : "No payments waiting on you"}
          body={pending.length ? "The agent asked for your sign-off before moving this money." : "Calls that need your approval will show up here."}
          onClick={() => onNavigate("approvals")}
        />
        <TaskCard
          icon={<Icon.Shield />}
          title={guardrails ? "Guardrails are on" : "Guardrails are off"}
          body={guardrails ? "Every PayPal call is checked against your policies." : "The agent can move money with no limits. Turn them back on."}
          onClick={props.onToggleGuardrails}
          tone={guardrails ? undefined : "bad"}
        />
        <TaskCard
          icon={<Icon.Bank />}
          title={status?.paypalMode === "mock" ? "Connect a PayPal sandbox" : status?.sandboxSeeded ? "Sandbox orders are ready" : "Seed sandbox orders"}
          body={
            status?.paypalMode === "mock"
              ? "Running in mock mode. Add sandbox keys to server/.env."
              : status?.sandboxSeeded
                ? "Refunds hit real PayPal sandbox payments."
                : "Run npm run seed so refunds have real payments to act on."
          }
        />
      </section>

      <section>
        <h3 className="section-title">Quick access</h3>
        <div className="quick">
          <Quick icon={<Icon.Inbox size={22} />} label="Customer inbox" badge={unread} onClick={() => onNavigate("inbox")} />
          <Quick icon={<Icon.Chat size={22} />} label="Chat with agent" onClick={() => onNavigate("chat")} />
          <Quick icon={<Icon.Approve size={22} />} label="Approvals" badge={pending.length} onClick={() => onNavigate("approvals")} />
          <Quick icon={<Icon.Activity size={22} />} label="Audit log" onClick={() => onNavigate("audit")} />
          <Quick icon={<Icon.Chart size={22} />} label="Spend & limits" onClick={() => onNavigate("spend")} />
          <Quick icon={<Icon.Shield size={22} />} label="Policies" onClick={() => onNavigate("policies")} />
          <Quick icon={<Icon.Reset size={22} />} label="Reset demo" onClick={props.onReset} />
        </div>
      </section>

      <section>
        <div className="section-head">
          <div>
            <h3 className="section-title">Agent performance</h3>
            <p className="muted">Today</p>
          </div>
          <button className="link" onClick={() => onNavigate("spend")}>View more</button>
        </div>
        <div className="kpis">
          <Kpi label="Tool calls" value={String(today.length)} note={`${today.filter((e) => e.source === "agent").length} by the agent`} />
          <Kpi label="Money moved" value={money(moved)} note={plural(today.filter((e) => MOVED.includes(e.status)).length, "call") + " executed"} />
          <Kpi label="Held for approval" value={String(pending.length)} note={pending.length ? money(pending.reduce((s, a) => s + (a.amount ?? 0), 0)) : "–"} />
          <Kpi label="Blocked by policy" value={String(blocked.length)} note={stopped ? `${money(stopped)} stopped` : "–"} tone={blocked.length ? "bad" : undefined} />
        </div>
      </section>

      {bannerOpen && (
        <section className="promo">
          <span className="promo-icon"><Icon.Sparkle size={22} /></span>
          <div className="promo-text">
            <p className="promo-title">Try a prompt-injection attack</p>
            <p>One customer email hides instructions telling the agent to refund $2,000 and delete invoices. See what gets through.</p>
          </div>
          <button className="btn-pill" onClick={() => onNavigate("inbox")}>Open inbox</button>
          <button className="icon-btn" onClick={() => setBannerOpen(false)} aria-label="Dismiss">✕</button>
        </section>
      )}

      <section>
        <div className="section-head">
          <h3 className="section-title">Recent activity</h3>
          <button className="link" onClick={() => onNavigate("audit")}>View activity</button>
        </div>
        {audit.length === 0 ? (
          <div className="empty-state">
            <Icon.Empty size={28} />
            <p>No activity yet.</p>
            <p>
              <button className="link" onClick={() => onNavigate("inbox")}>Let the agent handle the inbox</button> or{" "}
              <button className="link" onClick={() => onNavigate("chat")}>chat with it</button>
            </p>
          </div>
        ) : (
          <ul className="activity">
            {audit.slice(0, 6).map((e) => (
              <li key={e.id} className="activity-row">
                <span className={`activity-dot dot-${e.status}`} />
                <div className="activity-main">
                  <p className="activity-title">{humanize(e.tool)}</p>
                  <p className="muted">{time(e.timestamp)} · {e.reason}</p>
                </div>
                <span className="mono activity-amount">{money(e.amount)}</span>
                <StatusBadge value={e.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="section-title">Quick actions</h3>
        <div className="action-card">
          <h4>Create a policy</h4>
          <PolicyComposer onSaved={props.onChange} inputId="home-policy-text" />
        </div>
      </section>

      <footer className="footer">
        <span>Built for the PayPal AI Hackathon 2026</span>
        <span className="muted">
          {status ? `${status.toolCount} PayPal tools · ${status.model}` : ""}
        </span>
      </footer>
    </div>
  );
}

function TaskCard({ icon, title, body, onClick, tone }: { icon: ReactNode; title: string; body: string; onClick?: () => void; tone?: "bad" }) {
  return (
    <div className={`task-card ${tone ? `task-${tone}` : ""}`}>
      <span className="task-icon">{icon}</span>
      {onClick ? (
        <button className="link task-title" onClick={onClick}>{title}</button>
      ) : (
        <p className="task-title task-title-plain">{title}</p>
      )}
      <p className="task-body">{body}</p>
    </div>
  );
}

function Quick({ icon, label, badge, onClick }: { icon: ReactNode; label: string; badge?: number; onClick: () => void }) {
  return (
    <button className="quick-item" onClick={onClick}>
      <span className="quick-icon">
        {icon}
        {!!badge && <span className="quick-badge">{badge}</span>}
      </span>
      <span className="quick-label">{label}</span>
    </button>
  );
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "bad" }) {
  return (
    <div className="kpi">
      <p className="kpi-label">{label}</p>
      <p className={`kpi-value ${tone === "bad" ? "kpi-bad" : ""}`}>{value}</p>
      <span className="kpi-note">{note}</span>
    </div>
  );
}
