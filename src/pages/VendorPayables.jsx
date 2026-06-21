import { useAnalytics } from "../useAnalytics.js";
import { BarChart } from "../components/InteractiveCharts.jsx";

function money(v) { return `INR ${((Number(v) || 0) / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })}L`; }

export function VendorPayables() {
  const { analytics, loading, error } = useAnalytics();
  if (loading) return <div style={{ padding: 32 }}>Loading…</div>;
  if (error) return <div style={{ padding: 32, color: "#C00000" }}>{error}</div>;

  const vendors = analytics.vendors || [];
  const top10 = vendors.slice(0, 10);
  const totalPayable = vendors.reduce((s, v) => s + Math.max(0, v.payable), 0);
  const totalPurchase = vendors.reduce((s, v) => s + v.netPurchase, 0);
  const totalPayments = vendors.reduce((s, v) => s + v.payments, 0);
  const paymentEfficiency = totalPurchase > 0 ? ((totalPayments / totalPurchase) * 100).toFixed(1) : "0.0";

  const barData = top10.map(v => ({ label: v.name.substring(0, 20), value: v.netPurchase }));

  return (
    <div style={{ padding: 24, background: "#F8F9FA", minHeight: "100vh" }}>
      <h1 style={{ color: "#1F497D", marginBottom: 20 }}>Vendor &amp; Payables</h1>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total Payable", value: money(totalPayable), color: "#C00000" },
          { label: "Total Purchase", value: money(totalPurchase), color: "#1F497D" },
          { label: "Payments Made", value: money(totalPayments), color: "#375623" },
          { label: "Payment Efficiency", value: `${paymentEfficiency}%`, color: "#2E75B6" },
          { label: "Active Vendors", value: vendors.length, color: "#1F497D" },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: "#fff", border: "1px solid #D6E4F0", borderRadius: 8, padding: "16px 24px", minWidth: 180 }}>
            <div style={{ fontSize: 13, color: "#666" }}>{kpi.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {barData.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Top 10 Vendors by Net Purchase</h3>
          <BarChart data={barData} color="#2E75B6" />
        </div>
      )}

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, overflowX: "auto" }}>
        <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Vendor Detail</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#1F497D", color: "#fff" }}>
              {["#", "Vendor", "Gross Purchase", "Returns", "Net Purchase", "Payments Made", "Net Payable", "Return %"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vendors.map((v, i) => {
              const returnRate = v.grossPurchase > 0 ? ((v.purchaseReturn / v.grossPurchase) * 100).toFixed(1) : "0.0";
              return (
                <tr key={v.name} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                  <td style={{ padding: "7px 12px" }}>{i + 1}</td>
                  <td style={{ padding: "7px 12px", fontWeight: 500 }}>{v.name}</td>
                  <td style={{ padding: "7px 12px" }}>{money(v.grossPurchase)}</td>
                  <td style={{ padding: "7px 12px", color: "#C55A11" }}>{money(v.purchaseReturn)}</td>
                  <td style={{ padding: "7px 12px", fontWeight: 600 }}>{money(v.netPurchase)}</td>
                  <td style={{ padding: "7px 12px", color: "#375623" }}>{money(v.payments)}</td>
                  <td style={{ padding: "7px 12px", color: v.payable > 100000 ? "#C00000" : "#1F1F1F", fontWeight: v.payable > 100000 ? 700 : 400 }}>{money(Math.max(0, v.payable))}</td>
                  <td style={{ padding: "7px 12px" }}>{returnRate}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
