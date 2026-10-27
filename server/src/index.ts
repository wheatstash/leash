import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { execSync } from "node:child_process";
import { chat, claudeLive, handleEmail } from "./agent.js";
import { inbox, resetInbox } from "./demo/inbox.js";
import { loadSeededCaptures } from "./demo/orders.js";
import { config } from "./config.js";
import { guardedCall, resolveApproval } from "./gateway.js";
import { spendSummary } from "./policy/engine.js";
import { parsePolicy } from "./policy/parser.js";
import { PolicyRuleSchema } from "./policy/types.js";
import { isReadOnly, paypalTools } from "./paypal.js";
import { addPolicy, approvals, audit, policies, resetStore, settings } from "./store.js";
import { packageVersion, paypalLive } from "./trace.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

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
  res.json(await chat(sessionId, message));
});

// Lets the console (or any other agent) call a PayPal tool through the same firewall.
app.post("/api/tools/:name", async (req, res) => {
  res.json(await guardedCall(req.params.name, req.body ?? {}, "console"));
});

app.get("/api/audit", (_req, res) => res.json(audit));
app.get("/api/approvals", (_req, res) => res.json(approvals));
app.get("/api/spend", (_req, res) => res.json(spendSummary()));

app.post("/api/approvals/:id/:decision", async (req, res) => {
  const { id, decision } = req.params;
  if (decision !== "approve" && decision !== "reject") return void res.status(400).json({ error: "decision must be approve or reject" });
  res.json(await resolveApproval(id, decision === "approve"));
});

app.get("/api/settings", (_req, res) => res.json(settings));
app.post("/api/settings", (req, res) => {
  if (typeof req.body.guardrails === "boolean") settings.guardrails = req.body.guardrails;
  res.json(settings);
});

app.get("/api/inbox", (_req, res) => res.json(inbox));

app.post("/api/inbox/:id/handle", async (req, res) => {
  const email = inbox.find((e) => e.id === req.params.id);
  if (!email) return void res.status(404).json({ error: "Email not found" });
  if (email.status === "working") return void res.status(409).json({ error: "Already being handled" });
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
  resetStore();
  resetInbox();
  res.status(204).end();
});

app.get("/api/policies", (_req, res) => res.json(policies));

app.post("/api/policies/parse", async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text?.trim()) return void res.status(400).json({ error: "text is required" });
  res.json({ description: text, ...(await parsePolicy(text)) });
});

app.post("/api/policies", (req, res) => {
  const rule = PolicyRuleSchema.parse(req.body);
  const description = typeof req.body.description === "string" ? req.body.description : rule.name;
  res.status(201).json(addPolicy({ ...rule, description }));
});

app.patch("/api/policies/:id", (req, res) => {
  const policy = policies.find((p) => p.id === req.params.id);
  if (!policy) return void res.status(404).json({ error: "Policy not found" });
  if (typeof req.body.enabled === "boolean") policy.enabled = req.body.enabled;
  res.json(policy);
});

app.delete("/api/policies/:id", (req, res) => {
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
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
});

app.listen(config.port, () => {
  console.log(`Leash API on http://localhost:${config.port} (PayPal: ${config.paypal.mock ? "mock" : "sandbox"})`);
});
