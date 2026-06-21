import { useAnalytics } from "../useAnalytics.js";
import { LineChart } from "../components/InteractiveCharts.jsx";

const MONTH_LABELS = { "2025-04":"Apr","2025-05":"May","2025-06":"Jun","2025-07":"Jul","2025-08":"Aug","2025-09":"Sep","2025-10":"Oct","2025-11":"Nov","2025-12":"Dec","2026-01":"Jan","2026-02":"Feb","2026-03":"Mar" };
const FY_ORDER = ["2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"];

function money(v) { return `INR ${((Number(v) || 0) / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })}L`; }

export function SalesForecast() {
  const { analytics, loading, error } = useAnalytics();
  if (loading) return <div style={{ padding: 32 }}>Loading…</div>;
  if (error) return <div style={{ padding: 32, color: "#C00000" }}>{error}</div>;

  const forecast = analytics.forecast || { m1: 0, m2: 0, m3: 0 };
  const trend = analytics.monthlyTrend || [];
  const activeTrend = trend.filter(t => t.sales > 0);
  const chartMonths = activeTrend.map(t => t.month);
  const chartSeries = [{ name: "Net Sales", values: activeTrend.map(t => t.sales) }];

  const lastDataMonth = trend.filter(t => t.sales > 0).pop()?.month;
  const lastIdx = FY_ORDER.indexOf(lastDataMonth);
  const nextMonths = FY_ORDER.slice(lastIdx + 1, lastIdx + 4);
  const nextLabels = nextMonths.map(m => MONTH_LABELS[m] || m);

  return (
    <div style={{ padding: 24, background: "#F8F9FA", minHeight: "100vh" }}>
      <h1 style={{ color: "#1F497D", marginBottom: 20 }}>Sales Forecast — 3 Month Outlook</h1>

      <div style={{ background: "#D6E4F0", borderRadius: 8, padding: "12px 16px", marginBottom: 24, fontSize: 13, color: "#1F497D" }}>
        Forecast uses linear regression (least-squares method) on monthly FY data. Requires ≥3 months of data.
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: `Forecast ${nextLabels[0] || "M+1"}`, value: money(forecast.m1) },
          { label: `Forecast ${nextLabels[1] || "M+2"}`, value: money(forecast.m2) },
          { label: `Forecast ${nextLabels[2] || "M+3"}`, value: money(forecast.m3) },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: "#fff", border: "2px solid #C55A11", borderRadius: 8, padding: "16px 28px", minWidth: 200 }}>
            <div style={{ fontSize: 13, color: "#666" }}>{kpi.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#C55A11" }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {chartMonths.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Monthly Sales Trend (Actual)</h3>
          <LineChart series={chartSeries} months={chartMonths} labels={MONTH_LABELS} />
        </div>
      )}

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, overflowX: "auto" }}>
        <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Actual vs Forecast</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#1F497D", color: "#fff" }}>
              {["Month", "Sales / Forecast", "Type"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trend.filter(t => t.sales > 0).map((t, i) => (
              <tr key={t.month} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                <td style={{ padding: "7px 12px" }}>{MONTH_LABELS[t.month] || t.month}</td>
                <td style={{ padding: "7px 12px", fontWeight: 600, color: "#2E75B6" }}>{money(t.sales)}</td>
                <td style={{ padding: "7px 12px", color: "#375623" }}>✅ Actual</td>
              </tr>
            ))}
            {[forecast.m1, forecast.m2, forecast.m3].map((val, i) => nextLabels[i] ? (
              <tr key={`f${i}`} style={{ background: i % 2 === 0 ? "#fff3e0" : "#ffe0b2" }}>
                <td style={{ padding: "7px 12px" }}>{nextLabels[i]} (Forecast)</td>
                <td style={{ padding: "7px 12px", fontWeight: 600, color: "#C55A11" }}>{money(val)}</td>
                <td style={{ padding: "7px 12px", color: "#C55A11" }}>📈 Projected</td>
              </tr>
            ) : null)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
