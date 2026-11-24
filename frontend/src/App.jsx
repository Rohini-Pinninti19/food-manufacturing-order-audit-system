import { useCallback, useEffect, useRef, useState } from "react";
import { api, date, money, quantity } from "./api.js";

const navigation = [
  { id: "overview", label: "Overview", icon: "grid" },
  { id: "orders", label: "Sales & orders", icon: "cart", countKey: "pendingOrders" },
  { id: "production", label: "Production", icon: "factory" },
  { id: "inventory", label: "Inventory", icon: "boxes" },
  { id: "masters", label: "Masters & BOM", icon: "grid" },
  { id: "reports", label: "Reports & audit", icon: "chart" },
];

const landingPage = (role) => ({
  ADMIN: "overview",
  SALESMAN: "orders",
  PRODUCTION: "production",
  AUDITOR: "reports",
}[role] || "overview");

const navigationFor = (role) => navigation.filter((item) => {
  if (role === "ADMIN") return true;
  if (role === "SALESMAN") return ["orders"].includes(item.id);
  if (role === "PRODUCTION") return ["production", "inventory"].includes(item.id);
  if (role === "AUDITOR") return ["reports"].includes(item.id);
  return false;
});

const Icon = ({ name, size = 18 }) => {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    cart: <><path d="M3 4h2l2.2 11h11.3l2-7.5H6" /><circle cx="9" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></>,
    factory: <><path d="M3 21V10l6 3V9l6 4V5h6v16Z" /><path d="M17 8h1M7 17h1m4 0h1m4 0h1" /></>,
    boxes: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 8 9 5v8l-9-5V8Zm18 0-9 5v8l9-5V8Z" /></>,
    chart: <><path d="M4 19V5m0 14h17" /><path d="m7 15 4-4 3 2 6-7" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
};

