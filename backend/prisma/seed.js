require("dotenv").config();

const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set before seeding.");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const adminPassword = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || "DemoAdmin!2026", 12);
  const salesPassword = await bcrypt.hash(process.env.SEED_SALESPERSON_PASSWORD || "DemoSales!2026", 12);
  const productionPassword = await bcrypt.hash(process.env.SEED_PRODUCTION_PASSWORD || "DemoProduction!2026", 12);
  const auditorPassword = await bcrypt.hash(process.env.SEED_AUDITOR_PASSWORD || "DemoAuditor!2026", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@fooderp.local" },
    update: { passwordHash: adminPassword, active: true },
    create: { name: "Factory Admin", email: "admin@fooderp.local", passwordHash: adminPassword, role: "ADMIN" },
  });
  const sales = await prisma.user.upsert({
    where: { email: "sales@fooderp.local" },
    update: { passwordHash: salesPassword, active: true },
    create: { name: "Field Sales", email: "sales@fooderp.local", passwordHash: salesPassword, role: "SALESMAN" },
  });
  await prisma.user.upsert({
    where: { email: "production@fooderp.local" },
    update: { passwordHash: productionPassword, active: true },
    create: { name: "Production Supervisor", email: "production@fooderp.local", passwordHash: productionPassword, role: "PRODUCTION" },
  });
  await prisma.user.upsert({
    where: { email: "auditor@fooderp.local" },
    update: { passwordHash: auditorPassword, active: true },
    create: { name: "Read-only Auditor", email: "auditor@fooderp.local", passwordHash: auditorPassword, role: "AUDITOR" },
  });

  const definitions = [
    { code: "FLR-001", name: "Premium rice flour", type: "RAW_MATERIAL", unit: "kg", opening: 100, openingCost: 42, reorderLevel: 20 },
    { code: "OIL-001", name: "Groundnut oil", type: "RAW_MATERIAL", unit: "L", opening: 30, openingCost: 140, reorderLevel: 10 },
    { code: "SPC-001", name: "Murukku spice blend", type: "RAW_MATERIAL", unit: "kg", opening: 5, openingCost: 200, reorderLevel: 2 },
    { code: "PKG-001", name: "200g printed pouches", type: "PACKAGING", unit: "pcs", opening: 500, openingCost: 2.5, reorderLevel: 100 },
    { code: "PKG-002", name: "Shipping cartons", type: "PACKAGING", unit: "pcs", opening: 30, openingCost: 15, reorderLevel: 10 },
    { code: "FG-001", name: "Classic Murukku · 200g", type: "FINISHED_GOOD", unit: "packet", opening: 50, openingCost: 0, reorderLevel: 40, hsn: "190590", gstRate: 5, sellingPrice: 50, unitsPerCarton: 20 },
  ];
  const items = {};
  for (const definition of definitions) {
    const { opening, openingCost, ...itemData } = definition;
    const item = await prisma.inventoryItem.upsert({
      where: { code: definition.code },
      update: itemData,
      create: itemData,
    });
    items[definition.code] = item;
    await prisma.stockMovement.upsert({
      where: {
        sourceType_sourceId_itemId_type: {
          sourceType: "opening",
          sourceId: "benchmark-opening-v1",
          itemId: item.id,
          type: "OPENING",
        },
      },
      update: { quantity: opening, unitCost: openingCost },
      create: {
        itemId: item.id,
        type: "OPENING",
        quantity: opening,
        unitCost: openingCost,
        sourceType: "opening",
        sourceId: "benchmark-opening-v1",
        reference: "OPENING-BALANCE",
        createdById: admin.id,
      },
    });
  }

  const product = items["FG-001"];
  const bom = await prisma.bom.upsert({
    where: { productId: product.id },
    update: { batchSize: 200, active: true },
    create: { productId: product.id, batchSize: 200 },
  });
  const components = [
    ["FLR-001", 40],
    ["OIL-001", 10],
    ["SPC-001", 1.2],
    ["PKG-001", 200],
    ["PKG-002", 10],
  ];
  for (const [code, quantity] of components) {
    await prisma.bomItem.upsert({
      where: { bomId_itemId: { bomId: bom.id, itemId: items[code].id } },
      update: { quantity, tolerance: 3 },
      create: { bomId: bom.id, itemId: items[code].id, quantity, tolerance: 3 },
    });
  }

  const customers = [
    { code: "RET-001", name: "Retailer A · Chennai", state: "Tamil Nadu", gstin: "33ABCDE1234F1Z5", creditLimit: 50000, salespersonId: sales.id },
    { code: "DST-001", name: "Distributor B · Coimbatore", state: "Tamil Nadu", gstin: "33FGHIJ5678K1Z2", creditLimit: 100000, salespersonId: sales.id },
  ];
  for (const customer of customers) {
    await prisma.customer.upsert({ where: { code: customer.code }, update: customer, create: customer });
  }
  await prisma.supplier.upsert({
    where: { code: "SUP-001" },
    update: { name: "Harvest Foods Supply" },
    create: { code: "SUP-001", name: "Harvest Foods Supply", phone: "+91 98765 43210" },
  });
  console.log("Benchmark seed ready. Logins: admin@fooderp.local, sales@fooderp.local, production@fooderp.local, auditor@fooderp.local");
}

main()
  .catch((error) => {
    console.error("Benchmark seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
