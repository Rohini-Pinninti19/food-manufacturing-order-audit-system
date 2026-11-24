require("dotenv").config();

const bcrypt = require("bcrypt");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const jwt = require("jsonwebtoken");
const morgan = require("morgan");
const PDFDocument = require("pdfkit");
const { z } = require("zod");
const prisma = require("./db");
const { allowRoles, requireAuth, writeAudit } = require("./auth");
const { AppError } = require("./errors");
const {
  calculateTax,
  convertQuantity,
  financialYear,
  getStockBalance,
  percentageVariance,
  roundMoney,
  weightedAverageUnitCost,
} = require("./domain");

const app = express();
const port = Number(process.env.PORT || 4000);
const companyState = process.env.COMPANY_STATE || "Tamil Nadu";
const companyName = process.env.COMPANY_NAME || "Fieldstone Foods";
const companyGstin = process.env.COMPANY_GSTIN || "";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be set to at least 32 characters.");
}

app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const positive = z.number().finite().positive();
const idParam = z.string().min(1);
const numberCode = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
const invoiceNumber = async (tx) => {
  const year = financialYear();
  const sequence = await tx.invoiceSequence.upsert({
    where: { financialYear: year },
    update: { lastNumber: { increment: 1 } },
    create: { financialYear: year, lastNumber: 1 },
  });
  return `INV/${year}/${String(sequence.lastNumber).padStart(4, "0")}`;
};

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
  if (!user || !user.active || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw new AppError(401, "Email or password is incorrect.");
  }
  const token = jwt.sign(
    { sub: user.id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "8h" },
  );
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}));

app.use("/api", requireAuth);

app.get("/api/me", asyncRoute(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth.id },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) throw new AppError(401, "Your account is no longer available.");
  res.json(user);
}));

app.get("/api/users", allowRoles("ADMIN"), asyncRoute(async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  res.json(users);
}));

app.post("/api/users", allowRoles("ADMIN"), asyncRoute(async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    password: z.string().min(12).max(128),
    role: z.enum(["ADMIN", "SALESMAN", "PRODUCTION", "AUDITOR"]),
  }).parse(req.body);
  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await prisma.$transaction(async (tx) => {
    const row = await tx.user.create({
      data: { name: body.name, email: body.email, passwordHash, role: body.role },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
    await writeAudit(tx, req, "USER_CREATED", "User", row.id, { email: row.email, role: row.role });
    return row;
  });
  res.status(201).json(user);
}));

