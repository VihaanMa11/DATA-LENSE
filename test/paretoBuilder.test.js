import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildCustomerPareto } from "../server/paretoBuilder.js";

// ---------------------------------------------------------------------------
// Fixture: 3 FYs, 5 customers, a Cash row, a churned customer
//
// FY 2024-25:
//   Customer A: gross 200000, return 10000  → net 190000
//   Customer B: gross 100000, no return     → net 100000
//   Customer C: gross  60000, no return     → net  60000
//   Cash:       gross  30000                → EXCLUDED
//   Total (excl Cash): 350000
//   Ranks: A=1, B=2, C=3
//
// FY 2025-26:
//   Customer A: gross 220000, return 20000  → net 200000
//   Customer B: gross  80000, no return     → net  80000
//   Customer C: gross  90000, no return     → net  90000
//   Customer D: gross  50000, no return     → net  50000  (NEW)
//   Cash:       gross  20000                → EXCLUDED
//   Total (excl Cash): 420000
//   Ranks: A=1, C=2, B=3, D=4
//   Note: Customer E is absent (not in this FY)
//
// FY 2026-27 (latest / default currentFy):
//   Customer A: gross 250000, return 10000  → net 240000
//   Customer C: gross 120000, no return     → net 120000
//   Customer D: gross  60000, no return     → net  60000
//   Customer E: gross  40000, no return     → net  40000  (NEW)
//   Cash:       gross  15000                → EXCLUDED
//   Note: Customer B is absent (CHURNED from FY 2025-26)
//   Total (excl Cash): 460000
//   Ranks: A=1, C=2, D=3, E=4
//
// Key assertions:
//   - Cash never appears in any output
//   - Customer B: churned (rankPrev=3 in FY25-26, rankCur=null in FY26-27)
//   - Customer E: new (rankPrev=null, rankCur=4)
//   - customersTo80 in FY 2026-27:
//     sorted: A=240000(52.2%), C=120000(26.1%), D=60000(13.0%), E=40000(8.7%)
//     cum:    52.2%           78.3%             91.3%
//     → 3 customers to reach 80% (A+C = 78.3%, A+C+D = 91.3% >= 80 → 3)
//     Wait, A alone = 240/460 = 52.17%, A+C = 360/460 = 78.26% (<80),
//     A+C+D = 420/460 = 91.3% (>=80) → 3 customers
//   - top1Share FY26-27: 240000/460000 = 52.2%
//   - top3Share FY26-27: (240000+120000+60000)/460000 = 420000/460000 = 91.3%
//   - concentration tiers FY26-27: top1=52.2, t2_3=round1(120000/460000*100)=26.1,
//     t4_7=round1(40000/460000*100)=8.7, rest=0
//     (only 4 customers; rank 3-6 → D; rank 4 → E; ranks 4-7 include only E in slot 4)
//     Actually: sorted=[A,C,D,E], top1=A(rank1), t2_3=C(rank2)+D(rank3? no, only 2 entries 2-3)
//     Wait: t2_3 covers indices 1,2 = C,D → (120000+60000)/460000 = 39.1%
//     t4_7 covers indices 3,4,5,6 = E only → 40000/460000 = 8.7%
//     rest = indices 7+ = nothing = 0
//     top1+t2_3+t4_7+rest should ≈ 100%: 52.2+39.1+8.7+0 = 100%
// ---------------------------------------------------------------------------

function salesHeader(fy, month, party, finalAmount) {
  return { tx: "Sales", fy, month, party, finalAmount, isHeader: true, amount: 0, date: `${month}-01` };
}

function returnHeader(fy, month, party, finalAmount) {
  return { tx: "Sales Return", fy, month, party, finalAmount, isHeader: true, amount: 0, date: `${month}-05` };
}