function Login({ onLogin }) {
  const [email, setEmail] = useState("admin@fooderp.local");
  const [password, setPassword] = useState("DemoAdmin!2026");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api("/auth/login", { method: "POST", body: { email, password } });
      localStorage.setItem("erp-token", result.token);
      onLogin(result.user);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-visual">
        <div className="brand brand-light"><span className="brand-mark">g.</span><span>grainline<span className="brand-dot">.</span></span></div>
        <div className="login-quote">
          <span className="eyebrow">MADE FOR THE FLOOR</span>
          <h1>From the first batch<br />to the final invoice.</h1>
          <p>One calm, connected workspace for every part of your food manufacturing business.</p>
        </div>
        <div className="login-art" aria-hidden="true">
          <div className="art-sun" />
          <div className="art-silo silo-one" /><div className="art-silo silo-two" /><div className="art-silo silo-three" />
          <div className="art-field field-one" /><div className="art-field field-two" />
          <span className="art-stamp">GOOD FOOD<br />GOOD FLOW</span>
        </div>
        <div className="login-foot"><span>BUILT FOR BETTER BATCHES</span><span>01 — 05</span></div>
      </section>
      <section className="login-panel">
        <div className="login-mobile-brand brand"><span className="brand-mark">g.</span><span>grainline<span className="brand-dot">.</span></span></div>
        <div className="login-form-wrap">
          <span className="eyebrow">WELCOME BACK</span>
          <h2>Good to have you here.</h2>
          <p className="muted">Sign in to pick up where your team left off.</p>
          <form onSubmit={submit} className="login-form">
            <label>Email address<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button button-dark button-wide" disabled={busy}>{busy ? "Signing in…" : "Sign in"} <Icon name="arrow" /></button>
          </form>
          <div className="login-note"><span className="status-dot" /> No public sign-up. Ask an administrator to create your account.</div>
        </div>
        <span className="login-copyright">© 2026 GRAINLINE ERP&nbsp; · &nbsp;BUILT TO KEEP THINGS MOVING</span>
      </section>
    </main>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [active, setActive] = useState("overview");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [reportRange, setReportRange] = useState({ from: "", to: "" });
  const loadRequestId = useRef(0);

  useEffect(() => {
    const token = localStorage.getItem("erp-token");
    if (!token) return;
    api("/me").then((nextUser) => {
      setUser(nextUser);
      setActive(landingPage(nextUser.role));
    }).catch(() => localStorage.removeItem("erp-token"));
    const expired = () => setUser(null);
    window.addEventListener("erp-session-expired", expired);
    return () => window.removeEventListener("erp-session-expired", expired);
  }, []);

  useEffect(() => {
    const closeModal = () => setModal("");
    const showToast = (event) => setToast(event.detail);
    window.addEventListener("erp-close-modal", closeModal);
    window.addEventListener("erp-toast", showToast);
    return () => {
      window.removeEventListener("erp-close-modal", closeModal);
      window.removeEventListener("erp-toast", showToast);
    };
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const path = {
        overview: "/dashboard",
        orders: "/orders",
        production: "/production",
        inventory: "/items",
        reports: `/reports${reportRange.from || reportRange.to ? `?${new URLSearchParams(Object.fromEntries(Object.entries(reportRange).filter(([, value]) => value)))}` : ""}`,
      }[active];
      if (active === "masters") {
        const [items, customers, suppliers, boms, users] = await Promise.all([
          api("/items"), api("/customers"), api("/suppliers"), api("/bom"), api("/users"),
        ]);
        if (requestId === loadRequestId.current) setData({ items, customers, suppliers, boms, users });
      } else {
        const result = await api(path);
        if (requestId === loadRequestId.current) setData(result);
      }
    } catch (failure) {
      if (requestId === loadRequestId.current) setError(failure.message);
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, [active, reportRange, user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function signOut() {
    loadRequestId.current += 1;
    localStorage.removeItem("erp-token");
    setUser(null);
    setData(null);
  }

  function navigateTo(page) {
    if (page !== active) {
      loadRequestId.current += 1;
      setData(null);
    }
    setActive(page);
  }

  async function act(path, options, success) {
    try {
      await api(path, options);
      setToast(success);
      setModal("");
      await load();
    } catch (failure) {
      setToast(failure.message);
    }
  }

  if (!user) return <Login onLogin={(nextUser) => { setUser(nextUser); setActive(landingPage(nextUser.role)); }} />;

  const allowedNavigation = navigationFor(user.role);
  const pageTitle = navigation.find((item) => item.id === active)?.label;
  const admin = user.role === "ADMIN";
  const canOrder = admin || user.role === "SALESMAN";
  const canProduce = admin || user.role === "PRODUCTION";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); navigateTo("overview"); }}>
          <span className="brand-mark">g.</span><span>grainline<span className="brand-dot">.</span></span>
        </a>
        <div className="workspace-switch"><span className="workspace-avatar">F</span><span><b>Fieldstone Foods</b><small>Manufacturing</small></span><span className="switch-chevron">⌄</span></div>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          {allowedNavigation.map((item) => (
            <button key={item.id} className={`nav-item ${active === item.id ? "nav-active" : ""}`} onClick={() => { navigateTo(item.id); setMobileNav(false); }}>
              <Icon name={item.icon} /><span>{item.label}</span>
              {item.countKey && data?.metrics?.[item.countKey] > 0 && <span className="nav-count">{data.metrics[item.countKey]}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><span className="help-icon">✳</span><b>Need a hand?</b><p>Your operations, all in one place. Start with a quick tour.</p><button onClick={() => setToast("You're all set. Start with an order or review your stock.")}>Explore the workspace <Icon name="arrow" size={14} /></button></div>
          <button className="profile-row" onClick={signOut}>
            <span className="profile-avatar">{user.name?.slice(0, 1).toUpperCase()}</span>
            <span className="profile-details"><b>{user.name}</b><small>{user.role.toLowerCase()}</small></span>
            <span className="profile-menu">↗</span>
          </button>
        </div>
      </aside>
      {mobileNav && <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Icon name="menu" /></button>
          <div className="breadcrumbs"><span>Fieldstone Foods</span><span className="crumb-slash">/</span><b>{pageTitle}</b></div>
          <div className="top-actions">
            <button className="date-chip"><span className="calendar-mark">▦</span>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date())}</button>
            <button className="icon-button notification-button" aria-label="Notifications" onClick={() => navigateTo("reports")}><Icon name="bell" /><span /></button>
            <button className="top-profile" onClick={signOut} title="Sign out">{user.name?.slice(0, 1).toUpperCase()}</button>
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div><div className="eyebrow">{new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()).toUpperCase()}</div><h1>{active === "overview" ? "A good day to make good things." : pageTitle}</h1>
              <p>{active === "overview" ? "Here’s what’s happening across your operation." : pageDescription(active)}</p>
            </div>
            <div className="heading-actions">
              {active === "orders" && canOrder && <button className="button button-dark" onClick={() => setModal("order")}><Icon name="plus" /> New order</button>}
              {active === "production" && canProduce && <button className="button button-dark" onClick={() => setModal("production")}><Icon name="plus" /> Record production</button>}
              {active === "inventory" && canProduce && <button className="button button-dark" onClick={() => setModal("purchase")}><Icon name="plus" /> Receive purchase</button>}
              {active === "masters" && admin && <span className="table-muted">Manage items, customers, suppliers and BOMs</span>}
              <button className="refresh-button" onClick={load} title="Refresh"><span className={loading ? "refresh-spin" : ""}>↻</span></button>
            </div>
          </div>
          {error && <div className="alert alert-error" role="alert">{error}<button onClick={load}>Try again</button></div>}
          {!data ? (error ? <div className="empty-state"><span className="empty-icon">!</span><b>This section could not be loaded.</b><p>{error}</p><button className="text-button" onClick={load}>Try again <Icon name="arrow" size={14} /></button></div> : <Loading />) : (
            <>
              {active === "overview" && <Dashboard data={data} onNavigate={navigateTo} />}
              {active === "orders" && <Orders data={Array.isArray(data) ? data : []} user={user} onCreate={() => setModal("order")} onEdit={(order) => { setSelectedOrder(order); setModal("edit-order"); }} onAct={act} onPdf={async (invoice) => {
                try {
                  const blob = await api(`/invoices/${invoice.id}/pdf`);
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = `${invoice.number.replaceAll("/", "-")}.pdf`;
                  link.click();
                  URL.revokeObjectURL(url);
                } catch (failure) { setToast(failure.message); }
              }} onCredit={(invoice) => { setSelectedInvoice(invoice); setModal("credit-note"); }} />}
              {active === "production" && <Production data={Array.isArray(data) ? data : []} onCreate={() => setModal("production")} canProduce={canProduce} />}
              {active === "inventory" && <Inventory data={Array.isArray(data) ? data : []} onCreate={() => setModal("purchase")} canProduce={canProduce} />}
              {active === "masters" && <Masters data={data || { items: [], customers: [], suppliers: [], boms: [], users: [] }} onReload={load} />}
              {active === "reports" && <Reports data={data || {}} range={reportRange} onFilter={setReportRange} />}
            </>
          )}
        </div>
      </main>

      {modal === "order" && <Modal title="Start a new order" subtitle="Send an order to the factory for approval." onClose={() => setModal("")}><OrderForm onSubmit={(body) => act("/orders", { method: "POST", body }, "Order submitted for approval.")} /></Modal>}
      {modal === "edit-order" && selectedOrder && <Modal title={`Edit ${selectedOrder.number}`} subtitle="Update products, quantities or prices before approval." onClose={() => setModal("")}><OrderEditForm order={selectedOrder} onSubmit={(body) => act(`/orders/${selectedOrder.id}`, { method: "PATCH", body }, "Order updated and audit logged.")} /></Modal>}
      {modal === "purchase" && <Modal title="Receive a purchase" subtitle="Add a supplier delivery to your stock ledger." onClose={() => setModal("")}><PurchaseForm onSubmit={(body) => act("/purchases", { method: "POST", body }, "Purchase received. Stock ledger updated.")} /></Modal>}
      {modal === "production" && <Modal title="Record a production run" subtitle="Record actual consumption and finished output." onClose={() => setModal("")}><ProductionForm onSubmit={(body) => act("/production", { method: "POST", body }, "Production recorded. Stock and variance updated.")} /></Modal>}
      {modal === "credit-note" && selectedInvoice && <Modal title={`Credit ${selectedInvoice.number}`} subtitle="A credit note preserves the posted invoice and its audit history." onClose={() => setModal("")}><CreditNoteForm onSubmit={(body) => act(`/invoices/${selectedInvoice.id}/credit-note`, { method: "POST", body }, "Credit note recorded.")} /></Modal>}
      {toast && <div className={`toast ${toast.toLowerCase().includes("failed") || toast.toLowerCase().includes("not ") || toast.toLowerCase().includes("insufficient") || toast.toLowerCase().includes("exceeds") ? "toast-error" : ""}`} role="status"><span>✳</span>{toast}<button onClick={() => setToast("")} aria-label="Dismiss"><Icon name="close" size={15} /></button></div>}
    </div>
  );
}

function pageDescription(page) {
  return {
    orders: "Keep every customer order moving from request to dispatch.",
    production: "Plan the batch, capture actuals, and keep a clean record.",
    inventory: "Every receipt, issue, and finished good in one live ledger.",
    reports: "Follow the numbers all the way back to their source.",
  }[page];
}

function Loading() {
  return <div className="loading-state"><span className="spinner" /><span>Getting your workspace ready…</span></div>;
}

function MetricCard({ label, value, note, icon, tone, trend }) {
  return <article className="metric-card"><div className="metric-top"><span className={`metric-icon ${tone}`}>{icon}</span><span className="metric-trend">{trend}</span></div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></article>;
}

function Dashboard({ data, onNavigate }) {
  if (!data) return <Loading />;
  const metrics = data.metrics;
  const finished = data.stock?.filter((item) => item.type === "FINISHED_GOOD") || [];
  const maxBalance = Math.max(...(data.stock || []).map((item) => Math.max(item.balance, 1)));
  return <>
    <section className="metrics-grid">
      <MetricCard label="Orders to review" value={quantity(metrics.pendingOrders, 0).padStart(2, "0")} note="Need your attention" icon="↗" tone="tone-peach" trend="This week" />
      <MetricCard label="Finished stock" value={quantity(metrics.finishedStock, 0)} note="Across all products" icon="▤" tone="tone-green" trend="Live" />
      <MetricCard label="Production runs" value={quantity(metrics.productionRuns, 0).padStart(2, "0")} note="All recorded batches" icon="⌁" tone="tone-yellow" trend="All time" />
      <MetricCard label="Outstanding" value={money(metrics.outstanding)} note="Across open invoices" icon="₹" tone="tone-blue" trend="Receivables" />
    </section>
    <section className="dashboard-grid">
      <article className="panel inventory-panel">
        <div className="panel-heading"><div><span className="eyebrow">STOCK AT A GLANCE</span><h2>Inventory health</h2></div><button className="text-button" onClick={() => onNavigate("inventory")}>View inventory <Icon name="arrow" size={15} /></button></div>
        <div className="stock-chart">
          {(data.stock || []).slice(0, 6).map((item, index) => {
            const pct = Math.max(5, Math.min(100, item.balance / maxBalance * 100));
            const low = item.balance <= item.reorderLevel;
            return <div className="stock-row" key={item.id}>
              <span className={`stock-dot stock-dot-${index % 5}`} />
              <span className="stock-name">{item.name}</span>
              <div className="stock-bar"><span className={low ? "bar-low" : ""} style={{ width: `${pct}%` }} /></div>
              <span className="stock-count">{quantity(item.balance, 1)} <small>{item.unit}</small></span>
              {low && <span className="mini-alert">LOW</span>}
            </div>;
          })}
          {!data.stock?.length && <Empty text="No inventory has been seeded yet." />}
        </div>
        <div className="panel-foot"><span><i className="legend-dot legend-ok" />Healthy stock</span><span><i className="legend-dot legend-low" />At reorder point</span><button onClick={() => onNavigate("inventory")}>Full ledger <Icon name="arrow" size={14} /></button></div>
      </article>
      <article className="panel batch-panel">
        <div className="panel-heading"><div><span className="eyebrow">PRODUCTION</span><h2>Latest batch</h2></div><button className="round-link" onClick={() => onNavigate("production")} aria-label="View production"><Icon name="arrow" size={16} /></button></div>
        {data.recentMovements?.find((movement) => movement.type === "PRODUCTION_OUTPUT") ? (
          <div className="batch-feature">
            <div className="batch-art"><span>✳</span><small>FRESH<br />FROM THE<br />FLOOR</small></div>
            <div className="batch-detail"><span className="status-pill status-green">COMPLETED</span><h3>{finished[0]?.name || "Finished batch"}</h3><span>{quantity(finished[0]?.balance)} units in stock</span></div>
            <div className="batch-progress"><div className="progress-label"><span>Output vs plan</span><b>{quantity(finished[0]?.balance, 0)} pcs</b></div><div className="progress-track"><span style={{ width: `${Math.min(100, Math.max(8, (finished[0]?.balance || 0) / 250 * 100))}%` }} /></div></div>
          </div>
        ) : <div className="empty-batch"><span className="empty-batch-icon">✳</span><b>Your next good batch starts here.</b><p>Record a production run to see its output and material variance.</p><button className="text-button" onClick={() => onNavigate("production")}>Go to production <Icon name="arrow" size={14} /></button></div>}
      </article>
    </section>
    <section className="bottom-grid">
      <article className="panel orders-panel">
        <div className="panel-heading"><div><span className="eyebrow">SALES DESK</span><h2>Orders that need a look</h2></div><button className="text-button" onClick={() => onNavigate("orders")}>All orders <Icon name="arrow" size={15} /></button></div>
        <OrderTable orders={data.recentOrders || []} compact />
      </article>
      <article className="panel quick-panel">
        <div className="panel-heading"><div><span className="eyebrow">QUICK START</span><h2>What would you like to do?</h2></div></div>
        <button className="quick-action" onClick={() => onNavigate("orders")}><span className="quick-icon quick-peach"><Icon name="cart" /></span><span><b>Take a new order</b><small>Capture a request from your customer</small></span><Icon name="arrow" size={16} /></button>
        <button className="quick-action" onClick={() => onNavigate("production")}><span className="quick-icon quick-yellow"><Icon name="factory" /></span><span><b>Log production</b><small>Record output and actual usage</small></span><Icon name="arrow" size={16} /></button>
        <button className="quick-action" onClick={() => onNavigate("inventory")}><span className="quick-icon quick-green"><Icon name="boxes" /></span><span><b>Receive a delivery</b><small>Update raw material stock</small></span><Icon name="arrow" size={16} /></button>
      </article>
    </section>
    <div className="dashboard-footer"><span>✳ &nbsp;The little things add up. Your stock ledger is looking good.</span><span>SYNCED JUST NOW</span></div>
  </>;
}

function OrderTable({ orders, compact = false }) {
  if (!orders.length) return <Empty text="No customer orders yet. Create one to start the approval flow." />;
  return <div className="table-wrap"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>PRODUCT</th><th>QUANTITY</th><th>STATUS</th>{!compact && <th>AVAILABILITY</th>}</tr></thead><tbody>
    {orders.map((order) => {
      const products = order.items?.map((line) => line.item?.name).filter(Boolean).join(", ");
      const totalQuantity = order.items?.reduce((sum, line) => sum + Number(line.quantity), 0) || 0;
      const short = order.items?.reduce((sum, line) => {
        const available = order.available?.find((row) => row.itemId === line.itemId)?.quantity || 0;
        return sum + Math.max(0, Number(line.quantity) - Number(available));
      }, 0) || 0;
      return <tr key={order.id}><td><b className="table-id">{order.number}</b><small>{date(order.createdAt)}</small></td><td>{order.customer?.name || "—"}</td><td>{products || "—"}</td><td>{quantity(totalQuantity, 0)} pcs</td><td><Status status={order.status} /></td>{!compact && <td>{short ? <span className="text-danger">{quantity(short, 0)} short</span> : "Available"}</td>}</tr>;
    })}
  </tbody></table></div>;
}

function Status({ status }) {
  const names = { PENDING: "Needs review", APPROVED: "Approved", REJECTED: "Declined", INVOICED: "Invoiced", DISPATCHED: "Dispatched", CREDITED: "Credited" };
  return <span className={`status-pill status-${(status || "").toLowerCase()}`}>{names[status] || status}</span>;
}

function Orders({ data, user, onAct, onCreate, onEdit, onPdf, onCredit }) {
  const [filter, setFilter] = useState("All orders");
  const [salesSummary, setSalesSummary] = useState(null);
  const canOrder = user.role === "ADMIN" || user.role === "SALESMAN";
  const canApprove = user.role === "ADMIN";
  const filtered = filter === "All orders" ? data : data.filter((order) => order.status === filter.toUpperCase());
  useEffect(() => {
    if (user.role !== "SALESMAN") return;
    api("/sales-summary").then(setSalesSummary)
      .catch((failure) => window.dispatchEvent(new CustomEvent("erp-toast", { detail: failure.message })));
  }, [user.role, data]);
  return <section className="panel page-panel">
    {user.role === "SALESMAN" && salesSummary && <div className="sales-summary"><div><span className="eyebrow">YOUR ORDERS</span><b>{salesSummary.orderCount}</b><small>submitted to the factory</small></div><div className="sales-summary-customers">{salesSummary.customerSales.slice(0, 3).map((row) => <span key={row.customer}><b>{row.customer}</b><small>{row.orders} orders · {money(row.sales)} invoiced</small></span>)}</div></div>}
    <div className="panel-toolbar"><div className="filter-tabs">{["All orders", "Pending", "Approved", "Invoiced", "Dispatched"].map((label) => <button key={label} className={filter === label ? "filter-active" : ""} onClick={() => setFilter(label)}>{label}</button>)}</div>{canOrder && <button className="button button-light button-small" onClick={onCreate}><Icon name="plus" /> New order</button>}</div>
    {filtered.length ? <div className="table-wrap"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>PRODUCTS</th><th>QTY</th><th>AVAILABLE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{filtered.map((order) => {
      const available = order.items?.reduce((shortage, line) => shortage + Math.max(0, Number(line.quantity) - Number(order.available?.find((row) => row.itemId === line.itemId)?.quantity || 0)), 0) || 0;
      const invoice = order.invoice;
      const paid = invoice?.payments?.reduce((sum, payment) => sum + Number(payment.amount), 0) || 0;
      return <tr key={order.id}>
        <td><b className="table-id">{order.number}</b><small>{date(order.createdAt)}</small></td><td>{order.customer.name}</td><td>{order.items.map((line) => `${line.item.name} × ${quantity(line.quantity, 0)}`).join(", ")}</td><td>{quantity(order.items.reduce((sum, line) => sum + Number(line.quantity), 0), 0)} pcs</td>
        <td>{available ? <span className="text-danger">{quantity(available, 0)} short</span> : "Available"}</td>
        <td><Status status={order.status} /></td>
        <td><div className="row-actions">
          {order.status === "PENDING" && canApprove && <><button className="action-link" onClick={() => onEdit(order)}>Edit</button><button className="action-link" onClick={() => onAct(`/orders/${order.id}/approve`, { method: "POST" }, "Order approved.")}>Approve</button><button className="action-link action-danger" onClick={() => onAct(`/orders/${order.id}/reject`, { method: "POST" }, "Order declined.")}>Decline</button></>}
          {order.status === "APPROVED" && canApprove && <button className="action-link" onClick={() => onAct("/invoices", { method: "POST", body: { orderId: order.id } }, "GST invoice created.")}>Create invoice</button>}
          {order.status === "INVOICED" && canApprove && <button className="action-link" onClick={() => onAct("/dispatches", { method: "POST", body: { invoiceId: invoice.id } }, "Order dispatched. Stock updated.")}>Dispatch</button>}
          {invoice && <button className="action-link" onClick={() => onPdf(invoice)}>PDF</button>}
          {invoice && Number(invoice.total) > paid && canApprove && <button className="action-link" onClick={() => onAct("/payments", { method: "POST", body: { invoiceId: invoice.id, amount: Math.min(4000, Number(invoice.total) - paid), method: "BANK_TRANSFER" } }, "Payment recorded.")}>Record payment</button>}
          {invoice?.status === "POSTED" && !paid && canApprove && <button className="action-link action-danger" onClick={() => onCredit(invoice)}>Credit note</button>}
          {!canApprove && order.status === "PENDING" && <span className="table-muted">Awaiting review</span>}
        </div></td>
      </tr>;
    })}</tbody></table></div> : <Empty text="No orders in this view yet." action="Create an order" onAction={onCreate} />}
    {canApprove && <div className="benchmark-note"><span className="benchmark-star">✳</span><span><b>Short on stock?</b> Orders show live availability. Dispatch only deducts stock when the goods leave the factory.</span></div>}
  </section>;
}

function Production({ data, onCreate, canProduce }) {
  return <>
    <section className="production-summary">
      <div className="production-intro"><span className="eyebrow">BATCH CONTROL</span><h2>Make each batch count.</h2><p>Plan against your BOM, then compare what actually went into every run.</p><button className="button button-dark" onClick={onCreate} disabled={!canProduce}><Icon name="plus" /> Record a batch</button></div>
      <div className="production-steps"><div><span>01</span><b>Choose a product</b><small>Pull its active recipe</small></div><div><span>02</span><b>Enter actuals</b><small>Compare planned vs used</small></div><div><span>03</span><b>Post the batch</b><small>Update stock in one go</small></div></div>
    </section>
    <section className="panel page-panel"><div className="panel-heading"><div><span className="eyebrow">BATCH HISTORY</span><h2>Production runs</h2></div><span className="table-muted">{data.length} records</span></div>
      {data.length ? <div className="table-wrap"><table><thead><tr><th>BATCH</th><th>PRODUCT</th><th>PLANNED</th><th>ACTUAL OUTPUT</th><th>YIELD VARIANCE</th><th>MATERIAL ALERTS</th></tr></thead><tbody>{data.map((run) => {
        const alerts = run.materials.filter((material) => Math.abs(Number(material.variancePct)) > Number(material.tolerance));
        const scrap = run.materials.filter((material) => Number(material.wastage) > 0);
        return <tr key={run.id}><td><b className="table-id">{run.number}</b><small>{date(run.producedAt)}</small></td><td>{run.product.name}</td><td>{quantity(run.plannedOutput, 0)} {run.product.unit}</td><td><b>{quantity(run.actualOutput, 0)} {run.product.unit}</b></td><td><span className={Number(run.yieldVariancePct) < -3 ? "variance-bad" : "variance-good"}>{Number(run.yieldVariancePct) > 0 ? "+" : ""}{quantity(run.yieldVariancePct, 1)}%</span></td><td>{alerts.length ? <span className="variance-bad">{alerts.map((row) => row.item.name).join(", ")} · {alerts.length} alert{alerts.length > 1 ? "s" : ""}</span> : <span className="variance-good">Within tolerance</span>}{scrap.length > 0 && <small>Wastage: {scrap.map((row) => `${row.item.name} ${quantity(row.wastage, 2)} ${row.item.unit}`).join(", ")}</small>}<small>Cost {money(run.costPerUnit)} / {run.product.unit}</small></td></tr>;
      })}</tbody></table></div> : <Empty text="No production runs recorded. Start with the seeded Murukku BOM." action="Record production" onAction={onCreate} />}
    </section>
  </>;
}

function Inventory({ data, onCreate, canProduce }) {
  const [query, setQuery] = useState("");
  const [ledgerItem, setLedgerItem] = useState(null);
  const [ledgerRows, setLedgerRows] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const filtered = data.filter((item) => `${item.name} ${item.code} ${item.type}`.toLowerCase().includes(query.toLowerCase()));
  const raw = data.filter((item) => item.type !== "FINISHED_GOOD");
  const finished = data.filter((item) => item.type === "FINISHED_GOOD");
  useEffect(() => {
    if (!ledgerItem) return;
    setLedgerLoading(true);
    api(`/stock-ledger?itemId=${encodeURIComponent(ledgerItem.id)}`)
      .then(setLedgerRows)
      .catch((failure) => window.dispatchEvent(new CustomEvent("erp-toast", { detail: failure.message })))
      .finally(() => setLedgerLoading(false));
  }, [ledgerItem]);
  return <>
    <section className="inventory-highlights"><div><span className="eyebrow">LIVE STOCK POSITION</span><strong>{data.length}</strong><span>tracked items</span></div><div><span className="eyebrow">MATERIALS & PACKAGING</span><strong>{raw.length}</strong><span>active stock lines</span></div><div><span className="eyebrow">FINISHED GOODS</span><strong>{finished.reduce((sum, item) => sum + Number(item.balance), 0)}</strong><span>units ready to ship</span></div><div className="inventory-callout"><span>✳</span><b>Every change has a paper trail.</b><small>Balances come from signed stock movements.</small></div></section>
    <section className="panel page-panel"><div className="panel-toolbar"><div><span className="eyebrow">STOCK LEDGER</span><h2>All inventory</h2></div><div className="toolbar-right"><label className="search-field"><Icon name="search" size={16} /><input placeholder="Find an item…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>{canProduce && <button className="button button-light button-small" onClick={onCreate}><Icon name="plus" /> Receive stock</button>}</div></div>
      <div className="table-wrap"><table><thead><tr><th>ITEM</th><th>CODE</th><th>TYPE</th><th>ON HAND</th><th>REORDER AT</th><th>STATUS</th><th>LEDGER</th></tr></thead><tbody>{filtered.map((item) => {
        const low = Number(item.balance) <= Number(item.reorderLevel);
        return <tr key={item.id}><td><span className={`item-avatar item-${item.type.toLowerCase()}`}>{item.type === "FINISHED_GOOD" ? "✳" : item.type === "PACKAGING" ? "▧" : "◈"}</span><b>{item.name}</b></td><td><span className="code-chip">{item.code}</span></td><td><span className="type-label">{item.type.replaceAll("_", " ").toLowerCase()}</span></td><td><b className={low ? "text-danger" : ""}>{quantity(item.balance, 2)} {item.unit}</b></td><td>{quantity(item.reorderLevel, 1)} {item.unit}</td><td><span className={`status-pill ${low ? "status-pending" : "status-green"}`}>{low ? "Reorder soon" : "In stock"}</span></td><td><button className="action-link" onClick={() => setLedgerItem(item)}>View ledger</button></td></tr>;
      })}</tbody></table></div>
      {!filtered.length && <Empty text="Nothing matches that search." />}
    </section>
    {ledgerItem && <Modal title={`${ledgerItem.name} ledger`} subtitle={`Running movement history · ${ledgerItem.unit}`} onClose={() => setLedgerItem(null)}>
      {ledgerLoading ? <Loading /> : ledgerRows.length ? <div className="table-wrap ledger-table"><table><thead><tr><th>DATE</th><th>MOVEMENT</th><th>REFERENCE</th><th>CHANGE</th><th>BALANCE</th><th>USER</th></tr></thead><tbody>{ledgerRows.map((row) => <tr key={row.id}><td>{date(row.createdAt)}</td><td>{row.type.replaceAll("_", " ").toLowerCase()}</td><td>{row.reference}</td><td className={Number(row.quantity) < 0 ? "text-danger" : "variance-good"}>{Number(row.quantity) > 0 ? "+" : ""}{quantity(row.quantity, 3)} {ledgerItem.unit}</td><td><b>{quantity(row.balanceAfter, 3)} {ledgerItem.unit}</b></td><td>{row.createdBy?.name || "System"}</td></tr>)}</tbody></table></div> : <Empty text="No movements are recorded for this item." />}
    </Modal>}
  </>;
}

function Masters({ data, onReload }) {
  const [tab, setTab] = useState("Products");
  const tabs = ["Products", "Materials", "Customers", "Suppliers", "BOM", "Team"];
  const items = data.items || [];
  const finished = items.filter((item) => item.type === "FINISHED_GOOD");
  const materials = items.filter((item) => item.type !== "FINISHED_GOOD");
  const [busy, setBusy] = useState(false);
  const [productId, setProductId] = useState(finished[0]?.id || "");
  async function save(path, body) {
    setBusy(true);
    try {
      await api(path, { method: "POST", body });
      window.dispatchEvent(new CustomEvent("erp-toast", { detail: "Master data saved and audited." }));
      await onReload();
    } catch (failure) {
      window.dispatchEvent(new CustomEvent("erp-toast", { detail: failure.message }));
    } finally {
      setBusy(false);
    }
  }
  return <section className="panel page-panel masters-page">
    <div className="panel-toolbar"><div className="filter-tabs">{tabs.map((name) => <button key={name} className={tab === name ? "filter-active" : ""} onClick={() => setTab(name)}>{name}</button>)}</div></div>
    {tab === "Products" && <MasterItems title="Finished products" items={finished} busy={busy} onSave={(body) => save("/items", { ...body, type: "FINISHED_GOOD" })} type="FINISHED_GOOD" />}
    {tab === "Materials" && <MasterItems title="Raw & packaging materials" items={materials} busy={busy} onSave={(body) => save("/items", body)} />}
    {tab === "Customers" && <MasterCustomers customers={data.customers || []} salespeople={(data.users || []).filter((user) => user.role === "SALESMAN" && user.active)} busy={busy} onSave={(body) => save("/customers", body)} />}
    {tab === "Suppliers" && <MasterSuppliers suppliers={data.suppliers || []} busy={busy} onSave={(body) => save("/suppliers", body)} />}
    {tab === "Team" && <TeamAccounts users={data.users || []} busy={busy} onSave={(body) => save("/users", body)} />}
    {tab === "BOM" && <div className="master-content"><div className="panel-heading"><div><span className="eyebrow">RECIPE CONTROL</span><h2>Bill of materials</h2></div></div>
      <form className="master-form" key={productId} onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const components = materials.map((item) => ({
          itemId: item.id,
          quantity: Number(form.get(`qty-${item.id}`) || 0),
          tolerance: Number(form.get(`tol-${item.id}`) || 3),
        })).filter((item) => item.quantity > 0);
        save("/bom", { productId, batchSize: Number(form.get("batchSize")), items: components });
      }}>
        <label>Product<select value={productId} onChange={(event) => setProductId(event.target.value)} required>{finished.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Expected batch output<input name="batchSize" type="number" min="0.001" step="0.001" defaultValue={data.boms?.find((row) => row.productId === productId)?.batchSize || 200} required /></label>
        <div className="section-label">COMPONENTS <span>Enter quantity per expected batch; leave unused items at zero</span></div>
        <div className="bom-components">{materials.map((item) => {
          const bomItem = data.boms?.find((row) => row.productId === productId)?.items.find((row) => row.itemId === item.id);
          return <div key={item.id}><span><b>{item.name}</b><small>{item.unit}</small></span><label>Qty<input name={`qty-${item.id}`} type="number" min="0" step="0.001" defaultValue={bomItem?.quantity || 0} /></label><label>Tolerance %<input name={`tol-${item.id}`} type="number" min="0" step="0.1" defaultValue={bomItem?.tolerance || 3} /></label></div>;
        })}</div>
        <div className="form-actions"><button className="button button-dark" disabled={busy || !finished.length || !materials.length}>{busy ? "Saving…" : "Save BOM"} <Icon name="arrow" size={16} /></button></div>
      </form>
      <div className="bom-list">{data.boms?.map((bom) => <div key={bom.id}><b>{bom.product.name}</b><span>{quantity(bom.batchSize, 0)} {bom.product.unit} / batch · {bom.items.length} components</span></div>)}</div>
    </div>}
  </section>;
}

