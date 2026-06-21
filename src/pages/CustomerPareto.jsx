import React from "react";
import { useAnalytics } from "../useAnalytics.js";
import { ParetoChart } from "../components/ParetoChart.jsx";

function money(v) { return `INR ${((Number(v) || 0) / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })}L`; }

export function CustomerPareto() {
  const { analytics, loading, error } = useAnalytics();
  if (loading) return <div style={{ padding: 32 }}>Loading…</div>;
  if (error) return <div style={{ padding: 32, color: "#C00000" }}>{error}</div>;

  const customers = analytics.customers || [];
  const top20 = customers.slice(0, 20);
  const top10 = customers.slice(0, 10);
  const drive80Count = customers.filter(c => c.cumulativePct <= 80).length;

  const paretoData = top20.map(c => ({
    label: c.name.substring(0, 18),
    value: c.netSales,
    cumulativePct: c.cumulativePct,
  }));

  return (
    <div style={{ padding: 24, background: "#F8F9FA", minHeight: "100vh" }}>
      <h1 style={{ color: "#1F497D", marginBottom: 20 }}>Customer Pareto Analysis</h1>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ background: "#fff", border: "1px solid #D6E4F0", borderRadius: 8, padding: "16px 24px", minWidth: 220 }}>
          <div style={{ fontSize: 13, color: "#666" }}>Customers driving 80% revenue</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: "#1F497D" }}>{drive80Count}</div>
          <div style={{ fontSize: 12, color: "#888" }}>out of {customers.length} total</div>
        </div>
        {customers[0] && (
          <div style={{ background: "#fff", border: "1px solid #D6E4F0", borderRadius: 8, padding: "16px 24px", minWidth: 220 }}>
            <div style={{ fontSize: 13, color: "#666" }}>Top Customer</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#2E75B6" }}>{customers[0].name}</div>
            <div style={{ fontSize: 15, color: "#375623", fontWeight: 600 }}>{money(customers[0].netSales)}</div>
          </div>
        )}
      </div>

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <ParetoChart data={paretoData} title="Customer Pareto (Top 20)" barLabel="Net Sales" />
      </div>

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, overflowX: "auto" }}>
        <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Top 10 Customers</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#1F497D", color: "#fff" }}>
              {["Rank", "Customer", "Net Sales", "Sales %", "Cumulative %"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {top10.map((c, i) => (
              <tr key={c.name} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                <td style={{ padding: "7px 12px", fontWeight: 700, color: "#2E75B6" }}>{c.rank}</td>
                <td style={{ padding: "7px 12px", fontWeight: 500 }}>{c.name}</td>
                <td style={{ padding: "7px 12px", fontWeight: 600 }}>{money(c.netSales)}</td>
                <td style={{ padding: "7px 12px" }}>
                  {analytics.totalNetSales > 0 ? ((c.netSales / analytics.totalNetSales) * 100).toFixed(1) : "0.0"}%
                </td>
                <td style={{ padding: "7px 12px", color: c.cumulativePct <= 80 ? "#375623" : "#1F1F1F", fontWeight: 600 }}>
                  {c.cumulativePct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
