import { useEffect, useState, type ReactNode } from "react";
import { money, time, type AuditEntry, type HttpCall } from "../api";
import { StatusBadge } from "../StatusBadge";
import { xray } from "../xray";

type StepState = "done" | "stopped" | "waiting" | "skipped" | "failed";

const STOP_LABEL: Partial<Record<AuditEntry["status"], string>> = {
  blocked: "Never sent: blocked by policy",
  pending_approval: "Waiting for a human to approve",
  rejected: "Never sent: rejected by the approver",
};

/** Side panel showing one tool call end to end: Claude → Leash → PayPal Agent Toolkit → PayPal REST. */
export function TraceDrawer({ entry, onClose }: { entry: AuditEntry | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!entry) return null;
  const t = entry.trace;
  const stop = STOP_LABEL[entry.status];
  const reached = !stop;
  // Where the call stopped is red (or amber while held); steps it never reached are gray.
  const policyState: StepState = entry.status === "pending_approval" ? "waiting" : stop ? "stopped" : "done";
  const paypalState: StepState = !reached
    ? entry.status === "pending_approval"
      ? "waiting"
      : "skipped"
    : entry.status === "failed"
      ? "failed"
      : "done";

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Call trace" {...xray("leash", "Captured server-side: the Anthropic response + a hook on the toolkit's HTTP client")}>
        <header className="drawer-head">
          <div>
            <p className="eyebrow">Call trace</p>
            <h2 className="drawer-title mono">{entry.tool}</h2>
            <p className="muted drawer-sub">
              {time(entry.timestamp)} · {entry.source === "agent" ? "requested by the agent" : "called from the console"}
              {entry.amount !== null && <> · {money(entry.amount)}</>}
            </p>
          </div>
          <div className="drawer-head-right">
            <StatusBadge value={entry.status} />
            <button className="icon-btn" onClick={onClose} aria-label="Close trace">✕</button>
          </div>
        </header>

        <ol className="pipeline" aria-label="Path of this call">
          {["Claude", "Leash policy", "Agent Toolkit", "PayPal API"].map((label, i) => {
            const state = i === 0 ? (t?.claude ? "done" : "skipped") : i === 1 ? policyState : paypalState;
            return (
              <li key={label} className={`pipe pipe-${state}`}>
                {label}
              </li>
            );
          })}
        </ol>

        {!t ? (
          <p className="muted">This call was recorded before tracing was enabled.</p>
        ) : (
          <div className="trace-steps">
            <Step n={1} title="Claude chooses a tool" tech="Anthropic Messages API · tool use" state={t.claude ? "done" : "skipped"}>
              {t.claude ? (
                <>
                  <Chips>
                    <Chip strong>{t.claude.model}</Chip>
                    <Chip>{(t.claude.latencyMs / 1000).toFixed(2)} s</Chip>
                    <Chip>
                      {(t.claude.usage.input + t.claude.usage.cacheRead + t.claude.usage.cacheWrite).toLocaleString()} in /{" "}
                      {t.claude.usage.output.toLocaleString()} out tokens
                    </Chip>
                    {t.claude.usage.cacheRead > 0 && <Chip>{t.claude.usage.cacheRead.toLocaleString()} read from prompt cache</Chip>}
                    {t.claude.usage.cacheWrite > 0 && <Chip>{t.claude.usage.cacheWrite.toLocaleString()} written to prompt cache</Chip>}
                    <Chip>loop step {t.claude.step}</Chip>
                  </Chips>
                  <dl className="kv">
                    <dt>request id</dt>
                    <dd><Copyable text={t.claude.requestId ?? "—"} /></dd>
                    <dt>tool_use id</dt>
                    <dd><Copyable text={t.claude.toolUseId} /></dd>
                    <dt>stop_reason</dt>
                    <dd className="mono">{t.claude.stopReason}</dd>
                  </dl>
                  <Json label="tool_use.input" value={entry.args} />
                </>
              ) : (
                <>
                  <p className="muted">Called directly from the console, no model involved.</p>
                  <Json label="arguments" value={entry.args} />
                </>
              )}
            </Step>

            <Step n={2} title="Leash checks every rule" tech="Leash policy engine" state={policyState}>
              <Chips>
                <StatusBadge value={entry.decision} />
                <Chip>{t.policy.ms} ms</Chip>
                <Chip>{t.policy.checks.length} rules checked</Chip>
              </Chips>
              <p className="trace-reason">{entry.reason}</p>
              {!t.policy.guardrails ? (
                <p className="trace-warn">Guardrails were off, so no rule was checked.</p>
              ) : (
                <table className="rules">
                  <tbody>
                    {t.policy.checks.map((c) => (
                      <tr key={c.policyId} className={c.triggered ? "rule-hit" : ""} title={c.applies ? "" : "This rule doesn't cover this tool"}>
                        <td>{c.name}</td>
                        <td className="rule-result">
                          {!c.enabled ? (
                            <span className="muted">off</span>
                          ) : !c.applies ? (
                            <span className="muted">n/a</span>
                          ) : c.triggered ? (
                            <span title={c.why ?? ""}>
                              <StatusBadge value={c.action} /> <span className="muted">{c.why}</span>
                            </span>
                          ) : (
                            <span className="ok-text">passed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Step>

            <Step n={3} title="PayPal Agent Toolkit runs the tool" tech={`${t.toolkit.package}@${t.toolkit.version ?? "?"}`} state={paypalState}>
              {stop ? (
                <p className={`trace-stop trace-${entry.status === "pending_approval" ? "waiting" : "stopped"}`}>{stop}</p>
              ) : (
                <>
                  <Chips>
                    <Chip strong>{t.toolkit.tool}</Chip>
                    {t.paypal && <Chip>{t.paypal.ms} ms total</Chip>}
                  </Chips>
                  {t.toolkit.description && <p className="muted trace-desc">{t.toolkit.description}</p>}
                </>
              )}
            </Step>

            <Step n={4} title="PayPal REST API" tech={t.paypal?.calls[0] ? new URL(t.paypal.calls[0].url).host : "PayPal sandbox"} state={paypalState} last>
              {stop ? (
                <p className="muted">No request sent to PayPal.</p>
              ) : t.paypal?.mock ? (
                <p className="muted">Mock mode: no PayPal request was sent. Add sandbox keys to <code>server/.env</code> to see real calls.</p>
              ) : (
                <>
                  <ul className="http-calls">
                    {t.paypal?.calls.map((c, i) => <HttpRow key={i} call={c} />)}
                  </ul>
                  {entry.error && <p className="trace-warn">PayPal error: {entry.error}</p>}
                  {entry.result !== undefined && <Json label="Result returned to Claude" value={entry.result} />}
                </>
              )}
            </Step>
          </div>
        )}

        <footer className="drawer-foot">
          <button className="btn-pill" onClick={() => navigator.clipboard?.writeText(JSON.stringify(entry, null, 2))}>
            Copy trace as JSON
          </button>
        </footer>
      </aside>
    </>
  );
}

function Step({ n, title, tech, state, last, children }: { n: number; title: string; tech: string; state: StepState; last?: boolean; children: ReactNode }) {
  return (
    <section className={`step step-${state} ${last ? "step-last" : ""}`}>
      <span className="step-n" aria-hidden>{n}</span>
      <div className="step-body">
        <h3 className="step-title">{title}</h3>
        <p className="step-tech mono">{tech}</p>
        {children}
      </div>
    </section>
  );
}

function HttpRow({ call }: { call: HttpCall }) {
  const u = new URL(call.url);
  const ok = call.status >= 200 && call.status < 300;
  return (
    <li className="http">
      <details>
        <summary>
          <span className="http-method">{call.method}</span>
          <span className="mono http-path" title={call.url}>{u.pathname}{u.search}</span>
          <span className={`http-status ${ok ? "ok" : "bad"}`}>{call.status || "ERR"}</span>
          <span className="muted mono">{call.ms} ms</span>
        </summary>
        <dl className="kv">
          <dt>PayPal-Debug-Id</dt>
          <dd><Copyable text={call.debugId ?? "—"} /></dd>
          <dt>url</dt>
          <dd className="mono wrap">{call.url}</dd>
        </dl>
        {call.requestBody !== undefined && <Json label="request body" value={call.requestBody} />}
        {call.responseBody !== undefined && <Json label="response body" value={call.responseBody} />}
        {call.error && <p className="trace-warn">{call.error}</p>}
      </details>
    </li>
  );
}

const Chips = ({ children }: { children: ReactNode }) => <div className="chips">{children}</div>;
const Chip = ({ children, strong }: { children: ReactNode; strong?: boolean }) => (
  <span className={`chip ${strong ? "chip-strong" : ""}`}>{children}</span>
);

function Copyable({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="copyable mono"
      title="Copy"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {text}
      <span className="copy-hint">{copied ? "copied" : "copy"}</span>
    </button>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  const parsed = typeof value === "string" ? tryParse(value) : value;
  const text = typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
  return (
    <div className="json">
      <p className="json-label mono">{label}</p>
      <pre dangerouslySetInnerHTML={{ __html: highlight(text) }} />
    </div>
  );
}

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function highlight(json: string) {
  const esc = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi, (m, str, colon, lit) => {
    if (str) return colon ? `<span class="j-key">${str}</span>${colon}` : `<span class="j-str">${str}</span>`;
    if (lit) return `<span class="j-lit">${m}</span>`;
    return `<span class="j-num">${m}</span>`;
  });
}
