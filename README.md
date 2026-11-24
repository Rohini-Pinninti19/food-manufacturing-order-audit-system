# Grainline · Food Manufacturing ERP

Grainline is a database-backed operations workspace for a small food manufacturer. It connects supplier receipts, BOM-driven production, customer orders, approval, GST invoicing, dispatch, payments, stock reports, and an audit trail.

## What works

- JWT sign-in for administrator, salesperson, production, and read-only auditor roles. There is no public registration; only administrators can create accounts.
- Customer assignment and server-side salesperson scoping for customer and order access.
- PostgreSQL persistence through Prisma 7.
- Signed stock ledger; every balance is calculated from movements rather than stored as an editable quantity.
- Purchase receipts with unit conversion, active BOMs, atomic production runs, actual-versus-planned material usage, wastage, and yield variance.
- Weighted-average material costing, recorded run overheads, and cost per finished unit.
- Multi-line customer orders, admin approval/rejection and editing, stock availability checks, annual GST invoice numbering, invoice PDFs, credit notes, dispatch, and payments.
- Date-filtered sales, GST, stock, production, purchase, collections, outstanding, movement, and audit reports; supported reports can be exported to CSV.
- Admin-managed item, customer, supplier, BOM, and team account screens, plus responsive layouts.

## Stack

- **Frontend:** React 19, Vite, accessible HTML controls, responsive CSS.
- **Backend:** Node.js, Express 5, Zod request validation, JWT, bcrypt, Helmet.
- **Data:** PostgreSQL and Prisma 7 using the PostgreSQL driver adapter.

The frontend is intentionally kept light and the API owns business rules. Production inventory and finished stock are committed together in one database transaction.

## Requirements

- Node.js 20.19+ or 22.12+
- PostgreSQL 14+

## Local setup

1. Install the root development dependency:

   ```sh
   npm install
   ```

2. Install backend dependencies and configure its environment:

   ```sh
   npm install --prefix backend
   if (-not (Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }
   ```

   Do not overwrite an existing `backend/.env`; preserve its `DATABASE_URL` and add any missing variables from `backend/.env.example`. Set `JWT_SECRET` to a private random value of at least 32 characters. Keep `.env` files out of version control.

3. Generate the Prisma client, apply the checked-in migration, and seed benchmark data:

   ```sh
   npm run db:generate --prefix backend
   npm run db:deploy --prefix backend
   npm run seed:benchmark --prefix backend
   ```

4. Install frontend dependencies:

   ```sh
   npm install --prefix frontend
   ```

5. Start the API and frontend together:

   ```sh
   npm run dev
   ```

   The frontend is at `http://localhost:5173`; the API is at `http://localhost:4000/api/health`.

## Benchmark accounts

The seed creates:

| Role | Email | Default development password |
|---|---|---|
| Administrator | `admin@fooderp.local` | `DemoAdmin!2026` |
| Salesperson | `sales@fooderp.local` | `DemoSales!2026` |
| Production | `production@fooderp.local` | `DemoProduction!2026` |
| Auditor (read-only) | `auditor@fooderp.local` | `DemoAuditor!2026` |

These are development-only credentials; do not use them in a deployed environment. Before seeding a shared environment, set `SEED_ADMIN_PASSWORD`, `SEED_SALESPERSON_PASSWORD`, `SEED_PRODUCTION_PASSWORD`, and `SEED_AUDITOR_PASSWORD`. After setup, an administrator creates additional accounts under **Masters & BOM → Team**. The API enforces the same restriction; public self-registration is not provided.

## Seeded scenario and expected results

`npm run seed:benchmark --prefix backend` idempotently sets up a 200-packet Murukku BOM, two customers assigned to the demo salesperson, one supplier, demo users for each role, and opening stock:

| Item | Opening |
|---|---:|
| Rice flour | 100 kg at ₹42/kg |
| Groundnut oil | 30 L at ₹140/L |
| Spice blend | 5 kg at ₹200/kg |
| Printed pouches | 500 pcs at ₹2.50/pc |
| Cartons | 30 pcs at ₹15/pc |
| Murukku 200g | 50 packets |

Use the application to receive 60 kg flour at ₹45/kg, record production of 188 packets (40 kg flour, 10.5 L oil, 1.2 kg spice, 194 pouches, 9 cartons), then create, approve, invoice, dispatch, and pay the Retailer A order. Expected checkpoints:

- Flour after receipt and production: **120 kg**.
- Finished stock after production: **238 packets**.
- Production yield variance: **−6%**; oil usage variance: **+5%**.
- Weighted-average material cost: **₹4,055**; with ₹1,800 labour/power overhead, production cost is **₹5,855** or approximately **₹31.14 per good packet**.
- Retailer A invoice: **₹7,875** (₹7,500 taxable + ₹187.50 CGST + ₹187.50 SGST).
- Stock after dispatch of 150 packets: **88 packets**.
- After ₹4,000 payment, outstanding: **₹3,875**.
- A 120-packet Distributor B request then reports a **32-packet shortage**.

For production, the modal starts with recipe quantities; set oil to 10.5 L, pouches to 194, cartons to 9, and record 188 good packets. Enter ₹1,200 labour and ₹600 gas/power to reproduce the costing checkpoint. Stock issue/output changes are transactional and fail as a whole if there is not enough material.

## Useful commands

```sh
npm test
npm run build
npm run db:generate --prefix backend
npm run db:deploy --prefix backend
npm run seed:benchmark --prefix backend
```

`db:migrate` is for local schema development; `db:deploy` applies checked-in migrations to a configured database.

## Deploy to Render

The root [`render.yaml`](render.yaml) defines a free web service that builds the frontend, serves it and the API from the same origin, and applies checked-in Prisma migrations before the server starts. Free Render services can sleep when idle and are intended for demos, not production.

1. Push this repository to GitHub and connect it to Render using **New → Blueprint**.
2. Set `DATABASE_URL` to your PostgreSQL connection string in Render when prompted. Keep it private; do not add it to this repository. Ensure the database accepts connections from Render and supports TLS if required by its provider.
3. Keep the generated `JWT_SECRET` private. Review `COMPANY_NAME`, `COMPANY_STATE`, and `COMPANY_GSTIN` before using invoices.
4. Wait for the first deployment to finish. Render runs `prisma migrate deploy` before starting the API, and `/api/health` is used for its health check.
5. The database is not seeded automatically. For a demo, set unique strong values for all four `SEED_*_PASSWORD` variables in Render, then run `npm run db:seed --prefix backend` once from the service Shell. This adds benchmark data and accounts; do not use the development defaults or seed a live production database. After seeding, securely retain the administrator credential and remove the temporary seed-password variables.

The service is deployed as one origin, so the frontend uses relative `/api` requests. Render supplies `PORT`; it should not be set manually.

## Environment variables

See [`backend/.env.example`](backend/.env.example). `CLIENT_ORIGIN` should be the exact deployed frontend origin. `COMPANY_STATE` controls whether invoices split GST into CGST/SGST or use IGST. Never commit real connection strings, signing secrets, or credentials.

## Scope and limitations

- Email invitations, password reset/change flows, and account deactivation are not included; an administrator provisions accounts and shares initial credentials securely.
- GST, HSN, invoice numbering, and statutory formatting must be reviewed by a qualified accountant before production use.
- No migration against an external database has been run from this workspace. Review the schema and invoice assumptions before applying migrations to any database with existing data.
- This is an operations-focused ERP starter, not a substitute for accounting, statutory filing, or an independent security review.
