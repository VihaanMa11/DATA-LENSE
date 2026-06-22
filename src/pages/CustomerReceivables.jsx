import React from "react";
import { useAnalytics } from "../useAnalytics.js";
import { SectionHead, Kpi, Card, Table, money } from "../components/ui.jsx";
import { BarChart } from "../components/InteractiveCharts.jsx";
import { PageState } from "./pageKit.jsx";

export function CustomerReceivables() {
  const { analytics, loading, error } = useAnalytics();
  return (
    <PageState loading={loading} error={error}>
      {analytics && <Body a={analytics} />}
    </PageState>
  );
}

function Body({ a }) {
  const customers = a.customers || [];
  const s = a.summary || {};
  const zoneRows = (a.receivablesByZone || []).slice(0, 12);
  const topPending = [...customers].sort((x, y) => y.pending - x.pending).slice(0, 12).map(c => [c.name, c.pending]);

  return (
    <section className="section active">
      <SectionHead code="CR" title="Customer & Receivables" sub="Outstanding, collection rate and ageing across customers" />
      <div className="kpis">
        <Kpi title="Total Receivable" value={money(s.totalReceivable)} meta={`${customers.length} customers`} tone="#f14f64" icon="card" />
        <Kpi title="Collected (Receipts)" value={money(s.totalReceipts)} meta="From receipt register" tone="#2fd083" icon="money" />
        <Kpi title="Collection Rate" value={`${s.totalNetSales ? ((s.totalReceipts / s.totalNetSales) * 100).toFixed(1) : "0.0"}%`} meta="Receipts ÷ net sales" tone="#1976d2" />
        <Kpi title="Net Sales" value={money(s.totalNetSales)} meta="Gross less returns" tone="#f6a343" icon="box" />
      </div>
      <div className="grid2">
        <Card title="Outstanding by Zone" sub="Pending collection grouped by account group" badge="Zone"><BarChart rows={zoneRows} /></Card>
        <Card title="Top Outstanding Customers" sub="Highest pending collection" badge="Pending" badgeClass="red"><BarChart rows={topPending} /></Card>
      </div>
      <Card title="Customer Outstanding Detail" sub="Net sales, receipts, pending and collection rate per customer" badge="Receivables" badgeClass="cyan">
        <Table
          headers={["#", "Customer", "Zone", "Station", "Net Sales", "Receipts", "Pending", "Collection %"]}
          rows={customers.map(c => [
            <span className="strong">{c.name}</span>,
            c.group || "—",
            c.station || "—",
            <span className="money">{money(c.netSales)}</span>,
            money(c.receipts),
            <span style={{ color: c.pending > 100000 ? "#f14f64" : undefined, fontWeight: c.pending > 100000 ? 700 : 400 }}>{money(c.pending)}</span>,
            <span style={{ color: c.collectionRate >= 85 ? "#2fd083" : c.collectionRate >= 60 ? "#f6a343" : "#f14f64", fontWeight: 600 }}>{c.collectionRate.toFixed(1)}%</span>,
          ])}
        />
      </Card>
    </section>
  );
}