function TeamAccounts({ users, busy, onSave }) {
  return <div className="master-content"><div className="panel-heading"><div><span className="eyebrow">ACCESS CONTROL</span><h2>Team accounts</h2><p className="muted">Only administrators can create accounts. Team members sign in with their own credentials.</p></div></div>
    <form className="master-form master-form-grid team-form" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      onSave({
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
        role: form.get("role"),
      });
      event.currentTarget.reset();
    }}>
      <label>Full name<input name="name" minLength="2" maxLength="120" required /></label>
      <label>Work email<input name="email" type="email" maxLength="254" required /></label>
      <label>Temporary password<input name="password" type="password" minLength="12" maxLength="128" autoComplete="new-password" required /></label>
      <label>Role<select name="role" required><option value="SALESMAN">Salesperson</option><option value="PRODUCTION">Production</option><option value="AUDITOR">Auditor (read-only)</option><option value="ADMIN">Administrator</option></select></label>
      <button className="button button-dark" disabled={busy}>{busy ? "Creating…" : "Create account"} <Icon name="plus" size={15} /></button>
    </form>
    <div className="form-hint">Passwords must contain at least 12 characters. Share the initial password securely with the account holder.</div>
    <div className="table-wrap team-table"><table><thead><tr><th>TEAM MEMBER</th><th>EMAIL</th><th>ROLE</th><th>STATUS</th><th>ADDED</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><b>{user.name}</b></td><td>{user.email}</td><td><span className="type-label">{user.role.replaceAll("_", " ").toLowerCase()}</span></td><td><span className={`status-pill ${user.active ? "status-green" : "status-pending"}`}>{user.active ? "Active" : "Inactive"}</span></td><td>{date(user.createdAt)}</td></tr>)}</tbody></table></div>
    {!users.length && <Empty text="No team accounts found." />}
  </div>;
}

