import React from "react";
import { useAnalytics } from "../useAnalytics.js";
import { BarChart } from "../components/InteractiveCharts.jsx";

function money(v) { return `INR ${((Number(v) || 0) / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })}L`; }

export function StockMovement() {
  const { analytics, loading, error } = useAnalytics();
  if (loading) return <div style={{ padding: 32 }}>Loading…</div>;
  if (error) return <div style={{ padding: 32, color: "#C00000" }}>{error}</div>;

  const stockItems = analytics.stockItems || analytics.items || [];
  const totalInward = stockItems.reduce((s, it) => s + (it.inward || 0), 0);
  const totalOutward = stockItems.reduce((s, it) => s + (it.outward || it.netQty || 0), 0);
  const netMovement = totalInward - totalOutward;

  const top15Fast = [...stockItems].sort((a, b) => (b.outward || b.netQty || 0) - (a.outward || a.netQty || 0)).slice(0, 15);
  const fastBarData = top15Fast.map(it => [it.name.substring(0, 18), it.outward || it.netQty || 0]);

  return (
    <div style={{ padding: 24, background: "#F8F9FA", minHeight: "100vh" }}>
      <h1 style={{ color: "#1F497D", marginBottom: 20 }}>Stock Movement</h1>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total Inward (Purchase Net)", value: `${totalInward.toFixed(0)} units`, color: "#375623" },
          { label: "Total Outward (Sales Net)", value: `${totalOutward.toFixed(0)} units`, color: "#2E75B6" },
          { label: "Net Movement", value: `${netMovement.toFixed(0)} units`, color: netMovement >= 0 ? "#375623" : "#C00000" },
          { label: "Items Tracked", value: stockItems.length, color: "#1F497D" },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: "#fff", border: "1px solid #D6E4F0", borderRadius: 8, padding: "16px 24px", minWidth: 200 }}>
            <div style={{ fontSize: 13, color: "#666" }}>{kpi.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {fastBarData.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Top 15 Fast Movers (by Qty Sold)</h3>
          <BarChart rows={fastBarData} />
        </div>
      )}

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, overflowX: "auto" }}>
        <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Stock Movement Detail</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#1F497D", color: "#fff" }}>
              {["#", "Item", "Category", "Inward Qty", "Outward Qty", "Net Movement", "Avg Purchase Rate"].map(h => (
                <th key={h} style={{ padding: "7px 10px", textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stockItems.map((it, i) => {
              const inward = it.inward || 0;
              const outward = it.outward || it.netQty || 0;
              const net = inward - outward;
              return (
                <tr key={it.name} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                  <td style={{ padding: "6px 10px" }}>{i + 1}</td>
                  <td style={{ padding: "6px 10px", fontWeight: 500 }}>{it.name.substring(0, 30)}</td>
                  <td style={{ padding: "6px 10px", color: "#666" }}>{it.group || "—"}</td>
                  <td style={{ padding: "6px 10px", color: "#375623", fontWeight: 600 }}>{inward.toFixed(0)}</td>
                  <td style={{ padding: "6px 10px", color: "#2E75B6", fontWeight: 600 }}>{outward.toFixed(0)}</td>
                  <td style={{ padding: "6px 10px", color: net < 0 ? "#C00000" : "#1F1F1F", fontWeight: net < 0 ? 700 : 400 }}>{net.toFixed(0)}</td>
                  <td style={{ padding: "6px 10px" }}>INR {(it.avgPurchaseRate || 0).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
