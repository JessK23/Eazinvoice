const SESSION_KEY = "eazinvoice_mobile_session_v3";
const SETTINGS_KEY = "eazinvoice_mobile_settings_v3";
const DEFAULT_LOCAL_API = "http://10.0.2.2:3001";
const DEFAULT_PRODUCTION_API = "https://www.eazinvoice.com";
const MONEY_FORMATTER = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const state = {
  apiBase: loadSettings().apiBase,
  token: "",
  user: null,
  workspaces: [],
  activeWorkspace: null,
  route: "home",
  online: navigator.onLine,
  busy: false,
  booted: false,
  lastError: "",
  requestEpoch: 0,
  data: emptyData(),
};

const dom = {};

function emptyData() {
  return {
    summary: null,
    customers: [],
    vendors: [],
    invoices: [],
    payments: [],
    purchaseOrders: [],
    vendorBills: [],
    creditNotes: [],
    vendorCredits: [],
    customerRefunds: [],
    vendorRefunds: [],
    bankAccounts: [],
    bankSummary: null,
    receivables: null,
    payables: null,
    profitLoss: null,
    balanceSheet: null,
    trialBalance: null,
    gst: null,
    tds: null,
    compliance: null,
    periods: [],
    yearEnd: null,
    team: [],
    settings: null,
  };
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      apiBase: normalizeApiBase(saved.apiBase || inferDefaultApiBase()),
    };
  } catch {
    return { apiBase: inferDefaultApiBase() };
  }
}

function inferDefaultApiBase() {
  const isNativeRuntime =
    Boolean(window.Capacitor) ||
    location.protocol === "capacitor:" ||
    location.origin === "https://localhost";
  if (isNativeRuntime) return DEFAULT_PRODUCTION_API;
  if (location.protocol === "http:" && location.hostname && location.hostname !== "localhost") {
    return `${location.protocol}//${location.hostname}:3001`;
  }
  return location.origin && location.origin !== "null" ? location.origin : DEFAULT_LOCAL_API;
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ apiBase: state.apiBase }));
}

function normalizeApiBase(value) {
  const text = String(value || "").trim().replace(/\/+$/, "");
  return text || DEFAULT_LOCAL_API;
}

function isReleaseUnsafeApiBase(value) {
  const base = normalizeApiBase(value);
  return base.startsWith("http://") && !/localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.|10\./.test(base);
}

const mobileStore = {
  async get(key) {
    const preferences = window.Capacitor?.Plugins?.Preferences;
    if (preferences?.get) {
      const result = await preferences.get({ key });
      return result?.value || "";
    }
    return localStorage.getItem(key) || "";
  },
  async set(key, value) {
    const preferences = window.Capacitor?.Plugins?.Preferences;
    if (preferences?.set) {
      await preferences.set({ key, value });
      return;
    }
    localStorage.setItem(key, value);
  },
  async remove(key) {
    const preferences = window.Capacitor?.Plugins?.Preferences;
    if (preferences?.remove) {
      await preferences.remove({ key });
      return;
    }
    localStorage.removeItem(key);
  },
};

function money(value, currency = "INR") {
  const amount = Number(value);
  return `${currency} ${MONEY_FORMATTER.format(Number.isFinite(amount) ? amount : 0)}`;
}

function text(value, fallback = "-") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function titleCase(value) {
  return text(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function idempotencyKey(prefix) {
  const random = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `mobile-${prefix}-${random}`;
}

function workspaceParams(extra = {}) {
  if (!state.activeWorkspace) return extra;
  return {
    workspaceOwnerUserId: state.activeWorkspace.ownerUserId || state.activeWorkspace.userId || "",
    businessId: state.activeWorkspace.businessId || "",
    ...extra,
  };
}

function query(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") search.set(key, value);
  });
  const rendered = search.toString();
  return rendered ? `?${rendered}` : "";
}

class MobileApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = "MobileApiError";
    this.status = status;
    this.payload = payload;
  }
}

