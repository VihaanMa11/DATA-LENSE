import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSegmentMis, genderAgeOf } from "../server/segmentMisBuilder.js";

const FY1 = "FY 2024-25";
const FY2 = "FY 2025-26";
const FY3 = "FY 2026-27";

test("genderAgeOf: brand-prefixed sub-groups classify by gender not brand", () => {
  assert.equal(genderAgeOf("KIDS-PU-F"), "Kids");
  assert.equal(genderAgeOf("KIDS BELT-FSF"), "Kids");
  assert.equal(genderAgeOf("WOW KIDS-F"), "Kids");      // WOW brand must not become Premium
  assert.equal(genderAgeOf("LADIES-AIRHAWK"), "Ladies");
  assert.equal(genderAgeOf("LADIES WOW AIR"), "Ladies");
  assert.equal(genderAgeOf("WOW GIRLS-PU"), "Girls");
  assert.equal(genderAgeOf("GENTS BELT FSF"), "Gents");
  assert.equal(genderAgeOf("BOYS-PU-F"), "Boys");
  assert.equal(genderAgeOf("TOPTRACK SHOE"), "Premium");
  assert.equal(genderAgeOf("MISC-XYZ"), "Other");
});

function sale(fy, month, group, party, item, qty, amount) {
  return { tx: "Sales", fy, month, itemGroup: group, party, item, mainUnit: "PAIRS", qty, amount, isHeader: false };
}
function fixture() {
  const f = [];
  const m1 = ["2024-04","2024-05","2024-06","2024-07","2024-08","2024-09","2024-10","2024-11","2024-12","2025-01","2025-02","2025-03"];
  const m2 = ["2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"];
  // FY1 uses parent group names; FY2 uses supplier sub-group names for the SAME gender
  for (const m of m1) f.push(sale(FY1, m, "KIDS-PU-F", "P1", "k1", 10, 1000));
  for (const m of m2) f.push(sale(FY2, m, "KIDS BELT-FSF", "P1", "k2", 10, 1100)); // still Kids
  for (const m of m1) f.push(sale(FY1, m, "LADIES-PU-A", "P2", "l1", 8, 1200));
  for (const m of m2) f.push(sale(FY2, m, "LADIES-AIRHAWK", "P2", "l2", 8, 1300)); // still Ladies
  f.push(sale(FY2, "2025-11", "TOPTRACK SHOE", "P3", "t1", 2, 600));
  // partial FY3
  for (const m of ["2026-04","2026-05","2026-06"]) f.push(sale(FY3, m, "KIDS-PU-F", "P1", "k3", 10, 1200));
  return { itemFacts: f, ledgerFacts: [] };
}

test("segmentMis: default currentFy latest complete, FY3 partial", () => {
  const r = buildSegmentMis(fixture(), {});
  assert.equal(r.currentFy, FY2);
  assert.deepEqual(r.partialFys, [FY3]);
});

test("segmentMis: cross-year taxonomy collapses to consistent gender segments", () => {
  const r = buildSegmentMis(fixture(), { fy: FY2 });
  const kids = r.table.find((t) => t.group === "Kids");
  const ladies = r.table.find((t) => t.group === "Ladies");
  assert.ok(kids, "Kids segment present");
  assert.ok(ladies, "Ladies segment present");
  // Kids FY1 (KIDS-PU-F) and FY2 (KIDS BELT-FSF) both count under Kids -> YoY is real
  assert.equal(kids.perFy[FY1], 12 * 1000);
  assert.equal(kids.perFy[FY2], 12 * 1100);
  assert.equal(kids.yoyPct, 10);
});

test("segmentMis: genderAgeMix sums to ~100 and has expected segments", () => {
  const r = buildSegmentMis(fixture(), { fy: FY2 });
  const segs = r.genderAgeMix.map((g) => g.segment);
  assert.ok(segs.includes("Kids"));
  assert.ok(segs.includes("Ladies"));
  assert.ok(segs.includes("Premium"));
  const sum = r.genderAgeMix.reduce((s, g) => s + g.pct, 0);
  assert.ok(Math.abs(sum - 100) < 1.5, `mix sums ~100, got ${sum}`);
});

test("segmentMis: table has h1Pct + h2Pct that complement", () => {
  const r = buildSegmentMis(fixture(), { fy: FY2 });
  for (const row of r.table) {
    assert.ok(Math.abs(row.h1Pct + row.h2Pct - 100) < 0.2 || (row.h1Pct === 0 && row.h2Pct === 0));
  }
});
