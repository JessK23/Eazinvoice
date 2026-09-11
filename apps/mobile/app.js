const SESSION_KEY = "eazinvoice_mobile_session_v3";
const SETTINGS_KEY = "eazinvoice_mobile_settings_v3";
const DEFAULT_PRODUCTION_API = "https://www.eazinvoice.com";
const OTP_IDLE_LABEL = "Request OTP";
const OTP_SENT_LABEL = "Sent Successfully";
const OTP_CODE_LENGTH = 6;
const DEFAULT_OTP_EXPIRES_SECONDS = 90;
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
  unsavedForm: false,
  authMode: "login",
  reportFinancialYear: "",
  aiConversation: [],
  aiRobotState: "idle",
  data: emptyData(),
};

const dom = {};
let otpExpiryTimer = null;
let otpExpiresAt = 0;

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
    location.protocol === "capacitor:";
  if (isNativeRuntime) return DEFAULT_PRODUCTION_API;
  if (location.protocol === "http:" && location.hostname) {
    return `${location.protocol}//${location.hostname}:3001`;
  }
  return location.origin && location.origin !== "null" ? location.origin : DEFAULT_PRODUCTION_API;
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ apiBase: state.apiBase }));
}

function normalizeApiBase(value) {
  const text = String(value || "").trim().replace(/\/+$/, "");
  return text || DEFAULT_PRODUCTION_API;
}

function isReleaseUnsafeApiBase(value) {
  const base = normalizeApiBase(value);
  try {
    return new URL(base).protocol === "http:";
  } catch {
    return false;
  }
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

function normalizedOtpExpirySeconds(expiresInSeconds) {
  const parsed = Number(expiresInSeconds);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_OTP_EXPIRES_SECONDS;
}

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function stopOtpTimer() {
  if (otpExpiryTimer) window.clearInterval(otpExpiryTimer);
  otpExpiryTimer = null;
}

function updateOtpExpiry() {
  const otpExpiry = document.getElementById("otpExpiry");
  const otpMeta = document.getElementById("otpMeta");
  if (!otpExpiry || !otpExpiresAt) return;
  const remaining = otpExpiresAt - Date.now();
  otpExpiry.textContent = remaining > 0
    ? `OTP expires in ${formatRemaining(remaining)}`
    : "OTP expired. Request a fresh code.";
  if (otpMeta) otpMeta.hidden = false;
  const requestButton = document.getElementById("otpRequestButton");
  if (!requestButton) return;
  if (remaining > 0) {
    requestButton.disabled = true;
    requestButton.textContent = OTP_SENT_LABEL;
    requestButton.classList.add("success");
  } else {
    requestButton.disabled = false;
    requestButton.textContent = OTP_IDLE_LABEL;
    requestButton.classList.remove("success");
  }
}

function startOtpTimer(expiresInSeconds = DEFAULT_OTP_EXPIRES_SECONDS) {
  stopOtpTimer();
  otpExpiresAt = Date.now() + normalizedOtpExpirySeconds(expiresInSeconds) * 1000;
  updateOtpExpiry();
  otpExpiryTimer = window.setInterval(updateOtpExpiry, 1000);
}

function resetOtpTimer() {
  stopOtpTimer();
  otpExpiresAt = 0;
  const otpMeta = document.getElementById("otpMeta");
  const requestButton = document.getElementById("otpRequestButton");
  if (otpMeta) otpMeta.hidden = true;
  if (requestButton) {
    requestButton.disabled = false;
    requestButton.textContent = OTP_IDLE_LABEL;
    requestButton.classList.remove("success");
  }
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
  constructor(message, status, payload, path = "") {
    super(message);
    this.name = "MobileApiError";
    this.status = status;
    this.payload = payload;
    this.path = path;
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
        throw new MobileApiError(payload.error || payload.message || statusMessage(response.status), response.status, payload, path);
      }
      return payload;
    } catch (error) {
      if (error.name === "AbortError") throw new MobileApiError("The request timed out. Check connectivity and retry.", 408, {}, path);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  },
  requestOtp(email, mode = "login") {
    return this.request("/auth/email-otp/request", { method: "POST", body: { email, mode, client: "mobile" } });
  },
  signup(name, email, password, phone, otp) {
    return this.request("/auth/signup", { method: "POST", body: { name, email, password, phone, otp, subscriberType: "individual" } });
  },
  login(email, password, otp) {
    return this.request("/auth/login", { method: "POST", body: { email, password, otp } });
  },
  resetPassword(email, otp, newPassword) {
    return this.request("/auth/password-reset", { method: "POST", body: { email, otp, newPassword } });
  },
  aiAgent(command) {
    return this.request("/ai-agent/command", { method: "POST", body: { command, ...workspaceParams() } });
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
  finalizeInvoice(invoiceId, body) {
    return this.request(`/invoices/${encodeURIComponent(invoiceId)}/finalize`, { method: "POST", body });
  },
  archiveInvoice(invoiceId, body) {
    return this.request(`/invoices/${encodeURIComponent(invoiceId)}/archive`, { method: "POST", body });
  },
  restoreInvoice(invoiceId, body) {
    return this.request(`/invoices/${encodeURIComponent(invoiceId)}/restore`, { method: "POST", body });
  },
  whatsappInvoice(invoiceId, body) {
    return this.request(`/invoices/${encodeURIComponent(invoiceId)}/whatsapp`, { method: "POST", body });
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
  issuePurchaseOrder(poId, body) {
    return this.request(`/purchase-orders/${encodeURIComponent(poId)}/issue`, { method: "POST", body });
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
      if (["/auth/login", "/auth/signup"].includes(error.path)) return error.message;
      void logout(false);
      return "Your session expired. Please sign in again.";
    }
    return error.message;
  }
  return error?.message || "Something went wrong.";
}

function isUnauthorizedError(error) {
  return error instanceof MobileApiError && error.status === 401;
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

function normalizedAuthMode(mode) {
  return ["signup", "reset"].includes(mode) ? mode : "login";
}

function setAuthMode(mode) {
  const nextMode = normalizedAuthMode(mode);
  if (state.authMode === nextMode) return;
  state.authMode = nextMode;
  resetOtpTimer();
  state.lastError = "";
  setStatus("");
  render();
}

async function boot() {
  cacheDom();
  bindEvents();
  state.apiBase = normalizeApiBase(state.apiBase);
  dom.apiBase.value = state.apiBase;
  await restoreSession();
  state.booted = true;
  if (state.token) {
    const refreshed = await refreshSessionAndData({ quietUnauthorized: true });
    if (!refreshed) {
      setStatus("");
      render();
    }
  } else {
    render();
  }
}

async function refreshSessionAndData({ quietUnauthorized = false } = {}) {
  if (quietUnauthorized) {
    setStatus("Syncing workspace...");
    renderChrome();
    try {
      state.user = await api.me();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await logout(false);
        return false;
      }
      state.user = state.user || null;
    }
    try {
      await hydrateWorkspaceData();
      return true;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await logout(false);
        return false;
      }
      state.lastError = mapError(error);
      setStatus(state.lastError, "error");
      return false;
    }
  }
  await withBusy(async () => {
    state.user = await api.me().catch(() => state.user);
    await hydrateWorkspaceData();
  }, "Syncing workspace...");
  return true;
}

