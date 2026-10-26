import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { api, money, time, type Approval } from "../api";
import { gridTheme } from "../grid";
import { StatusBadge } from "../StatusBadge";

export function ApprovalsView({ rows, onChange }: { rows: Approval[]; onChange: () => void }) {
  const columns = useMemo<ColDef<Approval>[]>(
    () => [
      { field: "createdAt", headerName: "Requested", width: 120, valueFormatter: (p) => time(p.value) },
      { field: "tool", headerName: "Tool", width: 200, cellClass: "mono" },
      { field: "amount", headerName: "Amount", width: 120, type: "rightAligned", cellClass: "mono", valueFormatter: (p) => money(p.value) },
      { field: "reason", headerName: "Why it was held", flex: 1, minWidth: 240, tooltipField: "reason" },
      { field: "status", headerName: "Status", width: 140, cellRenderer: (p: ICellRendererParams<Approval>) => <StatusBadge value={p.value} /> },
      {
        headerName: "",
        width: 190,
        sortable: false,
        cellRenderer: (p: ICellRendererParams<Approval>) =>
          p.data?.status === "pending" ? (
            <div className="row-actions">
              <button className="btn btn-sm btn-primary" onClick={() => api.resolve(p.data!.id, "approve").then(onChange)}>
                Approve
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => api.resolve(p.data!.id, "reject").then(onChange)}>
                Reject
              </button>
            </div>
          ) : null,
      },
    ],
    [onChange],
  );

  return (
    <div className="grid-wrap">
      <AgGridReact<Approval>
        theme={gridTheme}
        rowData={rows}
        columnDefs={columns}
        getRowId={(p) => p.data.id}
        overlayNoRowsTemplate="Nothing waiting on you. Calls held by a policy will show up here."
      />
    </div>
  );
}
