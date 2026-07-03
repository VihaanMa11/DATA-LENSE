import React, { useMemo } from "react";
import ReactApexChart from "react-apexcharts";
import { useExpenseAnalysis } from "../useExpenseAnalysis.js";
import { SectionHead, Card } from "../components/ui.jsx";
import { FyToggle } from "../components/ceo/FyToggle.jsx";
import { KpiCard } from "../components/ceo/KpiCard.jsx";
import { AlertBar } from "../components/ceo/AlertBar.jsx";
import { PageState } from "./pageKit.jsx";
import { money } from "../components/chartTheme.js";

function bigMoney(v) {
  const n = Number(v) || 0;
  const s = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(1)} L`;
  return `${s}₹${Math.round(a).toLocaleString("en-IN")}`;
}
function shortFy(fy) {
  const m = String(fy || "").match(/FY\s*\d{4}-(\d{2})/i);
  return m ? `FY${m[1]}` : fy;
}
const CAT_COLORS = { Salary: "#2a78d6", Suspense: "#e34948", Marketing: "#eda100", Admin: "#7c5cff", Rent: "#1baf7a", Logistics: "#4a3aa7", Utilities: "#12b76a", Finance: "#b4b2a9", Other: "#b4b2a9" };

function Bridge({ rows }) {
  if (!rows?.length) return <div className="empty">No data</div>;
  const base = Math.abs(rows[0]?.value || 1);
  const color = (kind) => kind === "base" || kind === "subtotal" ? "#0e9456" : kind === "total" ? (rows[rows.length - 1].value >= 0 ? "#0e9456" : "#ef4444") : "#e34948";
  return (
    <div className="exp-bridge">
      {rows.map((r, i) => {
        const w = Math.max(2, Math.round((Math.abs(r.value) / base) * 100));
        const strong = r.kind === "base" || r.kind === "subtotal" || r.kind === "total";
        return (
          <div key={i} className={`exp-bridge-row${strong ? " strong" : ""}${r.kind === "total" ? " total" : ""}`}>
            <span className="exp-bridge-label" style={r.kind === "suspense" ? { color: "#ef4444", fontWeight: 600 } : undefined}>{r.label}</span>
            <span className="exp-bridge-amt" style={{ color: color(r.kind) }}>{r.value >= 0 ? "" : ""}{bigMoney(r.value)}</span>
            <div className="exp-bridge-track"><div className="exp-bridge-fill" style={{ width: `${w}%`, background: color(r.kind), border: r.kind === "suspense" ? "1px dashed #a32d2d" : "none" }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function CategoryDonut({ mix }) {
  const { options, series } = useMemo(() => {
    if (!mix?.length) return { options: null, series: [] };
    const opts = {
      chart: { type: "donut", background: "transparent", fontFamily: "Inter, sans-serif" },
      labels: mix.map((m) => m.category), colors: mix.map((m) => CAT_COLORS[m.category] || "#b4b2a9"),
      dataLabels: { enabled: true, formatter: (v) => `${Math.round(v)}%` },
      legend: { position: "bottom", fontSize: "10px" }, plotOptions: { pie: { donut: { size: "62%" } } },
      stroke: { width: 2, colors: ["#fff"] },
      tooltip: { y: { formatter: (v, { seriesIndex }) => `${bigMoney(mix[seriesIndex].value)} · ${v}%` } },
    };
    return { options: opts, series: mix.map((m) => m.pct) };
  }, [mix]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="donut" height={195} /></div>;
}

function MarginTrendChart({ trend }) {
  const { options, series } = useMemo(() => {
    if (!trend?.length) return { options: null, series: [] };
    const opts = {
      chart: { type: "line", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      colors: ["#2a78d6", "#e34948", "#1baf7a"], stroke: { width: [2, 2, 1.5], dashArray: [0, 0, 4] },
      dataLabels: { enabled: false }, markers: { size: 4 },
      legend: { position: "top", horizontalAlign: "left", fontSize: "10px" }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: trend.map((t) => shortFy(t.fy)), labels: { style: { colors: "#5d6678", fontSize: "9px" } } },
      yaxis: { labels: { formatter: (v) => `${v}%`, style: { colors: "#5d6678", fontSize: "9px" } } },
      annotations: { yaxis: [{ y: 0, borderColor: "#b4b2a9", strokeDashArray: 4 }] },
      tooltip: { shared: true, intersect: false, y: { formatter: (v) => `${v}%` } },
    };
    return { options: opts, series: [
      { name: "Gross margin %", data: trend.map((t) => t.grossMarginPct) },
      { name: "Expense % of sales", data: trend.map((t) => t.expPctSales) },
      { name: "Net margin %", data: trend.map((t) => t.netMarginPct) },
    ] };
  }, [trend]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="line" height={165} /></div>;
}

function SalaryTrendChart({ trend }) {
  const { options, series } = useMemo(() => {
    if (!trend?.length) return { options: null, series: [] };
    const opts = {
      chart: { type: "line", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      colors: ["#2a78d6", "#e34948"], stroke: { width: [0, 2] },
      plotOptions: { bar: { columnWidth: "45%", borderRadius: 2 } }, dataLabels: { enabled: false },
      legend: { position: "top", horizontalAlign: "left", fontSize: "10px" }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: trend.map((t) => shortFy(t.fy)), labels: { style: { colors: "#5d6678", fontSize: "9px" } } },
      yaxis: [
        { seriesName: "Salary", labels: { formatter: (v) => bigMoney(v), style: { colors: "#5d6678", fontSize: "9px" } } },
        { opposite: true, seriesName: "% of sales", max: 8, labels: { formatter: (v) => `${v}%`, style: { colors: "#e34948", fontSize: "9px" } } },
      ],
      tooltip: { shared: true, intersect: false },
    };
    return { options: opts, series: [
      { name: "Salary", type: "column", data: trend.map((t) => t.salary) },
      { name: "% of sales", type: "line", data: trend.map((t) => t.pctSales) },
    ] };
  }, [trend]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="line" height={165} /></div>;
}

function CategoryPctChart({ data }) {
  const { options, series } = useMemo(() => {
    if (!data?.series?.length) return { options: null, series: [] };
    const colors = ["#B5D4F4", "#85B7EB", "#2a78d6"];
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { columnWidth: "70%", borderRadius: 2 } }, colors: colors.slice(-data.series.length),
      dataLabels: { enabled: false }, legend: { position: "top", horizontalAlign: "left", fontSize: "10px" },
      grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: data.categories, labels: { style: { colors: "#5d6678", fontSize: "9px" }, rotate: -20 } },
      yaxis: { labels: { formatter: (v) => `${v}%`, style: { colors: "#5d6678", fontSize: "9px" } } },
      tooltip: { shared: true, intersect: false, y: { formatter: (v) => `${v}% of sales` } },
    };
    return { options: opts, series: data.series.map((s) => ({ name: shortFy(s.name), data: s.values })) };
  }, [data]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={170} /></div>;
}

function SalaryBreakChart({ rows }) {
  const { options, series } = useMemo(() => {
    if (!rows?.length) return { options: null, series: [] };
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { horizontal: true, borderRadius: 2, barHeight: "68%" } }, colors: ["#2a78d6"],
      dataLabels: { enabled: false }, legend: { show: false }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: rows.map((r) => r.name), labels: { formatter: (v) => bigMoney(v), style: { colors: "#5d6678", fontSize: "8px" } } },
      yaxis: { labels: { style: { colors: "#5d6678", fontSize: "8px" } } },
      tooltip: { y: { formatter: (v) => bigMoney(v) } },
    };
    return { options: opts, series: [{ name: "Salary", data: rows.map((r) => r.value) }] };
  }, [rows]);
  if (!options) return <div className="empty">Salary is a single account</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={170} /></div>;
}

const TYPE_TAG = { Fixed: { bg: "#fdecec", color: "#ef4444" }, Variable: { bg: "#eaf3de", color: "#3b6d11" }, Unknown: { bg: "#fdecec", color: "#ef4444" } };
function DetailTable({ rows, fyList }) {
  if (!rows?.length) return <div className="empty">No expense data</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Account</th><th>Category</th>
            {fyList.map((fy) => <th key={fy}>{shortFy(fy)}</th>)}
            <th>YoY %</th><th>% sales</th><th>Type</th><th>Flag</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const tt = TYPE_TAG[r.type] || TYPE_TAG.Variable;
            const flagRed = r.flag === "Clear now";
            const yoyColor = r.yoyPct == null ? "#5d6678" : r.yoyPct >= 0 ? "#ef4444" : "#12b76a";
            return (
              <tr key={r.account} style={r.category === "Suspense" ? { background: "#fdecec" } : undefined}>
                <td><span className="strong" style={r.category === "Suspense" ? { color: "#ef4444" } : undefined}>{r.account}</span></td>
                <td style={{ color: "#5d6678", fontSize: 11 }}>{r.category}</td>
                {fyList.map((fy) => (
                  <td key={fy}>{(r.perFy[fy] || 0) > 0 ? <span className="money">{money(r.perFy[fy])}</span> : <span style={{ color: "#97a0b2" }}>nil</span>}</td>
                ))}
                <td>{r.yoyPct != null ? <span style={{ color: yoyColor, fontWeight: 600 }}>{r.yoyPct >= 0 ? `+${r.yoyPct}` : r.yoyPct}%</span> : "-"}</td>
                <td>{r.pctSales}%</td>
                <td><span className="ig-signal" style={{ background: tt.bg, color: tt.color }}>{r.type}</span></td>
                <td><span className="ig-signal" style={{ background: flagRed ? "#fdecec" : r.flag === "Rising" ? "#faeeda" : "#f4f7fb", color: flagRed ? "#ef4444" : r.flag === "Rising" ? "#d97706" : "#5d6678" }}>{r.flag}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ExpenseAnalysisView({ fy, onFy }) {
  const { data, loading, error } = useExpenseAnalysis(fy);

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
  const bridge     = data?.bridge     || [];
  const categoryMix = data?.categoryMix || [];
  const marginTrend = data?.marginTrend || [];
  const salaryTrend = data?.salaryTrend || [];
  const salaryAccts = data?.salaryAccts || [];
  const categoryPctTrend = data?.categoryPctTrend || { categories: [], series: [] };
  const table      = data?.table      || [];
  const dataNotes  = data?.dataNotes  || [];

  const te = kpis.totalExpenses || {};
  const sal = kpis.salary || {};
  const gp = kpis.grossProfit || {};
  const nop = kpis.nop || {};
  const su = kpis.suspense || {};

  return (
    <PageState loading={loading} error={error}>
      {data && (
        <div className="ig-wrap">
          <div className="ceo-header-row">
            <SectionHead code="EX" title="Expense Analysis" sub="3-year view · salary · opex · P&L bridge · suspense flag" />
            <FyToggle fyList={fyList} value={fy} onChange={onFy} partialFys={partialFys} />
          </div>

          {dataNotes.length > 1 && (
            <div className="sm-conc-note" style={{ background: "#faeeda", color: "#633806", marginBottom: 2 }}>{dataNotes[1]}</div>
          )}

          <div className="kpi-grid ca-kpi-grid">
            <KpiCard label={`Total expenses (${shortFy(currentFy)})`} value={bigMoney(te.cur)} delta={te.pctSales ? `${te.pctSales}% of sales` : null} deltaTone="neu" context="net operating expenses" />
            <KpiCard label="Total salary" value={bigMoney(sal.cur)} delta={sal.pctExp ? `${sal.pctExp}% of expenses` : null} deltaTone="dn" context={`${sal.pctSales}% of net sales · largest cost`} />
            <KpiCard label="Gross profit" value={bigMoney(gp.cur)} delta={gp.marginPct ? `${gp.marginPct}% margin` : null} deltaTone="up" context="net sales - COGS" />
            <KpiCard label="Net operating profit" value={bigMoney(nop.cur)} delta={nop.cur >= 0 ? "profit" : "operating loss"} deltaTone={nop.cur >= 0 ? "up" : "dn"} context="gross profit - expenses" />
            <KpiCard label="Suspense (unclassified)" value={bigMoney(su.cur)} delta={su.pctExp ? `${su.pctExp}% of expenses` : null} deltaTone="dn" context="clear before trusting P&L" />
            <KpiCard label="Salary as % of net sales" value={sal.pctSales ? `${sal.pctSales}%` : "-"} delta={shortFy(currentFy)} deltaTone="neu" context="payroll efficiency" />
          </div>

          <AlertBar alerts={alerts} />

          <div className="ceo-grid2">
            <Card title={`P&L bridge · ${shortFy(currentFy)}`} sub="From net sales to net operating profit, step by step">
              <Bridge rows={bridge} />
            </Card>
            <Card title={`Expense category mix · ${shortFy(currentFy)}`} sub={`${bigMoney(te.cur)} total by category`}>
              <CategoryDonut mix={categoryMix} />
            </Card>
          </div>

          <div className="ceo-grid2">
            <Card title="Gross margin % trend — 3 years" sub="Gross margin vs expense ratio vs net margin (complete years)">
              <MarginTrendChart trend={marginTrend} />
            </Card>
            <Card title="Salary trend — 3 years" sub="Payroll in ₹ and as % of net sales">
              <SalaryTrendChart trend={salaryTrend} />
            </Card>
          </div>

          <div className="ceo-grid3">
            <Card title="Expense % of sales — by category" sub="Category cost ratios across complete years">
              <CategoryPctChart data={categoryPctTrend} />
            </Card>
            <Card title={`Salary breakdown · ${shortFy(currentFy)}`} sub="Top salary accounts">
              <SalaryBreakChart rows={salaryAccts} />
            </Card>
            <Card title={`Expense detail · ${shortFy(currentFy)}`} sub="Top accounts by amount">
              <div style={{ maxHeight: 200, overflowY: "auto" }}><DetailTable rows={table} fyList={fyList} /></div>
            </Card>
          </div>
        </div>
      )}
    </PageState>
  );
}
