import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import express, { type NextFunction, type Request, type Response } from "express";
import { execSync } from "node:child_process";
import { chat, claudeLive, handleEmail } from "./agent.js";
import { checkCredentials, currentUser, issueToken, loginRateLimited, requireAuth } from "./auth.js";
import { budgetStatus, chargeAgentRun } from "./budget.js";
import { loadSeededCaptures } from "./demo/orders.js";
import { config } from "./config.js";
import { guardedCall, resolveApproval } from "./gateway.js";
import { spendSummary } from "./policy/engine.js";
import { parsePolicy } from "./policy/parser.js";
import { PolicyRuleSchema } from "./policy/types.js";
import { isReadOnly, paypalTools } from "./paypal.js";
import { activeWorkspaces, addPolicy, resetWorkspace, ws } from "./store.js";
import { packageVersion, paypalLive } from "./trace.js";

const app = express();
// Render (and most hosts) sit behind a proxy; trust it so req.ip is the visitor, not the proxy.
app.set("trust proxy", 1);
app.use(express.json({ limit: "100kb" }));

// Longest chat message or plain-English rule we'll send to Claude.
const MAX_CHAT_CHARS = 2000;
const MAX_RULE_CHARS = 500;

// Unauthenticated liveness probe for the host's health checks.
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Demo sign-in. Everything else under /api requires a session.
app.post("/api/auth/login", (req, res) => {
  if (loginRateLimited(req.ip ?? "unknown")) return void res.status(429).json({ error: "Too many attempts. Try again in a minute." });
  const { email = "", password = "" } = (req.body ?? {}) as { email?: string; password?: string };
  if (!checkCredentials(String(email), String(password))) return void res.status(401).json({ error: "Those aren't the demo credentials." });
  res.json({ token: issueToken(config.auth.email), user: { email: config.auth.email } });
});
app.get("/api/auth/me", (req, res) => {
  const email = currentUser(req);
  if (!email) return void res.status(401).json({ error: "Not signed in" });
  res.json({ email });
});
// The sign-in screen shows the demo credentials so judges can get straight in.
app.get("/api/auth/demo", (_req, res) => {
  res.json(config.auth.showCredentials ? { email: config.auth.email, password: config.auth.password } : {});
});
app.use("/api", requireAuth);

app.get("/api/status", (_req, res) => {
  res.json({
    paypalMode: config.paypal.mock ? "mock" : "sandbox",
    model: config.anthropic.model,
    approverName: config.approverName,
    toolCount: paypalTools.length,
    sandboxSeeded: loadSeededCaptures() !== null,
  });
});

// Where this build came from: Render sets RENDER_GIT_COMMIT; locally we ask git.
const commit =
  process.env.RENDER_GIT_COMMIT ??
  (() => {
    try {
      return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      return null;
    }
  })();
const versions = {
  toolkit: packageVersion("@paypal/agent-toolkit", "@paypal/agent-toolkit/ai-sdk"),
  anthropicSdk: packageVersion("@anthropic-ai/sdk"),
  agGrid: packageVersion("ag-grid-community"),
  react: packageVersion("react"),
  express: packageVersion("express"),
};

// Live facts for the console's stack status bar: real connections, versions and the deployed build.
app.get("/api/stack", (_req, res) => {
  res.json({
    paypal: {
      mode: config.paypal.mock ? "mock" : "sandbox",
      ...paypalLive,
    },
    toolkit: { version: versions.toolkit, tools: paypalTools.length },
    claude: { model: config.anthropic.model, effort: config.anthropic.effort, sdkVersion: versions.anthropicSdk, ...claudeLive },
    budget: budgetStatus(),
    visitors: activeWorkspaces(),
    ui: { agGrid: versions.agGrid, react: versions.react },
    host: {
      onRender: process.env.RENDER === "true",
      service: process.env.RENDER_SERVICE_NAME ?? null,
      url: process.env.RENDER_EXTERNAL_URL ?? null,
      instance: process.env.RENDER_INSTANCE_ID ?? null,
      branch: process.env.RENDER_GIT_BRANCH ?? null,
      commit,
      repo: "https://github.com/wheatstash/leash",
      node: process.version,
      express: versions.express,
      uptimeSec: Math.round(process.uptime()),
    },
  });
});

app.get("/api/tools", (_req, res) => {
  res.json(paypalTools.map((t) => ({ name: t.name, readOnly: isReadOnly(t.name), description: t.description })));
});

