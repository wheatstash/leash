import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { money, time, type AuditEntry } from "../api";
import { gridTheme } from "../grid";
import { StatusBadge } from "../StatusBadge";

export function AuditView({ rows }: { rows: AuditEntry[] }) {
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
        headerName: "Details",
        width: 260,
        valueGetter: (p) => (p.data?.error ? `Error: ${p.data.error}` : JSON.stringify(p.data?.args)),
        tooltipValueGetter: (p) => JSON.stringify({ args: p.data?.args, result: p.data?.result }, null, 2),
        cellClass: "mono muted",
      },
    ],
    [],
  );

  return (
    <div className="grid-wrap">
      <AgGridReact<AuditEntry>
        theme={gridTheme}
        rowData={rows}
        columnDefs={columns}
        getRowId={(p) => p.data.id}
        tooltipShowDelay={300}
        overlayNoRowsTemplate="No tool calls yet. Every call the agent makes is recorded here."
      />
    </div>
  );
}
