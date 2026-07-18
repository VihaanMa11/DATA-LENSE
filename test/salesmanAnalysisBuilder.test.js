import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSalesmanAnalysis, parseSalesman } from "../server/salesmanAnalysisBuilder.js";

const FY1 = "FY 2024-25";
const FY2 = "FY 2025-26";
const FY3 = "FY 2026-27";

test("parseSalesman splits name and role suffix", () => {
  assert.deepEqual(parseSalesman("LALIT (SALES MAN)"), { name: "LALIT", role: "Sales Man" });
  assert.deepEqual(parseSalesman("RAJ (SALES HEAD)"), { name: "RAJ", role: "Sales Head" });
  assert.deepEqual(parseSalesman("NO ROLE HERE"), { name: "NO ROLE HERE", role: "" });
  assert.equal(parseSalesman("").name, "Unassigned");
});

function saleH(fy, month, date, salesman, party, voucher, finalAmount, item = "SKU-A") {
  return { tx: "Sales", fy, month, date, salesman, party, voucher, finalAmount, item, isHeader: true };
}
function saleLine(fy, month, date, salesman, party, voucher, item) {
  // A non-header line row: no finalAmount, but carries item/salesman/party (forward-filled).
  return { tx: "Sales", fy, month, date, salesman, party, voucher, finalAmount: 0, item, isHeader: false };
}
function retH(fy, month, date, salesman, party, voucher, finalAmount) {
  // Sales Return carries a salesman in the source data (added after the first pass).
  return { tx: "Sales Return", fy, month, date, salesman, party, voucher, finalAmount, isHeader: true };
}

const M1 = ["2024-04", "2024-05", "2024-06", "2024-07", "2024-08", "2024-09", "2024-10", "2024-11", "2024-12", "2025-01", "2025-02", "2025-03"];
const M2 = ["2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"];

function fixture() {
  const f = [];
  // LALIT: consistent performer across FY1/FY2, 3 customers.
  M1.forEach((m, i) => f.push(saleH(FY1, m, `${m}-10`, "LALIT (SALES MAN)", "CUST-A", `L1-${i}`, 100000)));
  M2.forEach((m, i) => f.push(saleH(FY2, m, `${m}-10`, "LALIT (SALES MAN)", i % 2 === 0 ? "CUST-A" : "CUST-B", `L2-${i}`, 110000)));
  // RAJ (SALES HEAD): declining FY1 -> FY2.
  M1.forEach((m, i) => f.push(saleH(FY1, m, `${m}-05`, "RAJ (SALES HEAD)", "CUST-C", `R1-${i}`, 200000)));
  M2.forEach((m, i) => f.push(saleH(FY2, m, `${m}-05`, "RAJ (SALES HEAD)", "CUST-C", `R2-${i}`, 150000)));
  // Cash sale must not count as a "customer served".
  f.push(saleH(FY2, "2025-06", "2025-06-01", "LALIT (SALES MAN)", "Cash", "L2-CASH", 5000));
  // A non-header line row under LALIT's FY2 voucher, distinct SKU.
  f.push(saleLine(FY2, "2025-04", "2025-04-10", "LALIT (SALES MAN)", "CUST-A", "L2-0", "SKU-B"));
  // Sales Return attributed to LALIT specifically — must reduce LALIT's net, not RAJ's.
  f.push(retH(FY2, "2025-05", "2025-05-01", "LALIT (SALES MAN)", "CUST-A", "SR-1", 20000));
  // FY3 partial (2 months)
  ["2026-04", "2026-05"].forEach((m, i) => f.push(saleH(FY3, m, `${m}-10`, "LALIT (SALES MAN)", "CUST-A", `L3-${i}`, 120000)));
  return { itemFacts: f };
}

test("salesmanAnalysis: default currentFy latest complete, FY3 partial", () => {
  const r = buildSalesmanAnalysis(fixture(), {});
  assert.equal(r.currentFy, FY2);
  assert.deepEqual(r.partialFys, [FY3]);
  assert.equal(r.prevFy, FY1);
});

