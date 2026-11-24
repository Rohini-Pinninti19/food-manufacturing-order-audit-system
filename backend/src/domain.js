function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function percentageVariance(actual, planned) {
  if (!Number.isFinite(actual) || !Number.isFinite(planned) || planned <= 0) {
    throw new Error("Actual and planned quantities must be finite and planned must be greater than zero.");
  }
  return Math.round(((actual - planned) / planned) * 100000) / 1000;
}

function calculateTax(lines, sameState) {
  const taxablePaise = lines.reduce(
    (sum, line) => sum + Math.round(line.quantity * line.unitPrice * 100),
    0,
  );
  const taxPaise = lines.reduce((sum, line) => (
    sum + Math.round(Math.round(line.quantity * line.unitPrice * 100) * line.taxRate / 100)
  ), 0);
  const cgstPaise = sameState ? Math.floor(taxPaise / 2) : 0;
  const sgstPaise = sameState ? taxPaise - cgstPaise : 0;
  const igstPaise = sameState ? 0 : taxPaise;
  return {
    taxable: taxablePaise / 100,
    cgst: cgstPaise / 100,
    sgst: sgstPaise / 100,
    igst: igstPaise / 100,
    total: (taxablePaise + taxPaise) / 100,
  };
}

function getStockBalance(movements) {
  return movements.reduce((balance, movement) => balance + Number(movement.quantity), 0);
}

function weightedAverageUnitCost(movements) {
  let balance = 0;
  let inventoryValue = 0;
  for (const movement of movements) {
    const quantity = Number(movement.quantity);
    if (quantity > 0) {
      const cost = movement.unitCost == null
        ? (balance > 0 ? inventoryValue / balance : 0)
        : Number(movement.unitCost);
      balance += quantity;
      inventoryValue += quantity * cost;
    } else if (quantity < 0) {
      if (Math.abs(quantity) > balance) {
        throw new Error("Cannot value stock below zero.");
      }
      const average = balance > 0 ? inventoryValue / balance : 0;
      balance += quantity;
      inventoryValue = Math.max(0, inventoryValue + quantity * average);
    }
  }
  return balance > 0 ? Math.round((inventoryValue / balance) * 10000) / 10000 : 0;
}

function convertQuantity(quantity, fromUnit, toUnit, unitsPerCarton = null) {
  const normalize = (unit) => unit.trim().toLowerCase().replace(/s$/, "");
  const from = normalize(fromUnit);
  const to = normalize(toUnit);
  if (from === to) return quantity;
  const aliases = { gram: "g", kilogram: "kg", liter: "l", litre: "l" };
  const normalizedFrom = aliases[from] || from;
  const normalizedTo = aliases[to] || to;
  const factors = {
    g: ["mass", 0.001],
    gram: ["mass", 0.001],
    kg: ["mass", 1],
    kilogram: ["mass", 1],
    ml: ["volume", 0.001],
    l: ["volume", 1],
    litre: ["volume", 1],
    liter: ["volume", 1],
    piece: ["count", 1],
    pc: ["count", 1],
    packet: ["packet", 1],
    carton: ["carton", 1],
  };
  if (normalizedFrom === "carton" && normalizedTo === "packet" && Number(unitsPerCarton) > 0) return quantity * Number(unitsPerCarton);
  if (normalizedFrom === "packet" && normalizedTo === "carton" && Number(unitsPerCarton) > 0) return quantity / Number(unitsPerCarton);
  const fromFactor = factors[from] || factors[normalizedFrom];
  const toFactor = factors[to] || factors[normalizedTo];
  if (!fromFactor || !toFactor || fromFactor[0] !== toFactor[0]) {
    throw new Error(`Cannot convert ${fromUnit} to ${toUnit}.`);
  }
  return quantity * fromFactor[1] / toFactor[1];
}

function financialYear(date = new Date()) {
  const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
}

module.exports = {
  calculateTax,
  convertQuantity,
  financialYear,
  getStockBalance,
  percentageVariance,
  roundMoney,
  weightedAverageUnitCost,
};
