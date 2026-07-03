import React, { useMemo } from "react";
import ReactApexChart from "react-apexcharts";
import { useStateMis } from "../useStateMis.js";
import { SectionHead, Card } from "../components/ui.jsx";
import { LineChart } from "../components/InteractiveCharts.jsx";
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
const STATE_COLORS = ["#2a78d6", "#1baf7a", "#eda100", "#e34948", "#7c5cff", "#b4b2a9"];
const GROUP_COLORS = ["#2563eb", "#12b76a", "#eda100", "#7c5cff", "#e34948", "#b4b2a9"];

// ---- State 3-yr grouped bars ----
function StateTrendChart({ stateTrend }) {
  const { options, series } = useMemo(() => {
    if (!stateTrend?.states?.length) return { options: null, series: [] };
    const colors = ["#B5D4F4", "#85B7EB", "#2a78d6"];
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { columnWidth: "65%", borderRadius: 2 } },
      colors: colors.slice(-stateTrend.series.length),
      dataLabels: { enabled: false },
      legend: { position: "top", horizontalAlign: "left", fontSize: "12px" },
      grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: stateTrend.states, labels: { style: { colors: "#5d6678", fontSize: "10px" } }, axisBorder: { show: false } },
      yaxis: { logarithmic: true, labels: { formatter: (v) => bigMoney(v), style: { colors: "#5d6678", fontSize: "10px" } } },
      tooltip: { shared: true, intersect: false, y: { formatter: (v) => bigMoney(v) } },
    };
    return { options: opts, series: stateTrend.series.map((s) => ({ name: shortFy(s.name), data: s.values })) };
  }, [stateTrend]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={200} /></div>;
}

// ---- Segment mix by state (stacked %) ----
function SegmentByStateChart({ segmentByState }) {
  const { options, series } = useMemo(() => {
    if (!segmentByState?.length) return { options: null, series: [] };
    // collect union of top groups
    const groupSet = [];
    for (const s of segmentByState) for (const g of s.groups) if (!groupSet.includes(g.group)) groupSet.push(g.group);
    const top = groupSet.slice(0, 6);
    const states = segmentByState.map((s) => s.state);
    const ser = top.map((g) => ({
      name: g,
      data: segmentByState.map((s) => (s.groups.find((x) => x.group === g)?.pct) || 0),
    }));
    const opts = {
      chart: { type: "bar", stacked: true, toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { columnWidth: "55%", borderRadius: 1 } },
      colors: GROUP_COLORS,
      dataLabels: { enabled: false },
      legend: { position: "top", horizontalAlign: "left", fontSize: "10px" },
      grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: states, labels: { style: { colors: "#5d6678", fontSize: "10px" } } },
      yaxis: { max: 100, labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: "#5d6678", fontSize: "10px" } } },
      tooltip: { y: { formatter: (v) => `${v}%` } },
    };
    return { options: opts, series: ser };
  }, [segmentByState]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={200} /></div>;
}

// ---- YoY by state grouped bars ----
function StateYoYChart({ yoyByState }) {
  const { options, series } = useMemo(() => {
    if (!yoyByState?.length) return { options: null, series: [] };
    const pairNames = yoyByState[0]?.pairs.map((p) => p.pair) || [];
    const ser = pairNames.map((pn, idx) => ({
      name: pn,
      data: yoyByState.map((s) => s.pairs[idx]?.pct || 0),
    }));
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { columnWidth: "60%", borderRadius: 3 } },
      colors: ["#85B7EB", "#2a78d6"],
      dataLabels: { enabled: false },
      legend: { position: "top", horizontalAlign: "left", fontSize: "10px" },
      grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: yoyByState.map((s) => s.state), labels: { style: { colors: "#5d6678", fontSize: "10px" } } },
      yaxis: { labels: { formatter: (v) => `${v >= 0 ? "+" : ""}${Math.round(v)}%`, style: { colors: "#5d6678", fontSize: "10px" } } },
      tooltip: { shared: true, intersect: false, y: { formatter: (v) => `${v >= 0 ? "+" : ""}${v}% YoY` } },
    };
    return { options: opts, series: ser };
  }, [yoyByState]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={200} /></div>;
}