app.get("/api/dashboard", allowRoles("ADMIN", "PRODUCTION"), asyncRoute(async (_req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [movements, recentOrders, production, productionRuns, invoices, customers, ordersToday] = await Promise.all([
    prisma.stockMovement.findMany({ include: { item: true }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.customerOrder.findMany({ include: { customer: true, items: { include: { item: true } } }, orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.productionRun.findMany({ include: { materials: true, product: true }, orderBy: { producedAt: "desc" }, take: 10 }),
    prisma.productionRun.count(),
    prisma.invoice.findMany({ include: { payments: true }, orderBy: { createdAt: "desc" } }),
    prisma.customer.count(),
    prisma.customerOrder.count({ where: { createdAt: { gte: startOfDay } } }),
  ]);
  const itemRows = await prisma.inventoryItem.findMany({
    include: { movements: { select: { quantity: true } } },
  });
  const stock = itemRows.map((item) => ({
    id: item.id,
    name: item.name,
    code: item.code,
    type: item.type,
    unit: item.unit,
    balance: getStockBalance(item.movements),
    reorderLevel: Number(item.reorderLevel),
  }));
  const lowStock = stock.filter((item) => item.balance <= item.reorderLevel);
  const outstanding = invoices.reduce((sum, invoice) => {
    if (invoice.status !== "POSTED") return sum;
    const paid = invoice.payments.reduce((total, payment) => total + Number(payment.amount), 0);
    return sum + Math.max(0, Number(invoice.total) - paid);
  }, 0);
  res.json({
    metrics: {
      pendingOrders: await prisma.customerOrder.count({ where: { status: "PENDING" } }),
      ordersToday,
      productionRuns,
      finishedStock: stock.filter((item) => item.type === "FINISHED_GOOD").reduce((sum, item) => sum + item.balance, 0),
      costPerUnit: production[0] ? Number(production[0].costPerUnit) : null,
      marginPerUnit: production[0] ? Number(production[0].product.sellingPrice) - Number(production[0].costPerUnit) : null,
      varianceAlerts: production.reduce((sum, run) => (
        sum +
        (Math.abs(Number(run.yieldVariancePct)) > 3 ? 1 : 0) +
        run.materials.filter((material) => Math.abs(Number(material.variancePct)) > Number(material.tolerance)).length
      ), 0),
      outstanding: Math.round(outstanding * 100) / 100,
      customers,
    },
    stock,
    lowStock,
    recentOrders,
    recentMovements: movements,
  });
}));

app.get("/api/items", asyncRoute(async (req, res) => {
  const items = await prisma.inventoryItem.findMany({
    where: req.auth.role === "SALESMAN" ? { type: "FINISHED_GOOD" } : undefined,
    include: { movements: { select: { quantity: true } } },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  res.json(items.map(({ movements, ...item }) => ({
    ...item,
    balance: getStockBalance(movements),
  })));
}));

app.post("/api/items", allowRoles("ADMIN"), asyncRoute(async (req, res) => {
  const body = z.object({
    code: z.string().trim().min(2).max(32).transform((value) => value.toUpperCase()),
    name: z.string().trim().min(2).max(120),
    type: z.enum(["RAW_MATERIAL", "PACKAGING", "FINISHED_GOOD"]),
    unit: z.string().trim().min(1).max(20),
    hsn: z.string().trim().max(20).optional(),
    gstRate: z.number().finite().min(0).max(100).default(0),
    sellingPrice: z.number().finite().nonnegative().default(0),
    reorderLevel: z.number().finite().nonnegative().default(0),
    unitsPerCarton: z.number().finite().positive().optional(),
  }).parse(req.body);
  const item = await prisma.$transaction(async (tx) => {
    const row = await tx.inventoryItem.create({ data: body });
    await writeAudit(tx, req, "ITEM_CREATED", "InventoryItem", row.id, { code: row.code });
    return row;
  });
  res.status(201).json(item);
}));

app.patch("/api/items/:id", allowRoles("ADMIN"), asyncRoute(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const body = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    unit: z.string().trim().min(1).max(20).optional(),
    hsn: z.string().trim().max(20).nullable().optional(),
    gstRate: z.number().finite().min(0).max(100).optional(),
    sellingPrice: z.number().finite().nonnegative().optional(),
    reorderLevel: z.number().finite().nonnegative().optional(),
    unitsPerCarton: z.number().finite().positive().nullable().optional(),
  }).refine((value) => Object.keys(value).length > 0).parse(req.body);
  const item = await prisma.$transaction(async (tx) => {
    const row = await tx.inventoryItem.update({ where: { id }, data: body });
    await writeAudit(tx, req, "ITEM_UPDATED", "InventoryItem", row.id, body);
    return row;
  });
  res.json(item);
}));

app.get("/api/customers", allowRoles("ADMIN", "SALESMAN", "PRODUCTION"), asyncRoute(async (req, res) => {
  res.json(await prisma.customer.findMany({
    where: req.auth.role === "SALESMAN" ? { salespersonId: req.auth.id } : undefined,
    orderBy: { name: "asc" },
  }));
}));

app.post("/api/customers", allowRoles("ADMIN"), asyncRoute(async (req, res) => {
  const body = z.object({
    code: z.string().trim().min(2).max(32).transform((value) => value.toUpperCase()),
    name: z.string().trim().min(2).max(120),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().trim().max(30).optional(),
    gstin: z.string().trim().max(20).optional(),
    state: z.string().trim().min(2).max(80),
    creditLimit: z.number().finite().nonnegative().default(0),
    salespersonId: idParam.optional(),
  }).parse(req.body);
  const customer = await prisma.$transaction(async (tx) => {
    if (body.salespersonId) {
      const salesperson = await tx.user.findUnique({ where: { id: body.salespersonId }, select: { role: true, active: true } });
      if (!salesperson || salesperson.role !== "SALESMAN" || !salesperson.active) {
        throw new AppError(400, "Assign the customer to an active salesperson account.");
      }
    }
    const row = await tx.customer.create({ data: { ...body, email: body.email || null } });
    await writeAudit(tx, req, "CUSTOMER_CREATED", "Customer", row.id, { code: row.code });
    return row;
  });
  res.status(201).json(customer);
}));

app.get("/api/suppliers", allowRoles("ADMIN", "PRODUCTION"), asyncRoute(async (_req, res) => {
  res.json(await prisma.supplier.findMany({ orderBy: { name: "asc" } }));
}));

app.post("/api/suppliers", allowRoles("ADMIN"), asyncRoute(async (req, res) => {
  const body = z.object({
    code: z.string().trim().min(2).max(32).transform((value) => value.toUpperCase()),
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().max(30).optional(),
  }).parse(req.body);
  const supplier = await prisma.$transaction(async (tx) => {
    const row = await tx.supplier.create({ data: body });
    await writeAudit(tx, req, "SUPPLIER_CREATED", "Supplier", row.id, { code: row.code });
    return row;
  });
  res.status(201).json(supplier);
}));

app.get("/api/bom", allowRoles("ADMIN", "PRODUCTION"), asyncRoute(async (_req, res) => {
  res.json(await prisma.bom.findMany({
    where: { active: true },
    include: { product: true, items: { include: { item: true } } },
  }));
}));

app.post("/api/bom", allowRoles("ADMIN"), asyncRoute(async (req, res) => {
  const body = z.object({
    productId: idParam,
    batchSize: positive,
    items: z.array(z.object({
      itemId: idParam,
      quantity: positive,
      tolerance: z.number().finite().min(0).max(100).default(3),
    })).min(1),
  }).parse(req.body);
  if (new Set(body.items.map((row) => row.itemId)).size !== body.items.length) {
    throw new AppError(400, "Each material can appear only once in a BOM.");
  }
  const bom = await prisma.$transaction(async (tx) => {
    const product = await tx.inventoryItem.findUnique({ where: { id: body.productId } });
    if (!product || product.type !== "FINISHED_GOOD") throw new AppError(400, "Choose a finished-good product.");
    const components = await tx.inventoryItem.findMany({ where: { id: { in: body.items.map((row) => row.itemId) } } });
    if (components.length !== body.items.length || components.some((item) => item.type === "FINISHED_GOOD")) {
      throw new AppError(400, "BOM components must be existing raw-material or packaging items.");
    }
    const row = await tx.bom.upsert({
      where: { productId: body.productId },
      update: { batchSize: body.batchSize, active: true },
      create: { productId: body.productId, batchSize: body.batchSize },
    });
    await tx.bomItem.deleteMany({ where: { bomId: row.id } });
    await tx.bomItem.createMany({ data: body.items.map((item) => ({ ...item, bomId: row.id })) });
    await writeAudit(tx, req, "BOM_SAVED", "Bom", row.id, { product: product.name, componentCount: body.items.length });
    return tx.bom.findUnique({ where: { id: row.id }, include: { product: true, items: { include: { item: true } } } });
  });
  res.status(201).json(bom);
}));

app.get("/api/stock-ledger", allowRoles("ADMIN", "PRODUCTION", "AUDITOR"), asyncRoute(async (req, res) => {
  const itemId = req.query.itemId ? idParam.parse(req.query.itemId) : undefined;
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  if ((from && Number.isNaN(from.valueOf())) || (to && Number.isNaN(to.valueOf()))) throw new AppError(400, "Invalid ledger date filter.");
  if (from && to && from > to) throw new AppError(400, "Start date must be on or before end date.");
  const movements = await prisma.stockMovement.findMany({
    where: itemId ? { itemId } : undefined,
    include: { item: true, createdBy: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const balances = new Map();
  const rows = movements.map((movement) => {
    const balance = (balances.get(movement.itemId) || 0) + Number(movement.quantity);
    balances.set(movement.itemId, balance);
    return { ...movement, balanceAfter: balance };
  }).filter((movement) => (!from || movement.createdAt >= from) && (!to || movement.createdAt <= to));
  res.json(rows.reverse());
}));

app.post("/api/purchases", allowRoles("ADMIN", "PRODUCTION"), asyncRoute(async (req, res) => {
  const body = z.object({
    supplierId: idParam,
    itemId: idParam,
    quantity: positive,
    unitCost: z.number().finite().nonnegative(),
    unit: z.string().trim().min(1).optional(),
  }).parse(req.body);
  const result = await prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findUnique({ where: { id: body.supplierId } });
    if (!supplier) throw new AppError(400, "Choose a valid supplier.");
    const item = await tx.inventoryItem.findUnique({ where: { id: body.itemId } });
    if (!item || item.type === "FINISHED_GOOD") throw new AppError(400, "Choose a raw material or packaging item.");
    const quantity = convertQuantity(body.quantity, body.unit || item.unit, item.unit, item.unitsPerCarton);
    const purchaseTotal = roundMoney(body.quantity * body.unitCost);
    const unitCost = quantity > 0 ? roundMoney(purchaseTotal / quantity) : body.unitCost;
    const number = numberCode("PO");
    const purchase = await tx.purchase.create({
      data: {
        number,
        supplierId: body.supplierId,
        total: purchaseTotal,
        items: { create: { itemId: item.id, quantity, unitCost } },
      },
    });
    await tx.stockMovement.create({
      data: {
        itemId: item.id,
        type: "PURCHASE_RECEIPT",
        quantity,
        unitCost,
        sourceType: "purchase",
        sourceId: purchase.id,
        reference: number,
        createdById: req.auth.id,
      },
    });
    await writeAudit(tx, req, "PURCHASE_RECEIVED", "Purchase", purchase.id, { number, item: item.name, quantity, unitCost });
    return purchase;
  });
  res.status(201).json(result);
}));

app.post("/api/production", allowRoles("ADMIN", "PRODUCTION"), asyncRoute(async (req, res) => {
  const body = z.object({
    productId: idParam,
    actualOutput: positive,
    plannedOutput: positive.optional(),
    labourCost: z.number().finite().nonnegative().default(0),
    powerCost: z.number().finite().nonnegative().default(0),
    otherOverhead: z.number().finite().nonnegative().default(0),
    materials: z.array(z.object({
      itemId: idParam,
      actual: positive,
      wastage: z.number().finite().nonnegative().default(0),
      unit: z.string().trim().min(1).optional(),
    })).min(1),
  }).parse(req.body);
  const result = await prisma.$transaction(async (tx) => {
    const bom = await tx.bom.findFirst({
      where: { productId: body.productId, active: true },
      include: { items: { include: { item: true } }, product: true },
    });
    if (!bom) throw new AppError(400, "This finished product does not have an active bill of materials.");
    const plannedOutput = body.plannedOutput || Number(bom.batchSize);
    const batchRatio = plannedOutput / Number(bom.batchSize);
    const materials = bom.items.map((row) => {
      const input = body.materials.find((entry) => entry.itemId === row.itemId);
      if (!input) throw new AppError(400, `Enter actual consumption for ${row.item.name}.`);
      const actual = convertQuantity(input.actual, input.unit || row.item.unit, row.item.unit, row.item.unitsPerCarton);
      const wastage = convertQuantity(input.wastage || 0, input.unit || row.item.unit, row.item.unit, row.item.unitsPerCarton);
      if (wastage > actual) throw new AppError(400, `Wastage cannot exceed total issued quantity for ${row.item.name}.`);
      return {
        item: row.item,
        planned: Number(row.quantity) * batchRatio,
        actual,
        wastage,
        variancePct: percentageVariance(actual, Number(row.quantity) * batchRatio),
        tolerance: Number(row.tolerance),
      };
    });
    if (body.materials.some((entry) => !materials.some((row) => row.item.id === entry.itemId))) {
      throw new AppError(400, "Consumption contains an item that is not in this product's bill of materials.");
    }
    for (const row of materials) {
      const history = await tx.stockMovement.findMany({
        where: { itemId: row.item.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { quantity: true, unitCost: true },
      });
      if (getStockBalance(history) < row.actual) {
        throw new AppError(409, `Not enough ${row.item.name} in stock.`);
      }
      row.unitCost = weightedAverageUnitCost(history);
      row.totalCost = roundMoney(row.actual * row.unitCost);
    }
    const number = numberCode("PR");
    const materialCostPaise = materials.reduce((sum, row) => sum + Math.round(row.totalCost * 100), 0);
    const labourCostPaise = Math.round(body.labourCost * 100);
    const powerCostPaise = Math.round(body.powerCost * 100);
    const otherOverheadPaise = Math.round(body.otherOverhead * 100);
    const overheadPaise = labourCostPaise + powerCostPaise + otherOverheadPaise;
    const totalCostPaise = materialCostPaise + overheadPaise;
    const costPerUnit = Math.round((totalCostPaise / 100 / body.actualOutput) * 10000) / 10000;
    const totalWastage = materials.reduce((sum, row) => sum + row.wastage, 0);
    const run = await tx.productionRun.create({
      data: {
        number,
        productId: bom.productId,
        plannedOutput,
        actualOutput: body.actualOutput,
        yieldVariancePct: percentageVariance(body.actualOutput, plannedOutput),
        labourCost: labourCostPaise / 100,
        powerCost: powerCostPaise / 100,
        otherOverhead: otherOverheadPaise / 100,
        materialCost: materialCostPaise / 100,
        totalCost: totalCostPaise / 100,
        costPerUnit,
        wastage: totalWastage,
        materials: {
          create: materials.map(({ item, planned, actual, variancePct, tolerance, unitCost, totalCost, wastage }) => ({
            itemId: item.id, planned, actual, variancePct, tolerance, unitCost, totalCost, wastage,
          })),
        },
      },
    });
    for (const row of materials) {
      await tx.stockMovement.create({
        data: {
          itemId: row.item.id,
          type: "PRODUCTION_ISSUE",
          quantity: -row.actual,
          unitCost: row.unitCost,
          sourceType: "production",
          sourceId: run.id,
          reference: number,
          createdById: req.auth.id,
        },
      });
    }
    await tx.stockMovement.create({
      data: {
        itemId: bom.productId,
        type: "PRODUCTION_OUTPUT",
        quantity: body.actualOutput,
        unitCost: costPerUnit,
        sourceType: "production",
        sourceId: run.id,
        reference: number,
        createdById: req.auth.id,
      },
    });
    await writeAudit(tx, req, "PRODUCTION_RECORDED", "ProductionRun", run.id, { number, yieldVariancePct: Number(run.yieldVariancePct) });
    return tx.productionRun.findUnique({ where: { id: run.id }, include: { product: true, materials: { include: { item: true } } } });
  }, { isolationLevel: "Serializable" });
  res.status(201).json(result);
}));

app.get("/api/production", allowRoles("ADMIN", "PRODUCTION", "AUDITOR"), asyncRoute(async (_req, res) => {
  res.json(await prisma.productionRun.findMany({
    include: { product: true, materials: { include: { item: true } } },
    orderBy: { producedAt: "desc" },
  }));
}));

app.get("/api/orders", allowRoles("ADMIN", "SALESMAN"), asyncRoute(async (req, res) => {
  const where = req.auth.role === "SALESMAN" ? { createdById: req.auth.id } : undefined;
  const orders = await prisma.customerOrder.findMany({
    where,
    include: { customer: true, items: { include: { item: true } }, invoice: { include: { payments: true, dispatch: true } } },
    orderBy: { createdAt: "desc" },
  });
  const productBalances = await prisma.stockMovement.groupBy({
    by: ["itemId"],
    _sum: { quantity: true },
  });
  const balances = Object.fromEntries(productBalances.map((row) => [row.itemId, Number(row._sum.quantity || 0)]));
  res.json(orders.map((order) => ({
    ...order,
    available: order.items.map((line) => ({ itemId: line.itemId, quantity: balances[line.itemId] || 0 })),
  })));
}));

app.get("/api/sales-summary", allowRoles("SALESMAN", "ADMIN"), asyncRoute(async (req, res) => {
  const orders = await prisma.customerOrder.findMany({
    where: req.auth.role === "SALESMAN" ? { createdById: req.auth.id } : undefined,
    include: { customer: true, invoice: true, items: true },
    orderBy: { createdAt: "desc" },
  });
  const customers = new Map();
  for (const order of orders) {
    const row = customers.get(order.customerId) || {
      customer: order.customer.name,
      orders: 0,
      sales: 0,
    };
    row.orders += 1;
    row.sales += order.invoice && order.invoice.status === "POSTED" ? Number(order.invoice.total) : 0;
    customers.set(order.customerId, row);
  }
  res.json({
    orderCount: orders.length,
    customerSales: [...customers.values()].sort((a, b) => b.sales - a.sales),
  });
}));

app.post("/api/orders", allowRoles("ADMIN", "SALESMAN"), asyncRoute(async (req, res) => {
  const itemInput = z.object({
    itemId: idParam,
    quantity: positive,
    unitPrice: z.number().finite().nonnegative().optional(),
  });
  const body = z.object({
    customerId: idParam,
    items: z.array(itemInput).min(1).optional(),
    itemId: idParam.optional(),
    quantity: positive.optional(),
  }).refine((value) => value.items?.length || (value.itemId && value.quantity), {
    message: "Add at least one product and quantity.",
  }).parse(req.body);
  const requestedLines = body.items || [{ itemId: body.itemId, quantity: body.quantity }];
  const itemIds = requestedLines.map((line) => line.itemId);
  if (new Set(itemIds).size !== itemIds.length) throw new AppError(400, "Add each product only once per order.");
  const order = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: {
        id: body.customerId,
        ...(req.auth.role === "SALESMAN" ? { salespersonId: req.auth.id } : {}),
      },
    });
    const products = await tx.inventoryItem.findMany({ where: { id: { in: itemIds } } });
    if (!customer || products.length !== itemIds.length || products.some((item) => item.type !== "FINISHED_GOOD")) {
      throw new AppError(400, "Choose a valid customer and finished products.");
    }
    const productMap = new Map(products.map((item) => [item.id, item]));
    const created = await tx.customerOrder.create({
      data: {
        number: numberCode("SO"),
        customerId: customer.id,
        createdById: req.auth.id,
        items: {
          create: requestedLines.map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity,
            unitPrice: req.auth.role === "ADMIN" && line.unitPrice !== undefined
              ? line.unitPrice
              : productMap.get(line.itemId).sellingPrice,
          })),
        },
      },
      include: { customer: true, items: { include: { item: true } } },
    });
    await writeAudit(tx, req, "ORDER_SUBMITTED", "CustomerOrder", created.id, { number: created.number });
    return created;
  });
  res.status(201).json(order);
}));