const api = {
  async request(path, { method = "GET", body, signal, timeoutMs = 18000 } = {}) {
    if (!state.online && method !== "GET") {
      throw new MobileApiError("You are offline. Financial actions are blocked until the app reconnects.", 0, {});
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });
    try {
      const response = await fetch(`${state.apiBase}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const responseText = await response.text();
      let payload = {};
      if (responseText) {
        try {
          payload = JSON.parse(responseText);
        } catch {
          payload = { message: responseText };
        }
      }
      if (!response.ok) {
        throw new MobileApiError(payload.error || payload.message || statusMessage(response.status), response.status, payload);
      }
      return payload;
    } catch (error) {
      if (error.name === "AbortError") throw new MobileApiError("The request timed out. Check connectivity and retry.", 408, {});
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  },
  requestOtp(email, mode = "login") {
    return this.request("/auth/email-otp/request", { method: "POST", body: { email, mode } });
  },
  login(email, otp) {
    return this.request("/auth/login", { method: "POST", body: { email, otp } });
  },
  me() {
    return this.request("/me");
  },
  workspaces() {
    return this.request("/business/workspaces");
  },
  customers(params) {
    return this.request(`/customers${query(params)}`);
  },
  createCustomer(body) {
    return this.request("/customers", { method: "POST", body });
  },
  vendors(params) {
    return this.request(`/vendors${query(params)}`);
  },
  createVendor(body) {
    return this.request("/vendors", { method: "POST", body });
  },
  invoices(params) {
    return this.request(`/invoices${query(params)}`);
  },
  createInvoice(body) {
    return this.request("/invoices", { method: "POST", body });
  },
  recordInvoicePayment(invoiceId, body) {
    return this.request(`/invoices/${encodeURIComponent(invoiceId)}/payments`, { method: "POST", body });
  },
  payments(params) {
    return this.request(`/payments${query(params)}`);
  },
  creditNotes(params) {
    return this.request(`/credit-notes${query(params)}`);
  },
  createCreditNote(body) {
    return this.request("/credit-notes", { method: "POST", body });
  },
  customerRefunds(params) {
    return this.request(`/customer-refunds${query(params)}`);
  },
  createCustomerRefund(body) {
    return this.request("/customer-refunds", { method: "POST", body });
  },
  reverseCustomerPayment(body) {
    return this.request("/payment-reversals", { method: "POST", body });
  },
  purchaseOrders(params) {
    return this.request(`/purchase-orders${query(params)}`);
  },
  createPurchaseOrder(body) {
    return this.request("/purchase-orders", { method: "POST", body });
  },
  vendorBills(params) {
    return this.request(`/vendor-bills${query(params)}`);
  },
  createVendorBill(body) {
    return this.request("/vendor-bills", { method: "POST", body });
  },
  recordVendorBillPayment(vendorBillId, body) {
    return this.request(`/vendor-bills/${encodeURIComponent(vendorBillId)}/payments`, { method: "POST", body });
  },
  vendorCredits(params) {
    return this.request(`/vendor-credits${query(params)}`);
  },
  createVendorCredit(body) {
    return this.request("/vendor-credits", { method: "POST", body });
  },
  vendorRefunds(params) {
    return this.request(`/vendor-refunds${query(params)}`);
  },
  createVendorRefund(body) {
    return this.request("/vendor-refunds", { method: "POST", body });
  },
  reverseVendorPayment(body) {
    return this.request("/vendor-payment-reversals", { method: "POST", body });
  },
  report(type, params) {
    return this.request(`/reports/${encodeURIComponent(type)}${query(params)}`);
  },
  reportSummary(params) {
    return this.request(`/reports/summary${query(params)}`);
  },
  accountingSummary(params) {
    return this.request(`/accounting/summary${query(params)}`);
  },
  gstSummary(params) {
    return this.request(`/accounting/gst-summary${query(params)}`);
  },
  bankAccounts(params) {
    return this.request(`/bank/accounts${query(params)}`);
  },
  bankSummary(params) {
    return this.request(`/bank/reconciliation/summary${query(params)}`);
  },
  statementLines(params) {
    return this.request(`/bank/statement-lines${query(params)}`);
  },
  periods(params) {
    return this.request(`/accounting/periods${query(params)}`);
  },
  periodReadiness(params) {
    return this.request(`/accounting/periods/readiness${query(params)}`);
  },
  changePeriodStatus(body) {
    return this.request("/accounting/periods/status", { method: "POST", body });
  },
  yearEndReadiness(params) {
    return this.request(`/accounting/year-end-close/readiness${query(params)}`);
  },
  yearEndPreview(params) {
    return this.request(`/accounting/year-end-close/preview${query(params)}`);
  },
  team(params) {
    return this.request(`/business/team${query(params)}`);
  },
  businessSettings(params) {
    return this.request(`/business/settings${query(params)}`);
  },
  complianceDashboard(params) {
    return this.request(`/business/compliance-dashboard${query(params)}`);
  },
};

function statusMessage(status) {
  if (status === 401) return "Your session expired. Please sign in again.";
  if (status === 403) return "This role cannot perform that action.";
  if (status === 409) return "The record changed on the server. Refresh and review the latest version.";
  if (status === 429) return "Too many requests. Please retry later.";
  if (status === 503) return "EazInvoice is temporarily unavailable.";
  return `Request failed (${status})`;
}

function mapError(error) {
  if (error instanceof MobileApiError) {
    if (error.status === 401) {
      void logout(false);
      return "Your session expired. Please sign in again.";
    }
    return error.message;
  }
  return error?.message || "Something went wrong.";
}

function extractArray(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function currentRole() {
  return String(state.activeWorkspace?.role || state.activeWorkspace?.membershipRole || "owner").toLowerCase();
}

function canMutate() {
  const role = currentRole();
  return !["viewer", "read_only", "readonly"].includes(role);
}

function canGovern() {
  const role = currentRole();
  return ["owner", "admin", "accountant"].includes(role);
}

async function restoreSession() {
  const raw = await mobileStore.get(SESSION_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    state.token = saved.token || "";
    state.user = saved.user || null;
    state.activeWorkspace = saved.activeWorkspace || null;
  } catch {
    await mobileStore.remove(SESSION_KEY);
  }
}

async function saveSession() {
  await mobileStore.set(SESSION_KEY, JSON.stringify({
    token: state.token,
    user: state.user,
    activeWorkspace: state.activeWorkspace,
  }));
}

async function logout(renderAfter = true) {
  state.token = "";
  state.user = null;
  state.workspaces = [];
  state.activeWorkspace = null;
  state.data = emptyData();
  state.lastError = "";
  await mobileStore.remove(SESSION_KEY);
  if (renderAfter) render();
}

async function withBusy(action, label = "Working...") {
  state.busy = true;
  setStatus(label);
  renderChrome();
  try {
    const result = await action();
    return result;
  } catch (error) {
    state.lastError = mapError(error);
    setStatus(state.lastError, "error");
    return null;
  } finally {
    state.busy = false;
    renderChrome();
  }
}

function setStatus(message, tone = "info") {
  if (!dom.status) return;
  dom.status.textContent = message || "";
  dom.status.dataset.tone = tone;
}

async function boot() {
  cacheDom();
  bindEvents();
  state.apiBase = normalizeApiBase(state.apiBase);
  dom.apiBase.value = state.apiBase;
  await restoreSession();
  state.booted = true;
  if (state.token) {
    await refreshSessionAndData();
  } else {
    render();
  }
}

async function refreshSessionAndData() {
  await withBusy(async () => {
    state.user = await api.me().catch(() => state.user);
    const workspaces = await api.workspaces().catch(() => []);
    state.workspaces = extractArray(workspaces, ["workspaces", "businesses"]);
    if (!state.workspaces.length && state.user) {
      state.workspaces = [{
        ownerUserId: state.user.id,
        businessId: state.user.businessId || null,
        businessName: state.user.name || "My Business",
        role: "owner",
      }];
    }
    const activeId = state.activeWorkspace?.businessId || state.activeWorkspace?.ownerUserId;
    state.activeWorkspace = state.workspaces.find((workspace) => (
      (workspace.businessId || workspace.ownerUserId) === activeId
    )) || state.workspaces[0] || null;
    await saveSession();
    await refreshBusinessData();
  }, "Syncing workspace...");
}

async function refreshBusinessData() {
  if (!state.token || !state.activeWorkspace) return;
  const epoch = ++state.requestEpoch;
  const params = workspaceParams();
  const guarded = async (promise, fallback) => {
    try {
      return await promise;
    } catch {
      return fallback;
    }
  };
  const [
    summary,
    accounting,
    customers,
    vendors,
    invoices,
    payments,
    purchaseOrders,
    vendorBills,
    creditNotes,
    vendorCredits,
    customerRefunds,
    vendorRefunds,
    bankAccounts,
    bankSummary,
    receivables,
    payables,
    profitLoss,
    balanceSheet,
    trialBalance,
    gst,
    tds,
    compliance,
    periods,
    yearEnd,
    team,
    settings,
  ] = await Promise.all([
    guarded(api.reportSummary(params), null),
    guarded(api.accountingSummary(params), null),
    guarded(api.customers(params), []),
    guarded(api.vendors(params), []),
    guarded(api.invoices(params), []),
    guarded(api.payments(params), []),
    guarded(api.purchaseOrders(params), []),
    guarded(api.vendorBills(params), []),
    guarded(api.creditNotes(params), []),
    guarded(api.vendorCredits(params), []),
    guarded(api.customerRefunds(params), []),
    guarded(api.vendorRefunds(params), []),
    guarded(api.bankAccounts(params), []),
    guarded(api.bankSummary(params), null),
    guarded(api.report("receivables", params), null),
    guarded(api.report("vendor-payables", params), null),
    guarded(api.report("profit-loss", params), null),
    guarded(api.report("balance-sheet", params), null),
    guarded(api.report("trial-balance", params), null),
    guarded(api.gstSummary(params), null),
    guarded(api.report("tds-register", params), null),
    guarded(api.complianceDashboard(params), null),
    guarded(api.periods(params), []),
    guarded(api.yearEndReadiness({ ...params, financialYear: currentFinancialYear() }), null),
    guarded(api.team(params), []),
    guarded(api.businessSettings(params), null),
  ]);
  if (epoch !== state.requestEpoch) return;
  state.data = {
    summary: summary || accounting || null,
    customers: extractArray(customers, ["customers"]),
    vendors: extractArray(vendors, ["vendors"]),
    invoices: extractArray(invoices, ["invoices"]),
    payments: extractArray(payments, ["payments"]),
    purchaseOrders: extractArray(purchaseOrders, ["purchaseOrders", "orders"]),
    vendorBills: extractArray(vendorBills, ["vendorBills", "bills"]),
    creditNotes: extractArray(creditNotes, ["creditNotes"]),
    vendorCredits: extractArray(vendorCredits, ["vendorCredits"]),
    customerRefunds: extractArray(customerRefunds, ["customerRefunds", "refunds"]),
    vendorRefunds: extractArray(vendorRefunds, ["vendorRefunds", "refunds"]),
    bankAccounts: extractArray(bankAccounts, ["bankAccounts", "accounts"]),
    bankSummary,
    receivables,
    payables,
    profitLoss,
    balanceSheet,
    trialBalance,
    gst,
    tds,
    compliance,
    periods: extractArray(periods, ["periods"]),
    yearEnd,
    team: extractArray(team, ["team", "members"]),
    settings,
  };
  render();
}

function currentFinancialYear() {
  const now = new Date();
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

function cacheDom() {
  [
    "authForm", "otpRequestButton", "loginButton", "email", "otp", "apiBase", "apiBaseForm",
    "logoutButton", "workspaceSelect", "routeTitle", "status", "offlineBanner", "installRisk",
    "content", "bottomNav", "refreshButton", "profileName", "profileMeta",
  ].forEach((id) => {
    dom[id] = document.getElementById(id);
  });
}

function bindEvents() {
  dom.apiBaseForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    state.apiBase = normalizeApiBase(dom.apiBase.value);
    saveSettings();
    renderChrome();
    setStatus("API endpoint saved. Sign in or refresh to use it.");
  });
  dom.logoutButton?.addEventListener("click", () => void logout());
  dom.workspaceSelect?.addEventListener("change", () => void switchWorkspace(dom.workspaceSelect.value));
  dom.refreshButton?.addEventListener("click", () => void refreshBusinessData());
  dom.bottomNav?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-route]");
    if (!button) return;
    state.route = button.dataset.route;
    history.replaceState(null, "", `#${state.route}`);
    render();
  });
  document.body.addEventListener("click", (event) => {
    if (event.target.closest("#otpRequestButton")) {
      event.preventDefault();
      void requestOtp();
      return;
    }
    if (event.target.closest("#loginButton")) {
      event.preventDefault();
      void login();
      return;
    }
    const routeButton = event.target.closest("[data-route]");
    const action = event.target.closest("[data-action]");
    if (routeButton) {
      state.route = routeButton.dataset.route;
      history.replaceState(null, "", `#${state.route}`);
      render();
    }
    if (action) void handleAction(action.dataset.action, action.dataset);
  });
  document.body.addEventListener("submit", (event) => {
    if (event.target.closest("#authForm")) {
      event.preventDefault();
      void login();
      return;
    }
    const form = event.target.closest("[data-form]");
    if (!form) return;
    event.preventDefault();
    void handleForm(form.dataset.form, form);
  });
  window.addEventListener("online", () => {
    state.online = true;
    renderChrome();
    void refreshBusinessData();
  });
  window.addEventListener("offline", () => {
    state.online = false;
    renderChrome();
  });
  window.addEventListener("hashchange", () => {
    state.route = location.hash.replace("#", "") || "home";
    render();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.token) void refreshBusinessData();
  });
}

