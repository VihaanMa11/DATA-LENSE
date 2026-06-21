import { useAnalytics } from "../useAnalytics.js";
import { BarChart } from "../components/InteractiveCharts.jsx";

function money(v) { return `INR ${((Number(v) || 0) / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })}L`; }

export function CustomerReceivables() {
  const { analytics, loading, error } = useAnalytics();
  if (loading) return <div style={{ padding: 32 }}>Loading…</div>;
  if (error) return <div style={{ padding: 32, color: "#C00000" }}>{error}</div>;

  const customers = analytics.customers || [];
  const totalPending = customers.reduce((s, c) => s + c.pending, 0);
  const totalReceipts = customers.reduce((s, c) => s + c.receipts, 0);
  const totalNetSales = analytics.totalNetSales || 1;
  const avgCollRate = ((totalReceipts / totalNetSales) * 100).toFixed(1);

  const zoneMap = new Map();
  customers.forEach(c => {
    const g = c.group || "Other";
    zoneMap.set(g, (zoneMap.get(g) || 0) + c.pending);
  });
  const zoneData = [...zoneMap.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => [label, value]);

  return (
    <div style={{ padding: 24, background: "#F8F9FA", minHeight: "100vh" }}>
      <h1 style={{ color: "#1F497D", marginBottom: 20 }}>Customer &amp; Receivables</h1>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total Outstanding", value: money(totalPending), color: totalPending > 20000000 ? "#C00000" : "#1F497D" },
          { label: "Total Collected", value: money(totalReceipts), color: "#375623" },
          { label: "Avg Collection Rate", value: `${avgCollRate}%`, color: parseFloat(avgCollRate) >= 85 ? "#375623" : "#C55A11" },
          { label: "Total Customers", value: customers.length, color: "#1F497D" },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: "#fff", border: "1px solid #D6E4F0", borderRadius: 8, padding: "16px 24px", minWidth: 180 }}>
            <div style={{ fontSize: 13, color: "#666" }}>{kpi.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {zoneData.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Zone-wise Outstanding</h3>
          <BarChart rows={zoneData} />
        </div>
      )}

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, overflowX: "auto" }}>
        <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Customer Outstanding Detail</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#1F497D", color: "#fff" }}>
              {["#", "Customer", "Net Sales", "Receipts", "Pending", "Collection %"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {customers.map((c, i) => (
              <tr key={c.name} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                <td style={{ padding: "7px 12px" }}>{i + 1}</td>
                <td style={{ padding: "7px 12px", fontWeight: 500 }}>{c.name}</td>
                <td style={{ padding: "7px 12px" }}>{money(c.netSales)}</td>
                <td style={{ padding: "7px 12px", color: "#375623" }}>{money(c.receipts)}</td>
                <td style={{ padding: "7px 12px", color: c.pending > 100000 ? "#C00000" : "#1F1F1F", fontWeight: c.pending > 100000 ? 700 : 400 }}>{money(c.pending)}</td>
                <td style={{ padding: "7px 12px" }}>
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