app.patch("/api/orders/:id", allowRoles("ADMIN"), asyncRoute(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const body = z.object({
    items: z.array(z.object({
      itemId: idParam,
      quantity: positive,
      unitPrice: z.number().finite().nonnegative(),
    })).min(1),
  }).parse(req.body);
  if (new Set(body.items.map((row) => row.itemId)).size !== body.items.length) {
    throw new AppError(400, "Add each product only once per order.");
  }
  const order = await prisma.$transaction(async (tx) => {
    const current = await tx.customerOrder.findUnique({ where: { id } });
    if (!current || current.status !== "PENDING") throw new AppError(409, "Only pending orders can be edited.");
    const products = await tx.inventoryItem.findMany({ where: { id: { in: body.items.map((row) => row.itemId) } } });
    if (products.length !== body.items.length || products.some((item) => item.type !== "FINISHED_GOOD")) {
      throw new AppError(400, "Choose valid finished products.");
    }
    await tx.orderItem.deleteMany({ where: { orderId: id } });
    await tx.orderItem.createMany({ data: body.items.map((row) => ({ ...row, orderId: id })) });
    const updated = await tx.customerOrder.findUnique({
      where: { id },
      include: { customer: true, items: { include: { item: true } } },
    });
    await writeAudit(tx, req, "ORDER_EDITED", "CustomerOrder", id, {
      itemCount: body.items.length,
      reason: "Admin updated pending order details",
    });
    return updated;
  });
  res.json(order);
}));

