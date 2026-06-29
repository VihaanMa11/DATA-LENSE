import React from "react";
import { useAnalytics } from "../useAnalytics.js";
import { SectionHead, Kpi, Card, Table, money, num } from "../components/ui.jsx";
import { BarChart } from "../components/InteractiveCharts.jsx";
import { PageState } from "./pageKit.jsx";

export function StockMovement() {
  const { analytics, loading, error } = useAnalytics();
  return (
    <PageState loading={loading} error={error}>
      {analytics && <Body a={analytics} />}
    </PageState>
  );
}

function Body({ a }) {
  const s = a.summary || {};
  const stock = a.stockItems || [];
  const dead = a.deadStock || [];
  const fast = [...stock].sort((x, y) => y.outward - x.outward).slice(0, 15).map(it => [it.name.slice(0, 18), it.outward]);
  const byValue = [...stock].sort((x, y) => y.closingValue - x.closingValue).slice(0, 15).map(it => [it.name.slice(0, 18), Math.max(0, it.closingValue)]);
  const totalInward = stock.reduce((t, it) => t + it.inward, 0);
  const totalOutward = stock.reduce((t, it) => t + it.outward, 0);

  return (
    <section className="section active">
      <SectionHead code="SM" title="Stock Movement" sub="Opening, inward, outward, closing and value — opening stock from item master" />
      <div className="kpis">
        <Kpi title="Closing Stock Value" value={money(s.closingStockValue)} meta="At avg purchase rate" tone="#1976d2" icon="box" />
        <Kpi title="Total Inward" value={`${num(totalInward)} units`} meta="Purchases net of returns" tone="#2fd083" icon="money" />
        <Kpi title="Total Outward" value={`${num(totalOutward)} units`} meta="Sales net of returns" tone="#f6a343" />
        <Kpi title="Dead Stock Lines" value={dead.length} meta="In stock, no sales" tone="#f14f64" icon="card" />
      </div>
      <div className="grid2">
        <Card title="Fast Movers" sub="Top items by quantity sold" badge="Fast" badgeClass="green"><BarChart rows={fast} /></Card>
        <Card title="Highest Stock Value" sub="Closing value at risk of lock-up" badge="Value" badgeClass="cyan"><BarChart rows={byValue} /></Card>
      </div>
      <Card title="Stock Movement Detail" sub="Per item opening, inward, outward, closing and value" badge="Stock">
        <Table
          headers={["#", "Item", "Group", "Opening", "Inward", "Outward", "Closing", "Avg Rate", "Closing Value"]}
          rows={stock.slice(0, 200).map(it => [
            <span className="strong">{it.name.slice(0, 26)}</span>,
            it.group || "—",
            num(it.openingStock),
            <span style={{ color: "#2fd083" }}>{num(it.inward)}</span>,
            <span style={{ color: "#1976d2" }}>{num(it.outward)}</span>,
            <span style={{ color: it.closingQty < 0 ? "#f14f64" : undefined, fontWeight: it.closingQty < 0 ? 700 : 400 }}>{num(it.closingQty)}</span>,
            `₹${it.avgPurchaseRate.toFixed(0)}`,
            <span className="money">{money(Math.max(0, it.closingValue))}</span>,
          ])}
        />
      </Card>
      {dead.length > 0 && (
        <Card title="Dead Stock (Risk)" sub="Items holding stock with no sales this year" badge="Dead Stock" badgeClass="red">
          <Table
            headers={["#", "Item", "Group", "Closing Qty", "Closing Value"]}
            rows={dead.slice(0, 30).map(it => [
              <span className="strong">{it.name.slice(0, 30)}</span>,
              it.group || "—",
              num(it.closingQty),
              <span className="money">{money(Math.max(0, it.closingValue))}</span>,
            ])}
          />
        </Card>
      )}
    </section>
  );
}
