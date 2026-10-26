import { useState, type FormEvent } from "react";
import { api, money, type PolicyRule } from "../api";
import { StatusBadge } from "../StatusBadge";

export function conditions(p: PolicyRule): string {
  const parts: string[] = [];
  if (p.minAmount !== null) parts.push(`amount ≥ ${money(p.minAmount)}`);
  if (p.maxPerHour !== null) parts.push(`> ${p.maxPerHour}/hour`);
  if (p.dailyLimit !== null) parts.push(`daily total > ${money(p.dailyLimit)}`);
  return parts.join(", ") || "always";
}

/** Plain-English rule → Claude-translated policy → save. Used on Home and Policies. */
export function PolicyComposer({ onSaved, inputId = "policy-text" }: { onSaved: () => void; inputId?: string }) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<(PolicyRule & { description: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onTranslate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setDraft(await api.parsePolicy(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (!draft) return;
    await api.createPolicy(draft);
    setDraft(null);
    setText("");
    onSaved();
  }

  return (
    <div className="composer">
      <form onSubmit={onTranslate} className="composer-form">
        <label className="field">
          <span className="field-label">Describe a rule in plain English</span>
          <input
            id={inputId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Never let the agent refund more than $200 without asking me"
          />
        </label>
        <p className="muted">Claude turns your sentence into a rule the firewall enforces on every PayPal call.</p>
        <div className="row-actions">
          <button className="btn-pill btn-pill-dark" disabled={busy || !text.trim()}>
            {busy ? "Translating…" : "Translate"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>

      {draft && (
        <div className="draft">
          <div>
            <p className="draft-title">{draft.name}</p>
            <p className="muted">
              <code>{draft.tools.join(", ")}</code> · when {conditions(draft)} · <StatusBadge value={draft.action} />
            </p>
          </div>
          <div className="row-actions">
            <button className="btn-pill btn-pill-dark" onClick={onSave}>Save rule</button>
            <button className="btn-pill" onClick={() => setDraft(null)}>Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}