app.post("/api/orders/:id/approve", allowRoles("ADMIN"), asyncRoute(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const updated = await prisma.$transaction(async (tx) => {
    const order = await tx.customerOrder.findUnique({ where: { id }, include: { items: true } });
    if (!order || order.status !== "PENDING") throw new AppError(409, "Only pending orders can be approved.");
    for (const line of order.items) {
      const balance = await tx.stockMovement.aggregate({ where: { itemId: line.itemId }, _sum: { quantity: true } });
      const available = Number(balance._sum.quantity || 0);
      if (available < Number(line.quantity)) {
        throw new AppError(409, `${line.itemId}: insufficient stock. ${available} available, ${Number(line.quantity) - available} short.`);
      }
    }
    const row = await tx.customerOrder.update({ where: { id, status: "PENDING" }, data: { status: "APPROVED" } });
    await writeAudit(tx, req, "ORDER_APPROVED", "CustomerOrder", row.id, { number: row.number });
    return row;
  }, { isolationLevel: "Serializable" });
  res.json(updated);
}));

app.post("/api/orders/:id/reject", allowRoles("ADMIN"), asyncRoute(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const order = await prisma.customerOrder.findUnique({ where: { id } });
  if (!order || order.status !== "PENDING") throw new AppError(409, "Only pending orders can be rejected.");
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.customerOrder.update({ where: { id, status: "PENDING" }, data: { status: "REJECTED" } });
    await writeAudit(tx, req, "ORDER_REJECTED", "CustomerOrder", row.id, null);
    return row;
  }, { isolationLevel: "Serializable" });
  res.json(updated);
}));