async function requestOtp() {
  const emailInput = document.getElementById("email");
  const email = emailInput?.value.trim() || "";
  if (!email) {
    setStatus("Enter your email address first.", "error");
    return;
  }
  await withBusy(async () => {
    await api.requestOtp(email, "login");
    setStatus("OTP requested. Check your email and enter the code.");
  }, "Requesting OTP...");
}

async function login() {
  const emailInput = document.getElementById("email");
  const otpInput = document.getElementById("otp");
  const email = emailInput?.value.trim() || "";
  const otp = otpInput?.value.trim() || "";
  if (!email || !otp) {
    setStatus("Enter email and OTP.", "error");
    return;
  }
  await withBusy(async () => {
    const payload = await api.login(email, otp);
    state.token = payload.token || payload.session?.token || "";
    state.user = payload.user || null;
    if (!state.token) throw new MobileApiError("Login succeeded but no session token was returned.", 500, payload);
    await saveSession();
    await refreshSessionAndData();
    setStatus("Signed in.");
  }, "Signing in...");
}

async function switchWorkspace(key) {
  const workspace = state.workspaces.find((entry) => workspaceKey(entry) === key);
  if (!workspace) return;
  state.requestEpoch += 1;
  state.activeWorkspace = workspace;
  state.data = emptyData();
  await saveSession();
  render();
  await withBusy(() => refreshBusinessData(), "Switching business...");
}

