import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExpenseAnalysis, expenseCategory } from "../server/expenseAnalysisBuilder.js";

const FY1 = "FY 2024-25";
const FY2 = "FY 2025-26";
const FY3 = "FY 2026-27";

test("expenseCategory classifies by name", () => {
  assert.equal(expenseCategory("Salary"), "Salary");
  assert.equal(expenseCategory("Suspenses"), "Suspense");
  assert.equal(expenseCategory("GODOWN RENT-1"), "Rent");
  assert.equal(expenseCategory("Delivery Charges"), "Logistics");
  assert.equal(expenseCategory("Electricity & Generator Charges"), "Utilities");
  assert.equal(expenseCategory("Sales Promotion Expenses"), "Marketing");
  assert.equal(expenseCategory("Bank Interest Paid"), "Finance");
});

// Item 7: real gaps found against the actual MLH chart of accounts — named factory
// staff and statutory payroll contributions were falling into "Other" instead of
// "Salary"; clearly administrative costs were falling into "Other" instead of "Admin".
test("expenseCategory: statutory payroll and named staff accounts map to Salary", () => {
  assert.equal(expenseCategory("EPF PAID -ER (EMPLOYER)"), "Salary");
  assert.equal(expenseCategory("ESIC PAID -ER (EMPLOYER)"), "Salary");
  assert.equal(expenseCategory("GOPAL DAS -FACTORY EMPLOYEE"), "Salary");
  assert.equal(expenseCategory("IQBAL HOSSAIN-FACTORY STAF"), "Salary"); // source typo, missing final F
});

test("expenseCategory: administrative/overhead accounts map to Admin, not Other", () => {
  assert.equal(expenseCategory("Accounting Charges"), "Admin");
  assert.equal(expenseCategory("FACTORY ADMINISTRATION EXPENSES"), "Admin");
  assert.equal(expenseCategory("Telephone Expenses"), "Admin");
  assert.equal(expenseCategory("Repairng And Maintainance Charges"), "Admin"); // source typos
  assert.equal(expenseCategory("Trade Licenece"), "Admin"); // spelling variant of "License"
  assert.equal(expenseCategory("JOBWORK CHARGES"), "Admin");
});

function exp(fy, month, account, group, debit) {
  return { tx: "Journal", fy, month, account, accountGroup: group, debit, credit: 0, isHeader: true };
}
function saleH(fy, month, finalAmount) { return { tx: "Sales", fy, month, party: "P1", finalAmount, isHeader: true }; }
function purH(fy, month, finalAmount) { return { tx: "Purchase", fy, month, party: "V1", finalAmount, isHeader: true }; }

const M1 = ["2024-04","2024-05","2024-06","2024-07","2024-08","2024-09","2024-10","2024-11","2024-12","2025-01","2025-02","2025-03"];
const M2 = ["2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"];
function fixture() {
  const l = [], it = [];
  const G = "Expenses (Indirect/Admn.)";
  // spread 12 months of sales/purchase so FY1 & FY2 count as complete
  [[FY1, M1], [FY2, M2]].forEach(([fy, months]) => {
    months.forEach((m) => { it.push(saleH(fy, m, 2500000)); it.push(purH(fy, m, 2250000)); });
  });
  // expense entries (one month each is fine for totals)
  l.push(exp(FY1, "2024-06", "Salary", "SUNDRY CREDITORS AGAINST SALARY", 2000000));
  l.push(exp(FY2, "2025-06", "Salary", "SUNDRY CREDITORS AGAINST SALARY", 2400000));
  l.push(exp(FY2, "2025-06", "GODOWN RENT-1", G, 300000));
  l.push(exp(FY2, "2025-06", "Suspenses", G, 400000));
  l.push(exp(FY2, "2025-06", "Delivery Charges", G, 150000));
  // partial FY3 (only 1 month -> excluded from trend)
  l.push(exp(FY3, "2026-04", "Salary", "SUNDRY CREDITORS AGAINST SALARY", 200000));
  it.push(saleH(FY3, "2026-04", 5000000));
  it.push(purH(FY3, "2026-04", 4500000));
  return { itemFacts: it, ledgerFacts: l };
}

test("expenseAnalysis: default currentFy latest complete", () => {
  const r = buildExpenseAnalysis(fixture(), {});
  assert.equal(r.currentFy, FY2);
  assert.deepEqual(r.partialFys, [FY3]);
});

