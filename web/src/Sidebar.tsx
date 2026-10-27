import { useState, type ReactNode } from "react";
import { Icon } from "./Icons";
import { Wordmark } from "./Logo";

export type Page = "home" | "inbox" | "chat" | "audit" | "approvals" | "spend" | "policies";

interface Props {
  page: Page;
  onNavigate: (page: Page) => void;
  onCreate: () => void;
  pending: number;
}

const ACTIVITY: { id: Page; label: string }[] = [
  { id: "audit", label: "Audit log" },
  { id: "approvals", label: "Approvals" },
  { id: "spend", label: "Spend & limits" },
];

const AGENT: { id: Page; label: string }[] = [
  { id: "inbox", label: "Customer inbox" },
  { id: "chat", label: "Chat with agent" },
];

export function Sidebar({ page, onNavigate, onCreate, pending }: Props) {
  const [activityOpen, setActivityOpen] = useState(true);
  const [agentOpen, setAgentOpen] = useState(true);

  const item = (id: Page, label: string, extra?: ReactNode) => (
    <button key={id} className={`nav-sub ${page === id ? "nav-active" : ""}`} onClick={() => onNavigate(id)}>
      <span>{label}</span>
      {extra}
    </button>
  );

  return (
    <aside className="sidebar">
      <Wordmark />

      <button className="btn-create" onClick={onCreate}>
        <Icon.Plus size={16} /> New policy
      </button>

      <nav className="nav">
        <button className={`nav-top ${page === "home" ? "nav-active" : ""}`} onClick={() => onNavigate("home")}>
          <Icon.Home /> Home
        </button>

        <div className="nav-group">
          <button className="nav-top" onClick={() => setActivityOpen((o) => !o)} aria-expanded={activityOpen}>
            <Icon.Activity /> Activity
            <span className={`nav-chevron ${activityOpen ? "open" : ""}`}><Icon.ChevronDown size={18} /></span>
          </button>
          {activityOpen &&
            ACTIVITY.map((a) =>
              item(a.id, a.label, a.id === "approvals" && pending > 0 ? <span className="nav-count">{pending}</span> : undefined),
            )}
        </div>

        <div className="nav-group">
          <button className="nav-top" onClick={() => setAgentOpen((o) => !o)} aria-expanded={agentOpen}>
            <Icon.Inbox /> Agent
            <span className={`nav-chevron ${agentOpen ? "open" : ""}`}><Icon.ChevronDown size={18} /></span>
          </button>
          {agentOpen && AGENT.map((a) => item(a.id, a.label))}
        </div>

        <button className={`nav-top ${page === "policies" ? "nav-active" : ""}`} onClick={() => onNavigate("policies")}>
          <Icon.Shield /> Policies
          <span className="nav-chevron"><Icon.ChevronRight size={18} /></span>
        </button>
      </nav>
    </aside>
  );
}