app.post("/api/invoices", allowRoles("ADMIN"), asyncRoute(async (req, res) => {
  const body = z.object({ orderId: idParam }).parse(req.body);
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.customerOrder.findUnique({
      where: { id: body.orderId },
      include: { customer: true, items: { include: { item: true } } },
    });
    if (!order || order.status !== "APPROVED") throw new AppError(409, "Only approved orders can be invoiced.");
    const lines = order.items.map((line) => ({
      itemId: line.itemId,
      description: line.item.name,
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      taxRate: Number(line.item.gstRate),
    }));
    const totals = calculateTax(lines, order.customer.state.trim().toLowerCase() === companyState.trim().toLowerCase());
    const invoice = await tx.invoice.create({
      data: {
        number: await invoiceNumber(tx),
        orderId: order.id,
        customerId: order.customerId,
        ...totals,
        items: {
          create: lines.map((line) => ({
            ...line,
            taxable: roundMoney(line.quantity * line.unitPrice),
          })),
        },
      },
      include: { customer: true, items: { include: { item: true } } },
    });
    await tx.customerOrder.update({ where: { id: order.id }, data: { status: "INVOICED" } });
    await writeAudit(tx, req, "INVOICE_CREATED", "Invoice", invoice.id, { number: invoice.number, total: Number(invoice.total) });
    return invoice;
  }, { isolationLevel: "Serializable" });
  res.status(201).json(result);
}));

app.post("/api/dispatches", allowRoles("ADMIN"), asyncRoute(async (req, res) => {
  const body = z.object({ invoiceId: idParam }).parse(req.body);
  const result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: body.invoiceId },
      include: { items: true, order: true, dispatch: true },
    });
    if (!invoice || invoice.dispatch || invoice.order.status !== "INVOICED") throw new AppError(409, "This invoice cannot be dispatched.");
    const totalQuantity = invoice.items.reduce((sum, line) => sum + Number(line.quantity), 0);
    for (const line of invoice.items) {
      const balance = await tx.stockMovement.aggregate({ where: { itemId: line.itemId }, _sum: { quantity: true } });
      if (Number(balance._sum.quantity || 0) < Number(line.quantity)) throw new AppError(409, "Not enough finished stock to dispatch this invoice.");
      await tx.stockMovement.create({
        data: {
          itemId: line.itemId,
          type: "SALE_DISPATCH",
          quantity: -Number(line.quantity),
          sourceType: "dispatch",
          sourceId: invoice.id,
          reference: invoice.number,
          createdById: req.auth.id,
        },
      });
    }
    const dispatch = await tx.dispatch.create({
      data: { number: numberCode("DSP"), invoiceId: invoice.id, quantity: totalQuantity },
    });
    await tx.customerOrder.update({ where: { id: invoice.orderId }, data: { status: "DISPATCHED" } });
    await writeAudit(tx, req, "ORDER_DISPATCHED", "Dispatch", dispatch.id, { invoice: invoice.number });
    return dispatch;
  }, { isolationLevel: "Serializable" });
  res.status(201).json(result);
}));

app.post("/api/payments", allowRoles("ADMIN"), asyncRoute(async (req, res) => {
  const body = z.object({
    invoiceId: idParam,
    amount: positive,
    method: z.enum(["CASH", "BANK_TRANSFER", "UPI", "CHEQUE"]),
    reference: z.string().trim().max(100).optional(),
  }).parse(req.body);
  const result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: body.invoiceId }, include: { payments: true } });
    if (!invoice || invoice.status !== "POSTED") throw new AppError(404, "Posted invoice not found.");
    const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    if (body.amount > Number(invoice.total) - paid) throw new AppError(400, "Payment exceeds the invoice's outstanding balance.");
    const payment = await tx.payment.create({ data: body });
    await writeAudit(tx, req, "PAYMENT_RECORDED", "Payment", payment.id, { invoice: invoice.number, amount: body.amount });
    return payment;
  }, { isolationLevel: "Serializable" });
  res.status(201).json(result);
}));