function MasterItems({ title, items, type, busy, onSave }) {
  return <div className="master-content"><div className="panel-heading"><div><span className="eyebrow">ITEM MASTER</span><h2>{title}</h2></div></div>
    <form className="master-form master-form-grid" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      onSave({
        code: form.get("code"), name: form.get("name"), unit: form.get("unit"),
        type: type || form.get("type"), hsn: form.get("hsn") || undefined,
        gstRate: Number(form.get("gstRate") || 0), sellingPrice: Number(form.get("sellingPrice") || 0),
        reorderLevel: Number(form.get("reorderLevel") || 0),
        unitsPerCarton: form.get("unitsPerCarton") ? Number(form.get("unitsPerCarton")) : undefined,
      });
      event.currentTarget.reset();
    }}>
      <label>Code<input name="code" placeholder="RAW-003" required /></label><label>Name<input name="name" placeholder="Ingredient name" required /></label>
      {!type && <label>Type<select name="type"><option value="RAW_MATERIAL">Raw material</option><option value="PACKAGING">Packaging</option></select></label>}
      <label>Unit<input name="unit" placeholder="kg, L, pcs, packet" required /></label><label>Reorder level<input name="reorderLevel" type="number" min="0" step="0.001" defaultValue="0" /></label>
      {type === "FINISHED_GOOD" && <><label>Selling price (₹)<input name="sellingPrice" type="number" min="0" step="0.01" defaultValue="0" /></label><label>GST rate (%)<input name="gstRate" type="number" min="0" max="100" step="0.01" defaultValue="5" /></label><label>HSN<input name="hsn" /></label><label>Units / carton<input name="unitsPerCarton" type="number" min="0.001" step="0.001" /></label></>}
      <button className="button button-dark" disabled={busy}>{busy ? "Saving…" : "Add item"} <Icon name="plus" size={15} /></button>
    </form>
    <div className="table-wrap"><table><thead><tr><th>CODE</th><th>ITEM</th><th>UNIT</th><th>PRICE</th><th>REORDER AT</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><span className="code-chip">{item.code}</span></td><td><b>{item.name}</b></td><td>{item.unit}</td><td>{item.type === "FINISHED_GOOD" ? money(item.sellingPrice) : "—"}</td><td>{quantity(item.reorderLevel)} {item.unit}</td></tr>)}</tbody></table></div>
    {!items.length && <Empty text="No items yet." />}
  </div>;
}

