import { useAnalytics } from "../useAnalytics.js";
import { ParetoChart } from "../components/ParetoChart.jsx";

function money(v) { return `INR ${((Number(v) || 0) / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })}L`; }

export function ProductPareto() {
  const { analytics, loading, error } = useAnalytics();
  if (loading) return <div style={{ padding: 32 }}>Loading…</div>;
  if (error) return <div style={{ padding: 32, color: "#C00000" }}>{error}</div>;

  const items = analytics.items || [];
  const top20 = items.slice(0, 20);
  const top10 = items.slice(0, 10);
  const drive80Count = items.filter(it => it.cumulativePct <= 80).length;
  const slowMovers = items.filter(it => it.netQty > 0 && it.netQty < 10);

  const paretoData = top20.map(it => ({
    label: it.name.substring(0, 18),
    value: it.netSales,
    cumulativePct: it.cumulativePct,
  }));

  return (
    <div style={{ padding: 24, background: "#F8F9FA", minHeight: "100vh" }}>
      <h1 style={{ color: "#1F497D", marginBottom: 20 }}>Product Pareto Analysis</h1>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ background: "#fff", border: "1px solid #D6E4F0", borderRadius: 8, padding: "16px 24px", minWidth: 220 }}>
          <div style={{ fontSize: 13, color: "#666" }}>Products driving 80% revenue</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: "#1F497D" }}>{drive80Count}</div>
          <div style={{ fontSize: 12, color: "#888" }}>out of {items.length} total</div>
        </div>
        {items[0] && (
          <div style={{ background: "#fff", border: "1px solid #D6E4F0", borderRadius: 8, padding: "16px 24px", minWidth: 220 }}>
            <div style={{ fontSize: 13, color: "#666" }}>Top Product</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#2E75B6" }}>{items[0].name}</div>
            <div style={{ fontSize: 15, color: "#375623", fontWeight: 600 }}>{money(items[0].netSales)}</div>
          </div>
        )}
        <div style={{ background: "#fff", border: "1px solid #D6E4F0", borderRadius: 8, padding: "16px 24px", minWidth: 180 }}>
          <div style={{ fontSize: 13, color: "#666" }}>Slow Mover Risk</div>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#C55A11" }}>{slowMovers.length}</div>
          <div style={{ fontSize: 12, color: "#888" }}>items with &lt;10 units sold</div>
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <ParetoChart data={paretoData} title="Product Pareto (Top 20)" barLabel="Net Sales" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "#fff", borderRadius: 8, padding: 16, overflowX: "auto" }}>
          <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Top 10 Products</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#1F497D", color: "#fff" }}>
                {["#", "Item", "Net Sales", "Qty", "Cumul %"].map(h => (
                  <th key={h} style={{ padding: "6px 8px", textAlign: "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {top10.map((it, i) => (
                <tr key={it.name} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                  <td style={{ padding: "6px 8px", fontWeight: 700, color: "#2E75B6" }}>{it.rank}</td>
                  <td style={{ padding: "6px 8px" }}>{it.name.substring(0, 22)}</td>
                  <td style={{ padding: "6px 8px", fontWeight: 600 }}>{money(it.netSales)}</td>
                  <td style={{ padding: "6px 8px" }}>{it.netQty.toFixed(0)}</td>
                  <td style={{ padding: "6px 8px", color: it.cumulativePct <= 80 ? "#375623" : "#1F1F1F", fontWeight: 600 }}>{it.cumulativePct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ background: "#fff", borderRadius: 8, padding: 16, overflowX: "auto" }}>
          <h3 style={{ color: "#C55A11", margin: "0 0 12px" }}>Slow Movers (Risk)</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#C55A11", color: "#fff" }}>
                {["Item", "Qty Sold"].map(h => (
                  <th key={h} style={{ padding: "6px 8px", textAlign: "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slowMovers.slice(0, 15).map((it, i) => (
                <tr key={it.name} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                  <td style={{ padding: "6px 8px" }}>{it.name.substring(0, 30)}</td>
                  <td style={{ padding: "6px 8px", fontWeight: 600 }}>{it.netQty.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
