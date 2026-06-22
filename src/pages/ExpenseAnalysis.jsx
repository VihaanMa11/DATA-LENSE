import React from "react";
import { useAnalytics } from "../useAnalytics.js";
import { SectionHead, Kpi, Card, Table, money } from "../components/ui.jsx";
import { BarChart, DonutChart } from "../components/InteractiveCharts.jsx";
import { PageState } from "./pageKit.jsx";

export function ExpenseAnalysis() {
  const { analytics, loading, error } = useAnalytics();
  return (
    <PageState loading={loading} error={error}>
      {analytics && <Body a={analytics} />}
    </PageState>
  );
}

function Body({ a }) {
  const s = a.summary || {};
  const expenses = a.expenses || [];
  const topExp = expenses.slice(0, 15).map(e => [e.accountName, e.totalExpenses]);
  const groupRows = (a.expenseGroups || []).slice(0, 10);

  return (
    <section className="section active">
      <SectionHead code="EX" title="Expense Analysis" sub="Operating expenses vs sales (vendor settlements & control accounts excluded)" />
      <div className="kpis">
        <Kpi title="Total Expenses" value={money(s.totalExpenses)} meta={`${expenses.length} expense accounts`} tone="#f14f64" icon="card" />
        <Kpi title="Expense to Sales" value={`${s.expenseToSalesPct ?? 0}%`} meta="Lower is leaner" tone="#f6a343" />
        <Kpi title="Gross Profit" value={money(s.grossProfit)} meta={`${s.grossProfitPct ?? 0}% of net sales`} tone="#2fd083" icon="money" />
        <Kpi title="Net Operating Profit" value={money(s.netOperatingProfit)} meta="GP less expenses" tone={s.netOperatingProfit >= 0 ? "#2fd083" : "#f14f64"} />
      </div>
      <div className="grid2">
        <Card title="Top Expense Accounts" sub="Debit side of payment register" badge="Accounts" badgeClass="red"><BarChart rows={topExp} /></Card>
        <Card title="Expense by Group" sub="Share across expense groups" badge="Group" badgeClass="yellow"><DonutChart rows={groupRows} /></Card>
      </div>
      <Card title="Expense Detail" sub="Each expense account with its share of net sales" badge="Expenses">
        <Table
          headers={["#", "Account", "Group", "Amount", "% of Sales"]}
          rows={expenses.map(e => [
            <span className="strong">{e.accountName}</span>,
            e.group || "—",
            <span className="money">{money(e.totalExpenses)}</span>,
            `${s.totalNetSales ? ((e.totalExpenses / s.totalNetSales) * 100).toFixed(2) : "0.00"}%`,
          ])}
        />
      </Card>
    </section>
  );
}