function MasterCustomers({ customers, salespeople, busy, onSave }) {
  return <div className="master-content"><div className="panel-heading"><div><span className="eyebrow">CUSTOMER MASTER</span><h2>Customers and place of supply</h2></div></div>
    <form className="master-form master-form-grid" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      onSave({ code: form.get("code"), name: form.get("name"), state: form.get("state"), gstin: form.get("gstin") || undefined, email: form.get("email") || undefined, phone: form.get("phone") || undefined, creditLimit: Number(form.get("creditLimit") || 0), salespersonId: form.get("salespersonId") || undefined });
      event.currentTarget.reset();
    }}>
      <label>Code<input name="code" placeholder="RET-002" required /></label><label>Name<input name="name" required /></label><label>State<input name="state" defaultValue="Tamil Nadu" required /></label><label>GSTIN<input name="gstin" /></label><label>Email<input name="email" type="email" /></label><label>Phone<input name="phone" /></label><label>Credit limit (₹)<input name="creditLimit" type="number" min="0" step="0.01" defaultValue="0" /></label><label>Assigned salesperson<select name="salespersonId"><option value="">Unassigned</option>{salespeople.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label><button className="button button-dark" disabled={busy}>Add customer <Icon name="plus" size={15} /></button>
    </form>
    <div className="table-wrap"><table><thead><tr><th>CODE</th><th>CUSTOMER</th><th>STATE</th><th>GSTIN</th><th>CREDIT LIMIT</th></tr></thead><tbody>{customers.map((row) => <tr key={row.id}><td><span className="code-chip">{row.code}</span></td><td><b>{row.name}</b></td><td>{row.state}</td><td>{row.gstin || "—"}</td><td>{money(row.creditLimit)}</td></tr>)}</tbody></table></div>
  </div>;
}