test("salesmanAnalysis: net sales per salesman (Sales less Sales Return), Cash excluded from customer count", () => {
  const r = buildSalesmanAnalysis(fixture(), { fy: FY2 });
  const lalit = r.table.find((t) => t.name === "LALIT");
  // gross = 12*110000 + 5000 (Cash sale) = 1,325,000; return = 20,000 -> net = 1,305,000
  assert.equal(lalit.perFy[FY2], 12 * 110000 + 5000 - 20000);
  assert.equal(lalit.customers, 2); // CUST-A + CUST-B, Cash excluded
});

test("salesmanAnalysis: a salesman's own return reduces their own net, not a colleague's", () => {
  const r = buildSalesmanAnalysis(fixture(), { fy: FY2 });
  const raj = r.table.find((t) => t.name === "RAJ");
  // RAJ has no returns this FY, so RAJ's net must equal RAJ's gross exactly.
  assert.equal(raj.perFy[FY2], 12 * 150000);
  const lalit = r.table.find((t) => t.name === "LALIT");
  assert.ok(lalit.returnPct > 0, "LALIT must show a nonzero return %");
  assert.equal(raj.returnPct, 0, "RAJ must show 0% return, the LALIT return must not leak onto RAJ");
});

test("salesmanAnalysis: role parsed onto leaderboard and table rows", () => {
  const r = buildSalesmanAnalysis(fixture(), { fy: FY2 });
  const raj = r.table.find((t) => t.name === "RAJ");
  assert.equal(raj.role, "Sales Head");
  const lalitBoard = r.leaderboard.find((l) => l.name === "LALIT");
  assert.equal(lalitBoard.role, "Sales Man");
});

test("salesmanAnalysis: YoY decline detected (RAJ 2.4M -> 1.8M)", () => {
  const r = buildSalesmanAnalysis(fixture(), { fy: FY2 });
  const raj = r.table.find((t) => t.name === "RAJ");
  assert.equal(raj.trend, "Declining");
  assert.ok(raj.yoyPct < 0);
  assert.ok(r.kpis.declining.names.includes("RAJ"));
});

test("salesmanAnalysis: distinct SKUs counted from both header and line rows", () => {
  const r = buildSalesmanAnalysis(fixture(), { fy: FY2 });
  const lalit = r.table.find((t) => t.name === "LALIT");
  assert.equal(lalit.skus, 2); // SKU-A (header rows) + SKU-B (line row)
});

test("salesmanAnalysis: no blank/null salesman rows", () => {
  const r = buildSalesmanAnalysis(fixture(), { fy: FY2 });
  assert.ok(!r.table.some((t) => t.name === "" || t.name == null));
});

test("salesmanAnalysis: team net sales reconciles with company net sales (diff = the one Cash sale)", () => {
  const r = buildSalesmanAnalysis(fixture(), { fy: FY2 });
  const teamTotal = r.table.reduce((s, t) => s + t.perFy[FY2], 0);
  // companyNetSalesFy excludes the Cash-party sale (5000); team totals include it since
  // a Cash sale is still real revenue attributed to the salesman who made it.
  assert.equal(teamTotal - r.companyNetSales, 5000);
});

test("salesmanAnalysis: leaderboard shares sum to ~100%", () => {
  const r = buildSalesmanAnalysis(fixture(), { fy: FY2 });
  const sum = r.leaderboard.reduce((s, l) => s + l.sharePct, 0);
  assert.ok(Math.abs(sum - 100) < 1, `sum ${sum}`);
});

test("salesmanAnalysis: dataNotes document the return-attribution and no-target limitations", () => {
  const r = buildSalesmanAnalysis(fixture(), { fy: FY2 });
  const combined = r.dataNotes.join(" ").toLowerCase();
  assert.ok(combined.includes("return"));
  assert.ok(combined.includes("target"));
});

test("salesmanAnalysis: empty input safe", () => {
  const r = buildSalesmanAnalysis({ itemFacts: [] }, {});
  assert.equal(r.table.length, 0);
  assert.equal(r.kpis.activeSalesmen.count, 0);
});
