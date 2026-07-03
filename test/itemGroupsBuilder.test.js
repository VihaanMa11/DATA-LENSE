import { test } from "node:test";
import assert from "node:assert/strict";
import { buildItemGroups } from "../server/itemGroupsBuilder.js";

const FY1 = "FY 2024-25";
const FY2 = "FY 2025-26";
const FY3 = "FY 2026-27";

// Sales line row helper
function sale(fy, month, group, party, item, qty, amount) {
  return { tx: "Sales", fy, month, itemGroup: group, party, item, mainUnit: "PAIRS", qty, amount, isHeader: false };
}
function ret(fy, month, group, party, item, qty, amount) {
  return { tx: "Sales Return", fy, month, itemGroup: group, party, item, mainUnit: "PAIRS", qty, amount, isHeader: false };
}

// A fixture spanning 3 FYs. FY3 is partial (only 3 months) so it must be badged
// and NOT be the default currentFy.
function fixture() {
  const f = [];
  // full 12 months for FY1, FY2 for group ALPHA (so they are "complete")
  const months1 = ["2024-04","2024-05","2024-06","2024-07","2024-08","2024-09","2024-10","2024-11","2024-12","2025-01","2025-02","2025-03"];
  const months2 = ["2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"];
  const months3 = ["2026-04","2026-05","2026-06"]; // partial

  for (const m of months1) f.push(sale(FY1, m, "ALPHA", "P1", "A-sku1", 10, 1000));
  for (const m of months2) f.push(sale(FY2, m, "ALPHA", "P1", "A-sku1", 10, 1100));
  for (const m of months3) f.push(sale(FY3, m, "ALPHA", "P1", "A-sku1", 10, 1200));

  // BETA: premium, fewer pairs high price, H2 skewed in FY2
  f.push(sale(FY1, "2024-05", "BETA", "P2", "B-sku1", 5, 1500));
  f.push(sale(FY2, "2025-11", "BETA", "P2", "B-sku1", 5, 1600)); // H2
  f.push(sale(FY2, "2025-12", "BETA", "P3", "B-sku2", 5, 1600)); // H2, 2nd sku + cust

  // GAMMA: declining FY1->FY2
  f.push(sale(FY1, "2024-06", "GAMMA", "P4", "G-sku1", 20, 2000));
  f.push(sale(FY2, "2025-06", "GAMMA", "P4", "G-sku1", 15, 1200));

  // Cash must be excluded entirely
  f.push(sale(FY2, "2025-06", "ALPHA", "Cash", "A-sku1", 999, 99999));

  // a return against ALPHA FY2
  f.push(ret(FY2, "2025-07", "ALPHA", "P1", "A-sku1", 2, 200));
  return { itemFacts: f, ledgerFacts: [] };
}

test("itemGroups: default currentFy is latest COMPLETE fy, FY3 badged partial", () => {
  const r = buildItemGroups(fixture(), {});
  assert.equal(r.currentFy, FY2);
  assert.deepEqual(r.partialFys, [FY3]);
  assert.equal(r.prevFy, FY1);
});

test("itemGroups: Cash excluded from groups and counts", () => {
  const r = buildItemGroups(fixture(), { fy: FY2 });
  const alpha = r.table.find((t) => t.group === "ALPHA");
  // ALPHA FY2 net = 12*1100 - 200 return = 13000 (Cash 99999 excluded)
  assert.equal(alpha.perFy[FY2], 13000);
  // custs excludes Cash -> only P1
  assert.equal(alpha.custCount, 1);
});

test("itemGroups: net, pairs, avgPrice per group", () => {
  const r = buildItemGroups(fixture(), { fy: FY1 });
  const gamma = r.table.find((t) => t.group === "GAMMA");
  assert.equal(gamma.perFy[FY1], 2000);
  assert.equal(gamma.pairsCur, 20);
  assert.equal(gamma.avgPrice, 100); // 2000/20
});

test("itemGroups: SKU count is distinct items", () => {
  const r = buildItemGroups(fixture(), { fy: FY2 });
  const beta = r.table.find((t) => t.group === "BETA");
  assert.equal(beta.skuCount, 2); // B-sku1 + B-sku2
  assert.equal(beta.custCount, 2); // P2 + P3
});

test("itemGroups: H2-skewed detection", () => {
  const r = buildItemGroups(fixture(), { fy: FY2 });
  // BETA FY2 is entirely Nov+Dec -> 100% H2
  const beta = r.h1h2.find((x) => x.group === "BETA");
  assert.ok(beta, "BETA present in h1h2");
  assert.equal(beta.h2Pct, 100);
});

test("itemGroups: YoY declining group flagged", () => {
  const r = buildItemGroups(fixture(), { fy: FY2 });
  const gamma = r.table.find((t) => t.group === "GAMMA");
  // FY1 2000 -> FY2 1200 = -40%
  assert.equal(gamma.yoyPct, -40);
  assert.equal(gamma.signal, "Declining");
  assert.ok(r.kpis.declining.names.includes("GAMMA"));
});

test("itemGroups: table sorted by current FY net desc", () => {
  const r = buildItemGroups(fixture(), { fy: FY2 });
  const nets = r.table.map((t) => t.perFy[FY2]);
  for (let i = 1; i < nets.length; i++) assert.ok(nets[i - 1] >= nets[i]);
});

test("itemGroups: empty input safe", () => {
  const r = buildItemGroups({ itemFacts: [] }, {});
  assert.equal(r.table.length, 0);
  assert.equal(r.kpis.activeGroups.countCurrentFy, 0);
});
