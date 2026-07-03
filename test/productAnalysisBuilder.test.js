import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProductAnalysis } from "../server/productAnalysisBuilder.js";

const FY1 = "FY 2024-25";
const FY2 = "FY 2025-26";
const FY3 = "FY 2026-27";
function sale(fy, month, group, sku, party, qty, amount) { return { tx: "Sales", fy, month, itemGroup: group, item: sku, party, qty, amount, voucher: month + party + sku, date: `${month}-15`, isHeader: true }; }
function pur(fy, month, group, qty, amount) { return { tx: "Purchase", fy, month, itemGroup: group, item: "x", party: "V", qty, amount, isHeader: true }; }
function fixture() {
  const f = [];
  const M2 = ["2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"];
  // KIDS profitable group
  M2.forEach((m, i) => { f.push(sale(FY2, m, "KIDS-PU-F", "K-sku" + (i % 3), "P" + (i % 4), 100, 100000)); f.push(pur(FY2, m, "KIDS-PU-F", 100, 70000)); });
  // TOPTRACK loss group: sells below cost
  f.push(sale(FY2, "2025-11", "TOPTRACK SHOE", "T1", "P1", 50, 100000));
  f.push(pur(FY2, "2025-04", "TOPTRACK SHOE", 50, 140000));
  // FY1 full 12 months (complete) + partial FY3
  const M1 = ["2024-04","2024-05","2024-06","2024-07","2024-08","2024-09","2024-10","2024-11","2024-12","2025-01","2025-02","2025-03"];
  M1.forEach((m, i) => f.push(sale(FY1, m, "KIDS-PU-F", "K-sku" + (i % 3), "P" + (i % 4), 100, 90000)));
  f.push(sale(FY3, "2026-04", "KIDS-PU-F", "K-sku0", "P1", 10, 12000));
  return { itemFacts: f, ledgerFacts: [] };
}
test("productAnalysis: default currentFy latest complete", () => {
  const r = buildProductAnalysis(fixture(), {});
  assert.equal(r.currentFy, FY2);
  assert.deepEqual(r.partialFys, [FY3]);
});
test("productAnalysis: group margin, sell-through, buyers", () => {
  const r = buildProductAnalysis(fixture(), { fy: FY2 });
  const kids = r.groups.find((g) => g.group === "KIDS-PU-F");
  assert.ok(kids.margin > 0);         // sells above cost
  assert.ok(kids.buyers >= 1);
  assert.ok(kids.skus >= 1);
});
test("productAnalysis: loss group surfaced (material)", () => {
  const r = buildProductAnalysis(fixture(), { fy: FY2 });
  assert.ok(r.kpis.worstMargin.margin < 0);
  assert.ok(r.alerts.some((a) => a.tone === "red" && /loss/i.test(a.title)));
});
test("productAnalysis: empty safe", () => {
  const r = buildProductAnalysis({ itemFacts: [] }, {});
  assert.equal(r.groups.length, 0);
});
