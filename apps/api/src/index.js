import { createStore } from "./store.js";
import { FREE_PLAN_LIMITS, resolvePlanUsageStatus } from "./plans.js";

export function createApi(deps = {}) {
  const store = deps.store ?? createStore();

  return {
    healthCheck() {
      return {
        ok: true,
        service: "eazinvoice-api",
      };
    },

    getFreePlanSummary(user) {
      const usage = user ? store.countUsageForUser(user) : store.countUsage();
      return {
        plan: "free",
        limits: FREE_PLAN_LIMITS,
        usage,
        status: resolvePlanUsageStatus(usage, FREE_PLAN_LIMITS),
      };
    },

    createCompany(input) {
      return store.createCompany(input);
    },

    listCompanies(user) {
      if (!user || user.role === "admin") return store.listCompanies();
      return store.listCompanies().filter((company) => company.ownerUserId === user.id);
    },

    updateCompanyKyc(companyId, updates) {
      return store.updateCompanyKyc(companyId, updates);
    },
    updateCompany(companyId, updates) {
      return store.updateCompany(companyId, updates);
    },

    createCustomer(input) {
      return store.createCustomer(input);
    },

    listCustomers(user) {
      if (!user || user.role === "admin") return store.listCustomers();
      const companyIds = new Set(store.listCompanies().filter((company) => company.ownerUserId === user.id).map((company) => company.id));
      return store.listCustomers().filter((customer) => customer.ownerUserId === user.id || companyIds.has(customer.companyId));
    },

    createInvoice(input) {
      return store.createInvoice(input, FREE_PLAN_LIMITS);
    },

    createPurchaseOrder(input) {
      return store.createPurchaseOrder(input, FREE_PLAN_LIMITS);
    },

    createUser(input) {
      return store.createUser(input);
    },

    listUsers() {
      return store.listUsers();
    },

    getUserById(id) {
      return store.getUserById(id);
    },

    getUserByEmail(email) {
      return store.getUserByEmail(email);
    },

    updateUserAuthDetails(userId, updates) {
      return store.updateUserAuthDetails(userId, updates);
    },

    updateUserProfile(userId, updates) {
      return store.updateUserProfile(userId, updates);
    },

    createSubscription(input) {
      return store.createSubscription(input);
    },

    createReport(input) {
      return store.createReport(input);
    },

    listSubscriptions() {
      return store.listSubscriptions();
    },

    listMonetization() {
      return store.listMonetization();
    },

    listReports(user) {
      return store.listReportsForUser(user);
    },

    summarizeMonetization() {
      return store.summarizeMonetization();
    },

    listInvoices(user) {
      return store.listInvoicesForUser(user);
    },

    getInvoice(id, user) {
      return store.getInvoice(id, user);
    },
    updateInvoice(id, updates) {
      return store.updateInvoice(id, updates, FREE_PLAN_LIMITS);
    },
    deleteInvoice(id, user) {
      return store.deleteInvoice(id, user);
    },
    recordInvoicePayment(id, input) {
      return store.recordInvoicePayment(id, input);
    },
    createInvoicePaymentLink(id, input) {
      return store.createInvoicePaymentLink(id, input);
    },
    recordGatewayPayment(input) {
      return store.recordGatewayPayment(input);
    },
    listPayments(user) {
      return store.listPaymentsForUser(user);
    },

    listPurchaseOrders(user) {
      return store.listPurchaseOrdersForUser(user);
    },

    getPurchaseOrder(id, user) {
      return store.getPurchaseOrder(id, user);
    },
    updatePurchaseOrder(id, updates) {
      return store.updatePurchaseOrder(id, updates, FREE_PLAN_LIMITS);
    },
    deletePurchaseOrder(id, user) {
      return store.deletePurchaseOrder(id, user);
    },

    listRestrictedUsers() {
      return store.listRestrictedUsers();
    },

    setUserRestriction(userId, updates) {
      return store.setUserRestriction(userId, updates);
    },

    setUserPermissions(userId, permissions) {
      return store.setUserPermissions(userId, permissions);
    },
  };
}

export function createDefaultApi() {
  return createApi();
}