function MasterSuppliers({ suppliers, busy, onSave }) {
  return <div className="master-content"><div className="panel-heading"><div><span className="eyebrow">SUPPLIER MASTER</span><h2>Supplier directory</h2></div></div>
    <form className="master-form master-form-grid" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      onSave({ code: form.get("code"), name: form.get("name"), phone: form.get("phone") || undefined });
      event.currentTarget.reset();
    }}>
      <label>Code<input name="code" placeholder="SUP-002" required /></label><label>Supplier name<input name="name" required /></label><label>Phone<input name="phone" /></label><button className="button button-dark" disabled={busy}>Add supplier <Icon name="plus" size={15} /></button>
    </form>
    <div className="table-wrap"><table><thead><tr><th>CODE</th><th>SUPPLIER</th><th>PHONE</th></tr></thead><tbody>{suppliers.map((row) => <tr key={row.id}><td><span className="code-chip">{row.code}</span></td><td><b>{row.name}</b></td><td>{row.phone || "—"}</td></tr>)}</tbody></table></div>
  </div>;
}

function Reports({ data, range, onFilter }) {
  const [tab, setTab] = useState("Sales");
  const [draftRange, setDraftRange] = useState(range);
  useEffect(() => setDraftRange(range), [range]);
  const reports = {
    Sales: data.sales || [],
    GST: data.sales || [],
    Stock: data.stock || [],
    Production: data.production || [],
    Purchases: data.purchases || [],
    Collections: data.collections || [],
    Outstanding: data.outstanding || [],
    Movements: data.movements || [],
    "Audit trail": data.audit || [],
  };
  const rows = reports[tab];
  const headers = {
    Sales: ["Invoice", "Status", "Customer", "Date", "Taxable", "Total"],
    GST: ["Invoice", "Status", "Customer", "Date", "Taxable", "CGST", "SGST", "IGST", "Total"],
    Stock: ["Item", "Code", "Opening", "Receipts", "Issues", "Closing"],
    Production: ["Batch", "Product", "Planned", "Actual", "Yield variance", "Date"],
    Purchases: ["Purchase", "Supplier", "Date", "Items", "Total"],
    Collections: ["Payment date", "Invoice", "Customer", "Method", "Amount", "Reference"],
    Outstanding: ["Invoice", "Customer", "Invoice date", "Invoice amount", "Paid", "Outstanding"],
    Movements: ["Date", "Item", "Movement", "Reference", "Quantity", "Performed by"],
    "Audit trail": ["Activity", "Record", "Performed by", "Date"],
  }[tab];
  const csvReports = { Sales: "sales", GST: "gst", Stock: "stock", Purchases: "purchases", Collections: "collections", Outstanding: "outstanding" };
  const query = new URLSearchParams(Object.entries(range).filter(([, value]) => value));
  const csvQuery = query.toString();
  function applyFilters(event) {
    event.preventDefault();
    onFilter(draftRange);
  }
  return <>
    <section className="report-hero"><div><span className="eyebrow">NUMBERS WITH A STORY</span><h2>Know what happened.<br /><em>And what happens next.</em></h2><p>Sales, stock, and production reports backed by the same live ledger.</p></div><div className="report-hero-art"><div className="report-ring ring-one" /><div className="report-ring ring-two" /><span>✳</span></div></section>
    <section className="panel page-panel">
      <form className="report-filters" onSubmit={applyFilters}><label>From<input type="date" value={draftRange.from} onChange={(event) => setDraftRange({ ...draftRange, from: event.target.value })} /></label><label>To<input type="date" value={draftRange.to} onChange={(event) => setDraftRange({ ...draftRange, to: event.target.value })} /></label><button className="button button-light button-small">Apply dates</button>{(range.from || range.to) && <button className="text-button" type="button" onClick={() => { setDraftRange({ from: "", to: "" }); onFilter({ from: "", to: "" }); }}>Clear</button>}</form>
      <div className="panel-toolbar"><div className="filter-tabs">{Object.keys(reports).map((name) => <button className={tab === name ? "filter-active" : ""} key={name} onClick={() => setTab(name)}>{name}</button>)}</div>{csvReports[tab] && <button className="button button-light button-small" onClick={async () => {
      try {
        const blob = await api(`/reports/${csvReports[tab]}.csv${csvQuery ? `?${csvQuery}` : ""}`);
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${csvReports[tab]}-report.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
      } catch (failure) { window.dispatchEvent(new CustomEvent("erp-toast", { detail: failure.message })); }
    }}>↓ Export CSV</button>}</div>
      {tab === "GST" && <div className="gst-summary"><div><span>Taxable value</span><b>{money(data.gst?.taxable)}</b></div><div><span>CGST</span><b>{money(data.gst?.cgst)}</b></div><div><span>SGST</span><b>{money(data.gst?.sgst)}</b></div><div><span>IGST</span><b>{money(data.gst?.igst)}</b></div><div><span>Total tax</span><b>{money(data.gst?.totalTax)}</b></div></div>}
      {!rows.length ? <Empty text={`No ${tab.toLowerCase()} data yet. Complete a workflow to populate this report.`} /> : <ReportTable tab={tab} rows={rows} headers={headers} />}
    </section>
    <section className="report-footnote"><span>✳</span><div><b>Built on the stock ledger, not a snapshot.</b><p>Purchase receipts, production issues, production output, and dispatch are all recorded as signed movements. Date filters apply to the selected report and its CSV export.</p></div></section>
  </>;
}

