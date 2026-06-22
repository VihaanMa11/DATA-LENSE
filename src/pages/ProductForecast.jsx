import React, { useState } from "react";
import { useAnalytics } from "../useAnalytics.js";
import { SectionHead, Kpi, Card, Table, money, num } from "../components/ui.jsx";
import { BarChart } from "../components/InteractiveCharts.jsx";
import { PageState } from "./pageKit.jsx";

export function ProductForecast() {
  const { analytics, loading, error } = useAnalytics();
  return (
    <PageState loading={loading} error={error}>
      {analytics && <Body a={analytics} />}
    </PageState>
  );
}

function Body({ a }) {
  const [search, setSearch] = useState("");
  const items = a.items || [];
  const total = a.totalNetSales || 1;
  const overallM1 = a.forecast?.m1 || 0;

  // Item-level forecast: share of overall projected sales by current contribution.
  const withForecast = items.map(it => ({ ...it, forecastM1: Math.round((it.netSales / total) * overallM1) }));
  const filtered = search
    ? withForecast.filter(it => it.name.toLowerCase().includes(search.toLowerCase()) || (it.group || "").toLowerCase().includes(search.toLowerCase()))
    : withForecast;
  const top10 = [...withForecast].sort((x, y) => y.forecastM1 - x.forecastM1).slice(0, 10);
  const top10Bar = top10.map(it => [it.name.slice(0, 18), it.forecastM1]);

  return (
    <section className="section active">
      <SectionHead code="PF" title="Product Forecast — Next Month" sub="Item-level projection weighted by current revenue share" />
      <div className="kpis">
        <Kpi title="Projected Sales" value={money(overallM1)} meta="Next month, all items" tone="#f6a343" icon="money" />
        <Kpi title="Products Tracked" value={items.length} meta="With sales this year" tone="#1976d2" icon="box" />
        <Kpi title="Top Product M+1" value={money(top10[0]?.forecastM1 || 0)} meta={top10[0]?.name?.slice(0, 20) || "—"} tone="#2fd083" />
        <Kpi title="Categories" value={(a.itemGroupSales || []).length} meta="Item groups" tone="#f14f64" />
      </div>
      <Card title="Top 10 Products — Next Month Forecast" sub="Expected revenue by item" badge="Forecast"><BarChart rows={top10Bar} /></Card>
      <Card title="Product Forecast Detail" sub="Search to filter by item or category" badge="Detail" badgeClass="cyan">
        <div className="risk-filter">
          <input className="page-search" placeholder="Search items or category…" value={search} onChange={e => setSearch(e.target.value)} />
          <span className="chip-count">{filtered.length} items</span>
        </div>
        <Table
          headers={["#", "Product", "Category", "YTD Net Sales", "Qty Sold", "Forecast M+1"]}
          rows={filtered.slice(0, 200).map(it => [
            <span className="strong">{it.name.slice(0, 28)}</span>,
            it.group || "—",
            <span className="money">{money(it.netSales)}</span>,
            num(it.netQty),
            <span style={{ color: "#f6a343", fontWeight: 700 }}>{money(it.forecastM1)}</span>,
          ])}
        />
      </Card>
    </section>
  );
}
