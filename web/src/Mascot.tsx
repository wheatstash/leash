import { useEffect, useRef, useState } from "react";

// Leash's mascot: a robot dog wearing a PayPal collar medallion. It wags, blinks, offers a paw,
// follows the cursor, and reacts to each firewall decision with a pose and an LED face.

export type Reaction = "yes" | "no" | "hold" | "spin";
export interface BotEvent {
  id: string;
  reaction: Reaction;
}

type Face = "open" | "happy" | "angry" | "wait";
const FACE: Record<Reaction, Face> = { yes: "happy", no: "angry", hold: "wait", spin: "happy" };
const REACTION_MS = 1400;
const PAW_MS = 1500;

const between = (a: number, b: number) => a + Math.random() * (b - a);

export function Mascot({ event, caption }: { event?: BotEvent; caption?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [reaction, setReaction] = useState<{ kind: Reaction; key: number } | null>(null);
  const [paw, setPaw] = useState(false);
  const [blink, setBlink] = useState(false);

  // Eyes (and a little of the head) follow the cursor; when it rests, glance around.
  useEffect(() => {
    const el = root.current!;
    let lastMove = 0;
    const look = (x: number, y: number) => {
      el.style.setProperty("--look-x", x.toFixed(3));
      el.style.setProperty("--look-y", y.toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      lastMove = performance.now();
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2);
      const dy = (e.clientY - (r.top + r.height * 0.3)) / (window.innerHeight / 2);
      look(Math.max(-1, Math.min(1, dx)), Math.max(-1, Math.min(1, dy)));
    };
    const glance = window.setInterval(() => {
      if (performance.now() - lastMove < 3500) return;
      if (Math.random() < 0.4) look(0, 0);
      else look(between(-0.9, 0.9), between(-0.6, 0.4));
    }, 2200);
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.clearInterval(glance);
    };
  }, []);

  // Blink every few seconds, sometimes twice.
  useEffect(() => {
    let timer: number;
    const schedule = (ms: number) => {
      timer = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 140);
        schedule(Math.random() < 0.2 ? 260 : between(2200, 5500));
      }, ms);
    };
    schedule(1800);
    return () => window.clearTimeout(timer);
  }, []);

  // Offer a paw on arrival, then every so often.
  useEffect(() => {
    let timer: number;
    const offer = (ms: number) => {
      timer = window.setTimeout(() => {
        setPaw(true);
        timer = window.setTimeout(() => {
          setPaw(false);
          offer(between(8000, 13000));
        }, PAW_MS);
      }, ms);
    };
    offer(700);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!event) return;
    setReaction({ kind: event.reaction, key: Date.now() });
  }, [event?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!reaction) return;
    const t = window.setTimeout(() => setReaction(null), REACTION_MS);
    return () => window.clearTimeout(t);
  }, [reaction]);

  const face: Face = reaction ? FACE[reaction.kind] : "open";
  const classes = [
    "pup",
    reaction && `pup-react-${reaction.kind}`,
    (paw || reaction?.kind === "spin") && "pup-paw-up",
    blink && face === "open" && "pup-blink",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} ref={root}>
      {caption && (
        <p key={caption} className="bot-bubble">
          {caption}
        </p>
      )}
      <button
        type="button"
        className="bot-hit"
        aria-label="Leash, the agent's guard dog. Click to play."
        onClick={() => setReaction({ kind: "spin", key: Date.now() })}
      >
        <svg key={reaction?.key} viewBox="0 0 220 250" role="img" aria-hidden="true">
          <defs>
            <linearGradient id="pup-shell" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2a4a7a" />
              <stop offset="1" stopColor="#13233b" />
            </linearGradient>
            <linearGradient id="pup-visor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#14243b" />
              <stop offset="1" stopColor="#070d18" />
            </linearGradient>
            <filter id="pup-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <ellipse className="bot-shadow" cx="110" cy="240" rx="64" ry="7" />

          <g className="pup-body">
            {/* tail, wagging from its base */}
            <g className="pup-tail">
              <path d="M148 204 C 176 200, 186 176, 178 154" fill="none" stroke="url(#pup-shell)" strokeWidth="11" strokeLinecap="round" />
              <circle cx="178" cy="152" r="7" fill="#c9d3e0" />
            </g>

            {/* haunches and back feet */}
            <ellipse cx="76" cy="206" rx="27" ry="23" fill="url(#pup-shell)" />
            <ellipse cx="144" cy="206" rx="27" ry="23" fill="url(#pup-shell)" />
            <ellipse cx="64" cy="228" rx="17" ry="8" fill="#c9d3e0" />
            <ellipse cx="156" cy="228" rx="17" ry="8" fill="#c9d3e0" />

            {/* sitting torso with a lighter belly plate */}
            <ellipse cx="110" cy="176" rx="40" ry="50" fill="url(#pup-shell)" />
            <ellipse cx="110" cy="184" rx="21" ry="30" fill="#3b5f93" opacity="0.45" />

            {/* front legs; the dog's right one offers a paw */}
            <rect x="114" y="168" width="16" height="58" rx="8" fill="url(#pup-shell)" stroke="#5b7fb3" strokeWidth="1.5" />
            <ellipse cx="122" cy="229" rx="12" ry="7" fill="#c9d3e0" />
            <g className="pup-paw">
              <rect x="90" y="168" width="16" height="58" rx="8" fill="url(#pup-shell)" stroke="#5b7fb3" strokeWidth="1.5" />
              <ellipse cx="98" cy="229" rx="12" ry="7" fill="#c9d3e0" />
            </g>

            {/* collar with the PayPal medallion */}
            <rect x="78" y="116" width="64" height="13" rx="6.5" fill="#003087" stroke="#0070e0" strokeWidth="1.5" />
            <g className="pup-tag">
              <circle cx="110" cy="132" r="3.5" fill="none" stroke="#c9d3e0" strokeWidth="2" />
              <circle cx="110" cy="149" r="14" fill="#ffffff" stroke="#c9d3e0" strokeWidth="2.5" />
              <image href="/paypal-monogram.png" x="102" y="139" width="16" height="19.3" />
            </g>

            {/* head */}
            <g className="pup-head">
              <line x1="110" y1="24" x2="110" y2="13" stroke="#c9d3e0" strokeWidth="3" strokeLinecap="round" />
              <circle className="bot-antenna" cx="110" cy="10" r="4.5" />

              <g className="pup-ear pup-ear-l">
                <rect x="40" y="30" width="24" height="58" rx="12" fill="url(#pup-shell)" stroke="#c9d3e0" strokeWidth="2" />
                <rect x="47" y="42" width="10" height="36" rx="5" fill="#c9d3e0" opacity="0.5" />
              </g>
              <g className="pup-ear pup-ear-r">
                <rect x="156" y="30" width="24" height="58" rx="12" fill="url(#pup-shell)" stroke="#c9d3e0" strokeWidth="2" />
                <rect x="163" y="42" width="10" height="36" rx="5" fill="#c9d3e0" opacity="0.5" />
              </g>

              <rect x="58" y="24" width="104" height="90" rx="40" fill="url(#pup-shell)" stroke="#c9d3e0" strokeWidth="2.5" />
              <rect x="70" y="36" width="80" height="42" rx="18" fill="url(#pup-visor)" />
              <path d="M80 45 Q 94 39 112 41" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="4" strokeLinecap="round" fill="none" />

              <g className="bot-eyes" filter="url(#pup-glow)">
                <Eye cx={94} face={face} side="L" />
                <Eye cx={126} face={face} side="R" />
              </g>

              {/* snout, nose and mouth */}
              <rect x="85" y="76" width="50" height="32" rx="16" fill="#3b5f93" />
              <ellipse cx="110" cy="83" rx="8.5" ry="5.5" fill="#0b1628" />
              <path d="M110 88 L110 94 M101 95 Q 110 101 119 95" stroke="#0b1628" strokeWidth="2" strokeLinecap="round" fill="none" />
              {face === "happy" && <ellipse className="pup-tongue" cx="110" cy="103" rx="6" ry="7.5" fill="#ff7aa2" />}
              <circle cx="72" cy="96" r="3" fill="#c9d3e0" />
              <circle cx="148" cy="96" r="3" fill="#c9d3e0" />
            </g>
          </g>
        </svg>
      </button>
    </div>
  );
}

function Eye({ cx, face, side }: { cx: number; face: Face; side: "L" | "R" }) {
  const cy = 57;
  const inward = side === "L" ? 1 : -1; // +1 points toward the snout
  if (face === "happy") return <path className="bot-led" d={`M${cx - 9} ${cy + 4} Q ${cx} ${cy - 9} ${cx + 9} ${cy + 4}`} />;
  if (face === "angry")
    return <path className="bot-led" d={`M${cx - 6 * inward} ${cy - 7} L ${cx + 6 * inward} ${cy} L ${cx - 6 * inward} ${cy + 7}`} />;
  if (face === "wait") return <circle className="bot-led-fill" cx={cx} cy={cy - 3} r="4.5" />;
  return <rect className="bot-eye" x={cx - 6.5} y={cy - 9} width="13" height="18" rx="6.5" />;
}