const FIXTURE = {
  itemFacts: [
    // FY 2024-25
    salesHeader("FY 2024-25", "2024-04", "Customer A", 200000),
    returnHeader("FY 2024-25", "2024-04", "Customer A", 10000),
    salesHeader("FY 2024-25", "2024-05", "Customer B", 100000),
    salesHeader("FY 2024-25", "2024-06", "Customer C", 60000),
    salesHeader("FY 2024-25", "2024-07", "Cash", 30000),        // EXCLUDED

    // FY 2025-26
    salesHeader("FY 2025-26", "2025-04", "Customer A", 220000),
    returnHeader("FY 2025-26", "2025-04", "Customer A", 20000),
    salesHeader("FY 2025-26", "2025-05", "Customer B", 80000),
    salesHeader("FY 2025-26", "2025-06", "Customer C", 90000),
    salesHeader("FY 2025-26", "2025-07", "Customer D", 50000),
    salesHeader("FY 2025-26", "2025-08", "Cash", 20000),        // EXCLUDED

    // FY 2026-27
    salesHeader("FY 2026-27", "2026-04", "Customer A", 250000),
    returnHeader("FY 2026-27", "2026-04", "Customer A", 10000),
    salesHeader("FY 2026-27", "2026-05", "Customer C", 120000),
    salesHeader("FY 2026-27", "2026-06", "Customer D", 60000),
    salesHeader("FY 2026-27", "2026-07", "Customer E", 40000),
    salesHeader("FY 2026-27", "2026-08", "Cash", 15000),        // EXCLUDED
    salesHeader("FY 2026-27", "2026-09", "CASH", 5000),         // case-insensitive EXCLUDED
  ],
  ledgerFacts: [],
  itemMaster: [],
};

const round1 = (v) => Math.round(v * 10) / 10;

