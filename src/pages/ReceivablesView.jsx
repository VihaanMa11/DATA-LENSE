import React, { useMemo } from "react";
import ReactApexChart from "react-apexcharts";
import { useReceivables } from "../useReceivables.js";
import { SectionHead, Card } from "../components/ui.jsx";
import { LineChart, BarChart } from "../components/InteractiveCharts.jsx";
import { FyToggle } from "../components/ceo/FyToggle.jsx";
import { KpiCard } from "../components/ceo/KpiCard.jsx";
import { AlertBar } from "../components/ceo/AlertBar.jsx";
import { PageState } from "./pageKit.jsx";
import { money, moneyAxis, PALETTE, FONT, GRID, INK } from "../components/chartTheme.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bigMoney(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(1)} Cr`;
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(1)} L`;
  return `${Math.round(n).toLocaleString("en-IN")}`;
}

function shortFy(fy) {
  const m = String(fy || "").match(/FY\s*\d{4}-(\d{2})/i);
  return m ? `FY${m[1]}` : fy;
}

function fmtDays(v) {
  if (v == null || isNaN(Number(v))) return "-";
  return `${Math.round(Number(v))} days`;
}

function fmtPct(v) {
  if (v == null || isNaN(Number(v))) return "-";
  return `${Number(v).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Data note banner (amber)
// ---------------------------------------------------------------------------
function DataNoteBanner({ notes }) {
  if (!notes || notes.length === 0) return null;
  return (
    <div className="rec-data-note-banner">
      <div className="rec-data-note-title">Data Availability Notes</div>
      <ul className="rec-data-note-list">
        {notes.map((note, i) => (
          <li key={i}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placeholder card — shown wherever data truly cannot be computed
// ---------------------------------------------------------------------------
function PlaceholderCard({ message }) {
  return (
    <div className="rec-placeholder">
      <div className="rec-placeholder-icon">i</div>
      <div className="rec-placeholder-text">{message}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sales vs Collections combo chart (ApexCharts)
// bars for sales + collections, line for running outstanding
// ---------------------------------------------------------------------------
function SalesVsCollChart({ data }) {
  const { options, series } = useMemo(() => {
    if (!data || !data.months) return { options: null, series: [] };

    const opts = {
      chart: {
        type: "bar",
        toolbar: { show: false },
        fontFamily: FONT,
        background: "transparent",
      },
      plotOptions: {
        bar: { columnWidth: "55%", borderRadius: 3, borderRadiusApplication: "end" },
      },
      colors: [PALETTE[0], PALETTE[1], PALETTE[3]],
      dataLabels: { enabled: false },
      legend: { position: "top", horizontalAlign: "left", fontSize: "12px", fontFamily: FONT },
      grid: { borderColor: GRID, strokeDashArray: 4 },
      stroke: { width: [0, 0, 2.5], curve: "smooth" },
      xaxis: {
        categories: data.months,
        labels: { style: { colors: INK, fontSize: "11px" } },
        axisBorder: { show: false },
      },
      yaxis: [
        {
          labels: { formatter: moneyAxis, style: { colors: INK, fontSize: "11px" } },
          title: { text: "Sales / Collections", style: { color: INK, fontSize: "11px", fontWeight: 600 } },
        },
        {
          opposite: true,
          labels: { formatter: moneyAxis, style: { colors: PALETTE[3], fontSize: "11px" } },
          title: { text: "Outstanding", style: { color: PALETTE[3], fontSize: "11px", fontWeight: 600 } },
        },
      ],
      tooltip: {
        shared: true,
        intersect: false,
        y: { formatter: (v) => money(v) },
      },
    };

    const ser = [
      { name: "Sales (net)", type: "bar",  data: data.sales },
      { name: "Collections", type: "bar",  data: data.collections },
      { name: "Running Outstanding", type: "line", data: data.runningOutstanding },
    ];

    return { options: opts, series: ser };
  }, [data]);

  if (!options) return <div className="empty">No data for current period</div>;
  return (
    <div className="chart-frame apex-frame">
      <ReactApexChart options={options} series={series} type="bar" height={280} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collection rate MoM bar chart — colored by threshold
// >=90 green, 70-90 amber, <70 red, null = grey
// ---------------------------------------------------------------------------
function CollRateMoMChart({ data }) {
  const { options, series } = useMemo(() => {
    if (!data || !data.rates) return { options: null, series: [] };

    const colors = (data.rates || []).map((r) => {
      if (r == null) return "#d6deea";
      if (r >= 90) return "#12b76a";
      if (r >= 70) return "#d97706";
      return "#ef4444";
    });

    const opts = {
      chart: {
        type: "bar",
        toolbar: { show: false },
        fontFamily: FONT,
        background: "transparent",
      },
      plotOptions: {
        bar: {
          columnWidth: "60%",
          borderRadius: 4,
          borderRadiusApplication: "end",
          distributed: true,
        },
      },
      colors,
      dataLabels: { enabled: false },
      legend: { show: false },
      grid: { borderColor: GRID, strokeDashArray: 4 },
      xaxis: {
        categories: data.months,
        labels: { style: { colors: INK, fontSize: "11px" } },
        axisBorder: { show: false },
      },
      yaxis: {
        min: 0,
        max: 100,
        labels: {
          formatter: (v) => `${Math.round(v)}%`,
          style: { colors: INK, fontSize: "11px" },
        },
        title: { text: "Collection %", style: { color: INK, fontSize: "11px", fontWeight: 600 } },
      },
      annotations: {
        yaxis: [
          { y: 90, borderColor: "#12b76a", strokeDashArray: 4, label: { text: "90%", style: { color: "#12b76a", fontSize: "10px" } } },
          { y: 70, borderColor: "#d97706", strokeDashArray: 4, label: { text: "70%", style: { color: "#d97706", fontSize: "10px" } } },
        ],
      },
      tooltip: {
        y: { formatter: (v) => v != null ? `${v}%` : "No data" },
      },
    };

    const chartData = (data.rates || []).map((r) => r != null ? r : 0);
    return { options: opts, series: [{ name: "Collection Rate", data: chartData }] };
  }, [data]);

  if (!options) return <div className="empty">No data</div>;
  return (
    <div className="chart-frame apex-frame">
      <ReactApexChart options={options} series={series} type="bar" height={260} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// DSO trend line chart (from dsoByFy)
// ---------------------------------------------------------------------------
function DsoTrendChart({ dsoByFy }) {
  if (!dsoByFy || dsoByFy.length === 0) return <div className="empty">No DSO data</div>;
  const series = [{ name: "DSO (days)", values: dsoByFy.map((d) => d.dso ?? 0) }];
  const months = dsoByFy.map((d) => shortFy(d.fy));
  return (
    <LineChart series={series} months={months} labels={{}} />
  );
}

// ---------------------------------------------------------------------------
// Collection rate 3-yr bar chart (from collectionRateByFy)
// ---------------------------------------------------------------------------
function CollRate3YrChart({ collectionRateByFy }) {
  if (!collectionRateByFy || collectionRateByFy.length === 0) return <div className="empty">No data</div>;
  const rows = collectionRateByFy.map((c) => [shortFy(c.fy), c.rate ?? 0]);
  return <BarChart rows={rows} />;
}

// ---------------------------------------------------------------------------
// Outstanding by FY bar chart
// ---------------------------------------------------------------------------
function OutstandingByFyChart({ outstandingByFy }) {
  if (!outstandingByFy || outstandingByFy.length === 0) return <div className="empty">No data</div>;
  const rows = outstandingByFy.map((o) => [shortFy(o.fy), o.outstanding]);
  return <BarChart rows={rows} />;
}

// ---------------------------------------------------------------------------
// Ageing buckets bar chart
// ---------------------------------------------------------------------------
function AgingBucketsChart({ buckets, asOfDate }) {
  if (!buckets) return <div className="empty">No ageing data</div>;
  const rows = [
    ["0-30 days", buckets.current || 0],
    ["31-60 days", buckets.d31_60 || 0],
    ["61-90 days", buckets.d61_90 || 0],
    ["90+ days", buckets.d90plus || 0],
  ];
  const total = rows.reduce((s, [, v]) => s + v, 0);
  if (total <= 0) return <div className="empty">No outstanding to age</div>;
  return (
    <div>
      <BarChart rows={rows} />
      {asOfDate && (
        <div style={{ fontSize: 11, color: "#8a93a6", marginTop: 6 }}>
          As of {asOfDate} · FIFO approximation (invoices aged against total credits per party, oldest first)
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Party-wise outstanding table
// ---------------------------------------------------------------------------
function PartyOutstandingTable({ parties, partyCount }) {
  if (!parties || parties.length === 0) {
    return <PlaceholderCard message="No party has an outstanding balance for the selected financial year." />;
  }
  return (
    <div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Party</th>
              <th>Group</th>
              <th>Outstanding</th>
              <th>Oldest open (days)</th>
              <th>Open invoices</th>
            </tr>
          </thead>
          <tbody>
            {parties.map((p, i) => (
              <tr key={p.name}>
                <td>{i + 1}</td>
                <td><span className="strong">{p.name}</span></td>
                <td style={{ fontSize: 12, color: "#5d6678" }}>{p.group || "-"}</td>
                <td><span className="money">{bigMoney(p.outstanding)}</span></td>
                <td style={{ color: (p.oldestAgeDays || 0) > 90 ? "#ef4444" : "inherit" }}>
                  {p.oldestAgeDays ?? "-"}
                </td>
                <td>{p.openInvoiceCount ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {partyCount > parties.length && (
        <div style={{ fontSize: 12, color: "#8a93a6", marginTop: 6 }}>
          Showing top {parties.length} of {partyCount} parties with an outstanding balance.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top opening debtors list
// ---------------------------------------------------------------------------
function OpeningDebtorsList({ debtors }) {
  if (!debtors || debtors.length === 0) {
    return (
      <PlaceholderCard message="No debtor opening balances found in account master. Ensure the Account Master tab has a 'Group Name' of 'Sundry Debtors' and an 'Opening Bal. (Dr)' column." />
    );
  }
  return (
    <div className="rec-debtor-list">
      {debtors.map((d, i) => (
        <div key={i} className="rec-debtor-row">
          <div className="rec-debtor-rank">{i + 1}</div>
          <div className="rec-debtor-name">{d.name}</div>
          <div className="rec-debtor-amount">{bigMoney(d.openingDr)}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main: ReceivablesView
// ---------------------------------------------------------------------------
export function ReceivablesView({ fy, onFy }) {
  const { receivables, loading, error } = useReceivables(fy);

  if (!receivables && !loading && !error) {
    return (
      <div className="error-box info-box">
        No Google Sheet connected. Open <b>Data Source</b> (top right) and paste your sheet URL, then press <b>Sync Now</b>.
      </div>
    );
  }

  const fyList             = receivables?.fyList             || [];
  const currentFy          = receivables?.currentFy          || "";
  const prevFy             = receivables?.prevFy             || null;
  const kpis               = receivables?.kpis               || {};
  const alerts             = receivables?.alerts             || [];
  const dataNotes          = receivables?.dataNotes          || [];
  const openingBalance     = receivables?.openingBalance     || 0;
  const openingDebtors     = receivables?.openingDebtors     || 0;
  const topOpeningDebtors  = receivables?.topOpeningDebtors  || [];
  const salesVsCollMoM     = receivables?.salesVsCollMoM     || null;
  const collectionRateMoM  = receivables?.collectionRateMoM  || null;
  const dsoByFy            = receivables?.dsoByFy            || [];
  const collectionRateByFy = receivables?.collectionRateByFy || [];
  const outstandingByFy    = receivables?.outstandingByFy    || [];
  const totalOutstanding   = receivables?.totalOutstanding   || 0;
  const partyWiseAvailable = receivables?.partyWiseAvailable || false;
  const topDebtors         = receivables?.topDebtors         || [];
  const partyCount         = receivables?.partyCount         || 0;
  const agingBuckets       = receivables?.agingBuckets       || null;
  const agingAsOfDate      = receivables?.agingAsOfDate      || null;

  const curDso  = kpis.dso?.value;
  const curRate = kpis.collectionRate?.value;
  const completeFy   = kpis.collectionRate?.completeFy    || currentFy;
  const completeFyRate = kpis.collectionRate?.completeFyRate;

  // Partial FY set for FyToggle
  const partialFys = useMemo(() => {
    // Mark the latest FY as partial if it appears fewer than 6 months — detected server-side via dataNotes
    const partialNote = dataNotes.find((n) => n && n.toLowerCase().includes("partial"));
    if (!partialNote) return new Set();
    const matches = fyList.filter((f) => partialNote.includes(f));
    return new Set(matches);
  }, [dataNotes, fyList]);

  return (
    <PageState loading={loading} error={error}>
      {receivables && (
        <div className="rec-wrap">
          {/* Header */}
          <div className="ceo-header-row">
            <SectionHead
              code="RV"
              title="Receivables Analysis"
              sub="3-year · opening balance + running transactions"
            />
            <FyToggle fyList={fyList} value={fy} onChange={onFy} partialFys={partialFys} />
          </div>

          {/* Data note banner (amber) */}
          <DataNoteBanner notes={dataNotes} />

          {/* KPI cards */}
          <div className="kpi-grid rec-kpi-grid">
            <KpiCard
              label="Total Outstanding"
              value={bigMoney(totalOutstanding)}
              delta={kpis.totalOutstanding?.prev != null
                ? (totalOutstanding > kpis.totalOutstanding.prev
                  ? `+${bigMoney(totalOutstanding - kpis.totalOutstanding.prev)} vs ${shortFy(prevFy)}`
                  : `-${bigMoney(kpis.totalOutstanding.prev - totalOutstanding)} vs ${shortFy(prevFy)}`)
                : null}
              deltaTone={kpis.totalOutstanding?.prev != null
                ? (totalOutstanding <= kpis.totalOutstanding.prev ? "up" : "dn")
                : "neu"}
              context="Running net from opening balance"
            />
            <KpiCard
              label={`DSO (${shortFy(currentFy)})`}
              value={fmtDays(curDso)}
              delta={kpis.dso?.prev != null
                ? (curDso != null ? `${curDso > kpis.dso.prev ? "+" : ""}${Math.round(curDso - kpis.dso.prev)} days vs ${shortFy(prevFy)}` : null)
                : null}
              deltaTone={kpis.dso?.prev == null || curDso == null ? "neu"
                : curDso <= kpis.dso.prev ? "up" : "dn"}
              context="Party-level outstanding / net billed per day"
            />
            <KpiCard
              label={`Collection Rate (${shortFy(completeFy)})`}
              value={fmtPct(completeFyRate ?? curRate)}
              delta={completeFy !== currentFy ? "Complete FY — actual" : null}
              deltaTone={(completeFyRate ?? curRate) >= 85 ? "up" : (completeFyRate ?? curRate) >= 70 ? "neu" : "dn"}
              context="Party-allocated receipts / net billed"
            />
            <KpiCard
              label="Opening Balance"
              value={bigMoney(openingBalance)}
              delta={null}
              context={`${openingDebtors} debtor${openingDebtors !== 1 ? "s" : ""} in account master`}
            />
            <KpiCard
              label={`Collections (${shortFy(currentFy)})`}
              value={bigMoney(kpis.collections?.value)}
              delta={kpis.collections?.prev != null
                ? (() => {
                    const diff = (kpis.collections?.value || 0) - kpis.collections.prev;
                    return `${diff >= 0 ? "+" : ""}${bigMoney(diff)} vs ${shortFy(prevFy)}`;
                  })()
                : null}
              deltaTone={kpis.collections?.prev == null ? "neu"
                : (kpis.collections?.value || 0) >= kpis.collections.prev ? "up" : "dn"}
              context="Receipts allocated to debtor parties via voucher contra"
            />
            <KpiCard
              label={`Sales Billed (${shortFy(currentFy)})`}
              value={bigMoney(kpis.salesBilled?.value)}
              delta={kpis.salesBilled?.prev != null
                ? (() => {
                    const diff = (kpis.salesBilled?.value || 0) - kpis.salesBilled.prev;
                    return `${diff >= 0 ? "+" : ""}${bigMoney(diff)} vs ${shortFy(prevFy)}`;
                  })()
                : null}
              deltaTone={kpis.salesBilled?.prev == null ? "neu"
                : (kpis.salesBilled?.value || 0) >= kpis.salesBilled.prev ? "up" : "neu"}
              context="Net sales (gross less returns)"
            />
          </div>

          {/* Alert bar */}
          <AlertBar alerts={alerts} />

          {/* Grid 2: Sales vs Collections MoM + Collection rate MoM */}
          <div className="ceo-grid2">
            <Card
              title={`Sales vs Collections (${shortFy(currentFy)})`}
              sub="Net sales billed, collections received, and running outstanding"
            >
              <SalesVsCollChart data={salesVsCollMoM} />
            </Card>
            <Card
              title={`Collection Rate per Month (${shortFy(currentFy)})`}
              sub="Green >= 90%, amber 70-90%, red below 70%"
            >
              <CollRateMoMChart data={collectionRateMoM} />
            </Card>
          </div>

          {/* Grid 2: Aging placeholder + DSO + Collection rate 3-yr */}
          <div className="ceo-grid2">
            <Card
              title="Aging Buckets"
              sub="Outstanding by age (0-30, 31-60, 61-90, 90+ days)"
            >
              <AgingBucketsChart buckets={agingBuckets} asOfDate={agingAsOfDate} />
            </Card>
            <Card
              title="Outstanding by FY"
              sub="Running net outstanding at end of each financial year"
            >
              <OutstandingByFyChart outstandingByFy={outstandingByFy} />
            </Card>
          </div>

          {/* Grid 2: DSO trend 3-yr + Collection rate 3-yr */}
          <div className="ceo-grid2">
            <Card
              title="DSO Trend — 3-year"
              sub="Days Sales Outstanding, from party-level outstanding"
            >
              <DsoTrendChart dsoByFy={dsoByFy} />
            </Card>
            <Card
              title="Collection Rate — 3-year"
              sub="Party-allocated receipts as % of net billed"
            >
              <CollRate3YrChart collectionRateByFy={collectionRateByFy} />
            </Card>
          </div>

          {/* Grid 2: Opening balance debtors + Party-wise placeholder */}
          <div className="ceo-grid2">
            <Card
              title="Opening Balance — Top Debtors"
              sub="From Account Master: Opening Bal. (Dr). These are real balances at period start."
            >
              <OpeningDebtorsList debtors={topOpeningDebtors} />
            </Card>
            <Card
              title="Party-wise Outstanding"
              sub={`Top parties by outstanding as of ${shortFy(currentFy)}`}
            >
              {partyWiseAvailable ? (
                <PartyOutstandingTable parties={topDebtors} partyCount={partyCount} />
              ) : (
                <PlaceholderCard message="Party-wise collection cannot be derived from current data." />
              )}
            </Card>
          </div>
        </div>
      )}
    </PageState>
  );
}
