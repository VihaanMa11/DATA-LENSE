import React, { useMemo, useState } from "react";
import ReactApexChart from "react-apexcharts";
import { useProductAnalysis } from "../useProductAnalysis.js";
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
function pairsFmt(n) { const v = Number(n) || 0; return v >= 1e5 ? `${(v / 1e5).toFixed(2)} L` : Math.round(v).toLocaleString("en-IN"); }
const BAND_COLORS = ["#e34948", "#eda100", "#2a78d6", "#2a78d6", "#4a3aa7"];

function Chip({ active, onClick, children }) {
  return <button type="button" onClick={onClick} style={{ cursor: "pointer", padding: "4px 11px", borderRadius: 99, fontSize: 11, border: `0.5px solid ${active ? "#85b7eb" : "#b4b2a9"}`, background: active ? "#e6f1fb" : "#fff", color: active ? "#185fa5" : "#5d6678", fontWeight: active ? 600 : 400 }}>{children}</button>;
}

function GroupTrendChart({ trend }) {
  const { options, series } = useMemo(() => {
    if (!trend?.groups?.length) return { options: null, series: [] };
    const colors = ["#B5D4F4", "#85B7EB", "#2a78d6"];
    return { options: { chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter" }, plotOptions: { bar: { columnWidth: "70%", borderRadius: 2 } }, colors: colors.slice(-trend.series.length), dataLabels: { enabled: false }, legend: { position: "top", horizontalAlign: "left", fontSize: "10px" }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 }, xaxis: { categories: trend.groups, labels: { style: { colors: "#5d6678", fontSize: "9px" }, rotate: -30, trim: true } }, yaxis: { labels: { formatter: (v) => bigMoney(v), style: { colors: "#5d6678", fontSize: "9px" } } }, tooltip: { shared: true, intersect: false, y: { formatter: (v) => bigMoney(v) } } }, series: trend.series.map((s) => ({ name: shortFy(s.name), data: s.values })) };
  }, [trend]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={195} /></div>;
}

function BarChart({ rows, valueKey, labelKey, fmt, colorFn, title }) {
  const { options, series } = useMemo(() => {
    if (!rows?.length) return { options: null, series: [] };
    return { options: { chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter" }, plotOptions: { bar: { horizontal: true, borderRadius: 2, barHeight: "66%", distributed: true } }, colors: rows.map(colorFn), dataLabels: { enabled: false }, legend: { show: false }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 }, xaxis: { categories: rows.map((r) => String(r[labelKey]).slice(0, 14)), labels: { formatter: fmt, style: { colors: "#5d6678", fontSize: "8px" } } }, yaxis: { labels: { style: { colors: "#5d6678", fontSize: "8px" } } }, tooltip: { y: { formatter: fmt } } }, series: [{ name: title, data: rows.map((r) => r[valueKey]) }] };
  }, [rows, valueKey, labelKey]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={170} /></div>;
}

function BubbleChart({ groups }) {
  const { options, series } = useMemo(() => {
    const rows = groups.slice(0, 10);
    if (!rows.length) return { options: null, series: [] };
    const maxP = Math.max(...rows.map((r) => r.avgPrice), 1);
    return { options: { chart: { type: "bubble", toolbar: { show: false }, background: "transparent", fontFamily: "Inter" }, dataLabels: { enabled: false }, fill: { opacity: 0.72 }, colors: ["#2a78d6", "#1baf7a", "#eda100", "#4a3aa7", "#e34948", "#b4b2a9", "#7c5cff", "#0e9456", "#d946ef", "#06b6d4"], legend: { show: false }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 }, xaxis: { tickAmount: 6, title: { text: "Volume share %", style: { color: "#5d6678", fontSize: "10px" } }, labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: "#5d6678", fontSize: "9px" } } }, yaxis: { title: { text: "Revenue share %", style: { color: "#5d6678", fontSize: "10px" } }, labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: "#5d6678", fontSize: "9px" } } }, tooltip: { custom: ({ seriesIndex, w }) => { const d = w.config.series[seriesIndex]; const p = d.data[0]; return `<div style="padding:6px 8px;font-size:12px"><b>${d.name}</b><br/>vol ${p.x}% · rev ${p.y}%<br/>₹${p.price}/pair</div>`; } } }, series: rows.map((r) => ({ name: r.group, data: [{ x: r.volPct, y: r.revPct, z: Math.max(6, Math.round((r.avgPrice / maxP) * 26)), price: r.avgPrice }] })) };
  }, [groups]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bubble" height={200} /></div>;
}

function MrpBands({ bands }) {
  if (!bands?.length) return <div className="empty">No data</div>;
  const max = Math.max(...bands.map((b) => b.pct), 1);
  return (
    <div className="pp-mrp">
      {bands.map((b, i) => (
        <div key={b.label} className="pp-mrp-row">
          <span className="pp-mrp-label">{b.label}</span>
          <div className="pp-mrp-track"><div className="pp-mrp-fill" style={{ width: `${Math.max(2, (b.pct / max) * 100)}%`, background: BAND_COLORS[i] }} /></div>
          <span className="pp-mrp-val">{bigMoney(b.revenue)}</span>
          <span className="pp-mrp-sku">{b.skus} SKU</span>
          <span className="pp-mrp-pct">{b.pct}%</span>
        </div>
      ))}
    </div>
  );
}

function GroupTable({ rows }) {
  if (!rows?.length) return <div className="empty">No groups match</div>;
  const sig = (g) => g.margin != null && g.margin < 0 ? { t: "Loss", bg: "#fdecec", c: "#ef4444" } : g.st >= 95 ? { t: "Star", bg: "#eaf3de", c: "#3b6d11" } : g.slow > 10 ? { t: "Slow SKUs", bg: "#faeeda", c: "#d97706" } : { t: "Stable", bg: "#f4f7fb", c: "#5d6678" };
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Item group</th><th>Sales</th><th>Share</th><th>Pairs</th><th>{"₹"}/pr</th><th>SKUs</th><th>Buyers</th><th>Margin</th><th>ST%</th><th>H1 %</th><th>Ret%</th><th>Slow</th><th>Signal</th></tr></thead>
        <tbody>
          {rows.map((g, i) => {
            const s = sig(g);
            const mc = g.margin == null ? "#5d6678" : g.margin < 0 ? "#ef4444" : g.margin > 30 ? "#0e9456" : "#5d6678";
            const stc = g.st == null ? "#5d6678" : g.st >= 90 ? "#0e9456" : g.st >= 70 ? "#d97706" : "#ef4444";
            return (
              <tr key={g.group}>
                <td>{i + 1}</td><td><span className="strong">{g.group}</span></td>
                <td><span className="money">{money(g.sales)}</span></td><td>{g.share}%</td>
                <td>{pairsFmt(g.qty)}</td><td><span className="money">{money(g.avgPrice)}</span></td>
                <td>{g.skus}</td><td>{g.buyers}</td>
                <td style={{ color: mc, fontWeight: 600 }}>{g.margin != null ? `${g.margin}%` : "-"}</td>
                <td style={{ color: stc }}>{g.st != null ? `${g.st}%` : "-"}</td>
                <td>{Math.round(g.h1Pct)}%</td>
                <td style={g.retPct > 1 ? { color: "#ef4444" } : undefined}>{g.retPct}%</td>
                <td style={g.slow > 10 ? { color: "#ef4444" } : undefined}>{g.slow}</td>
                <td><span className="ig-signal" style={{ background: s.bg, color: s.c }}>{s.t}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SkuTable({ rows }) {
  if (!rows?.length) return <div className="empty">No SKUs match</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>#</th><th>SKU</th><th>Group</th><th>Revenue</th><th>Pairs</th><th>{"₹"}/pr</th><th>Buyers</th><th>Bills</th><th>H1 %</th><th>Share</th><th>Zone</th></tr></thead>
        <tbody>
          {rows.map((s, i) => {
            const zone = s.sales >= 1e6 ? { t: "Core", bg: "#eaf3de", c: "#3b6d11" } : s.sales >= 5e5 ? { t: "Support", bg: "#e6f1fb", c: "#185fa5" } : { t: "Tail", bg: "#f4f7fb", c: "#5d6678" };
            return (
              <tr key={s.name}>
                <td>{i + 1}</td><td><span className="strong">{s.name.replace(/\s*MRP.*$/i, "")}</span></td>
                <td style={{ color: "#5d6678", fontSize: 10 }}>{s.group}</td>
                <td><span className="money">{money(s.sales)}</span></td><td>{pairsFmt(s.qty)}</td>
                <td><span className="money">{money(s.avgPrice)}</span></td><td>{s.buyers}</td><td>{s.bills}</td>
                <td>{Math.round(s.h1Pct)}%</td><td>{s.share}%</td>
                <td><span className="ig-signal" style={{ background: zone.bg, color: zone.c }}>{zone.t}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ProductAnalysisView() {
  const { data, loading, error } = useProductAnalysis("");
  const [grp, setGrp] = useState("all");
  const [season, setSeason] = useState("all");

  if (!data && !loading && !error) {
    return <div className="error-box info-box">No Google Sheet connected. Open <b>Data Source</b> (top right) and paste your sheet URL, then press <b>Sync Now</b>.</div>;
  }

  const currentFy = data?.currentFy || "";
  const allGroups = data?.groups || [];
  const allSkus = data?.skus || [];
  const kpis = data?.kpis || {};
  const alerts = data?.alerts || [];

  const topGroupNames = useMemo(() => allGroups.slice(0, 7).map((g) => g.group), [allGroups]);
  const seasonOk = (h1) => season === "all" || (season === "h1" ? h1 > 60 : season === "h2" ? h1 < 40 : h1 >= 40 && h1 <= 60);
  const fGroups = useMemo(() => allGroups.filter((g) => (grp === "all" || g.group === grp) && seasonOk(g.h1Pct)), [allGroups, grp, season]);
  const fSkus = useMemo(() => allSkus.filter((s) => (grp === "all" || s.group === grp) && seasonOk(s.h1Pct)).slice(0, 20), [allSkus, grp, season]);

  const tg = kpis.topGroup || {};
  const bm = kpis.bestMargin || {};
  const wm = kpis.worstMargin || {};

  return (
    <PageState loading={loading} error={error}>
      {data && (
        <div className="ig-wrap">
          <div className="ceo-header-row">
            <SectionHead code="PA" title="Product Analysis" sub={`${shortFy(currentFy)} · groups · margin · sell-through · MRP · seasonality`} />
          </div>

          <div className="slicer-bar" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "8px 10px", background: "#fff", border: "0.5px solid rgba(11,11,11,.1)", borderRadius: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: "#898781" }}>Group</span>
            <Chip active={grp === "all"} onClick={() => setGrp("all")}>All</Chip>
            {topGroupNames.map((g) => <Chip key={g} active={grp === g} onClick={() => setGrp(g)}>{g}</Chip>)}
            <span style={{ width: 1, height: 18, background: "#b4b2a9", margin: "0 4px" }} />
            <span style={{ fontSize: 10, fontWeight: 500, color: "#898781" }}>Season</span>
            {[["all", "All"], ["h1", "H1-heavy"], ["balanced", "Balanced"], ["h2", "H2-heavy"]].map(([k, l]) => <Chip key={k} active={season === k} onClick={() => setSeason(k)}>{l}</Chip>)}
          </div>

          <div className="kpi-grid ca-kpi-grid">
            <KpiCard label="Total revenue (filtered)" value={bigMoney(fGroups.reduce((s, g) => s + g.sales, 0))} delta={`${fGroups.length} groups`} deltaTone="neu" context={`${fGroups.reduce((s, g) => s + g.skus, 0)} SKUs`} />
            <KpiCard label="Total pairs sold" value={pairsFmt(kpis.totalPairs?.cur)} delta={`avg ${money(kpis.totalPairs?.avgPrice)}/pair`} deltaTone="neu" context={shortFy(currentFy)} />
            <KpiCard label="Active SKUs" value={String(kpis.activeSkus?.cur ?? 0)} delta={kpis.activeSkus?.slow ? `${kpis.activeSkus.slow} slow` : null} deltaTone="dn" context="90d+ no sale" />
            <KpiCard label="Top group" value={tg.name || "-"} delta={tg.sales ? `${bigMoney(tg.sales)} · ${tg.share}%` : null} deltaTone="up" context={tg.st != null ? `${tg.st}% sell-through` : undefined} />
            <KpiCard label="Best gross margin" value={bm.margin != null ? `${bm.margin}%` : "-"} delta={bm.name || null} deltaTone="up" context="highest-margin group" />
            <KpiCard label="Lowest gross margin" value={wm.margin != null ? `${wm.margin}%` : "-"} delta={wm.group || null} deltaTone="dn" context={wm.margin < 0 ? "selling at a loss" : "watch"} />
          </div>

          <AlertBar alerts={alerts} />

          <div className="ceo-grid2">
            <Card title="Revenue by item group — 3-yr trend (top 8)" sub="Net sales per financial year"><GroupTrendChart trend={data.groupTrend} /></Card>
            <Card title="Volume vs value bubble" sub="Volume share vs revenue share, bubble = avg ₹/pair. Above the diagonal earns more per pair."><BubbleChart groups={fGroups} /></Card>
          </div>

          <div className="ceo-grid3">
            <Card title="Gross margin % by group" sub="Sales minus purchase cost"><BarChart rows={[...fGroups].filter((g) => g.margin != null).sort((a, b) => b.margin - a.margin).slice(0, 10)} valueKey="margin" labelKey="group" fmt={(v) => `${Math.round(v)}%`} colorFn={(g) => (g.margin < 0 ? "#e34948" : g.margin > 30 ? "#1baf7a" : "#85B7EB")} title="Margin" /></Card>
            <Card title="Sell-through by group" sub="Pairs sold / pairs purchased"><BarChart rows={[...fGroups].filter((g) => g.st != null).sort((a, b) => b.st - a.st).slice(0, 10)} valueKey="st" labelKey="group" fmt={(v) => `${Math.round(v)}%`} colorFn={(g) => (g.st >= 95 ? "#1baf7a" : g.st >= 80 ? "#eda100" : "#e34948")} title="ST" /></Card>
            <Card title="Slow movers by group" sub="SKUs with no sale in 90 days"><BarChart rows={[...fGroups].filter((g) => g.slow > 0).sort((a, b) => b.slow - a.slow).slice(0, 10)} valueKey="slow" labelKey="group" fmt={(v) => `${v}`} colorFn={(g) => (g.slow > 12 ? "#e34948" : g.slow > 6 ? "#eda100" : "#85B7EB")} title="Slow" /></Card>
          </div>

          <div className="ceo-grid2">
            <Card title="MRP band revenue mix" sub="Revenue by price tier"><MrpBands bands={data.mrpBands} /></Card>
            <Card title="Return rate by group" sub="Sales returns / gross sales"><BarChart rows={[...fGroups].filter((g) => g.retPct > 0).sort((a, b) => b.retPct - a.retPct).slice(0, 10)} valueKey="retPct" labelKey="group" fmt={(v) => `${v}%`} colorFn={(g) => (g.retPct > 1.5 ? "#e34948" : g.retPct > 0.7 ? "#eda100" : "#1baf7a")} title="Return" /></Card>
          </div>

          <Card title={`Item group detail — ${fGroups.length} groups`} sub={`${shortFy(currentFy)} · sorted by revenue`}><GroupTable rows={fGroups} /></Card>
          <Card title={`Top SKUs — ${fSkus.length}`} sub="Filtered by the slicer above"><SkuTable rows={fSkus} /></Card>
        </div>
      )}
    </PageState>
  );
}
