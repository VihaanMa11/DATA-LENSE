import React, { useMemo } from "react";
import { useSalesmanAnalysis } from "../useSalesmanAnalysis.js";
import { SectionHead, Card, money } from "../components/ui.jsx";
import { BarChart, LineChart } from "../components/InteractiveCharts.jsx";
import { FyToggle } from "../components/ceo/FyToggle.jsx";
import { KpiCard } from "../components/ceo/KpiCard.jsx";
import { AlertBar } from "../components/ceo/AlertBar.jsx";
import { PageState } from "./pageKit.jsx";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

const TREND_COLORS = { Growing: "#12b76a", Declining: "#ef4444", Stable: "#8a93a6" };
function TrendTag({ trend }) {
  const color = TREND_COLORS[trend] || "#8a93a6";
  return <span style={{ color, fontWeight: 600 }}>{trend}</span>;
}

// ---------------------------------------------------------------------------
// Leaderboard bar chart — sorted by magnitude (small team, no cap needed)
// ---------------------------------------------------------------------------
function LeaderboardChart({ leaderboard }) {
  if (!leaderboard?.length) return <div className="empty">No data</div>;
  const rows = leaderboard.map((l) => [l.role ? `${l.name} (${l.role})` : l.name, l.value]);
  return <BarChart rows={rows} />;
}

