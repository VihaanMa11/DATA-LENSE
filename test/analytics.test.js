import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildAnalytics } from "../server/analyticsBuilder.js";

const MOCK_DASH = {
  itemFacts: {
    Sales: [
      { "Bill Date": "2025-04-01", "Party Name": "Raj Shoes", "Item Name": "Sandal A", "Main Qt": "10", "Final Amt": "5000" },
      { "Bill Date": "2025-05-15", "Party Name": "Raj Shoes", "Item Name": "Sandal A", "Main Qt": "5", "Final Amt": "2500" },
      { "Bill Date": "2025-04-10", "Party Name": "Patel Traders", "Item Name": "Boot B", "Main Qt": "20", "Final Amt": "12000" },
    ],
    "Sales Return": [
      { "Bill Date": "2025-04-05", "Party Name": "Raj Shoes", "Item Name": "Sandal A", "Main Qt": "1", "Final Amt": "500" },
    ],
    Purchase: [
      { "Bill Date": "2025-04-01", "Party Name": "Supplier X", "Item Name": "Sandal A", "Main Qt": "50", "Final Amt": "3000" },
    ],
    "Purchase Return": [],
  },
  ledgerFacts: {
    Receipt: [
      { "Bill Date": "2025-04-20", "Account Name": "Raj Shoes", "Debit Amount": "4000", "Credit Amount": "0" },
    ],
    Payment: [
      { "Bill Date": "2025-04-25", "Account Name": "Office Rent", "Debit Amount": "5000", "Credit Amount": "0" },
    ],
    "Credit Note": [],
    "Debit Note": [],
    Journal: [],
  },
  masters: { items: 2, accounts: 3, itemFields: [], accountFields: [] },
};

describe("buildAnalytics", () => {
  it("computes netSales correctly for a customer", () => {
    const result = buildAnalytics(MOCK_DASH);
    const raj = result.customers.find(c => c.name === "Raj Shoes");
    assert.ok(raj, "Raj Shoes customer found");
    assert.equal(raj.netSales, 7000, "7500 sales - 500 return = 7000");
  });

  it("computes collectionRate for a customer", () => {
    const result = buildAnalytics(MOCK_DASH);
    const raj = result.customers.find(c => c.name === "Raj Shoes");
    assert.ok(raj.collectionRate > 0, "collection rate > 0");
  });

  it("assigns risk flag based on daysSinceLastSale", () => {
    const result = buildAnalytics(MOCK_DASH);
    const raj = result.customers.find(c => c.name === "Raj Shoes");
    assert.ok(["🔴 High Risk", "🟡 Medium Risk", "🟠 Watch", "🟢 Active"].includes(raj.riskFlag));
  });

  it("computes total expenses", () => {
    const result = buildAnalytics(MOCK_DASH);
    const rent = result.expenses.find(e => e.accountName === "Office Rent");
    assert.ok(rent, "Office Rent found in expenses");
    assert.equal(rent.totalExpenses, 5000);
  });

  it("assigns customer tiers correctly", () => {
    const result = buildAnalytics(MOCK_DASH);
    const patel = result.customers.find(c => c.name === "Patel Traders");
    assert.ok(patel.tier, "tier assigned");
  });
});
