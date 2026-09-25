const SESSION_KEY = "eazinvoice_mobile_session_v3";
const SETTINGS_KEY = "eazinvoice_mobile_settings_v3";
const DEFAULT_PRODUCTION_API = "https://www.eazinvoice.com";
const OTP_IDLE_LABEL = "Request OTP";
const OTP_SENT_LABEL = "Sent Successfully";
const OTP_CODE_LENGTH = 6;
const DEFAULT_OTP_EXPIRES_SECONDS = 90;
const ACCOUNT_PROFILE_REQUIRED_FIELDS = ["name", "email", "phone"];
const BUSINESS_PROFILE_REQUIRED_FIELDS = ["name", "businessType", "entityType"];
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
  menuOpen: false,
  profileMenuOpen: false,
  accountTab: "overview",
  accountSettingsTab: "api",
  lastCreatedApiKey: "",
  oauthInFlight: false,
  lastConsumedOauthToken: "",
  profilePromptDismissed: false,
  businessProfileDraft: null,
  data: emptyData(),
};

const dom = {};
let otpExpiryTimer = null;
let otpExpiresAt = 0;
let appUrlOpenBound = false;

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
    apiKeys: [],
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
  companies(params) {
    return this.request(`/companies${query(params)}`);
  },
  createCompany(body) {
    return this.request("/companies", { method: "POST", body });
  },
  subscriptionsMe() {
    return this.request("/subscriptions/me");
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
  updateProfile(body) {
    return this.request("/me", { method: "PATCH", body });
  },
  updateCompany(companyId, body) {
    return this.request(`/companies/${encodeURIComponent(companyId)}`, { method: "PATCH", body });
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
  updateBusinessSettings(body) {
    return this.request("/business/settings", { method: "PATCH", body });
  },
  testBusinessEmailSettings(body) {
    return this.request("/business/settings/email/test", { method: "POST", body });
  },
  createTeamMember(body) {
    return this.request("/business/team", { method: "POST", body });
  },
  updateTeamMember(memberId, body) {
    return this.request(`/business/team/${encodeURIComponent(memberId)}`, { method: "PATCH", body });
  },
  apiKeys(params) {
    return this.request(`/business/api-keys${query(params)}`);
  },
  createApiKey(body) {
    return this.request("/business/api-keys", { method: "POST", body });
  },
  revokeApiKey(apiKeyId, params = {}) {
    return this.request(`/business/api-keys/${encodeURIComponent(apiKeyId)}${query(params)}`, { method: "DELETE" });
  },
  startGoogleOAuth(mode = "login") {
    const safeMode = mode === "signup" ? "signup" : "login";
    return `${state.apiBase}/auth/google/start?mode=${encodeURIComponent(safeMode)}&client=mobile`;
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

function applyMePayload(payload) {
  if (payload && typeof payload === "object" && payload.user) {
    state.user = payload.user || null;
    state.accountPlan = payload.plan || state.accountPlan || null;
    return;
  }
  state.user = payload || null;
}

function hasValue(value) {
  return typeof value === "string" ? Boolean(value.trim()) : value !== null && value !== undefined;
}

function missingFields(record, requiredFields) {
  return requiredFields.filter((field) => !hasValue(record?.[field]));
}

function activeCompany() {
  if (!Array.isArray(state.companies) || !state.companies.length) return null;
  if (state.activeWorkspace?.businessId) {
    const scoped = state.companies.find((entry) => entry.id === state.activeWorkspace.businessId || entry.businessId === state.activeWorkspace.businessId);
    if (scoped) return scoped;
  }
  return state.companies[0] || null;
}

function profileSetupState() {
  const accountMissing = missingFields(state.user || {}, ACCOUNT_PROFILE_REQUIRED_FIELDS);
  const company = activeCompany();
  const entityType = String(company?.entityType || "company").trim().toLowerCase();
  const country = normalizeBusinessCountry(company?.country);
  const rules = businessIdentityRules({ country, entityType });
  const requiredBusinessFields = ["name", "businessType", "entityType", "country", "bankDetails"];
  const businessMissing = missingFields(company || {}, requiredBusinessFields);
  if (rules.requiresPan && !hasValue(company?.panNumber)) businessMissing.push("panNumber");
  if (rules.requiresGst && !hasValue(company?.gstNumber)) businessMissing.push("gstNumber");
  if (rules.requiresAadhaar && !hasValue(company?.aadhaarLast4)) businessMissing.push("aadhaarLast4");
  if (rules.requiresTaxId && !hasValue(company?.taxId)) businessMissing.push("taxId");
  if (rules.requiresAnyTaxOrRegistration && !hasValue(company?.taxId) && !hasValue(company?.registrationNumber)) {
    businessMissing.push("taxIdOrRegistration");
  }
  const businessComplete = Boolean(company) && businessMissing.length === 0;
  return {
    accountComplete: accountMissing.length === 0,
    businessComplete,
    accountMissing,
    businessMissing,
    needsSetup: accountMissing.length > 0 || !businessComplete,
    destination: accountMissing.length > 0 ? "profile" : "business",
  };
}

function documentProfileGuard(documentLabel) {
  const company = activeCompany() || {};
  const missing = missingFields(company, ["name", "entityType"]);
  if (!missing.length) return true;
  const labels = { name: "business or issuer name", entityType: "legal entity type" };
  state.accountTab = "business";
  if (state.route !== "account") routeTo("account");
  setStatus(`${documentLabel} needs ${missing.map((field) => labels[field] || field).join(" and ")}. Complete those business profile fields; full KYC is not required.`, "error", "account");
  return false;
}

function derivePlan() {
  const direct = state.accountPlan?.plan || state.accountPlan?.tier || state.accountPlan?.name;
  if (direct) return String(direct).toLowerCase();
  const activeSub = (Array.isArray(state.subscriptions) ? state.subscriptions : []).find((entry) => {
    const status = String(entry.status || "active").toLowerCase();
    return status === "active" || status === "trial";
  });
  return String(activeSub?.plan || activeSub?.tier || "free").toLowerCase();
}

function planLabel() {
  const plan = derivePlan();
  return plan ? `${plan.charAt(0).toUpperCase()}${plan.slice(1)}` : "Free";
}

function normalizePlanId(value) {
  return String(value || "free").trim().toLowerCase() || "free";
}

function subscriptionCatalog() {
  if (Array.isArray(state.accountPlan?.catalog) && state.accountPlan.catalog.length) {
    return state.accountPlan.catalog;
  }
  return [];
}

function activeSubscriptionRecord() {
  const subscriptions = Array.isArray(state.subscriptions) ? state.subscriptions : [];
  const active = subscriptions.find((entry) => {
    const normalized = String(entry?.status || "").trim().toLowerCase();
    return ["active", "trial", "trialing", "past_due"].includes(normalized);
  });
  return active || subscriptions[subscriptions.length - 1] || null;
}

function formatSubscriptionState(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return "";
  const map = {
    active: "Active",
    trial: "Trial",
    trialing: "Trial",
    free: "Free",
    past_due: "Past Due",
    canceled: "Cancelled",
    cancelled: "Cancelled",
    expired: "Expired",
    unpaid: "Unpaid",
    paused: "Paused",
    incomplete: "Incomplete",
    within_limits: "Within Limits",
  };
  if (map[normalized]) return map[normalized];
  return normalized.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function subscriptionStatusLabel() {
  const active = activeSubscriptionRecord();
  const activeStatus = formatSubscriptionState(active?.status);
  if (activeStatus) return activeStatus;

  const summaryStatus = state.accountPlan?.status;
  if (summaryStatus && typeof summaryStatus === "object") {
    if (typeof summaryStatus.reason === "string" && summaryStatus.reason.trim() && summaryStatus.reason !== "within limits") {
      return summaryStatus.reason.trim();
    }
    if (summaryStatus.allowed === true) {
      return normalizePlanId(derivePlan()) === "free" ? "Free" : "Active";
    }
  }

  const fallbackStatus = formatSubscriptionState(state.accountPlan?.subscription?.status || state.accountPlan?.status);
  if (fallbackStatus) return fallbackStatus;
  return normalizePlanId(derivePlan()) === "free" ? "Free" : "Active";
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
    state.lastConsumedOauthToken = saved.lastConsumedOauthToken || "";
    state.oauthInFlight = Boolean(saved.oauthInFlight);
  } catch {
    await mobileStore.remove(SESSION_KEY);
  }
}

async function saveSession() {
  await mobileStore.set(SESSION_KEY, JSON.stringify({
    token: state.token,
    user: state.user,
    activeWorkspace: state.activeWorkspace,
    lastConsumedOauthToken: state.lastConsumedOauthToken,
    oauthInFlight: state.oauthInFlight,
  }));
}

function oauthCallbackDataFromUrl(urlText = "") {
  if (!urlText) return null;
  try {
    const parsed = new URL(urlText);
    const token = parsed.searchParams.get("token") || "";
    const error = parsed.searchParams.get("error") || "";
    if (!token && !error) return null;
    return {
      token,
      provider: parsed.searchParams.get("provider") || "google",
      mode: parsed.searchParams.get("mode") || "login",
      error,
    };
  } catch {
    return null;
  }
}

async function applyExternalOAuth(urlText) {
  const payload = oauthCallbackDataFromUrl(urlText);
  if (!payload) return false;
  if (payload.error) {
    state.oauthInFlight = false;
    setStatus(payload.error, "error", "auth");
    return false;
  }
  if (!payload.token) {
    state.oauthInFlight = false;
    setStatus("Google sign-in callback is missing a session token.", "error", "auth");
    return false;
  }
  if (!state.oauthInFlight) {
    setStatus("Google sign-in session expired. Please try again.", "error", "auth");
    return false;
  }
  if (payload.token === state.lastConsumedOauthToken) {
    setStatus("Google sign-in callback was already used. Please retry if needed.", "error", "auth");
    return false;
  }
  state.token = payload.token;
  state.lastConsumedOauthToken = payload.token;
  state.oauthInFlight = false;
  await saveSession();
  state.authMode = "login";
  const refreshed = await refreshSessionAndData({ quietUnauthorized: true });
  if (!refreshed) {
    setStatus("Google sign-in did not complete. Please try again.", "error", "auth");
    render();
    return false;
  }
  setStatus("Signed in with Google.", "success", "home");
  render();
  return true;
}

async function consumeAuthTokenFromCurrentUrl() {
  const consumed = await applyExternalOAuth(window.location.href);
  if (!consumed) return;
  const clean = new URL(window.location.href);
  clean.searchParams.delete("token");
  clean.searchParams.delete("provider");
  clean.searchParams.delete("mode");
  clean.searchParams.delete("error");
  window.history.replaceState({}, document.title, `${clean.pathname}${clean.search}${clean.hash}`);
}

function bindNativeAuthCallback() {
  if (appUrlOpenBound) return;
  const appPlugin = window.Capacitor?.Plugins?.App;
  if (!appPlugin?.addListener) return;
  appUrlOpenBound = true;
  appPlugin.addListener("appUrlOpen", (event) => {
    if (!event?.url) return;
    void applyExternalOAuth(event.url);
    const browser = window.Capacitor?.Plugins?.Browser;
    if (browser?.close) {
      void browser.close().catch(() => {});
    }
  });
}

async function logout(renderAfter = true) {
  state.token = "";
  state.oauthInFlight = false;
  state.user = null;
  state.menuOpen = false;
  state.profileMenuOpen = false;
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

function statusVisible(scope) {
  if (!scope || scope === "global") return true;
  if (scope === "auth") return !state.token;
  return scope === state.route;
}

function renderStatus() {
  if (!dom.status) return;
  const payload = state.status || { message: "", tone: "info", scope: "global" };
  dom.status.textContent = statusVisible(payload.scope) ? (payload.message || "") : "";
  dom.status.dataset.tone = payload.tone || "info";
}

function setStatus(message, tone = "info", scope = state.token ? state.route : "auth") {
  state.status = { message: message || "", tone, scope };
  renderStatus();
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
  bindNativeAuthCallback();
  state.apiBase = normalizeApiBase(state.apiBase);
  dom.apiBase.value = state.apiBase;
  await restoreSession();
  await consumeAuthTokenFromCurrentUrl();
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
      applyMePayload(await api.me());
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await logout(false);
        return false;
      }
      state.user = state.user || null;
    }
    try {
      await hydrateWorkspaceData();
      setStatus("");
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
    applyMePayload(await api.me().catch(() => state.user));
    await hydrateWorkspaceData();
  }, "Syncing workspace...");
  return true;
}

async function hydrateWorkspaceData() {
    const workspaces = await api.workspaces().catch(() => []);
    state.workspaces = extractArray(workspaces, ["workspaces", "businesses"]);
    state.companies = extractArray(await api.companies().catch(() => []), ["companies", "data"]);
    state.subscriptions = extractArray(await api.subscriptionsMe().catch(() => []), ["subscriptions", "data"]);
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
    state.profileSetup = profileSetupState();
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
    "authForm", "authSubmitButton", "otpRequestButton", "loginButton", "email", "otp", "apiBase", "apiBaseForm",
    "logoutButton", "workspaceSelect", "routeTitle", "status", "offlineBanner", "installRisk", "menuButton", "profileButton", "profileInitial", "mobileMenu", "profileMenu", "profileMenuName", "profileMenuEmail", "menuMyAccountTier",
    "content", "bottomNav", "refreshButton", "profileName", "profileMeta",
  ].forEach((id) => {
    dom[id] = document.getElementById(id);
  });
  dom.authForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitAuth();
  });
  dom.authSubmitButton?.addEventListener("click", (event) => {
    event.preventDefault();
    void submitAuth();
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
    state.menuOpen = false;
  });
  document.addEventListener("pointerdown", (event) => {
    if (!state.profileMenuOpen) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("#profileMenu") || target.closest("#profileButton")) return;
    closeProfileMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeProfileMenu();
  });
  document.body.addEventListener("click", (event) => {
    const sourceTarget = event.target;
    const target = sourceTarget instanceof Element ? sourceTarget : sourceTarget?.parentElement;
    if (!(target instanceof Element)) return;
    if (target.closest("#menuButton")) {
      event.preventDefault();
      state.menuOpen = !state.menuOpen;
      closeProfileMenu({ renderAfter: false });
      renderChrome();
      return;
    }
    if (target.closest("#profileButton")) {
      event.preventDefault();
      state.profileMenuOpen = !state.profileMenuOpen;
      state.menuOpen = false;
      renderChrome();
      return;
    }
    if (target.closest("#otpRequestButton")) {
      event.preventDefault();
      void requestOtp();
      return;
    }
    const authModeButton = target.closest(".auth-mode-toggle [data-auth-mode]");
    if (authModeButton) {
      event.preventDefault();
      setAuthMode(authModeButton.dataset.authMode);
      return;
    }
    const routeButton = target.closest("[data-route]");
    const action = target.closest("[data-action]");
    const promptButton = target.closest("[data-agent-prompt]");
    if (promptButton) {
      const input = document.querySelector('[data-form="ai-agent"] input[name="command"]');
      if (input) input.value = promptButton.dataset.agentPrompt || "";
      if (input) input.form.requestSubmit();
      return;
    }
    const addItem = target.closest("[data-add-item]");
    if (addItem) {
      event.preventDefault();
      const editor = addItem.closest("[data-item-editor]");
      if (editor) editor.insertAdjacentHTML("beforeend", itemRowMarkup());
      return;
    }
    if (routeButton) {
      routeTo(routeButton.dataset.route);
      state.menuOpen = false;
      closeProfileMenu({ renderAfter: false });
      setStatus("");
      renderChrome();
    }
    if (action) {
      event.preventDefault();
      void handleAction(action.dataset.action, action.dataset);
    }
  });
  document.body.addEventListener("submit", (event) => {
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
    const businessForm = event.target?.closest?.("[data-form=\"business-profile\"]");
    if (businessForm && ["country", "entityType"].includes(String(event.target?.name || ""))) {
      const formData = new FormData(businessForm);
      state.businessProfileDraft = {
        country: normalizeBusinessCountry(formData.get("country")),
        entityType: String(formData.get("entityType") || "company").trim().toLowerCase() || "company",
      };
      render();
    }
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
    state.menuOpen = false;
    closeProfileMenu({ renderAfter: false });
    state.route = location.hash.replace("#", "") || "home";
    setStatus("");
    render();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.token && !state.unsavedForm) {
      void refreshBusinessData();
    }
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
  state.profilePromptDismissed = false;
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

function closeProfileMenu({ renderAfter = true } = {}) {
  if (!state.profileMenuOpen) return;
  state.profileMenuOpen = false;
  if (renderAfter) renderChrome();
}

function syncProfileMenuPosition() {
  if (!dom.profileMenu || !dom.profileButton || !state.token) return;
  const rect = dom.profileButton.getBoundingClientRect();
  const top = Math.max(8, Math.ceil(rect.bottom + 8));
  const right = Math.max(8, Math.ceil(window.innerWidth - rect.right));
  dom.profileMenu.style.top = `${top}px`;
  dom.profileMenu.style.right = `${right}px`;
}

function routeTo(route, { replace = false } = {}) {
  if (!route || route === state.route) return;
  if (!confirmDiscardMobileChanges()) return;
  state.unsavedForm = false;
  state.menuOpen = false;
  closeProfileMenu({ renderAfter: false });
  state.route = route;
  setStatus("");
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
  if (action === "logout") {
    state.menuOpen = false;
    closeProfileMenu({ renderAfter: false });
    await logout();
    return;
  }
  if (action === "open-account") {
    state.accountTab = dataset.tab || "overview";
    if (state.accountTab !== "business") state.businessProfileDraft = null;
    state.menuOpen = false;
    closeProfileMenu({ renderAfter: false });
    if (state.route === "account") render();
    else routeTo("account");
    return;
  }
  if (action === "dismiss-profile-prompt") {
    state.profilePromptDismissed = true;
    render();
    return;
  }
  if (action === "open-account-settings") {
    state.accountSettingsTab = dataset.tab || "api";
    state.menuOpen = false;
    closeProfileMenu({ renderAfter: false });
    if (state.route === "account-settings") render();
    else routeTo("account-settings");
    return;
  }
  if (action === "open-change-password") {
    state.accountTab = "profile";
    state.menuOpen = false;
    closeProfileMenu({ renderAfter: false });
    if (state.route === "account") render();
    else routeTo("account");
    return;
  }
  if (action === "google-auth") {
    const mode = state.authMode === "signup" ? "signup" : "login";
    const authUrl = api.startGoogleOAuth(mode);
    const browser = window.Capacitor?.Plugins?.Browser;
    state.oauthInFlight = true;
    await saveSession();
    if (browser?.open) {
      try {
        await browser.open({ url: authUrl });
      } catch (error) {
        state.oauthInFlight = false;
        await saveSession();
        setStatus("Google sign-in could not open. Please retry.", "error", "auth");
      }
      return;
    }
    const isCapacitorShell = location.protocol === "capacitor:" || location.hostname === "localhost" || Boolean(window.Capacitor);
    if (isCapacitorShell) {
      state.oauthInFlight = false;
      await saveSession();
      setStatus("Google sign-in is unavailable on this device. Please retry.", "error", "auth");
      return;
    }
    window.location.href = authUrl;
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
    return;
  }
  if (action === "revoke-api-key") {
    const keyId = String(dataset.keyId || "").trim();
    if (!keyId) return;
    await withBusy(async () => {
      await api.revokeApiKey(keyId, workspaceParams());
      state.data.apiKeys = extractArray(await api.apiKeys(workspaceParams()), ["apiKeys", "keys"]);
      render();
      setStatus("API key revoked.", "success", "account-settings");
    }, "Revoking API key...");
    return;
  }
  if (action === "team-role") {
    const memberId = String(dataset.memberId || "").trim();
    const role = String(dataset.role || "").trim();
    if (!memberId || !role) return;
    await withBusy(async () => {
      await api.updateTeamMember(memberId, workspaceParams({ role }));
      state.data.team = extractArray(await api.team(workspaceParams()), ["team", "members"]);
      render();
      setStatus("Team access updated.", "success", "account-settings");
    }, "Updating team role...");
    return;
  }
  if (action === "team-status") {
    const memberId = String(dataset.memberId || "").trim();
    const status = String(dataset.status || "").trim();
    if (!memberId || !status) return;
    await withBusy(async () => {
      await api.updateTeamMember(memberId, workspaceParams({ status }));
      state.data.team = extractArray(await api.team(workspaceParams()), ["team", "members"]);
      render();
      setStatus(status === "removed" ? "Team member removed." : "Team member activated.", "success", "account-settings");
    }, "Updating team member...");
    return;
  }
}

async function handleForm(name, form) {
  if (!canMutate() && !["settings", "account-password", "account-profile", "business-profile"].includes(name)) {
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
    if (!documentProfileGuard("Invoice")) return;
    const items = documentItems(data);
    await run(() => api.createInvoice({
      ...workspaceParams(),
      customerName: value("customerName"),
      billToName: value("customerName"),
      invoiceDate: value("invoiceDate") || today(),
      dueDate: value("dueDate") || value("invoiceDate") || today(),
      status: value("status") || "draft",
      currency: businessDefaultCurrency(),
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
    if (!documentProfileGuard("Purchase order")) return;
    const items = documentItems(data);
    await run(() => api.createPurchaseOrder({
      ...workspaceParams(),
      vendorName: value("vendorName"),
      billToName: value("vendorName"),
      poDate: value("poDate") || today(),
      status: "draft",
      currency: businessDefaultCurrency(),
      items,
      idempotencyKey: idempotencyKey("purchase-order"),
    }), "PO draft saved. Issue it when ready; it has no accounting impact.");
  } else if (name === "work-order") {
    if (!documentProfileGuard("Work order")) return;
    const items = documentItems(data);
    await run(() => api.createPurchaseOrder({
      ...workspaceParams(),
      documentType: "wo",
      vendorName: value("vendorName"),
      billToName: value("vendorName"),
      poDate: value("poDate") || today(),
      status: "draft",
      currency: businessDefaultCurrency(),
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
      currency: businessDefaultCurrency(),
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
        setStatus("Insight ready.", "success", "agent");
      } catch (error) {
        state.aiConversation.push({ role: "error", text: error.message || "The Agent could not complete that request." });
        state.aiRobotState = "error";
        setStatus("The Agent could not complete that request.", "error", "agent");
      }
      render();
    }, "Analysing your business data...");
  } else if (name === "account-profile") {
    await withBusy(async () => {
      const payload = await api.updateProfile({ name: value("name"), phone: value("phone") });
      applyMePayload(payload);
      state.profileSetup = profileSetupState();
      state.unsavedForm = false;
      setStatus("Account profile updated.", "success", "account");
      render();
    }, "Saving profile...");
  } else if (name === "account-password") {
    const currentPassword = value("currentPassword");
    const newPassword = value("newPassword");
    const confirmPassword = value("confirmPassword");
    if (!currentPassword || !newPassword || !confirmPassword) {
      setStatus("Enter current and new password details.", "error", "account");
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus("New password and confirmation do not match.", "error", "account");
      return;
    }
    await withBusy(async () => {
      await api.updateProfile({ currentPassword, newPassword });
      form.reset();
      state.unsavedForm = false;
      setStatus("Password updated.", "success", "account");
      render();
    }, "Updating password...");
    } else if (name === "business-profile") {
    const company = activeCompany();
    const entityType = value("entityType").toLowerCase();
    const country = normalizeBusinessCountry(value("country"));
    const rules = businessIdentityRules({ country, entityType });
    const panNumber = value("panNumber").toUpperCase();
    const bankDetails = value("bankDetails");
    const gstNumber = value("gstNumber").toUpperCase();
    const aadhaarDigits = String(data.get("aadhaarNumber") || "").replace(/\D/g, "");
    const aadhaarLast4 = aadhaarDigits ? aadhaarDigits.slice(-4) : "";
    const taxId = value("taxId").toUpperCase();
    const registrationNumber = value("registrationNumber").toUpperCase();
    const address = value("address");
    const addressProof = value("addressProof");
    const supportingDocs = Array.from(form.querySelector("input[name=\"documentFiles\"]")?.files || [])
      .map((file) => String(file?.name || "").trim())
      .filter(Boolean);
    if (!value("name")) {
      setStatus("Business/Consultant/Individual name is required.", "error", "account");
      return;
    }
    if (!value("businessType")) {
      setStatus("Business type is required.", "error", "account");
      return;
    }
    if (!country) {
      setStatus("Country is required.", "error", "account");
      return;
    }
    if (!entityType) {
      setStatus("Entity type is required.", "error", "account");
      return;
    }
    if (!bankDetails) {
      setStatus("Bank account details are required.", "error", "account");
      return;
    }
    if (!address) {
      setStatus("Business address is required.", "error", "account");
      return;
    }
    if (!addressProof && !supportingDocs.length) {
      setStatus("Address proof reference or supporting document is required.", "error", "account");
      return;
    }
    if (rules.requiresPan && !panNumber) {
      setStatus("PAN number is required for this profile.", "error", "account");
      return;
    }
    if (rules.requiresGst && !gstNumber) {
      setStatus("GST number is required for Company or Group profiles in India.", "error", "account");
      return;
    }
    if (rules.requiresAadhaar && aadhaarLast4.length < 4) {
      setStatus("Aadhaar number is required for Individual, Freelancer, and Consultant profiles in India.", "error", "account");
      return;
    }
    if (rules.requiresTaxId && !taxId) {
      setStatus("Country Tax ID or National ID is required for this non-India profile.", "error", "account");
      return;
    }
    if (rules.requiresAnyTaxOrRegistration && !taxId && !registrationNumber) {
      setStatus("Provide Country Tax ID or Business Registration Number for this non-India business profile.", "error", "account");
      return;
    }
    await withBusy(async () => {
      const payload = {
        profilePurpose: company?.id ? "account-settings" : "onboarding",
        name: value("name"),
        businessType: value("businessType"),
        entityType,
        country,
        panNumber: rules.requiresPan ? panNumber : "",
        bankDetails,
        gstNumber: rules.requiresGst ? gstNumber : "",
        aadhaarLast4: rules.requiresAadhaar ? aadhaarLast4 : "",
        taxId: !rules.india ? taxId : "",
        registrationNumber: !rules.india && !rules.individual ? registrationNumber : "",
        address,
        addressProof,
        aadhaarNumber: rules.requiresAadhaar ? aadhaarDigits : "",
        kycCountry: country,
        documentNames: supportingDocs,
        documentFiles: supportingDocs,
      };
      const updated = company?.id
        ? await api.updateCompany(company.id, payload)
        : await api.createCompany(payload);
      state.companies = [updated, ...state.companies.filter((entry) => entry.id !== updated.id)];
      state.profileSetup = profileSetupState();
      state.unsavedForm = false;
      state.businessProfileDraft = null;
      setStatus(company?.id ? "Business profile updated." : "Business profile created.", "success", "account");
      render();
    }, "Saving business profile...");
  } else if (name === "account-settings-api") {
    await withBusy(async () => {
      const response = await api.createApiKey(workspaceParams({
        companyId: activeCompany()?.id || null,
        label: value("label") || "Mobile integration",
        scopes: String(value("scopes") || "").split(",").map((entry) => entry.trim()).filter(Boolean),
      }));
      state.lastCreatedApiKey = response.token || "";
      state.data.apiKeys = extractArray(await api.apiKeys(workspaceParams()), ["apiKeys", "keys"]);
      state.unsavedForm = false;
      form.reset();
      render();
      setStatus(response.token ? "API key created. Copy it now; it is shown once." : "API key created.", "success", "account-settings");
    }, "Creating API key...");
  } else if (name === "account-settings-email") {
    const payload = workspaceParams({
      companyId: activeCompany()?.id || null,
      emailSettings: {
        smtpHost: value("smtpHost"),
        smtpPort: Number(value("smtpPort") || 0),
        smtpUser: value("smtpUser"),
        smtpPass: value("smtpPass"),
        smtpSecure: value("smtpSecure") === "on",
        fromEmail: value("fromEmail"),
        fromName: value("fromName"),
        replyToEmail: value("replyToEmail"),
      },
    });
    await withBusy(async () => {
      const updated = await api.updateBusinessSettings(payload);
      state.data.settings = updated;
      state.unsavedForm = false;
      render();
      setStatus("Email configuration updated.", "success", "account-settings");
    }, "Saving email configuration...");
  } else if (name === "account-settings-email-test") {
    const payload = workspaceParams({
      companyId: activeCompany()?.id || null,
      emailSettings: {
        smtpHost: value("smtpHost"),
        smtpPort: Number(value("smtpPort") || 0),
        smtpUser: value("smtpUser"),
        smtpPass: value("smtpPass"),
        smtpSecure: value("smtpSecure") === "on",
        fromEmail: value("fromEmail"),
        fromName: value("fromName"),
        replyToEmail: value("replyToEmail"),
      },
      to: value("to"),
      subject: "EazInvoice SMTP test",
      body: "This is a test email from EazInvoice Account Settings.",
    });
    await withBusy(async () => {
      await api.testBusinessEmailSettings(payload);
      state.unsavedForm = false;
      setStatus("Email test sent.", "success", "account-settings");
    }, "Sending test email...");
  } else if (name === "account-settings-team") {
    await withBusy(async () => {
      await api.createTeamMember(workspaceParams({
        companyId: activeCompany()?.id || null,
        email: value("email"),
        name: value("name"),
        role: value("role") || "viewer",
      }));
      state.data.team = extractArray(await api.team(workspaceParams()), ["team", "members"]);
      state.unsavedForm = false;
      form.reset();
      render();
      setStatus("Team member access created.", "success", "account-settings");
    }, "Adding team member...");
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
    account: renderAccount,
    "account-settings": renderAccountSettings,
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
  if (dom.routeTitle) dom.routeTitle.textContent = routeLabel(state.route);
  dom.profileName.textContent = state.activeWorkspace ? workspaceName(state.activeWorkspace) : "Business workspace";
  dom.profileMeta.hidden = !state.activeWorkspace;
  dom.profileMeta.textContent = state.activeWorkspace ? titleCase(currentRole()) : "";
  dom.apiBase.value = state.apiBase;
  dom.logoutButton.hidden = !state.token;
  dom.refreshButton.hidden = !state.token;
  dom.workspaceSelect.hidden = !state.token || state.workspaces.length <= 1;
  dom.bottomNav.hidden = !state.token;
  document.getElementById("topAppBar")?.toggleAttribute("hidden", false);
  document.getElementById("workspaceBar")?.toggleAttribute("hidden", !state.token);
  if (dom.menuButton) dom.menuButton.hidden = !state.token;
  if (dom.profileButton) dom.profileButton.hidden = !state.token;
  if (!state.token) {
    state.menuOpen = false;
    state.profileMenuOpen = false;
  }
  dom.apiBaseForm.hidden = true;
  if (dom.profileInitial) dom.profileInitial.textContent = String((state.user?.name || state.user?.email || "U").trim().charAt(0) || "U").toUpperCase();
  if (dom.mobileMenu) dom.mobileMenu.hidden = !state.menuOpen || !state.token;
  if (dom.profileMenu) dom.profileMenu.hidden = !state.profileMenuOpen || !state.token;
  if (state.profileMenuOpen && state.token) syncProfileMenuPosition();
  if (dom.menuButton) dom.menuButton.setAttribute("aria-expanded", state.menuOpen ? "true" : "false");
  if (dom.profileButton) dom.profileButton.setAttribute("aria-expanded", state.profileMenuOpen ? "true" : "false");
  if (dom.menuMyAccountTier) dom.menuMyAccountTier.textContent = planLabel();
  if (dom.profileMenuName) dom.profileMenuName.textContent = state.user?.name || state.user?.email || "User";
  if (dom.profileMenuEmail) dom.profileMenuEmail.textContent = state.user?.email || `${planLabel()} plan`;
  if (state.token) {
    dom.workspaceSelect.innerHTML = state.workspaces.map((workspace) => (
      `<option value="${escapeAttr(workspaceKey(workspace))}" ${workspace === state.activeWorkspace ? "selected" : ""}>${escapeHtml(workspaceName(workspace))} - ${escapeHtml(titleCase(workspace.role || "owner"))}</option>`
    )).join("");
  }
  const activeNavRoute = ["money", "reports", "account", "account-settings", "agent"].includes(state.route) ? "more" : state.route;
  renderStatus();
  dom.bottomNav.querySelectorAll("[data-route]").forEach((button) => {
    const active = button.dataset.route === activeNavRoute;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
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
    account: "My Account",
    "account-settings": "Account Settings",
    agent: "AI Agent",
  }[route] || "Home";
}

function workspaceName(workspace) {
  return text(workspace.businessName || workspace.name || workspace.companyName || workspace.label, "Business Workspace");
}

function isIndividualEntityType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["individual", "freelancer", "consultant", "sole proprietorship", "sole proprietor", "proprietor"].includes(normalized);
}

function requiresGstEntityType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["company", "group"].includes(normalized);
}

function normalizeBusinessCountry(value) {
  const normalized = String(value || "IN").trim().toUpperCase();
  return normalized || "IN";
}

function isIndiaCountry(value) {
  const country = normalizeBusinessCountry(value);
  return country === "IN" || country === "INDIA";
}

function businessIdentityRules({ country = "IN", entityType = "company" } = {}) {
  const india = isIndiaCountry(country);
  const individual = isIndividualEntityType(entityType);
  if (india && individual) {
    return {
      india,
      individual,
      requiresPan: true,
      requiresGst: false,
      requiresAadhaar: true,
      requiresTaxId: false,
      requiresAnyTaxOrRegistration: false,
      guidance: "For India individual, freelancer, or consultant profiles, provide PAN, Aadhaar last 4, address proof, and supporting identity documents. GST is not applicable for this profile type; use Company or Group for GST/company registration.",
    };
  }
  if (india) {
    return {
      india,
      individual,
      requiresPan: true,
      requiresGst: true,
      requiresAadhaar: false,
      requiresTaxId: false,
      requiresAnyTaxOrRegistration: false,
      guidance: "For India company or group profiles, provide company PAN and GST details where applicable, plus address proof and business registration/tax documents.",
    };
  }
  if (individual) {
    return {
      india,
      individual,
      requiresPan: false,
      requiresGst: false,
      requiresAadhaar: false,
      requiresTaxId: true,
      requiresAnyTaxOrRegistration: false,
      guidance: "For non-India individual, freelancer, or consultant profiles, provide the country tax ID or national ID, address proof, and identity documents accepted in your country.",
    };
  }
  return {
    india,
    individual,
    requiresPan: false,
    requiresGst: false,
    requiresAadhaar: false,
    requiresTaxId: false,
    requiresAnyTaxOrRegistration: true,
    guidance: "For non-India company or group profiles, provide business registration, country tax ID where available, address proof, and company registration documents.",
  };
}

function defaultCurrencyForCountry(value) {
  const country = normalizeBusinessCountry(value);
  const map = {
    IN: "INR",
    US: "USD",
    AE: "AED",
    SG: "SGD",
    GB: "GBP",
    AU: "AUD",
    CA: "CAD",
    OTHER: "USD",
  };
  return map[country] || "USD";
}

function businessDefaultCurrency() {
  const company = activeCompany();
  return defaultCurrencyForCountry(company?.country);
}

function dashboardBusinessName() {
  const company = activeCompany();
  if (company && isIndividualEntityType(company.entityType || company.businessType)) {
    return text(state.user?.name || state.user?.email, "Your Business");
  }
  return text(company?.name || workspaceName(state.activeWorkspace) || state.user?.name || state.user?.email, "Your Business");
}
function renderLogin() {
  const resetMode = state.authMode === "reset";
  const signupMode = state.authMode === "signup";
  const eyebrow = resetMode ? "Account recovery" : signupMode ? "Create account" : "Secure sign in";
  const heading = resetMode ? "Reset your password" : signupMode ? "Create your EazInvoice account" : "Sign in to&nbsp;<span class=\"auth-heading-brand\">EazInvoice</span>";
  const otpLabel = resetMode ? "Reset OTP" : signupMode ? "Signup OTP" : "Login OTP";
  const otpPlaceholder = resetMode ? "Enter reset OTP" : signupMode ? "Enter signup OTP" : "Enter login OTP";
  const otpButtonLabel = resetMode ? "Request reset OTP" : signupMode ? "Request signup OTP" : "Request OTP";
  const submitLabel = resetMode ? "Reset password" : signupMode ? "Create account" : "Sign in";
  return `
    <section class="panel auth-panel">
      <div class="auth-hero" aria-hidden="true">
        <img class="auth-hero-eazy" src="./assets/eazy.png" alt="" />
        <div class="auth-hero-growth">
          <span class="auth-growth-bar bar-1"></span>
          <span class="auth-growth-bar bar-2"></span>
          <span class="auth-growth-bar bar-3"></span>
          <span class="auth-growth-bar bar-4"></span>
          <span class="auth-growth-bar bar-5"></span>
          <svg viewBox="0 0 180 86" class="auth-growth-line" role="presentation" focusable="false" aria-hidden="true">
            <path d="M8 72 L40 63 L70 56 L100 44 L128 33 L168 14" />
            <circle cx="168" cy="14" r="5" />
          </svg>
        </div>
      </div>
      <span class="eyebrow">${eyebrow}</span>
      <h1>${heading}</h1>
      <div class="auth-mode-toggle" role="tablist" aria-label="Authentication options">
        <button type="button" data-auth-mode="login" class="${!resetMode && !signupMode ? "active" : ""}" aria-pressed="${!resetMode && !signupMode ? "true" : "false"}">Sign in</button>
        <button type="button" data-auth-mode="signup" class="${signupMode ? "active" : ""}" aria-pressed="${signupMode ? "true" : "false"}">Sign up</button>
        <button type="button" data-auth-mode="reset" class="${resetMode ? "active" : ""}" aria-pressed="${resetMode ? "true" : "false"}">Forgot password?</button>
      </div>
      <form id="authForm" class="form-stack" novalidate data-auth-mode="${resetMode ? "reset" : signupMode ? "signup" : "login"}">
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
          <button id="authSubmitButton" class="primary" type="submit" formnovalidate>${submitLabel}</button>
        </div>
        ${resetMode ? "" : `<button class="secondary full google-auth" type="button" data-action="google-auth"><img class="google-icon" src="./assets/google-logo-g.webp" alt="" aria-hidden="true" /><span>Continue with Google</span></button>`}
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
  const invoices = latestRecords(state.data.invoices, ["createdAt", "invoiceDate", "updatedAt", "issuedAt", "id"]);
  const purchaseOrders = latestRecords(state.data.purchaseOrders, ["createdAt", "poDate", "updatedAt", "issuedAt", "id"]);
  return `
    ${homeCarousel()}
    ${profileSetupPrompt()}
    <section class="dashboard-greeting">
      <span class="eyebrow">Your business</span>
      <h1>${escapeHtml(dashboardBusinessName())}</h1>
      <p>Your business at a glance</p>
    </section>
    <section class="dashboard-primary" aria-label="Primary financial summary">
      ${financialCard("sales", "trend", "Total sales", money(revenue), "From backend report", trendMarkup(["salesChangePercent", "revenueChangePercent", "revenueGrowthPercent"]))}
      ${financialCard("receivables", "users", "Outstanding receivables", money(receivables), `${state.data.invoices.length} invoices`, trendMarkup(["receivablesChangePercent", "arChangePercent", "receivablesGrowthPercent"]))}
      ${financialCard("payables", "clock", "Outstanding payables", money(payables), `${state.data.vendorBills.length} bills`, trendMarkup(["payablesChangePercent", "apChangePercent", "payablesGrowthPercent"]))}
    </section>
    <section class="panel">
      <div class="section-head"><div><span class="eyebrow">Next steps</span><h2>Quick actions</h2></div><span class="pill">${canMutate() ? "Enabled" : "Read-only"}</span></div>
      <div class="action-grid">
        ${actionTile("invoice", "New invoice", "sales", "primary")}
        ${actionTile("quote", "Quotation", "sales", "disabled", true)}
        ${actionTile("cart", "Purchase order", "purchases")}
        ${actionTile("users", "Customers", "sales")}
        ${actionTile("vendor", "Vendors", "purchases")}
        ${actionTile("chart", "Reports", "reports")}
        ${actionTile("bank", "Banking", "money")}
        ${actionTile("grid", "More", "more")}
      </div>
    </section>
    <section class="panel">
      <div class="section-head"><div><span class="eyebrow">Business pulse</span><h2>More financials</h2></div></div>
      <div class="secondary-metrics">
        ${metricCard("Expenses", money(expenses), "Backend report")}
        ${metricCard("Profit/Loss", money(profit), "Current view")}
        ${metricCard("Bank/Cash", money(bank), `${state.data.bankAccounts.length} accounts`)}
      </div>
    </section>
    <section class="panel attention-panel">
      <div class="section-head"><div><span class="eyebrow">Review</span><h2>Needs attention</h2></div><button class="tiny" type="button" data-route="reports">Review</button></div>
      ${attentionSummary()}
    </section>
    <section class="panel">
      <div class="section-head compact"><div><span class="eyebrow">Live API</span><h2>Latest 5 Invoices</h2></div><button class="tiny" type="button" data-route="sales">View all</button></div>
      ${documentSummaryList(invoices, "invoice", "No invoices yet.")}
    </section>
    <section class="panel">
      <div class="section-head compact"><div><span class="eyebrow">Live API</span><h2>Latest 5 PO/WO</h2></div><button class="tiny" type="button" data-route="purchases">View all</button></div>
      ${documentSummaryList(purchaseOrders, "po", "No purchase or work orders yet.")}
    </section>
  `;
}

function homeCarousel() {
  const slides = [
    { title: "Workspace", copy: "Invoices, purchases, accounting and AI in one workspace.", image: "./assets/home-hero-v2.png" },
    { title: "PO / WO", copy: "Track purchase and work orders with lifecycle clarity.", image: "./assets/home-slider-po-wo.png" },
    { title: "AI Agent", copy: "Ask business questions using authorized tenant context.", image: "./assets/home-slider-ai-agent.png" },
    { title: "Payments", copy: "Record collections and supplier payments with controls.", image: "./assets/home-slider-payments.png" },
  ];
  return `<section class="mobile-carousel" aria-label="EazInvoice highlights">${slides.map((slide, index) => `
    <article class="mobile-carousel-slide" data-slide="${index + 1}" aria-label="Slide ${index + 1} of ${slides.length}">
      <img src="${escapeAttr(slide.image)}" alt="${escapeAttr(slide.title)}" loading="lazy" />
      <div class="mobile-carousel-overlay"><span class="eyebrow">EazInvoice</span><h2>${escapeHtml(slide.title)}</h2><p>${escapeHtml(slide.copy)}</p></div>
    </article>`).join("")}
  </section>`;
}

function profileSetupPrompt() {
  if (!state.profileSetup?.needsSetup || state.profilePromptDismissed) return "";
  const needsAccount = !state.profileSetup.accountComplete;
  return `<section class="panel profile-setup-prompt"><div><span class="eyebrow">Profile setup</span><h2>Complete your profile</h2><p>Add the information needed for your EazInvoice documents.</p></div><div class="button-row"><button class="primary" type="button" data-action="open-account" data-tab="${needsAccount ? "profile" : "business"}">Complete profile</button><button class="secondary" type="button" data-action="dismiss-profile-prompt">Remind me later</button></div></section>`;
}

function recordTimestamp(record, keys = []) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const parsed = Date.parse(String(value || ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function latestRecords(records, orderingKeys = []) {
  return [...(Array.isArray(records) ? records : [])]
    .sort((a, b) => recordTimestamp(b, orderingKeys) - recordTimestamp(a, orderingKeys))
    .slice(0, 5);
}

function documentSummaryList(records, kind, emptyMessage) {
  if (!records?.length) return `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
  return `<div class="record-list">${records.map((record) => {
    const isPo = kind === "po";
    const type = isPo ? String(record.documentType || "po").toUpperCase() : "Invoice";
    const numberText = isPo ? (record.poNumber || record.id || "PO") : (record.invoiceNumber || record.id || "Invoice");
    const party = isPo ? (record.vendorName || record.billToName || "-") : (record.customerName || record.billToName || "-");
    const amount = record.total || record.amount || record.balanceAmount || 0;
    const status = titleCase(record.status || record.paymentStatus || "draft");
    return `<article class="record-row"><div><strong>${escapeHtml(numberText)}</strong><span>${escapeHtml(party)}</span>${isPo ? `<small>${escapeHtml(type)}</small>` : ""}</div><div class="row-end"><strong>${escapeHtml(money(amount, record.currency || "INR"))}</strong><small class="status-badge ${statusClass(status)}">${escapeHtml(status)}</small></div></article>`;
  }).join("")}</div>`;
}

function financialCard(kind, icon, label, value, hint, trend = "") {
  return `<article class="financial-card ${kind}"><span class="metric-icon" aria-hidden="true">${iconSvg(icon)}</span><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small>${trend}</div></article>`;
}

function trendMarkup(keys) {
  const source = state.data.summary || {};
  const raw = keys.map((key) => source[key] ?? source.summary?.[key]).find((value) => value !== undefined && value !== null && value !== "");
  if (raw === undefined) return '<small class="trend neutral">\u2014 <span>vs prior period</span></small>';
  const value = number(raw);
  const direction = value > 0 ? "up" : value < 0 ? "down" : "neutral";
  const arrow = value > 0 ? "\u2191" : value < 0 ? "\u2193" : "\u2192";
  return `<small class="trend ${direction}">${arrow} ${escapeHtml(`${Math.abs(value)}%`)} <span>vs prior period</span></small>`;
}

function actionTile(icon, label, route, tone = "", disabled = false) {
  return `<button class="action-tile ${tone}" type="button" data-route="${escapeAttr(route)}" ${disabled ? "disabled aria-disabled=\"true\"" : ""}><span class="metric-icon" aria-hidden="true">${iconSvg(icon)}</span><span>${escapeHtml(label)}</span>${disabled ? '<small class="tile-note">Coming soon</small>' : ""}</button>`;
}

function iconSvg(name) {
  const paths = {
    trend: '<path d="M4 19V5M4 19h16"/><path d="M7 15h2v4H7zm4-5h2v9h-2zm4-4h2v13h-2z"/><path d="m7 9 4-3 3 2 5-5"/>',
    users: '<path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="7" r="3"/><path d="M16 8a3 3 0 0 1 0 6m2 6v-1.5a3.5 3.5 0 0 0-2-3.2"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    invoice: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/>',
    wallet: '<path d="M4 7h16v12H4z"/><path d="M4 7V5h13M16 13h4"/><circle cx="16" cy="13" r=".7" fill="currentColor" stroke="none"/>',
    cart: '<path d="M4 5h2l2 10h9l2-7H7"/><circle cx="10" cy="19" r="1"/><circle cx="17" cy="19" r="1"/>',
    vendor: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 11h5M18.5 8.5v5"/>',
    chart: '<path d="M4 19V5M4 19h16"/><path d="m7 15 3-4 3 2 5-7"/>',
    bank: '<path d="m3 10 9-6 9 6H3Z"/><path d="M5 11v6m4-6v6m6-6v6m4-6v6M3 20h18"/>',
    grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>'
    ,quote: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h4"/>'
  };
  const solid = ["users", "cart", "vendor", "bank"].includes(name);
  return `<svg class="ui-icon ${solid ? "icon-solid" : ""}" viewBox="0 0 24 24" fill="${solid ? "currentColor" : "none"}" stroke="currentColor" stroke-width="${solid ? "1.35" : "1.8"}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.grid}</svg>`;
}

function statusClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (/paid|finalized|issued|completed/.test(normalized)) return "paid";
  if (/sent|submitted|approved/.test(normalized)) return "sent";
  if (/draft|open/.test(normalized)) return "draft";
  if (/overdue|review|due|pending/.test(normalized)) return "review";
  if (/archived|cancelled|reversed/.test(normalized)) return "archived";
  return "";
}

function attentionSummary() {
  const items = [
    { label: "Overdue receivables", value: state.data.receivables?.overdueTotal || state.data.receivables?.summary?.overdueTotal || 0, format: "money" },
    { label: "Payables due", value: state.data.payables?.dueTotal || state.data.payables?.summary?.dueTotal || 0, format: "money" },
    { label: "GST/TDS issues", value: issueCount(state.data.compliance || state.data.gst || state.data.tds), format: "count" },
    { label: "Unreconciled bank", value: state.data.bankSummary?.unmatchedCount || state.data.bankSummary?.summary?.unmatchedCount || 0, format: "count" }
  ];
  const active = items.filter((item) => number(item.value) > 0);
  return active.length ? `<div class="status-list">${active.map(riskRow).join("")}</div>` : '<div class="attention-clear"><span class="check-mark" aria-hidden="true">\u2713</span><div><strong>All caught up</strong><span>No overdue, compliance, or reconciliation items need review.</span></div></div>';
}

function riskRow(item) {
  const rendered = item.format === "count" ? String(number(item.value)) : money(item.value);
  return `<div class="status-row"><span class="status-dot" aria-hidden="true"></span><div><strong>${escapeHtml(item.label)}</strong><small>Needs review</small></div><b>${escapeHtml(rendered)}</b></div>`;
}

function activityList(records, empty) {
  if (!records?.length) return `<div class="empty-state">${escapeHtml(empty)}</div>`;
  return `<div class="activity-list">${records.map((record) => {
    const title = record.invoiceNumber || record.billNumber || record.creditNoteNumber || record.vendorCreditNumber || record.poNumber || record.id || "Record";
    const amount = record.total || record.amount || record.balanceAmount || record.outstandingAmount || 0;
    const status = String(record.status || record.paymentStatus || record.reconciliationStatus || "Review");
    const normalized = status.toLowerCase();
    const kind = record.vendorName || record.billNumber ? "cart" : record.creditNoteNumber ? "invoice" : "invoice";
    const badgeClass = statusClass(status);
    return `<article class="activity-row"><span class="activity-icon" aria-hidden="true">${iconSvg(kind)}</span><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(record.customerName || record.vendorName || record.description || "Financial record")}</span></div><div class="activity-amount"><strong>${escapeHtml(money(amount, record.currency || "INR"))}</strong><small class="status-badge ${badgeClass}">${escapeHtml(titleCase(status))}</small></div></article>`;
  }).join("")}</div>`;
}

function renderSales() {
  return `
    <section class="document-header"><button class="tiny" type="button" data-route="home">\u2190 Back</button><div><span class="eyebrow">Sales</span><h1>New Invoice</h1></div><span class="status-badge">Draft</span></section>
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
    <section class="document-header"><button class="tiny" type="button" data-route="home">\u2190 Back</button><div><span class="eyebrow">Purchases</span><h1>New Purchase Order</h1></div><span class="status-badge">Draft</span></section>
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
    <section class="panel">
      ${sectionTitle("Operational Shortcuts", "Secondary workspace modules")}
      <div class="quick-actions">
        <button class="secondary" type="button" data-route="reports">Reports</button>
        <button class="secondary" type="button" data-route="money">Accounting</button>
      </div>
    </section>
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
  `;
}

function renderAccount() {
  const company = activeCompany();
  const tab = state.accountTab || "overview";
  const plan = planLabel();
  const normalizedKycStatus = String(company?.kycStatus || company?.reviewStatus || "not_started").trim().toLowerCase();
  const kycStatus = ["verified", "approved"].includes(normalizedKycStatus)
    ? "Verified"
    : ["pending", "submitted", "under_review", "kyc_pending"].includes(normalizedKycStatus)
      ? "Submitted"
      : normalizedKycStatus === "rejected"
        ? "Rejected"
        : normalizePlanId(derivePlan()) === "free" ? "Required for paid features" : "Action required";
  const nav = `<div class="account-tabs" role="tablist" aria-label="My account"><button class="tiny ${tab === "overview" ? "active" : ""}" type="button" data-action="open-account" data-tab="overview">Overview</button><button class="tiny ${tab === "profile" ? "active" : ""}" type="button" data-action="open-account" data-tab="profile">Account Profile</button><button class="tiny ${tab === "business" ? "active" : ""}" type="button" data-action="open-account" data-tab="business">Business Profile</button><button class="tiny ${tab === "subscription" ? "active" : ""}" type="button" data-action="open-account" data-tab="subscription">Manage Subscription</button></div>`;
  const overview = `<section class="panel"><div class="section-head compact"><div><span class="eyebrow">My Account</span><h2>Overview</h2></div><span class="pill">${escapeHtml(plan)}</span></div><div class="status-grid"><article><span>User</span><strong>${escapeHtml(state.user?.name || state.user?.email || "User")}</strong></article><article><span>Email</span><strong>${escapeHtml(state.user?.email || "-")}</strong></article><article><span>Business</span><strong>${escapeHtml(company?.name || workspaceName(state.activeWorkspace))}</strong></article><article><span>Identity verification</span><strong>${escapeHtml(kycStatus)}</strong></article></div></section>`;
  const profile = `<section class="panel"><div class="section-head compact"><div><span class="eyebrow">My Account</span><h2>Account Profile</h2></div></div><form class="form-stack" data-form="account-profile"><label>Name<input name="name" value="${escapeAttr(state.user?.name || "")}" required /></label><label>Email<input value="${escapeAttr(state.user?.email || "")}" disabled /></label><label>Phone<input name="phone" value="${escapeAttr(state.user?.phone || "")}" required /></label><button class="primary full" type="submit">Save Profile</button></form><form class="form-stack" data-form="account-password"><label>Current password<input name="currentPassword" type="password" required /></label><label>New password<input name="newPassword" type="password" required /></label><label>Confirm password<input name="confirmPassword" type="password" required /></label><button class="secondary full" type="submit">Change Password</button></form></section>`;
    const businessDisplayName = dashboardBusinessName();
  const businessDraft = state.businessProfileDraft || {};
  const selectedEntityType = String(businessDraft.entityType || company?.entityType || "company").toLowerCase();
  const selectedCountry = normalizeBusinessCountry(businessDraft.country || company?.country);
  const rules = businessIdentityRules({ country: selectedCountry, entityType: selectedEntityType });
  const complianceGuidance = rules.guidance;
  const defaultCurrency = defaultCurrencyForCountry(selectedCountry);
  const indiaFields = `
    <label>PAN Number<input name="panNumber" value="${escapeAttr(company?.panNumber || "")}" placeholder="ABCDE1234F" ${rules.requiresPan ? "required" : ""} /></label>
    ${rules.requiresGst ? `<label>GST Number<input name="gstNumber" value="${escapeAttr(company?.gstNumber || "")}" placeholder="GST number" required /></label>` : ""}
    ${rules.requiresAadhaar ? `<label>Aadhaar Number<input name="aadhaarNumber" inputmode="numeric" value="${escapeAttr(company?.aadhaarLast4 || "")}" placeholder="Enter Aadhaar (last 4 used)" required /></label>` : ""}
  `;
  const internationalFields = `
    <label>Country Tax ID / National ID<input name="taxId" value="${escapeAttr(company?.taxId || "")}" placeholder="Tax ID or National ID" ${rules.requiresTaxId ? "required" : ""} /></label>
    ${!rules.individual ? `<label>Business Registration Number<input name="registrationNumber" value="${escapeAttr(company?.registrationNumber || "")}" placeholder="Registration number" /></label>` : ""}
  `;
  const business = `<section class="panel"><div class="section-head compact"><div><span class="eyebrow">My Account</span><h2>Business Profile - ${escapeHtml(businessDisplayName)}</h2></div></div><form class="form-stack" data-form="business-profile" novalidate><label>Business name<input name="name" value="${escapeAttr(company?.name || "")}" required /></label><label>Business type<input name="businessType" value="${escapeAttr(company?.businessType || "")}" required /></label><label>Country<select name="country" required><option value="IN" ${selectedCountry === "IN" ? "selected" : ""}>India</option><option value="US" ${selectedCountry === "US" ? "selected" : ""}>United States</option><option value="AE" ${selectedCountry === "AE" ? "selected" : ""}>United Arab Emirates</option><option value="SG" ${selectedCountry === "SG" ? "selected" : ""}>Singapore</option><option value="GB" ${selectedCountry === "GB" ? "selected" : ""}>United Kingdom</option><option value="AU" ${selectedCountry === "AU" ? "selected" : ""}>Australia</option><option value="CA" ${selectedCountry === "CA" ? "selected" : ""}>Canada</option><option value="OTHER" ${!["IN","US","AE","SG","GB","AU","CA"].includes(selectedCountry) ? "selected" : ""}>Other country</option></select></label><label>Default currency<input value="${escapeAttr(defaultCurrency)}" disabled /></label><label>Entity type<select name="entityType" required><option value="individual" ${selectedEntityType === "individual" ? "selected" : ""}>Individual</option><option value="freelancer" ${selectedEntityType === "freelancer" ? "selected" : ""}>Freelancer</option><option value="consultant" ${selectedEntityType === "consultant" ? "selected" : ""}>Consultant</option><option value="company" ${selectedEntityType === "company" ? "selected" : ""}>Company</option><option value="group" ${selectedEntityType === "group" ? "selected" : ""}>Group</option></select></label>${rules.india ? indiaFields : internationalFields}<label>Business address<textarea name="address" rows="3" placeholder="Street, city, state, postal code" required>${escapeHtml(company?.address || "")}</textarea></label><label>Address proof reference<input name="addressProof" value="${escapeAttr(company?.addressProof || "")}" placeholder="Document reference (or upload below)" /></label><label>Supporting document(s)<input name="documentFiles" type="file" multiple /></label><label>Bank account details<textarea name="bankDetails" rows="3" placeholder="Account name, bank, account number, IFSC/SWIFT" required>${escapeHtml(company?.bankDetails || "")}</textarea></label><p class="form-note">${escapeHtml(complianceGuidance)}</p><button class="primary full" type="submit">Save Business Profile</button></form></section>`;
  const activePlan = normalizePlanId(derivePlan());
  const activeStatus = subscriptionStatusLabel();
  const catalog = subscriptionCatalog();
  const catalogOrder = catalog.map((entry) => normalizePlanId(entry?.plan || entry?.id));
  const orderOf = (planId) => {
    const index = catalogOrder.indexOf(normalizePlanId(planId));
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const currentRank = orderOf(activePlan);
  const upgradeFlowUrl = "/apps/web/subscription.html";
  const planCards = catalog.length
    ? `<div class="subscription-plan-list">${catalog.map((entry) => {
      const planId = normalizePlanId(entry.plan || entry.id);
      const label = String(entry.label || planId || "Plan").trim() || "Plan";
      const currency = String(entry.currency || "INR").trim() || "INR";
      const monthlyAmount = Number(entry.monthlyAmount ?? entry.amount ?? 0);
      const annualAmount = Number(entry.annualAmount ?? (monthlyAmount * 12));
      const isCurrent = planId === activePlan;
      const isHigher = orderOf(planId) > currentRank;
      const monthlyLabel = monthlyAmount <= 0 ? `${currency} 0` : `${currency} ${MONEY_FORMATTER.format(monthlyAmount)}/month`;
      const billedLabel = monthlyAmount <= 0 ? "No billing" : `Billed yearly: ${currency} ${MONEY_FORMATTER.format(annualAmount)}`;
      const highlights = Array.isArray(entry.highlights) && entry.highlights.length
        ? entry.highlights.slice(0, 4)
        : (entry.description ? [entry.description] : []);
      const actionLabel = isCurrent
        ? "Current Plan"
        : isHigher
          ? `Upgrade to ${label}`
          : "Managed on Subscription Page";
      const actionMarkup = isCurrent
        ? `<button class="secondary full" type="button" disabled>${escapeHtml(actionLabel)}</button>`
        : `<a class="${isHigher ? "primary" : "secondary"} full action-link" href="${upgradeFlowUrl}">${escapeHtml(actionLabel)}</a>`;
      return `<article class="panel subscription-plan-card ${isCurrent ? "active" : ""}"><div class="section-head compact"><div><span class="eyebrow">${escapeHtml(label.toUpperCase())}</span><h3>${escapeHtml(label)}</h3></div><span class="pill ${isCurrent ? "green" : ""}">${isCurrent ? "Current" : "Available"}</span></div><p class="subscription-price">${escapeHtml(monthlyLabel)}</p><p class="form-note">${escapeHtml(billedLabel)}</p>${highlights.length ? `<ul class="subscription-feature-list">${highlights.map((item) => `<li>${escapeHtml(String(item || "").trim())}</li>`).join("")}</ul>` : ""}<div class="inline-actions">${actionMarkup}</div></article>`;
    }).join("")}</div>`
    : `<div class="empty-state">Plan catalog is unavailable. Use subscription management to view current offers.</div>`;
  const subscription = `<section class="panel"><div class="section-head compact"><div><span class="eyebrow">My Account</span><h2>Manage Subscription</h2></div></div><div class="status-grid"><article><span>Current Plan</span><strong>${escapeHtml(plan)}</strong></article><article><span>Status</span><strong>${escapeHtml(activeStatus)}</strong></article></div><div class="inline-actions"><a class="secondary full action-link" href="${upgradeFlowUrl}">Open Subscription Management</a></div>${planCards}</section>`;
  const content = tab === "profile" ? profile : tab === "business" ? business : tab === "subscription" ? subscription : overview;
  return `${nav}${content}`;
}

function renderAccountSettings() {
  const tab = state.accountSettingsTab || "api";
  const company = activeCompany();
  const settings = state.data.settings || {};
  const email = settings.emailSettings || {};
  const apiKeys = Array.isArray(state.data.apiKeys) ? state.data.apiKeys : [];
  const team = Array.isArray(state.data.team) ? state.data.team : [];
  const tabs = `<div class="account-tabs" role="tablist" aria-label="Account settings"><button class="tiny ${tab === "api" ? "active" : ""}" type="button" data-action="open-account-settings" data-tab="api">API Access</button><button class="tiny ${tab === "email" ? "active" : ""}" type="button" data-action="open-account-settings" data-tab="email">Email Config</button><button class="tiny ${tab === "team" ? "active" : ""}" type="button" data-action="open-account-settings" data-tab="team">Business Team</button><button class="tiny ${tab === "security" ? "active" : ""}" type="button" data-action="open-account-settings" data-tab="security">Security</button></div>`;

  const apiPane = `<section class="panel"><div class="section-head compact"><div><span class="eyebrow">Account Settings</span><h2>API Access</h2></div></div>${state.lastCreatedApiKey ? `<p class="form-note">Copy this new key now (shown once): <strong>${escapeHtml(state.lastCreatedApiKey)}</strong></p>` : ""}<form class="form-stack" data-form="account-settings-api"><label>Label<input name="label" placeholder="Website integration" required /></label><label>Scopes (comma separated)<input name="scopes" placeholder="invoices:write, reports:read" /></label><button class="primary full" type="submit" ${canGovern() ? "" : "disabled"}>Create API Key</button></form><div class="record-list">${apiKeys.length ? apiKeys.map((key) => `<article class="record-row"><div><strong>${escapeHtml(key.label || "API Key")}</strong><span>${escapeHtml(key.tokenPreview || key.tokenPrefix || "Token hidden")}</span></div><div class="row-end"><small>${escapeHtml(titleCase(key.status || "active"))}</small>${String(key.status || "").toLowerCase() === "active" ? `<button class="tiny" type="button" data-action="revoke-api-key" data-key-id="${escapeAttr(key.id || "")}">Revoke</button>` : ""}</div></article>`).join("") : `<div class="empty-state">No API keys yet.</div>`}</div></section>`;

  const emailPane = `<section class="panel"><div class="section-head compact"><div><span class="eyebrow">Account Settings</span><h2>Email Configuration</h2></div></div><form class="form-stack" data-form="account-settings-email"><label>SMTP Host<input name="smtpHost" value="${escapeAttr(email.smtpHost || "")}" placeholder="mail.privateemail.com" /></label><div class="split"><label>SMTP Port<input name="smtpPort" type="number" value="${escapeAttr(email.smtpPort || "")}" placeholder="465" /></label><label>Secure SMTP<select name="smtpSecure"><option value="off" ${email.smtpSecure ? "" : "selected"}>Off</option><option value="on" ${email.smtpSecure ? "selected" : ""}>On</option></select></label></div><label>SMTP User<input name="smtpUser" value="${escapeAttr(email.smtpUser || "")}" /></label><label>SMTP Password<input name="smtpPass" type="password" placeholder="Leave blank to keep existing" /></label><label>From Email<input name="fromEmail" value="${escapeAttr(email.fromEmail || "")}" /></label><label>From Name<input name="fromName" value="${escapeAttr(email.fromName || "")}" /></label><label>Reply-To Email<input name="replyToEmail" value="${escapeAttr(email.replyToEmail || "")}" /></label><button class="primary full" type="submit" ${canGovern() ? "" : "disabled"}>Save Email Configuration</button></form><form class="form-stack" data-form="account-settings-email-test"><label>Test Recipient<input name="to" type="email" value="${escapeAttr(state.user?.email || "")}" required /></label><label hidden>SMTP Host<input name="smtpHost" value="${escapeAttr(email.smtpHost || "")}" /></label><label hidden>SMTP Port<input name="smtpPort" value="${escapeAttr(email.smtpPort || "")}" /></label><label hidden>SMTP User<input name="smtpUser" value="${escapeAttr(email.smtpUser || "")}" /></label><label hidden>SMTP Password<input name="smtpPass" value="" /></label><label hidden>From Email<input name="fromEmail" value="${escapeAttr(email.fromEmail || "")}" /></label><label hidden>From Name<input name="fromName" value="${escapeAttr(email.fromName || "")}" /></label><label hidden>Reply-To Email<input name="replyToEmail" value="${escapeAttr(email.replyToEmail || "")}" /></label><label hidden>Secure<select name="smtpSecure"><option value="off" ${email.smtpSecure ? "" : "selected"}>Off</option><option value="on" ${email.smtpSecure ? "selected" : ""}>On</option></select></label><button class="secondary full" type="submit" ${canGovern() ? "" : "disabled"}>Send Test Email</button></form></section>`;

  const teamPane = `<section class="panel"><div class="section-head compact"><div><span class="eyebrow">Account Settings</span><h2>Business Team</h2></div></div><form class="form-stack" data-form="account-settings-team"><label>Name<input name="name" placeholder="Team member" /></label><label>Email<input name="email" type="email" required /></label><label>Role<select name="role"><option value="viewer">Viewer</option><option value="accountant">Accountant</option></select></label><button class="primary full" type="submit" ${canGovern() ? "" : "disabled"}>Add Team Member</button></form><div class="record-list">${team.length ? team.map((member) => `<article class="record-row"><div><strong>${escapeHtml(member.name || member.email || "Member")}</strong><span>${escapeHtml(member.email || "")}</span></div><div class="row-end"><small>${escapeHtml(titleCase(member.role || "viewer"))} · ${escapeHtml(titleCase(member.status || "active"))}</small>${String(member.status || "").toLowerCase() === "removed" ? `<button class="tiny" type="button" data-action="team-status" data-member-id="${escapeAttr(member.id || "")}" data-status="active">Activate</button>` : `<button class="tiny" type="button" data-action="team-status" data-member-id="${escapeAttr(member.id || "")}" data-status="removed">Remove</button>`}</div></article>`).join("") : `<div class="empty-state">No team members yet.</div>`}</div></section>`;

  const securityPane = `<section class="panel"><div class="section-head compact"><div><span class="eyebrow">Account Settings</span><h2>Security</h2></div></div><p class="form-note">Change password continues to use the existing secure account endpoint.</p><button class="secondary full" type="button" data-action="open-change-password">Open Change Password</button><div class="status-grid" style="margin-top:10px"><article><span>Business</span><strong>${escapeHtml(company?.name || workspaceName(state.activeWorkspace))}</strong></article><article><span>Email</span><strong>${escapeHtml(state.user?.email || "-")}</strong></article></div><p class="form-note" style="margin-top:10px">Account deletion is handled through the existing reviewed flow.</p><a class="secondary full action-link" href="/apps/web/delete-account.html">Review deletion options</a></section>`;

  const pane = tab === "email" ? emailPane : tab === "team" ? teamPane : tab === "security" ? securityPane : apiPane;
  return `${tabs}${pane}`;
}
function renderAgent() {
  const prompts = [
    "Show my sales summary for this month",
    "List my unpaid invoices",
    "Which are my top 5 customers?",
    "Show expenses by category",
    "What is my GST payable?",
    "Give me insights to improve cash flow"
  ];
  return `<section class="agent-header"><button class="tiny" type="button" data-route="home">\u2190 Back</button><div><span class="eyebrow">EazInvoice</span><h1>AI Agent</h1><p>Your business assistant, always ready.</p></div></section>
    <section class="agent-welcome"><div class="robot robot-${escapeAttr(state.aiRobotState)}" aria-label="Eazy, the EazInvoice AI Agent" role="img"><img class="robot-asset" src="./assets/eazy.png" alt="" /></div><div><h2>${state.aiConversation.length ? "What would you like to explore next?" : "Hi! I\u2019m Eazy, your EazInvoice AI Agent."}</h2><p>${state.aiConversation.length ? "Ask Eazy another question about this business." : "How can Eazy help you today?"}</p></div></section>
    <section class="agent-conversation">${state.aiConversation.map(agentMessage).join("")}</section>
    ${state.aiConversation.length ? "" : `<section class="prompt-grid">${prompts.map((prompt) => `<button class="secondary prompt-chip" type="button" data-agent-prompt="${escapeAttr(prompt)}">${escapeHtml(prompt)}</button>`).join("")}</section>`}
    <form class="agent-input" data-form="ai-agent"><input name="command" aria-label="Ask about your business" placeholder="Ask about your business\u2026" autocomplete="off" required /><button class="primary" type="submit">Send</button></form>`;
}

function agentMessage(message) {
  if (message.role === "user") return `<div class="agent-message user-message"><span>You</span><p>${escapeHtml(message.text)}</p></div>`;
  if (message.role === "error") return `<div class="agent-message error-message"><span>Agent</span><p>${escapeHtml(message.text)}</p><button class="secondary" type="button" data-route="agent">Retry</button></div>`;
  const result = message.result || {};
  return `<div class="agent-message agent-answer"><span>Agent \u00b7 ${escapeHtml(result.title || "Business insight")}</span><p>${escapeHtml(result.reply || result.summary || "Insight prepared from authorized EazInvoice data.")}</p>${(result.sections || []).map((section) => `<div class="answer-section"><strong>${escapeHtml(section.title || "Details")}</strong>${(section.items || []).map((item) => `<p>${escapeHtml(item)}</p>`).join("")}</div>`).join("")}<small>Facts, calculations and recommendations are based on authorized business context.</small></div>`;
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
  if (value === undefined) return null;
  if (value && typeof value === "object") {
    if (typeof value.total === "number") return value.total;
    if (typeof value.amount === "number") return value.amount;
    if (typeof value.value === "number") return value.value;
    if (typeof value.closingBalance === "number") return value.closingBalance;
    if (typeof value.net === "number") return value.net;
    return source?.totals?.[key] ?? source?.summary?.[key] ?? null;
  }
  return value;
}

function reportCard(title, subtitle, source, keys) {
  const entries = keys.map((key) => [key, reportValue(source, key)]).filter(([, value]) => value !== null);
  return `<article class="report-summary-card"><span class="metric-icon" aria-hidden="true">${iconSvg("chart")}</span><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p>${entries.slice(0, 2).map(([key, value]) => `<strong>${escapeHtml(typeof value === "number" ? money(value) : String(value))}</strong><small>${escapeHtml(titleCase(key))}</small>`).join("") || `<small>No data returned</small>`}</div></article>`;
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
  return `<div class="record-list party-grid">${records.slice(0, 20).map((record) => `
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
        <div class="row-end"><strong>${escapeHtml(money(amount, record.currency || "INR"))}</strong>${status ? `<small class="status-badge ${statusClass(status)}">${escapeHtml(titleCase(status))}</small>` : ""}</div>
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
  if (raw.length <= 4) return `\u2022\u2022${raw}`;
  return `\u2022\u2022\u2022\u2022 ${raw.slice(-4)}`;
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
