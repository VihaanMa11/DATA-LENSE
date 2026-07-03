import React, { useMemo } from "react";
import ReactApexChart from "react-apexcharts";
import { useCashBank } from "../useCashBank.js";
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
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(1)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(1)} L`;
  return `${s}₹${Math.round(a).toLocaleString("en-IN")}`;
}
function shortFy(fy) {
  const m = String(fy || "").match(/FY\s*\d{4}-(\d{2})/i);
  return m ? `FY${m[1]}` : fy;
}
const BANK_COLORS = ["#2a78d6", "#1baf7a", "#eda100", "#b4b2a9", "#e34948"];

function CashFlowChart({ mom }) {
  const { options, series } = useMemo(() => {
    if (!mom?.months?.length) return { options: null, series: [] };
    const k = (a) => a.map((v) => Math.round(v / 1e5));
    const opts = {
      chart: { type: "line", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      colors: ["#1baf7a", "#e34948", "#2a78d6"], stroke: { width: [0, 0, 2] },
      plotOptions: { bar: { columnWidth: "70%", borderRadius: 2 } }, dataLabels: { enabled: false },
      legend: { position: "top", horizontalAlign: "left", fontSize: "10px" },
      grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: mom.months, labels: { style: { colors: "#5d6678", fontSize: "9px" } } },
      yaxis: { labels: { formatter: (v) => `₹${v}L`, style: { colors: "#5d6678", fontSize: "9px" } } },
      tooltip: { shared: true, intersect: false, y: { formatter: (v) => `₹${v}L` } },
    };
    return { options: opts, series: [
      { name: "Receipts", type: "column", data: k(mom.receipts) },
      { name: "Payments", type: "column", data: k(mom.payments) },
      { name: "Net cumulative", type: "line", data: k(mom.running) },
    ] };
  }, [mom]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="line" height={185} /></div>;
}

function NetFlow3yrChart({ netFlow3yr }) {
  const { options, series } = useMemo(() => {
    if (!netFlow3yr?.series?.length) return { options: null, series: [] };
    const colors = ["#B5D4F4", "#85B7EB", "#2a78d6"];
    const opts = {
      chart: { type: "line", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      colors: colors.slice(-netFlow3yr.series.length), stroke: { width: 2, curve: "smooth" },
      dataLabels: { enabled: false }, legend: { position: "top", horizontalAlign: "left", fontSize: "10px" },
      grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: netFlow3yr.months, labels: { style: { colors: "#5d6678", fontSize: "9px" } } },
      yaxis: { labels: { formatter: (v) => `₹${Math.round(v / 1e5)}L`, style: { colors: "#5d6678", fontSize: "9px" } } },
      annotations: { yaxis: [{ y: 0, borderColor: "#e34948", strokeDashArray: 4 }] },
      tooltip: { shared: true, intersect: false, y: { formatter: (v) => bigMoney(v) } },
    };
    return { options: opts, series: netFlow3yr.series.map((s) => ({ name: shortFy(s.name), data: s.values })) };
  }, [netFlow3yr]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="line" height={185} /></div>;
}

function BankNetList({ rows }) {
  if (!rows?.length) return <div className="empty">No bank data</div>;
  const tag = (status) => {
    if (status === "Deficit") return { bg: "#fdecec", color: "#ef4444", label: "Net payout" };
    if (status === "Primary") return { bg: "#e6f1fb", color: "#185fa5", label: "Primary" };
    return { bg: "#eaf3de", color: "#3b6d11", label: "Surplus" };
  };
  return (
    <div className="cb-acct-list">
      {rows.map((b, i) => {
        const t = tag(b.status);
        return (
          <div key={b.name} className="cb-acct-row">
            <span className="cb-acct-dot" style={{ background: BANK_COLORS[i % BANK_COLORS.length] }} />
            <span className="cb-acct-name">{b.name}</span>
            <span className="cb-acct-io">In {bigMoney(b.in)} · Out {bigMoney(b.out)}</span>
            <span className="cb-acct-net" style={{ color: b.net >= 0 ? "#0e9456" : "#ef4444" }}>Net {b.net >= 0 ? "+" : ""}{bigMoney(b.net)}</span>
            <span className="ig-signal" style={{ background: t.bg, color: t.color }}>{t.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ReceiptByBankChart({ data }) {
  const { options, series } = useMemo(() => {
    if (!data?.series?.length) return { options: null, series: [] };
    const opts = {
      chart: { type: "bar", stacked: true, toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { columnWidth: "70%", borderRadius: 1 } }, colors: BANK_COLORS,
      dataLabels: { enabled: false }, legend: { position: "top", horizontalAlign: "left", fontSize: "10px" },
      grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: data.months, labels: { style: { colors: "#5d6678", fontSize: "9px" } } },
      yaxis: { labels: { formatter: (v) => `₹${Math.round(v / 1e5)}L`, style: { colors: "#5d6678", fontSize: "9px" } } },
      tooltip: { y: { formatter: (v) => bigMoney(v) } },
    };
    return { options: opts, series: data.series.map((s) => ({ name: s.name, data: s.values })) };
  }, [data]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={185} /></div>;
}

function CollRateChart({ data }) {
  const { options, series } = useMemo(() => {
    if (!data?.values?.length) return { options: null, series: [] };
    const colors = data.values.map((r) => (r >= 90 ? "#1baf7a" : r >= 70 ? "#eda100" : "#e34948"));
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { columnWidth: "62%", borderRadius: 2, distributed: true } }, colors,
      dataLabels: { enabled: false }, legend: { show: false },
      grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: data.months, labels: { style: { colors: "#5d6678", fontSize: "9px" } } },
      yaxis: { labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: "#5d6678", fontSize: "9px" } } },
      annotations: { yaxis: [{ y: 100, borderColor: "#b4b2a9", strokeDashArray: 4 }] },
      tooltip: { y: { formatter: (v) => `${v}%` } },
    };
    return { options: opts, series: [{ name: "Collection rate", data: data.values }] };
  }, [data]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={150} /></div>;
}

function BalancesTable({ rows }) {
  if (!rows?.length) return <div className="empty">No opening balances in account master</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Account</th><th>Opening</th><th>Type</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td><span className="strong">{r.name}</span></td>
              <td>{bigMoney(r.openingDr)}</td>
              <td><span className="ig-signal" style={{ background: r.openingDr >= 0 ? "#e6f1fb" : "#fdf2e3", color: r.openingDr >= 0 ? "#185fa5" : "#d97706" }}>{r.openingDr >= 0 ? "Dr" : "Cr"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BankTable({ rows, fyList }) {
  if (!rows?.length) return <div className="empty">No bank data</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Bank account</th>
            {fyList.map((fy) => <th key={fy} colSpan={3} style={{ textAlign: "center" }}>{shortFy(fy)}</th>)}
          </tr>
          <tr>
            <th></th>
            {fyList.map((fy) => <React.Fragment key={fy}><th>In</th><th>Out</th><th>Net</th></React.Fragment>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.bank}>
              <td><span className="strong">{r.bank}</span></td>
              {fyList.map((fy) => {
                const c = r.perFy[fy] || { in: 0, out: 0, net: 0 };
                return (
                  <React.Fragment key={fy}>
                    <td><span className="money">{c.in ? money(c.in) : "-"}</span></td>
                    <td><span className="money">{c.out ? money(c.out) : "-"}</span></td>
                    <td style={{ color: c.net >= 0 ? "#0e9456" : "#ef4444", fontWeight: 600 }}>{c.net ? `${c.net >= 0 ? "+" : ""}${bigMoney(c.net)}` : "-"}</td>
                  </React.Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CashBankView({ fy, onFy }) {
  const { data, loading, error } = useCashBank(fy);

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
  const cashFlowMoM = data?.cashFlowMoM || { months: [], receipts: [], payments: [], running: [] };
  const netFlow3yr = data?.netFlow3yr || { months: [], series: [] };
  const bankNet    = data?.bankNet    || [];
  const receiptByBank = data?.receiptByBank || { months: [], series: [] };
  const collectionRateMoM = data?.collectionRateMoM || { months: [], values: [] };
  const balances   = data?.balances   || [];
  const table      = data?.table      || [];

  const pb = kpis.primaryBank;
  const wc = kpis.worstCollMonth;

  return (
    <PageState loading={loading} error={error}>
      {data && (
        <div className="ig-wrap">
          <div className="ceo-header-row">
            <SectionHead code="CB" title="Cash & Bank" sub="3-year view · receipts · payments · net flow · bank-wise · collection" />
            <FyToggle fyList={fyList} value={fy} onChange={onFy} partialFys={partialFys} />
          </div>

          <div className="kpi-grid ca-kpi-grid">
            <KpiCard label={`Total receipts (${shortFy(currentFy)})`} value={bigMoney(kpis.totalReceipts?.cur)} delta="bank + cash" deltaTone="up" context="money in" />
            <KpiCard label="Total payments" value={bigMoney(kpis.totalPayments?.cur)} delta="vendor + expense" deltaTone="neu" context="money out" />
            <KpiCard label="Net cash surplus" value={bigMoney(kpis.netSurplus?.cur)} delta={kpis.netSurplus?.cur >= 0 ? "receipts > payments" : "deficit"} deltaTone={kpis.netSurplus?.cur >= 0 ? "up" : "dn"} context="in minus out" />
            <KpiCard label="Primary receipt bank" value={pb ? pb.name : "-"} delta={pb ? `${pb.sharePct}% of receipts` : null} deltaTone="neu" context="largest inflow channel" />
            <KpiCard label={`Worst collection month`} value={wc && wc.month !== "-" ? `${wc.rate}%` : "-"} delta={wc && wc.month !== "-" ? wc.month : null} deltaTone="dn" context={wc && wc.billed ? `${bigMoney(wc.recv)} of ${bigMoney(wc.billed)} billed` : undefined} />
            <KpiCard label="Overall collection rate" value={kpis.collectionRate?.cur ? `${kpis.collectionRate.cur}%` : "-"} delta="receipts / billed" deltaTone={kpis.collectionRate?.cur >= 90 ? "up" : "neu"} context={shortFy(currentFy)} />
          </div>

          <AlertBar alerts={alerts} />

          <div className="ceo-grid2">
            <Card title={`Net cash flow MoM · ${shortFy(currentFy)}`} sub="Receipts vs payments with running net balance">
              <CashFlowChart mom={cashFlowMoM} />
            </Card>
            <Card title="Net cash flow MoM — 3-year overlay" sub="Monthly net (receipts minus payments) per financial year">
              <NetFlow3yrChart netFlow3yr={netFlow3yr} />
            </Card>
          </div>

          <div className="ceo-grid2">
            <Card title={`Bank account — receipts vs payments · ${shortFy(currentFy)}`} sub="Net flow per account. Green = net receipt, red = net payout.">
              <BankNetList rows={bankNet} />
            </Card>
            <Card title={`Receipt source by bank · ${shortFy(currentFy)}`} sub="Monthly receipts split by account">
              <ReceiptByBankChart data={receiptByBank} />
            </Card>
          </div>

          <div className="ceo-grid2">
            <Card title={`Monthly collection rate · ${shortFy(currentFy)}`} sub="Receipts divided by sales billed. Green >= 90%, red < 70%.">
              <CollRateChart data={collectionRateMoM} />
            </Card>
            <Card title="Account balances" sub="Opening balances from account master (bank / cash groups)">
              <BalancesTable rows={balances} />
            </Card>
          </div>

          <Card title="3-year cash summary — bank-wise" sub="Receipts, payments and net per account across financial years">
            <BankTable rows={table} fyList={fyList} />
          </Card>
        </div>
      )}
    </PageState>
  );
}
