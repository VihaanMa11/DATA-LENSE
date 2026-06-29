import React from "react";
import { useAnalytics } from "../useAnalytics.js";
import { SectionHead, Kpi, Card, Table, money } from "../components/ui.jsx";
import { BarChart, LineChart } from "../components/InteractiveCharts.jsx";
import { PageState, MONTH_LABELS as FALLBACK_MONTH_LABELS, MONTH_ORDER as FALLBACK_MONTH_ORDER } from "./pageKit.jsx";
import { monthLabels } from "../fiscalYear.js";

export function VendorPayables() {
  const { analytics, loading, error } = useAnalytics();
  return (
    <PageState loading={loading} error={error}>
      {analytics && <Body a={analytics} />}
    </PageState>
  );
}

function Body({ a }) {
  const vendors = a.vendors || [];
  const s = a.summary || {};
  const topVendors = vendors.slice(0, 12).map(v => [v.name, v.netPurchase]);
  const monthly = a.monthly || [];
  const monthOrder = a.monthOrder?.length ? a.monthOrder : FALLBACK_MONTH_ORDER;
  const labels = { ...FALLBACK_MONTH_LABELS, ...monthLabels(monthOrder) };
  const MONTH_ORDER = monthOrder;
  const MONTH_LABELS = labels;
  const series = [
    { name: "Net Purchase", values: monthOrder.map(m => (monthly.find(x => x.month === m)?.purchase) || 0) },
    { name: "Payments", values: monthOrder.map(m => (monthly.find(x => x.month === m)?.payments) || 0) },
  ];
  const efficiency = s.totalNetPurchase ? ((vendors.reduce((t, v) => t + v.payments, 0) / s.totalNetPurchase) * 100).toFixed(1) : "0.0";

  return (
    <section className="section active">
      <SectionHead code="VP" title="Vendor & Payables" sub="Purchase concentration, payments and outstanding payables" />
      <div className="kpis">
        <Kpi title="Total Payable" value={money(s.totalPayable)} meta={`${vendors.length} vendors`} tone="#f14f64" icon="card" />
        <Kpi title="Net Purchase" value={money(s.totalNetPurchase)} meta="Gross less returns" tone="#1976d2" icon="box" />
        <Kpi title="Payments Made" value={money(vendors.reduce((t, v) => t + v.payments, 0))} meta="To vendor accounts" tone="#2fd083" icon="money" />
        <Kpi title="Payment Efficiency" value={`${efficiency}%`} meta="Payments ÷ net purchase" tone="#f6a343" />
      </div>
      <div className="grid2">
        <Card title="Top Vendors — Net Purchase" sub="Purchase less purchase returns" badge="Supplier" badgeClass="green"><BarChart rows={topVendors} /></Card>
        <Card title="Purchase vs Payments" sub="Monthly trend — drag to pan after zooming" badge="Trend"><LineChart series={series} months={MONTH_ORDER} labels={MONTH_LABELS} /></Card>
      </div>
      <Card title="Vendor Detail" sub="Purchase, returns, payments and net payable per vendor" badge="Payables" badgeClass="yellow">
        <Table
          headers={["#", "Vendor", "Gross Purchase", "Returns", "Net Purchase", "Payments", "Net Payable", "Return %"]}
          rows={vendors.map(v => [
            <span className="strong">{v.name}</span>,
            money(v.grossPurchase),
            money(v.purchaseReturn),
            <span className="money">{money(v.netPurchase)}</span>,
            money(v.payments),
            <span style={{ color: v.payable > 100000 ? "#f14f64" : undefined, fontWeight: v.payable > 100000 ? 700 : 400 }}>{money(Math.max(0, v.payable))}</span>,
            `${v.grossPurchase > 0 ? ((v.purchaseReturn / v.grossPurchase) * 100).toFixed(1) : "0.0"}%`,
          ])}
        />
      </Card>
    </section>
  );
}