function workspaceKey(workspace) {
  return `${workspace.businessId || ""}:${workspace.ownerUserId || workspace.userId || ""}`;
}

async function handleAction(action, dataset = {}) {
  if (action === "refresh") {
    await refreshSessionAndData();
    return;
  }
  if (action === "share-document") {
    shareDocument(dataset.kind, dataset.id);
    return;
  }
  if (action === "preview-year-end") {
    await withBusy(async () => {
      const preview = await api.yearEndPreview(workspaceParams({ financialYear: currentFinancialYear(), closeDate: today() }));
      state.data.yearEnd = preview;
      render();
      setStatus("Year-end preview refreshed. No close was executed.");
    }, "Loading year-end preview...");
  }
  if (action === "period-readiness") {
    await withBusy(async () => {
      const readiness = await api.periodReadiness(workspaceParams({ accountingDate: today() }));
      state.data.periodReadiness = readiness;
      render();
      setStatus("Period readiness loaded.");
    }, "Checking period...");
  }
}

async function handleForm(name, form) {
  if (!canMutate() && !["settings"].includes(name)) {
    setStatus("Viewer access is read-only.", "error");
    return;
  }
  const data = new FormData(form);
  const value = (key) => String(data.get(key) || "").trim();
  const amount = (key) => number(data.get(key));
  const run = (fn, label) => withBusy(async () => {
    const result = await fn();
    form.reset();
    await refreshBusinessData();
    setStatus(label || "Saved.");
    return result;
  }, "Sending to EazInvoice...");

  if (name === "customer") {
    await run(() => api.createCustomer({ ...workspaceParams(), name: value("name"), email: value("email"), gstin: value("gstin") }), "Customer saved.");
  } else if (name === "vendor") {
    await run(() => api.createVendor({ ...workspaceParams(), name: value("name"), email: value("email"), gstin: value("gstin") }), "Vendor saved.");
  } else if (name === "invoice") {
    await run(() => api.createInvoice({
      ...workspaceParams(),
      customerName: value("customerName"),
      billToName: value("customerName"),
      invoiceDate: value("invoiceDate") || today(),
      dueDate: value("dueDate") || value("invoiceDate") || today(),
      status: value("status") || "draft",
      currency: "INR",
      items: [{
        description: value("description"),
        quantity: amount("quantity") || 1,
        rate: amount("rate"),
        taxRate: amount("taxRate"),
      }],
      idempotencyKey: idempotencyKey("invoice"),
    }), "Invoice sent to backend. Totals shown are server-authoritative.");
  } else if (name === "payment") {
    await run(() => api.recordInvoicePayment(value("invoiceId"), {
      ...workspaceParams(),
      amount: amount("amount"),
      paymentDate: value("paymentDate") || today(),
      mode: value("mode") || "bank_transfer",
      reference: value("reference"),
      idempotencyKey: idempotencyKey("customer-payment"),
    }), "Payment recorded.");
  } else if (name === "credit-note") {
    await run(() => api.createCreditNote({
      ...workspaceParams(),
      sourceInvoiceId: value("invoiceId"),
      amount: amount("amount"),
      creditDate: value("creditDate") || today(),
      reason: value("reason"),
      idempotencyKey: idempotencyKey("credit-note"),
    }), "Credit note recorded with append-only correction lineage.");
  } else if (name === "customer-refund") {
    await run(() => api.createCustomerRefund({
      ...workspaceParams(),
      sourceCreditNoteId: value("creditNoteId"),
      amount: amount("amount"),
      refundDate: value("refundDate") || today(),
      reason: value("reason"),
      reference: value("reference"),
      idempotencyKey: idempotencyKey("customer-refund"),
    }), "Customer refund recorded.");
  } else if (name === "payment-reversal") {
    await run(() => api.reverseCustomerPayment({
      ...workspaceParams(),
      originalPaymentId: value("paymentId"),
      amount: amount("amount"),
      reversalDate: value("reversalDate") || today(),
      reason: value("reason"),
      idempotencyKey: idempotencyKey("payment-reversal"),
    }), "Payment reversal recorded. This is not a refund.");
  } else if (name === "purchase-order") {
    await run(() => api.createPurchaseOrder({
      ...workspaceParams(),
      vendorName: value("vendorName"),
      billToName: value("vendorName"),
      poDate: value("poDate") || today(),
      status: "created",
      currency: "INR",
      items: [{
        description: value("description"),
        quantity: amount("quantity") || 1,
        rate: amount("rate"),
        taxRate: amount("taxRate"),
      }],
      idempotencyKey: idempotencyKey("purchase-order"),
    }), "PO created. It has no accounting impact until a vendor bill is posted.");
  } else if (name === "vendor-bill") {
    await run(() => api.createVendorBill({
      ...workspaceParams(),
      vendorName: value("vendorName"),
      reference: value("reference"),
      billDate: value("billDate") || today(),
      dueDate: value("dueDate") || value("billDate") || today(),
      expenseAccountName: value("expenseAccountName") || "Operating Expense",
      currency: "INR",
      items: [{
        description: value("description"),
        quantity: amount("quantity") || 1,
        rate: amount("rate"),
        taxRate: amount("taxRate"),
      }],
      idempotencyKey: idempotencyKey("vendor-bill"),
    }), "Vendor bill posted to backend accounting.");
  } else if (name === "vendor-payment") {
    await run(() => api.recordVendorBillPayment(value("vendorBillId"), {
      ...workspaceParams(),
      amount: amount("amount"),
      paymentDate: value("paymentDate") || today(),
      mode: value("mode") || "bank_transfer",
      reference: value("reference"),
      idempotencyKey: idempotencyKey("vendor-payment"),
    }), "Vendor payment recorded.");
  } else if (name === "vendor-credit") {
    await run(() => api.createVendorCredit({
      ...workspaceParams(),
      sourceVendorBillId: value("vendorBillId"),
      amount: amount("amount"),
      creditDate: value("creditDate") || today(),
      reason: value("reason"),
      idempotencyKey: idempotencyKey("vendor-credit"),
    }), "Vendor credit recorded.");
  } else if (name === "vendor-recovery") {
    await run(() => api.createVendorRefund({
      ...workspaceParams(),
      sourceVendorCreditId: value("vendorCreditId"),
      amount: amount("amount"),
      receivedDate: value("receivedDate") || today(),
      reason: value("reason"),
      reference: value("reference"),
      idempotencyKey: idempotencyKey("vendor-recovery"),
    }), "Vendor recovery recorded.");
  } else if (name === "settings") {
    state.apiBase = normalizeApiBase(value("apiBase"));
    saveSettings();
    renderChrome();
    setStatus(isReleaseUnsafeApiBase(state.apiBase)
      ? "Saved. Release builds must use HTTPS; this endpoint is development-only."
      : "API endpoint saved.");
  }
}

