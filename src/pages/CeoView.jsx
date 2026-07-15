import React, { useMemo, useState } from "react";
import { useCeo } from "../useCeo.js";
import { SectionHead, Card } from "../components/ui.jsx";
import { LineChart, DonutChart } from "../components/InteractiveCharts.jsx";
import { ParetoChart } from "../components/ParetoChart.jsx";
import { money } from "../components/chartTheme.js";
import { PageState } from "./pageKit.jsx";
import { FyToggle } from "../components/ceo/FyToggle.jsx";
import { KpiCard } from "../components/ceo/KpiCard.jsx";
import { AlertBar } from "../components/ceo/AlertBar.jsx";
import { YoyBars } from "../components/ceo/YoyBars.jsx";
import { QuarterYoyChart } from "../components/ceo/QuarterYoyChart.jsx";

// bigMoney: large-number formatter for KPI display
function bigMoney(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} Lakh`;
  return `₹${Math.round(n)}`;
}

function fmtDeltaPct(v) {
  if (v == null || isNaN(v)) return null;
  const n = Number(v);
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function fmtDeltaPts(v) {
  if (v == null || isNaN(v)) return null;
  const n = Number(v);
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)} pts`;
}

// Determine if a FY is partial (fewer than 12 non-zero months)
function buildPartialFys(monthlyByFy) {
  const partial = new Set();
  if (!monthlyByFy) return partial;
  Object.entries(monthlyByFy).forEach(([fy, months]) => {
    if (!Array.isArray(months)) return;
    const nonZero = months.filter((v) => Number(v) > 0).length;
    if (nonZero < 12) partial.add(fy);
  });
  return partial;
}

const APR_TO_MAR = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

