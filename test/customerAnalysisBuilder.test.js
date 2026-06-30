import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildCustomerAnalysis } from "../server/customerAnalysisBuilder.js";

// ---------------------------------------------------------------------------
// Fixture: 3 FYs covering all 6 segment types + Cash exclusion
//
// Customers:
//   Champion  - active all 3 FYs, strictly growing net: 50k, 80k, 120k
//   Loyal     - active FY1+FY2+FY3 but flat: 60k, 60k, 60k
//   Lost      - active FY1 only: 40k, 0, 0
//   New       - first active FY3: 0, 0, 70k
//   Recovered - active FY1, silent FY2, back FY3: 30k, 0, 35k
//   AtRisk    - active FY2+FY3 but declining FY3 vs FY2: 0, 90k, 50k
//   Cash      - walk-in, excluded in all FYs
//
// FYs: FY 2024-25 (first), FY 2025-26 (mid), FY 2026-27 (last/current default)
// ---------------------------------------------------------------------------

function saleH(fy, month, party, finalAmount) {
  return { tx: "Sales", fy, month, party, finalAmount, isHeader: true, amount: finalAmount, date: `${month}-01` };
}
function retH(fy, month, party, finalAmount) {
  return { tx: "Sales Return", fy, month, party, finalAmount, isHeader: true, amount: finalAmount, date: `${month}-05` };
}

const FIXTURE = {
  itemFacts: [
    // FY 2024-25
    saleH("FY 2024-25", "2024-04", "Champion",  50000),
    saleH("FY 2024-25", "2024-05", "Loyal",     60000),
    saleH("FY 2024-25", "2024-06", "Lost",      40000),
    saleH("FY 2024-25", "2024-07", "Recovered", 30000),
    saleH("FY 2024-25", "2024-08", "Cash",      15000),  // EXCLUDED

    // FY 2025-26
    saleH("FY 2025-26", "2025-04", "Champion",  80000),
    saleH("FY 2025-26", "2025-05", "Loyal",     60000),
    saleH("FY 2025-26", "2025-06", "AtRisk",    90000),
    saleH("FY 2025-26", "2025-07", "Cash",      10000),  // EXCLUDED

    // FY 2026-27
    saleH("FY 2026-27", "2026-04", "Champion",  120000),
    saleH("FY 2026-27", "2026-05", "Loyal",     60000),
    saleH("FY 2026-27", "2026-06", "New",       70000),
    saleH("FY 2026-27", "2026-07", "Recovered", 35000),
    saleH("FY 2026-27", "2026-08", "AtRisk",    50000),
    saleH("FY 2026-27", "2026-09", "Cash",       5000),  // EXCLUDED
    saleH("FY 2026-27", "2026-10", "CASH",       3000),  // case-insensitive EXCLUDED
  ],
  ledgerFacts: [],
  itemMaster: [],
};