function render() {
  if (!state.booted) return;
  renderChrome();
  if (!state.token) {
    dom.content.innerHTML = renderLogin();
    cacheDom();
    return;
  }
  if (!state.activeWorkspace) {
    dom.content.innerHTML = renderNoWorkspace();
    cacheDom();
    return;
  }
  const renderers = {
    home: renderHome,
    sales: renderSales,
    purchases: renderPurchases,
    money: renderMoney,
    reports: renderReports,
    more: renderMore,
  };
  dom.content.innerHTML = (renderers[state.route] || renderHome)();
  cacheDom();
}

function renderChrome() {
  document.body.dataset.signedIn = state.token ? "true" : "false";
  document.body.dataset.busy = state.busy ? "true" : "false";
  dom.offlineBanner.hidden = state.online;
  dom.installRisk.hidden = !isReleaseUnsafeApiBase(state.apiBase);
  dom.routeTitle.textContent = routeLabel(state.route);
  dom.profileName.textContent = state.user?.name || state.user?.email || "Not signed in";
  dom.profileMeta.textContent = state.activeWorkspace ? `${workspaceName(state.activeWorkspace)} - ${titleCase(currentRole())}` : state.apiBase;
  dom.apiBase.value = state.apiBase;
  dom.logoutButton.hidden = !state.token;
  dom.refreshButton.hidden = !state.token;
  dom.workspaceSelect.hidden = !state.token || state.workspaces.length <= 1;
  if (state.token) {
    dom.workspaceSelect.innerHTML = state.workspaces.map((workspace) => (
      `<option value="${escapeAttr(workspaceKey(workspace))}" ${workspace === state.activeWorkspace ? "selected" : ""}>${escapeHtml(workspaceName(workspace))} - ${escapeHtml(titleCase(workspace.role || "owner"))}</option>`
    )).join("");
  }
  dom.bottomNav.querySelectorAll("[data-route]").forEach((button) => {
    button.classList.toggle("active", button.dataset.route === state.route);
  });
}

function routeLabel(route) {
  return {
    home: "Home",
    sales: "Sales",
    purchases: "Purchases",
    money: "Money",
    reports: "Reports",
    more: "More",
  }[route] || "Home";
}

function workspaceName(workspace) {
  return text(workspace.businessName || workspace.name || workspace.companyName || workspace.label, "Business Workspace");
}

function renderLogin() {
  return `
    <section class="panel auth-panel">
      <span class="eyebrow">Secure sign in</span>
      <h1>EazInvoice Android</h1>
      <p>Use the same email OTP identity and business access as the Web app. The backend stays authoritative for totals, tax, postings, compliance, and close controls.</p>
      <form id="authForm" class="form-stack">
        <label>Email<input id="email" type="email" autocomplete="email" placeholder="owner@example.com" required /></label>
        <label>OTP<input id="otp" inputmode="numeric" autocomplete="one-time-code" placeholder="Enter OTP" /></label>
        <div class="button-row">
          <button id="otpRequestButton" class="secondary" type="button">Request OTP</button>
          <button id="loginButton" class="primary" type="submit">Sign in</button>
        </div>
      </form>
    </section>
  `;
}

function renderNoWorkspace() {
  return `
    <section class="panel empty-panel">
      <h2>No business access</h2>
      <p>Your account is signed in, but no authorized EazInvoice business workspace was returned by the API.</p>
      <button class="primary" type="button" data-action="refresh">Refresh</button>
    </section>
  `;
}

function metricValue(keys, fallback = 0) {
  const sources = [state.data.summary, state.data.profitLoss, state.data.balanceSheet, state.data.bankSummary].filter(Boolean);
  for (const source of sources) {
    for (const key of keys) {
      if (source && source[key] !== undefined) return source[key];
      if (source?.totals && source.totals[key] !== undefined) return source.totals[key];
      if (source?.summary && source.summary[key] !== undefined) return source.summary[key];
    }
  }
  return fallback;
}

