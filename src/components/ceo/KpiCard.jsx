import React from "react";

// KpiCard — a CEO cockpit metric tile.
// deltaTone: "up"|"dn"|"neu"
export function KpiCard({ label, value, delta, deltaTone = "neu", context }) {
  return (
    <div className="ceo-kpi">
      <div className="kpi-l">{label}</div>
      <div className="kpi-v">{value}</div>
      {delta != null && (
        <span className={`delta ${deltaTone}`}>{delta}</span>
      )}
      {context && <div className="kpi-prev">{context}</div>}
    </div>
  );
}
