import { useState } from "react";
import { useAnalytics } from "../useAnalytics.js";

function money(v) { return `INR ${((Number(v) || 0) / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })}L`; }

function daysBg(days) {
  if (days <= 30) return "#d4edda";
  if (days <= 60) return "#fff3cd";
  if (days <= 90) return "#ffe0b2";
  return "#f8d7da";
}

export function CustomerAnalysis() {
  const { analytics, loading, error } = useAnalytics();
  const [riskFilter, setRiskFilter] = useState("All");

  if (loading) return <div style={{ padding: 32 }}>Loading…</div>;
  if (error) return <div style={{ padding: 32, color: "#C00000" }}>{error}</div>;

  const customers = analytics.customers || [];
  const riskFlags = ["All", "🔴 High Risk", "🟡 Medium Risk", "🟠 Watch", "🟢 Active"];
  const filtered = riskFilter === "All" ? customers : customers.filter(c => c.riskFlag === riskFilter);

  const highRiskCount = customers.filter(c => c.riskFlag === "🔴 High Risk").length;
  const platinumCount = customers.filter(c => c.tier === "🏅 Platinum").length;
  const activeCount = customers.filter(c => c.riskFlag === "🟢 Active").length;

  return (
    <div style={{ padding: 24, background: "#F8F9FA", minHeight: "100vh" }}>
      <h1 style={{ color: "#1F497D", marginBottom: 20 }}>Customer Analysis — Risk &amp; Ranking</h1>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "🔴 High Risk", value: highRiskCount, color: "#C00000" },
          { label: "🟢 Active", value: activeCount, color: "#375623" },
          { label: "🏅 Platinum", value: platinumCount, color: "#1F497D" },
          { label: "Total Customers", value: customers.length, color: "#2E75B6" },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: "#fff", border: "1px solid #D6E4F0", borderRadius: 8, padding: "16px 24px", minWidth: 160 }}>
            <div style={{ fontSize: 13, color: "#666" }}>{kpi.label}</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {riskFlags.map(flag => (
          <button
            key={flag}
            onClick={() => setRiskFilter(flag)}
            style={{
              padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 13,
              background: riskFilter === flag ? "#1F497D" : "#fff",
              color: riskFilter === flag ? "#fff" : "#1F497D",
              border: "1px solid #1F497D",
            }}
          >
            {flag}
          </button>
        ))}
        <span style={{ marginLeft: 8, alignSelf: "center", color: "#666", fontSize: 12 }}>{filtered.length} customers</span>
      </div>

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#1F497D", color: "#fff" }}>
              {["Rank", "Customer", "Net Sales", "Last Sale", "Days Since", "Active Mo.", "Score", "Risk", "Tier", "Collection %"].map(h => (
                <th key={h} style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={c.name} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                <td style={{ padding: "6px 10px", fontWeight: 700, color: "#2E75B6" }}>{c.rank}</td>
                <td style={{ padding: "6px 10px", fontWeight: 500, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</td>
                <td style={{ padding: "6px 10px", fontWeight: 600 }}>{money(c.netSales)}</td>
                <td style={{ padding: "6px 10px" }}>{c.lastSaleDate || "—"}</td>
                <td style={{ padding: "6px 10px", background: daysBg(c.daysSinceLastSale), fontWeight: 600 }}>{c.daysSinceLastSale === 9999 ? "—" : c.daysSinceLastSale}</td>
                <td style={{ padding: "6px 10px" }}>{c.activeMonths}</td>
                <td style={{ padding: "6px 10px", fontWeight: 700, color: c.score >= 60 ? "#375623" : c.score >= 30 ? "#C55A11" : "#C00000" }}>{c.score}</td>
                <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{c.riskFlag}</td>
                <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{c.tier}</td>
                <td style={{ padding: "6px 10px" }}>
                  <span style={{ color: c.collectionRate >= 85 ? "#375623" : c.collectionRate >= 60 ? "#C55A11" : "#C00000", fontWeight: 600 }}>
                    {c.collectionRate.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
