import dotenv from "dotenv";

// server/.env wins over variables inherited from the shell (e.g. an unrelated
// ANTHROPIC_AUTH_TOKEN), so the app always uses the keys configured for it.
dotenv.config({ override: true });

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

const paypalClientId = env("PAYPAL_CLIENT_ID");
const paypalClientSecret = env("PAYPAL_CLIENT_SECRET");

export const config = {
  port: Number(env("PORT", "8787")),

  paypal: {
    clientId: paypalClientId,
    clientSecret: paypalClientSecret,
    // Mock mode lets the console run end to end without PayPal credentials.
    mock:
      env("PAYPAL_MOCK", "false") === "true" ||
      !paypalClientId ||
      paypalClientId.startsWith("your-"),
  },

  anthropic: {
    model: env("ANTHROPIC_MODEL", "claude-opus-5-5"),
    effort: env("ANTHROPIC_EFFORT", "medium") as "low" | "medium" | "high",
  },

  // Demo sign-in. The defaults are public on purpose: they're shown on the sign-in screen and in
  // the README so judges can get in. Override them (and set AUTH_SECRET) for a private deployment.
  auth: {
    email: env("DEMO_EMAIL", "judge@example.com"),
    password: env("DEMO_PASSWORD", "leash-demo-2026"),
    showCredentials: env("DEMO_SHOW_CREDENTIALS", "true") === "true",
    secret: env("AUTH_SECRET"),
  },

  // Shown on the in-app checkout so judges can pay as the sandbox buyer (a sandbox personal
  // account, not a real one). Optional.
  checkout: {
    buyerEmail: env("SANDBOX_BUYER_EMAIL"),
    buyerPassword: env("SANDBOX_BUYER_PASSWORD"),
  },

  // POST /api/tools/:name calls a PayPal tool directly (through the firewall, but without Claude or
  // the agent budget). Handy for local testing; switched off on the hosted demo.
  allowDirectTools: env("ALLOW_DIRECT_TOOLS", "true") === "true",

  // Claude-backed agent runs allowed per visitor per hour, and across all visitors per UTC day.
  agent: {
    runsPerHour: Number(env("AGENT_RUNS_PER_HOUR", "30")),
    runsPerDay: Number(env("AGENT_RUNS_PER_DAY", "600")),
  },

  // Who gets pinged when a call is held for approval (shown in the UI only for now).
  approverName: env("APPROVER_NAME", "Business owner"),
};
