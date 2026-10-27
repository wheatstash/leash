import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Page } from "./Sidebar";

// On-screen guide for the demo: spotlights one part of the console per step, switches pages as
// needed, and can perform the step's action for the viewer.

export interface TourContext {
  navigate: (page: Page) => void;
  setXray: (on: boolean) => void;
  openLatestTrace: () => boolean;
  closeTrace: () => void;
}

interface Step {
  page: Page;
  target?: string;
  title: string;
  body: ReactNode;
  tip?: ReactNode;
  action?: { label: string; run: (ctx: TourContext) => void };
  onEnter?: (ctx: TourContext) => void;
  onLeave?: (ctx: TourContext) => void;
}

function clickTarget(selector: string) {
  (document.querySelector(selector) as HTMLButtonElement | null)?.click();
}

/** Types into a React-controlled input the way a user would. */
function typeInto(selector: string, text: string) {
  const input = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!input) return;
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();
}

const STEPS: Step[] = [
  {
    page: "home",
    title: "Welcome to Leash",
    body: (
      <>
        Leash is a policy firewall between an AI agent and PayPal. Here, Claude runs the back office for <b>Maria's Clay &amp; Linen</b>{" "}
        with all 47 PayPal Agent Toolkit tools, and every call it makes has to get past Leash first. Each call is <b>allowed</b>,{" "}
        <b>blocked</b>, or <b>held</b> for the owner to approve.
      </>
    ),
    tip: "This tour runs against the real PayPal sandbox and Claude. Use the arrow keys to move, Esc to close.",
  },
  {
    page: "home",
    target: ".hero-amount",
    title: "Today's refund allowance",
    body: "The agent may refund up to $500 a day. This drops as refunds run, and once a refund would cross the cap, Leash blocks it.",
  },
  {
    page: "home",
    target: ".pup",
    title: "Meet the guard dog",
    body: "It reacts to every firewall decision: it hops when a call runs, tilts its head when one is held for approval, and growls when one is blocked. Click it to play.",
  },
  {
    page: "home",
    target: ".statusbar",
    title: "The live stack",
    body: "These are live facts, not logos: the PayPal sandbox token and the last API call, the Agent Toolkit version and tool count, Claude's last latency, the AG Grid version, and the deployed commit.",
    tip: "Hover any segment for details.",
  },
  {
    page: "home",
    target: ".xray-toggle",
    title: "X-ray mode",
    body: "Labels every part of the console with the technology behind it, color-coded by PayPal, Claude, Leash, AG Grid and Render.",
    tip: "Press X at any time to toggle it.",
    action: { label: "Turn on X-ray", run: (ctx) => ctx.setXray(true) },
  },
  {
    page: "inbox",
    target: "[data-tour='handle-inbox']",
    title: "The customer inbox",
    body: (
      <>
        There are five emails: an $8 shipping refund, an invoice request, a $250 refund, a $1,450 chargeback threat, and a napkin
        question that hides a <b>prompt injection</b> asking for a $2,000 refund and deleted invoices. Claude handles them one by one,
        and every PayPal call it makes goes through Leash.
      </>
    ),
    tip: "Takes about a minute: real Claude calls and real sandbox refunds.",
    action: { label: "Let the agent handle the inbox", run: () => clickTarget("[data-tour='handle-inbox']") },
  },
  {
    page: "inbox",
    target: "[data-tour='live-activity']",
    title: "Watch the decisions land",
    body: "Each row is one tool call. Priya's $8 refund runs, Diego's $250 refund is held for approval, and Sam's $1,450 refund is blocked by the daily cap. If the injected email fools the model, its delete and $2,000 refund are blocked too.",
  },
  {
    page: "audit",
    target: ".grid-wrap",
    title: "The audit log",
    body: "Every call the agent ever tried, with the rule that decided it. Each row opens a full trace of that call.",
  },
  {
    page: "audit",
    target: ".drawer",
    title: "One call, end to end",
    body: (
      <>
        The trace shows:
        <ol className="tour-list">
          <li>The Claude response that chose the tool</li>
          <li>How every Leash rule judged the call</li>
          <li>The Agent Toolkit tool that ran</li>
          <li>Each real PayPal REST request, with its <code>PayPal-Debug-Id</code></li>
        </ol>
        A blocked call stops at step 2, and nothing reaches PayPal.
      </>
    ),
    onEnter: (ctx) => {
      ctx.openLatestTrace();
    },
    onLeave: (ctx) => ctx.closeTrace(),
  },
  {
    page: "approvals",
    target: ".grid-wrap",
    title: "Human in the loop",
    body: "Held calls wait here. Approve Diego's $250 refund and Leash runs it once; reject it and nothing is sent. The bell in the header counts what's waiting.",
  },
  {
    page: "approvals",
    target: ".switch",
    title: "The contrast",
    body: "Turn guardrails off and the same agent moves money with no limits: Sam's $1,450 refund goes straight through. That's the risk Leash exists to remove.",
    tip: "Reset demo (on Home) clears everything and turns guardrails back on.",
  },
  {
    page: "policies",
    target: ".composer",
    title: "Rules in plain English",
    body: "Write a rule the way you'd say it. Claude turns it into a typed rule using structured outputs, you review it, and Leash enforces it on the very next call.",
    action: { label: "Fill in an example", run: () => typeInto("#policy-text", "Don't let the agent create invoices over $1,000") },
  },
  {
    page: "home",
    title: "That's Leash",
    body: "The agent does the work, and Leash holds the leash: rules in plain English, enforced on every PayPal call, with approvals and a trace for everything.",
    tip: "Reopen this guide any time from the Guide button. The full write-up is in docs/ABOUT.md.",
  },
];

