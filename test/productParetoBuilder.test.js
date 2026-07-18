import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProductPareto, mrpFromName } from "../server/productParetoBuilder.js";

const FY1 = "FY 2024-25";
const FY2 = "FY 2025-26";
const FY3 = "FY 2026-27";

test("mrpFromName parses MRP suffix", () => {
  assert.equal(mrpFromName("KB1105 BLU/RED 11X13 MRP-229#"), 229);
  assert.equal(mrpFromName("CX-2210 COPPER 5X8 MRP-259#"), 259);
  assert.equal(mrpFromName("NO MRP HERE"), 0);
});

function sale(fy, month, sku, group, qty, amount, date) {
  return { tx: "Sales", fy, month, item: sku, itemGroup: group, party: "P1", qty, amount, date, isHeader: false };
}
function ret(fy, month, sku, group, qty, amount) {
  return { tx: "Sales Return", fy, month, item: sku, itemGroup: group, party: "P1", qty, amount, isHeader: false };
}
function fixture() {
  const f = [];
  const m1 = ["2024-04","2024-05","2024-06","2024-07","2024-08","2024-09","2024-10","2024-11","2024-12","2025-01","2025-02","2025-03"];
  const m2 = ["2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"];
  // Big SKU across all months
  m1.forEach((m, i) => f.push(sale(FY1, m, "AAA MRP-259#", "KIDS-PU-F", 100, 20000, `${m}-15`)));
  m2.forEach((m) => f.push(sale(FY2, m, "AAA MRP-259#", "KIDS-PU-F", 100, 22000, `${m}-15`)));
  // Mid SKU
  m1.forEach((m) => f.push(sale(FY1, m, "BBB MRP-184#", "LADIES-PU-F", 50, 8000, `${m}-10`)));
  m2.forEach((m) => f.push(sale(FY2, m, "BBB MRP-184#", "LADIES-PU-F", 50, 8500, `${m}-10`)));
  // Slow mover: only sold Apr FY2, silent after
  f.push(sale(FY2, "2025-04", "SLOW MRP-199#", "KIDS-PU-F", 10, 1000, "2025-04-05"));
  // High-return SKU FY2
  f.push(sale(FY2, "2025-06", "RET MRP-149#", "KIDS-PU-A", 10, 1000, "2025-06-01"));
  f.push(ret(FY2, "2025-07", "RET MRP-149#", "KIDS-PU-A", 6, 600));
  // Cash excluded
  f.push({ tx: "Sales", fy: FY2, month: "2025-05", item: "CASHSKU", itemGroup: "KIDS-PU-F", party: "Cash", qty: 999, amount: 999999, date: "2025-05-01", isHeader: false });
  // FY3 partial
  ["2026-04","2026-05","2026-06"].forEach((m) => f.push(sale(FY3, m, "AAA MRP-259#", "KIDS-PU-F", 100, 24000, `${m}-15`)));
  return { itemFacts: f, ledgerFacts: [] };
}

test("productPareto: default currentFy latest complete, FY3 partial", () => {
  const r = buildProductPareto(fixture(), {});
  assert.equal(r.currentFy, FY2);
  assert.deepEqual(r.partialFys, [FY3]);
});

test("productPareto: Cash excluded, top SKU correct", () => {
  const r = buildProductPareto(fixture(), { fy: FY2 });
  assert.equal(r.kpis.topSku.name, "AAA MRP-259#");
  assert.ok(!r.table.some((t) => t.sku === "CASHSKU"));
});

test("productPareto: slow mover detected (no sale 90d)", () => {
  const r = buildProductPareto(fixture(), { fy: FY2 });
  const slowGroups = r.slowMoversByGroup.reduce((s, g) => s + g.count, 0);
  assert.ok(r.kpis.slowMovers.count >= 1);
  assert.ok(slowGroups >= 1);
});

test("productPareto: high return SKU flagged in quality issues", () => {
  const r = buildProductPareto(fixture(), { fy: FY2 });
  const q = r.qualityIssues.find((x) => x.sku === "RET MRP-149#");
  assert.ok(q, "RET SKU present");
  assert.equal(q.returnPct, 60); // 600/1000
});

test("productPareto: MRP bands bucket by parsed MRP", () => {
  const r = buildProductPareto(fixture(), { fy: FY2 });
  const band250 = r.mrpBands.find((b) => b.label === "₹250-₹300");
  assert.ok(band250.skuCount >= 1); // AAA MRP-259
});

test("productPareto: cumulative pareto is non-decreasing and <=100", () => {
  const r = buildProductPareto(fixture(), { fy: FY2 });
  for (let i = 1; i < r.pareto.cumulative.length; i++) assert.ok(r.pareto.cumulative[i] >= r.pareto.cumulative[i - 1]);
  assert.ok(r.pareto.cumulative[r.pareto.cumulative.length - 1] <= 100.5);
});

test("productPareto: empty input safe", () => {
  const r = buildProductPareto({ itemFacts: [] }, {});
  assert.equal(r.table.length, 0);
  assert.equal(r.kpis.totalSkus.count, 0);
});

// ---------------------------------------------------------------------------
// Item 5: slow-mover grouping cleanup — capped with an Others bucket instead of a
// long scatter of 1-count groups, total count still reconciles.
// ---------------------------------------------------------------------------
function manySlowGroupsFixture() {
  const f = [];
  // 12 distinct item groups, each with exactly one SKU sold once in April FY2 and
  // then silent (>90 days before the FY's last transaction) -> 12 one-SKU slow groups.
  for (let i = 0; i < 12; i++) {
    f.push(sale(FY2, "2025-04", `SKU-${i} MRP-199#`, `GROUP-${i}`, 5, 1000, "2025-04-05"));
  }
  // One big active group so the FY has a "current" reference date well past 90 days
  // from April.
  ["2025-08", "2025-09", "2025-10", "2025-11", "2025-12"].forEach((m) =>
    f.push(sale(FY2, m, "ACTIVE MRP-259#", "ACTIVE-GROUP", 50, 20000, `${m}-15`))
  );
  return { itemFacts: f, ledgerFacts: [] };
}

test("productPareto: slow-mover groups are capped with an Others bucket", () => {
  const r = buildProductPareto(manySlowGroupsFixture(), { fy: FY2 });
  assert.ok(r.slowMoversByGroup.length <= 9, `expected <=8 groups + Others, got ${r.slowMoversByGroup.length}`);
  assert.ok(r.slowMoversByGroup.some((g) => g.isOthers), "long tail must be folded into an Others bucket");
  const total = r.slowMoversByGroup.reduce((s, g) => s + g.count, 0);
  assert.equal(total, 12, "total slow-mover count must reconcile even after capping");
});

test("productPareto: documents its Pareto and slow-mover rules", () => {
  const r = buildProductPareto(fixture(), { fy: FY2 });
  assert.ok(Array.isArray(r.dataNotes));
  const combined = r.dataNotes.join(" ").toLowerCase();
  assert.ok(combined.includes("cumulative"));
  assert.ok(combined.includes("90"));
});
