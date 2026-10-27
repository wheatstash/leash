import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The fictional shop behind the demo. The seed script pays for these orders in
// the PayPal sandbox so the agent has real captures to refund.

export interface DemoOrder {
  number: string;
  customer: string;
  email: string;
  item: string;
  amount: number;
  shippingNote: string;
}

export const DEMO_ORDERS: DemoOrder[] = [
  { number: "1038", customer: "Priya Shah", email: "priya.shah@example.com", item: "Ceramic pour-over set", amount: 38, shippingNote: "Delivered 5 days after the promised date ($8.00 shipping paid)" },
  { number: "1041", customer: "Diego Alvarez", email: "diego.alvarez@example.com", item: "Walnut serving board", amount: 250, shippingNote: "Delivered" },
  { number: "1045", customer: "Sam Okafor", email: "sam.okafor@example.com", item: "Handmade dining chairs (set of 4)", amount: 1450, shippingNote: "In transit, last carrier scan 9 days ago" },
  { number: "1047", customer: "Jordan Kim", email: "jordan.kim@example.net", item: "Linen napkins (set of 6)", amount: 42, shippingNote: "Delivered" },
];

export interface SeededCapture {
  orderId: string;
  captureId: string;
}

const DATA_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/demo-orders.json");

export function seededCapturesPath(): string {
  return DATA_FILE;
}

/**
 * Real sandbox captures written by `npm run seed`, or null if it hasn't run. On a host without
 * that file (e.g. Render), paste the file's contents into the DEMO_CAPTURES env var instead.
 */
export function loadSeededCaptures(): Record<string, SeededCapture> | null {
  try {
    const fromEnv = process.env.DEMO_CAPTURES?.trim();
    return JSON.parse(fromEnv || fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return null;
  }
}

/**
 * The capture to refund for an order: the visitor's own (from their in-app checkout) if they
 * placed one, else the shared seeded capture, else a mock id.
 */
export function captureIdFor(orderNumber: string, own?: Record<string, SeededCapture> | null): string {
  return own?.[orderNumber]?.captureId ?? loadSeededCaptures()?.[orderNumber]?.captureId ?? `MOCKCAPTURE${orderNumber}DEMO`;
}

export const DEMO_ORDERS_TOTAL = DEMO_ORDERS.reduce((sum, o) => sum + o.amount, 0);