// ---- Concentration shift bars ----
function ConcentrationShift({ concentration }) {
  if (!concentration?.length) return <div className="empty">No data</div>;
  return (
    <div className="sm-conc">
      {concentration.map((c) => {
        const rows = c.rows.slice(0, 4);
        return (
          <div key={c.fy} className="sm-conc-block">
            <div className="sm-conc-fy">{shortFy(c.fy)}</div>
            <div className="sm-conc-bar">
              {rows.map((r, i) => (
                <div key={r.state} className="sm-conc-seg" style={{ flex: Math.max(r.pct, 0.5), background: STATE_COLORS[i % STATE_COLORS.length] }}>
                  {r.pct >= 8 ? `${r.state.split(" ").map((w) => w[0]).join("")} ${Math.round(r.pct)}%` : ""}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div className="sm-conc-note">Watch the dominant state's share fall over time as a healthy sign of diversification.</div>
    </div>
  );
}

// ---- Top cities list ----
function CityList({ cities }) {
  if (!cities?.length) return <div className="empty">No city data (station mapping unavailable)</div>;
  const max = Math.max(...cities.map((c) => c.net), 1);
  return (
    <div className="sm-city-list">
      {cities.map((c) => (
        <div key={c.station} className="sm-city-row">
          <span className="sm-city-name" title={c.station}>{c.station}</span>
          <div className="sm-city-track"><div className="sm-city-fill" style={{ width: `${Math.max(4, Math.round((c.net / max) * 100))}%` }} /></div>
          <span className="sm-city-val">{bigMoney(c.net)}</span>
        </div>
      ))}
    </div>
  );
}

// ---- Detail table ----
function DetailTable({ rows, fyList }) {
  if (!rows?.length) return <div className="empty">No state data</div>;
  const riskStyle = (risk) => {
    if (risk === "Conc. risk") return { bg: "#fdecec", color: "#ef4444" };
    if (risk === "1 party") return { bg: "#fdf2e3", color: "#d97706" };
    if (risk === "Expanding") return { bg: "#eef4ff", color: "#2563eb" };
    return { bg: "#f4f7fb", color: "#5d6678" };
  };
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th><th>State</th>
            {fyList.map((fy) => <th key={fy}>{shortFy(fy)}</th>)}
            <th>YoY %</th><th>Share</th><th>Parties</th><th>Bills</th><th>Avg bill</th><th>Returns</th><th>Risk</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const yoyColor = r.yoyPct == null ? "#5d6678" : r.yoyPct >= 0 ? "#12b76a" : "#ef4444";
            const rs = riskStyle(r.risk);
            return (
              <tr key={r.state}>
                <td>{i + 1}</td>
                <td><span className="strong">{r.state}</span></td>
                {fyList.map((fy) => (
                  <td key={fy}>{(r.perFy[fy] || 0) > 0 ? <span className="money">{money(r.perFy[fy])}</span> : <span style={{ color: "#97a0b2" }}>nil</span>}</td>
                ))}
                <td>{r.yoyPct != null ? <span style={{ color: yoyColor, fontWeight: 600 }}>{r.yoyPct >= 0 ? `+${r.yoyPct}` : r.yoyPct}%</span> : "-"}</td>
                <td>{r.sharePct}%</td>
                <td>{r.parties}</td>
                <td>{r.bills}</td>
                <td>{r.avgBill > 0 ? <span className="money">{money(r.avgBill)}</span> : "-"}</td>
                <td>{r.returns > 0 ? <span style={{ color: "#ef4444" }}>{money(r.returns)}</span> : "-"}</td>
                <td><span className="ig-signal" style={{ background: rs.bg, color: rs.color }}>{r.risk}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---- Outside-state parties table ----
function OutsideTable({ rows }) {
  if (!rows?.length) return <div className="empty">All parties are in the dominant state</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Party</th><th>State</th><th>{shortFy("current")} net</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.party + r.state}>
              <td><span className="strong">{r.party}</span></td>
              <td style={{ color: "#5d6678", fontSize: 12 }}>{r.state}</td>
              <td><span className="money">{money(r.net)}</span></td>
              <td><span className="ig-signal" style={{ background: r.status === "Active" ? "#e7f8ef" : "#fdf2e3", color: r.status === "Active" ? "#0e9456" : "#d97706" }}>{r.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StateMisView({ fy, onFy }) {
  const { data, loading, error } = useStateMis(fy);

  if (!data && !loading && !error) {
    return (
      <div className="error-box info-box">
        No Google Sheet connected. Open <b>Data Source</b> (top right) and paste your sheet URL, then press <b>Sync Now</b>.
      </div>
    );
  }

  const fyList     = data?.fyList     || [];
  const currentFy  = data?.currentFy  || "";
  const prevFy     = data?.prevFy     || null;
  const kpis       = data?.kpis       || {};
  const alerts     = data?.alerts     || [];
  const partialFys = useMemo(() => new Set(data?.partialFys || []), [data]);
  const stateTrend = data?.stateTrend || { states: [], series: [] };
  const stateMoM   = data?.stateMoM   || { months: [], series: [] };
  const concentration = data?.concentration || [];
  const segmentByState = data?.segmentByState || [];
  const yoyByState  = data?.yoyByState || [];
  const topCities   = data?.topCities  || [];
  const outsideParties = data?.outsideParties || [];
  const table       = data?.table      || [];

  const momSeries = stateMoM.series.map((s) => ({ name: s.name, values: s.values }));
  const ts = kpis.topStateShare || {};
  const sec = kpis.secondState;
  const tc = kpis.topCity;

  return (
    <PageState loading={loading} error={error}>
      {data && (
        <div className="sm-wrap">
          <div className="ceo-header-row">
            <SectionHead code="ST" title="State MIS" sub="3-year geographic view · state · city · segment mix" />
            <FyToggle fyList={fyList} value={fy} onChange={onFy} partialFys={partialFys} />
          </div>

          <div className="kpi-grid ca-kpi-grid">
            <KpiCard label={`States active (${shortFy(currentFy)})`} value={String(kpis.statesActive?.count ?? 0)}
              delta="actual" deltaTone="neu" context={(kpis.statesActive?.names || []).join(" · ")} />
            <KpiCard label={`${ts.state || "Top state"} share`} value={ts.pct ? `${ts.pct}%` : "-"}
              delta={ts.pct >= 85 ? "concentration" : null} deltaTone={ts.pct >= 85 ? "dn" : "neu"}
              context={ts.state ? `${bigMoney(ts.revenue)} of ${bigMoney(ts.total)}` : undefined} />
            <KpiCard label="Second state" value={sec ? sec.state : "-"}
              delta={sec ? `${sec.parties} part${sec.parties === 1 ? "y" : "ies"}` : null} deltaTone="neu"
              context={sec ? bigMoney(sec.revenue) : undefined} />
            <KpiCard label="Top city / station" value={tc ? tc.station : "-"}
              delta={tc ? bigMoney(tc.net) : null} deltaTone="neu" context={tc ? `${tc.sharePct}% of total` : undefined} />
            <KpiCard label={`Cities active (${shortFy(currentFy)})`} value={String(kpis.citiesActive ?? 0)}
              delta="stations" deltaTone="neu" context="mapped from account master" />
            <KpiCard label="Outside dominant state" value={String(outsideParties.length)}
              delta="parties" deltaTone="neu" context="expansion base" />
          </div>

          <AlertBar alerts={alerts} />

          <div className="ceo-grid2">
            <Card title="State revenue — 3-yr trend" sub="Net sales by state (log scale — dominant state dwarfs the rest)">
              <StateTrendChart stateTrend={stateTrend} />
            </Card>
            <Card title={`State MoM — ${shortFy(currentFy)}`} sub="Monthly net sales by state">
              <LineChart series={momSeries} months={stateMoM.months} labels={{}} />
            </Card>
          </div>

          <div className="ceo-grid2">
            <Card title="Geographic concentration — 3-yr shift" sub="% share of total revenue by state, each financial year">
              <ConcentrationShift concentration={concentration} />
            </Card>
            <Card title={`Segment mix by state · ${shortFy(currentFy)}`} sub="Which product groups sell where (% of each state's revenue)">
              <SegmentByStateChart segmentByState={segmentByState} />
            </Card>
          </div>

          <div className="ceo-grid2">
            <Card title={`Top cities · ${ts.state || "dominant state"}`} sub={`${shortFy(currentFy)} station-wise net sales`}>
              <CityList cities={topCities} />
            </Card>
            <Card title="State YoY growth — 3 years" sub="Year-over-year growth per state">
              <StateYoYChart yoyByState={yoyByState} />
            </Card>
          </div>

          <Card title="Outside the dominant state — all parties" sub={`${shortFy(currentFy)} · expansion targets and follow-ups`}>
            <OutsideTable rows={outsideParties} />
          </Card>

          <Card title="State detail" sub={`All states sorted by ${currentFy} net sales — 3-year view with party and bill counts`}>
            <DetailTable rows={table} fyList={fyList} />
          </Card>
        </div>
      )}
    </PageState>
  );
}
