import React from "react";
import { useAnalytics } from "../useAnalytics.js";
import { SectionHead, Kpi, Card, Table, money } from "../components/ui.jsx";
import { DonutChart } from "../components/InteractiveCharts.jsx";
import { ParetoChart } from "../components/ParetoChart.jsx";
import { PageState } from "./pageKit.jsx";

export function CustomerPareto() {
  const { analytics, loading, error } = useAnalytics();
  return (
    <PageState loading={loading} error={error}>
      {analytics && <Body a={analytics} />}
    </PageState>
  );
}

function Body({ a }) {
  const customers = a.customers || [];
  const total = a.totalNetSales || 1;
  const drive80 = customers.filter(c => c.cumulativePct <= 80).length;
  const top20 = customers.slice(0, 20).map(c => ({ label: c.name.slice(0, 16), value: c.netSales, cumulativePct: c.cumulativePct }));
  const zoneRows = (a.customerZones || []).slice(0, 8);
  const top10 = customers.slice(0, 10);

  return (
    <section className="section active">
      <SectionHead code="CP" title="Customer Pareto (80/20)" sub="Which customers drive the bulk of revenue" />
      <div className="kpis">
        <Kpi title="Drive 80% Revenue" value={drive80} meta={`of ${customers.length} customers`} tone="#1976d2" />
        <Kpi title="Concentration" value={`${((drive80 / Math.max(customers.length, 1)) * 100).toFixed(0)}%`} meta="Customers making 80% sales" tone="#f6a343" />
        <Kpi title="Top Customer" value={money(customers[0]?.netSales || 0)} meta={customers[0]?.name || "—"} tone="#2fd083" icon="money" />
        <Kpi title="Total Net Sales" value={money(total)} meta="All customers" tone="#f14f64" icon="box" />
      </div>
      <Card title="Customer Pareto — Top 20" sub="Bars = net sales, line = cumulative %, dashed line = 80% threshold" badge="Pareto">
        <ParetoChart data={top20} barLabel="Net Sales" />
      </Card>
      <div className="grid2">
        <Card title="Zone Contribution" sub="Net sales share by account group" badge="Zone" badgeClass="green"><DonutChart rows={zoneRows} /></Card>
        <Card title="Top 10 Customers" sub="Rank, sales, share and cumulative %" badge="Top 10" badgeClass="cyan">
          <Table
            headers={["#", "Customer", "Net Sales", "Share %", "Cumulative %"]}
            rows={top10.map(c => [
              <span className="strong">{c.name}</span>,
              <span className="money">{money(c.netSales)}</span>,
              `${((c.netSales / total) * 100).toFixed(1)}%`,
              <span style={{ color: c.cumulativePct <= 80 ? "#2fd083" : undefined, fontWeight: 600 }}>{c.cumulativePct.toFixed(1)}%</span>,
            ])}
          />
        </Card>
      </div>
    </section>
  );
}