async function hydrateWorkspaceData() {
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
}

async function refreshBusinessData() {
  if (!state.token || !state.activeWorkspace) return;
  const epoch = ++state.requestEpoch;
  const params = workspaceParams(state.reportFinancialYear ? { financialYear: state.reportFinancialYear } : {});
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
  document.body.addEventListener("input", (event) => {
    if (event.target?.id === "otp") {
      event.target.value = event.target.value.replace(/\D/g, "").slice(0, OTP_CODE_LENGTH);
    }
    if (event.target?.id === "email") resetOtpTimer();
  });
  dom.bottomNav?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-route]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    routeTo(button.dataset.route);
  });
  document.body.addEventListener("click", (event) => {
    if (event.target.closest("#otpRequestButton")) {
      event.preventDefault();
      void requestOtp();
      return;
    }
    const authModeButton = event.target.closest("[data-auth-mode]");
    if (authModeButton) {
      event.preventDefault();
      setAuthMode(authModeButton.dataset.authMode);
      return;
    }
    if (event.target.closest("#authSubmitButton")) {
      event.preventDefault();
      void submitAuth();
      return;
    }
    const routeButton = event.target.closest("[data-route]");
    const action = event.target.closest("[data-action]");
    const promptButton = event.target.closest("[data-agent-prompt]");
    if (promptButton) {
      const input = document.querySelector('[data-form="ai-agent"] input[name="command"]');
      if (input) input.value = promptButton.dataset.agentPrompt || "";
      if (input) input.form.requestSubmit();
      return;
    }
    const addItem = event.target.closest("[data-add-item]");
    if (addItem) {
      event.preventDefault();
      const editor = addItem.closest("[data-item-editor]");
      if (editor) editor.insertAdjacentHTML("beforeend", itemRowMarkup());
      return;
    }
    if (routeButton) {
      routeTo(routeButton.dataset.route);
    }
    if (action) void handleAction(action.dataset.action, action.dataset);
  });
  document.body.addEventListener("submit", (event) => {
    if (event.target.closest("#authForm")) {
      event.preventDefault();
      void submitAuth();
      return;
    }
    const form = event.target.closest("[data-form]");
    if (!form) return;
    event.preventDefault();
    void handleForm(form.dataset.form, form);
  });
  document.body.addEventListener("input", (event) => {
    if (event.target?.closest("[data-form]")) state.unsavedForm = true;
  });
  document.body.addEventListener("change", (event) => {
    if (event.target?.matches("[data-report-period]")) {
      state.reportFinancialYear = event.target.value;
      void refreshBusinessData();
    }
    if (event.target?.closest("[data-form]")) state.unsavedForm = true;
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
    if (!confirmDiscardMobileChanges()) {
      history.pushState({ route: state.route }, "", `#${state.route}`);
      return;
    }
    state.unsavedForm = false;
    state.route = location.hash.replace("#", "") || "home";
    render();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.token) void refreshBusinessData();
  });
}

async function submitAuth() {
  if (state.authMode === "reset") {
    await resetPassword();
  } else if (state.authMode === "signup") {
    await signup();
  } else {
    await login();
  }
}

async function requestOtp() {
  state.lastError = "";
  setStatus("");
  const emailInput = document.getElementById("email");
  const email = emailInput?.value.trim() || "";
  if (!email) {
    setStatus("Enter your email address first.", "error");
    return;
  }
  const otpMode = state.authMode === "reset" ? "reset-password" : state.authMode === "signup" ? "signup" : "login";
  const otpLabel = otpMode === "reset-password" ? "Reset" : otpMode === "signup" ? "Signup" : "Login";
  await withBusy(async () => {
    const response = await api.requestOtp(email, otpMode);
    const otpInput = document.getElementById("otp");
    if (otpInput && response.devOtp) otpInput.value = response.devOtp;
    startOtpTimer(response.expiresInSeconds);
    setStatus(response.devOtp
      ? `${otpLabel} OTP sent to ${response.email}. Local test OTP: ${response.devOtp}`
      : `${otpLabel} OTP sent to ${response.email}. Enter the code you receive.`);
  }, `Requesting ${otpLabel}...`);
}

async function login() {
  state.lastError = "";
  setStatus("");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const otpInput = document.getElementById("otp");
  const email = emailInput?.value.trim() || "";
  const password = passwordInput?.value || "";
  const otp = otpInput?.value.trim() || "";
  if (!email || !password || !otp) {
    setStatus("Enter email, password, and OTP.", "error");
    return;
  }
  await withBusy(async () => {
    const payload = await api.login(email, password, otp);
    state.token = payload.token || payload.session?.token || "";
    state.user = payload.user || null;
    if (!state.token) throw new MobileApiError("Login succeeded but no session token was returned.", 500, payload);
    await saveSession();
    resetOtpTimer();
    await refreshSessionAndData();
    setStatus("Signed in.");
  }, "Signing in...");
}

