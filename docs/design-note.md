# Grainline design note

## Architecture

The React/Vite client is a responsive operations workspace. It calls a same-origin `/api` path in development and a configurable API origin in deployment. Express validates request bodies, authenticates users using short-lived JWTs, enforces role checks on protected reads and writes, and delegates persistence to Prisma/PostgreSQL. There is no public registration endpoint; administrators provision users. Customers can be assigned to salespeople, and the API scopes salesperson customer/order/invoice access to the signed-in user.

## Inventory model and traceability

`InventoryItem` identifies raw materials, packaging, and finished goods. `StockMovement` is the canonical source of stock truth. Positive quantities represent receipts/outputs and negative quantities represent issues/dispatches. Item balance is the sum of its signed movements. Every movement records a movement type, source document type/ID, reference, timestamp, and (where applicable) user. A compound uniqueness constraint prevents duplicate postings for the same source, item, and movement type.

Purchases create a purchase document and a positive `PURCHASE_RECEIPT` movement. Quantities can be entered in supported alternate units and are normalized to the stock unit. Production creates a run, consumption records, negative `PRODUCTION_ISSUE` movements, and positive `PRODUCTION_OUTPUT` movement in one database transaction. Dispatch creates a dispatch record and negative `SALE_DISPATCH` movements; invoice creation alone does not reduce inventory.

## BOM and production variance

A BOM specifies component quantities for a planned batch size. A production run records actual output and actual consumption for every BOM component. Yield percentage is `(actual output - planned output) / planned output × 100`; material percentage is `(actual usage - planned usage) / planned usage × 100`. Material tolerances are stored on BOM items (seeded to 3%). The browser flags absolute material variance above that tolerance and yield variance above 3%.

Before posting production, the API checks available balances. It records all issue/output movements and the run together in a transaction, preventing a partial ledger update. The benchmark production produces 188 from 200 planned units (−6% yield) and uses 10.5 L oil against 10 L planned (+5%).

## Costing

The project uses perpetual weighted-average costing for stock. Opening and purchase receipts retain unit cost; production issues are valued at the weighted-average cost immediately before issue. The production run stores material cost, labour, power, other overhead, total cost, and cost per good output unit. For the seeded benchmark, material cost is ₹4,055; adding ₹1,200 labour and ₹600 power gives a ₹5,855 run cost, approximately ₹31.14 per good packet. This is an operational estimate, not a substitute for a full accounting valuation policy.

## Orders, tax, and audit

An order moves through pending, approved, rejected, invoiced, dispatched, and (where applicable) credited states. Admin approval checks stock; dispatch independently checks it again and makes the stock deduction. Orders support multiple products. Invoice values are based on the stored product price and GST rate, with invoice numbers sequenced by Indian financial year. If the customer's state matches `COMPANY_STATE`, tax is split into CGST/SGST; otherwise it is IGST. Tax is rounded per invoice line to paise. Payments are limited to the remaining invoice amount. PDF invoices include the configured company identity; review statutory fields before use.

Business writes create `AuditLog` rows in the same transaction wherever stock, account, or order state transitions occur. Date-filterable reports cover sales/GST, stock, production, purchases, collections, outstanding invoices, stock movements, and audit events, with CSV export for supported registers.

## Assumptions and limitations

Seeded benchmark assumptions are: company state Tamil Nadu, one Murukku 200g finished good at ₹50/unit, GST rate 5%, a 200-packet BOM batch, and opening stock costs documented in the root README. The project does not include email invitations, password resets, account deactivation, offline sync, deployment configuration, or statutory accountant review. No external database migration or production deployment has been run from this workspace.
