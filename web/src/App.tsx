import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { Icon } from "./Icons";
import { Sidebar, type Page } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { Tour, type TourContext } from "./Tour";
import { TraceContext } from "./traceContext";
import { usePoll } from "./usePoll";
import { TECH_NAMES, xray, type Tech } from "./xray";
import { ApprovalsView } from "./views/ApprovalsView";
import { AuditView } from "./views/AuditView";
import { ChatPanel } from "./views/ChatPanel";
import { Home } from "./views/Home";
import { InboxPanel } from "./views/InboxPanel";
import { PoliciesView } from "./views/PoliciesView";
import { SpendView } from "./views/SpendView";
import { TraceDrawer } from "./views/TraceDrawer";

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
  const [traceId, setTraceId] = useState<string | null>(null);
  const closeTrace = useCallback(() => setTraceId(null), []);
  const [xrayOn, setXrayOn] = useState(() => {
    // ?xray=1 opens the console with X-ray on, e.g. in a link for judges.
    if (new URLSearchParams(window.location.search).has("xray")) return true;
    try {
      return localStorage.getItem("leash-xray") === "1";
    } catch {
      return false;
    }
  });

  // The guide opens on a first visit, with ?tour=1, or from the header.
  const [tourOpen, setTourOpen] = useState(() => {
    if (new URLSearchParams(window.location.search).has("tour")) return true;
    try {
      return localStorage.getItem("leash-tour-seen") !== "1";
    } catch {
      return false;
    }
  });
  const closeTour = useCallback(() => {
    setTourOpen(false);
    try {
      localStorage.setItem("leash-tour-seen", "1");
    } catch {
      // storage unavailable; the guide may show again next visit
    }
  }, []);
  const tourCtx: TourContext = {
    navigate: setPage,
    setXray: setXrayOn,
    openLatestTrace: () => {
      const latest = audit.data?.[0];
      if (latest) setTraceId(latest.id);
      return !!latest;
    },
    closeTrace,
  };

  // X toggles X-ray anywhere except while typing.
  useEffect(() => {
    try {
      localStorage.setItem("leash-xray", xrayOn ? "1" : "0");
    } catch {
      // storage unavailable; the toggle still works for this visit
    }
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key.toLowerCase() !== "x" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el.closest("input, textarea, select, [contenteditable]")) return;
      setXrayOn((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [xrayOn]);
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
    <TraceContext.Provider value={setTraceId}>
      <div className={`shell ${guardrails ? "" : "shell-unguarded"} ${xrayOn ? "xray" : ""}`}>
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
              <button className="xray-toggle" onClick={() => setTourOpen(true)} title="Walk through the demo on screen">
                <Icon.Sparkle size={16} /> Guide
              </button>
              <button
                className={`xray-toggle ${xrayOn ? "xray-toggle-on" : ""}`}
                aria-pressed={xrayOn}
                onClick={() => setXrayOn((v) => !v)}
                title="Show the tech behind each part of the console (X)"
              >
                <Icon.Scan size={16} /> X-ray
              </button>
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

          {xrayOn && (
            <div className="xray-legend" role="note">
              <span className="xray-legend-title">X-ray</span>
              {(Object.keys(TECH_NAMES) as Tech[]).map((t) => (
                <span key={t} className="xray-key" data-xray-tech={t}>
                  {TECH_NAMES[t]}
                </span>
              ))}
              <span className="muted">Click any audit row for the full call trace. Press X to hide.</span>
            </div>
          )}

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
                <section className="panel" {...xray("claude", "Claude agent loop · tool use over 47 PayPal Agent Toolkit tools, every call through Leash")}>
                  <InboxPanel emails={inbox.data ?? []} onActivity={refreshAll} />
                </section>
                <section className="panel panel-pad" data-tour="live-activity">
                  <h3 className="section-title">Live activity</h3>
                  <AuditView rows={audit.data ?? []} />
                </section>
              </div>
            )}

            {page === "chat" && (
              <div className="split">
                <section className="panel" {...xray("claude", "Claude agent loop · tool use over 47 PayPal Agent Toolkit tools, every call through Leash")}>
                  <ChatPanel onActivity={refreshAll} />
                </section>
                <section className="panel panel-pad" data-tour="live-activity">
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
          <StatusBar />
        </div>
        <TraceDrawer entry={audit.data?.find((e) => e.id === traceId) ?? null} onClose={closeTrace} />
        <Tour open={tourOpen} onClose={closeTour} ctx={tourCtx} />
      </div>
    </TraceContext.Provider>
  );
}