function renderHome() {
  const revenue = metricValue(["revenue", "income", "sales", "totalRevenue"]);
  const expenses = metricValue(["expenses", "totalExpenses"]);
  const profit = metricValue(["profit", "netProfit", "profitLoss"], number(revenue) - number(expenses));
  const receivables = metricValue(["receivables", "accountsReceivable", "arBalance"]);
  const payables = metricValue(["payables", "accountsPayable", "apBalance"]);
  const bank = metricValue(["bank", "cash", "bankCash", "bookBalance"]);
  return `
    <section class="cockpit">
      ${metricCard("Revenue", money(revenue), "Backend report")}
      ${metricCard("Expenses", money(expenses), "Backend report")}
      ${metricCard("Profit/Loss", money(profit), "Current view")}
      ${metricCard("Receivables", money(receivables), `${state.data.invoices.length} invoices`)}
      ${metricCard("Payables", money(payables), `${state.data.vendorBills.length} bills`)}
      ${metricCard("Bank/Cash", money(bank), `${state.data.bankAccounts.length} accounts`)}
    </section>
    <section class="panel">
      <div class="section-head">
        <div><span class="eyebrow">Risk summary</span><h2>Needs attention</h2></div>
        <button class="tiny" type="button" data-route="reports">Review</button>
      </div>
      <div class="status-grid">
        ${riskCard("Overdue receivables", state.data.receivables?.overdueTotal || state.data.receivables?.summary?.overdueTotal || 0)}
        ${riskCard("Payables due", state.data.payables?.dueTotal || state.data.payables?.summary?.dueTotal || 0)}
        ${riskCard("GST/TDS issues", issueCount(state.data.compliance || state.data.gst || state.data.tds))}
        ${riskCard("Unreconciled bank", state.data.bankSummary?.unmatchedCount || state.data.bankSummary?.summary?.unmatchedCount || 0)}
      </div>
    </section>
    <section class="panel">
      <div class="section-head">
        <div><span class="eyebrow">Quick actions</span><h2>Common mobile work</h2></div>
        <span class="pill">${canMutate() ? "Enabled" : "Read-only"}</span>
      </div>
      <div class="quick-actions">
        <button class="primary" type="button" data-route="sales">New invoice</button>
        <button class="secondary" type="button" data-route="sales">Record payment</button>
        <button class="secondary" type="button" data-route="purchases">Vendor bill</button>
        <button class="secondary" type="button" data-route="money">Receivables</button>
      </div>
    </section>
    <section class="panel">
      <div class="section-head compact"><h2>Recent financial records</h2><span class="pill">Live API</span></div>
      ${recordList([...state.data.invoices, ...state.data.vendorBills, ...state.data.creditNotes].slice(0, 8), "No recent records yet.")}
    </section>
  `;
}

function renderSales() {
  return `
    <section class="tabs-panel">
      ${formCard("Create Invoice", "invoice", `
        <label>Customer<input name="customerName" required placeholder="Customer or business name" /></label>
        <div class="split"><label>Invoice Date<input name="invoiceDate" type="date" value="${today()}" /></label><label>Due Date<input name="dueDate" type="date" /></label></div>
        <label>Item / Service<input name="description" required placeholder="Consulting service" /></label>
        <div class="split"><label>Qty<input name="quantity" type="number" step="0.01" value="1" /></label><label>Rate<input name="rate" type="number" step="0.01" required /></label></div>
        <div class="split"><label>GST %<input name="taxRate" type="number" step="0.01" value="18" /></label><label>Status<select name="status"><option value="draft">Save Draft</option><option value="issued">Issue Invoice</option><option value="created">Create</option></select></label></div>
      `)}
      ${formCard("Record Payment", "payment", `
        ${selectField("invoiceId", "Invoice", state.data.invoices, "invoiceNumber")}
        <div class="split"><label>Amount<input name="amount" type="number" step="0.01" required /></label><label>Date<input name="paymentDate" type="date" value="${today()}" /></label></div>
        <div class="split"><label>Mode<select name="mode"><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="card">Card</option></select></label><label>Reference<input name="reference" /></label></div>
      `)}
      ${formCard("Credit Note", "credit-note", `
        ${selectField("invoiceId", "Source Invoice", state.data.invoices, "invoiceNumber")}
        <div class="split"><label>Amount<input name="amount" type="number" step="0.01" required /></label><label>Date<input name="creditDate" type="date" value="${today()}" /></label></div>
        <label>Reason<input name="reason" required placeholder="Price correction / return / GST adjustment" /></label>
      `)}
      ${formCard("Refund / Reversal", "customer-refund", `
        ${selectField("creditNoteId", "Credit Note", state.data.creditNotes, "creditNoteNumber")}
        <div class="split"><label>Refund Amount<input name="amount" type="number" step="0.01" required /></label><label>Date<input name="refundDate" type="date" value="${today()}" /></label></div>
        <label>Reference<input name="reference" /></label><label>Reason<input name="reason" required /></label>
      `)}
      ${formCard("Reverse Payment", "payment-reversal", `
        ${selectField("paymentId", "Original Payment", state.data.payments, "reference")}
        <div class="split"><label>Amount<input name="amount" type="number" step="0.01" required /></label><label>Date<input name="reversalDate" type="date" value="${today()}" /></label></div>
        <label>Reason<input name="reason" required placeholder="Failed/invalid payment reason" /></label>
        <p class="form-note">A reversal means the original payment should no longer count. A refund returns money after a valid payment.</p>
      `)}
    </section>
    <section class="panel">${sectionTitle("Customers", "Outstanding and GST posture")}${partyList(state.data.customers, "No customers from API yet.")}</section>
    <section class="panel">${sectionTitle("Invoices", "Authoritative backend totals")}${recordList(state.data.invoices, "No invoices yet.")}</section>
    <section class="panel">${sectionTitle("Credit Notes / Refunds", "Append-only corrections")}${recordList([...state.data.creditNotes, ...state.data.customerRefunds], "No credit notes or refunds yet.")}</section>
  `;
}

