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

  // Who gets pinged when a call is held for approval (shown in the UI only for now).
  approverName: env("APPROVER_NAME", "Business owner"),
};