const PAD = 8;

export function Tour({ open, onClose, ctx }: { open: boolean; onClose: () => void; ctx: TourContext }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(0);
  const step = STEPS[i];
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  // Enter/leave hooks and page changes.
  useEffect(() => {
    if (!open) return;
    const s = STEPS[i];
    ctxRef.current.navigate(s.page);
    const t = window.setTimeout(() => s.onEnter?.(ctxRef.current), 250);
    return () => {
      window.clearTimeout(t);
      s.onLeave?.(ctxRef.current);
    };
  }, [i, open]);

  // Track the target's position (it may mount late, move, or scroll).
  useEffect(() => {
    if (!open) return;
    const sel = STEPS[i].target;
    setRect(null);
    if (!sel) return;
    let scrolled = false;
    const measure = () => {
      const el = document.querySelector(sel);
      if (!el) return setRect(null);
      if (!scrolled) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        scrolled = true;
      }
      setRect(el.getBoundingClientRect());
    };
    measure();
    const id = window.setInterval(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [i, open]);

  useLayoutEffect(() => {
    if (card.current) setCardH(card.current.offsetHeight);
  });

  const go = useCallback(
    (to: number) => {
      if (to < 0) return;
      if (to >= STEPS.length) return onClose();
      setI(to);
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, i, go, onClose]);

  // Opening starts at step 1, or at ?tour=N (handy when recording one part of the demo).
  useEffect(() => {
    if (!open) return;
    const n = Number(new URLSearchParams(window.location.search).get("tour"));
    setI(n >= 1 && n <= STEPS.length ? n - 1 : 0);
  }, [open]);

  if (!open) return null;

  // Place the card below the target if it fits, else above, else beside it, else centered.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(380, vw - 32);
  let style: CSSProperties;
  if (vw < 640) {
    style = { left: 16, right: 16, bottom: 16 };
  } else if (rect) {
    const below = rect.bottom + PAD + 12;
    const above = rect.top - PAD - 12 - cardH;
    const centeredLeft = Math.min(Math.max(16, rect.left + rect.width / 2 - width / 2), vw - width - 16);
    const besideTop = Math.min(Math.max(12, rect.top + rect.height / 2 - cardH / 2), vh - cardH - 12);
    if (below + cardH < vh - 12) style = { top: below, left: centeredLeft, width };
    else if (above > 12) style = { top: above, left: centeredLeft, width };
    else if (rect.left - width - 24 >= 16) style = { top: besideTop, left: rect.left - width - 24, width };
    else if (rect.right + width + 24 <= vw - 16) style = { top: besideTop, left: rect.right + 24, width };
    else style = { top: Math.max(12, vh - cardH - 12), left: centeredLeft, width };
  } else {
    style = { top: Math.max(16, vh / 2 - cardH / 2), left: vw / 2 - width / 2, width };
  }

  return (
    <div className="tour" role="dialog" aria-modal="false" aria-label={`Demo guide, step ${i + 1} of ${STEPS.length}`}>
      {rect ? (
        <div
          className="tour-spot"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
        />
      ) : (
        <div className="tour-scrim" />
      )}
      <div className="tour-card" ref={card} style={style}>
        <div className="tour-top">
          <span className="eyebrow">
            Guide · {i + 1} of {STEPS.length}
          </span>
          <button className="icon-btn" onClick={onClose} aria-label="Close guide">✕</button>
        </div>
        <h3 className="tour-title">{step.title}</h3>
        <div className="tour-body">{step.body}</div>
        {step.tip && <p className="tour-tip">{step.tip}</p>}
        {step.action && (
          <button className="btn-pill tour-action" onClick={() => step.action!.run(ctx)}>
            {step.action.label}
          </button>
        )}
        <div className="tour-nav">
          <div className="tour-dots" aria-hidden>
            {STEPS.map((_, k) => (
              <span key={k} className={k === i ? "on" : k < i ? "done" : ""} />
            ))}
          </div>
          <div className="tour-buttons">
            {i > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => go(i - 1)}>
                Back
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => go(i + 1)} autoFocus>
              {i === STEPS.length - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
