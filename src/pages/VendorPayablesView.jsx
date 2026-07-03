import React, { useMemo } from "react";
import ReactApexChart from "react-apexcharts";
import { useVendorPayables } from "../useVendorPayables.js";
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
function shortName(v) { return String(v || "").replace(/\s+(PVT\.?\s*LTD|LIMITED|PRIVATE)\.?$/i, "").trim(); }
const CONC_COLORS = ["#2a78d6", "#1baf7a", "#eda100", "#b4b2a9"];
const TYPE_COLORS = { Footwear: "#2a78d6", Material: "#1baf7a", Services: "#eda100", Capex: "#e34948", Other: "#b4b2a9" };

function PurchaseMoM({ data }) {
  const { options, series } = useMemo(() => {
    if (!data?.months?.length) return { options: null, series: [] };
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { columnWidth: "62%", borderRadius: 2 } }, colors: ["#2a78d6"],
      dataLabels: { enabled: false }, legend: { show: false }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: data.months, labels: { style: { colors: "#5d6678", fontSize: "9px" } } },
      yaxis: { labels: { formatter: (v) => bigMoney(v), style: { colors: "#5d6678", fontSize: "9px" } } },
      tooltip: { y: { formatter: (v) => bigMoney(v) } },
    };
    return { options: opts, series: [{ name: "Net purchase", data: data.values }] };
  }, [data]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={185} /></div>;
}

function ConcentrationShift({ concentration }) {
  if (!concentration?.length) return <div className="empty">No data</div>;
  return (
    <div className="sm-conc">
      {concentration.map((c) => {
        const rows = c.rows;
        return (
          <div key={c.fy} className="sm-conc-block">
            <div className="sm-conc-fy">{shortFy(c.fy)}</div>
            <div className="sm-conc-bar">
              {rows.map((r, i) => (
                <div key={r.vendor} className="sm-conc-seg" style={{ flex: Math.max(r.pct, 0.5), background: CONC_COLORS[i % CONC_COLORS.length] }}>
                  {r.pct >= 12 ? `${r.vendor.slice(0, 8)} ${Math.round(r.pct)}%` : ""}
                </div>
              ))}
              {c.othersPct > 0 && <div className="sm-conc-seg" style={{ flex: c.othersPct, background: "#d6deea", color: "#5d6678" }}>{c.othersPct >= 10 ? `Others ${Math.round(c.othersPct)}%` : ""}</div>}
            </div>
          </div>
        );
      })}
      <div className="sm-conc-note">Watch the top suppliers' share fall over time as a healthy diversification signal.</div>
    </div>
  );
}

function VendorTypeDonut({ types }) {
  const { options, series } = useMemo(() => {
    if (!types?.length) return { options: null, series: [] };
    const opts = {
      chart: { type: "donut", background: "transparent", fontFamily: "Inter, sans-serif" },
      labels: types.map((t) => t.type), colors: types.map((t) => TYPE_COLORS[t.type] || "#b4b2a9"),
      dataLabels: { enabled: true, formatter: (v) => `${Math.round(v)}%` },
      legend: { position: "bottom", fontSize: "10px" }, plotOptions: { pie: { donut: { size: "62%" } } },
      stroke: { width: 2, colors: ["#fff"] },
      tooltip: { y: { formatter: (v, { seriesIndex }) => `${bigMoney(types[seriesIndex].value)} · ${v}%` } },
    };
    return { options: opts, series: types.map((t) => t.pct) };
  }, [types]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="donut" height={185} /></div>;
}

function PurchaseTrendChart({ trend }) {
  const { options, series } = useMemo(() => {
    if (!trend?.vendors?.length) return { options: null, series: [] };
    const colors = ["#B5D4F4", "#85B7EB", "#2a78d6"];
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { columnWidth: "65%", borderRadius: 2 } }, colors: colors.slice(-trend.series.length),
      dataLabels: { enabled: false }, legend: { position: "top", horizontalAlign: "left", fontSize: "10px" },
      grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: trend.vendors, labels: { style: { colors: "#5d6678", fontSize: "9px" } } },
      yaxis: { labels: { formatter: (v) => bigMoney(v), style: { colors: "#5d6678", fontSize: "9px" } } },
      tooltip: { shared: true, intersect: false, y: { formatter: (v) => bigMoney(v) } },
    };
    return { options: opts, series: trend.series.map((s) => ({ name: shortFy(s.name), data: s.values })) };
  }, [trend]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={185} /></div>;
}

const TYPE_TAG = { Footwear: { bg: "#e6f1fb", color: "#185fa5" }, Material: { bg: "#eaf3de", color: "#3b6d11" }, Services: { bg: "#faeeda", color: "#633806" }, Capex: { bg: "#fdecec", color: "#ef4444" }, Other: { bg: "#f4f7fb", color: "#5d6678" } };
const FLAG_TAG = { OK: { bg: "#f4f7fb", color: "#5d6678" }, Classify: { bg: "#fdecec", color: "#ef4444" }, "Check returns": { bg: "#faeeda", color: "#d97706" } };