describe("buildCustomerPareto", () => {

  // 1. Cash excluded from all output
  it("excludes Cash party (case-insensitive) from all results", () => {
    const r = buildCustomerPareto(FIXTURE);
    const names = r.table.map((t) => t.name);
    assert.ok(!names.includes("Cash"), "Cash should be excluded");
    assert.ok(!names.includes("CASH"), "CASH should be excluded");
    const rcNames = r.rankChanges.map((rc) => rc.name);
    assert.ok(!rcNames.includes("Cash"), "rankChanges should not include Cash");
    assert.ok(!rcNames.includes("CASH"), "rankChanges should not include CASH");
  });

  // 2. fyList chronological
  it("returns fyList in chronological order", () => {
    const r = buildCustomerPareto(FIXTURE);
    assert.deepStrictEqual(r.fyList, ["FY 2024-25", "FY 2025-26", "FY 2026-27"]);
  });

  // 3. currentFy defaults to latest
  it("defaults currentFy to latest FY", () => {
    const r = buildCustomerPareto(FIXTURE);
    assert.equal(r.currentFy, "FY 2026-27");
    assert.equal(r.prevFy, "FY 2025-26");
  });

  // 4. options.fy override
  it("respects options.fy override", () => {
    const r = buildCustomerPareto(FIXTURE, { fy: "FY 2025-26" });
    assert.equal(r.currentFy, "FY 2025-26");
    assert.equal(r.prevFy, "FY 2024-25");
  });

  // 5. customersTo80 in FY 2026-27
  // sorted: A=240000 (52.17%), C=120000 (78.26%), D=60000 (91.3%)
  // 3 customers to reach 80%
  it("computes customersTo80 correctly for currentFy", () => {
    const r = buildCustomerPareto(FIXTURE);
    assert.equal(r.kpis.customersTo80.cur, 3);
  });

  // 6. customersTo80.prev for FY 2025-26
  // sorted: A=200000(47.6%), C=90000(68.9%), B=80000(87.9%)
  // 3 customers to reach 80%
  it("computes customersTo80.prev for prevFy", () => {
    const r = buildCustomerPareto(FIXTURE);
    assert.equal(r.kpis.customersTo80.prev, 3);
  });

  // 7. top1Share FY 2026-27 = 240000/460000 = 52.2%
  it("computes top1Share correctly", () => {
    const r = buildCustomerPareto(FIXTURE);
    const expected = round1(240000 / 460000 * 100);
    assert.equal(r.kpis.top1Share.cur, expected);
  });

  // 8. top3Share FY 2026-27 = (240000+120000+60000)/460000 = 91.3%
  it("computes top3Share correctly", () => {
    const r = buildCustomerPareto(FIXTURE);
    const expected = round1(420000 / 460000 * 100);
    assert.equal(r.kpis.top3Share.cur, expected);
  });

  // 9. totalRevenue.cur = 460000, prev = 420000
  it("computes totalRevenue cur and prev", () => {
    const r = buildCustomerPareto(FIXTURE);
    assert.equal(r.kpis.totalRevenue.cur, 460000);
    assert.equal(r.kpis.totalRevenue.prev, 420000);
  });

  // 10. totalRevenue.deltaPct = (460000-420000)/420000*100 ≈ 10
  it("computes totalRevenue.deltaPct", () => {
    const r = buildCustomerPareto(FIXTURE);
    const expected = Math.round((460000 - 420000) / 420000 * 100);
    assert.equal(r.kpis.totalRevenue.deltaPct, expected);
  });

  // 11. concentration tiers sum ~100 for each FY
  it("concentration tiers sum to approximately 100 for each FY", () => {
    const r = buildCustomerPareto(FIXTURE);
    for (const fy of r.fyList) {
      const t = r.concentrationByFy[fy];
      const total = t.top1 + t.t2_3 + t.t4_7 + t.t8_15 + t.rest;
      assert.ok(
        Math.abs(total - 100) < 1.5,
        `FY ${fy} tiers sum ${total} should be ~100`,
      );
    }
  });

  // 12. Customer B status is "Churned" (in FY25-26 but not FY26-27)
  it("marks churned customer correctly", () => {
    const r = buildCustomerPareto(FIXTURE);
    const b = r.rankChanges.find((rc) => rc.name === "Customer B");
    assert.ok(b, "Customer B should appear in rankChanges");
    assert.equal(b.status, "Churned");
    assert.equal(b.rankCur, null);
    assert.ok(b.rankPrev != null, "rankPrev should be set for churned customer");
  });

  // 13. Customer E status is "New"
  it("marks new customer correctly", () => {
    const r = buildCustomerPareto(FIXTURE);
    const e = r.rankChanges.find((rc) => rc.name === "Customer E");
    assert.ok(e, "Customer E should appear in rankChanges");
    assert.equal(e.status, "New");
    assert.equal(e.rankPrev, null);
    assert.ok(e.rankCur != null);
  });

  // 14. Customer A rank in FY 2026-27 = 1
  it("Customer A is rank 1 in currentFy", () => {
    const r = buildCustomerPareto(FIXTURE);
    const a = r.rankChanges.find((rc) => rc.name === "Customer A");
    assert.equal(a?.rankCur, 1);
  });

  // 15. table sorted by currentFy desc, Customer A first
  it("table is sorted by currentFy net sales descending", () => {
    const r = buildCustomerPareto(FIXTURE);
    assert.equal(r.table[0].name, "Customer A");
    assert.ok((r.table[0].perFy["FY 2026-27"] || 0) >= (r.table[1].perFy["FY 2026-27"] || 0));
  });

  // 16. zone assignment: Customer A cumPct ≤ 50 → "Top 50%" in FY26-27
  // A = 52.17% alone → cumPct ≈ 52.2 > 50 → "Core 80%"
  it("assigns zone based on cumulative percentage", () => {
    const r = buildCustomerPareto(FIXTURE);
    const a = r.table.find((t) => t.name === "Customer A");
    assert.ok(a, "Customer A in table");
    // A's share alone > 50% so cumPct > 50 but ≤ 80 → Core 80%
    assert.equal(a.zone, "Core 80%");
  });

  // 17. rankDelta: Customer C was rank 2 in FY25-26, rank 2 in FY26-27 → delta = 0
  it("computes rankDelta for stable customer", () => {
    const r = buildCustomerPareto(FIXTURE);
    const c = r.table.find((t) => t.name === "Customer C");
    assert.ok(c, "Customer C in table");
    // prevRank=2, curRank=2 → delta = 2-2 = 0
    assert.equal(c.rankDelta, 0);
  });

  // 18. paretoByFy has entries for all FYs
  it("paretoByFy contains entries for all FYs", () => {
    const r = buildCustomerPareto(FIXTURE);
    for (const fy of r.fyList) {
      assert.ok(r.paretoByFy[fy], `paretoByFy missing ${fy}`);
      assert.ok(Array.isArray(r.paretoByFy[fy].labels));
      assert.ok(Array.isArray(r.paretoByFy[fy].bars));
      assert.ok(Array.isArray(r.paretoByFy[fy].cum));
    }
  });

  // 19. paretoByFy last cum entry ≈ 100 for each FY
  it("paretoByFy last cum entry is approximately 100 for each FY", () => {
    const r = buildCustomerPareto(FIXTURE);
    for (const fy of r.fyList) {
      const cum = r.paretoByFy[fy].cum;
      const last = cum[cum.length - 1];
      assert.ok(Math.abs(last - 100) < 0.5, `${fy} last cum ${last} should be ~100`);
    }
  });

  // 20. insights is non-empty array
  it("produces at least one insight", () => {
    const r = buildCustomerPareto(FIXTURE);
    assert.ok(Array.isArray(r.insights));
    assert.ok(r.insights.length >= 1);
    for (const ins of r.insights) {
      assert.ok(["red","amber","green","blue"].includes(ins.tone), `unknown tone: ${ins.tone}`);
      assert.ok(ins.title, "insight must have title");
      assert.ok(ins.body, "insight must have body");
    }
  });

  // 21. empty dashData returns safe object
  it("handles empty dashData without crashing", () => {
    const r = buildCustomerPareto({});
    assert.ok(Array.isArray(r.fyList));
    assert.equal(r.fyList.length, 0);
    assert.ok(Array.isArray(r.table));
    assert.ok(Array.isArray(r.insights));
  });

  // 22. single FY input has prevFy=null
  it("handles single-FY input with prevFy=null", () => {
    const singleFy = {
      itemFacts: FIXTURE.itemFacts.filter((r) => r.fy === "FY 2026-27"),
      ledgerFacts: [],
      itemMaster: [],
    };
    const r = buildCustomerPareto(singleFy);
    assert.equal(r.prevFy, null);
    assert.equal(r.kpis.customersTo80.prev, null);
    assert.equal(r.kpis.totalRevenue.prev, 0);
  });

  // 23. yoyPct computed correctly for Customer A
  // cur = 240000, prev (FY25-26) = 200000 → yoyPct = (240000-200000)/200000*100 = 20
  it("computes yoyPct correctly in table", () => {
    const r = buildCustomerPareto(FIXTURE);
    const a = r.table.find((t) => t.name === "Customer A");
    const expected = Math.round((240000 - 200000) / 200000 * 100);
    assert.equal(a.yoyPct, expected);
  });

  // 24. Customer C rank change: prevRank=2 in FY25-26, curRank=2 in FY26-27 → Held
  it("marks stable rank as Held", () => {
    const r = buildCustomerPareto(FIXTURE);
    const c = r.rankChanges.find((rc) => rc.name === "Customer C");
    assert.ok(c, "Customer C should be in rankChanges");
    assert.equal(c.status, "Held");
  });

  // 25. trend array length matches fyList length
  it("trend array length matches fyList length in table", () => {
    const r = buildCustomerPareto(FIXTURE);
    for (const row of r.table) {
      assert.equal(row.trend.length, r.fyList.length, `${row.name} trend length mismatch`);
    }
  });
});
