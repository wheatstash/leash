import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { DEMO_ORDERS, DEMO_ORDERS_TOTAL, type SeededCapture } from "./demo/orders.js";
import { ws } from "./store.js";

// In-app checkout: a visitor pays for the demo shop's orders as the customer, with PayPal
// Checkout (Orders v2, sandbox). The capture goes into their workspace, so the agent refunds the
// payment they just made and visitors never use up each other's orders. No re-seeding needed.

const BASE = "https://api-m.sandbox.paypal.com";
const MAX_CHECKOUTS_PER_HOUR = 6;
const usd = (n: number) => ({ currency_code: "USD", value: n.toFixed(2) });

class CheckoutError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

let cached: { token: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const auth = Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString("base64");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new CheckoutError(`PayPal sign-in failed (${res.status})`, 502);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

async function paypal(method: string, path: string, body?: unknown): Promise<Record<string, any>> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": randomUUID(),
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) throw new CheckoutError(json.details?.[0]?.description ?? json.message ?? `PayPal returned ${res.status}`, 502);
  return json;
}

/** What the "Stock your shop" card needs to render. */
export function checkoutInfo() {
  return {
    available: !config.paypal.mock,
    clientId: config.paypal.mock ? null : config.paypal.clientId,
    total: DEMO_ORDERS_TOTAL,
    items: DEMO_ORDERS.map((o) => ({ number: o.number, customer: o.customer, item: o.item, amount: o.amount })),
    buyer: config.checkout.buyerEmail ? { email: config.checkout.buyerEmail, password: config.checkout.buyerPassword } : null,
    stocked: !!ws().captures,
  };
}

/** Creates a PayPal order for this week's demo orders: one purchase unit, one line item per order. */
export async function createCheckout(): Promise<{ id: string }> {
  if (config.paypal.mock) throw new CheckoutError("Checkout needs PayPal sandbox credentials");
  const w = ws();
  const hourAgo = Date.now() - 60 * 60 * 1000;
  w.checkouts = w.checkouts.filter((t) => t > hourAgo);
  if (w.checkouts.length >= MAX_CHECKOUTS_PER_HOUR) throw new CheckoutError("That's plenty of test orders for this hour. Try again later.", 429);

  const order = await paypal("POST", "/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: "maria-demo-week",
        description: "Maria's Clay & Linen: this week's orders (demo)",
        amount: { ...usd(DEMO_ORDERS_TOTAL), breakdown: { item_total: usd(DEMO_ORDERS_TOTAL) } },
        items: DEMO_ORDERS.map((o) => ({
          name: `#${o.number} ${o.item}`.slice(0, 127),
          quantity: "1",
          unit_amount: usd(o.amount),
          category: "PHYSICAL_GOODS",
        })),
      },
    ],
    payment_source: {
      paypal: { experience_context: { brand_name: "Maria's Clay & Linen", shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW" } },
    },
  });
  w.checkouts.push(Date.now());
  w.checkout = { orderId: order.id, createdAt: Date.now() };
  return { id: order.id };
}

/** Captures the visitor's approved order and makes it the payment behind their demo orders. */
export async function captureCheckout(orderId: string) {
  const w = ws();
  // Only the order this visitor created can be captured into their workspace.
  if (!w.checkout || w.checkout.orderId !== orderId) throw new CheckoutError("That isn't your pending checkout", 409);
  const order = await paypal("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {});
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture?.id || capture.status === "DECLINED" || capture.status === "FAILED") {
    throw new CheckoutError(`PayPal didn't complete the payment (${capture?.status ?? order.status})`, 502);
  }
  const captures: Record<string, SeededCapture> = {};
  for (const o of DEMO_ORDERS) captures[o.number] = { orderId, captureId: capture.id };
  w.captures = captures;
  w.checkout = null;
  return { captureId: capture.id as string, status: capture.status as string, amount: Number(capture.amount?.value ?? DEMO_ORDERS_TOTAL) };
}
