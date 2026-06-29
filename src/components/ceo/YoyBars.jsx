import React from "react";
import { money } from "../chartTheme.js";

// YoyBars — compact multi-FY bar rows for Top Customers / Top Products.
// rows: array of objects with { name|brand, perFy:{[fy]:number}, current, yoyPct }
// fyList: array of FY strings (up to 3)
// valueKey: "name" | "brand"
export function YoyBars({ rows, fyList, valueKey = "name" }) {
  if (!rows || rows.length === 0) {
    return <div className="empty">No data</div>;
  }

  // Find the max value across all rows × all FYs for normalisation
  let maxVal = 0;
  rows.forEach((row) => {
    fyList.forEach((fy) => {
      const v = Number((row.perFy || {})[fy]) || 0;
      if (v > maxVal) maxVal = v;
    });
  });

  const PALETTE = ["#2563eb", "#12b76a", "#f59e0b"];

  return (
    <div className="yoy-table">
      {rows.map((row, i) => {
        const label = row[valueKey] || row.name || row.brand || "—";
        const yoy = row.yoyPct;
        const tone = yoy == null ? "neu" : yoy >= 0 ? "up" : "dn";
        const yoyLabel = yoy == null ? "—" : `${yoy >= 0 ? "+" : ""}${Number(yoy).toFixed(1)}%`;

        return (
          <div key={i} className="yoy-row">
            <div className="yoy-label" title={label}>{label}</div>
            <div className="yoy-bars">
              {fyList.map((fy, fi) => {
                const val = Number((row.perFy || {})[fy]) || 0;
                const w = maxVal > 0 ? Math.max(2, Math.round((val / maxVal) * 100)) : 0;
                return (
                  <div
                    key={fy}
                    className="yb"
                    style={{ width: `${w}%`, background: PALETTE[fi % PALETTE.length] }}
                    title={`${fy}: ${money(val)}`}
                  />
                );
              })}
            </div>
            <div className="yoy-val">{money(row.current || 0)}</div>
            <span className={`delta ${tone}`}>{yoyLabel}</span>
          </div>
        );
      })}
    </div>
  );
}