app.get("/api/invoices", allowRoles("ADMIN", "SALESMAN"), asyncRoute(async (req, res) => {
  res.json(await prisma.invoice.findMany({
    where: req.auth.role === "SALESMAN" ? { order: { is: { createdById: req.auth.id } } } : undefined,
    include: { customer: true, items: { include: { item: true } }, payments: true, dispatch: true },
    orderBy: { createdAt: "desc" },
  }));
}));

app.get("/api/invoices/:id", allowRoles("ADMIN", "SALESMAN"), asyncRoute(async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: idParam.parse(req.params.id) },
    include: { customer: true, order: true, items: { include: { item: true } }, payments: true, dispatch: true, creditNote: true },
  });
  if (!invoice || (req.auth.role === "SALESMAN" && invoice.order.createdById !== req.auth.id)) {
    throw new AppError(404, "Invoice not found.");
  }
  res.json(invoice);
}));

app.get("/api/invoices/:id/pdf", allowRoles("ADMIN", "SALESMAN"), asyncRoute(async (req, res, next) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: idParam.parse(req.params.id) },
    include: { customer: true, order: true, items: { include: { item: true } }, payments: true, creditNote: true },
  });
  if (!invoice || (req.auth.role === "SALESMAN" && invoice.order.createdById !== req.auth.id)) {
    throw new AppError(404, "Invoice not found.");
  }
  const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
  doc.on("error", (error) => {
    if (!res.headersSent) next(error);
    else res.destroy(error);
  });
  res.type("application/pdf").attachment(`${invoice.number.replaceAll("/", "-")}.pdf`);
  doc.pipe(res);
  doc.fillColor("#294d37").fontSize(23).font("Helvetica-Bold").text(companyName);
  doc.fillColor("#606960").fontSize(9).font("Helvetica").text(`GSTIN: ${companyGstin || "Not configured"}   ·   ${companyState}`);
  doc.moveDown(1.6);
  doc.fillColor("#222822").fontSize(17).font("Helvetica-Bold").text(invoice.status === "CREDITED" ? "CREDIT NOTE" : "TAX INVOICE");
  doc.moveDown(0.5);
  doc.fontSize(9).font("Helvetica");
  doc.text(`Invoice no: ${invoice.number}`);
  doc.text(`Date: ${invoice.createdAt.toLocaleDateString("en-IN")}`);
  doc.text(`Place of supply: ${invoice.customer.state}`);
  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").text("Bill to");
  doc.font("Helvetica").text(invoice.customer.name);
  doc.text(`State: ${invoice.customer.state}`);
  doc.text(`GSTIN: ${invoice.customer.gstin || "Unregistered"}`);
  doc.moveDown(1);
  const top = doc.y;
  doc.fillColor("#edf3ea").rect(48, top, 500, 25).fill();
  doc.fillColor("#354a37").font("Helvetica-Bold").fontSize(8);
  doc.text("DESCRIPTION", 56, top + 8, { width: 185 });
  doc.text("HSN", 245, top + 8, { width: 45 });
  doc.text("QTY", 295, top + 8, { width: 45, align: "right" });
  doc.text("RATE", 345, top + 8, { width: 70, align: "right" });
  doc.text("TAXABLE", 420, top + 8, { width: 115, align: "right" });
  let y = top + 34;
  doc.font("Helvetica").fontSize(9).fillColor("#313831");
  for (const line of invoice.items) {
    doc.text(line.description, 56, y, { width: 185 });
    doc.text(line.item.hsn || "—", 245, y, { width: 45 });
    doc.text(String(line.quantity), 295, y, { width: 45, align: "right" });
    doc.text(`Rs. ${Number(line.unitPrice).toFixed(2)}`, 345, y, { width: 70, align: "right" });
    doc.text(`Rs. ${Number(line.taxable).toFixed(2)}`, 420, y, { width: 115, align: "right" });
    y += 22;
  }
  y += 9;
  doc.moveTo(350, y).lineTo(548, y).strokeColor("#e2e8df").stroke();
  y += 12;
  doc.fontSize(9).text("Taxable value", 355, y).text(`Rs. ${Number(invoice.taxable).toFixed(2)}`, 440, y, { width: 100, align: "right" });
  y += 17;
  if (Number(invoice.cgst) || Number(invoice.sgst)) {
    doc.text("CGST", 355, y).text(`Rs. ${Number(invoice.cgst).toFixed(2)}`, 440, y, { width: 100, align: "right" });
    y += 16;
    doc.text("SGST", 355, y).text(`Rs. ${Number(invoice.sgst).toFixed(2)}`, 440, y, { width: 100, align: "right" });
    y += 16;
  } else {
    doc.text("IGST", 355, y).text(`Rs. ${Number(invoice.igst).toFixed(2)}`, 440, y, { width: 100, align: "right" });
    y += 16;
  }
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#294d37")
    .text(invoice.status === "CREDITED" ? "Credit total" : "Invoice total", 355, y)
    .text(`Rs. ${Number(invoice.total).toFixed(2)}`, 430, y, { width: 110, align: "right" });
  y += 21;
  const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  doc.font("Helvetica").fontSize(9).fillColor("#606960")
    .text(`Paid: Rs. ${paid.toFixed(2)}     Balance: Rs. ${(Number(invoice.total) - paid).toFixed(2)}`, 355, y, { width: 190, align: "right" });
  doc.moveDown(3);
  doc.fontSize(8).fillColor("#838b81").text("This is a computer-generated document. Verify GST and statutory details before use.", 48, 748, { align: "center", width: 500 });
  doc.end();
}));

