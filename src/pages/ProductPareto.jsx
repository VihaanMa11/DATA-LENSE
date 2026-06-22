import React from "react";
import { useAnalytics } from "../useAnalytics.js";
import { SectionHead, Kpi, Card, Table, money, num } from "../components/ui.jsx";
import { BarChart } from "../components/InteractiveCharts.jsx";
import { ParetoChart } from "../components/ParetoChart.jsx";
import { PageState } from "./pageKit.jsx";

export function ProductPareto() {
  const { analytics, loading, error } = useAnalytics();
  return (
    <PageState loading={loading} error={error}>
      {analytics && <Body a={analytics} />}
    </PageState>
  );
}

function Body({ a }) {
  const items = a.items || [];
  const drive80 = items.filter(it => it.cumulativePct <= 80).length;
  const slow = items.filter(it => it.netQty > 0 && it.netQty < 10);
  const top20 = items.slice(0, 20).map(it => ({ label: it.name.slice(0, 16), value: it.netSales, cumulativePct: it.cumulativePct }));
  const categories = (a.itemGroupSales || []).slice(0, 12);
  const top10 = items.slice(0, 10);

  return (
    <section className="section active">
      <SectionHead code="PP" title="Product Pareto (80/20)" sub="Which products drive the bulk of revenue" />
      <div className="kpis">
        <Kpi title="Drive 80% Revenue" value={drive80} meta={`of ${items.length} products`} tone="#1976d2" />
        <Kpi title="Top Product" value={money(items[0]?.netSales || 0)} meta={items[0]?.name?.slice(0, 22) || "—"} tone="#2fd083" icon="money" />
        <Kpi title="Slow Movers" value={slow.length} meta="Sold < 10 units" tone="#f6a343" />
        <Kpi title="Categories" value={(a.itemGroupSales || []).length} meta="Item groups" tone="#f14f64" icon="box" />
      </div>
      <Card title="Product Pareto — Top 20" sub="Bars = net sales, line = cumulative %, dashed line = 80% threshold" badge="Pareto">
        <ParetoChart data={top20} barLabel="Net Sales" />
      </Card>
      <div className="grid2">
        <Card title="Category Revenue" sub="Net sales by item group" badge="Category" badgeClass="green"><BarChart rows={categories} /></Card>
        <Card title="Top 10 Products" sub="Rank, sales, quantity and cumulative %" badge="Top 10" badgeClass="cyan">
          <Table
            headers={["#", "Product", "Net Sales", "Qty", "Cumul %"]}
            rows={top10.map(it => [
              <span className="strong">{it.name.slice(0, 28)}</span>,
              <span className="money">{money(it.netSales)}</span>,
              num(it.netQty),
              <span style={{ color: it.cumulativePct <= 80 ? "#2fd083" : undefined, fontWeight: 600 }}>{it.cumulativePct.toFixed(1)}%</span>,
            ])}
          />
        </Card>
      </div>
    </section>
  );
}
