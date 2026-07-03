import React, { useMemo, useState } from "react";
import ReactApexChart from "react-apexcharts";
import { useProductForecast } from "../useProductForecast.js";
import { SectionHead, Card } from "../components/ui.jsx";
import { KpiCard } from "../components/ceo/KpiCard.jsx";
import { AlertBar } from "../components/ceo/AlertBar.jsx";
import { PageState } from "./pageKit.jsx";
import { money } from "../components/chartTheme.js";

function bigMoney(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
function shortFy(fy) { const m = String(fy || "").match(/FY\s*\d{4}-(\d{2})/i); return m ? `FY${m[1]}` : fy; }
const HORIZONS = [{ i: 0, label: "M+1 (Apr)" }, { i: 1, label: "M+2 (May)" }, { i: 2, label: "M+3 (Jun)" }];

function FlatVsAdjChart({ data }) {
  const { options, series } = useMemo(() => {
    if (!data?.skus?.length) return { options: null, series: [] };
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { horizontal: true, borderRadius: 2, barHeight: "70%" } },
      colors: ["#eda100", "#2a78d6"], dataLabels: { enabled: false },
      legend: { position: "top", horizontalAlign: "left", fontSize: "10px" }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: data.skus, labels: { formatter: (v) => bigMoney(v), style: { colors: "#5d6678", fontSize: "9px" } } },
      yaxis: { labels: { style: { colors: "#5d6678", fontSize: "8px" } } },
      tooltip: { shared: true, intersect: false, y: { formatter: (v) => bigMoney(v) } },
    };
    return { options: opts, series: [{ name: "Flat forecast", data: data.flat }, { name: "Season-adjusted", data: data.adjusted }] };
  }, [data]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={215} /></div>;
}

function GroupForecastChart({ rows }) {
  const { options, series } = useMemo(() => {
    if (!rows?.length) return { options: null, series: [] };
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { columnWidth: "62%", borderRadius: 2 } }, colors: ["#eda100", "#2a78d6"],
      dataLabels: { enabled: false }, legend: { position: "top", horizontalAlign: "left", fontSize: "10px" }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: rows.map((r) => r.group), labels: { style: { colors: "#5d6678", fontSize: "9px" } } },
      yaxis: { labels: { formatter: (v) => bigMoney(v), style: { colors: "#5d6678", fontSize: "9px" } } },
      tooltip: { shared: true, intersect: false, y: { formatter: (v) => bigMoney(v) } },
    };
    return { options: opts, series: [{ name: "Flat forecast", data: rows.map((r) => r.flat) }, { name: "Season-adjusted", data: rows.map((r) => r.adjusted) }] };
  }, [rows]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={215} /></div>;
}

function BiasRisk({ rows }) {
  if (!rows?.length) return <div className="empty">No H2-heavy SKUs</div>;
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#a32d2d", marginBottom: 6, padding: "4px 6px", background: "#fdecec", borderRadius: 4 }}>
        If next month is April (H1), these H2 SKUs are over-forecast by a flat model
      </div>
      {rows.map((r) => (
        <div key={r.sku} className="sk-turn-row">
          <span className="sk-turn-label" title={r.sku}>{r.sku}</span>
          <div className="sk-turn-track"><div className="sk-turn-fill" style={{ width: `${r.h2Pct}%`, background: r.h2Pct >= 85 ? "#e34948" : "#eda100" }} /></div>
          <span className="sk-turn-pct" style={{ color: r.h2Pct >= 85 ? "#ef4444" : "#d97706" }}>{Math.round(r.h2Pct)}% H2</span>
        </div>
      ))}
    </div>
  );
}

const ACTION_TAG = {
  "Order now": { bg: "#fdecec", color: "#ef4444" }, Urgent: { bg: "#fdecec", color: "#ef4444" },
  Monitor: { bg: "#e6f1fb", color: "#185fa5" }, OK: { bg: "#eaf3de", color: "#3b6d11" }, "H2 only": { bg: "#f4f7fb", color: "#5d6678" },
};
function ActionTag({ action }) { const s = ACTION_TAG[action] || ACTION_TAG.OK; return <span className="ig-signal" style={{ background: s.bg, color: s.color }}>{action}</span>; }

