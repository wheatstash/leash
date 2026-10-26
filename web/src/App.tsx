import { useCallback, useState } from "react";
import { api } from "./api";
import { usePoll } from "./usePoll";
import { ChatPanel } from "./views/ChatPanel";
import { InboxPanel } from "./views/InboxPanel";
import { ApprovalsView } from "./views/ApprovalsView";
import { AuditView } from "./views/AuditView";
import { PoliciesView } from "./views/PoliciesView";
import { SpendView } from "./views/SpendView";

type Tab = "approvals" | "audit" | "policies" | "spend";
type AgentTab = "inbox" | "chat";

export function App() {
  const [tab, setTab] = useState<Tab>("audit");
  const [agentTab, setAgentTab] = useState<AgentTab>("inbox");
  const status = usePoll(api.status, 30000);
  const settings = usePoll(api.settings, 5000);
  const inbox = usePoll(api.inbox);
  const approvals = usePoll(api.approvals);
  const audit = usePoll(api.audit);
  const policies = usePoll(api.policies, 5000);
  const spend = usePoll(api.spend);

  const refreshAll = useCallback(() => {
    settings.refresh();
    inbox.refresh();
    approvals.refresh();
    audit.refresh();
    policies.refresh();
    spend.refresh();
  }, [settings.refresh, inbox.refresh, approvals.refresh, audit.refresh, policies.refresh, spend.refresh]);

  const guardrails = settings.data?.guardrails ?? true;

  async function toggleGuardrails() {
    await api.setGuardrails(!guardrails);
    refreshAll();
  }

  async function resetDemo() {
    if (!confirm("Clear all activity and reset the inbox and policies?")) return;
    await api.resetDemo();
    refreshAll();
  }

  const pending = approvals.data?.filter((a) => a.status === "pending").length ?? 0;
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "audit", label: "Audit log" },
    { id: "approvals", label: "Approvals", count: pending },
    { id: "policies", label: "Policies" },
    { id: "spend", label: "Spend" },
  ];

  return (
    <div className={`app ${guardrails ? "" : "app-unguarded"}`}>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>◆</span>
          <span>Agent Allowance</span>
        </div>
        <div className="topbar-meta">
          {status.data && (
            <>
              <span className={`pill ${status.data.paypalMode === "mock" ? "pill-warn" : "pill-ok"}`}>
                PayPal {status.data.paypalMode}
                {status.data.paypalMode === "sandbox" && !status.data.sandboxSeeded && " · not seeded"}
              </span>
              <span className="pill">{status.data.model}</span>
            </>
          )}
          {status.error && <span className="pill pill-bad">API offline</span>}
          <button
            className={`switch ${guardrails ? "switch-on" : "switch-off"}`}
            role="switch"
            aria-checked={guardrails}
            onClick={toggleGuardrails}
          >
            <span className="switch-knob" />
            Guardrails {guardrails ? "on" : "off"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={resetDemo}>Reset demo</button>
        </div>
      </header>

      {!guardrails && (
        <div className="banner">Guardrails are off. The agent can move money with no limits or approvals.</div>
      )}

      <main className="layout">
        <section className="card agent">
          <nav className="tabs" role="tablist">
            {(["inbox", "chat"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={agentTab === t}
                className={`tab ${agentTab === t ? "tab-active" : ""}`}
                onClick={() => setAgentTab(t)}
              >
                {t === "inbox" ? "Customer inbox" : "Chat with agent"}
              </button>
            ))}
          </nav>
          {agentTab === "inbox" ? (
            <InboxPanel emails={inbox.data ?? []} onActivity={refreshAll} />
          ) : (
            <ChatPanel onActivity={refreshAll} />
          )}
        </section>

        <section className="card console">
          <nav className="tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={`tab ${tab === t.id ? "tab-active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {!!t.count && <span className="count">{t.count}</span>}
              </button>
            ))}
          </nav>
          <div className="console-body">
            {tab === "approvals" && <ApprovalsView rows={approvals.data ?? []} onChange={refreshAll} />}
            {tab === "audit" && <AuditView rows={audit.data ?? []} />}
            {tab === "policies" && <PoliciesView rows={policies.data ?? []} onChange={refreshAll} />}
            {tab === "spend" && <SpendView spend={spend.data} />}
          </div>
        </section>
      </main>
    </div>
  );
}