async function signup() {
  state.lastError = "";
  setStatus("");
  const name = document.getElementById("name")?.value.trim() || "";
  const email = document.getElementById("email")?.value.trim() || "";
  const phone = document.getElementById("phone")?.value.trim() || "";
  const password = document.getElementById("password")?.value || "";
  const otp = document.getElementById("otp")?.value.trim() || "";
  if (!name || !email || !phone || !password || !otp) {
    setStatus("Enter your name, email, mobile number, password, and OTP.", "error");
    return;
  }
  await withBusy(async () => {
    const payload = await api.signup(name, email, password, phone, otp);
    state.token = payload.token || "";
    state.user = payload.user || null;
    if (!state.token) throw new MobileApiError("Signup succeeded but no session token was returned.", 500, payload);
    await saveSession();
    resetOtpTimer();
    await refreshSessionAndData();
    setStatus("Account created. Signed in.", "success");
  }, "Creating account...");
}

async function resetPassword() {
  state.lastError = "";
  setStatus("");
  const emailInput = document.getElementById("email");
  const otpInput = document.getElementById("otp");
  const newPasswordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirmPassword");
  const email = emailInput?.value.trim() || "";
  const otp = otpInput?.value.trim() || "";
  const newPassword = newPasswordInput?.value || "";
  const confirmPassword = confirmPasswordInput?.value || "";
  if (!email || !otp || !newPassword || !confirmPassword) {
    setStatus("Enter email, reset OTP, and your new password.", "error");
    return;
  }
  if (newPassword !== confirmPassword) {
    setStatus("New password and confirmation do not match.", "error");
    return;
  }
  if ((newPassword ?? "").trim().length < 8) {
    setStatus("Use at least 8 characters for your new password.", "error");
    return;
  }
  const result = await withBusy(async () => {
    await api.resetPassword(email, otp, newPassword);
    resetOtpTimer();
    return true;
  }, "Resetting password...");
  if (result) {
    if (otpInput) otpInput.value = "";
    if (confirmPasswordInput) confirmPasswordInput.value = "";
    setAuthMode("login");
    setStatus("Password reset. Request a login OTP and sign in with your new password.", "success");
  }
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

function confirmDiscardMobileChanges() {
  if (!state.unsavedForm) return true;
  return window.confirm("Discard unsaved changes?\n\nYou have unsaved changes. Going back will discard them.");
}

function routeTo(route, { replace = false } = {}) {
  if (!route || route === state.route) return;
  if (!confirmDiscardMobileChanges()) return;
  state.unsavedForm = false;
  state.route = route;
  if (replace) history.replaceState({ route }, "", `#${route}`);
  else history.pushState({ route }, "", `#${route}`);
  render();
}

function replaceRecord(records, updated) {
  if (!Array.isArray(records) || !updated?.id) return;
  const index = records.findIndex((entry) => entry.id === updated.id);
  if (index >= 0) records[index] = updated;
  else records.unshift(updated);
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
  if (action === "finalize-invoice") {
    await withBusy(async () => {
      const invoice = await api.finalizeInvoice(dataset.id, { ...workspaceParams(), idempotencyKey: `mobile-finalize-${dataset.id}` });
      replaceRecord(state.data.invoices, invoice);
      render();
      setStatus(`Invoice ${invoice.invoiceNumber || invoice.id} created successfully.`);
    }, "Finalizing invoice...");
    return;
  }
  if (action === "archive-invoice") {
    if (!window.confirm("Move invoice to Inactive?\n\nThis invoice will be removed from your active invoice list but will remain retained for accounting, audit and reporting purposes.")) return;
    await withBusy(async () => {
      const invoice = await api.archiveInvoice(dataset.id, workspaceParams());
      replaceRecord(state.data.invoices, invoice);
      render();
      setStatus("Invoice moved to Inactive.");
    }, "Archiving invoice...");
    return;
  }
  if (action === "restore-invoice") {
    await withBusy(async () => {
      const invoice = await api.restoreInvoice(dataset.id, workspaceParams());
      replaceRecord(state.data.invoices, invoice);
      render();
      setStatus("Invoice restored to Active.");
    }, "Restoring invoice...");
    return;
  }
  if (action === "whatsapp-invoice") {
    await withBusy(async () => {
      const result = await api.whatsappInvoice(dataset.id, workspaceParams());
      if (navigator.clipboard && result.shareText) await navigator.clipboard.writeText(result.shareText).catch(() => {});
      setStatus(result.message || "WhatsApp sharing is ready for this saved invoice.");
    }, "Checking WhatsApp access...");
    return;
  }
  if (action === "issue-po") {
    await withBusy(async () => {
      const record = await api.issuePurchaseOrder(dataset.id, { ...workspaceParams(), idempotencyKey: `mobile-issue-${dataset.id}` });
      replaceRecord(state.data.purchaseOrders, record);
      render();
      setStatus(`${String(record.documentType || "po").toLowerCase() === "wo" ? "Work Order" : "Purchase Order"} ${record.poNumber || record.id} issued successfully.`);
    }, "Issuing PO/WO...");
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
    state.unsavedForm = false;
    await refreshBusinessData();
    setStatus(label || "Saved.");
    return result;
  }, "Sending to EazInvoice...");

  if (name === "customer") {
    await run(() => api.createCustomer({ ...workspaceParams(), name: value("name"), email: value("email"), gstin: value("gstin") }), "Customer saved.");
  } else if (name === "vendor") {
    await run(() => api.createVendor({ ...workspaceParams(), name: value("name"), email: value("email"), gstin: value("gstin") }), "Vendor saved.");
  } else if (name === "invoice") {
    const items = documentItems(data);
    await run(() => api.createInvoice({
      ...workspaceParams(),
      customerName: value("customerName"),
      billToName: value("customerName"),
      invoiceDate: value("invoiceDate") || today(),
      dueDate: value("dueDate") || value("invoiceDate") || today(),
      status: value("status") || "draft",
      currency: "INR",
      items,
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
    const items = documentItems(data);
    await run(() => api.createPurchaseOrder({
      ...workspaceParams(),
      vendorName: value("vendorName"),
      billToName: value("vendorName"),
      poDate: value("poDate") || today(),
      status: "draft",
      currency: "INR",
      items,
      idempotencyKey: idempotencyKey("purchase-order"),
    }), "PO draft saved. Issue it when ready; it has no accounting impact.");
  } else if (name === "work-order") {
    const items = documentItems(data);
    await run(() => api.createPurchaseOrder({
      ...workspaceParams(),
      documentType: "wo",
      vendorName: value("vendorName"),
      billToName: value("vendorName"),
      poDate: value("poDate") || today(),
      status: "draft",
      currency: "INR",
      items,
      idempotencyKey: idempotencyKey("work-order"),
    }), "Work order draft saved. Issue it when ready; it has no accounting impact.");
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
  } else if (name === "ai-agent") {
    const command = value("command");
    if (!command) {
      setStatus("Ask a business question first.", "error");
      return;
    }
    state.aiRobotState = "thinking";
    state.aiConversation.push({ role: "user", text: command });
    render();
    await withBusy(async () => {
      try {
        const result = await api.aiAgent(command);
        state.aiConversation.push({ role: "agent", result });
        state.aiRobotState = "success";
        setStatus("Insight ready.");
      } catch (error) {
        state.aiConversation.push({ role: "error", text: error.message || "The Agent could not complete that request." });
        state.aiRobotState = "error";
        setStatus("The Agent could not complete that request.", "error");
      }
      render();
    }, "Analysing your business data...");
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
    agent: renderAgent,
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
  dom.profileName.textContent = state.user?.name || state.user?.email || "";
  dom.profileMeta.textContent = state.activeWorkspace ? `${workspaceName(state.activeWorkspace)} - ${titleCase(currentRole())}` : "";
  dom.apiBase.value = state.apiBase;
  dom.logoutButton.hidden = !state.token;
  dom.refreshButton.hidden = !state.token;
  dom.workspaceSelect.hidden = !state.token || state.workspaces.length <= 1;
  dom.bottomNav.hidden = !state.token;
  document.getElementById("topAppBar")?.toggleAttribute("hidden", !state.token);
  document.getElementById("workspaceBar")?.toggleAttribute("hidden", !state.token);
  dom.apiBaseForm.hidden = true;
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
    agent: "AI Agent",
  }[route] || "Home";
}

function workspaceName(workspace) {
  return text(workspace.businessName || workspace.name || workspace.companyName || workspace.label, "Business Workspace");
}

function renderLogin() {
  const resetMode = state.authMode === "reset";
  const signupMode = state.authMode === "signup";
  const eyebrow = resetMode ? "Account recovery" : signupMode ? "Create account" : "Secure sign in";
  const heading = resetMode ? "Reset your password" : signupMode ? "Create your EazInvoice account" : "Sign in to EazInvoice";
  const description = resetMode
    ? "Request a reset OTP for your registered business email, verify it, then set a new password before signing in."
    : signupMode ? "Create an account with email verification to access your EazInvoice workspace."
      : "Use your email OTP and password to access your EazInvoice workspace.";
  const otpLabel = resetMode ? "Reset OTP" : signupMode ? "Signup OTP" : "Login OTP";
  const otpPlaceholder = resetMode ? "Enter reset OTP" : signupMode ? "Enter signup OTP" : "Enter login OTP";
  const otpButtonLabel = resetMode ? "Request reset OTP" : signupMode ? "Request signup OTP" : "Request OTP";
  const submitLabel = resetMode ? "Reset password" : signupMode ? "Create account" : "Sign in";
  const note = resetMode
    ? "After resetting, switch back to Sign in, request a login OTP, and use your new password."
    : "OTP verification protects your account. Do not share your code.";
  return `
    <section class="panel auth-panel">
      <span class="eyebrow">${eyebrow}</span>
      <h1>${heading}</h1>
      <p>${description}</p>
      <div class="auth-mode-toggle" role="tablist" aria-label="Authentication options">
        <button type="button" data-auth-mode="login" class="${!resetMode && !signupMode ? "active" : ""}" aria-pressed="${!resetMode && !signupMode ? "true" : "false"}">Sign in</button>
        <button type="button" data-auth-mode="signup" class="${signupMode ? "active" : ""}" aria-pressed="${signupMode ? "true" : "false"}">Sign up</button>
        <button type="button" data-auth-mode="reset" class="${resetMode ? "active" : ""}" aria-pressed="${resetMode ? "true" : "false"}">Forgot password?</button>
      </div>
      <form id="authForm" class="form-stack" data-auth-mode="${resetMode ? "reset" : signupMode ? "signup" : "login"}">
        <label>Email<input id="email" type="email" autocomplete="email" placeholder="owner@example.com" required /></label>
        ${signupMode ? `
          <label>Name<input id="name" autocomplete="name" placeholder="Your name" required /></label>
          <label>Mobile number<input id="phone" inputmode="tel" autocomplete="tel" placeholder="10-digit mobile number" required /></label>
          <label>${otpLabel}<input id="otp" inputmode="numeric" autocomplete="one-time-code" placeholder="Enter signup OTP" /></label>
          <label>Password<input id="password" type="password" autocomplete="new-password" placeholder="Create password" required /></label>
        ` : resetMode ? `
          <label>${otpLabel}<input id="otp" inputmode="numeric" autocomplete="one-time-code" placeholder="${otpPlaceholder}" /></label>
          <label>New password<input id="password" type="password" autocomplete="new-password" placeholder="Create new password" required /></label>
          <label>Confirm new password<input id="confirmPassword" type="password" autocomplete="new-password" placeholder="Repeat new password" required /></label>
        ` : `
          <label>Password<input id="password" type="password" autocomplete="current-password" placeholder="Enter password" required /></label>
          <label>${otpLabel}<input id="otp" inputmode="numeric" autocomplete="one-time-code" placeholder="${otpPlaceholder}" /></label>
        `}
        <div id="otpMeta" class="otp-meta" hidden>
          <span id="otpExpiry">OTP expires in 1:30</span>
        </div>
        <div class="button-row">
          <button id="otpRequestButton" class="secondary" type="button">${otpButtonLabel}</button>
          <button id="authSubmitButton" class="primary" type="submit">${submitLabel}</button>
        </div>
        <p class="form-note">${note}</p>
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
    <section class="dashboard-greeting">
      <span class="eyebrow">${escapeHtml(workspaceName(state.activeWorkspace))}</span>
      <h1>Hello${state.user?.name ? `, ${escapeHtml(state.user.name)}` : ""}</h1>
      <p>Your business at a glance</p>
    </section>
    <section class="dashboard-primary" aria-label="Primary financial summary">
      ${financialCard("sales", "↗", "Total sales", money(revenue), "From backend report")}
      ${financialCard("receivables", "◎", "Outstanding receivables", money(receivables), `${state.data.invoices.length} invoices`)}
      ${financialCard("payables", "↓", "Outstanding payables", money(payables), `${state.data.vendorBills.length} bills`)}
    </section>
    <section class="panel">
      <div class="section-head"><div><span class="eyebrow">Business pulse</span><h2>More financials</h2></div></div>
      <div class="secondary-metrics">
        ${metricCard("Expenses", money(expenses), "Backend report")}
        ${metricCard("Profit/Loss", money(profit), "Current view")}
        ${metricCard("Bank/Cash", money(bank), `${state.data.bankAccounts.length} accounts`)}
      </div>
    </section>
    <section class="panel">
      <div class="section-head"><div><span class="eyebrow">Next steps</span><h2>Quick actions</h2></div><span class="pill">${canMutate() ? "Enabled" : "Read-only"}</span></div>
      <div class="action-grid">
        ${actionTile("▣", "New invoice", "sales", "primary")}
        ${actionTile("₹", "Receivables", "money")}
        ${actionTile("▤", "Purchase order", "purchases")}
        ${actionTile("♙", "Customers", "sales")}
        ${actionTile("♧", "Vendors", "purchases")}
        ${actionTile("▥", "Reports", "reports")}
        ${actionTile("⌁", "Banking", "money")}
        ${actionTile("⋯", "More", "more")}
      </div>
    </section>
    <section class="panel attention-panel">
      <div class="section-head"><div><span class="eyebrow">Review</span><h2>Needs attention</h2></div><button class="tiny" type="button" data-route="reports">Review</button></div>
      <div class="status-grid">
        ${riskCard("Overdue receivables", state.data.receivables?.overdueTotal || state.data.receivables?.summary?.overdueTotal || 0)}
        ${riskCard("Payables due", state.data.payables?.dueTotal || state.data.payables?.summary?.dueTotal || 0)}
        ${riskCard("GST/TDS issues", issueCount(state.data.compliance || state.data.gst || state.data.tds))}
        ${riskCard("Unreconciled bank", state.data.bankSummary?.unmatchedCount || state.data.bankSummary?.summary?.unmatchedCount || 0)}
      </div>
    </section>
    <section class="panel">
      <div class="section-head compact"><div><span class="eyebrow">Live API</span><h2>Recent activity</h2></div><button class="tiny" type="button" data-route="sales">View all</button></div>
      ${activityList([...state.data.invoices, ...state.data.vendorBills, ...state.data.creditNotes].slice(0, 8), "No recent records yet.")}
    </section>
  `;
}

function financialCard(kind, icon, label, value, hint) {
  return `<article class="financial-card ${kind}"><span class="metric-icon" aria-hidden="true">${icon}</span><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></div></article>`;
}

function actionTile(icon, label, route, tone = "") {
  return `<button class="action-tile ${tone}" type="button" data-route="${escapeAttr(route)}"><span class="metric-icon" aria-hidden="true">${icon}</span><span>${escapeHtml(label)}</span></button>`;
}

function activityList(records, empty) {
  if (!records?.length) return `<div class="empty-state">${escapeHtml(empty)}</div>`;
  return `<div class="activity-list">${records.map((record) => {
    const title = record.invoiceNumber || record.billNumber || record.creditNoteNumber || record.vendorCreditNumber || record.poNumber || record.id || "Record";
    const amount = record.total || record.amount || record.balanceAmount || record.outstandingAmount || 0;
    const status = String(record.status || record.paymentStatus || record.reconciliationStatus || "Review");
    const normalized = status.toLowerCase();
    const kind = record.vendorName || record.billNumber ? "▤" : record.creditNoteNumber ? "↺" : "▣";
    const badgeClass = /paid|finalized|issued/.test(normalized) ? "paid" : /overdue|review|due/.test(normalized) ? "review" : /archived/.test(normalized) ? "archived" : "";
    return `<article class="activity-row"><span class="activity-icon" aria-hidden="true">${kind}</span><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(record.customerName || record.vendorName || record.description || "Financial record")}</span></div><div class="activity-amount"><strong>${escapeHtml(money(amount, record.currency || "INR"))}</strong><small class="status-badge ${badgeClass}">${escapeHtml(titleCase(status))}</small></div></article>`;
  }).join("")}</div>`;
}

function renderSales() {
  return `
    <section class="document-header"><button class="tiny" type="button" data-route="home">← Back</button><div><span class="eyebrow">Sales</span><h1>New Invoice</h1></div><span class="status-badge">Draft</span></section>
    <section class="panel document-card">
      <form class="form-stack" data-form="invoice">
        <div class="section-head compact"><div><span class="eyebrow">Document details</span><h2>Customer and dates</h2></div></div>
        <label>Customer<input name="customerName" required placeholder="Customer or business name" /></label>
        <div class="split"><label>Invoice date<input name="invoiceDate" type="date" value="${today()}" /></label><label>Due date<input name="dueDate" type="date" /></label></div>
        <div class="section-head compact"><div><span class="eyebrow">Line items</span><h2>What are you billing?</h2></div></div>
        <div class="item-editor" data-item-editor>${itemRowMarkup()}</div>
        <button class="secondary full" type="button" data-add-item>Add item</button>
        <div class="totals-card"><span>Totals calculated by EazInvoice</span><strong>Server-authoritative after save</strong><small>GST and final numbering are applied by the backend.</small></div>
        <label>Status<select name="status"><option value="draft">Save Draft</option><option value="issued">Issue Invoice</option><option value="created">Create</option></select></label>
        <button class="primary full" type="submit">Save Draft / Create Invoice</button>
      </form>
    </section>
    <section class="panel"><div class="section-head compact"><div><span class="eyebrow">Saved work</span><h2>Invoices</h2></div></div>${recordList(state.data.invoices, "No invoices yet.")}</section>
    <details class="workflow-card"><summary>Payments, credits and refunds</summary><div class="tabs-panel">
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
    </div></details>
    <section class="panel">${sectionTitle("Customers", "Outstanding and GST posture")}${partyList(state.data.customers, "No customers from API yet.")}</section>
  `;
}

function renderPurchases() {
  return `
    <section class="document-header"><button class="tiny" type="button" data-route="home">← Back</button><div><span class="eyebrow">Purchases</span><h1>New Purchase Order</h1></div><span class="status-badge">Draft</span></section>
    <section class="notice-panel">A Purchase Order records intention only. A vendor bill records the accounting liability.</section>
    <section class="panel document-card">
      <form class="form-stack" data-form="purchase-order">
        <div class="section-head compact"><div><span class="eyebrow">Document details</span><h2>Vendor and dates</h2></div></div>
        <label>Vendor<input name="vendorName" required placeholder="Vendor name" /></label>
        <div class="split"><label>PO date<input name="poDate" type="date" value="${today()}" /></label><label>Expected date<input name="expectedDate" type="date" /></label></div>
        <div class="section-head compact"><div><span class="eyebrow">Line items</span><h2>What are you ordering?</h2></div></div>
        <div class="item-editor" data-item-editor>${itemRowMarkup()}</div>
        <button class="secondary full" type="button" data-add-item>Add item</button>
        <div class="totals-card"><span>Purchase order total</span><strong>Calculated by EazInvoice</strong><small>Issuing a PO does not create a payable journal.</small></div>
        <button class="primary full" type="submit">Save PO Draft</button>
      </form>
    </section>
    <section class="panel"><div class="section-head compact"><div><span class="eyebrow">Saved work</span><h2>Purchase Orders</h2></div></div>${recordList(state.data.purchaseOrders, "No purchase orders yet.")}</section>
    <section class="panel document-card">
      <div class="section-head compact"><div><span class="eyebrow">Operations</span><h2>New Work Order</h2></div><span class="status-badge">Non-accounting</span></div>
      <form class="form-stack" data-form="work-order">
        <label>Vendor / party<input name="vendorName" required placeholder="Customer, vendor or project party" /></label>
        <div class="split"><label>Work order date<input name="poDate" type="date" value="${today()}" /></label><label>Expected completion<input name="expectedDate" type="date" /></label></div>
        <label>Project / reference<input name="reference" placeholder="Optional project or reference" /></label>
        <div class="item-editor" data-item-editor>${itemRowMarkup()}</div>
        <button class="secondary full" type="button" data-add-item>Add work item</button>
        <label>Notes<textarea name="notes" rows="3" placeholder="Work description and notes"></textarea></label>
        <button class="primary full" type="submit">Save Work Order Draft</button>
      </form>
    </section>
    <details class="workflow-card"><summary>Vendor bills and supplier recovery</summary><div class="tabs-panel">
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
    </div></details>
    <section class="panel">${sectionTitle("Vendors", "Payable and supplier-credit posture")}${partyList(state.data.vendors, "No vendors from API yet.")}</section>
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
    <section class="report-header"><div><span class="eyebrow">Accounting</span><h1>Reports</h1><p>Summary-first financial review</p></div><label class="period-control">Financial year<select data-report-period>${periodOptions()}</select></label></section>
    <section class="report-card-grid">
      ${reportCard("Profit & Loss", "Revenue and net result", state.data.profitLoss, ["revenue", "netProfit", "profit"])}
      ${reportCard("Balance Sheet", "Assets, liabilities and equity", state.data.balanceSheet, ["assets", "liabilities", "equity"])}
      ${reportCard("Trial Balance", "Debit and credit control", state.data.trialBalance, ["debits", "credits", "difference"])}
      ${reportCard("Receivables", "Customer ageing", state.data.receivables, ["totalOutstanding", "overdueTotal"])}
      ${reportCard("Payables", "Vendor ageing", state.data.payables, ["totalOutstanding", "overdueTotal"])}
      ${reportCard("GST", "Prepared for review", state.data.gst, ["outputGst", "inputGst", "netGst"])}
    </section>
    <section class="panel report-detail">${sectionTitle("Profit & Loss", "Selected period")}${structuredReport(state.data.profitLoss, ["revenue", "income", "expenses", "netProfit", "profit", "grossProfit", "operatingProfit"])}</section>
    <section class="panel report-detail">${sectionTitle("Balance Sheet", "Derived from ledger")}${structuredReport(state.data.balanceSheet, ["assets", "liabilities", "equity", "isBalanced", "completenessStatus"])}</section>
    <section class="panel report-detail">${sectionTitle("Trial Balance", "Read-only mobile review")}${trialBalanceView(state.data.trialBalance)}</section>
    <section class="panel report-detail">${sectionTitle("General Ledger", "Detailed search remains Web-preferred")}${recordList(state.data.trialBalance?.accounts || state.data.trialBalance?.entries || [], "Open Web for detailed ledger drill-down.")}</section>
  `;
}

function renderMore() {
  return `
    <section class="panel agent-entry"><div class="section-head compact"><div><span class="eyebrow">Assistant</span><h2>EazInvoice AI Agent</h2></div><button class="primary compact" type="button" data-route="agent">Open Agent</button></div><p class="form-note">Your business assistant, always ready.</p></section>
    <section class="report-header"><div><span class="eyebrow">Review centre</span><h1>Compliance</h1><p>Prepared for review; not filed through EazInvoice.</p></div><label class="period-control">Financial year<select data-report-period>${periodOptions()}</select></label></section>
    <section class="compliance-grid">
      ${complianceCard("GST", state.data.gst, ["outputGst", "inputGst", "netGst", "needsReviewCount", "reconciliationStatus"])}
      ${complianceCard("TDS", state.data.tds, ["tdsPayable", "needsReviewCount", "transactionCount"])}
      ${complianceCard("Readiness", state.data.compliance, ["openTasks", "dueSoon", "overdue", "preparedCount"])}
    </section>
    <section class="panel compliance-note"><span class="status-badge review">Prepared / Not Filed</span><p>EazInvoice prepares and summarizes compliance data for review. Government returns are not filed through this mobile app.</p></section>
    <section class="panel">${sectionTitle("Accounting Periods", "Open, soft closed or closed")}${periodList(state.data.periods)}</section>
    <section class="panel">
      ${sectionTitle("Year-End", "Preview only on mobile")}
      ${jsonSummary(state.data.yearEnd, ["financialYear", "ready", "blockerCount", "retainedEarningsImpact", "status"])}
      <button class="secondary full" type="button" data-action="preview-year-end">Preview year-end impact</button>
    </section>
    <section class="panel">${sectionTitle("Business / Team", "Secrets stay Web-preferred")}${businessGovernance()}</section>
    <section class="panel account-deletion-card">
      ${sectionTitle("Account", "Access and privacy")}
      <p class="form-note">Request account deletion from your registered email. Financial, tax, payment and audit records may need to be retained.</p>
      <a class="secondary full action-link" href="https://www.eazinvoice.com/apps/web/delete-account.html">Review deletion options</a>
    </section>
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

function renderAgent() {
  const prompts = ["Show my sales summary for this month", "List my unpaid invoices", "Which are my top customers?", "What is my GST position?", "Give me insights to improve cash flow"];
  return `<section class="agent-header"><button class="tiny" type="button" data-route="home">← Back</button><div><span class="eyebrow">EazInvoice</span><h1>AI Agent</h1><p>Your business assistant, always ready.</p></div></section>
    <section class="agent-welcome"><div class="robot robot-${escapeAttr(state.aiRobotState)}" aria-hidden="true"><svg viewBox="0 0 120 120" role="presentation"><path class="robot-body" d="M28 48h64a10 10 0 0 1 10 10v36a10 10 0 0 1-10 10H28a10 10 0 0 1-10-10V58a10 10 0 0 1 10-10Z"/><rect class="robot-face" x="30" y="58" width="60" height="34" rx="10"/><circle class="robot-eye" cx="48" cy="75" r="4"/><circle class="robot-eye" cx="72" cy="75" r="4"/><path class="robot-mouth" d="M51 84c6 4 12 4 18 0"/><path class="robot-antenna" d="M60 48V31"/><circle class="robot-dot" cx="60" cy="25" r="6"/></svg></div><div><h2>${state.aiConversation.length ? "What would you like to explore next?" : "Hi! I’m your EazInvoice AI Agent."}</h2><p>${state.aiConversation.length ? "Ask another question about this business." : "How can I help you today?"}</p></div></section>
    <section class="agent-conversation">${state.aiConversation.map(agentMessage).join("")}</section>
    ${state.aiConversation.length ? "" : `<section class="prompt-grid">${prompts.map((prompt) => `<button class="secondary prompt-chip" type="button" data-agent-prompt="${escapeAttr(prompt)}">${escapeHtml(prompt)}</button>`).join("")}</section>`}
    <form class="agent-input" data-form="ai-agent"><input name="command" aria-label="Ask about your business" placeholder="Ask about your business…" autocomplete="off" required /><button class="primary" type="submit">Send</button></form>`;
}

function agentMessage(message) {
  if (message.role === "user") return `<div class="agent-message user-message"><span>You</span><p>${escapeHtml(message.text)}</p></div>`;
  if (message.role === "error") return `<div class="agent-message error-message"><span>Agent</span><p>${escapeHtml(message.text)}</p><button class="secondary" type="button" data-route="agent">Retry</button></div>`;
  const result = message.result || {};
  return `<div class="agent-message agent-answer"><span>Agent · ${escapeHtml(result.title || "Business insight")}</span><p>${escapeHtml(result.reply || result.summary || "Insight prepared from authorized EazInvoice data.")}</p>${(result.sections || []).map((section) => `<div class="answer-section"><strong>${escapeHtml(section.title || "Details")}</strong>${(section.items || []).map((item) => `<p>${escapeHtml(item)}</p>`).join("")}</div>`).join("")}<small>Facts, calculations and recommendations are based on authorized business context.</small></div>`;
}

function metricCard(label, value, hint) {
  return `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></article>`;
}

function periodOptions() {
  const selected = state.reportFinancialYear || currentFinancialYear();
  const years = [...new Set([selected, currentFinancialYear(), `${new Date().getFullYear() - 1}-${String(new Date().getFullYear()).slice(-2)}`])];
  return years.map((year) => `<option value="${escapeAttr(year)}" ${year === selected ? "selected" : ""}>${escapeHtml(year)}</option>`).join("");
}

function reportValue(source, key) {
  const value = source?.[key] ?? source?.summary?.[key] ?? source?.totals?.[key];
  return value === undefined ? null : value;
}

function reportCard(title, subtitle, source, keys) {
  const entries = keys.map((key) => [key, reportValue(source, key)]).filter(([, value]) => value !== null);
  return `<article class="report-summary-card"><span class="metric-icon" aria-hidden="true">▥</span><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p>${entries.slice(0, 2).map(([key, value]) => `<strong>${escapeHtml(typeof value === "number" ? money(value) : String(value))}</strong><small>${escapeHtml(titleCase(key))}</small>`).join("") || `<small>No data returned</small>`}</div></article>`;
}

function structuredReport(source, keys) {
  if (!source) return `<div class="empty-state">No backend data returned for this period.</div>`;
  const rows = keys.map((key) => {
    const value = reportValue(source, key);
    if (value === null) return "";
    const rendered = typeof value === "number" && !/count|days/i.test(key) ? money(value) : String(value);
    const tone = typeof value === "number" && value < 0 ? "negative" : "";
    return `<div class="report-row"><span>${escapeHtml(titleCase(key))}</span><strong class="${tone}">${escapeHtml(rendered)}</strong></div>`;
  }).filter(Boolean).join("");
  return rows || `<div class="empty-state">No summarized values returned for this period.</div>`;
}

function trialBalanceView(source) {
  const accounts = source?.accounts || source?.entries;
  if (!Array.isArray(accounts) || !accounts.length) return structuredReport(source, ["debits", "credits", "isBalanced", "difference"]);
  return `<div class="report-table" role="table"><div class="report-table-head"><span>Account</span><span>Debit</span><span>Credit</span></div>${accounts.slice(0, 25).map((account) => `<div class="report-table-row"><span>${escapeHtml(account.accountName || account.name || "Account")}</span><strong>${escapeHtml(money(account.debit || account.debits || 0))}</strong><strong>${escapeHtml(money(account.credit || account.credits || 0))}</strong></div>`).join("")}</div>`;
}

function complianceCard(title, source, keys) {
  return `<article class="compliance-card"><div class="section-head compact"><h2>${escapeHtml(title)}</h2><span class="status-badge review">Review</span></div>${structuredReport(source, keys)}</article>`;
}

function periodList(periods) {
  if (!periods?.length) return `<div class="empty-state">No accounting periods returned.</div>`;
  return `<div class="period-list">${periods.slice(0, 12).map((period) => { const status = String(period.status || "open"); const cls = status.toLowerCase().replace(/\s+/g, "-"); return `<div class="period-row"><div><strong>${escapeHtml(period.name || period.financialYear || period.period || "Accounting period")}</strong><small>${escapeHtml(period.financialYear || period.startDate || "")}</small></div><span class="status-badge ${cls}">${escapeHtml(titleCase(status))}</span></div>`; }).join("")}</div>`;
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

function itemRowMarkup() {
  return `<div class="item-row" data-item-row><label>Description<input name="description" required placeholder="Item or service" /></label><label>Qty<input name="quantity" type="number" min="0" step="0.01" value="1" /></label><label>Rate<input name="rate" type="number" min="0" step="0.01" required /></label><label>Tax %<input name="taxRate" type="number" min="0" step="0.01" value="18" /></label></div>`;
}

function documentItems(data) {
  const descriptions = data.getAll("description");
  const quantities = data.getAll("quantity");
  const rates = data.getAll("rate");
  const taxes = data.getAll("taxRate");
  return descriptions.map((description, index) => ({
    description: String(description || "").trim(),
    quantity: number(quantities[index]) || 1,
    rate: number(rates[index]),
    taxRate: number(taxes[index]),
  })).filter((item) => item.description);
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
    const normalizedStatus = String(status || "").toLowerCase();
    const documentType = String(record.documentType || "").toLowerCase();
    const isPurchaseOrder = Boolean(record.poNumber !== undefined || record.poDate || documentType === "po" || documentType === "wo");
    const isInvoice = !isPurchaseOrder && Boolean(record.invoiceNumber !== undefined || record.draftNumber !== undefined || record.invoiceDate);
    const invoiceActions = isInvoice
      ? `
        ${normalizedStatus === "draft" ? `<button class="tiny" type="button" data-action="finalize-invoice" data-id="${escapeAttr(record.id)}">Finalize</button>` : ""}
        ${normalizedStatus !== "draft" ? `<button class="tiny" type="button" data-action="share-document" data-kind="invoice" data-id="${escapeAttr(record.id)}">Print / Save as PDF</button>` : ""}
        ${normalizedStatus !== "draft" ? `<button class="tiny" type="button" data-action="whatsapp-invoice" data-id="${escapeAttr(record.id)}">WhatsApp</button>` : ""}
        ${normalizedStatus !== "draft" && !record.archivedAt ? `<button class="tiny" type="button" data-action="archive-invoice" data-id="${escapeAttr(record.id)}">Archive</button>` : ""}
        ${record.archivedAt ? `<button class="tiny" type="button" data-action="restore-invoice" data-id="${escapeAttr(record.id)}">Restore</button>` : ""}
      `
      : "";
    const poActions = isPurchaseOrder
      ? `
        ${normalizedStatus === "draft" ? `<button class="tiny" type="button" data-action="issue-po" data-id="${escapeAttr(record.id)}">Issue</button>` : ""}
        ${normalizedStatus !== "draft" ? `<button class="tiny" type="button" data-action="share-document" data-kind="po" data-id="${escapeAttr(record.id)}">Print / Save as PDF</button>` : ""}
      `
      : "";
    return `
      <article class="record-row">
        <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(record.customerName || record.vendorName || record.billToName || record.description || record.reason || "")}</span></div>
        <div class="row-end"><strong>${escapeHtml(money(amount, record.currency || "INR"))}</strong><small>${escapeHtml(titleCase(status))}</small></div>
        ${invoiceActions || poActions ? `<div class="inline-actions">${invoiceActions}${poActions}</div>` : ""}
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
