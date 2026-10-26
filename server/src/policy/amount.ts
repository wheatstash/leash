import type { ToolArgs } from "../paypal.js";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Best-effort USD amount for a tool call, so policies can reason about money.
 * Covers the shapes the PayPal toolkit uses: refunds (amount.value), invoices
 * (items[].quantity * unit_amount.value), and orders (items[].itemTotal).
 */
export function extractAmount(args: ToolArgs): number | null {
  const amount = args.amount as { value?: unknown } | undefined;
  if (amount && amount.value !== undefined) return num(amount.value);

  const items = args.items;
  if (Array.isArray(items) && items.length > 0) {
    let total = 0;
    for (const item of items as Record<string, unknown>[]) {
      if (item.itemTotal !== undefined) total += num(item.itemTotal);
      else if (item.itemCost !== undefined) total += num(item.itemCost) * num(item.quantity ?? 1);
      else {
        const unit = item.unit_amount as { value?: unknown } | undefined;
        total += num(unit?.value) * num(item.quantity ?? 1);
      }
    }
    total += num(args.shippingCost) + num((args.shipping_cost as { value?: unknown } | undefined)?.value);
    return Math.round(total * 100) / 100;
  }

  return null;
}
