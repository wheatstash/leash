/**
 * Creates and pays for the demo shop's orders in the PayPal sandbox, so the
 * agent has real capture IDs to refund. Writes server/data/demo-orders.json.
 *
 *   npm run seed                 pay with a sandbox test card (default)
 *   npm run seed -- --approve    print buyer approval links instead (if card
 *                                payments aren't enabled for your sandbox app)
 *   npm run seed -- --capture    capture orders approved via those links
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { DEMO_ORDERS, loadSeededCaptures, seededCapturesPath, type SeededCapture } from "../demo/orders.js";

const BASE = "https://api-m.sandbox.paypal.com";
const PENDING_FILE = seededCapturesPath().replace(/\.json$/, ".pending.json");

// PayPal's sandbox accepts generated test card numbers; override if yours differs.
const CARD = {
  number: process.env.SEED_CARD_NUMBER ?? "4111111111111111",
  expiry: process.env.SEED_CARD_EXPIRY ?? "2030-12",
  security_code: process.env.SEED_CARD_CVV ?? "123",
  name: "Demo Buyer",
};

type Json = Record<string, any>;

async function token(): Promise<string> {
  const auth = Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString("base64");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed (${res.status}). Check PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET.`);
  return (await res.json()).access_token;
}

async function paypal(accessToken: string, method: string, url: string, body?: Json): Promise<Json> {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": randomUUID(),
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json.details?.[0]?.description ?? json.message ?? res.statusText;
    throw new Error(`${method} ${url} → ${res.status}: ${detail}`);
  }
  return json;
}

function purchaseUnit(o: (typeof DEMO_ORDERS)[number]) {
  return {
    reference_id: o.number,
    description: `${o.item} (order #${o.number})`,
    amount: { currency_code: "USD", value: o.amount.toFixed(2) },
  };
}

function captureOf(order: Json): string {
  const id = order.purchase_units?.[0]?.payments?.captures?.[0]?.id;
  if (!id) throw new Error(`Order ${order.id} has no capture (status ${order.status})`);
  return id;
}

function save(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

async function payWithCard(accessToken: string) {
  const result: Record<string, SeededCapture> = loadSeededCaptures() ?? {};
  for (const o of DEMO_ORDERS) {
    let order = await paypal(accessToken, "POST", "/v2/checkout/orders", {
      intent: "CAPTURE",
      purchase_units: [purchaseUnit(o)],
      payment_source: { card: CARD },
    });
    if (order.status !== "COMPLETED") {
      order = await paypal(accessToken, "POST", `/v2/checkout/orders/${order.id}/capture`, {});
    }
    result[o.number] = { orderId: order.id, captureId: captureOf(order) };
    console.log(`✓ #${o.number} ${o.item}: $${o.amount.toFixed(2)} captured (${result[o.number].captureId})`);
  }
  save(seededCapturesPath(), result);
}

async function printApproveLinks(accessToken: string) {
  const pending: Record<string, string> = {};
  console.log("Open each link, log in as your sandbox *personal* (buyer) account, and approve:\n");
  for (const o of DEMO_ORDERS) {
    const order = await paypal(accessToken, "POST", "/v2/checkout/orders", {
      intent: "CAPTURE",
      purchase_units: [purchaseUnit(o)],
      payment_source: { paypal: { experience_context: { user_action: "PAY_NOW", return_url: "https://example.com/done", cancel_url: "https://example.com/cancel" } } },
    });
    pending[o.number] = order.id;
    const link = order.links?.find((l: Json) => l.rel === "payer-action" || l.rel === "approve")?.href;
    console.log(`#${o.number} $${o.amount.toFixed(2)}  ${link}`);
  }
  save(PENDING_FILE, pending);
  console.log("\nThen run:  npm run seed -- --capture");
}

async function captureApproved(accessToken: string) {
  if (!fs.existsSync(PENDING_FILE)) throw new Error("Nothing to capture. Run `npm run seed -- --approve` first.");
  const pending: Record<string, string> = JSON.parse(fs.readFileSync(PENDING_FILE, "utf8"));
  const result: Record<string, SeededCapture> = loadSeededCaptures() ?? {};
  for (const [number, orderId] of Object.entries(pending)) {
    try {
      const order = await paypal(accessToken, "POST", `/v2/checkout/orders/${orderId}/capture`, {});
      result[number] = { orderId, captureId: captureOf(order) };
      console.log(`✓ #${number} captured (${result[number].captureId})`);
    } catch (err) {
      console.log(`✗ #${number}: ${(err as Error).message} (approved it yet?)`);
    }
  }
  save(seededCapturesPath(), result);
}

async function main() {
  if (config.paypal.mock) {
    console.error("Set real PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (sandbox) in server/.env first.");
    process.exit(1);
  }
  const accessToken = await token();
  const mode = process.argv[2];

  if (mode === "--approve") {
    await printApproveLinks(accessToken);
    return;
  }
  if (mode === "--capture") await captureApproved(accessToken);
  else {
    try {
      await payWithCard(accessToken);
    } catch (err) {
      console.error(`\nCard payment failed: ${(err as Error).message}`);
      console.error("Your sandbox app may not have card payments enabled. Use:  npm run seed -- --approve");
      process.exit(1);
    }
  }
  console.log(`\nSaved to ${path.relative(process.cwd(), seededCapturesPath())}. Restart isn't needed; the inbox reads it live.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
