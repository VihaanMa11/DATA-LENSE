import React, { useMemo, useState } from "react";
import ReactApexChart from "react-apexcharts";
import { useGeoAnalysis } from "../useGeoAnalysis.js";
import { SectionHead, Card } from "../components/ui.jsx";
import { KpiCard } from "../components/ceo/KpiCard.jsx";
import { PageState } from "./pageKit.jsx";
import { money } from "../components/chartTheme.js";

function bigMoney(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
function shortFy(fy) { const m = String(fy || "").match(/FY\s*\d{4}-(\d{2})/i); return m ? `FY${m[1]}` : fy; }
const STATE_COLORS = ["#2a78d6", "#1baf7a", "#eda100", "#e34948", "#7c5cff", "#b4b2a9"];
const SEG_COLORS = ["#2a78d6", "#1baf7a", "#eda100", "#4a3aa7", "#e34948", "#b4b2a9"];
function tierOf(sales) { if (sales >= 1e7) return "Champion"; if (sales >= 5e5) return "Loyal"; if (sales >= 1e5) return "Growing"; return "New"; }
const TIER_TAG = { Champion: { bg: "#eaf3de", color: "#3b6d11" }, Loyal: { bg: "#e6f1fb", color: "#185fa5" }, Growing: { bg: "#f3e8ff", color: "#7c3aed" }, New: { bg: "#f4f7fb", color: "#5d6678" } };

function Chip({ active, onClick, children, color }) {
  return <button type="button" onClick={onClick} style={{ cursor: "pointer", padding: "4px 11px", borderRadius: 99, fontSize: 11, border: `0.5px solid ${active ? (color || "#85b7eb") : "#b4b2a9"}`, background: active ? (color ? color + "22" : "#e6f1fb") : "#fff", color: active ? (color || "#185fa5") : "#5d6678", fontWeight: active ? 600 : 400 }}>{children}</button>;
}

function StateTrendChart({ trend }) {
  const { options, series } = useMemo(() => {
    if (!trend?.states?.length) return { options: null, series: [] };
    const colors = ["#B5D4F4", "#85B7EB", "#2a78d6"];
    return { options: { chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter" }, plotOptions: { bar: { columnWidth: "65%", borderRadius: 2 } }, colors: colors.slice(-trend.series.length), dataLabels: { enabled: false }, legend: { position: "top", horizontalAlign: "left", fontSize: "10px" }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 }, xaxis: { categories: trend.states, labels: { style: { colors: "#5d6678", fontSize: "9px" } } }, yaxis: { logarithmic: true, labels: { formatter: (v) => bigMoney(v), style: { colors: "#5d6678", fontSize: "9px" } } }, tooltip: { shared: true, intersect: false, y: { formatter: (v) => bigMoney(v) } } }, series: trend.series.map((s) => ({ name: shortFy(s.name), data: s.values })) };
  }, [trend]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={170} /></div>;
}

function StateMoMChart({ mom }) {
  const { options, series } = useMemo(() => {
    if (!mom?.series?.length) return { options: null, series: [] };
    return { options: { chart: { type: "bar", stacked: true, toolbar: { show: false }, background: "transparent", fontFamily: "Inter" }, plotOptions: { bar: { columnWidth: "72%", borderRadius: 1 } }, colors: STATE_COLORS, dataLabels: { enabled: false }, legend: { position: "top", horizontalAlign: "left", fontSize: "10px" }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 }, xaxis: { categories: mom.months, labels: { style: { colors: "#5d6678", fontSize: "9px" } } }, yaxis: { labels: { formatter: (v) => bigMoney(v), style: { colors: "#5d6678", fontSize: "9px" } } }, tooltip: { y: { formatter: (v) => bigMoney(v) } } }, series: mom.series.map((s) => ({ name: s.name, data: s.values })) };
  }, [mom]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={170} /></div>;
}

function CityChart({ parties }) {
  const { options, series } = useMemo(() => {
    const byCity = new Map();
    for (const p of parties) { if (p.city === "Unmapped") continue; byCity.set(p.city, (byCity.get(p.city) || 0) + p.sales); }
    const top = [...byCity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    if (!top.length) return { options: null, series: [] };
    return { options: { chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter" }, plotOptions: { bar: { horizontal: true, borderRadius: 2, barHeight: "72%" } }, colors: ["#2a78d6"], dataLabels: { enabled: false }, legend: { show: false }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 }, xaxis: { categories: top.map((x) => x[0]), labels: { formatter: (v) => bigMoney(v), style: { colors: "#5d6678", fontSize: "8px" } } }, yaxis: { labels: { style: { colors: "#5d6678", fontSize: "8px" } } }, tooltip: { y: { formatter: (v) => bigMoney(v) } } }, series: [{ name: "Revenue", data: top.map((x) => x[1]) }] };
  }, [parties]);
  if (!options) return <div className="empty">No city data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={240} /></div>;
}

function SegByStateChart({ segByState }) {
  const { options, series } = useMemo(() => {
    if (!segByState?.length) return { options: null, series: [] };
    const groupSet = []; for (const s of segByState) for (const g of s.groups) if (!groupSet.includes(g.group)) groupSet.push(g.group);
    const top = groupSet.slice(0, 6);
    return { options: { chart: { type: "bar", stacked: true, toolbar: { show: false }, background: "transparent", fontFamily: "Inter" }, plotOptions: { bar: { columnWidth: "58%", borderRadius: 1 } }, colors: SEG_COLORS, dataLabels: { enabled: false }, legend: { position: "top", horizontalAlign: "left", fontSize: "9px" }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 }, xaxis: { categories: segByState.map((s) => s.state), labels: { style: { colors: "#5d6678", fontSize: "9px" } } }, yaxis: { max: 100, labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: "#5d6678", fontSize: "9px" } } }, tooltip: { y: { formatter: (v) => `${v}%` } } }, series: top.map((g) => ({ name: g, data: segByState.map((s) => s.groups.find((x) => x.group === g)?.pct || 0) })) };
  }, [segByState]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={240} /></div>;
}

function ConcDonut({ conc }) {
  const { options, series } = useMemo(() => {
    if (!conc?.length) return { options: null, series: [] };
    return { options: { chart: { type: "donut", background: "transparent", fontFamily: "Inter" }, labels: conc.map((c) => c.state), colors: STATE_COLORS, dataLabels: { enabled: true, formatter: (v) => `${Math.round(v)}%` }, legend: { position: "bottom", fontSize: "9px" }, plotOptions: { pie: { donut: { size: "62%" } } }, stroke: { width: 2, colors: ["#fff"] }, tooltip: { y: { formatter: (v, { seriesIndex }) => `${bigMoney(conc[seriesIndex].value)} · ${v}%` } } }, series: conc.map((c) => c.pct) };
  }, [conc]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="donut" height={160} /></div>;
}

function QtrChart({ quarterly }) {
  const { options, series } = useMemo(() => {
    if (!quarterly?.values?.length) return { options: null, series: [] };
    return { options: { chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter" }, plotOptions: { bar: { columnWidth: "55%", borderRadius: 3, distributed: true } }, colors: ["#B5D4F4", "#85B7EB", "#85B7EB", "#2a78d6"], dataLabels: { enabled: false }, legend: { show: false }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 }, xaxis: { categories: ["Q1", "Q2", "Q3", "Q4"], labels: { style: { colors: "#5d6678", fontSize: "9px" } } }, yaxis: { labels: { formatter: (v) => bigMoney(v), style: { colors: "#5d6678", fontSize: "9px" } } }, tooltip: { y: { formatter: (v) => bigMoney(v) } } }, series: [{ name: quarterly.state, data: quarterly.values }] };
  }, [quarterly]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={160} /></div>;
}

function ReturnChart({ parties }) {
  const { options, series } = useMemo(() => {
    const top = [...parties].filter((p) => p.retPct > 0).sort((a, b) => b.retPct - a.retPct).slice(0, 6);
    if (!top.length) return { options: null, series: [] };
    return { options: { chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter" }, plotOptions: { bar: { horizontal: true, borderRadius: 2, barHeight: "62%", distributed: true } }, colors: top.map((p) => (p.retPct >= 10 ? "#e34948" : "#eda100")), dataLabels: { enabled: false }, legend: { show: false }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 }, xaxis: { categories: top.map((p) => p.name.slice(0, 16)), labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: "#5d6678", fontSize: "8px" } } }, yaxis: { labels: { style: { colors: "#5d6678", fontSize: "8px" } } }, tooltip: { y: { formatter: (v) => `${v}% return` } } }, series: [{ name: "Return %", data: top.map((p) => p.retPct) }] };
  }, [parties]);
  if (!options) return <div className="empty">No returns</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={160} /></div>;
}

function PartyTable({ rows }) {
  if (!rows?.length) return <div className="empty">No parties match the filter</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Party</th><th>State</th><th>City</th><th>Sales</th><th>Bills</th><th>Avg bill</th><th>Active mo</th><th>Pairs</th><th>Share</th><th>Return %</th><th>Tier</th></tr></thead>
        <tbody>
          {rows.map((p, i) => {
            const tier = tierOf(p.sales); const tt = TIER_TAG[tier];
            return (
              <tr key={p.name}>
                <td>{i + 1}</td><td><span className="strong">{p.name}</span></td><td>{p.state}</td>
                <td style={{ color: "#5d6678", fontSize: 10 }}>{p.city}</td>
                <td><span className="money">{money(p.sales)}</span></td><td>{p.bills}</td>
                <td><span className="money">{money(p.avgBill)}</span></td><td>{p.months}</td>
                <td>{p.qty.toLocaleString("en-IN")}</td><td>{p.share}%</td>
                <td style={p.retPct >= 10 ? { color: "#ef4444", fontWeight: 600 } : undefined}>{p.retPct}%</td>
                <td><span className="ig-signal" style={{ background: tt.bg, color: tt.color }}>{tier}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function GeoAnalysisView() {
  const { data, loading, error } = useGeoAnalysis("");
  const [state, setState] = useState("all");
  const [tier, setTier] = useState("all");

  if (!data && !loading && !error) {
    return <div className="error-box info-box">No Google Sheet connected. Open <b>Data Source</b> (top right) and paste your sheet URL, then press <b>Sync Now</b>.</div>;
  }

  const currentFy = data?.currentFy || "";
  const allParties = data?.parties || [];
  const states = useMemo(() => [...new Set(allParties.map((p) => p.state))], [allParties]);
  const filtered = useMemo(() => allParties.filter((p) => (state === "all" || p.state === state) && (tier === "all" || tierOf(p.sales) === tier)), [allParties, state, tier]);

  const kpis = data?.kpis || {};
  const ts = kpis.topStateConc || {};
  const tp = kpis.topParty || {};
  const rr = kpis.returnRate || {};

  return (
    <PageState loading={loading} error={error}>
      {data && (
        <div className="ig-wrap">
          <div className="ceo-header-row">
            <SectionHead code="GC" title="Geographic Customer Analysis" sub={`${shortFy(currentFy)} · state · city · party tier · segment mix`} />
          </div>

          <div className="slicer-bar" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "8px 10px", background: "#fff", border: "0.5px solid rgba(11,11,11,.1)", borderRadius: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: "#898781" }}>State</span>
            <Chip active={state === "all"} onClick={() => setState("all")}>All</Chip>
            {states.map((s, i) => <Chip key={s} active={state === s} onClick={() => setState(s)} color={STATE_COLORS[i % STATE_COLORS.length]}>{s}</Chip>)}
            <span style={{ width: 1, height: 18, background: "#b4b2a9", margin: "0 4px" }} />
            <span style={{ fontSize: 10, fontWeight: 500, color: "#898781" }}>Tier</span>
            {["all", "Champion", "Loyal", "Growing", "New"].map((t) => <Chip key={t} active={tier === t} onClick={() => setTier(t)}>{t === "all" ? "All" : t}</Chip>)}
          </div>

          <div className="kpi-grid ca-kpi-grid">
            <KpiCard label="Total trade sales" value={bigMoney(filtered.reduce((s, p) => s + p.sales, 0))} delta={state === "all" ? "all states" : state} deltaTone="neu" context={`${filtered.length} parties`} />
            <KpiCard label="Active parties" value={String(filtered.length)} delta={`${new Set(filtered.map((p) => p.state)).size} states`} deltaTone="neu" context="filtered" />
            <KpiCard label={`${ts.state || "Top state"} concentration`} value={ts.pct ? `${ts.pct}%` : "-"} delta={ts.pct >= 85 ? "extreme risk" : null} deltaTone={ts.pct >= 85 ? "dn" : "neu"} context={ts.state ? `${bigMoney(ts.value)} of ${bigMoney(ts.total)}` : undefined} />
            <KpiCard label="Top party" value={tp.name ? tp.name.slice(0, 16) : "-"} delta={tp.sales ? bigMoney(tp.sales) : null} deltaTone="up" context={tp.city ? `${tp.city} · ${tp.share}%` : undefined} />
            <KpiCard label="Avg bill size" value={bigMoney(kpis.avgBill?.cur)} delta={`${kpis.avgBill?.bills || 0} bills`} deltaTone="neu" context="all parties" />
            <KpiCard label="Return rate" value={rr.cur != null ? `${rr.cur}%` : "-"} delta={rr.worst ? "worst party flagged" : null} deltaTone="dn" context={rr.worst ? rr.worst.slice(0, 18) : undefined} />
          </div>

          <div className="ceo-grid2">
            <Card title="Revenue by state — 3-year trend" sub="Net sales by state (log scale)"><StateTrendChart trend={data.stateTrend} /></Card>
            <Card title={`Monthly sales by state · ${shortFy(currentFy)}`} sub="Stacked ₹ by state"><StateMoMChart mom={data.stateMoM} /></Card>
          </div>

          <div className="ceo-grid2">
            <Card title="Top 15 cities by revenue" sub="Filtered by the slicer above"><CityChart parties={filtered} /></Card>
            <Card title="Segment mix by state" sub="% of each state's revenue by product segment"><SegByStateChart segByState={data.segByState} /></Card>
          </div>

          <div className="ceo-grid3">
            <Card title="Geo concentration" sub="Revenue share by state"><ConcDonut conc={data.concentration} /></Card>
            <Card title={`Quarterly pattern · ${data.quarterly?.state || ""}`} sub="Revenue by quarter"><QtrChart quarterly={data.quarterly} /></Card>
            <Card title="Return rate — problem parties" sub="Highest sales-return % parties"><ReturnChart parties={filtered} /></Card>
          </div>

          <Card title={`Customer geographic detail — ${filtered.length} parties`} sub={`${shortFy(currentFy)} · sorted by revenue`}>
            <PartyTable rows={filtered} />
          </Card>
        </div>
      )}
    </PageState>
  );
}
