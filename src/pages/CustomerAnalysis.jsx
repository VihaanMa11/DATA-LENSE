import React, { useState } from "react";
import { useAnalytics } from "../useAnalytics.js";
import { SectionHead, Kpi, Card, Table, money } from "../components/ui.jsx";
import { DonutChart } from "../components/InteractiveCharts.jsx";
import { ScatterPlot } from "../components/ScatterPlot.jsx";
import { PageState } from "./pageKit.jsx";

const RISK_FLAGS = ["All", "🔴 High Risk", "🟡 Medium Risk", "🟠 Watch", "🟢 Active"];

export function CustomerAnalysis() {
  const { analytics, loading, error } = useAnalytics();
  return (
    <PageState loading={loading} error={error}>
      {analytics && <Body a={analytics} />}
    </PageState>
  );
}

function Body({ a }) {
  const [risk, setRisk] = useState("All");
  const customers = a.customers || [];
  const filtered = risk === "All" ? customers : customers.filter(c => c.riskFlag === risk);

  const highRisk = customers.filter(c => c.riskFlag === "🔴 High Risk").length;
  const active = customers.filter(c => c.riskFlag === "🟢 Active").length;
  const platinum = customers.filter(c => c.tier === "🏅 Platinum").length;

  const tierCounts = {};
  customers.forEach(c => { tierCounts[c.tier] = (tierCounts[c.tier] || 0) + 1; });
  const tierRows = Object.entries(tierCounts).sort((x, y) => y[1] - x[1]);

  const scatter = customers.slice(0, 120).map(c => ({
    name: c.name,
    x: Math.round(c.netSales / 100000 * 10) / 10,
    y: c.collectionRate,
    z: c.activeMonths,
  }));

  return (
    <section className="section active">
      <SectionHead code="CA" title="Customer Analysis — Risk & Ranking" sub="Composite score from sales, recency and activity" />
      <div className="kpis">
        <Kpi title="High Risk" value={highRisk} meta="No sale in 90+ days" tone="#f14f64" icon="card" />
        <Kpi title="Active" value={active} meta="Bought within 30 days" tone="#2fd083" icon="money" />
        <Kpi title="Platinum Tier" value={platinum} meta="Net sales ≥ ₹5L" tone="#1976d2" icon="box" />
        <Kpi title="Total Customers" value={customers.length} meta="With sales this year" tone="#f6a343" />
      </div>
      <div className="grid2">
        <Card title="Sales vs Collection" sub="Bubble = active months; top-left = buys little/pays late" badge="Risk Map"><ScatterPlot data={scatter} /></Card>
        <Card title="Tier Distribution" sub="Customer count by tier" badge="Tier" badgeClass="green"><DonutChart rows={tierRows} /></Card>
      </div>
      <Card title="Customer Risk & Ranking" sub="Filter by risk flag" badge="Detail" badgeClass="cyan">
        <div className="risk-filter">
          {RISK_FLAGS.map(f => (
            <button key={f} className={`chip ${risk === f ? "active" : ""}`} onClick={() => setRisk(f)}>{f}</button>
          ))}
          <span className="chip-count">{filtered.length} customers</span>
        </div>
        <Table
          headers={["#", "Customer", "Net Sales", "Last Sale", "Days Since", "Active Mo.", "Score", "Risk", "Tier", "Collection %"]}
          rows={filtered.map(c => [
            <span className="strong">{c.name}</span>,
            <span className="money">{money(c.netSales)}</span>,
            c.lastSaleDate || "—",
            <span style={{ fontWeight: 600, color: c.daysSinceLastSale > 90 ? "#f14f64" : c.daysSinceLastSale > 60 ? "#f6a343" : c.daysSinceLastSale > 30 ? "#c98a00" : "#2fd083" }}>{c.daysSinceLastSale === 9999 ? "—" : c.daysSinceLastSale}</span>,
            c.activeMonths,
            <span style={{ fontWeight: 700, color: c.score >= 60 ? "#2fd083" : c.score >= 30 ? "#f6a343" : "#f14f64" }}>{c.score}</span>,
            c.riskFlag,
            c.tier,
            <span style={{ fontWeight: 600, color: c.collectionRate >= 85 ? "#2fd083" : c.collectionRate >= 60 ? "#f6a343" : "#f14f64" }}>{c.collectionRate.toFixed(1)}%</span>,
          ])}
        />
      </Card>
    </section>
  );
}
