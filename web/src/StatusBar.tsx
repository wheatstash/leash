import { useEffect, useState, type ReactNode } from "react";
import { api, type Stack } from "./api";
import { usePoll } from "./usePoll";
import { xray } from "./xray";

function remaining(iso: string | null, now: number) {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((Date.parse(iso) - now) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

const short = (model: string) => model.replace(/^claude-/, "");

/** Live facts about every piece of the stack: real connections, versions, and the deployed build. */
export function StatusBar() {
  const { data: s } = usePoll<Stack>(api.stack, 5000);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!s) return <footer className="statusbar" />;

  const tokenLeft = remaining(s.paypal.tokenExpiresAt, now);
  const sandbox = s.paypal.mode === "sandbox";
  const commit = s.host.commit?.slice(0, 7);
  const servedBy = s.claude.lastModel && s.claude.lastModel !== s.claude.model ? ` (served by ${short(s.claude.lastModel)})` : "";

  return (
    <footer className="statusbar" aria-label="Stack status" {...xray("render", "Live /api/stack · real connections, versions and the deployed commit")}>
      <Seg
        dot={sandbox ? "ok" : "warn"}
        label="PayPal"
        title={
          sandbox
            ? `PayPal sandbox REST API${s.paypal.apiBase ? ` at ${s.paypal.apiBase}` : ""}. OAuth client-credentials token${
                s.paypal.tokenExpiresAt ? ` expires ${new Date(s.paypal.tokenExpiresAt).toLocaleTimeString()}` : " is fetched on the first call"
              }. ${s.paypal.calls} API calls this session.`
            : "Mock mode: tools return fake results. Add sandbox keys to server/.env."
        }
      >
        {sandbox ? "sandbox" : "mock mode"}
        {sandbox && (tokenLeft ? ` · token ${tokenLeft} left` : " · token on first call")}
        {s.paypal.lastMs !== null && ` · last ${s.paypal.lastStatus} in ${s.paypal.lastMs} ms`}
      </Seg>

      <Seg label="Agent Toolkit" title={`@paypal/agent-toolkit ${s.toolkit.version}: ${s.toolkit.tools} PayPal tools exposed to Claude, every one routed through Leash.`}>
        v{s.toolkit.version} · {s.toolkit.tools} tools
      </Seg>

      <Seg
        dot={s.claude.calls ? "ok" : "idle"}
        label="Claude"
        title={`Anthropic Messages API via @anthropic-ai/sdk ${s.claude.sdkVersion}, ${s.claude.model} at ${s.claude.effort} effort with adaptive thinking. ${s.claude.calls} calls, ${s.claude.tokens.input.toLocaleString()} input / ${s.claude.tokens.output.toLocaleString()} output tokens (${s.claude.tokens.cacheRead.toLocaleString()} from cache).`}
      >
        {short(s.claude.model)}
        {servedBy}
        {s.claude.lastMs !== null ? ` · last ${(s.claude.lastMs / 1000).toFixed(1)} s` : " · idle"}
      </Seg>

      <Seg label="AG Grid" title={`AG Grid Community ${s.ui.agGrid} renders the audit log, approvals, policies and spend tables, live-updated every 2 seconds.`}>
        Community v{s.ui.agGrid}
      </Seg>

      <Seg
        dot={s.host.onRender ? "ok" : "idle"}
        label={s.host.onRender ? "Render" : "Host"}
        title={
          s.host.onRender
            ? `Render web service ${s.host.service ?? ""}${s.host.instance ? ` (instance ${s.host.instance})` : ""}, built from ${s.host.branch ?? "main"} @ ${s.host.commit}. Node ${s.host.node}, Express ${s.host.express}.`
            : `Running locally on Node ${s.host.node}, Express ${s.host.express}. Commit ${s.host.commit ?? "unknown"}.`
        }
      >
        {s.host.onRender ? s.host.service ?? "web service" : "local dev"}
        {commit && (
          <>
            {" · "}
            <a href={`${s.host.repo}/commit/${s.host.commit}`} target="_blank" rel="noreferrer" className="mono">
              {commit}
            </a>
          </>
        )}
      </Seg>
    </footer>
  );
}

function Seg({ label, dot, title, children }: { label: string; dot?: "ok" | "warn" | "idle"; title: string; children: ReactNode }) {
  return (
    <span className="seg" title={title}>
      {dot && <span className={`seg-dot dot-${dot}`} aria-hidden />}
      <span className="seg-label">{label}</span>
      <span className="seg-value">{children}</span>
    </span>
  );
}
