const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateTax,
  convertQuantity,
  financialYear,
  getStockBalance,
  percentageVariance,
  weightedAverageUnitCost,
} = require("./domain");

test("benchmark production yield and material variance are calculated accurately", () => {
  assert.equal(percentageVariance(188, 200), -6);
  assert.equal(percentageVariance(10.5, 10), 5);
});

test("intrastate and interstate tax totals split GST correctly", () => {
  const lines = [{ quantity: 150, unitPrice: 50, taxRate: 5 }];
  assert.deepEqual(calculateTax(lines, true), { taxable: 7500, cgst: 187.5, sgst: 187.5, igst: 0, total: 7875 });
  assert.deepEqual(calculateTax(lines, false), { taxable: 7500, cgst: 0, sgst: 0, igst: 375, total: 7875 });
});

test("ledger balance is derived from signed movements", () => {
  assert.equal(getStockBalance([{ quantity: 100 }, { quantity: 60 }, { quantity: -40 }]), 120);
});

test("weighted average costing includes receipts and values issues at the current average", () => {
  assert.equal(weightedAverageUnitCost([
    { quantity: 100, unitCost: 42 },
    { quantity: 60, unitCost: 45 },
    { quantity: -40, unitCost: 43.125 },
  ]), 43.125);
});

test("common mass, volume, and carton quantities convert to the item's stock unit", () => {
  assert.equal(convertQuantity(500, "g", "kg"), 0.5);
  assert.equal(convertQuantity(2500, "ml", "L"), 2.5);
  assert.equal(convertQuantity(3, "cartons", "packets", 20), 60);
  assert.equal(convertQuantity(1, "kilogram", "g"), 1000);
});

test("invoice financial year changes on 1 April", () => {
  assert.equal(financialYear(new Date("2026-03-31T12:00:00Z")), "2025-26");
  assert.equal(financialYear(new Date("2026-04-01T12:00:00Z")), "2026-27");
});
