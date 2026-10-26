import { useCallback, useState } from "react";
import { api } from "./api";
import { Icon } from "./Icons";
import { Sidebar, type Page } from "./Sidebar";
import { usePoll } from "./usePoll";
import { ApprovalsView } from "./views/ApprovalsView";
import { AuditView } from "./views/AuditView";
import { ChatPanel } from "./views/ChatPanel";
import { Home } from "./views/Home";
import { InboxPanel } from "./views/InboxPanel";
import { PoliciesView } from "./views/PoliciesView";
import { SpendView } from "./views/SpendView";

const TITLES: Record<Page, string> = {
  home: "Maria's Clay & Linen",
  inbox: "Customer inbox",
  chat: "Chat with agent",
  audit: "Audit log",
  approvals: "Approvals",
  spend: "Spend & limits",
  policies: "Policies",
};

export function App() {
  const [page, setPage] = useState<Page>("home");
  const status = usePoll(api.status, 30000);
  const settings = usePoll(api.settings, 5000);
  const inbox = usePoll(api.inbox);
  const approvals = usePoll(api.approvals);
  const audit = usePoll(api.audit);
  const policies = usePoll(api.policies, 5000);
  const spend = usePoll(api.spend);

  const refreshAll = useCallback(() => {
    status.refresh();
    settings.refresh();
    inbox.refresh();
    approvals.refresh();
    audit.refresh();
    policies.refresh();
    spend.refresh();
  }, [status.refresh, settings.refresh, inbox.refresh, approvals.refresh, audit.refresh, policies.refresh, spend.refresh]);

  const guardrails = settings.data?.guardrails ?? true;
  const pending = approvals.data?.filter((a) => a.status === "pending").length ?? 0;

  async function toggleGuardrails() {
    await api.setGuardrails(!guardrails);
    refreshAll();
  }

  async function resetDemo() {
    if (!confirm("Clear all activity and reset the inbox and policies?")) return;
    await api.resetDemo();
    refreshAll();
  }

  function createPolicy() {
    setPage("policies");
    requestAnimationFrame(() => document.getElementById("policy-text")?.focus());
  }

  return (
    <div className={`shell ${guardrails ? "" : "shell-unguarded"}`}>
      <Sidebar page={page} onNavigate={setPage} onCreate={createPolicy} pending={pending} />

      <div className="main">
        <header className="header">
          <h1 className="header-title">{TITLES[page]}</h1>
          <div className="header-actions">
            {status.data && (
              <span className={`pill ${status.data.paypalMode === "mock" ? "pill-warn" : "pill-ok"}`}>
                PayPal {status.data.paypalMode}
                {status.data.paypalMode === "sandbox" && !status.data.sandboxSeeded && " · not seeded"}
              </span>
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
            <button className="bell" onClick={() => setPage("approvals")} aria-label={`${pending} approvals waiting`}>
              <Icon.Bell size={22} />
              <span className="bell-count">{pending}</span>
            </button>
            <span className="divider" aria-hidden />
            <span className="avatar" title="Maria (shop owner)">MC</span>
          </div>
        </header>

        {!guardrails && (
          <div className="banner">Guardrails are off. The agent can move money with no limits or approvals.</div>
        )}

        <main className="content">
          {page === "home" && (
            <Home
              status={status.data}
              guardrails={guardrails}
              approvals={approvals.data ?? []}
              audit={audit.data ?? []}
              spend={spend.data}
              inbox={inbox.data ?? []}
              onNavigate={setPage}
              onToggleGuardrails={toggleGuardrails}
              onReset={resetDemo}
              onChange={refreshAll}
            />
          )}

          {page === "inbox" && (
            <div className="split">
              <section className="panel">
                <InboxPanel emails={inbox.data ?? []} onActivity={refreshAll} />
              </section>
              <section className="panel panel-pad">
                <h3 className="section-title">Live activity</h3>
                <AuditView rows={audit.data ?? []} />
              </section>
            </div>
          )}

          {page === "chat" && (
            <div className="split">
              <section className="panel">
                <ChatPanel onActivity={refreshAll} />
              </section>
              <section className="panel panel-pad">
                <h3 className="section-title">Live activity</h3>
                <AuditView rows={audit.data ?? []} />
              </section>
            </div>
          )}

          {page === "audit" && <section className="panel panel-pad panel-tall"><AuditView rows={audit.data ?? []} /></section>}
          {page === "approvals" && <section className="panel panel-pad panel-tall"><ApprovalsView rows={approvals.data ?? []} onChange={refreshAll} /></section>}
          {page === "spend" && <section className="panel panel-pad panel-tall"><SpendView spend={spend.data} /></section>}
          {page === "policies" && <section className="panel panel-pad panel-tall"><PoliciesView rows={policies.data ?? []} onChange={refreshAll} /></section>}
        </main>
      </div>
    </div>
  );
}
