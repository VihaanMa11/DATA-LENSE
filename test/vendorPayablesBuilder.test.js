import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVendorPayables, vendorType } from "../server/vendorPayablesBuilder.js";

const FY1 = "FY 2024-25";
const FY2 = "FY 2025-26";
const FY3 = "FY 2026-27";

test("vendorType classifies by name", () => {
  assert.equal(vendorType("FSF FOOTWEAR PVT.LTD"), "Footwear");
  assert.equal(vendorType("AIRHAWK PLASTIC WORKS"), "Material");
  assert.equal(vendorType("EXCEL POLYMER"), "Material");
  assert.equal(vendorType("SUCHITA MOTORS"), "Capex");
  assert.equal(vendorType("AIR INDIA"), "Services");
  assert.equal(vendorType("FLIPKART"), "Services");
  assert.equal(vendorType("WINNER ENTERPRISE"), "Other");
});

function pur(fy, month, vendor, finalAmount) {
  return { tx: "Purchase", fy, month, party: vendor, finalAmount, isHeader: true };
}
function purRet(fy, month, vendor, finalAmount) {
  return { tx: "Purchase Return", fy, month, party: vendor, finalAmount, isHeader: true };
}
function fixture() {
  const f = [];
  const m1 = ["2024-04","2024-05","2024-06","2024-07","2024-08","2024-09","2024-10","2024-11","2024-12","2025-01","2025-02","2025-03"];
  const m2 = ["2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"];
  m1.forEach((m) => f.push(pur(FY1, m, "FSF FOOTWEAR PVT.LTD", 300000)));
  m2.forEach((m) => f.push(pur(FY2, m, "FSF FOOTWEAR PVT.LTD", 250000)));
  m1.forEach((m) => f.push(pur(FY1, m, "AIRHAWK PLASTIC WORKS", 160000)));
  m2.forEach((m) => f.push(pur(FY2, m, "AIRHAWK PLASTIC WORKS", 160000)));
  f.push(pur(FY2, "2025-06", "SUCHITA MOTORS", 3955000));
  f.push(purRet(FY2, "2025-07", "AIRHAWK PLASTIC WORKS", 100000));
  ["2026-04","2026-05","2026-06"].forEach((m) => f.push(pur(FY3, m, "FSF FOOTWEAR PVT.LTD", 260000)));
  return {
    itemFacts: f, ledgerFacts: [],
    accountMaster: [
      { name: "FSF FOOTWEAR PVT.LTD", group: "Sundry Creditors", openingDr: 0, openingCr: 1184000 },
      { name: "AIRHAWK PLASTIC WORKS", group: "Sundry Creditors", openingDr: 0, openingCr: 406000 },
    ],
  };
}

test("vendorPayables: default currentFy latest complete, FY3 partial", () => {
  const r = buildVendorPayables(fixture(), {});
  assert.equal(r.currentFy, FY2);
  assert.deepEqual(r.partialFys, [FY3]);
});

test("vendorPayables: net purchase per vendor (gross - returns)", () => {
  const r = buildVendorPayables(fixture(), { fy: FY2 });
  const fsf = r.table.find((t) => t.vendor === "FSF FOOTWEAR PVT.LTD");
  const air = r.table.find((t) => t.vendor === "AIRHAWK PLASTIC WORKS");
  assert.equal(fsf.perFy[FY2], 12 * 250000);
  assert.equal(air.perFy[FY2], 12 * 160000 - 100000);
});

test("vendorPayables: total payable from account master creditors", () => {
  const r = buildVendorPayables(fixture(), { fy: FY2 });
  assert.equal(r.kpis.totalPayable.cur, 1184000 + 406000);
  assert.equal(r.kpis.totalPayable.fromMaster, true);
});

test("vendorPayables: Capex vendor flagged for classification", () => {
  const r = buildVendorPayables(fixture(), { fy: FY2 });
  const suchita = r.table.find((t) => t.vendor === "SUCHITA MOTORS");
  assert.equal(suchita.type, "Capex");
  assert.equal(suchita.flag, "Classify");
});

test("vendorPayables: concentration + data-honesty note present", () => {
  const r = buildVendorPayables(fixture(), { fy: FY2 });
  assert.ok(r.kpis.top2Share.pct > 0);
  assert.ok(r.dataNotes.some((n) => /payment register|ledger/i.test(n)));
  assert.ok(r.alerts.some((a) => /ledger export/i.test(a.title)));
});

test("vendorPayables: empty input safe", () => {
  const r = buildVendorPayables({ itemFacts: [] }, {});
  assert.equal(r.table.length, 0);
  assert.equal(r.kpis.totalPurchase.cur, 0);
});

// ---------------------------------------------------------------------------
// Item 6: purchase-trend cleanup — a year where returns exceed fresh purchases for
// a top vendor must floor at 0 in the trend chart (not a negative bar), and a vendor
// active only in a non-current FY must still count toward THAT year's own total.
// ---------------------------------------------------------------------------
function trendFixture() {
  const f = [];
  const m1 = ["2024-04","2024-05","2024-06","2024-07","2024-08","2024-09","2024-10","2024-11","2024-12","2025-01","2025-02","2025-03"];
  const m2 = ["2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"];
  m1.forEach((m) => f.push(pur(FY1, m, "FSF FOOTWEAR PVT.LTD", 300000)));
  m2.forEach((m) => f.push(pur(FY2, m, "FSF FOOTWEAR PVT.LTD", 250000)));
  m1.forEach((m) => f.push(pur(FY1, m, "AIRHAWK PLASTIC WORKS", 160000)));
  m2.forEach((m) => f.push(pur(FY2, m, "AIRHAWK PLASTIC WORKS", 160000)));
  // FY3: FSF's purchase returns exceed its fresh purchases -> net negative that year.
  f.push(pur(FY3, "2026-04", "FSF FOOTWEAR PVT.LTD", 10000));
  f.push(purRet(FY3, "2026-04", "FSF FOOTWEAR PVT.LTD", 50000));
  f.push(pur(FY3, "2026-04", "AIRHAWK PLASTIC WORKS", 100000));
  // A vendor active ONLY in FY1 (churned before FY2/FY3) must still count toward FY1's
  // own concentration/trend total, even though it's outside currentFy/prevFy scope
  // once currentFy moves to FY3.
  f.push(pur(FY1, "2024-05", "ONLY-IN-FY1 SUPPLIES", 500000));
  return { itemFacts: f, ledgerFacts: [] };
}

test("vendorPayables: purchase-trend bars floor at 0 instead of going negative", () => {
  const r = buildVendorPayables(trendFixture(), { fy: FY3 });
  const fy3Series = r.purchaseTrend.series.find((s) => s.name === FY3);
  for (const v of fy3Series.values) assert.ok(v >= 0, `purchaseTrend value went negative: ${v}`);
});

test("vendorPayables: a vendor active only in an earlier FY still counts toward that FY's own concentration total", () => {
  const r = buildVendorPayables(trendFixture(), { fy: FY3 });
  const fy1 = r.concentration.find((c) => c.fy === FY1);
  // ONLY-IN-FY1 SUPPLIES (500000 of FY1's 6,020,000 total = 8.3%) must appear in FY1's
  // own rows. With the old currentFy/prevFy-scoped vendor list (currentFy=FY3,
  // prevFy=FY2), this vendor would be silently invisible to every FY's concentration,
  // including its own FY1.
  assert.ok(fy1.rows.some((row) => row.vendor === "ONLY-IN-FY1 SUPPLIES"),
    `expected ONLY-IN-FY1 SUPPLIES in FY1 rows, got ${JSON.stringify(fy1.rows)}`);
});