// ---------------------------------------------------------------------------
// Customer coverage table
// ---------------------------------------------------------------------------
function CoverageTable({ rows }) {
  if (!rows?.length) return <div className="empty">No data</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Salesman</th>
            <th>Customers</th>
            <th>Bills</th>
            <th>Avg Bill</th>
            <th>SKUs</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td><span className="strong">{r.name}</span></td>
              <td>{r.customers}</td>
              <td>{r.bills}</td>
              <td><span className="money">{money(r.avgBill)}</span></td>
              <td>{r.skus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail table
// ---------------------------------------------------------------------------
function DetailTable({ rows, fyList }) {
  if (!rows?.length) return <div className="empty">No salesman data</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Salesman</th>
            <th>Role</th>
            {fyList.map((fy) => <th key={fy}>{shortFy(fy)}</th>)}
            <th>YoY %</th>
            <th>Share</th>
            <th>Cust.</th>
            <th>Bills</th>
            <th>Avg Bill</th>
            <th>Return %</th>
            <th>SKUs</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const yoyColor = r.yoyPct == null ? "#5d6678" : r.yoyPct >= 0 ? "#12b76a" : "#ef4444";
            return (
              <tr key={r.name}>
                <td>{i + 1}</td>
                <td><span className="strong">{r.name}</span></td>
                <td style={{ fontSize: 12, color: "#5d6678" }}>{r.role || "-"}</td>
                {fyList.map((fy) => (
                  <td key={fy}>
                    {(r.perFy[fy] || 0) > 0
                      ? <span className="money">{money(r.perFy[fy])}</span>
                      : <span style={{ color: "#97a0b2" }}>nil</span>}
                  </td>
                ))}
                <td>
                  {r.yoyPct != null
                    ? <span style={{ color: yoyColor, fontWeight: 600 }}>{r.yoyPct >= 0 ? `+${r.yoyPct}` : r.yoyPct}%</span>
                    : "-"}
                </td>
                <td>{r.sharePct}%</td>
                <td>{r.customers}</td>
                <td>{r.bills}</td>
                <td><span className="money">{money(r.avgBill)}</span></td>
                <td style={{ color: r.returnPct >= 15 ? "#ef4444" : "inherit" }}>{r.returnPct}%</td>
                <td>{r.skus}</td>
                <td><TrendTag trend={r.trend} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main: SalesmanAnalysisView
// ---------------------------------------------------------------------------
export function SalesmanAnalysisView({ fy, onFy }) {
  const { data, loading, error } = useSalesmanAnalysis(fy);

  if (!data && !loading && !error) {
    return (
      <div className="error-box info-box">
        No Google Sheet connected. Open <b>Data Source</b> (top right) and paste your sheet URL, then press <b>Sync Now</b>.
      </div>
    );
  }

  const fyList        = data?.fyList        || [];
  const currentFy      = data?.currentFy     || "";
  const prevFy          = data?.prevFy        || null;
  const kpis            = data?.kpis          || {};
  const alerts           = data?.alerts        || [];
  const partialFys = useMemo(() => new Set(data?.partialFys || []), [data]);
  const leaderboard = data?.leaderboard || [];
  const momTrend = data?.momTrend || { months: [], series: [] };
  const coverage = data?.coverage || [];
  const trend3yr = data?.trend3yr || { fys: [], series: [] };
  const table = data?.table || [];
  const dataNotes = data?.dataNotes || [];
  const companyNetSales = data?.companyNetSales || 0;

  const top = kpis.topSalesman || {};
  const team = kpis.teamNetSales || {};
  const trendSeries = trend3yr.series;
  const trendMonths = trend3yr.fys.map(shortFy);

  return (
    <PageState loading={loading} error={error}>
      {data && (
        <div className="ig-wrap">
          <div className="ceo-header-row">
            <SectionHead code="SM" title="Salesman Analysis" sub="3-year sales-team view · leaderboard · coverage · trend" />
            <FyToggle fyList={fyList} value={fy} onChange={onFy} partialFys={partialFys} />
          </div>

          {dataNotes.length > 0 && (
            <div style={{ background: "#faeeda", color: "#633806", padding: "8px 12px", borderRadius: 8, marginBottom: 8, fontSize: 13 }}>
              {dataNotes[0]}
            </div>
          )}

          <div className="kpi-grid ca-kpi-grid">
            <KpiCard label={`Team Net Sales (${shortFy(currentFy)})`} value={bigMoney(team.cur)}
              delta={team.yoyPct != null ? `${team.yoyPct >= 0 ? "+" : ""}${team.yoyPct}% vs ${shortFy(prevFy)}` : null}
              deltaTone={team.yoyPct == null ? "neu" : team.yoyPct >= 0 ? "up" : "dn"}
              context={`Company net sales: ${bigMoney(companyNetSales)}`} />
            <KpiCard label="Top Salesman" value={top.name || "-"}
              delta={top.sharePct ? `${top.sharePct}% share` : null} deltaTone="up"
              context={top.role ? `${top.role} · ${bigMoney(top.value)}` : undefined} />
            <KpiCard label="Active Salesmen" value={String(kpis.activeSalesmen?.count ?? 0)}
              delta={shortFy(currentFy)} deltaTone="neu" context={`of ${kpis.activeSalesmen?.total ?? 0} tracked`} />
            <KpiCard label="Avg per Salesman" value={bigMoney(kpis.avgPerSalesman?.cur)}
              delta="team average" deltaTone="neu" context={`${shortFy(currentFy)} net sales`} />
            <KpiCard label="Customers Reached" value={String(kpis.customersReached?.cur ?? 0)}
              delta="unique parties" deltaTone="neu" context="not exclusive per salesman" />
            <KpiCard label={`Declining (${shortFy(currentFy)})`} value={String(kpis.declining?.count ?? 0)}
              delta={prevFy ? `vs ${shortFy(prevFy)}` : null} deltaTone={kpis.declining?.count > 0 ? "dn" : "up"}
              context={(kpis.declining?.names || []).join(" · ") || undefined} />
          </div>

          <AlertBar alerts={alerts} />

          <div className="ceo-grid2">
            <Card title={`Leaderboard — ${shortFy(currentFy)}`} sub="Net sales per salesman (Sales less Sales Return)">
              <LeaderboardChart leaderboard={leaderboard} />
            </Card>
            <Card title={`MoM trend — top 5 · ${shortFy(currentFy)}`} sub="Monthly net sales">
              <LineChart series={momTrend.series} months={momTrend.months} labels={{}} />
            </Card>
          </div>

          <div className="ceo-grid2">
            <Card title="Net sales — 3-yr trend" sub="Per salesman, per financial year">
              <LineChart series={trendSeries} months={trendMonths} labels={{}} />
            </Card>
            <Card title={`Customer coverage — ${shortFy(currentFy)}`} sub="Reach, bills and average bill value per salesman">
              <CoverageTable rows={coverage} />
            </Card>
          </div>

          <Card title="Salesman detail" sub={`All salesmen sorted by ${shortFy(currentFy)} net sales — 3-year view`}>
            <DetailTable rows={table} fyList={fyList} />
          </Card>
        </div>
      )}
    </PageState>
  );
}
