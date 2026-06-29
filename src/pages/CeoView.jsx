import React, { useMemo } from "react";
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
            <Card title="Top Customers" sub="Net sales, multi-year comparison">
              <YoyBars
                rows={ceo.topCustomers || []}
                fyList={ceo.fyList || []}
                valueKey="name"
              />
            </Card>
            <Card title="Top Products" sub="Net sales by brand, multi-year">
              <YoyBars
                rows={ceo.topProducts || []}
                fyList={ceo.fyList || []}
                valueKey="brand"
              />
            </Card>
            <Card title="Supplier Concentration" sub="Top suppliers by purchase value">
              <DonutChart rows={supplierRows} />
            </Card>
          </div>

          {/* ── Full-width Pareto ── */}
          <Card
            title={`Customer Pareto — ${ceo.currentFy || ""}`}
            sub="80/20 concentration view"
          >
            <ParetoChart
              data={ceo.pareto || []}
              title={`Customer Pareto — ${ceo.currentFy || ""}`}
              barLabel="Net sales"
            />
          </Card>
        </div>
      )}
    </PageState>
  );
}
