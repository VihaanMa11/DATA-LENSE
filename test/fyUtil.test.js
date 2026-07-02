import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { analyzeFys, resolveCurrentFy } from "../server/fyUtil.js";

// ---------------------------------------------------------------------------
// Fixture: 3 FYs where the last has only 3 distinct months
// FY 2023-24: 12 months → complete
// FY 2024-25: 12 months → complete
// FY 2025-26: 3 months  → partial
// ---------------------------------------------------------------------------

function makeFact(fy, month) {
  return { fy, month };
}

const COMPLETE_MONTHS_24 = [
  "2023-04","2023-05","2023-06","2023-07","2023-08","2023-09",
  "2023-10","2023-11","2023-12","2024-01","2024-02","2024-03",
];
const COMPLETE_MONTHS_25 = [
  "2024-04","2024-05","2024-06","2024-07","2024-08","2024-09",
  "2024-10","2024-11","2024-12","2025-01","2025-02","2025-03",
];
const PARTIAL_MONTHS_26 = ["2025-04","2025-05","2025-06"]; // only 3

const itemFacts = [
  ...COMPLETE_MONTHS_24.map((m) => makeFact("FY 2023-24", m)),
  ...COMPLETE_MONTHS_25.map((m) => makeFact("FY 2024-25", m)),
  ...PARTIAL_MONTHS_26.map((m) => makeFact("FY 2025-26", m)),
];

describe("fyUtil — analyzeFys", () => {
  it("identifies the last FY as partial when it has only 3 months", () => {
    const { partialFys, completeFys, latestCompleteFy, fyList } = analyzeFys(itemFacts, []);
    assert.deepEqual(fyList, ["FY 2023-24", "FY 2024-25", "FY 2025-26"]);
    assert.deepEqual(partialFys, ["FY 2025-26"]);
    assert.deepEqual(completeFys, ["FY 2023-24", "FY 2024-25"]);
    assert.equal(latestCompleteFy, "FY 2024-25");
  });

  it("resolveCurrentFy defaults to latestCompleteFy when no FY requested", () => {
    const { fyList, latestCompleteFy } = analyzeFys(itemFacts, []);
    const result = resolveCurrentFy("", fyList, latestCompleteFy);
    assert.equal(result, "FY 2024-25");
  });

  it("resolveCurrentFy honours an explicit FY even if it is partial", () => {
    const { fyList, latestCompleteFy } = analyzeFys(itemFacts, []);
    const result = resolveCurrentFy("FY 2025-26", fyList, latestCompleteFy);
    assert.equal(result, "FY 2025-26");
  });
});
