import { useState } from "react";
import { api, type Email } from "../api";
import { StatusBadge } from "../StatusBadge";
import { useOpenTrace } from "../traceContext";

export function InboxPanel({ emails, onActivity }: { emails: Email[]; onActivity: () => void }) {
  const openTrace = useOpenTrace();
  const [openId, setOpenId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function handle(id: string) {
    setOpenId(id);
    try {
      await api.handleEmail(id);
    } finally {
      onActivity();
    }
  }

  // Sequential so each step is readable on camera.
  async function handleAll() {
    setRunning(true);
    try {
      for (const e of emails.filter((e) => e.status === "unread" || e.status === "error")) {
        onActivity();
        await handle(e.id);
      }
    } finally {
      setRunning(false);
    }
  }

  const unread = emails.filter((e) => e.status === "unread").length;

  return (
    <div className="inbox">
      <div className="inbox-toolbar">
        <p className="muted">{unread} unread from customers</p>
        <button className="btn btn-primary" data-tour="handle-inbox" onClick={handleAll} disabled={running || unread === 0}>
          {running ? "Agent working…" : "Let the agent handle the inbox"}
        </button>
      </div>

      <ul className="mail-list">
        {emails.map((e) => {
          const open = openId === e.id;
          return (
            <li key={e.id} className={`mail mail-${e.status} ${open ? "mail-open" : ""}`}>
              <button className="mail-head" onClick={() => setOpenId(open ? null : e.id)} aria-expanded={open}>
                <span className="mail-from">{e.fromName}</span>
                <span className="mail-subject">{e.subject}</span>
                <span className="mail-state">
                  {e.status === "working" && <span className="badge badge-neutral skeleton">Working</span>}
                  {e.status === "handled" && <span className="badge badge-ok">Handled</span>}
                  {e.status === "error" && <span className="badge badge-bad">Error</span>}
                </span>
              </button>

              {open && (
                <div className="mail-body">
                  <p className="mail-meta muted">{e.from}{e.orderNumber && ` · order #${e.orderNumber}`}</p>
                  <p className={`mail-text ${e.suspicious ? "mail-suspicious" : ""}`}>{e.body}</p>

                  {e.events && e.events.length > 0 && (
                    <ul className="events">
                      {e.events.map((ev) => (
                        <li key={ev.auditId}>
                          <button className="event-btn" onClick={() => openTrace(ev.auditId)} title="View the call trace">
                            <code>{ev.tool}</code>
                            <StatusBadge value={ev.status} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {e.status === "handled" && e.events?.length === 0 && (
                    <p className="muted">No PayPal actions taken.</p>
                  )}
                  {e.reply && (
                    <div className="mail-reply">
                      <p className="mail-reply-label">Agent</p>
                      <p>{e.reply}</p>
                    </div>
                  )}
                  {e.error && <p className="error">{e.error}</p>}

                  {(e.status === "unread" || e.status === "error") && (
                    <button className="btn btn-ghost btn-sm" onClick={() => handle(e.id)} disabled={running}>
                      Handle this email
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
