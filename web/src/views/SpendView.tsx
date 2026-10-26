import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import { money, type Spend } from "../api";
import { gridTheme } from "../grid";

export function SpendView({ spend }: { spend: Spend | null }) {
  const columns = useMemo<ColDef<Spend["byTool"][number]>[]>(
    () => [
      { field: "tool", headerName: "Tool", flex: 1, cellClass: "mono" },
      { field: "calls", headerName: "Calls today", width: 140, type: "rightAligned", cellClass: "mono" },
      { field: "amount", headerName: "Amount today", width: 160, type: "rightAligned", cellClass: "mono", valueFormatter: (p) => money(p.value) },
    ],
    [],
  );

  return (
    <div className="stack">
      <div className="caps">
        {(spend?.caps ?? []).map((cap) => {
          const pct = Math.min(100, (cap.used / cap.limit) * 100);
          return (
            <div key={cap.policyId} className="cap">
              <div className="cap-head">
                <span>{cap.name}</span>
                <span className="mono">
                  {money(cap.used)} / {money(cap.limit)}
                </span>
              </div>
              <div className="meter">
                <div className={`meter-fill ${pct >= 80 ? "meter-hot" : ""}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
        {spend && spend.caps.length === 0 && <p className="muted">No daily caps set. Add one on the Policies tab.</p>}
      </div>
      <div className="grid-wrap">
        <AgGridReact theme={gridTheme} rowData={spend?.byTool ?? []} columnDefs={columns} overlayNoRowsTemplate="No activity today." />
      </div>
    </div>
  );
}