test("expenseAnalysis: salary rollup + suspense flagged", () => {
  const r = buildExpenseAnalysis(fixture(), { fy: FY2 });
  assert.equal(r.kpis.salary.cur, 2400000);
  assert.equal(r.kpis.suspense.cur, 400000);
  assert.ok(r.alerts.some((a) => /suspense/i.test(a.title)));
});

test("expenseAnalysis: gross profit and NOP math", () => {
  const r = buildExpenseAnalysis(fixture(), { fy: FY2 });
  // gross = 30000000 - 27000000 = 3000000
  assert.equal(r.kpis.grossProfit.cur, 3000000);
  // total exp = 2.4M + 0.3M + 0.4M + 0.15M = 3.25M ; NOP = 3M - 3.25M = -0.25M
  assert.equal(r.kpis.totalExpenses.cur, 3250000);
  assert.equal(r.kpis.nop.cur, -250000);
});

test("expenseAnalysis: P&L bridge starts at net sales, ends at NOP", () => {
  const r = buildExpenseAnalysis(fixture(), { fy: FY2 });
  assert.equal(r.bridge[0].value, 30000000);
  assert.equal(r.bridge[r.bridge.length - 1].value, r.kpis.nop.cur);
});

test("expenseAnalysis: margin trend excludes partial FY", () => {
  const r = buildExpenseAnalysis(fixture(), { fy: FY2 });
  assert.ok(!r.marginTrend.some((m) => m.fy === FY3));
});

test("expenseAnalysis: empty input safe", () => {
  const r = buildExpenseAnalysis({ itemFacts: [], ledgerFacts: [] }, {});
  assert.equal(r.table.length, 0);
  assert.equal(r.kpis.totalExpenses.cur, 0);
});

// ---------------------------------------------------------------------------
// Item 7: category mix cleanup — tiny categories collapse into Other (except
// Suspense, always shown), the mix still sums to total expense, and the underlying
// per-category KPIs (used by the P&L bridge) stay accurate regardless of collapsing.
// ---------------------------------------------------------------------------
function mixFixture() {
  const l = [], it = [];
  const G = "Expenses (Indirect/Admn.)";
  [[FY1, M1], [FY2, M2]].forEach(([fy, months]) => {
    months.forEach((m) => { it.push(saleH(fy, m, 2500000)); it.push(purH(fy, m, 2250000)); });
  });
  l.push(exp(FY2, "2025-06", "Salary", "SUNDRY CREDITORS AGAINST SALARY", 2400000));
  l.push(exp(FY2, "2025-06", "GODOWN RENT-1", G, 300000));
  // Utilities and Finance are each well under the 3% materiality threshold of the
  // ~3.3M total expense here -> must collapse into Other in categoryMix.
  l.push(exp(FY2, "2025-06", "Electricity Charges", G, 20000));
  l.push(exp(FY2, "2025-06", "Bank Interest Paid", G, 15000));
  return { itemFacts: it, ledgerFacts: l };
}

test("expenseAnalysis: tiny categories collapse into Other in categoryMix", () => {
  const r = buildExpenseAnalysis(mixFixture(), { fy: FY2 });
  assert.ok(!r.categoryMix.some((c) => c.category === "Utilities"), "Utilities is <3% and must be folded into Other");
  assert.ok(!r.categoryMix.some((c) => c.category === "Finance"), "Finance is <3% and must be folded into Other");
  const other = r.categoryMix.find((c) => c.category === "Other");
  assert.ok(other, "collapsed Other bucket must exist");
  assert.equal(other.value, 35000); // 20000 electricity + 15000 interest
  assert.deepEqual([...other.collapsedFrom].sort(), ["Finance", "Utilities"]);
});

test("expenseAnalysis: categoryMix still sums to total expense after collapsing", () => {
  const r = buildExpenseAnalysis(mixFixture(), { fy: FY2 });
  const sum = r.categoryMix.reduce((s, c) => s + c.value, 0);
  assert.equal(sum, r.kpis.totalExpenses.cur);
});

test("expenseAnalysis: collapsing categoryMix does not distort the P&L bridge's own line items", () => {
  const r = buildExpenseAnalysis(mixFixture(), { fy: FY2 });
  const rentLine = r.bridge.find((b) => b.label === "Less: Rent");
  const utilLine = r.bridge.find((b) => b.label === "Less: Utilities");
  // The bridge must still show Rent and Utilities as their own true line items even
  // though the categoryMix chart folded Utilities into Other for display.
  assert.equal(rentLine.value, -300000);
  assert.equal(utilLine.value, -20000);
});