function ReportTable({ tab, rows, headers }) {
  const fields = {
    Sales: (row) => [row.number, <Status status={row.status} />, row.customer, date(row.date), money(row.taxable), <b>{money(row.total)}</b>],
    GST: (row) => [row.number, <Status status={row.status} />, row.customer, date(row.date), money(row.taxable), money(row.cgst), money(row.sgst), money(row.igst), <b>{money(Number(row.cgst) + Number(row.sgst) + Number(row.igst))}</b>],
    Stock: (row) => [row.item, row.code, quantity(row.opening), quantity(row.receipts), quantity(row.issues), <b>{quantity(row.closing)} {row.unit}</b>],
    Production: (row) => [row.number, row.product.name, `${quantity(row.plannedOutput)} ${row.product.unit}`, `${quantity(row.actualOutput)} ${row.product.unit}`, <span className={Number(row.yieldVariancePct) < -3 ? "variance-bad" : "variance-good"}>{quantity(row.yieldVariancePct)}%</span>, date(row.producedAt)],
    Purchases: (row) => [row.number, row.supplier, date(row.date), row.items.map((line) => `${line.item.name} × ${quantity(line.quantity, 2)}`).join(", "), money(row.total)],
    Collections: (row) => [date(row.date), row.invoice, row.customer, row.method.replaceAll("_", " ").toLowerCase(), money(row.amount), row.reference || "—"],
    Outstanding: (row) => [row.invoice, row.customer, date(row.date), money(row.total), money(row.paid), <b className="text-danger">{money(row.outstanding)}</b>],
    Movements: (row) => [date(row.createdAt), row.item.name, row.type.replaceAll("_", " ").toLowerCase(), row.reference, `${Number(row.quantity) > 0 ? "+" : ""}${quantity(row.quantity, 3)} ${row.item.unit}`, row.createdBy?.name || "System"],
    "Audit trail": (row) => [row.action.replaceAll("_", " ").toLowerCase(), `${row.entityType} · ${row.entityId.slice(-7)}`, row.user?.name || "System", date(row.createdAt)],
  }[tab];
  return <div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id || row.number || row.invoice || `${tab}-${index}`}>{fields(row).map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

function Empty({ text, action, onAction }) {
  return <div className="empty-state"><span className="empty-icon">✳</span><b>Nothing here just yet.</b><p>{text}</p>{action && <button className="text-button" onClick={onAction}>{action} <Icon name="arrow" size={14} /></button>}</div>;
}

function Modal({ title, subtitle, onClose, children }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><div><span className="eyebrow">GRAINLINE WORKSPACE</span><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><Icon name="close" /></button></header>{children}</section></div>;
}

function FormActions({ onCancel, busy }) {
  return <div className="form-actions"><button type="button" className="button button-light" onClick={onCancel}>Cancel</button><button className="button button-dark" disabled={busy}>{busy ? "Saving…" : "Save and continue"} <Icon name="arrow" size={16} /></button></div>;
}

function OrderForm({ onSubmit }) {
  const [customers, setCustomers] = useState([]);
  const [items, setItems] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [lines, setLines] = useState([{ itemId: "", quantity: "150" }]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([api("/customers"), api("/items")]).then(([nextCustomers, nextItems]) => {
      const products = nextItems.filter((item) => item.type === "FINISHED_GOOD");
      setCustomers(nextCustomers);
      setItems(products);
      setCustomerId(nextCustomers[0]?.id || "");
      setLines([{ itemId: products[0]?.id || "", quantity: "150" }]);
    }).catch((failure) => window.dispatchEvent(new CustomEvent("erp-toast", { detail: failure.message })));
  }, []);
  const amount = lines.reduce((sum, line) => {
    const item = items.find((row) => row.id === line.itemId);
    return sum + Number(line.quantity || 0) * Number(item?.sellingPrice || 0);
  }, 0);
  function updateLine(index, key, value) {
    setLines((previous) => previous.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line));
  }
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    await onSubmit({ customerId, items: lines.map((line) => ({ itemId: line.itemId, quantity: Number(line.quantity) })) });
    setBusy(false);
  }
  return <form className="modal-form" onSubmit={submit}>
    <label>Customer<select value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>{customers.map((row) => <option value={row.id} key={row.id}>{row.name} · {row.state}</option>)}</select></label>
    <div className="section-label">ORDER LINES <span>Price list · GST added on invoice</span></div>
    {lines.map((line, index) => <div className="form-two-col order-line" key={index}>
      <label>Product<select value={line.itemId} onChange={(event) => updateLine(index, "itemId", event.target.value)} required>{items.map((row) => <option value={row.id} key={row.id}>{row.name} · {money(row.sellingPrice)}</option>)}</select></label>
      <label>Quantity<input type="number" min="1" step="1" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} required /></label>
    </div>)}
    <button className="text-button" type="button" onClick={() => setLines([...lines, { itemId: items[0]?.id || "", quantity: "1" }])}>+ Add another product</button>
    <div className="form-total"><span>Estimated taxable amount</span><b>{money(amount)}</b></div>
    <div className="form-hint">The factory team will check stock and approve this order before invoicing.</div>
    <FormActions onCancel={() => window.dispatchEvent(new Event("erp-close-modal"))} busy={busy} />
  </form>;
}

function OrderEditForm({ order, onSubmit }) {
  const [lines, setLines] = useState(order.items.map((row) => ({
    itemId: row.itemId,
    quantity: String(row.quantity),
    unitPrice: String(row.unitPrice),
    name: row.item.name,
  })));
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    await onSubmit({ items: lines.map(({ itemId, quantity, unitPrice }) => ({
      itemId, quantity: Number(quantity), unitPrice: Number(unitPrice),
    })) });
    setBusy(false);
  }
  return <form className="modal-form" onSubmit={submit}>
    {lines.map((line, index) => <div className="edit-line" key={line.itemId}>
      <b>{line.name}</b>
      <div className="form-two-col">
        <label>Quantity<input type="number" min="1" step="1" value={line.quantity} onChange={(event) => setLines(lines.map((row, i) => i === index ? { ...row, quantity: event.target.value } : row))} required /></label>
        <label>Unit price<input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => setLines(lines.map((row, i) => i === index ? { ...row, unitPrice: event.target.value } : row))} required /></label>
      </div>
    </div>)}
    <div className="form-hint">Only pending orders can be edited. Changes are recorded in the audit trail.</div>
    <FormActions onCancel={() => window.dispatchEvent(new Event("erp-close-modal"))} busy={busy} />
  </form>;
}

function CreditNoteForm({ onSubmit }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    await onSubmit({ reason });
    setBusy(false);
  }
  return <form className="modal-form" onSubmit={submit}>
    <label>Reason for credit<textarea rows="4" minLength="5" maxLength="500" value={reason} onChange={(event) => setReason(event.target.value)} required /></label>
    <div className="form-hint">Credit notes preserve the invoice and tax values. Reconcile any payment before crediting.</div>
    <FormActions onCancel={() => window.dispatchEvent(new Event("erp-close-modal"))} busy={busy} />
  </form>;
}

