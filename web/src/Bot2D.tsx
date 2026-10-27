import { useEffect, useRef, useState } from "react";

// A flat SVG mascot for the agent. It blinks, waves now and then, follows the cursor with its
// eyes, and reacts to each firewall decision with a pose and an LED face.

export type Reaction = "yes" | "no" | "hold" | "spin";
export interface BotEvent {
  id: string;
  reaction: Reaction;
}

type Face = "open" | "happy" | "angry" | "wait";
const FACE: Record<Reaction, Face> = { yes: "happy", no: "angry", hold: "wait", spin: "happy" };
const REACTION_MS = 1400;
const WAVE_MS = 1600;

const between = (a: number, b: number) => a + Math.random() * (b - a);

export function Bot2D({ event, caption }: { event?: BotEvent; caption?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [reaction, setReaction] = useState<{ kind: Reaction; key: number } | null>(null);
  const [waving, setWaving] = useState(false);
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
      const dy = (e.clientY - (r.top + r.height * 0.35)) / (window.innerHeight / 2);
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

  // Wave hello on arrival, then every so often.
  useEffect(() => {
    let timer: number;
    const wave = (ms: number) => {
      timer = window.setTimeout(() => {
        setWaving(true);
        timer = window.setTimeout(() => {
          setWaving(false);
          wave(between(7000, 12000));
        }, WAVE_MS);
      }, ms);
    };
    wave(500);
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
    "bot2d",
    reaction && `bot-react-${reaction.kind}`,
    (waving || reaction?.kind === "yes" || reaction?.kind === "spin") && "bot-waving",
    blink && face === "open" && "bot-blink",
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
        aria-label="Agent mascot. Click to say hi."
        onClick={() => setReaction({ kind: "spin", key: Date.now() })}
      >
        <svg key={reaction?.key} viewBox="0 0 200 240" role="img" aria-hidden="true">
          <defs>
            <linearGradient id="bot-shell" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2a4a7a" />
              <stop offset="1" stopColor="#13233b" />
            </linearGradient>
            <linearGradient id="bot-visor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#14243b" />
              <stop offset="1" stopColor="#070d18" />
            </linearGradient>
            <filter id="bot-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <ellipse className="bot-shadow" cx="100" cy="230" rx="46" ry="6" />

          <g className="bot-body">
            {/* legs */}
            <rect x="74" y="176" width="20" height="38" rx="9" fill="url(#bot-shell)" />
            <rect x="106" y="176" width="20" height="38" rx="9" fill="url(#bot-shell)" />
            <rect x="70" y="208" width="28" height="12" rx="6" fill="#c9d3e0" />
            <rect x="102" y="208" width="28" height="12" rx="6" fill="#c9d3e0" />

            {/* resting arm (viewer's right) */}
            <g className="bot-arm-rest">
              <rect x="143" y="122" width="16" height="48" rx="8" fill="url(#bot-shell)" />
              <circle cx="151" cy="172" r="9" fill="#c9d3e0" />
            </g>

            {/* waving arm (viewer's left): pivots at the shoulder */}
            <g className="bot-arm-wave">
              <rect x="41" y="84" width="16" height="50" rx="8" fill="url(#bot-shell)" />
              <circle cx="49" cy="80" r="10" fill="#c9d3e0" />
            </g>

            {/* torso with the PayPal mark on a chest plate */}
            <rect x="56" y="112" width="88" height="72" rx="30" fill="url(#bot-shell)" />
            <rect x="80" y="126" width="40" height="42" rx="13" fill="#0b1628" stroke="#3b5f93" strokeWidth="1.5" />
            <image href="/paypal-monogram.png" x="89" y="132" width="22" height="26.5" />

            {/* head */}
            <g className="bot-head">
              <line x1="100" y1="28" x2="100" y2="14" stroke="#c9d3e0" strokeWidth="3" strokeLinecap="round" />
              <circle className="bot-antenna" cx="100" cy="11" r="5" />
              <rect x="30" y="52" width="14" height="32" rx="7" fill="#c9d3e0" />
              <rect x="156" y="52" width="14" height="32" rx="7" fill="#c9d3e0" />
              <rect x="38" y="26" width="124" height="88" rx="38" fill="url(#bot-shell)" stroke="#c9d3e0" strokeWidth="2.5" />
              <rect x="50" y="38" width="100" height="64" rx="26" fill="url(#bot-visor)" />
              <path d="M62 50 Q 80 42 104 44" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="5" strokeLinecap="round" fill="none" />

              <g className="bot-eyes" filter="url(#bot-glow)">
                <Eye cx={80} face={face} side="L" />
                <Eye cx={120} face={face} side="R" />
              </g>
            </g>
          </g>
        </svg>
      </button>
    </div>
  );
}

function Eye({ cx, face, side }: { cx: number; face: Face; side: "L" | "R" }) {
  const cy = 70;
  const inward = side === "L" ? 1 : -1; // +1 points toward the nose
  if (face === "happy") return <path className="bot-led" d={`M${cx - 10} ${cy + 4} Q ${cx} ${cy - 10} ${cx + 10} ${cy + 4}`} />;
  if (face === "angry")
    return <path className="bot-led" d={`M${cx - 7 * inward} ${cy - 8} L ${cx + 6 * inward} ${cy} L ${cx - 7 * inward} ${cy + 8}`} />;
  if (face === "wait") return <circle className="bot-led-fill" cx={cx} cy={cy - 3} r="4.5" />;
  return <rect className="bot-eye" x={cx - 7} y={cy - 10} width="14" height="20" rx="7" />;
}
