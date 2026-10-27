import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { money, time, type AuditEntry } from "../api";
import { gridTheme } from "../grid";
import { StatusBadge } from "../StatusBadge";
import { useOpenTrace } from "../traceContext";
import { xray } from "../xray";

/** One-line summary of how far a call got, for the Trace column. */
function traceSummary(e: AuditEntry | undefined): string {
  if (!e) return "";
  if (e.status === "blocked" || e.status === "rejected") return "stopped at policy";
  if (e.status === "pending_approval") return "held at policy";
  const p = e.trace?.paypal;
  if (!p) return "";
  if (p.mock) return "mock PayPal";
  const api = p.calls.filter((c) => !c.url.includes("/oauth2/"));
  return `${api.length} PayPal call${api.length === 1 ? "" : "s"} · ${p.ms} ms`;
}

export function AuditView({ rows }: { rows: AuditEntry[] }) {
  const openTrace = useOpenTrace();
  const columns = useMemo<ColDef<AuditEntry>[]>(
    () => [
      { field: "timestamp", headerName: "Time", width: 110, valueFormatter: (p) => time(p.value), sort: "desc" },
      { field: "tool", headerName: "Tool", width: 210, cellClass: "mono", filter: true },
      { field: "amount", headerName: "Amount", width: 110, type: "rightAligned", cellClass: "mono", valueFormatter: (p) => money(p.value) },
      { field: "decision", headerName: "Policy", width: 140, cellRenderer: (p: ICellRendererParams<AuditEntry>) => <StatusBadge value={p.value} /> },
      { field: "status", headerName: "Outcome", width: 160, filter: true, cellRenderer: (p: ICellRendererParams<AuditEntry>) => <StatusBadge value={p.value} /> },
      { field: "reason", headerName: "Reason", flex: 1, minWidth: 220, tooltipField: "reason" },
      { field: "source", headerName: "Source", width: 100 },
      {
        headerName: "Trace",
        width: 210,
        sortable: false,
        valueGetter: (p) => traceSummary(p.data),
        cellRenderer: (p: ICellRendererParams<AuditEntry>) => (
          <span className="trace-cell">
            <span className="muted">{p.value}</span>
            <span className="trace-link">View ›</span>
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="grid-wrap" {...xray("aggrid", "AG Grid Community · audit log, live every 2 s · click a row")}>
      <AgGridReact<AuditEntry>
        theme={gridTheme}
        rowData={rows}
        columnDefs={columns}
        getRowId={(p) => p.data.id}
        onRowClicked={(e) => e.data && openTrace(e.data.id)}
        rowClass="row-clickable"
        tooltipShowDelay={300}
        overlayNoRowsTemplate="No tool calls yet. Every call the agent makes is recorded here."
      />
    </div>
  );
}