function renderPurchases() {
  return `
    <section class="notice-panel">A Purchase Order records intention only. A vendor bill records the accounting liability.</section>
    <section class="tabs-panel">
      ${formCard("Purchase Order", "purchase-order", `
        <label>Vendor<input name="vendorName" required placeholder="Vendor name" /></label>
        <label>Item / Service<input name="description" required placeholder="Goods or service requested" /></label>
        <div class="split"><label>Qty<input name="quantity" type="number" step="0.01" value="1" /></label><label>Rate<input name="rate" type="number" step="0.01" required /></label></div>
        <div class="split"><label>GST %<input name="taxRate" type="number" step="0.01" value="18" /></label><label>PO Date<input name="poDate" type="date" value="${today()}" /></label></div>
      `)}
      ${formCard("Vendor Bill", "vendor-bill", `
        <label>Vendor<input name="vendorName" required /></label><label>Vendor Ref<input name="reference" /></label>
        <div class="split"><label>Bill Date<input name="billDate" type="date" value="${today()}" /></label><label>Due Date<input name="dueDate" type="date" /></label></div>
        <label>Expense Account<input name="expenseAccountName" placeholder="Operating Expense" /></label>
        <label>Item / Expense<input name="description" required /></label>
        <div class="split"><label>Qty<input name="quantity" type="number" step="0.01" value="1" /></label><label>Rate<input name="rate" type="number" step="0.01" required /></label></div>
        <label>GST %<input name="taxRate" type="number" step="0.01" value="18" /></label>
      `)}
      ${formCard("Vendor Payment", "vendor-payment", `
        ${selectField("vendorBillId", "Vendor Bill", state.data.vendorBills, "billNumber")}
        <div class="split"><label>Amount<input name="amount" type="number" step="0.01" required /></label><label>Date<input name="paymentDate" type="date" value="${today()}" /></label></div>
        <label>Reference<input name="reference" /></label>
      `)}
      ${formCard("Vendor Credit / Recovery", "vendor-credit", `
        ${selectField("vendorBillId", "Source Vendor Bill", state.data.vendorBills, "billNumber")}
        <div class="split"><label>Credit Amount<input name="amount" type="number" step="0.01" required /></label><label>Date<input name="creditDate" type="date" value="${today()}" /></label></div>
        <label>Reason<input name="reason" required /></label>
      `)}
      ${formCard("Supplier Recovery", "vendor-recovery", `
        ${selectField("vendorCreditId", "Vendor Credit", state.data.vendorCredits, "vendorCreditNumber")}
        <div class="split"><label>Amount<input name="amount" type="number" step="0.01" required /></label><label>Received Date<input name="receivedDate" type="date" value="${today()}" /></label></div>
        <label>Reference<input name="reference" /></label><label>Reason<input name="reason" required /></label>
      `)}
    </section>
    <section class="panel">${sectionTitle("Vendors", "Payable and supplier-credit posture")}${partyList(state.data.vendors, "No vendors from API yet.")}</section>
    <section class="panel">${sectionTitle("Purchase Orders", "No accounting impact")}${recordList(state.data.purchaseOrders, "No purchase orders yet.")}</section>
    <section class="panel">${sectionTitle("Vendor Bills / Credits", "A/P and input tax")}${recordList([...state.data.vendorBills, ...state.data.vendorCredits, ...state.data.vendorRefunds], "No vendor accounting records yet.")}</section>
  `;
}

function renderMoney() {
  return `
    <section class="cockpit compact">
      ${metricCard("A/R", money(metricValue(["receivables", "accountsReceivable", "totalOutstanding"])), "Customer subledger")}
      ${metricCard("A/P", money(metricValue(["payables", "accountsPayable", "totalOutstanding"])), "Vendor subledger")}
      ${metricCard("Unmatched", String(state.data.bankSummary?.unmatchedCount || state.data.bankSummary?.summary?.unmatchedCount || 0), "Bank evidence")}
    </section>
    <section class="panel">${sectionTitle("Receivables", "Backend ageing")}${jsonSummary(state.data.receivables, ["totalOutstanding", "overdueTotal", "current", "days30", "days60", "days90"])}</section>
    <section class="panel">${sectionTitle("Payables", "Backend ageing")}${jsonSummary(state.data.payables, ["totalOutstanding", "overdueTotal", "current", "days30", "days60", "days90"])}</section>
    <section class="panel">${sectionTitle("Bank / Cash", "Summary on mobile; matching workspace is Web-preferred")}${bankList()}</section>
  `;
}

function renderReports() {
  return `
    <section class="panel">${sectionTitle("Profit & Loss", "Summary first")}${jsonSummary(state.data.profitLoss, ["revenue", "income", "expenses", "netProfit", "profit"])}</section>
    <section class="panel">${sectionTitle("Balance Sheet", "Derived from ledger")}${jsonSummary(state.data.balanceSheet, ["assets", "liabilities", "equity", "isBalanced", "completenessStatus"])}</section>
    <section class="panel">${sectionTitle("Trial Balance", "Read-only mobile review")}${jsonSummary(state.data.trialBalance, ["debits", "credits", "isBalanced", "difference"])}</section>
    <section class="panel">${sectionTitle("General Ledger", "Search and dense journal review remain Web-preferred")}${recordList(state.data.trialBalance?.accounts || state.data.trialBalance?.entries || [], "Open Web for detailed ledger drill-down.")}</section>
  `;
}

function renderMore() {
  return `
    <section class="panel">${sectionTitle("GST", "Output, input and review status")}${jsonSummary(state.data.gst, ["outputGst", "inputGst", "netGst", "needsReviewCount", "reconciliationStatus"])}</section>
    <section class="panel">${sectionTitle("TDS", "Liabilities and needs-review")}${jsonSummary(state.data.tds, ["tdsPayable", "needsReviewCount", "transactionCount"])}</section>
    <section class="panel">${sectionTitle("Compliance", "Prepared is not government-filed")}${jsonSummary(state.data.compliance, ["openTasks", "dueSoon", "overdue", "preparedCount", "filedCount"])}</section>
    <section class="panel">
      ${sectionTitle("Accounting Periods", "Close/reopen is Web-preferred unless controlled")}
      ${recordList(state.data.periods, "No accounting periods returned.")}
      <button class="secondary full" type="button" data-action="period-readiness">Check today's readiness</button>
    </section>
    <section class="panel">
      ${sectionTitle("Year-End", "Preview only on mobile")}
      ${jsonSummary(state.data.yearEnd, ["financialYear", "ready", "blockerCount", "retainedEarningsImpact", "status"])}
      <button class="secondary full" type="button" data-action="preview-year-end">Preview year-end impact</button>
    </section>
    <section class="panel">${sectionTitle("Business / Team", "Secrets stay Web-preferred")}${businessGovernance()}</section>
    <section class="panel">
      ${sectionTitle("API Endpoint", "Development, staging or production")}
      <form class="form-stack" data-form="settings">
        <label>API Base URL<input name="apiBase" value="${escapeAttr(state.apiBase)}" placeholder="${DEFAULT_PRODUCTION_API}" /></label>
        <button class="primary full" type="submit">Save endpoint</button>
      </form>
      <p class="form-note">Release builds must use HTTPS and must not use test auth/debug endpoints.</p>
    </section>
  `;
}

