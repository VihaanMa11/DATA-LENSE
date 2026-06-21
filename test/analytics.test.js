import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildAnalytics } from "../server/analyticsBuilder.js";

// Mirrors the real dashboardBuilder output: flat itemFacts/ledgerFacts arrays.
const MOCK_DASH = {
  itemFacts: [
    { tx: "Sales", date: "2025-04-01", month: "2025-04", party: "Raj Shoes", accountGroup: "ZONE-1", state: "WB", station: "Salar", item: "Sandal A", itemGroup: "Sandals", qty: 10, amount: 5000, finalAmount: 7500, price: 500 },
    { tx: "Sales", date: "2025-05-15", month: "2025-05", party: "Raj Shoes", accountGroup: "ZONE-1", state: "WB", station: "Salar", item: "Sandal A", itemGroup: "Sandals", qty: 5, amount: 2500, finalAmount: 0, price: 500 },
    { tx: "Sales", date: "2025-04-10", month: "2025-04", party: "Patel Traders", accountGroup: "ZONE-2", state: "GJ", station: "Surat", item: "Boot B", itemGroup: "Boots", qty: 20, amount: 12000, finalAmount: 120000, price: 600 },
    { tx: "Sales Return", date: "2025-04-05", month: "2025-04", party: "Raj Shoes", item: "Sandal A", itemGroup: "Sandals", qty: 1, amount: 500, finalAmount: 500 },
    { tx: "Purchase", date: "2025-04-01", month: "2025-04", party: "Supplier X", item: "Sandal A", itemGroup: "Sandals", qty: 50, amount: 15000, finalAmount: 15000, price: 300 },
  ],
  ledgerFacts: [
    { tx: "Receipt", date: "2025-04-20", month: "2025-04", account: "Raj Shoes", accountGroup: "ZONE-1", debit: 0, credit: 4000, businessAmount: 4000 },
    { tx: "Payment", date: "2025-04-25", month: "2025-04", account: "Office Rent", accountGroup: "Indirect Expenses", debit: 5000, credit: 0, businessAmount: 5000 },
    { tx: "Payment", date: "2025-04-26", month: "2025-04", account: "Supplier X", accountGroup: "Sundry Creditors", debit: 8000, credit: 0, businessAmount: 8000 },
  ],
  masters: { items: 2, accounts: 3 },
};

describe("buildAnalytics", () => {
  it("computes netSales correctly for a customer (bill-level finalAmount)", () => {
    const a = buildAnalytics(MOCK_DASH);
    const raj = a.customers.find(c => c.name === "Raj Shoes");
    assert.ok(raj, "Raj Shoes found");
    assert.equal(raj.netSales, 7000, "7500 gross - 500 return = 7000");
  });

  it("attributes receipts to the customer via Receipt credit side", () => {
    const a = buildAnalytics(MOCK_DASH);
    const raj = a.customers.find(c => c.name === "Raj Shoes");
    assert.equal(raj.receipts, 4000);
    assert.ok(raj.collectionRate > 0);
  });

  it("assigns a valid risk flag", () => {
    const a = buildAnalytics(MOCK_DASH);
    const raj = a.customers.find(c => c.name === "Raj Shoes");
    assert.ok(["🔴 High Risk", "🟡 Medium Risk", "🟠 Watch", "🟢 Active"].includes(raj.riskFlag));
  });

  it("enriches customer station and group from sales rows", () => {
    const a = buildAnalytics(MOCK_DASH);
    const raj = a.customers.find(c => c.name === "Raj Shoes");
    assert.equal(raj.station, "Salar");
    assert.equal(raj.group, "ZONE-1");
  });

  it("computes expenses from Payment debit side", () => {
    const a = buildAnalytics(MOCK_DASH);
    const rent = a.expenses.find(e => e.accountName === "Office Rent");
    assert.ok(rent, "Office Rent found");
    assert.equal(rent.totalExpenses, 5000);
  });

  it("tracks vendors and attributes payments via Payment debit", () => {
    const a = buildAnalytics(MOCK_DASH);
    const sup = a.vendors.find(v => v.name === "Supplier X");
    assert.ok(sup, "Supplier X vendor found");
    assert.equal(sup.netPurchase, 15000);
    assert.equal(sup.payments, 8000);
    assert.equal(sup.payable, 7000);
  });

  it("ranks items by line-level amount", () => {
    const a = buildAnalytics(MOCK_DASH);
    assert.equal(a.items.length, 2);
    assert.equal(a.items[0].name, "Boot B", "Boot B (12000) ranks above Sandal A (7000 net)");
    assert.equal(a.items[0].rank, 1);
  });

  it("assigns customer tiers", () => {
    const a = buildAnalytics(MOCK_DASH);
    const patel = a.customers.find(c => c.name === "Patel Traders");
    assert.equal(patel.tier, "🥈 Silver", "120000 net → Silver");
  });

  it("builds a 12-month trend and a forecast object", () => {
    const a = buildAnalytics(MOCK_DASH);
    assert.equal(a.monthlyTrend.length, 12);
    assert.ok(a.forecast && typeof a.forecast.m1 === "number");
  });
});