app.post("/api/invoices/:id/credit-note", allowRoles("ADMIN"), asyncRoute(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { reason } = z.object({ reason: z.string().trim().min(5).max(500) }).parse(req.body);
  const note = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id },
      include: { payments: true, creditNote: true },
    });
    if (!invoice || invoice.status !== "POSTED" || invoice.creditNote) throw new AppError(409, "Only an active invoice can be credited.");
    if (invoice.payments.length) throw new AppError(409, "Refund or reconcile recorded payments before crediting this invoice.");
    const creditNote = await tx.creditNote.create({
      data: {
        number: numberCode("CN"),
        invoiceId: invoice.id,
        reason,
        taxable: invoice.taxable,
        cgst: invoice.cgst,
        sgst: invoice.sgst,
        igst: invoice.igst,
        amount: invoice.total,
      },
    });
    await tx.invoice.update({ where: { id }, data: { status: "CREDITED" } });
    await tx.customerOrder.update({ where: { id: invoice.orderId }, data: { status: "CREDITED" } });
    await writeAudit(tx, req, "INVOICE_CREDITED", "CreditNote", creditNote.id, { number: creditNote.number, invoice: invoice.number, reason });
    return creditNote;
  });
  res.status(201).json(note);
}));

function reportDateRange(query) {
  const parse = (value, endOfDay) => {
    if (!value) return undefined;
    const text = String(value);
    const dateValue = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text)
      ? `${text}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`
      : text);
    if (Number.isNaN(dateValue.valueOf())) throw new AppError(400, "Invalid report date filter.");
    return dateValue;
  };
  const from = parse(query.from, false);
  const to = parse(query.to, true);
  if (from && to && from > to) throw new AppError(400, "Start date must be on or before end date.");
  return {
    from,
    to,
    filter: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
  };
}