app.post("/api/chat", async (req, res) => {
  const { sessionId, message } = req.body as { sessionId?: string; message?: string };
  if (!message?.trim()) return void res.status(400).json({ error: "message is required" });
  if (message.length > MAX_CHAT_CHARS) return void res.status(400).json({ error: `Keep messages under ${MAX_CHAT_CHARS} characters.` });
  chargeAgentRun();
  res.json(await chat(sessionId, message));
});

// Lets the console (or any other agent) call a PayPal tool through the same firewall. Off on the
// hosted demo: it skips the agent budget, so visitors could otherwise drain the shared sandbox data.
app.post("/api/tools/:name", async (req, res) => {
  if (!config.allowDirectTools) return void res.status(403).json({ error: "Direct tool calls are disabled on this demo. Use the inbox or chat." });
  res.json(await guardedCall(req.params.name, req.body ?? {}, "console"));
});

app.get("/api/audit", (_req, res) => res.json(ws().audit));
app.get("/api/approvals", (_req, res) => res.json(ws().approvals));
app.get("/api/spend", (_req, res) => res.json(spendSummary()));

app.post("/api/approvals/:id/:decision", async (req, res) => {
  const { id, decision } = req.params;
  if (decision !== "approve" && decision !== "reject") return void res.status(400).json({ error: "decision must be approve or reject" });
  res.json(await resolveApproval(id, decision === "approve"));
});

app.get("/api/settings", (_req, res) => res.json(ws().settings));
app.post("/api/settings", (req, res) => {
  const { settings } = ws();
  if (typeof req.body.guardrails === "boolean") settings.guardrails = req.body.guardrails;
  res.json(settings);
});

app.get("/api/inbox", (_req, res) => res.json(ws().inbox));

app.post("/api/inbox/:id/handle", async (req, res) => {
  const email = ws().inbox.find((e) => e.id === req.params.id);
  if (!email) return void res.status(404).json({ error: "Email not found" });
  if (email.status === "working") return void res.status(409).json({ error: "Already being handled" });
  chargeAgentRun();
  email.status = "working";
  try {
    const reply = await handleEmail(email);
    Object.assign(email, { status: "handled", reply: reply.text, events: reply.events, error: undefined });
  } catch (err) {
    Object.assign(email, { status: "error", error: err instanceof Error ? err.message : String(err) });
  }
  res.json(email);
});

// Puts everything back to the starting state between demo takes.
app.post("/api/demo/reset", (_req, res) => {
  resetWorkspace();
  res.status(204).end();
});

app.get("/api/policies", (_req, res) => res.json(ws().policies));

app.post("/api/policies/parse", async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text?.trim()) return void res.status(400).json({ error: "text is required" });
  if (text.length > MAX_RULE_CHARS) return void res.status(400).json({ error: `Keep rules under ${MAX_RULE_CHARS} characters.` });
  chargeAgentRun();
  res.json({ description: text, ...(await parsePolicy(text)) });
});

app.post("/api/policies", (req, res) => {
  const rule = PolicyRuleSchema.parse(req.body);
  const description = typeof req.body.description === "string" ? req.body.description : rule.name;
  res.status(201).json(addPolicy({ ...rule, description }));
});

app.patch("/api/policies/:id", (req, res) => {
  const policy = ws().policies.find((p) => p.id === req.params.id);
  if (!policy) return void res.status(404).json({ error: "Policy not found" });
  if (typeof req.body.enabled === "boolean") policy.enabled = req.body.enabled;
  res.json(policy);
});

app.delete("/api/policies/:id", (req, res) => {
  const { policies } = ws();
  const i = policies.findIndex((p) => p.id === req.params.id);
  if (i === -1) return void res.status(404).json({ error: "Policy not found" });
  policies.splice(i, 1);
  res.status(204).end();
});

// In production the server also hosts the built console, so Render needs one service.
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Expected refusals (e.g. the agent budget) carry their own status; everything else is a 500.
  const status = (err as { status?: number }).status;
  if (status && status < 500) {
    const retry = (err as { retryAfterSec?: number }).retryAfterSec;
    if (retry) res.set("Retry-After", String(retry));
    return void res.status(status).json({ error: (err as Error).message });
  }
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
});

app.listen(config.port, () => {
  console.log(`Leash API on http://localhost:${config.port} (PayPal: ${config.paypal.mock ? "mock" : "sandbox"})`);
});
