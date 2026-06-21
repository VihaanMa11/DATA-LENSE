import React from "react";
import { useState } from "react";
import { useAnalytics } from "../useAnalytics.js";

function money(v) { return `INR ${((Number(v) || 0) / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })}L`; }

export function ProductForecast() {
  const { analytics, loading, error } = useAnalytics();
  const [search, setSearch] = useState("");

  if (loading) return <div style={{ padding: 32 }}>Loading…</div>;
  if (error) return <div style={{ padding: 32, color: "#C00000" }}>{error}</div>;

  const items = analytics.items || [];
  const filtered = search
    ? items.filter(it => it.name.toLowerCase().includes(search.toLowerCase()) || (it.group || "").toLowerCase().includes(search.toLowerCase()))
    : items;

  const totalNetSales = analytics.totalNetSales || 1;
  const overallM1 = analytics.forecast?.m1 || 0;
  const top10 = items.slice(0, 10).map(it => ({
    ...it,
    forecastM1: Math.round((it.netSales / totalNetSales) * overallM1),
  }));

  return (
    <div style={{ padding: 24, background: "#F8F9FA", minHeight: "100vh" }}>
      <h1 style={{ color: "#1F497D", marginBottom: 20 }}>Product Forecast</h1>

      <div style={{ background: "#fff3cd", borderRadius: 8, padding: "12px 16px", marginBottom: 24, fontSize: 13, color: "#856404" }}>
        ⚠️ Product forecast requires minimum 3 months of sales history per item. Forecasts shown are proportional estimates based on overall sales trend.
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <input
          type="text"
          placeholder="Search items or category…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: "10px 14px", borderRadius: 6, border: "1px solid #D6E4F0", fontSize: 14 }}
        />
        <div style={{ alignSelf: "center", color: "#666", fontSize: 13 }}>{filtered.length} items</div>
      </div>

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, marginBottom: 24, overflowX: "auto" }}>
        <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Top 10 Items — Forecast M+1</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#1F497D", color: "#fff" }}>
              {["#", "Item", "Category", "YTD Net Sales", "Forecast M+1"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {top10.map((it, i) => (
              <tr key={it.name} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                <td style={{ padding: "7px 12px" }}>{i + 1}</td>
                <td style={{ padding: "7px 12px", fontWeight: 500 }}>{it.name}</td>
                <td style={{ padding: "7px 12px", color: "#666" }}>{it.group || "—"}</td>
                <td style={{ padding: "7px 12px", fontWeight: 600, color: "#2E75B6" }}>{money(it.netSales)}</td>
                <td style={{ padding: "7px 12px", fontWeight: 700, color: "#C55A11" }}>{money(it.forecastM1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, overflowX: "auto" }}>
        <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>All Items</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#2E75B6", color: "#fff" }}>
              {["#", "Item", "Category", "Net Sales", "Qty Sold"].map(h => (
                <th key={h} style={{ padding: "7px 10px", textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((it, i) => (
              <tr key={it.name} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                <td style={{ padding: "6px 10px" }}>{it.rank}</td>
                <td style={{ padding: "6px 10px" }}>{it.name.substring(0, 35)}</td>
                <td style={{ padding: "6px 10px", color: "#666" }}>{it.group || "—"}</td>
                <td style={{ padding: "6px 10px", fontWeight: 600 }}>{money(it.netSales)}</td>
                <td style={{ padding: "6px 10px" }}>{it.netQty.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