app.get("/api/reports", allowRoles("ADMIN", "AUDITOR"), asyncRoute(async (req, res) => {
  const range = reportDateRange(req.query);
  const dateFilter = Object.keys(range.filter).length ? range.filter : undefined;
  const dateWhere = (field) => dateFilter ? { [field]: dateFilter } : {};
  const [invoices, stockItems, production, purchases, payments, movements, audit] = await Promise.all([
    prisma.invoice.findMany({
      where: dateWhere("createdAt"),
      include: { customer: true, items: { include: { item: true } }, payments: true, creditNote: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.inventoryItem.findMany({
      include: { movements: { where: range.to ? { createdAt: { lte: range.to } } : undefined, select: { quantity: true, type: true, createdAt: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.productionRun.findMany({
      where: dateWhere("producedAt"),
      include: { product: true, materials: { include: { item: true } } },
      orderBy: { producedAt: "desc" },
    }),
    prisma.purchase.findMany({
      where: dateWhere("receivedAt"),
      include: { supplier: true, items: { include: { item: true } } },
      orderBy: { receivedAt: "desc" },
    }),
    prisma.payment.findMany({
      where: dateWhere("paidAt"),
      include: { invoice: { include: { customer: true } } },
      orderBy: { paidAt: "desc" },
    }),
    prisma.stockMovement.findMany({
      where: dateWhere("createdAt"),
      include: { item: true, createdBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.auditLog.findMany({
      where: dateWhere("createdAt"),
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 250,
    }),
  ]);
  const sales = invoices.map((invoice) => {
    const sign = invoice.status === "CREDITED" ? -1 : 1;
    return {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      customer: invoice.customer.name,
      date: invoice.createdAt,
      taxable: sign * Number(invoice.taxable),
      cgst: sign * Number(invoice.cgst),
      sgst: sign * Number(invoice.sgst),
      igst: sign * Number(invoice.igst),
      total: sign * Number(invoice.total),
    };
  });
  const stock = stockItems.map((item) => {
    const opening = item.movements.filter((movement) => movement.type === "OPENING" || (range.from && movement.createdAt < range.from))
      .reduce((sum, movement) => sum + Number(movement.quantity), 0);
    const inRange = item.movements.filter((movement) => (
      (!range.from || movement.createdAt >= range.from) &&
      (!range.to || movement.createdAt <= range.to) &&
      movement.type !== "OPENING"
    ));
    const receipts = inRange.filter((movement) => Number(movement.quantity) > 0).reduce((sum, movement) => sum + Number(movement.quantity), 0);
    const issues = inRange.filter((movement) => Number(movement.quantity) < 0).reduce((sum, movement) => sum + Number(movement.quantity), 0);
    return {
      code: item.code,
      item: item.name,
      unit: item.unit,
      opening,
      receipts,
      issues: Math.abs(issues),
      closing: getStockBalance(item.movements),
    };
  });
  const outstanding = invoices
    .filter((invoice) => invoice.status === "POSTED")
    .map((invoice) => {
      const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      const balance = roundMoney(Number(invoice.total) - paid);
      const age = Math.max(0, Math.floor((Date.now() - invoice.createdAt.valueOf()) / 86400000));
      return {
        invoice: invoice.number,
        customer: invoice.customer.name,
        date: invoice.createdAt,
        total: Number(invoice.total),
        paid,
        outstanding: balance,
        ageDays: age,
        ageBucket: age <= 30 ? "0–30" : age <= 60 ? "31–60" : age <= 90 ? "61–90" : "90+",
      };
    }).filter((row) => row.outstanding > 0);
  const gst = {
    taxable: roundMoney(sales.reduce((sum, row) => sum + row.taxable, 0)),
    cgst: roundMoney(sales.reduce((sum, row) => sum + row.cgst, 0)),
    sgst: roundMoney(sales.reduce((sum, row) => sum + row.sgst, 0)),
    igst: roundMoney(sales.reduce((sum, row) => sum + row.igst, 0)),
  };
  gst.totalTax = roundMoney(gst.cgst + gst.sgst + gst.igst);
  const purchaseRows = purchases.map((purchase) => ({
    id: purchase.id,
    number: purchase.number,
    supplier: purchase.supplier.name,
    date: purchase.receivedAt,
    total: Number(purchase.total),
    items: purchase.items,
  }));
  const collectionRows = payments.map((payment) => ({
    id: payment.id,
    invoice: payment.invoice.number,
    customer: payment.invoice.customer.name,
    date: payment.paidAt,
    method: payment.method,
    amount: Number(payment.amount),
    reference: payment.reference,
  }));
  res.json({
    from: range.from,
    to: range.to,
    sales,
    gst,
    stock,
    production,
    purchases: purchaseRows,
    collections: collectionRows,
    outstanding,
    movements,
    audit,
  });
}));

app.get("/api/reports/:report.csv", allowRoles("ADMIN", "AUDITOR"), asyncRoute(async (req, res) => {
  const report = req.params.report;
  const range = reportDateRange(req.query);
  const dateWhere = (field) => Object.keys(range.filter).length ? { [field]: range.filter } : {};
  const reports = await prisma.$transaction(async (tx) => {
    if (report === "sales") {
      const invoices = await tx.invoice.findMany({ where: dateWhere("createdAt"), include: { customer: true }, orderBy: { createdAt: "desc" } });
      return [
        ["Invoice", "Status", "Customer", "Date", "Taxable", "CGST", "SGST", "IGST", "Total"],
        ...invoices.map((row) => {
          const sign = row.status === "CREDITED" ? -1 : 1;
          return [row.number, row.status, row.customer.name, row.createdAt.toISOString(), sign * Number(row.taxable), sign * Number(row.cgst), sign * Number(row.sgst), sign * Number(row.igst), sign * Number(row.total)];
        }),
      ];
    }
    if (report === "stock") {
      const items = await tx.inventoryItem.findMany({
        include: { movements: { where: range.to ? { createdAt: { lte: range.to } } : undefined, select: { quantity: true, type: true, createdAt: true } } },
        orderBy: { name: "asc" },
      });
      return [
        ["Item", "Code", "Opening", "Receipts", "Issues", "Closing"],
        ...items.map((item) => {
          const opening = item.movements.filter((row) => row.type === "OPENING" || (range.from && row.createdAt < range.from))
            .reduce((sum, row) => sum + Number(row.quantity), 0);
          const inRange = item.movements.filter((row) => (!range.from || row.createdAt >= range.from) && (!range.to || row.createdAt <= range.to) && row.type !== "OPENING");
          const receipts = inRange.filter((row) => Number(row.quantity) > 0).reduce((sum, row) => sum + Number(row.quantity), 0);
          const issues = inRange.filter((row) => Number(row.quantity) < 0).reduce((sum, row) => sum + Number(row.quantity), 0);
          return [item.name, item.code, opening, receipts, Math.abs(issues), getStockBalance(item.movements)];
        }),
      ];
    }
    if (report === "purchases") {
      const purchases = await tx.purchase.findMany({ where: dateWhere("receivedAt"), include: { supplier: true, items: { include: { item: true } } }, orderBy: { receivedAt: "desc" } });
      return [
        ["Purchase", "Supplier", "Date", "Item", "Quantity", "Unit cost", "Total"],
        ...purchases.flatMap((purchase) => purchase.items.map((line) => [
          purchase.number, purchase.supplier.name, purchase.receivedAt.toISOString(), line.item.name,
          line.quantity, line.unitCost, Number(line.quantity) * Number(line.unitCost),
        ])),
      ];
    }
    if (report === "gst") {
      const invoices = await tx.invoice.findMany({ where: dateWhere("createdAt"), include: { customer: true }, orderBy: { createdAt: "desc" } });
      return [
        ["Invoice", "Customer", "Date", "Status", "Taxable", "CGST", "SGST", "IGST", "Total tax"],
        ...invoices.map((invoice) => {
          const sign = invoice.status === "CREDITED" ? -1 : 1;
          return [invoice.number, invoice.customer.name, invoice.createdAt.toISOString(), invoice.status,
            sign * Number(invoice.taxable), sign * Number(invoice.cgst), sign * Number(invoice.sgst), sign * Number(invoice.igst),
            sign * (Number(invoice.cgst) + Number(invoice.sgst) + Number(invoice.igst))];
        }),
      ];
    }
    if (report === "outstanding") {
      const invoices = await tx.invoice.findMany({ where: { status: "POSTED", ...dateWhere("createdAt") }, include: { customer: true, payments: true } });
      return [
        ["Invoice", "Customer", "Date", "Total", "Paid", "Outstanding", "Age days"],
        ...invoices.map((invoice) => {
          const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
          return [invoice.number, invoice.customer.name, invoice.createdAt.toISOString(), invoice.total, paid, roundMoney(Number(invoice.total) - paid), Math.floor((Date.now() - invoice.createdAt.valueOf()) / 86400000)];
        }),
      ];
    }
    if (report === "collections") {
      const payments = await tx.payment.findMany({ where: dateWhere("paidAt"), include: { invoice: { include: { customer: true } } }, orderBy: { paidAt: "desc" } });
      return [
        ["Payment date", "Invoice", "Customer", "Method", "Amount", "Reference"],
        ...payments.map((payment) => [payment.paidAt.toISOString(), payment.invoice.number, payment.invoice.customer.name, payment.method, payment.amount, payment.reference]),
      ];
    }
    throw new AppError(404, "This report does not have a CSV export.");
  });
  const csv = reports.map((row) => row.map((value) => {
    const text = String(value ?? "");
    const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n");
  res.type("text/csv").attachment(`${report}-report.csv`).send(csv);
}));

app.use((err, _req, res, _next) => {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: err.issues.map((issue) => issue.message).join(" ") });
  }
  if (err instanceof AppError) return res.status(err.status).json({ error: err.message });
  if (err?.code === "P2002") return res.status(409).json({ error: "This record already exists." });
  if (err?.code === "P2003") return res.status(400).json({ error: "A referenced record does not exist." });
  if (err?.code === "P2025") return res.status(404).json({ error: "The requested record was not found." });
  if (err?.code === "P2034") return res.status(409).json({ error: "Another update changed stock or order state. Refresh and retry." });
  console.error("API request failed:", err);
  return res.status(500).json({ error: "An unexpected server error occurred." });
});

const server = app.listen(port, () => console.log(`ERP API listening on http://localhost:${port}`));

async function shutdown() {
  server.close();
  await prisma.$disconnect();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
