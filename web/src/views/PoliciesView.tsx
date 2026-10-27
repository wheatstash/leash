import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { api, type Policy } from "../api";
import { gridTheme } from "../grid";
import { StatusBadge } from "../StatusBadge";
import { conditions, PolicyComposer } from "./PolicyComposer";
import { xray } from "../xray";

export function PoliciesView({ rows, onChange }: { rows: Policy[]; onChange: () => void }) {
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
        width: 110,
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
      <PolicyComposer onSaved={onChange} />
      <div className="grid-wrap" {...xray("aggrid", "AG Grid · rules checked on every call; most restrictive wins")}>
        <AgGridReact<Policy> theme={gridTheme} rowData={rows} columnDefs={columns} getRowId={(p) => p.data.id} tooltipShowDelay={300} />
      </div>
    </div>
  );
}