describe("buildCustomerAnalysis", () => {

  // 1. Cash excluded
  it("excludes Cash (case-insensitive) from all output", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    const names = r.table.map((t) => t.name);
    assert.ok(!names.includes("Cash"),  "Cash should not appear in table");
    assert.ok(!names.includes("CASH"),  "CASH should not appear in table");
    // check segments too
    const total = r.kpis.totalCustomers3yr;
    // we have: Champion, Loyal, Lost, New, Recovered, AtRisk = 6 unique non-cash
    assert.equal(total, 6, "totalCustomers3yr should be 6 (no Cash)");
  });

  // 2. fyList chronological
  it("returns fyList in chronological order", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    assert.deepStrictEqual(r.fyList, ["FY 2024-25", "FY 2025-26", "FY 2026-27"]);
  });

  // 3. currentFy defaults to latest
  it("defaults currentFy to latest FY", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    assert.equal(r.currentFy, "FY 2026-27");
    assert.equal(r.prevFy,    "FY 2025-26");
  });

  // 4. options.fy override
  it("respects options.fy override", () => {
    const r = buildCustomerAnalysis(FIXTURE, { fy: "FY 2025-26" });
    assert.equal(r.currentFy, "FY 2025-26");
    assert.equal(r.prevFy,    "FY 2024-25");
  });

  // 5. perFyCounts
  it("counts active customers per FY correctly", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    // FY 2024-25: Champion, Loyal, Lost, Recovered = 4
    assert.equal(r.kpis.perFyCounts["FY 2024-25"], 4);
    // FY 2025-26: Champion, Loyal, AtRisk = 3
    assert.equal(r.kpis.perFyCounts["FY 2025-26"], 3);
    // FY 2026-27: Champion, Loyal, New, Recovered, AtRisk = 5
    assert.equal(r.kpis.perFyCounts["FY 2026-27"], 5);
  });

  // 6. Retained: active firstFy AND currentFy
  // firstFy (FY24-25) actives: Champion, Loyal, Lost, Recovered
  // currentFy (FY26-27) actives: Champion, Loyal, New, Recovered, AtRisk
  // retained firstFy∩current: Champion, Loyal, Recovered = 3
  it("computes retained count correctly", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    assert.equal(r.kpis.retained.count, 3);
    // pct = 3/4 * 100 = 75
    assert.equal(r.kpis.retained.pct, 75);
  });

  // 7. Lost: active firstFy, NOT active currentFy
  // Lost (customer) = 1
  it("computes lost count correctly", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    assert.equal(r.kpis.lost.count, 1);
    // pct = 1/4 * 100 = 25
    assert.equal(r.kpis.lost.pct, 25);
  });

  // 8. Acquired: first active in FY2 or FY3
  // New (first in FY3), AtRisk (first in FY2) = 2
  it("computes acquired count correctly", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    assert.equal(r.kpis.acquired.count, 2);
  });

  // 9. Acquired per FY
  it("computes acquired.perFy correctly", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    assert.equal(r.kpis.acquired.perFy["FY 2025-26"], 1, "AtRisk is new in FY25-26");
    assert.equal(r.kpis.acquired.perFy["FY 2026-27"], 1, "New is new in FY26-27");
    assert.equal(r.kpis.acquired.perFy["FY 2024-25"] || 0, 0, "No new in first FY");
  });

  // 10. Segment: Champion (active all 3, growing: 50k < 80k < 120k)
  it("classifies Champion correctly", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    const row = r.table.find((t) => t.name === "Champion");
    assert.ok(row, "Champion in table");
    assert.equal(row.segment, "Champion");
  });

  // 11. Segment: Lost (active only FY1)
  it("classifies Lost correctly", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    const row = r.table.find((t) => t.name === "Lost");
    assert.ok(row, "Lost in table");
    assert.equal(row.segment, "Lost");
  });

  // 12. Segment: New (first-active FY3)
  it("classifies New correctly", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    const row = r.table.find((t) => t.name === "New");
    assert.ok(row, "New in table");
    assert.equal(row.segment, "New");
  });

  // 13. Segment: Recovered (active FY1, silent FY2, back FY3)
  it("classifies Recovered correctly", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    const row = r.table.find((t) => t.name === "Recovered");
    assert.ok(row, "Recovered in table");
    assert.equal(row.segment, "Recovered");
  });

  // 14. Segment: AtRisk (declining: 90k -> 50k)
  it("classifies AtRisk correctly", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    const row = r.table.find((t) => t.name === "AtRisk");
    assert.ok(row, "AtRisk in table");
    assert.equal(row.segment, "AtRisk");
  });

  // 15. Segment counts sum to totalCustomers3yr
  it("segment counts sum to total customers", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    const segTotal = r.segments.reduce((s, seg) => s + seg.count, 0);
    assert.equal(segTotal, r.kpis.totalCustomers3yr);
  });

  // 16. Cohort retention: champion cohort (FY24-25) has 100% in FY24-25, and survives all 3
  it("cohort for firstFy has 100% retention in its own year", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    const firstCohort = r.cohorts.find((c) => c.cohort === "FY 2024-25");
    assert.ok(firstCohort, "FY 2024-25 cohort exists");
    assert.equal(firstCohort.retention[0], 100, "First cohort retention in its own year is 100%");
  });

  // 17. Cohort sizes: FY24-25 cohort = 4 (Champion, Loyal, Lost, Recovered)
  it("cohort sizes are correct", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    const cohort2425 = r.cohorts.find((c) => c.cohort === "FY 2024-25");
    assert.equal(cohort2425.size, 4);
    const cohort2627 = r.cohorts.find((c) => c.cohort === "FY 2026-27");
    assert.equal(cohort2627.size, 1, "Only 'New' first appeared in FY26-27");
  });

  // 18. Waterfall reconciles: firstFy - lost + new in midFy = midFy total
  it("waterfall totals reconcile (first to mid)", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    // firstFy count = 4, midFy count = 3
    const firstEntry = r.waterfall.find((w) => w.label === "FY 2024-25" && w.kind === "base");
    const midEntry   = r.waterfall.find((w) => w.label === "FY 2025-26" && w.kind === "total");
    assert.ok(firstEntry, "waterfall base entry exists");
    assert.ok(midEntry, "waterfall mid total entry exists");
    assert.equal(firstEntry.value, 4);
    assert.equal(midEntry.value, 3);
  });

  // 19. Retention rate pairs
  it("retentionRate has correct pair labels", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    assert.equal(r.retentionRate.length, 2); // 3 FYs -> 2 pairs
    assert.ok(r.retentionRate[0].pair.includes("2024-25"));
    assert.ok(r.retentionRate[1].pair.includes("2025-26"));
  });

  // 20. Retention pct: FY24-25 -> FY25-26
  // FY24-25 actives: 4; still active in FY25-26: Champion + Loyal = 2 (Lost=0, Recovered=0)
  it("computes retention pct FY24-25 to FY25-26 correctly", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    const pair = r.retentionRate[0];
    // 2 of 4 retained = 50%
    assert.equal(pair.retainedPct, 50);
    assert.equal(pair.churnedPct, 50);
  });

  // 21. table sorted by currentFy net desc
  it("table is sorted by currentFy net sales descending", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    for (let i = 0; i < r.table.length - 1; i++) {
      const a = r.table[i].perFy[r.currentFy] || 0;
      const b = r.table[i + 1].perFy[r.currentFy] || 0;
      assert.ok(a >= b, `Row ${i} (${a}) should be >= row ${i+1} (${b})`);
    }
  });

  // 22. table.perFy has entries for all FYs
  it("table rows have perFy for every FY", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    for (const row of r.table) {
      for (const fy of r.fyList) {
        assert.ok(fy in row.perFy, `${row.name} missing perFy[${fy}]`);
      }
    }
  });

  // 23. trend array length matches fyList
  it("trend array length matches fyList length", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    for (const row of r.table) {
      assert.equal(row.trend.length, r.fyList.length);
    }
  });

  // 24. activeMoM structure
  it("activeMoM has correct structure", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    assert.equal(r.activeMoM.months.length, 12);
    assert.equal(r.activeMoM.series.length, r.fyList.length);
    for (const s of r.activeMoM.series) {
      assert.equal(s.values.length, 12);
    }
  });

  // 25. acquisitionMoM total per FY matches acquired.perFy counts
  it("acquisitionMoM totals match acquired.perFy", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    for (const fy of r.fyList) {
      const series = r.acquisitionMoM.series.find((s) => s.name === fy);
      if (!series) continue;
      const total = series.values.reduce((s, v) => s + v, 0);
      // FY 2024-25: all original customers => these are the "base" not counted as acquired
      // FY 2025-26: AtRisk = 1
      // FY 2026-27: New = 1
      const expected = r.kpis.acquired.perFy[fy] || (fy === r.fyList[0] ? r.kpis.perFyCounts[fy] : 0);
      // For first FY, all customers are "new" from acquisition perspective
      if (fy !== r.fyList[0]) {
        assert.equal(total, r.kpis.acquired.perFy[fy] || 0, `${fy} acquisition total mismatch`);
      }
    }
  });

  // 26. frequencyByFy has entry for each FY
  it("frequencyByFy has one entry per FY", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    assert.equal(r.frequencyByFy.length, r.fyList.length);
    for (const entry of r.frequencyByFy) {
      assert.ok(r.fyList.includes(entry.fy));
      assert.ok(typeof entry.avgBills === "number");
    }
  });

  // 27. avgRevPerCustomer > 0 for current FY
  it("avgRevPerCustomer.cur is positive when there are active customers", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    assert.ok(r.kpis.avgRevPerCustomer.cur > 0, "avgRevPerCustomer.cur should be positive");
  });

  // 28. alerts is non-empty array with valid tones
  it("alerts is non-empty with valid tone values", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    assert.ok(Array.isArray(r.alerts));
    assert.ok(r.alerts.length >= 1);
    for (const a of r.alerts) {
      assert.ok(["red","amber","green","blue"].includes(a.tone), `unknown tone: ${a.tone}`);
      assert.ok(a.title, "alert must have title");
    }
  });

  // 29. empty dashData returns safe structure
  it("handles empty dashData without crashing", () => {
    const r = buildCustomerAnalysis({});
    assert.ok(Array.isArray(r.fyList));
    assert.equal(r.fyList.length, 0);
    assert.ok(Array.isArray(r.table));
    assert.ok(Array.isArray(r.segments));
    assert.ok(Array.isArray(r.waterfall));
    assert.ok(Array.isArray(r.cohorts));
    assert.ok(Array.isArray(r.retentionRate));
  });

  // 30. single-FY input has prevFy=null
  it("handles single-FY input with prevFy=null", () => {
    const singleFy = {
      itemFacts: FIXTURE.itemFacts.filter((r) => r.fy === "FY 2026-27"),
      ledgerFacts: [],
      itemMaster: [],
    };
    const r = buildCustomerAnalysis(singleFy);
    assert.equal(r.prevFy, null);
    assert.equal(r.retentionRate.length, 0);
  });

  // 31. yoyPct computed correctly for Champion
  // Champion: cur = 120000, prev (FY25-26) = 80000 → yoyPct = 50
  it("computes yoyPct correctly in table", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    const champion = r.table.find((t) => t.name === "Champion");
    assert.ok(champion, "Champion in table");
    const expected = Math.round((120000 - 80000) / 80000 * 100);
    assert.equal(champion.yoyPct, expected);
  });

  // 32. total3yr sums all FYs
  it("total3yr sums all FYs for Champion: 50k+80k+120k=250k", () => {
    const r = buildCustomerAnalysis(FIXTURE);
    const champion = r.table.find((t) => t.name === "Champion");
    assert.equal(champion.total3yr, 250000);
  });
});
