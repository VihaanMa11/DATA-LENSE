import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGeoAnalysis } from "../server/geoAnalysisBuilder.js";

const FY1 = "FY 2024-25";
const FY2 = "FY 2025-26";
const FY3 = "FY 2026-27";
function sale(fy, month, state, party, group, voucher, finalAmount, qty) {
  return { tx: "Sales", fy, month, state, party, itemGroup: group, voucher, finalAmount, amount: finalAmount, qty, isHeader: true };
}
function fixture() {
  const f = [];
  const M2 = ["2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"];
  const M1 = M2.map((m) => m.replace("2025", "2024").replace("2026", "2025"));
  M1.forEach((m, i) => f.push(sale(FY1, m, "West Bengal", "WB Big", "KIDS-PU-F", "wb1-" + i, 500000, 300)));
  M2.forEach((m, i) => f.push(sale(FY2, m, "West Bengal", "WB Big", "KIDS-PU-F", "wb2-" + i, 550000, 320)));
  f.push(sale(FY2, "2025-08", "Jharkhand", "JH Party", "KIDS-PU-F", "jh1", 800000, 500));
  f.push({ tx: "Sales", fy: FY2, month: "2025-06", state: "West Bengal", party: "Cash", itemGroup: "KIDS-PU-F", voucher: "c1", finalAmount: 9999999, amount: 9999999, qty: 999, isHeader: true });
  ["2026-04","2026-05","2026-06"].forEach((m, i) => f.push(sale(FY3, m, "West Bengal", "WB Big", "KIDS-PU-F", "wb3-" + i, 600000, 300)));
  return { itemFacts: f, ledgerFacts: [], accountMaster: [{ name: "WB Big", state: "West Bengal", station: "Kolkata" }, { name: "JH Party", state: "Jharkhand", station: "Ranchi" }] };
}
test("geo: default currentFy latest complete, Cash excluded", () => {
  const r = buildGeoAnalysis(fixture(), {});
  assert.equal(r.currentFy, FY2);
  assert.deepEqual(r.partialFys, [FY3]);
  assert.ok(!r.parties.some((p) => p.name === "Cash"));
});
test("geo: party sales, bills, city from account master", () => {
  const r = buildGeoAnalysis(fixture(), { fy: FY2 });
  const wb = r.parties.find((p) => p.name === "WB Big");
  assert.equal(wb.sales, 12 * 550000);
  assert.equal(wb.bills, 12);
  assert.equal(wb.city, "Kolkata");
});
test("geo: top-state concentration", () => {
  const r = buildGeoAnalysis(fixture(), { fy: FY2 });
  assert.equal(r.kpis.topStateConc.state, "West Bengal");
  assert.ok(r.kpis.topStateConc.pct > 80);
});
test("geo: empty safe", () => {
  const r = buildGeoAnalysis({ itemFacts: [] }, {});
  assert.equal(r.parties.length, 0);
});
