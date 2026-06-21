import { useAnalytics } from "../useAnalytics.js";
import { BarChart } from "../components/InteractiveCharts.jsx";

function money(v) { return `INR ${((Number(v) || 0) / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })}L`; }

export function ExpenseAnalysis() {
  const { analytics, loading, error } = useAnalytics();
  if (loading) return <div style={{ padding: 32 }}>Loading…</div>;
  if (error) return <div style={{ padding: 32, color: "#C00000" }}>{error}</div>;

  const expenses = analytics.expenses || [];
  const totalExpenses = expenses.reduce((s, e) => s + e.totalExpenses, 0);
  const totalNetSales = analytics.totalNetSales || 1;
  const expToSalesPct = ((totalExpenses / totalNetSales) * 100).toFixed(1);
  const netOperatingProfit = totalNetSales - totalExpenses;

  const barData = expenses.slice(0, 15).map(e => ({ label: e.accountName.substring(0, 20), value: e.totalExpenses }));

  return (
    <div style={{ padding: 24, background: "#F8F9FA", minHeight: "100vh" }}>
      <h1 style={{ color: "#1F497D", marginBottom: 20 }}>Expense Analysis</h1>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total Expenses", value: money(totalExpenses), color: "#C00000" },
          { label: "Expense to Sales %", value: `${expToSalesPct}%`, color: parseFloat(expToSalesPct) > 20 ? "#C00000" : "#C55A11" },
          { label: "Net Operating Profit", value: money(netOperatingProfit), color: netOperatingProfit > 0 ? "#375623" : "#C00000" },
          { label: "Expense Categories", value: expenses.length, color: "#1F497D" },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: "#fff", border: "1px solid #D6E4F0", borderRadius: 8, padding: "16px 24px", minWidth: 200 }}>
            <div style={{ fontSize: 13, color: "#666" }}>{kpi.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {barData.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Top 15 Expense Categories</h3>
          <BarChart data={barData} color="#C00000" />
        </div>
      )}

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, overflowX: "auto" }}>
        <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Expense Detail</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#1F497D", color: "#fff" }}>
              {["#", "Account / Category", "Amount", "% of Sales"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {expenses.map((e, i) => {
              const pctSales = ((e.totalExpenses / totalNetSales) * 100).toFixed(2);
              return (
                <tr key={e.accountName} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                  <td style={{ padding: "7px 12px" }}>{i + 1}</td>
                  <td style={{ padding: "7px 12px", fontWeight: 500 }}>{e.accountName}</td>
                  <td style={{ padding: "7px 12px", fontWeight: 600 }}>{money(e.totalExpenses)}</td>
                  <td style={{ padding: "7px 12px", color: parseFloat(pctSales) > 5 ? "#C55A11" : "#1F1F1F" }}>{pctSales}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