export function CeoView({ fy, onFy }) {
  const { ceo, loading, error } = useCeo(fy);
  const [paretoStateFilter, setParetoStateFilter] = useState("All");

  const partialFys = useMemo(
    () => buildPartialFys(ceo?.monthlyByFy),
    [ceo?.monthlyByFy],
  );

  // Build LineChart series from monthlyByFy
  const monthlySeries = useMemo(() => {
    if (!ceo?.monthlyByFy || !ceo?.fyList) return [];
    return ceo.fyList.map((fyLabel) => ({
      name: fyLabel,
      values: (ceo.monthlyByFy[fyLabel] || new Array(12).fill(0)).map(Number),
    }));
  }, [ceo]);

  // Supplier donut rows
  const supplierRows = useMemo(
    () => (ceo?.suppliers || []).map((s) => [s.name, s.value]),
    [ceo],
  );

  // Filtered pareto by state
  const filteredPareto = useMemo(() => {
    if (!ceo?.pareto) return [];
    if (paretoStateFilter === "All") return ceo.pareto;
    return ceo.pareto.filter(p => p.state === paretoStateFilter);
  }, [ceo?.pareto, paretoStateFilter]);

  if (!ceo && !loading && !error) {
    return (
      <div className="error-box info-box">
        No Google Sheet connected. Open <b>Data Source</b> (top right) and paste your sheet URL, then press <b>Sync Now</b>.
      </div>
    );
  }

  return (
    <PageState loading={loading} error={error}>
      {ceo && (
        <div className="ceo-wrap">
          {/* ── Header row ── */}
          <div className="ceo-header-row">
            <SectionHead
              code="CEO"
              title="CEO View"
              sub="3-year performance overview — all amounts in ₹"
            />
            <FyToggle
              fyList={ceo.fyList || []}
              value={fy}
              onChange={onFy}
              partialFys={partialFys}
            />
          </div>

          {/* ── 5 KPI cards ── */}
          <div className="kpi-grid">
            {/* Net Sales */}
            <KpiCard
              label="Net Sales"
              value={bigMoney(ceo.kpis?.netSales?.cur)}
              delta={fmtDeltaPct(ceo.kpis?.netSales?.deltaPct)}
              deltaTone={ceo.kpis?.netSales?.deltaPct >= 0 ? "up" : "dn"}
              context={
                ceo.prevFy && ceo.kpis?.netSales?.prev != null
                  ? `${ceo.prevFy}: ${bigMoney(ceo.kpis.netSales.prev)}`
                  : undefined
              }
            />

            {/* Active Customers */}
            <KpiCard
              label="Active Customers"
              value={String(ceo.kpis?.customers?.cur ?? "—")}
              delta={
                ceo.kpis?.customers?.delta != null
                  ? `${ceo.kpis.customers.delta >= 0 ? "+" : ""}${ceo.kpis.customers.delta}`
                  : null
              }
              deltaTone={ceo.kpis?.customers?.delta >= 0 ? "up" : "dn"}
              context={
                ceo.kpis?.customers?.churned != null || ceo.kpis?.customers?.added != null
                  ? `${ceo.kpis.customers.churned ?? 0} churned, ${ceo.kpis.customers.added ?? 0} new`
                  : undefined
              }
            />

            {/* Avg Bill Value */}
            <KpiCard
              label="Avg Bill Value"
              value={bigMoney(ceo.kpis?.avgBill?.cur)}
              delta={fmtDeltaPct(ceo.kpis?.avgBill?.deltaPct)}
              deltaTone={ceo.kpis?.avgBill?.deltaPct >= 0 ? "up" : "dn"}
              context={
                ceo.prevFy && ceo.kpis?.avgBill?.prev != null
                  ? `${ceo.prevFy}: ${bigMoney(ceo.kpis.avgBill.prev)}`
                  : undefined
              }
            />

            {/* Purchase Value */}
            <KpiCard
              label="Purchase Value"
              value={bigMoney(ceo.kpis?.purchase?.cur)}
              delta={fmtDeltaPct(ceo.kpis?.purchase?.deltaPct)}
              deltaTone="neu"
              context={
                ceo.prevFy && ceo.kpis?.purchase?.prev != null
                  ? `${ceo.prevFy}: ${bigMoney(ceo.kpis.purchase.prev)}`
                  : undefined
              }
            />

            {/* Return Rate */}
            <KpiCard
              label="Return Rate"
              value={
                ceo.kpis?.returnRate?.cur != null
                  ? `${Number(ceo.kpis.returnRate.cur).toFixed(1)}%`
                  : "—"
              }
              delta={fmtDeltaPts(ceo.kpis?.returnRate?.deltaPts)}
              deltaTone={
                ceo.kpis?.returnRate?.deltaPts > 0
                  ? "dn"
                  : ceo.kpis?.returnRate?.deltaPts < 0
                  ? "up"
                  : "neu"
              }
              context={
                ceo.prevFy && ceo.kpis?.returnRate?.prev != null
                  ? `${ceo.prevFy}: ${Number(ceo.kpis.returnRate.prev).toFixed(1)}%`
                  : undefined
              }
            />
          </div>

          {/* ── Alert bar ── */}
          <AlertBar alerts={ceo.alerts} />

          {/* ── Row 1: Monthly overlay + YoY by quarter ── */}
          <div className="ceo-grid2">
            <Card
              title="Monthly Net Sales — 3-year overlay"
              sub="Apr through Mar, all financial years"
              help="Shows net sales for each month across up to 3 financial years. Compare curves to spot seasonal peaks and year-on-year trends. A rising curve that shifts left indicates early-season demand. Hover over any point for exact values."
            >
              <LineChart
                series={monthlySeries}
                months={APR_TO_MAR}
                labels={{}}
              />
            </Card>
            <Card
              title="YoY Growth by Quarter"
              sub="Year-over-year % change per quarter"
              help="Compares each quarter's net sales to the same quarter last year (YoY %). Green bars mean growth, red means decline. Use this to identify which quarters are driving or dragging overall performance."
            >
              <QuarterYoyChart
                data={ceo.yoyByQuarter || []}
                prevFy={ceo.prevFy}
                currentFy={ceo.currentFy}
              />
            </Card>
          </div>

          {/* ── Row 2: Top customers / Top products / Supplier concentration ── */}
          <div className="ceo-grid3">
            <Card title="Top Customers" sub="Net sales, multi-year comparison" help="Ranks your top customers by net sales and shows year-over-year comparison. A shrinking bar for a key customer is an early churn warning. Hover for exact values.">
              <YoyBars
                rows={ceo.topCustomers || []}
                fyList={ceo.fyList || []}
                valueKey="name"
              />
            </Card>
            <Card title="Top Products" sub="Net sales by brand, multi-year" help="Ranks your top brands/products by net sales across years. Brands with growing bars are gaining traction; flat or declining bars warrant investigation.">
              <YoyBars
                rows={ceo.topProducts || []}
                fyList={ceo.fyList || []}
                valueKey="brand"
              />
            </Card>
            <Card title="Supplier Concentration" sub="Top suppliers by purchase value" help="Shows what share of your total purchase value goes to each supplier. High concentration in one or two suppliers increases supply-chain risk.">
              <DonutChart rows={supplierRows} />
            </Card>
          </div>

          {/* ── Full-width Pareto ── */}
          <Card
            title={`Customer Pareto — ${ceo.currentFy || ""}`}
            sub="80/20 concentration view"
            help="The Customer Pareto chart ranks customers from highest to lowest net sales and overlays the cumulative % line. The point where the line crosses 80% shows how many customers account for 80% of your revenue. Use the State filter to focus on a specific geography."
          >
            {(ceo.paretoStates || []).length > 0 && (
              <div className="ceo-pareto-filters">
                <label className="ceo-pareto-filter-label">
                  State
                  <select
                    value={paretoStateFilter}
                    onChange={e => setParetoStateFilter(e.target.value)}
                    className="ceo-pareto-filter-select"
                  >
                    <option value="All">All States</option>
                    {(ceo.paretoStates || []).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <ParetoChart
              data={filteredPareto}
              title={`Customer Pareto — ${ceo.currentFy || ""}`}
              barLabel="Net sales"
            />
          </Card>
        </div>
      )}
    </PageState>
  );
}