function metricCard(label, value, hint) {
  return `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></article>`;
}

function riskCard(label, value) {
  const numeric = number(value);
  return `<article class="${numeric ? "risk" : "ok"}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></article>`;
}

function issueCount(source) {
  return source?.needsReviewCount || source?.openTasks || source?.issues?.length || source?.summary?.needsReviewCount || 0;
}

function sectionTitle(title, subtitle) {
  return `<div class="section-head"><div><span class="eyebrow">${escapeHtml(subtitle)}</span><h2>${escapeHtml(title)}</h2></div></div>`;
}

function formCard(title, formName, fields) {
  const disabled = canMutate() ? "" : "disabled";
  return `
    <details class="workflow-card">
      <summary>${escapeHtml(title)}</summary>
      <form class="form-stack" data-form="${escapeAttr(formName)}">
        ${fields}
        <button class="primary full" type="submit" ${disabled}>Submit to backend</button>
      </form>
    </details>
  `;
}

function selectField(name, label, records, preferredKey) {
  const options = records.length
    ? records.map((record) => `<option value="${escapeAttr(record.id)}">${escapeHtml(record[preferredKey] || record.number || record.reference || record.id)}</option>`).join("")
    : `<option value="">No records loaded</option>`;
  return `<label>${escapeHtml(label)}<select name="${escapeAttr(name)}" required>${options}</select></label>`;
}

function partyList(records, empty) {
  if (!records.length) return `<div class="empty-state">${escapeHtml(empty)}</div>`;
  return `<div class="record-list">${records.slice(0, 20).map((record) => `
    <article class="record-row">
      <div><strong>${escapeHtml(record.name || record.businessName || record.partyName || "Unnamed")}</strong><span>${escapeHtml(maskTax(record.gstin || record.pan || record.taxId || ""))}</span></div>
      <small>${escapeHtml(record.email || record.phone || "")}</small>
    </article>
  `).join("")}</div>`;
}

function recordList(records, empty) {
  if (!records?.length) return `<div class="empty-state">${escapeHtml(empty)}</div>`;
  return `<div class="record-list">${records.slice(0, 20).map((record) => {
    const title = record.invoiceNumber || record.billNumber || record.creditNoteNumber || record.vendorCreditNumber || record.poNumber || record.accountName || record.name || record.id || "Record";
    const amount = record.total || record.amount || record.balanceAmount || record.outstandingAmount || record.bookBalance || 0;
    const status = record.status || record.paymentStatus || record.reconciliationStatus || "";
    return `
      <article class="record-row">
        <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(record.customerName || record.vendorName || record.billToName || record.description || record.reason || "")}</span></div>
        <div class="row-end"><strong>${escapeHtml(money(amount, record.currency || "INR"))}</strong><small>${escapeHtml(titleCase(status))}</small></div>
      </article>
    `;
  }).join("")}</div>`;
}

function bankList() {
  const accounts = state.data.bankAccounts || [];
  if (!accounts.length) return `<div class="empty-state">No bank or cash accounts returned. Statement import and detailed matching remain Web-preferred for this release.</div>`;
  return `<div class="record-list">${accounts.map((account) => `
    <article class="record-row">
      <div><strong>${escapeHtml(account.displayName || account.accountName || "Bank Account")}</strong><span>${escapeHtml(maskBank(account.accountReference || account.maskedReference || ""))}</span></div>
      <div class="row-end"><strong>${escapeHtml(money(account.bookBalance || account.balance || 0, account.currency || "INR"))}</strong><small>${escapeHtml(titleCase(account.reconciliationStatus || "review"))}</small></div>
    </article>
  `).join("")}</div>`;
}

function jsonSummary(source, keys) {
  if (!source) return `<div class="empty-state">No backend data returned for this view yet.</div>`;
  const rows = keys.map((key) => {
    const value = source[key] ?? source.summary?.[key] ?? source.totals?.[key];
    if (value === undefined) return "";
    const rendered = typeof value === "number" && !/count|days|ready/i.test(key) ? money(value) : String(value);
    return `<article><span>${escapeHtml(titleCase(key))}</span><strong>${escapeHtml(rendered)}</strong></article>`;
  }).filter(Boolean);
  return rows.length ? `<div class="status-grid">${rows.join("")}</div>` : `<pre class="json-card">${escapeHtml(JSON.stringify(source, null, 2).slice(0, 1200))}</pre>`;
}

function businessGovernance() {
  const email = state.data.settings?.emailSettings || {};
  const payment = state.data.settings?.paymentSettings || {};
  return `
    <div class="status-grid">
      <article><span>Team Members</span><strong>${state.data.team.length}</strong></article>
      <article><span>SMTP</span><strong>${email.smtpHost ? "Configured" : "Not configured"}</strong></article>
      <article><span>Razorpay</span><strong>${payment.status || (payment.keyId ? "Configured" : "Not configured")}</strong></article>
      <article><span>API Keys</span><strong>Web preferred</strong></article>
    </div>
    <p class="form-note">Raw API-key creation and secret editing are intentionally Web-preferred on Android.</p>
  `;
}

function maskTax(value) {
  const raw = String(value || "").replace(/\s+/g, "");
  if (raw.length <= 6) return raw;
  return `${raw.slice(0, 2)}${"*".repeat(Math.max(4, raw.length - 6))}${raw.slice(-4)}`;
}

function maskBank(value) {
  const raw = String(value || "").replace(/\s+/g, "");
  if (!raw) return "";
  if (raw.length <= 4) return `••${raw}`;
  return `•••• ${raw.slice(-4)}`;
}

function shareDocument(kind, id) {
  const source = kind === "po" ? state.data.purchaseOrders : state.data.invoices;
  const record = source.find((entry) => entry.id === id);
  if (!record) {
    setStatus("Document not loaded.", "error");
    return;
  }
  const label = record.invoiceNumber || record.poNumber || record.number || "EazInvoice document";
  const body = `${label} - ${money(record.total || record.amount || 0, record.currency || "INR")}`;
  if (navigator.share) {
    void navigator.share({ title: label, text: body }).catch(() => {});
  } else {
    setStatus("Android share sheet is unavailable in this browser context.");
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

void boot();
