const API_BASE = typeof window !== "undefined" && window.location?.origin
  ? window.location.origin
  : "http://localhost:3001";

function authHeaders(token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (typeof window !== "undefined") {
    const previewPlan = window.localStorage?.getItem("eazinvoice_admin_plan_preview") || "";
    if (previewPlan) headers["X-Eazinvoice-Plan-Preview"] = previewPlan;
  }
  return headers;
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

function queryString(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : "";
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
  listPlans(token) {
    return request("/plans", { token });
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
  runRecurringInvoiceDrafts(token, body = {}) {
    return request("/invoices/recurring/run", { method: "POST", token, body });
  },
  createRazorpayOrder(token, body) {
    return request("/billing/razorpay/order", { method: "POST", token, body });
  },
  verifyRazorpayPayment(token, body) {
    return request("/billing/razorpay/verify", { method: "POST", token, body });
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
  runAiCommand(token, body) {
    return request("/ai/command", { method: "POST", token, body });
  },
  getAiUsage(token, filters = {}) {
    return request(`/ai/usage${queryString(filters)}`, { token });
  },
  getAdminAiUsage(token, filters = {}) {
    return request(`/admin/ai-usage${queryString(filters)}`, { token });
  },
  uploadDocuments(token, files) {
    return request("/uploads", { method: "POST", token, body: { files } });
  },
  getAdminMoney(token) {
    return request("/admin/money", { token });
  },
  getAdminGateway(token) {
    return request("/admin/gateway", { token });
  },
  getAdminPersistence(token) {
    return request("/admin/persistence", { token });
  },
  getAdminRecurringStatus(token) {
    return request("/admin/recurring/status", { token });
  },
  runAdminRecurringScheduler(token, body = {}) {
    return request("/admin/recurring/run", { method: "POST", token, body });
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
  getReportSummary(token, filters = {}) {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim()) {
        query.set(key, value);
      }
    });
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request(`/reports/summary${suffix}`, { token });
  },
  listTeamMembers(token) {
    return request("/business/team", { token });
  },
  createTeamMember(token, body) {
    return request("/business/team", { method: "POST", token, body });
  },
  updateTeamMember(token, memberId, body) {
    return request(`/business/team/${memberId}`, { method: "PATCH", token, body });
  },
  acceptTeamInvite(token, inviteToken) {
    return request("/business/team/accept", { method: "POST", token, body: { inviteToken } });
  },
  getBusinessSettings(token) {
    return request("/business/settings", { token });
  },
  updateBusinessSettings(token, body) {
    return request("/business/settings", { method: "PATCH", token, body });
  },
  validateBusinessEmailSettings(token, body) {
    return request("/business/settings/email/test", { method: "POST", token, body });
  },
  listApprovalRequests(token) {
    return request("/business/approvals", { token });
  },
  createApprovalRequest(token, body) {
    return request("/business/approvals", { method: "POST", token, body });
  },
  decideApprovalRequest(token, approvalId, body) {
    return request(`/business/approvals/${approvalId}`, { method: "PATCH", token, body });
  },
  listApiKeys(token) {
    return request("/business/api-keys", { token });
  },
  createApiKey(token, body) {
    return request("/business/api-keys", { method: "POST", token, body });
  },
  revokeApiKey(token, apiKeyId) {
    return request(`/business/api-keys/${apiKeyId}`, { method: "DELETE", token });
  },
};