function unitChoices(item) {
  const unit = item.unit.toLowerCase();
  if (["kg", "kilogram"].includes(unit)) return [item.unit, "g"];
  if (["l", "litre", "liter"].includes(unit)) return [item.unit, "ml"];
  if (unit === "packet" && Number(item.unitsPerCarton) > 0) return [item.unit, "carton"];
  return [item.unit];
}

function PurchaseForm({ onSubmit }) {
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [itemId, setItemId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [quantityValue, setQuantityValue] = useState("60");
  const [unitCost, setUnitCost] = useState("45");
  const [purchaseUnit, setPurchaseUnit] = useState("kg");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([api("/items"), api("/suppliers")]).then(([nextItems, nextSuppliers]) => {
      setItems(nextItems.filter((item) => item.type !== "FINISHED_GOOD"));
      setSuppliers(nextSuppliers);
      const preferred = nextItems.find((item) => item.code === "FLR-001") || nextItems[0];
      setItemId(preferred?.id || "");
      setPurchaseUnit(preferred?.unit || "");
      setSupplierId(nextSuppliers[0]?.id || "");
    }).catch((failure) => window.dispatchEvent(new CustomEvent("erp-toast", { detail: failure.message })));
  }, []);
  const selectedItem = items.find((item) => item.id === itemId);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    await onSubmit({ supplierId, itemId, quantity: Number(quantityValue), unitCost: Number(unitCost), unit: purchaseUnit });
    setBusy(false);
  }
  return <form className="modal-form" onSubmit={submit}>
    <label>Supplier<select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required>{suppliers.map((row) => <option value={row.id} key={row.id}>{row.name}</option>)}</select></label>
    <label>Material<select value={itemId} onChange={(event) => { const selected = items.find((item) => item.id === event.target.value); setItemId(event.target.value); setPurchaseUnit(selected?.unit || ""); }}>{items.map((row) => <option value={row.id} key={row.id}>{row.name} · {row.unit}</option>)}</select></label>
    <div className="form-two-col"><label>Quantity<input type="number" step="0.001" min="0.001" value={quantityValue} onChange={(event) => setQuantityValue(event.target.value)} required /></label><label>Unit<select value={purchaseUnit} onChange={(event) => setPurchaseUnit(event.target.value)}>{selectedItem && unitChoices(selectedItem).map((unit) => <option key={unit}>{unit}</option>)}</select></label></div>
    <label>Unit cost (₹ per selected unit)<input type="number" step="0.01" min="0" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} required /></label>
    <div className="form-total"><span>Purchase total</span><b>{money(Number(quantityValue) * Number(unitCost))}</b></div>
    <div className="form-hint">Receiving posts a receipt movement to the item’s permanent stock ledger.</div>
    <FormActions onCancel={() => window.dispatchEvent(new Event("erp-close-modal"))} busy={busy} />
  </form>;
}

function ProductionForm({ onSubmit }) {
  const [boms, setBoms] = useState([]);
  const [bomId, setBomId] = useState("");
  const [plannedOutput, setPlannedOutput] = useState("200");
  const [actualOutput, setActualOutput] = useState("188");
  const [actuals, setActuals] = useState({});
  const [wastage, setWastage] = useState({});
  const [units, setUnits] = useState({});
  const [labourCost, setLabourCost] = useState("1200");
  const [powerCost, setPowerCost] = useState("600");
  const [otherOverhead, setOtherOverhead] = useState("0");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/bom").then((nextBoms) => {
      setBoms(nextBoms);
      setBomId(nextBoms[0]?.id || "");
      if (nextBoms[0]) {
        setPlannedOutput(String(nextBoms[0].batchSize));
        setActuals(Object.fromEntries(nextBoms[0].items.map((row) => [row.itemId, String(row.quantity)])));
        setWastage(Object.fromEntries(nextBoms[0].items.map((row) => [row.itemId, "0"])));
        setUnits(Object.fromEntries(nextBoms[0].items.map((row) => [row.itemId, row.item.unit])));
      }
    }).catch((failure) => window.dispatchEvent(new CustomEvent("erp-toast", { detail: failure.message })));
  }, []);
  const bom = boms.find((row) => row.id === bomId);
  function chooseBom(event) {
    const selected = boms.find((row) => row.id === event.target.value);
    setBomId(event.target.value);
    setPlannedOutput(String(selected?.batchSize || 200));
    setActualOutput(String(selected?.batchSize || 200));
    setActuals(Object.fromEntries((selected?.items || []).map((row) => [row.itemId, String(row.quantity)])));
    setWastage(Object.fromEntries((selected?.items || []).map((row) => [row.itemId, "0"])));
    setUnits(Object.fromEntries((selected?.items || []).map((row) => [row.itemId, row.item.unit])));
  }
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    await onSubmit({
      productId: bom.productId,
      plannedOutput: Number(plannedOutput),
      actualOutput: Number(actualOutput),
      labourCost: Number(labourCost),
      powerCost: Number(powerCost),
      otherOverhead: Number(otherOverhead),
      materials: bom.items.map((row) => ({
        itemId: row.itemId,
        actual: Number(actuals[row.itemId]),
        wastage: Number(wastage[row.itemId] || 0),
        unit: units[row.itemId],
      })),
    });
    setBusy(false);
  }
  if (!bom) return <div className="empty-state"><b>No active recipe found.</b><p>Seed the benchmark BOM before recording production.</p></div>;
  return <form className="modal-form" onSubmit={submit}>
    <label>Product recipe<select value={bomId} onChange={chooseBom}>{boms.map((row) => <option key={row.id} value={row.id}>{row.product.name}</option>)}</select></label>
    <div className="form-two-col"><label>Planned output ({bom.product.unit})<input type="number" min="0.001" step="0.001" value={plannedOutput} onChange={(event) => setPlannedOutput(event.target.value)} required /></label><label>Actual good output<input type="number" min="0.001" step="0.001" value={actualOutput} onChange={(event) => setActualOutput(event.target.value)} required /></label></div>
    <div className="section-label">MATERIAL ACTUALS <span>Issued quantity includes wastage</span></div>
    <div className="material-inputs">{bom.items.map((row) => {
      const planned = Number(row.quantity) * Number(plannedOutput) / Number(bom.batchSize);
      return <div className="material-production-row" key={row.id}>
        <div><b>{row.item.name}</b><small>Planned {quantity(planned, 2)} {row.item.unit} · tolerance {row.tolerance}%</small></div>
        <div className="material-production-fields">
          <label>Issued<input type="number" min="0.001" step="0.001" value={actuals[row.itemId] || ""} onChange={(event) => setActuals({ ...actuals, [row.itemId]: event.target.value })} required /></label>
          <label>Damaged<input type="number" min="0" step="0.001" value={wastage[row.itemId] || "0"} onChange={(event) => setWastage({ ...wastage, [row.itemId]: event.target.value })} /></label>
          <label>Unit<select value={units[row.itemId] || row.item.unit} onChange={(event) => setUnits({ ...units, [row.itemId]: event.target.value })}>{unitChoices(row.item).map((unit) => <option key={unit}>{unit}</option>)}</select></label>
        </div>
      </div>;
    })}</div>
    <div className="section-label">RUN OVERHEADS</div>
    <div className="form-three-col"><label>Labour (₹)<input type="number" min="0" step="0.01" value={labourCost} onChange={(event) => setLabourCost(event.target.value)} /></label><label>Gas / power (₹)<input type="number" min="0" step="0.01" value={powerCost} onChange={(event) => setPowerCost(event.target.value)} /></label><label>Other (₹)<input type="number" min="0" step="0.01" value={otherOverhead} onChange={(event) => setOtherOverhead(event.target.value)} /></label></div>
    <div className="form-hint">Weighted-average material costs plus the entered run overheads determine cost per good packet. Stock changes commit together.</div>
    <FormActions onCancel={() => window.dispatchEvent(new Event("erp-close-modal"))} busy={busy} />
  </form>;
}

export default App;
