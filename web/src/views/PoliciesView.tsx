import { useMemo, useState, type FormEvent } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { api, money, type Policy, type PolicyRule } from "../api";
import { gridTheme } from "../grid";
import { StatusBadge } from "../StatusBadge";

function conditions(p: PolicyRule): string {
  const parts: string[] = [];
  if (p.minAmount !== null) parts.push(`amount ≥ ${money(p.minAmount)}`);
  if (p.maxPerHour !== null) parts.push(`> ${p.maxPerHour}/hour`);
  if (p.dailyLimit !== null) parts.push(`daily total > ${money(p.dailyLimit)}`);
  return parts.join(", ") || "always";
}

export function PoliciesView({ rows, onChange }: { rows: Policy[]; onChange: () => void }) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<(PolicyRule & { description: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onParse(e: FormEvent) {
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
    onChange();
  }

  const columns = useMemo<ColDef<Policy>[]>(
    () => [
      {
        field: "enabled",
        headerName: "On",
        width: 80,
        cellRenderer: (p: ICellRendererParams<Policy>) => (
          <input type="checkbox" checked={p.value} onChange={(e) => api.togglePolicy(p.data!.id, e.target.checked).then(onChange)} />
        ),
      },
      { field: "name", headerName: "Rule", flex: 1, minWidth: 200, tooltipField: "description" },
      { field: "tools", headerName: "Applies to", width: 260, cellClass: "mono", valueFormatter: (p) => p.value.join(", ") },
      { headerName: "When", width: 200, valueGetter: (p) => (p.data ? conditions(p.data) : "") },
      { field: "action", headerName: "Then", width: 150, cellRenderer: (p: ICellRendererParams<Policy>) => <StatusBadge value={p.value} /> },
      {
        headerName: "",
        width: 100,
        sortable: false,
        cellRenderer: (p: ICellRendererParams<Policy>) => (
          <button className="btn btn-sm btn-ghost" onClick={() => api.deletePolicy(p.data!.id).then(onChange)}>
            Remove
          </button>
        ),
      },
    ],
    [onChange],
  );

  return (
    <div className="stack">
      <form className="policy-form" onSubmit={onParse}>
        <label htmlFor="policy-text">Add a rule in plain English</label>
        <div className="row">
          <input
            id="policy-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Never let the agent refund more than $200 without asking me"
          />
          <button className="btn btn-primary" disabled={busy || !text.trim()}>
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
            <button className="btn btn-primary" onClick={onSave}>Save rule</button>
            <button className="btn btn-ghost" onClick={() => setDraft(null)}>Discard</button>
          </div>
        </div>
      )}

      <div className="grid-wrap">
        <AgGridReact<Policy> theme={gridTheme} rowData={rows} columnDefs={columns} getRowId={(p) => p.data.id} tooltipShowDelay={300} />
      </div>
    </div>
  );
}
