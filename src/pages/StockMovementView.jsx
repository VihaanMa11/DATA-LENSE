import React, { useMemo } from "react";
import ReactApexChart from "react-apexcharts";
import { useStockMovement } from "../useStockMovement.js";
import { SectionHead, Card } from "../components/ui.jsx";
import { FyToggle } from "../components/ceo/FyToggle.jsx";
import { KpiCard } from "../components/ceo/KpiCard.jsx";
import { AlertBar } from "../components/ceo/AlertBar.jsx";
import { PageState } from "./pageKit.jsx";
import { money } from "../components/chartTheme.js";

function bigMoney(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
function shortFy(fy) {
  const m = String(fy || "").match(/FY\s*\d{4}-(\d{2})/i);
  return m ? `FY${m[1]}` : fy;
}
function pairsFmt(n) {
  const v = Number(n) || 0;
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)} L`;
  return Math.round(v).toLocaleString("en-IN");
}
function stColor(st) { return st >= 85 ? "#0e9456" : st >= 70 ? "#d97706" : "#ef4444"; }

// MoM inward vs outward + running net line
function MomChart({ momStock }) {
  const { options, series } = useMemo(() => {
    if (!momStock?.months?.length) return { options: null, series: [] };
    const k = (a) => a.map((v) => Math.round(v / 1000));
    const opts = {
      chart: { type: "line", stacked: false, toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      colors: ["#1baf7a", "#e34948", "#4a3aa7"],
      stroke: { width: [0, 0, 2] },
      plotOptions: { bar: { columnWidth: "70%", borderRadius: 2 } },
      dataLabels: { enabled: false },
      legend: { position: "top", horizontalAlign: "left", fontSize: "10px" },
      grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: momStock.months, labels: { style: { colors: "#5d6678", fontSize: "9px" } } },
      yaxis: [
        { seriesName: "Inward", labels: { formatter: (v) => `${v}K`, style: { colors: "#5d6678", fontSize: "9px" } }, title: { text: "Pairs (K)", style: { color: "#5d6678", fontSize: "9px" } } },
        { seriesName: "Inward", show: false },
        { opposite: true, seriesName: "Net", labels: { formatter: (v) => `${v}K`, style: { colors: "#4a3aa7", fontSize: "9px" } } },
      ],
      tooltip: { shared: true, intersect: false },
    };
    return { options: opts, series: [
      { name: "Inward (purchased)", type: "column", data: k(momStock.inward) },
      { name: "Outward (sold)", type: "column", data: k(momStock.outward) },
      { name: "Running net stock", type: "line", data: k(momStock.running) },
    ] };
  }, [momStock]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="line" height={190} /></div>;
}

function SellThrough({ rows }) {
  if (!rows?.length) return <div className="empty">No data</div>;
  return (
    <div className="sk-turn">
      {rows.map((r) => (
        <div key={r.group} className="sk-turn-row">
          <span className="sk-turn-label" title={r.group}>{r.group}</span>
          <div className="sk-turn-track"><div className="sk-turn-fill" style={{ width: `${Math.min(100, r.st)}%`, background: stColor(r.st) }} /></div>
          <span className="sk-turn-pct" style={{ color: stColor(r.st) }}>{Math.round(r.st)}%</span>
        </div>
      ))}
    </div>
  );
}

function LockupChart({ rows }) {
  const { options, series } = useMemo(() => {
    if (!rows?.length) return { options: null, series: [] };
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { horizontal: true, borderRadius: 3, barHeight: "62%" } },
      colors: ["#eda100"], dataLabels: { enabled: false },
      legend: { show: false }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: rows.map((r) => r.group), labels: { formatter: (v) => bigMoney(v), style: { colors: "#5d6678", fontSize: "9px" } } },
      yaxis: { labels: { style: { colors: "#5d6678", fontSize: "9px" } } },
      tooltip: { y: { formatter: (v) => `${bigMoney(v)} closing value` } },
    };
    return { options: opts, series: [{ name: "Lock-up", data: rows.map((r) => r.closeVal) }] };
  }, [rows]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={180} /></div>;
}

function ClosingTrendChart({ trend }) {
  const { options, series } = useMemo(() => {
    if (!trend?.groups?.length) return { options: null, series: [] };
    const colors = ["#B5D4F4", "#85B7EB", "#2a78d6"];
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { columnWidth: "70%", borderRadius: 2 } },
      colors: colors.slice(-trend.series.length),
      dataLabels: { enabled: false },
      legend: { position: "top", horizontalAlign: "left", fontSize: "10px" },
      grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: trend.groups, labels: { style: { colors: "#5d6678", fontSize: "9px" }, rotate: -25, trim: true } },
      yaxis: { labels: { formatter: (v) => bigMoney(v), style: { colors: "#5d6678", fontSize: "9px" } } },
      tooltip: { shared: true, intersect: false, y: { formatter: (v) => bigMoney(v) } },
    };
    return { options: opts, series: trend.series.map((s) => ({ name: shortFy(s.name), data: s.values })) };
  }, [trend]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={180} /></div>;
}

function LockupSkuTable({ rows }) {
  if (!rows?.length) return <div className="empty">No high lock-up SKUs</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>SKU</th><th>Close</th><th>₹val</th><th>ST%</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sku}>
              <td><span className="strong">{r.sku}</span></td>
              <td>{r.closing.toLocaleString("en-IN")}</td>
              <td style={{ color: "#854f0b" }}>{bigMoney(r.closeVal)}</td>
              <td style={{ color: "#ef4444", fontWeight: 600 }}>{Math.round(r.st)}%</td>
              <td><span className="ig-signal" style={{ background: r.tag === "Risk" ? "#fdecec" : "#fdf2e3", color: r.tag === "Risk" ? "#ef4444" : "#d97706" }}>{r.tag}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_STYLE = {
  Star: { bg: "#e7f8ef", color: "#0e9456" }, Watch: { bg: "#fdf2e3", color: "#d97706" },
  Slow: { bg: "#fdecec", color: "#ef4444" }, "Neg. stk": { bg: "#fdecec", color: "#ef4444" },
};
function StatusTag({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.Watch;
  return <span className="ig-signal" style={{ background: s.bg, color: s.color }}>{status}</span>;
}

function DetailTable({ rows, fyList, currentFy }) {
  if (!rows?.length) return <div className="empty">No SKU data</div>;
  const laterFys = fyList.filter((fy) => fy > currentFy);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>SKU name</th><th>Group</th><th>Opening</th><th>Inward</th><th>Outward</th><th>Closing</th><th>Avg cost</th><th>Close ₹val</th><th>ST%</th>
            {laterFys.map((fy) => <th key={fy}>{shortFy(fy)} ST%</th>)}
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sku} style={r.negative ? { background: "#fdecec" } : undefined}>
              <td><span className="strong" style={r.negative ? { color: "#ef4444" } : undefined}>{r.sku.replace(/\s*MRP.*$/i, "")}</span></td>
              <td style={{ color: "#5d6678", fontSize: 11 }}>{r.group}</td>
              <td>{r.opening.toLocaleString("en-IN")}</td>
              <td>{r.inward.toLocaleString("en-IN")}</td>
              <td>{r.outward.toLocaleString("en-IN")}</td>
              <td style={r.negative ? { color: "#ef4444", fontWeight: 600 } : undefined}>{r.closing.toLocaleString("en-IN")}</td>
              <td>{r.avgCost ? money(r.avgCost) : "-"}</td>
              <td>{r.closeVal > 0 ? <span className="money">{money(r.closeVal)}</span> : <span style={{ color: "#97a0b2" }}>0</span>}</td>
              <td style={{ color: stColor(r.st), fontWeight: 600 }}>{Math.round(r.st)}%</td>
              {laterFys.map((fy) => <td key={fy}>{r.fyST[fy] != null ? `${Math.round(r.fyST[fy])}%` : "-"}</td>)}
              <td><StatusTag status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StockMovementView({ fy, onFy }) {
  const { data, loading, error } = useStockMovement(fy);

  if (!data && !loading && !error) {
    return (
      <div className="error-box info-box">
        No Google Sheet connected. Open <b>Data Source</b> (top right) and paste your sheet URL, then press <b>Sync Now</b>.
      </div>
    );
  }

  const fyList     = data?.fyList     || [];
  const currentFy  = data?.currentFy  || "";
  const kpis       = data?.kpis       || {};
  const alerts     = data?.alerts     || [];
  const partialFys = useMemo(() => new Set(data?.partialFys || []), [data]);
  const momStock   = data?.momStock   || { months: [], inward: [], outward: [], running: [] };
  const groupSellThrough = data?.groupSellThrough || [];
  const lockupByGroup = data?.lockupByGroup || [];
  const closingTrend = data?.closingTrend || { groups: [], series: [] };
  const highLockupSkus = data?.highLockupSkus || [];
  const table      = data?.table      || [];

  const tgl = kpis.topGroupLock;
  const pl = kpis.premiumLock;

  return (
    <PageState loading={loading} error={error}>
      {data && (
        <div className="ig-wrap">
          <div className="ceo-header-row">
            <SectionHead code="SK" title="Stock Movement" sub="3-year inventory view · inward · outward · turnover · lock-up risk" />
            <FyToggle fyList={fyList} value={fy} onChange={onFy} partialFys={partialFys} />
          </div>

          <div className="sm-conc-note" style={{ background: "#faeeda", color: "#633806", marginBottom: 2 }}>
            Closing stock is computed from movement (inward minus outward). Opening balances are largely unrecorded in the source, so items that sold more than they were bought show as negative stock. Fix opening balances per SKU to close the gap.
          </div>

          <div className="kpi-grid ca-kpi-grid">
            <KpiCard label={`Closing stock value (${shortFy(currentFy)})`} value={bigMoney(kpis.closingValue?.cur)} delta="movement-based" deltaTone="neu" context="net of returns" />
            <KpiCard label="Total inward (pairs)" value={pairsFmt(kpis.totalInward?.cur)} delta="purchased + returns" deltaTone="neu" context={shortFy(currentFy)} />
            <KpiCard label="Total outward (pairs)" value={pairsFmt(kpis.totalOutward?.cur)} delta="sold + purch. returns" deltaTone="neu" context={shortFy(currentFy)} />
            <KpiCard label="Negative-stock SKUs" value={String(kpis.negativeStock?.count ?? 0)} delta="data integrity" deltaTone="dn" context="opening balance missing" />
            <KpiCard label="High lock-up SKUs" value={String(kpis.highLockup?.count ?? 0)} delta="below 50% sell-through" deltaTone="dn" context="₹10K+ value locked" />
            <KpiCard label={pl ? `${pl.group} lock-up` : (tgl ? `${tgl.group} lock-up` : "Top lock-up")} value={pl ? bigMoney(pl.val) : (tgl ? bigMoney(tgl.val) : "-")} delta={tgl?.st != null ? `${tgl.st}% sell-through` : null} deltaTone="dn" context="premium stock at risk" />
          </div>

          <AlertBar alerts={alerts} />

          <div className="ceo-grid2">
            <Card title={`MoM inward vs outward · ${shortFy(currentFy)}`} sub="Pairs bought vs sold each month, with running net stock">
              <MomChart momStock={momStock} />
            </Card>
            <Card title={`Group sell-through · ${shortFy(currentFy)}`} sub="Outward divided by inward — higher is better velocity">
              <SellThrough rows={groupSellThrough} />
            </Card>
          </div>

          <div className="ceo-grid3">
            <Card title="Lock-up value by group" sub="Closing stock value per group">
              <LockupChart rows={lockupByGroup} />
            </Card>
            <Card title="Closing stock 3-yr trend" sub="Closing value by top groups across years">
              <ClosingTrendChart trend={closingTrend} />
            </Card>
            <Card title="High lock-up SKUs" sub="Below 50% sell-through, ₹10K+ locked">
              <LockupSkuTable rows={highLockupSkus} />
            </Card>
          </div>

          <Card title="Stock movement detail — top 15 by outward" sub={`Opening, inward, outward, closing, sell-through · red rows = negative stock`}>
            <DetailTable rows={table} fyList={fyList} currentFy={currentFy} />
          </Card>
        </div>
      )}
    </PageState>
  );
}
