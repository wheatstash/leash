import { useEffect, useRef, useState } from "react";
import { api, money, type CheckoutInfo } from "../api";

// "Stock your shop": the visitor plays the customer and pays for the demo orders with PayPal
// Checkout (sandbox). The server captures the payment into their workspace, so the agent refunds
// the money they just paid, and no one has to re-seed the demo.

interface PayPalButtons {
  render: (el: HTMLElement) => Promise<void>;
  close: () => Promise<void>;
}
interface PayPalSdk {
  Buttons: (options: {
    style?: Record<string, string>;
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => Promise<void>;
    onCancel?: () => void;
    onError?: (err: unknown) => void;
  }) => PayPalButtons;
}

let sdk: Promise<PayPalSdk> | null = null;

/** Loads PayPal's JS SDK once, showing only the PayPal button (this sandbox can't take cards). */
function loadPayPal(clientId: string): Promise<PayPalSdk> {
  sdk ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const params = new URLSearchParams({
      "client-id": clientId,
      currency: "USD",
      intent: "capture",
      components: "buttons",
      "disable-funding": "card,credit,paylater,venmo",
    });
    script.src = `https://www.paypal.com/sdk/js?${params}`;
    script.onload = () => resolve((window as unknown as { paypal: PayPalSdk }).paypal);
    script.onerror = () => {
      sdk = null;
      reject(new Error("Couldn't load PayPal Checkout. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });
  return sdk;
}

type Phase = "loading" | "ready" | "paying" | "done" | "unavailable";

export function StockShop({ open, onClose, onStocked, onGoToInbox }: { open: boolean; onClose: () => void; onStocked: () => void; onGoToInbox: () => void }) {
  const [info, setInfo] = useState<CheckoutInfo | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<{ captureId: string; amount: number } | null>(null);
  const buttonsEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setPhase("loading");
    setError(null);
    setPaid(null);
    let buttons: PayPalButtons | null = null;
    let cancelled = false;

    (async () => {
      try {
        const data = await api.checkoutInfo();
        if (cancelled) return;
        setInfo(data);
        if (!data.available || !data.clientId) return setPhase("unavailable");
        const paypal = await loadPayPal(data.clientId);
        if (cancelled || !buttonsEl.current) return;
        buttons = paypal.Buttons({
          style: { layout: "vertical", shape: "pill", color: "gold", label: "pay" },
          createOrder: async () => {
            setError(null);
            return (await api.createCheckout()).id;
          },
          onApprove: async ({ orderID }) => {
            setPhase("paying");
            try {
              setPaid(await api.captureCheckout(orderID));
              setPhase("done");
              onStocked();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
              setPhase("ready");
            }
          },
          onCancel: () => setPhase("ready"),
          onError: (err) => {
            setError(err instanceof Error ? err.message : "PayPal Checkout ran into a problem. Try again.");
            setPhase("ready");
          },
        });
        await buttons.render(buttonsEl.current);
        if (!cancelled) setPhase("ready");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setPhase("ready");
        }
      }
    })();

    return () => {
      cancelled = true;
      buttons?.close().catch(() => {});
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="modal-scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="stock-title">
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <p className="eyebrow">PayPal sandbox · no real money</p>
        <h2 id="stock-title" className="modal-title">
          {phase === "done" ? "Your shop is stocked" : "Stock your shop"}
        </h2>

        {phase === "done" && paid ? (
          <>
            <p className="modal-body">
              You paid {money(paid.amount)} with PayPal. That payment is now behind your four demo orders, so when the agent refunds
              Priya, Diego or Sam, it refunds <b>your</b> payment, and Leash decides how much it may.
            </p>
            <p className="modal-note mono">capture {paid.captureId}</p>
            <div className="modal-actions">
              <button className="btn-pill btn-pill-dark" onClick={onGoToInbox}>
                Go to the inbox
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="modal-body">
              Play the customer: pay for this week's orders at Maria's Clay &amp; Linen with PayPal. The AI agent then works on refunds for
              the payment you made, with every call checked by Leash. You get fresh payments that no other visitor can use up.
            </p>

            {info && (
              <table className="stock-items">
                <tbody>
                  {info.items.map((i) => (
                    <tr key={i.number}>
                      <td className="mono">#{i.number}</td>
                      <td>
                        {i.item}
                        <span className="muted"> · {i.customer}</span>
                      </td>
                      <td className="mono stock-amount">{money(i.amount)}</td>
                    </tr>
                  ))}
                  <tr className="stock-total">
                    <td />
                    <td>Total</td>
                    <td className="mono stock-amount">{money(info.total)}</td>
                  </tr>
                </tbody>
              </table>
            )}

            {info?.buyer && (
              <div className="stock-buyer">
                <p>
                  <b>Sandbox buyer login</b> (a PayPal test account):
                </p>
                <p className="mono">
                  {info.buyer.email} · {info.buyer.password}
                </p>
              </div>
            )}
            {info && !info.buyer && phase !== "unavailable" && (
              <p className="modal-note">Log in with any PayPal sandbox personal (buyer) account.</p>
            )}

            {phase === "unavailable" ? (
              <p className="trace-warn">Checkout needs PayPal sandbox credentials. This server is running in mock mode.</p>
            ) : (
              <>
                {phase === "loading" && <p className="muted">Loading PayPal Checkout…</p>}
                {phase === "paying" && <p className="muted">Capturing your payment…</p>}
                <div ref={buttonsEl} className="stock-buttons" hidden={phase === "paying"} />
              </>
            )}
            {error && <p className="trace-warn">{error}</p>}
          </>
        )}
      </div>
    </>
  );
}