function PurchaseTable({ rows }) {
  if (!rows?.length) return <div className="empty">No data</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>SKU</th><th>Forecast</th><th>Stock</th><th>Days cvr</th><th>Action</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sku}>
              <td><span className="strong">{r.sku}</span></td>
              <td><span className="money">{money(r.forecast)}</span></td>
              <td style={r.stock <= 0 ? { color: "#ef4444", fontWeight: 600 } : undefined}>{r.stock.toLocaleString("en-IN")} pr</td>
              <td>{r.action === "H2 only" ? "-" : `${r.daysCover}d`}</td>
              <td><ActionTag action={r.action} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfidenceDonut({ rows }) {
  const { options, series } = useMemo(() => {
    if (!rows?.length) return { options: null, series: [] };
    const opts = {
      chart: { type: "donut", background: "transparent", fontFamily: "Inter, sans-serif" },
      labels: rows.map((r) => r.level), colors: ["#1baf7a", "#eda100", "#e34948"],
      dataLabels: { enabled: true, formatter: (v) => `${Math.round(v)}%` }, legend: { position: "bottom", fontSize: "10px" },
      plotOptions: { pie: { donut: { size: "62%" } } }, stroke: { width: 2, colors: ["#fff"] },
      tooltip: { y: { formatter: (v, { seriesIndex }) => `${rows[seriesIndex].count} SKUs · ${v}%` } },
    };
    return { options: opts, series: rows.map((r) => r.pct) };
  }, [rows]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="donut" height={170} /></div>;
}

const BIAS_TAG = {
  "H2 heavy": { bg: "#fdecec", color: "#ef4444" }, "H2 lean": { bg: "#faeeda", color: "#d97706" },
  Balanced: { bg: "#f4f7fb", color: "#5d6678" }, "H1 lean": { bg: "#e6f1fb", color: "#185fa5" }, "H1 heavy": { bg: "#eaf3de", color: "#3b6d11" },
};
const CONF_TAG = { High: { bg: "#eaf3de", color: "#3b6d11" }, Medium: { bg: "#faeeda", color: "#d97706" }, Low: { bg: "#fdecec", color: "#ef4444" } };

function DetailTable({ rows }) {
  if (!rows?.length) return <div className="empty">No data</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>#</th><th>Product</th><th>Parent group</th><th>Sub-group</th><th>YTD</th><th>Flat fcst</th><th>Adj. fcst</th><th>H2 %</th><th>Bias</th><th>Stock</th><th>Days cvr</th><th>Action</th><th>Conf.</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const bt = BIAS_TAG[r.bias] || BIAS_TAG.Balanced;
            const ct = CONF_TAG[r.confidence] || CONF_TAG.Medium;
            const overForecast = r.flat > 0 && r.adjusted < r.flat * 0.5;
            return (
              <tr key={r.sku} style={overForecast ? { background: "#faf3e6" } : undefined}>
                <td>{i + 1}</td>
                <td><span className="strong">{r.sku.replace(/\s*MRP.*$/i, "")}</span></td>
                <td>{r.parentGroup}</td>
                <td style={{ color: "#5d6678", fontSize: 10 }}>{r.subGroup}</td>
                <td><span className="money">{money(r.ytd)}</span></td>
                <td><span className="money">{money(r.flat)}</span></td>
                <td style={overForecast ? { color: "#0e9456", fontWeight: 600 } : undefined}><span className="money">{money(r.adjusted)}</span></td>
                <td>{Math.round(r.h2Pct)}%</td>
                <td><span className="ig-signal" style={{ background: bt.bg, color: bt.color }}>{r.bias}</span></td>
                <td style={r.stock <= 0 ? { color: "#ef4444" } : undefined}>{r.stock.toLocaleString("en-IN")}</td>
                <td>{r.action === "H2 only" ? "-" : `${r.daysCover}d`}</td>
                <td><ActionTag action={r.action} /></td>
                <td><span className="ig-signal" style={{ background: ct.bg, color: ct.color }}>{r.confidence}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ProductForecastView() {
  const [targetIdx, setTargetIdx] = useState(0);
  const { data, loading, error } = useProductForecast("", targetIdx);

  if (!data && !loading && !error) {
    return (
      <div className="error-box info-box">
        No Google Sheet connected. Open <b>Data Source</b> (top right) and paste your sheet URL, then press <b>Sync Now</b>.
      </div>
    );
  }

  const currentFy  = data?.currentFy  || "";
  const forecastFy = data?.forecastFy || "";
  const kpis       = data?.kpis       || {};
  const alerts     = data?.alerts     || [];
  const flatVsAdjChart = data?.flatVsAdjChart || { skus: [], flat: [], adjusted: [] };
  const groupForecast = data?.groupForecast || [];
  const biasRisk   = data?.biasRisk   || [];
  const purchase   = data?.purchase   || [];
  const confidence = data?.confidence || [];
  const table      = data?.table      || [];
  const dataNotes  = data?.dataNotes  || [];

  const pm = kpis.projectedM1 || {};
  const pt = kpis.productsTracked || {};
  const tp = kpis.topProduct || {};
  const pg = kpis.parentGroups || {};
  const fva = kpis.flatVsAdj || {};

  return (
    <PageState loading={loading} error={error}>
      {data && (
        <div className="ig-wrap">
          <div className="ceo-header-row">
            <SectionHead code="PF" title="Product Forecast" sub={`SKU-level · seasonality-aware · purchase planning · ${shortFy(forecastFy)}`} />
            <div className="fy-toggle-wrap" style={{ display: "flex", gap: 4 }}>
              {HORIZONS.map((h) => (
                <button key={h.i} type="button" onClick={() => setTargetIdx(h.i)}
                  className={`ig-signal`} style={{ cursor: "pointer", padding: "5px 10px", border: "0.5px solid #b4b2a9", background: targetIdx === h.i ? "#e6f1fb" : "#fff", color: targetIdx === h.i ? "#185fa5" : "#5d6678", fontWeight: targetIdx === h.i ? 600 : 400 }}>
                  {h.label}
                </button>
              ))}
            </div>
          </div>

          {dataNotes.length > 1 && (
            <div className="sm-conc-note" style={{ background: "#faeeda", color: "#633806", marginBottom: 2 }}>{dataNotes[1]} Forecast is seasonality-adjusted, so H2-heavy SKUs are not over-ordered for an H1 month.</div>
          )}

          <div className="kpi-grid ca-kpi-grid">
            <KpiCard label={`Projected sales (${pm.month})`} value={bigMoney(pm.value)} delta="seasonality-adjusted" deltaTone="up" context={`vs flat ${bigMoney(fva.flat)}`} />
            <KpiCard label="Products tracked" value={String(pt.value)} delta={pt.newCount ? `${pt.newCount} new` : null} deltaTone="neu" context="active SKUs this year" />
            <KpiCard label="Top product" value={tp.name ? tp.name.replace(/\s*MRP.*$/i, "").slice(0, 16) : "-"} delta={tp.value ? bigMoney(tp.value) : null} deltaTone="up" context={tp.group || undefined} />
            <KpiCard label="Parent groups" value={String(pg.value)} delta={`from ${pg.subGroups} sub-groups`} deltaTone="up" context="rolled up for buyers" />
            <KpiCard label="Seasonality correction" value={`${fva.savedPct}%`} delta="flat would over-state" deltaTone="dn" context={`${bigMoney(fva.flat)} to ${bigMoney(fva.adjusted)}`} />
            <KpiCard label="H2-heavy in top 10" value={String(kpis.h2HeavyTop10?.value ?? 0)} delta="adjusted out of top" deltaTone="up" context="not over-forecast" />
          </div>

          <AlertBar alerts={alerts} />

          <div className="ceo-grid2">
            <Card title={`Top 10 products — flat vs season-adjusted · ${pm.month}`} sub="Full SKU names. Adjusted uses the target month's own seasonality.">
              <FlatVsAdjChart data={flatVsAdjChart} />
            </Card>
            <Card title={`Forecast by parent group · ${pm.month}`} sub="Rolled up to parent segments, flat vs season-adjusted">
              <GroupForecastChart rows={groupForecast} />
            </Card>
          </div>

          <div className="ceo-grid3">
            <Card title="Season bias risk — top SKUs" sub="H2-heavy SKUs a flat model over-forecasts in an H1 month">
              <BiasRisk rows={biasRisk} />
            </Card>
            <Card title={`Purchase planning · top 10`} sub="Stock, days of cover and the action the forecast should trigger">
              <PurchaseTable rows={purchase} />
            </Card>
            <Card title="Forecast confidence" sub="By months of sales history within the year">
              <ConfidenceDonut rows={confidence} />
            </Card>
          </div>

          <Card title="Product forecast detail — top 25" sub={`${shortFy(currentFy)} YTD, flat vs adjusted forecast, bias and purchase action. Highlighted rows = flat model would over-state.`}>
            <DetailTable rows={table} />
          </Card>
        </div>
      )}
    </PageState>
  );
}