function DetailTable({ rows, fyList, currentFy }) {
  if (!rows?.length) return <div className="empty">No vendor data</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Vendor</th><th>Type</th>
            {fyList.map((fy) => <th key={fy}>{shortFy(fy)}</th>)}
            <th>Share</th><th>YoY %</th><th>Ret %</th><th>Trend</th><th>Flag</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const tt = TYPE_TAG[r.type] || TYPE_TAG.Other;
            const ft = FLAG_TAG[r.flag] || FLAG_TAG.OK;
            const yoyColor = r.yoyPct == null ? "#5d6678" : r.yoyPct >= 0 ? "#12b76a" : "#ef4444";
            return (
              <tr key={r.vendor}>
                <td><span className="strong">{shortName(r.vendor)}</span></td>
                <td><span className="ig-signal" style={{ background: tt.bg, color: tt.color }}>{r.type}</span></td>
                {fyList.map((fy) => (
                  <td key={fy}>{(r.perFy[fy] || 0) > 0 ? <span className="money">{money(r.perFy[fy])}</span> : <span style={{ color: "#97a0b2" }}>nil</span>}</td>
                ))}
                <td>{r.sharePct}%</td>
                <td>{r.yoyPct != null ? <span style={{ color: yoyColor, fontWeight: 600 }}>{r.yoyPct >= 0 ? `+${r.yoyPct}` : r.yoyPct}%</span> : "-"}</td>
                <td>{r.returnPct > 0 ? `${r.returnPct}%` : "-"}</td>
                <td>{r.trend}</td>
                <td><span className="ig-signal" style={{ background: ft.bg, color: ft.color }}>{r.flag}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function VendorPayablesView({ fy, onFy }) {
  const { data, loading, error } = useVendorPayables(fy);

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
  const purchaseMoM = data?.purchaseMoM || { months: [], values: [] };
  const concentration = data?.concentration || [];
  const vendorTypes = data?.vendorTypes || [];
  const purchaseTrend = data?.purchaseTrend || { vendors: [], series: [] };
  const table      = data?.table      || [];
  const dataNotes  = data?.dataNotes  || [];

  const tv = kpis.topVendor;
  const t2 = kpis.top2Share;
  const yoy = kpis.purchaseYoY;

  return (
    <PageState loading={loading} error={error}>
      {data && (
        <div className="ig-wrap">
          <div className="ceo-header-row">
            <SectionHead code="VP" title="Vendor & Payables" sub="3-year view · purchase · concentration · vendor mix" />
            <FyToggle fyList={fyList} value={fy} onChange={onFy} partialFys={partialFys} />
          </div>

          {dataNotes.length > 0 && (
            <div className="sm-conc-note" style={{ background: "#faeeda", color: "#633806", marginBottom: 2 }}>
              {dataNotes[1] || dataNotes[0]}
            </div>
          )}

          <div className="kpi-grid ca-kpi-grid">
            <KpiCard label={`Net purchase (${shortFy(currentFy)})`} value={bigMoney(kpis.totalPurchase?.cur)} delta="purchase - returns" deltaTone="neu" context="actual from registers" />
            <KpiCard label="Total payable" value={bigMoney(kpis.totalPayable?.cur)} delta="from account master" deltaTone="neu" context="opening balances (not live)" />
            <KpiCard label="Active vendors" value={String(kpis.vendorCount?.cur ?? 0)} delta="material" deltaTone="neu" context={`of ${kpis.vendorCount?.total ?? 0} in registers`} />
            <KpiCard label="Top 2 vendor share" value={t2?.pct ? `${t2.pct}%` : "-"} delta={t2?.names?.length ? t2.names.map(shortName).map((n) => n.split(" ")[0]).join(" + ") : null} deltaTone="dn" context="concentration risk" />
            <KpiCard label="Largest vendor" value={tv ? shortName(tv.name).split(" ")[0] : "-"} delta={tv ? `${tv.sharePct}% share` : null} deltaTone="neu" context={tv ? bigMoney(tv.revenue) : undefined} />
            <KpiCard label="Purchase YoY" value={yoy?.cur != null ? `${yoy.cur >= 0 ? "+" : ""}${yoy.cur}%` : "-"} delta={yoy?.prevFy ? `vs ${shortFy(yoy.prevFy)}` : null} deltaTone={yoy?.cur >= 0 ? "up" : "dn"} context="net purchase growth" />
          </div>

          <AlertBar alerts={alerts} />

          <div className="ceo-grid2">
            <Card title={`Net purchase MoM · ${shortFy(currentFy)}`} sub="Monthly net purchase from all vendors">
              <PurchaseMoM data={purchaseMoM} />
            </Card>
            <Card title="Vendor concentration — 3-year shift" sub="% share of net purchase by top vendors each year">
              <ConcentrationShift concentration={concentration} />
            </Card>
          </div>

          <div className="ceo-grid2">
            <Card title={`Vendor type breakdown · ${shortFy(currentFy)}`} sub="Purchase split by vendor category">
              <VendorTypeDonut types={vendorTypes} />
            </Card>
            <Card title="Purchase trend — top vendors · 3-year" sub="Net purchase by top 3 vendors and others">
              <PurchaseTrendChart trend={purchaseTrend} />
            </Card>
          </div>

          <Card title="Vendor detail" sub={`All vendors sorted by ${currentFy} net purchase — 3-year view with category and flags`}>
            <DetailTable rows={table} fyList={fyList} currentFy={currentFy} />
          </Card>
        </div>
      )}
    </PageState>
  );
}
