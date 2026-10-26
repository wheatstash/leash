import { useRef, useState, type FormEvent } from "react";
import { api, type ChatReply } from "../api";
import { StatusBadge } from "../StatusBadge";

interface Turn {
  role: "user" | "agent";
  text: string;
  events?: ChatReply["events"];
}

const SUGGESTIONS = [
  "Create a $120 invoice for 3 hours of consulting to jane@example.com and send it",
  "Refund $250 on capture 2GG279541U471931P for a damaged item",
  "Delete draft invoice INV2-ABCD-1234",
];

export function ChatPanel({ onActivity }: { onActivity: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const sessionId = useRef<string | undefined>(undefined);
  const scroller = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setTurns((t) => [...t, { role: "user", text }]);
    setInput("");
    setBusy(true);
    try {
      const reply = await api.chat(text, sessionId.current);
      sessionId.current = reply.sessionId;
      setTurns((t) => [...t, { role: "agent", text: reply.text, events: reply.events }]);
    } catch (err) {
      setTurns((t) => [...t, { role: "agent", text: `Error: ${err instanceof Error ? err.message : err}` }]);
    } finally {
      setBusy(false);
      onActivity();
      requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }));
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <div className="chat">
      <div className="chat-scroll" ref={scroller}>
        {turns.length === 0 && (
          <div className="empty">
            <p className="empty-title">Ask the agent to do some back-office work</p>
            <p className="muted">Try one of these to see the firewall in action:</p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn, i) => (
          <div key={i} className={`bubble bubble-${turn.role}`}>
            {turn.events && turn.events.length > 0 && (
              <ul className="events">
                {turn.events.map((ev) => (
                  <li key={ev.auditId}>
                    <code>{ev.tool}</code>
                    <StatusBadge value={ev.status} />
                  </li>
                ))}
              </ul>
            )}
            <p>{turn.text}</p>
          </div>
        ))}
        {busy && <div className="bubble bubble-agent skeleton">Working…</div>}
      </div>

      <form className="chat-input" onSubmit={onSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Refund order 1234 in full"
          disabled={busy}
        />
        <button className="btn btn-primary" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
