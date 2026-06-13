const API_BASE = typeof window !== "undefined" && window.location?.origin
  ? window.location.origin
  : "http://localhost:3001";

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { method = "GET", body, token } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

export const apiClient = {
  signup(body) {
    return request("/auth/signup", { method: "POST", body });
  },
  login(body) {
    return request("/auth/login", { method: "POST", body });
  },
  requestEmailOtp(body) {
    return request("/auth/email-otp/request", { method: "POST", body });
  },
  loginWithGoogle(body) {
    return request("/auth/google", { method: "POST", body });
  },
  adminLogin(body) {
    return request("/auth/admin", { method: "POST", body });
  },
  startGoogleOAuth(mode = "login") {
    return `${API_BASE}/auth/google/start?mode=${encodeURIComponent(mode)}`;
  },
  me(token) {
    return request("/me", { token });
  },
  updateMe(token, body) {
    return request("/me", { method: "PATCH", token, body });
  },
  getPlan(token) {
    return request("/plan/free", { token });
  },
  listCompanies(token) {
    return request("/companies", { token });
  },
  createCompany(token, body) {
    return request("/companies", { method: "POST", token, body });
  },
  updateCompany(token, companyId, body) {
    return request(`/companies/${companyId}`, { method: "PATCH", token, body });
  },
  listCustomers(token) {
    return request("/customers", { token });
  },
  createCustomer(token, body) {
    return request("/customers", { method: "POST", token, body });
  },
  listInvoices(token) {
    return request("/invoices", { token });
  },
  createInvoice(token, body) {
    return request("/invoices", { method: "POST", token, body });
  },
  updateInvoice(token, invoiceId, body) {
    return request(`/invoices/${invoiceId}`, { method: "PATCH", token, body });
  },
  deleteInvoice(token, invoiceId) {
    return request(`/invoices/${invoiceId}`, { method: "DELETE", token });
  },
  recordInvoicePayment(token, invoiceId, body) {
    return request(`/invoices/${invoiceId}/payments`, { method: "POST", token, body });
  },
  createInvoicePaymentLink(token, invoiceId, body = {}) {
    return request(`/invoices/${invoiceId}/payment-link`, { method: "POST", token, body });
  },
  listPayments(token) {
    return request("/payments", { token });
  },
  listPurchaseOrders(token) {
    return request("/purchase-orders", { token });
  },
  createPurchaseOrder(token, body) {
    return request("/purchase-orders", { method: "POST", token, body });
  },
  updatePurchaseOrder(token, poId, body) {
    return request(`/purchase-orders/${poId}`, { method: "PATCH", token, body });
  },
  deletePurchaseOrder(token, poId) {
    return request(`/purchase-orders/${poId}`, { method: "DELETE", token });
  },
  createSubscription(token, body) {
    return request("/subscriptions", { method: "POST", token, body });
  },
  listMySubscriptions(token) {
    return request("/subscriptions/me", { token });
  },
  createReport(token, body) {
    return request("/reports", { method: "POST", token, body });
  },
  uploadDocuments(token, files) {
    return request("/uploads", { method: "POST", token, body: { files } });
  },
  getAdminMoney(token) {
    return request("/admin/money", { token });
  },
  listAdminUsers(token) {
    return request("/admin/users", { token });
  },
  setAdminUserRestriction(token, userId, action, reason) {
    return request(`/admin/users/${userId}?action=${encodeURIComponent(action)}`, {
      method: "PATCH",
      token,
      body: { reason },
    });
  },
  setAdminUserPermissions(token, userId, permissions) {
    return request(`/admin/users/${userId}?action=permissions`, {
      method: "PATCH",
      token,
      body: { permissions },
    });
  },
  getAdminKycReview(token) {
    return request("/admin/kyc-review", { token });
  },
  reviewKyc(token, companyId, action, reason) {
    return request(`/admin/kyc-review/${companyId}?action=${encodeURIComponent(action)}`, {
      method: "PATCH",
      token,
      body: { reason },
    });
  },
  listReports(token) {
    return request("/reports", { token });
  },
};
