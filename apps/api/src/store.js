import crypto from "node:crypto";
import { loadPersistedState, savePersistedState } from "./persistence.js";
import {
  assessComplianceProfile,
  buildComplianceReminderDigest,
  generateComplianceSchedule,
  normalizeComplianceProfile,
  summarizeComplianceTasks,
} from "./compliance-engine.js";

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function nextId(prefix, counter) {
  return `${prefix}_${String(counter).padStart(4, "0")}`;
}

function makeCodeFromText(text, fallback) {
  const cleaned = String(text || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
  return cleaned.slice(0, 8) || fallback;
}

function makeInitialCode(text, fallback = "INV") {
  const words = String(text || "")
    .trim()
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  if (words.length >= 2) return words.map((word) => word[0]).join("").slice(0, 4);
  return makeCodeFromText(words[0] || "", fallback).slice(0, 4) || fallback;
}

function formatDocumentNumber(code, dateValue, sequence) {
  const year = String(dateValue || new Date().toISOString()).slice(0, 4);
  return `${code}/${year}/${String(sequence).padStart(4, "0")}`;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function addDays(dateValue, days) {
  const date = new Date(String(dateValue || "") + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeRecordStatus(value, fallback = "draft") {
  return String(value || fallback).trim().toLowerCase() || fallback;
}

function assertInvoiceCanBeEdited(invoice) {
  if (normalizeRecordStatus(invoice?.status) === "deleted") {
    throw new Error("Deleted invoices cannot be edited.");
  }
}

function assertPurchaseOrderCanBeEdited(purchaseOrder) {
  if (normalizeRecordStatus(purchaseOrder?.status, "created") === "deleted") {
    throw new Error("Deleted purchase/work orders cannot be edited.");
  }
}

function assertInvoiceCanReceivePayment(invoice) {
  const status = normalizeRecordStatus(invoice?.status);
  if (status === "draft") {
    throw new Error("Create the invoice before recording payment.");
  }
  if (status === "deleted") {
    throw new Error("Deleted invoices cannot receive payments.");
  }
  if (normalizeRecordStatus(invoice?.paymentStatus, "") === "paid" || toNumber(invoice?.balanceAmount, invoice?.total) <= 0) {
    throw new Error("Invoice is already fully paid.");
  }
}

function isActivePaidSubscription(subscription) {
  return String(subscription.status || "active").toLowerCase() === "active"
    && String(subscription.plan || "free").toLowerCase() !== "free"
    && toNumber(subscription.amount) > 0;
}

function isActiveSubscription(subscription) {
  return String(subscription?.status || "active").toLowerCase() === "active";
}

function nextSubscriptionRenewalDate(fromDate, billingCycle = "yearly") {
  const base = new Date(fromDate || Date.now());
  const renewalDate = Number.isNaN(base.getTime()) ? new Date() : base;
  if (billingCycle === "monthly") {
    renewalDate.setUTCMonth(renewalDate.getUTCMonth() + 1);
  } else {
    renewalDate.setUTCFullYear(renewalDate.getUTCFullYear() + 1);
  }
  return renewalDate;
}

function parseDateOnly(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function normalizeRecurringFrequency(value) {
  const normalized = String(value || "monthly").trim().toLowerCase();
  return ["weekly", "monthly", "quarterly", "yearly"].includes(normalized) ? normalized : "monthly";
}

function addMonthsClamped(date, months) {
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

function nextRecurringDate(date, frequency) {
  const next = new Date(date.getTime());
  if (frequency === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }
  if (frequency === "quarterly") return addMonthsClamped(date, 3);
  if (frequency === "yearly") return addMonthsClamped(date, 12);
  return addMonthsClamped(date, 1);
}

function dateDiffDays(from, to) {
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export function createStore(seed = {}, options = {}) {
  const usePersistence = options.persist !== false;
  const persistenceAdapter = options.persistenceAdapter || {
    load: loadPersistedState,
    save: savePersistedState,
  };
  const persisted = usePersistence ? persistenceAdapter.load() : {};
  const state = {
    users: [],
    companies: [],
    customers: [],
    vendors: [],
    invoices: [],
    purchaseOrders: [],
    payments: [],
    subscriptions: [],
    billingOrders: [],
    monetization: [],
    reports: [],
    aiUsageLogs: [],
    teamMembers: [],
    approvalRequests: [],
    apiKeys: [],
    businessSettings: [],
    complianceTasks: [],
    counters: {
      user: 0,
      company: 0,
      customer: 0,
      vendor: 0,
      invoice: 0,
      purchaseOrder: 0,
      payment: 0,
      subscription: 0,
      billingOrder: 0,
      monetization: 0,
      report: 0,
      aiUsageLog: 0,
      teamMember: 0,
      approvalRequest: 0,
      apiKey: 0,
      businessSetting: 0,
      complianceTask: 0,
    },
    ...clone(seed),
    ...clone(persisted),
  };

  state.counters = {
    user: 0,
    company: 0,
    customer: 0,
    vendor: 0,
    invoice: 0,
    purchaseOrder: 0,
    payment: 0,
    subscription: 0,
    billingOrder: 0,
    monetization: 0,
    report: 0,
    aiUsageLog: 0,
    teamMember: 0,
    approvalRequest: 0,
    apiKey: 0,
    businessSetting: 0,
    complianceTask: 0,
    ...(clone(seed).counters || {}),
    ...(clone(persisted).counters || {}),
  };

  function persist() {
    if (!usePersistence) return;
    persistenceAdapter.save({
      users: state.users,
      companies: state.companies,
      customers: state.customers,
      vendors: state.vendors,
      invoices: state.invoices,
      purchaseOrders: state.purchaseOrders,
      payments: state.payments,
      subscriptions: state.subscriptions,
      billingOrders: state.billingOrders,
      monetization: state.monetization,
      reports: state.reports,
      aiUsageLogs: state.aiUsageLogs,
      teamMembers: state.teamMembers,
      approvalRequests: state.approvalRequests,
      apiKeys: state.apiKeys,
      businessSettings: state.businessSettings,
      complianceTasks: state.complianceTasks,
      counters: state.counters,
    });
  }

  function createUser(input) {
    const user = {
      id: nextId("usr", ++state.counters.user),
      name: input.name.trim(),
      email: input.email.trim(),
      phone: input.phone?.trim() ?? "",
      mobileVerified: input.mobileVerified ?? false,
      emailVerified: input.emailVerified ?? false,
      passwordHash: input.passwordHash ?? "",
      subscriberType: input.subscriberType ?? "individual",
      panNumber: input.panNumber?.trim() ?? "",
      aadhaarNumber: input.aadhaarNumber?.trim() ?? "",
      registrant: input.registrant ?? null,
      role: input.role ?? "user",
      permissions: Array.isArray(input.permissions) ? input.permissions : [],
      accountStatus: input.accountStatus ?? "active",
      restrictedReason: input.restrictedReason ?? "",
      restrictedAt: input.restrictedAt ?? "",
      createdAt: new Date().toISOString(),
    };
    state.users.push(user);
    persist();
    return clone(user);
  }

  function listUsers() {
    return clone(state.users);
  }

  function getUserById(id) {
    const user = state.users.find((entry) => entry.id === id);
    return user ? clone(user) : null;
  }

  function getUserByEmail(email) {
    const normalized = String(email || "").trim().toLowerCase();
    const user = state.users.find((entry) => entry.email.toLowerCase() === normalized);
    return user ? clone(user) : null;
  }

  function updateUserAuthDetails(userId, updates) {
    const user = state.users.find((entry) => entry.id === userId);
    if (!user) return null;
    if (updates.phone !== undefined) user.phone = String(updates.phone || "").trim();
    if (updates.mobileVerified !== undefined) user.mobileVerified = Boolean(updates.mobileVerified);
    if (updates.emailVerified !== undefined) user.emailVerified = Boolean(updates.emailVerified);
    if (updates.passwordHash !== undefined) user.passwordHash = String(updates.passwordHash || "");
    if (updates.subscriberType !== undefined) user.subscriberType = String(updates.subscriberType || "individual");
    if (updates.registrant !== undefined) user.registrant = updates.registrant;
    persist();
    return clone(user);
  }

  function updateUserProfile(userId, updates) {
    const user = state.users.find((entry) => entry.id === userId);
    if (!user) return null;
    if (updates.name !== undefined) user.name = String(updates.name || "").trim();
    if (updates.phone !== undefined) user.phone = String(updates.phone || "").trim();
    if (updates.panNumber !== undefined) user.panNumber = String(updates.panNumber || "").trim();
    if (updates.aadhaarNumber !== undefined) user.aadhaarNumber = String(updates.aadhaarNumber || "").trim();
    if (updates.subscriberType !== undefined) user.subscriberType = String(updates.subscriberType || "individual");
    if (updates.registrant !== undefined) user.registrant = updates.registrant;
    persist();
    return clone(user);
  }

  function createCompany(input) {
    const ownerUserId = input.ownerUserId ?? null;
    const companyCode = input.companyCode || makeCodeFromText(input.name, `CMP${state.counters.company + 1}`);
    const company = {
      id: nextId("cmp", ++state.counters.company),
      ownerUserId,
      companyCode,
      entityType: input.entityType ?? "company",
      name: input.name.trim(),
      legalName: input.legalName?.trim() ?? "",
      businessType: input.businessType?.trim() ?? "",
      gstRegistered: Boolean(input.gstRegistered),
      address: input.address?.trim() ?? "",
      state: input.state?.trim() ?? "",
      pincode: input.pincode?.trim() ?? "",
      gstNumber: input.gstNumber?.trim() ?? "",
      panNumber: input.panNumber?.trim() ?? "",
      logoUrl: input.logoUrl?.trim() ?? "",
      upiId: input.upiId?.trim() ?? "",
      bankDetails: input.bankDetails?.trim() ?? "",
      kycStatus: input.kycStatus ?? "pending",
      kycMode: input.kycMode ?? "document-review",
      kycDocumentType: input.kycDocumentType ?? "",
      aadhaarLast4: input.aadhaarLast4?.trim() ?? "",
      addressProof: input.addressProof?.trim() ?? "",
      documentNames: Array.isArray(input.documentNames) ? input.documentNames : [],
      documentFiles: Array.isArray(input.documentFiles) ? input.documentFiles : [],
      reviewStatus: input.reviewStatus ?? "pending",
      reviewNotes: input.reviewNotes ?? "",
      reviewedAt: input.reviewedAt ?? "",
      email: input.email?.trim() ?? "",
      phone: input.phone?.trim() ?? "",
      createdAt: new Date().toISOString(),
    };
    state.companies.push(company);
    persist();
    return clone(company);
  }

  function listCompanies() {
    return clone(state.companies);
  }

  function updateCompanyKyc(companyId, updates) {
    const company = state.companies.find((entry) => entry.id === companyId);
    if (!company) return null;
    if (typeof updates.kycStatus === "string") company.kycStatus = updates.kycStatus;
    if (typeof updates.reviewStatus === "string") company.reviewStatus = updates.reviewStatus;
    if (typeof updates.reviewNotes === "string") company.reviewNotes = updates.reviewNotes;
    if (typeof updates.reviewedAt === "string") company.reviewedAt = updates.reviewedAt;
    if (Array.isArray(updates.documentFiles)) company.documentFiles = updates.documentFiles;
    persist();
    return clone(company);
  }

  function updateCompany(companyId, updates) {
    const company = state.companies.find((entry) => entry.id === companyId);
    if (!company) return null;
    [
      "name",
      "legalName",
      "businessType",
      "address",
      "state",
      "pincode",
      "gstNumber",
      "panNumber",
      "phone",
      "email",
      "upiId",
      "bankDetails",
    ].forEach((field) => {
      if (updates[field] !== undefined) company[field] = String(updates[field] || "").trim();
    });
    if (updates.entityType !== undefined) company.entityType = String(updates.entityType || company.entityType);
    if (updates.gstRegistered !== undefined) company.gstRegistered = Boolean(updates.gstRegistered);
    persist();
    return clone(company);
  }

  function createCustomer(input) {
    const customerSequence = state.counters.customer + 1;
    const customer = {
      id: nextId("cus", ++state.counters.customer),
      customerCode: input.customerCode?.trim() || `CUS-${String(customerSequence).padStart(4, "0")}`,
      ownerUserId: input.ownerUserId ?? null,
      name: input.name.trim(),
      businessName: input.businessName?.trim() ?? "",
      gstNumber: input.gstNumber?.trim() ?? "",
      panNumber: input.panNumber?.trim() ?? "",
      email: input.email?.trim() ?? "",
      phone: input.phone?.trim() ?? "",
      billingAddress: input.billingAddress?.trim() ?? input.address?.trim() ?? "",
      shippingAddress: input.shippingAddress?.trim() ?? "",
      notes: input.notes?.trim() ?? "",
      companyId: input.companyId ?? null,
      createdAt: new Date().toISOString(),
    };
    state.customers.push(customer);
    persist();
    return clone(customer);
  }

  function listCustomers() {
    return clone(state.customers);
  }

  function getCustomer(id) {
    return clone(state.customers.find((entry) => entry.id === id) || null);
  }

  function updateCustomer(id, updates = {}) {
    const customer = state.customers.find((entry) => entry.id === id);
    if (!customer) return null;
    [
      "customerType",
      "name",
      "businessName",
      "gstNumber",
      "panNumber",
      "email",
      "phone",
      "billingAddress",
      "shippingAddress",
      "notes",
    ].forEach((field) => {
      if (updates[field] !== undefined) customer[field] = String(updates[field] || "").trim();
    });
    if (updates.address !== undefined && updates.billingAddress === undefined) {
      customer.billingAddress = String(updates.address || "").trim();
    }
    if (updates.companyId !== undefined) customer.companyId = updates.companyId || null;
    customer.updatedAt = new Date().toISOString();
    persist();
    return clone(customer);
  }

  function deleteCustomer(id) {
    const customer = state.customers.find((entry) => entry.id === id);
    if (!customer) return null;
    customer.status = "deleted";
    customer.deletedAt = new Date().toISOString();
    customer.updatedAt = customer.deletedAt;
    persist();
    return clone(customer);
  }

  function reactivateCustomer(id) {
    const customer = state.customers.find((entry) => entry.id === id);
    if (!customer) return null;
    customer.status = "active";
    customer.deletedAt = "";
    customer.updatedAt = new Date().toISOString();
    persist();
    return clone(customer);
  }

  function createVendor(input) {
    const vendorSequence = state.counters.vendor + 1;
    const vendor = {
      id: nextId("ven", ++state.counters.vendor),
      vendorCode: input.vendorCode?.trim() || `VEN-${String(vendorSequence).padStart(4, "0")}`,
      ownerUserId: input.ownerUserId ?? null,
      vendorType: input.vendorType?.trim() || input.category?.trim() || "business",
      name: input.name?.trim() || input.vendorName?.trim() || input.businessName?.trim() || "",
      businessName: input.businessName?.trim() || "",
      gstNumber: input.gstNumber?.trim() ?? input.gstin?.trim() ?? "",
      panNumber: input.panNumber?.trim() ?? input.pan?.trim() ?? "",
      email: input.email?.trim() ?? "",
      phone: input.phone?.trim() ?? input.mobile?.trim() ?? "",
      billingAddress: input.billingAddress?.trim() ?? input.address?.trim() ?? "",
      shippingAddress: input.shippingAddress?.trim() ?? "",
      notes: input.notes?.trim() ?? "",
      companyId: input.companyId ?? null,
      status: input.status?.trim() || "active",
      createdAt: new Date().toISOString(),
    };
    state.vendors.push(vendor);
    persist();
    return clone(vendor);
  }

  function listVendors() {
    return clone(state.vendors);
  }

  function getVendor(id) {
    return clone(state.vendors.find((entry) => entry.id === id) || null);
  }

  function updateVendor(id, updates = {}) {
    const vendor = state.vendors.find((entry) => entry.id === id);
    if (!vendor) return null;
    [
      "vendorType",
      "name",
      "businessName",
      "gstNumber",
      "panNumber",
      "email",
      "phone",
      "billingAddress",
      "shippingAddress",
      "notes",
    ].forEach((field) => {
      if (updates[field] !== undefined) vendor[field] = String(updates[field] || "").trim();
    });
    if (updates.address !== undefined && updates.billingAddress === undefined) {
      vendor.billingAddress = String(updates.address || "").trim();
    }
    if (updates.companyId !== undefined) vendor.companyId = updates.companyId || null;
    vendor.updatedAt = new Date().toISOString();
    persist();
    return clone(vendor);
  }

  function deleteVendor(id) {
    const vendor = state.vendors.find((entry) => entry.id === id);
    if (!vendor) return null;
    vendor.status = "deleted";
    vendor.deletedAt = new Date().toISOString();
    vendor.updatedAt = vendor.deletedAt;
    persist();
    return clone(vendor);
  }

  function reactivateVendor(id) {
    const vendor = state.vendors.find((entry) => entry.id === id);
    if (!vendor) return null;
    vendor.status = "active";
    vendor.deletedAt = "";
    vendor.updatedAt = new Date().toISOString();
    persist();
    return clone(vendor);
  }

  function calculateInvoiceTotals(items, taxRate, adjustments = {}) {
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
    const itemDiscount = items.reduce((sum, item) => sum + Math.min(item.quantity * item.rate, toNumber(item.discount)), 0);
    const discount = itemDiscount + toNumber(adjustments.discount);
    const shipping = toNumber(adjustments.shipping);
    const roundOff = toNumber(adjustments.roundOff);
    const taxableAmount = Math.max(0, subtotal - discount);
    const taxAmount = items.reduce((sum, item) => {
      const itemTotal = item.quantity * item.rate;
      const itemShare = subtotal > 0 ? itemTotal / subtotal : 0;
      const itemDiscountValue = Math.min(itemTotal, toNumber(item.discount));
      const itemTaxable = Math.max(0, itemTotal - itemDiscountValue - toNumber(adjustments.discount) * itemShare);
      return sum + (itemTaxable * toNumber(item.gstRate, taxRate)) / 100;
    }, 0);
    const total = taxableAmount + taxAmount + shipping + roundOff;
    return {
      subtotal,
      discount,
      taxableAmount,
      taxAmount,
      shipping,
      roundOff,
      total,
    };
  }

  function createInvoice(input, limits) {
    const rawItems = Array.isArray(input.items) ? input.items : [];
    const items = rawItems.map((item) => ({
      description: String(item.description || "").trim(),
      hsnSac: String(item.hsnSac || "").trim(),
      unit: String(item.unit || "").trim(),
      quantity: toNumber(item.quantity),
      rate: toNumber(item.rate),
      discount: toNumber(item.discount),
      gstRate: toNumber(item.gstRate, toNumber(input.taxRate)),
    }));

    if (items.length > limits.invoiceItemsPerInvoice) {
      throw new Error("invoice items exceed active plan limit");
    }

    const totals = calculateInvoiceTotals(items, toNumber(input.taxRate), input);
    const ownerUserId = input.ownerUserId ?? null;
    const company = state.companies.find((entry) => entry.id === input.companyId) ?? null;
    const owner = state.users.find((entry) => entry.id === ownerUserId) ?? null;
    const status = normalizeRecordStatus(input.status, "draft");
    const invoiceCode = input.invoiceCode || (company
      ? makeCodeFromText(company.companyCode || company.name, `INV${state.counters.invoice + 1}`)
      : makeInitialCode(input.ownerCode || owner?.name, "IND"));
    const invoiceSequence = state.counters.invoice + 1;
    const invoice = {
      id: nextId("inv", ++state.counters.invoice),
      ownerUserId,
      companyId: input.companyId ?? null,
      invoiceCode,
      invoiceNumber: input.invoiceNumber?.trim() || formatDocumentNumber(invoiceCode, input.invoiceDate, invoiceSequence),
      status,
      paymentStatus: status === "draft" ? "draft" : input.paymentStatus?.trim() || "unpaid",
      paidAmount: toNumber(input.paidAmount),
      balanceAmount: 0,
      paymentGateway: null,
      paymentLink: null,
      customerId: input.customerId ?? null,
      invoiceDate: input.invoiceDate ?? new Date().toISOString().slice(0, 10),
      dueDate: input.dueDate ?? "",
      currency: input.currency?.trim() ?? "INR",
      paymentTerms: input.paymentTerms?.trim() ?? "",
      placeOfSupply: input.placeOfSupply?.trim() ?? "",
      taxRate: toNumber(input.taxRate),
      gstMode: input.gstMode?.trim() ?? "intra",
      modeOfDelivery: input.modeOfDelivery?.trim() ?? "",
      modeOfPayment: input.modeOfPayment?.trim() ?? "",
      notes: input.notes?.trim() ?? "",
      paymentInstructions: input.paymentInstructions?.trim() ?? "",
      terms: input.terms?.trim() ?? "",
      recurringEnabled: Boolean(input.recurringEnabled),
      recurringFrequency: input.recurringFrequency ? normalizeRecurringFrequency(input.recurringFrequency) : "",
      recurringNextDate: input.recurringNextDate?.trim() ?? "",
      recurringSourceInvoiceId: input.recurringSourceInvoiceId?.trim() ?? "",
      recurringGeneratedForDate: input.recurringGeneratedForDate?.trim() ?? "",
      hideEazinvoiceBranding: Boolean(input.hideEazinvoiceBranding),
      billToName: input.billToName?.trim() ?? "",
      billToAddress: input.billToAddress?.trim() ?? "",
      items,
      ...totals,
      createdAt: new Date().toISOString(),
    };
    invoice.balanceAmount = Math.max(0, invoice.total - invoice.paidAmount);
    refreshInvoicePaymentStatus(invoice);
    state.invoices.push(invoice);
    persist();
    return clone(invoice);
  }

  function createPurchaseOrder(input, limits) {
    const rawItems = Array.isArray(input.items) ? input.items : [];
    const items = rawItems.map((item) => ({
      description: String(item.description || "").trim(),
      hsnSac: String(item.hsnSac || "").trim(),
      unit: String(item.unit || "").trim(),
      quantity: toNumber(item.quantity),
      rate: toNumber(item.rate),
      discount: toNumber(item.discount),
      gstRate: toNumber(item.gstRate, toNumber(input.taxRate)),
    }));

    if (items.length > limits.invoiceItemsPerInvoice) {
      throw new Error("purchase/work order items exceed active plan limit");
    }

    const totals = calculateInvoiceTotals(items, toNumber(input.taxRate), input);
    const ownerUserId = input.ownerUserId ?? null;
    const company = state.companies.find((entry) => entry.id === input.companyId) ?? null;
    const status = normalizeRecordStatus(input.status, "created");
    const poCode = input.poCode || makeCodeFromText(company?.companyCode || input.ownerCode || "PO", `PO${state.counters.purchaseOrder + 1}`);
    const poSequence = String(state.counters.purchaseOrder + 1).padStart(4, "0");
    const vendorCode = input.vendorCode?.trim() || `VEN-${poSequence}`;
    const purchaseOrder = {
      id: nextId("po", ++state.counters.purchaseOrder),
      ownerUserId,
      companyId: input.companyId ?? null,
      vendorCode,
      documentType: input.documentType?.trim() || "po",
      poCode,
      poNumber: input.poNumber?.trim() ?? `${poCode}-${poSequence}`,
      status,
      customerId: input.customerId ?? null,
      poDate: input.poDate ?? new Date().toISOString().slice(0, 10),
      dueDate: input.dueDate ?? "",
      currency: input.currency?.trim() ?? "INR",
      paymentTerms: input.paymentTerms?.trim() ?? "",
      placeOfSupply: input.placeOfSupply?.trim() ?? "",
      taxRate: Number(input.taxRate ?? 0),
      gstMode: input.gstMode?.trim() ?? "intra",
      modeOfDelivery: input.modeOfDelivery?.trim() ?? "",
      modeOfPayment: input.modeOfPayment?.trim() ?? "",
      notes: input.notes?.trim() ?? "",
      paymentInstructions: input.paymentInstructions?.trim() ?? "",
      terms: input.terms?.trim() ?? "",
      billToName: input.billToName?.trim() ?? "",
      billToAddress: input.billToAddress?.trim() ?? "",
      items,
      ...totals,
      createdAt: new Date().toISOString(),
    };
    state.purchaseOrders.push(purchaseOrder);
    persist();
    return clone(purchaseOrder);
  }

  function createSubscription(input) {
    const existingGatewaySubscription = input.gatewayOrderId || input.gatewayPaymentId
      ? state.subscriptions.find((subscription) => (
        (input.gatewayOrderId && subscription.gatewayOrderId === input.gatewayOrderId)
        || (input.gatewayPaymentId && subscription.gatewayPaymentId === input.gatewayPaymentId)
      ))
      : null;
    if (existingGatewaySubscription) return clone(existingGatewaySubscription);

    const amount = Number(input.amount ?? 0);
    const billingCycle = input.billingCycle ?? "yearly";
    const createdAt = new Date().toISOString();
    const renewalDate = nextSubscriptionRenewalDate(createdAt, billingCycle);
    const subscription = {
      id: nextId("sub", ++state.counters.subscription),
      subscriberType: input.subscriberType ?? "individual",
      subscriberName: input.subscriberName?.trim() ?? "",
      companyId: input.companyId ?? null,
      userId: input.userId ?? null,
      groupName: input.groupName?.trim() ?? "",
      plan: input.plan ?? "free",
      amount,
      monthlyAmount: toNumber(input.monthlyAmount),
      annualAmount: toNumber(input.annualAmount ?? amount),
      currency: input.currency ?? "INR",
      billingCycle,
      status: input.status ?? "active",
      adminUserId: input.adminUserId ?? null,
      gateway: input.gateway?.trim() || "",
      gatewayPaymentId: input.gatewayPaymentId?.trim() || "",
      gatewayOrderId: input.gatewayOrderId?.trim() || "",
      previousSubscriptionId: input.previousSubscriptionId || "",
      lifecycleAction: input.lifecycleAction || "",
      startedAt: input.startedAt ?? createdAt,
      expiresAt: input.expiresAt ?? renewalDate.toISOString(),
      renewsAt: input.renewsAt ?? renewalDate.toISOString(),
      createdAt,
    };
    if (isActiveSubscription(subscription)) {
      state.subscriptions.forEach((entry) => {
        const sameAccount = subscription.userId
          ? entry.userId === subscription.userId
          : subscription.companyId && entry.companyId === subscription.companyId;
        if (sameAccount && isActivePaidSubscription(entry)) {
          entry.status = "superseded";
          entry.supersededAt = createdAt;
          entry.supersededByGatewayOrderId = subscription.gatewayOrderId || "";
          entry.supersededBySubscriptionId = subscription.id;
        }
      });
    }
    state.subscriptions.push(subscription);
    state.monetization.push({
      id: nextId("mon", ++state.counters.monetization),
      subscriptionId: subscription.id,
      adminUserId: subscription.adminUserId,
      sourceType: subscription.subscriberType,
      sourceName: subscription.subscriberName || subscription.groupName || "Unnamed",
      amount,
      currency: subscription.currency,
      createdAt: subscription.createdAt,
    });
    persist();
    return clone(subscription);
  }

  function createBillingOrder(input) {
    const existing = state.billingOrders.find((order) => order.gatewayOrderId === input.gatewayOrderId);
    if (existing) return clone(existing);
    const order = {
      id: nextId("bo", ++state.counters.billingOrder),
      gateway: input.gateway?.trim() || "razorpay",
      gatewayOrderId: input.gatewayOrderId?.trim() || "",
      kind: input.kind?.trim() || "subscription",
      userId: input.userId ?? null,
      invoiceId: input.invoiceId ?? null,
      companyId: input.companyId ?? null,
      plan: input.plan ?? "",
      amount: toNumber(input.amount),
      monthlyAmount: toNumber(input.monthlyAmount),
      annualAmount: toNumber(input.annualAmount ?? input.amount),
      currency: input.currency ?? "INR",
      billingCycle: input.billingCycle ?? "",
      description: input.description ?? "",
      status: input.status ?? "created",
      gatewayPaymentId: input.gatewayPaymentId?.trim() || "",
      verifiedAt: input.verifiedAt ?? "",
      consumedAt: input.consumedAt ?? "",
      createdAt: new Date().toISOString(),
    };
    state.billingOrders.push(order);
    persist();
    return clone(order);
  }

  function getBillingOrderByGatewayOrderId(gatewayOrderId) {
    const order = state.billingOrders.find((entry) => entry.gatewayOrderId === gatewayOrderId);
    return order ? clone(order) : null;
  }

  function updateBillingOrder(gatewayOrderId, updates) {
    const order = state.billingOrders.find((entry) => entry.gatewayOrderId === gatewayOrderId);
    if (!order) return null;
    ["status", "gatewayPaymentId", "verifiedAt", "consumedAt", "description"].forEach((field) => {
      if (updates[field] !== undefined) order[field] = String(updates[field] || "");
    });
    if (updates.amount !== undefined) order.amount = toNumber(updates.amount);
    persist();
    return clone(order);
  }

  function listBillingOrders() {
    return clone(state.billingOrders);
  }

  function listSubscriptions() {
    return clone(state.subscriptions);
  }

  function listSubscriptionsForUser(userId) {
    return clone(state.subscriptions.filter((subscription) => subscription.userId === userId));
  }

  function getSubscription(id) {
    const subscription = state.subscriptions.find((entry) => entry.id === id);
    return subscription ? clone(subscription) : null;
  }

  function updateSubscription(id, updates = {}) {
    const subscription = state.subscriptions.find((entry) => entry.id === id);
    if (!subscription) return null;
    const updatedAt = new Date().toISOString();
    [
      "subscriberType",
      "subscriberName",
      "companyId",
      "userId",
      "groupName",
      "plan",
      "currency",
      "billingCycle",
      "status",
      "gateway",
      "gatewayPaymentId",
      "gatewayOrderId",
      "startedAt",
      "expiresAt",
      "renewsAt",
      "cancelledAt",
      "cancellationReason",
      "expiredAt",
      "renewedAt",
      "supersededAt",
      "supersededByGatewayOrderId",
      "supersededBySubscriptionId",
      "previousSubscriptionId",
    ].forEach((field) => {
      if (updates[field] !== undefined) subscription[field] = updates[field] ?? "";
    });
    if (updates.amount !== undefined) subscription.amount = toNumber(updates.amount);
    if (updates.monthlyAmount !== undefined) subscription.monthlyAmount = toNumber(updates.monthlyAmount);
    if (updates.annualAmount !== undefined) subscription.annualAmount = toNumber(updates.annualAmount);
    if (updates.renewalCount !== undefined) subscription.renewalCount = toNumber(updates.renewalCount);
    subscription.updatedAt = updatedAt;
    persist();
    return clone(subscription);
  }

  function cancelSubscription(id, input = {}) {
    const now = new Date().toISOString();
    return updateSubscription(id, {
      status: "cancelled",
      cancelledAt: input.cancelledAt || now,
      cancellationReason: String(input.reason || input.cancellationReason || "").trim(),
      expiresAt: input.expiresAt || now,
      renewsAt: input.renewsAt || "",
    });
  }

  function renewSubscription(id, input = {}) {
    const subscription = state.subscriptions.find((entry) => entry.id === id);
    if (!subscription) return null;
    const now = new Date();
    const existingExpiry = subscription.expiresAt ? new Date(subscription.expiresAt) : null;
    const base = existingExpiry && !Number.isNaN(existingExpiry.getTime()) && existingExpiry > now
      ? existingExpiry
      : now;
    const renewalDate = input.expiresAt
      ? new Date(input.expiresAt)
      : nextSubscriptionRenewalDate(base.toISOString(), input.billingCycle || subscription.billingCycle || "yearly");
    const renewedAt = new Date().toISOString();
    return updateSubscription(id, {
      status: "active",
      amount: input.amount ?? subscription.amount,
      monthlyAmount: input.monthlyAmount ?? subscription.monthlyAmount,
      annualAmount: input.annualAmount ?? subscription.annualAmount,
      currency: input.currency ?? subscription.currency,
      billingCycle: input.billingCycle ?? subscription.billingCycle,
      gateway: input.gateway ?? subscription.gateway,
      gatewayPaymentId: input.gatewayPaymentId ?? subscription.gatewayPaymentId,
      gatewayOrderId: input.gatewayOrderId ?? subscription.gatewayOrderId,
      expiresAt: Number.isNaN(renewalDate.getTime()) ? subscription.expiresAt : renewalDate.toISOString(),
      renewsAt: Number.isNaN(renewalDate.getTime()) ? subscription.renewsAt : renewalDate.toISOString(),
      renewedAt,
      renewalCount: toNumber(subscription.renewalCount) + 1,
    });
  }

  function expireSubscriptions(nowInput = new Date()) {
    const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
    if (Number.isNaN(now.getTime())) return [];
    const expiredAt = now.toISOString();
    const expired = [];
    state.subscriptions.forEach((subscription) => {
      if (!isActiveSubscription(subscription) || !subscription.expiresAt) return;
      const expiresAt = new Date(subscription.expiresAt);
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt <= now) {
        subscription.status = "expired";
        subscription.expiredAt = expiredAt;
        subscription.updatedAt = expiredAt;
        expired.push(clone(subscription));
      }
    });
    if (expired.length) persist();
    return expired;
  }

  function listMonetization() {
    return clone(state.monetization);
  }

  function summarizeMonetization() {
    const totalAmount = state.monetization.reduce((sum, entry) => sum + entry.amount, 0);
    const byType = state.monetization.reduce((acc, entry) => {
      acc[entry.sourceType] = (acc[entry.sourceType] ?? 0) + entry.amount;
      return acc;
    }, {});
    return {
      totalAmount,
      byType,
      count: state.monetization.length,
    };
  }

  function createReport(input) {
    const report = {
      id: nextId("rpt", ++state.counters.report),
      ownerUserId: input.ownerUserId ?? null,
      companyId: input.companyId ?? null,
      reportType: input.reportType ?? "summary",
      title: input.title ?? "Free Tier Report",
      fromDate: input.fromDate ?? "",
      toDate: input.toDate ?? "",
      totalInvoices: input.totalInvoices ?? 0,
      totalPurchaseOrders: input.totalPurchaseOrders ?? 0,
      totalAmount: input.totalAmount ?? 0,
      createdAt: new Date().toISOString(),
    };
    state.reports.push(report);
    persist();
    return clone(report);
  }

  function listReportsForUser(user) {
    if (!user || user.role === "admin") return clone(state.reports);
    const companiesOwned = new Set(state.companies.filter((company) => company.ownerUserId === user.id).map((company) => company.id));
    return clone(state.reports.filter((report) => report.ownerUserId === user.id || companiesOwned.has(report.companyId)));
  }

  function createAiUsageLog(input = {}) {
    const log = {
      id: nextId("ailog", ++state.counters.aiUsageLog),
      ownerUserId: input.ownerUserId ?? null,
      plan: String(input.plan || "free").trim().toLowerCase(),
      provider: String(input.provider || "local").trim().toLowerCase(),
      intent: String(input.intent || "unknown").trim().toLowerCase(),
      status: String(input.status || "preview").trim().toLowerCase(),
      billable: input.billable !== false,
      commandPreview: String(input.command || "").trim().slice(0, 160),
      createdAt: new Date().toISOString(),
    };
    state.aiUsageLogs.push(log);
    persist();
    return clone(log);
  }

  function listAiUsageLogsForUser(user) {
    if (!user || user.role === "admin") return clone(state.aiUsageLogs);
    return clone(state.aiUsageLogs.filter((entry) => entry.ownerUserId === user.id));
  }

  function countAiUsageForUser(user, month = new Date().toISOString().slice(0, 7)) {
    const logs = listAiUsageLogsForUser(user);
    return logs.filter((entry) => entry.billable && String(entry.createdAt || "").slice(0, 7) === month).length;
  }

  function normalizeBusinessSettings(input = {}) {
    const emailSettings = input.emailSettings || {};
    const paymentSettings = input.paymentSettings || {};
    const complianceProfile = normalizeComplianceProfile(input.complianceProfile || {});
    return {
      emailSettings: {
        smtpHost: String(emailSettings.smtpHost || "").trim(),
        smtpPort: String(emailSettings.smtpPort || "").trim(),
        smtpSecure: Boolean(emailSettings.smtpSecure),
        smtpUser: String(emailSettings.smtpUser || "").trim(),
        smtpPass: emailSettings.smtpPass !== undefined ? String(emailSettings.smtpPass || "") : undefined,
        senderName: String(emailSettings.senderName || "").trim(),
        fromEmail: String(emailSettings.fromEmail || "").trim().toLowerCase(),
        replyToEmail: String(emailSettings.replyToEmail || "").trim().toLowerCase(),
        inviteSubject: String(emailSettings.inviteSubject || "You have been invited to EazInvoice").trim(),
        inviteTemplate: String(emailSettings.inviteTemplate || "Hi {{name}}, you have been invited to join {{businessName}} on EazInvoice.").trim(),
      },
      paymentSettings: {
        provider: "razorpay",
        keyId: String(paymentSettings.keyId || "").trim(),
        keySecret: paymentSettings.keySecret !== undefined ? String(paymentSettings.keySecret || "") : undefined,
        webhookSecret: paymentSettings.webhookSecret !== undefined ? String(paymentSettings.webhookSecret || "") : undefined,
        paymentLinkEnabled: Boolean(paymentSettings.paymentLinkEnabled),
      },
      complianceProfile,
    };
  }

  function sanitizeBusinessSettings(settings) {
    if (!settings) return null;
    const complianceReview = assessComplianceProfile(settings.complianceProfile || {});
    return clone({
      ...settings,
      emailSettings: {
        ...settings.emailSettings,
        smtpPass: "",
        smtpPassConfigured: Boolean(settings.emailSettings?.smtpPass),
      },
      paymentSettings: {
        ...settings.paymentSettings,
        keySecret: "",
        webhookSecret: "",
        keySecretConfigured: Boolean(settings.paymentSettings?.keySecret),
        webhookSecretConfigured: Boolean(settings.paymentSettings?.webhookSecret),
        status: settings.paymentSettings?.keyId
          ? (String(settings.paymentSettings.keyId).startsWith("rzp_live_") ? "live_ready" : "test_mode")
          : "not_configured",
      },
      complianceStatus: complianceReview.status,
      complianceReview,
    });
  }

  function getBusinessSettingsForUser(user, companyId = null) {
    const ownerUserId = user?.role === "admin" && user?.id ? user.id : user?.id;
    if (!ownerUserId) return null;
    const settings = state.businessSettings.find((entry) => (
      entry.ownerUserId === ownerUserId && (entry.companyId || null) === (companyId || null)
    ));
    return sanitizeBusinessSettings(settings);
  }

  function getRawBusinessSettingsForUser(user, companyId = null) {
    const ownerUserId = user?.role === "admin" && user?.id ? user.id : user?.id;
    if (!ownerUserId) return null;
    const settings = state.businessSettings.find((entry) => (
      entry.ownerUserId === ownerUserId && (entry.companyId || null) === (companyId || null)
    ));
    return clone(settings);
  }

  function upsertBusinessSettings(user, input = {}) {
    if (!user?.id) throw new Error("Authentication required");
    const companyId = input.companyId || null;
    const now = new Date().toISOString();
    const normalized = normalizeBusinessSettings(input);
    let settings = state.businessSettings.find((entry) => (
      entry.ownerUserId === user.id && (entry.companyId || null) === companyId
    ));
    if (!settings) {
      settings = {
        id: nextId("bset", ++state.counters.businessSetting),
        ownerUserId: user.id,
        companyId,
        emailSettings: {},
        paymentSettings: {},
        complianceProfile: {},
        createdAt: now,
        updatedAt: now,
      };
      state.businessSettings.push(settings);
    }
    if (input.emailSettings) {
      settings.emailSettings = {
        ...settings.emailSettings,
        ...normalized.emailSettings,
        smtpPass: normalized.emailSettings.smtpPass === undefined || normalized.emailSettings.smtpPass === ""
          ? settings.emailSettings.smtpPass || ""
          : normalized.emailSettings.smtpPass,
      };
    }
    if (input.paymentSettings) {
      settings.paymentSettings = {
        ...settings.paymentSettings,
        ...normalized.paymentSettings,
        keySecret: normalized.paymentSettings.keySecret === undefined || normalized.paymentSettings.keySecret === ""
          ? settings.paymentSettings.keySecret || ""
          : normalized.paymentSettings.keySecret,
        webhookSecret: normalized.paymentSettings.webhookSecret === undefined || normalized.paymentSettings.webhookSecret === ""
          ? settings.paymentSettings.webhookSecret || ""
          : normalized.paymentSettings.webhookSecret,
      };
    }
    if (input.complianceProfile) {
      settings.complianceProfile = {
        ...settings.complianceProfile,
        ...normalized.complianceProfile,
      };
    }
    settings.updatedAt = now;
    persist();
    return sanitizeBusinessSettings(settings);
  }

  function validateBusinessEmailSettings(user, input = {}) {
    const settings = upsertBusinessSettings(user, input);
    const email = settings.emailSettings || {};
    const missing = ["smtpHost", "smtpPort", "smtpUser", "fromEmail"].filter((field) => !email[field]);
    const issues = [];
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const port = Number(email.smtpPort || 0);
    if (missing.length) issues.push(`missing:${missing.join(",")}`);
    if (email.fromEmail && !emailPattern.test(email.fromEmail)) issues.push("fromEmail must be a valid email address");
    if (email.replyToEmail && !emailPattern.test(email.replyToEmail)) issues.push("replyToEmail must be a valid email address");
    if (email.smtpUser && !emailPattern.test(email.smtpUser)) {
      issues.push("smtpUser should usually be the full mailbox email address");
    }
    if (!Number.isInteger(port) || port <= 0 || port > 65535) issues.push("smtpPort must be a valid port number");
    if (port === 465 && !email.smtpSecure) issues.push("port 465 should use secure SMTP");
    if ([587, 25].includes(port) && email.smtpSecure) issues.push(`port ${port} usually starts without secure SMTP and upgrades with STARTTLS`);
    if (email.fromEmail && email.smtpUser && email.fromEmail !== email.smtpUser) {
      issues.push("fromEmail and smtpUser should normally match for mailbox SMTP");
    }
    const stored = state.businessSettings.find((entry) => entry.id === settings.id);
    stored.emailSettings.lastTestAt = new Date().toISOString();
    stored.emailSettings.lastTestStatus = issues.length ? issues.join("; ") : "ready";
    persist();
    return sanitizeBusinessSettings(stored);
  }

  function buildComplianceTaskKey(user, companyId, taskId) {
    return [
      user?.id || "unknown",
      companyId || "default",
      String(taskId || "").trim(),
    ].join(":");
  }

  function normalizeComplianceTaskStatus(value) {
    const status = String(value || "pending").trim().toLowerCase();
    return ["pending", "filed", "overdue", "not_applicable", "needs_document", "profile_missing"].includes(status)
      ? status
      : "pending";
  }

  function normalizeComplianceTaskOverride(user, companyId, taskId, input = {}) {
    const reminderDaysBefore = Math.max(0, Math.floor(toNumber(input.reminderDaysBefore, 7)));
    return {
      ownerUserId: user.id,
      companyId: companyId || null,
      complianceRuleId: String(taskId || "").trim(),
      status: normalizeComplianceTaskStatus(input.status),
      responsiblePerson: String(input.responsiblePerson || "").trim(),
      dueDate: String(input.dueDate || "").trim(),
      dueDateLabel: String(input.dueDateLabel || "").trim(),
      reminderEnabled: input.reminderEnabled !== false,
      reminderDaysBefore,
      notes: String(input.notes || "").trim().slice(0, 1000),
    };
  }

  function listComplianceTaskOverridesForUser(user, companyId = null) {
    if (!user?.id) return [];
    return state.complianceTasks.filter((task) => (
      task.ownerUserId === user.id
      && (task.companyId || null) === (companyId || null)
      && String(task.status || "").toLowerCase() !== "deleted"
    ));
  }

  function mergeComplianceTasksWithOverrides(user, companyId, generatedTasks = []) {
    const overrides = new Map(listComplianceTaskOverridesForUser(user, companyId).map((task) => [task.complianceRuleId, task]));
    return generatedTasks.map((task) => {
      const override = overrides.get(task.id);
      if (!override) {
        return {
          ...task,
          persisted: false,
          reminderEnabled: true,
          reminderDaysBefore: 7,
          notes: "",
        };
      }
      return {
        ...task,
        ...override,
        id: task.id,
        complianceRuleId: task.id,
        complianceName: task.complianceName,
        department: task.department,
        frequency: task.frequency,
        dueDateLabel: override.dueDateLabel || task.dueDateLabel,
        reminderSchedule: task.reminderSchedule,
        requiredDocuments: task.requiredDocuments,
        penaltyInformation: task.penaltyInformation,
        persisted: true,
      };
    });
  }

  function updateComplianceTask(user, taskId, input = {}) {
    if (!user?.id) throw new Error("Authentication required");
    const companyId = input.companyId || null;
    const generatedTasks = generateComplianceSchedule(
      getRawBusinessSettingsForUser(user, companyId)?.complianceProfile || {},
      user,
    );
    const sourceTask = generatedTasks.find((task) => task.id === taskId);
    if (!sourceTask) throw new Error("Compliance task not found");
    const now = new Date().toISOString();
    const taskKey = buildComplianceTaskKey(user, companyId, taskId);
    const normalized = normalizeComplianceTaskOverride(user, companyId, taskId, input);
    let stored = state.complianceTasks.find((task) => task.id === taskKey);
    if (!stored) {
      stored = {
        id: taskKey,
        ownerUserId: user.id,
        companyId,
        complianceRuleId: taskId,
        createdAt: now,
        updatedAt: now,
      };
      state.complianceTasks.push(stored);
      state.counters.complianceTask = Math.max(toNumber(state.counters.complianceTask, 0), state.complianceTasks.length);
    }
    const previousStatus = String(stored.status || sourceTask.status || "pending").toLowerCase();
    const previousRecord = stored.record && typeof stored.record === "object" ? stored.record : {};
    const auditTrail = Array.isArray(previousRecord.auditTrail) ? previousRecord.auditTrail.slice(-24) : [];
    const changed = previousStatus !== normalized.status
      || String(stored.responsiblePerson || "") !== normalized.responsiblePerson
      || String(stored.notes || "") !== normalized.notes;
    if (changed) {
      auditTrail.push({
        at: now,
        byUserId: user.id,
        fromStatus: previousStatus,
        toStatus: normalized.status,
        responsiblePerson: normalized.responsiblePerson,
        notes: normalized.notes,
      });
    }
    Object.assign(stored, {
      ...normalized,
      complianceName: sourceTask.complianceName,
      department: sourceTask.department,
      frequency: sourceTask.frequency,
      dueDate: normalized.dueDate || sourceTask.dueDate,
      dueDateLabel: normalized.dueDateLabel || sourceTask.dueDateLabel,
      nextReminderDate: normalized.dueDate ? addDays(normalized.dueDate, -normalized.reminderDaysBefore) : sourceTask.nextReminderDate,
      record: {
        ...previousRecord,
        requiredDocuments: sourceTask.requiredDocuments || [],
        reminderSchedule: sourceTask.reminderSchedule || [],
        penaltyInformation: sourceTask.penaltyInformation || "",
        statusDescription: sourceTask.statusDescription || "",
        auditTrail,
      },
      updatedAt: now,
    });
    persist();
    return clone({
      ...sourceTask,
      ...stored,
      id: sourceTask.id,
      persisted: true,
    });
  }

  function recordComplianceReminderDelivery(user, taskId, input = {}) {
    if (!user?.id) throw new Error("Authentication required");
    const companyId = input.companyId || null;
    const generatedTasks = generateComplianceSchedule(
      getRawBusinessSettingsForUser(user, companyId)?.complianceProfile || {},
      user,
    );
    const sourceTask = generatedTasks.find((task) => task.id === taskId);
    if (!sourceTask) throw new Error("Compliance task not found");

    const now = new Date().toISOString();
    const taskKey = buildComplianceTaskKey(user, companyId, taskId);
    let stored = state.complianceTasks.find((task) => task.id === taskKey);
    if (!stored) {
      stored = {
        id: taskKey,
        ownerUserId: user.id,
        companyId,
        complianceRuleId: taskId,
        status: sourceTask.status || "pending",
        responsiblePerson: sourceTask.responsiblePerson || "",
        dueDate: sourceTask.dueDate || "",
        dueDateLabel: sourceTask.dueDateLabel || "",
        reminderEnabled: true,
        reminderDaysBefore: 7,
        notes: "",
        complianceName: sourceTask.complianceName,
        department: sourceTask.department,
        frequency: sourceTask.frequency,
        createdAt: now,
        updatedAt: now,
      };
      state.complianceTasks.push(stored);
      state.counters.complianceTask = Math.max(toNumber(state.counters.complianceTask, 0), state.complianceTasks.length);
    }

    const previousRecord = stored.record && typeof stored.record === "object" ? stored.record : {};
    const reminderLog = Array.isArray(previousRecord.reminderLog) ? previousRecord.reminderLog.slice(-24) : [];
    reminderLog.push({
      at: now,
      byUserId: user.id,
      to: String(input.to || "").trim(),
      status: String(input.status || "sent").trim().toLowerCase(),
      message: String(input.message || "").trim().slice(0, 500),
    });

    stored.record = {
      ...previousRecord,
      requiredDocuments: sourceTask.requiredDocuments || previousRecord.requiredDocuments || [],
      reminderSchedule: sourceTask.reminderSchedule || previousRecord.reminderSchedule || [],
      penaltyInformation: sourceTask.penaltyInformation || previousRecord.penaltyInformation || "",
      statusDescription: sourceTask.statusDescription || previousRecord.statusDescription || "",
      reminderLog,
    };
    stored.lastReminderSentAt = now;
    stored.lastReminderRecipient = String(input.to || "").trim();
    stored.lastReminderStatus = String(input.status || "sent").trim().toLowerCase();
    stored.updatedAt = now;
    persist();

    return clone({
      ...sourceTask,
      ...stored,
      id: sourceTask.id,
      persisted: true,
    });
  }
  function getBusinessComplianceDashboard(user, companyId = null) {
    if (!user?.id) throw new Error("Authentication required");
    const settings = getBusinessSettingsForUser(user, companyId) || {
      emailSettings: {},
      paymentSettings: {},
      complianceProfile: {},
      complianceReview: assessComplianceProfile({}, user),
    };
    const invoices = listInvoicesForUser(user).filter((invoice) => (
      String(invoice.status || "").toLowerCase() === "created"
      && String(invoice.currency || "INR").toUpperCase() === "INR"
      && (!companyId || invoice.companyId === companyId)
    ));
    const purchaseOrders = listPurchaseOrdersForUser(user).filter((po) => (
      String(po.status || "").toLowerCase() === "created"
      && String(po.currency || "INR").toUpperCase() === "INR"
      && (!companyId || po.companyId === companyId)
    ));
    const outputGst = invoices.reduce((sum, invoice) => sum + toNumber(invoice.taxAmount, 0), 0);
    const inputGst = purchaseOrders.reduce((sum, po) => sum + toNumber(po.taxAmount, 0), 0);
    const revenue = invoices.reduce((sum, invoice) => sum + toNumber(invoice.total, 0), 0);
    const expenses = purchaseOrders.reduce((sum, po) => sum + toNumber(po.total, 0), 0);
    const paid = invoices.reduce((sum, invoice) => sum + toNumber(invoice.paidAmount, 0), 0);
    const receivables = invoices.reduce((sum, invoice) => sum + toNumber(invoice.balanceAmount, Math.max(0, toNumber(invoice.total, 0) - toNumber(invoice.paidAmount, 0))), 0);
    const payables = expenses;
    const paymentSettings = settings.paymentSettings || {};
    const emailSettings = settings.emailSettings || {};
    const gatewayReady = Boolean(paymentSettings.keyId && paymentSettings.keySecretConfigured && paymentSettings.webhookSecretConfigured && paymentSettings.paymentLinkEnabled);
    const smtpReady = Boolean(emailSettings.smtpHost && emailSettings.smtpPort && emailSettings.smtpUser && emailSettings.fromEmail && emailSettings.smtpPassConfigured);
    const complianceReview = settings.complianceReview || assessComplianceProfile(settings.complianceProfile || {}, user);
    const complianceTasks = mergeComplianceTasksWithOverrides(
      user,
      companyId,
      generateComplianceSchedule(settings.complianceProfile || {}, user),
    );
    const complianceSummary = summarizeComplianceTasks(complianceTasks);
    const reminderDigest = buildComplianceReminderDigest(complianceTasks);
    return clone({
      complianceProfile: settings.complianceProfile || {},
      complianceReview,
      readiness: {
        compliance: complianceReview.ready,
        gst: complianceReview.gstReady,
        smtp: smtpReady,
        gateway: gatewayReady,
        overall: complianceReview.ready && smtpReady && gatewayReady,
      },
      financials: {
        revenue,
        expenses,
        profit: revenue - expenses,
        paid,
        receivables,
        payables,
      },
      gst: {
        outputGst,
        inputGst,
        netGstPayable: outputGst - inputGst,
        invoiceCount: invoices.length,
        purchaseOrderCount: purchaseOrders.length,
      },
      communication: {
        smtpReady,
        status: emailSettings.lastTestStatus || (smtpReady ? "ready" : "not_configured"),
      },
      gateway: {
        ready: gatewayReady,
        status: paymentSettings.status || "not_configured",
        paymentLinkEnabled: Boolean(paymentSettings.paymentLinkEnabled),
      },
      complianceEngine: {
        enabled: true,
        source: "entity-aware-catalog",
        rulesCount: complianceTasks.length,
        summary: complianceSummary,
        reminders: reminderDigest,
        export: {
          fileName: "eazinvoice-compliance-report.csv",
          headers: ["Compliance", "Department", "Status", "Due Date", "Reminder Date", "Responsible", "Required Documents"],
          rows: complianceTasks.map((task) => [
            task.complianceName || task.id || "Compliance",
            task.department || "Compliance",
            task.status || "pending",
            task.dueDate || "",
            task.nextReminderDate || "",
            task.responsiblePerson || "",
            (task.requiredDocuments || []).join(", "),
          ]),
        },
        tasks: complianceTasks,
      },
      complianceTasks,
    });
  }

  function isTeamInviteExpired(member) {
    const expiresAt = new Date(member?.inviteExpiresAt || "").getTime();
    return Number.isFinite(expiresAt) && expiresAt < Date.now();
  }

  function isEmailLinkedTeamMember(member) {
    return ["active", "invited"].includes(member?.status) && !isTeamInviteExpired(member);
  }

  function getTeamRolePermissions(role) {
    const normalizedRole = String(role || "viewer").toLowerCase();
    const fullAccess = {
      read: true,
      writeRecords: true,
      compliance: true,
      approvals: true,
      apiAccess: true,
      manageTeam: true,
      manageSettings: true,
    };
    if (normalizedRole === "owner" || normalizedRole === "admin") return fullAccess;
    if (normalizedRole === "accountant") {
      return {
        read: true,
        writeRecords: true,
        compliance: true,
        approvals: true,
        apiAccess: false,
        manageTeam: false,
        manageSettings: false,
      };
    }
    return {
      read: true,
      writeRecords: false,
      compliance: false,
      approvals: false,
      apiAccess: false,
      manageTeam: false,
      manageSettings: false,
    };
  }

  function getBusinessWorkspaceAccess(user, ownerUserId = null) {
    if (!user?.id) return null;
    const targetOwnerUserId = ownerUserId || user.id;
    if (user.role === "admin" || targetOwnerUserId === user.id) {
      return {
        ownerUserId: targetOwnerUserId,
        role: user.role === "admin" && targetOwnerUserId !== user.id ? "admin" : "owner",
        source: targetOwnerUserId === user.id ? "owned" : "admin",
        permissions: getTeamRolePermissions("owner"),
      };
    }
    const email = String(user.email || "").toLowerCase();
    const member = state.teamMembers.find((entry) => (
      entry.ownerUserId === targetOwnerUserId
      && isEmailLinkedTeamMember(entry)
      && (
        entry.acceptedUserId === user.id
        || String(entry.email || "").toLowerCase() === email
      )
    ));
    if (!member) return null;
    return {
      ownerUserId: member.ownerUserId,
      companyId: member.companyId || null,
      memberId: member.id,
      role: member.role || "viewer",
      source: "team",
      permissions: getTeamRolePermissions(member.role),
    };
  }

  function listBusinessWorkspacesForUser(user) {
    if (!user?.id) return [];
    const workspaces = [{
      ownerUserId: user.id,
      companyId: null,
      role: user.role === "admin" ? "admin" : "owner",
      source: "owned",
      label: user.name || user.email || "My workspace",
      email: user.email || "",
      permissions: getTeamRolePermissions("owner"),
    }];
    const email = String(user.email || "").toLowerCase();
    state.teamMembers
      .filter((member) => (
        isEmailLinkedTeamMember(member)
        && (
          member.acceptedUserId === user.id
          || String(member.email || "").toLowerCase() === email
        )
      ))
      .forEach((member) => {
        const owner = state.users.find((entry) => entry.id === member.ownerUserId);
        workspaces.push({
          ownerUserId: member.ownerUserId,
          companyId: member.companyId || null,
          memberId: member.id,
          role: member.role || "viewer",
          source: "team",
          label: owner?.name || owner?.email || "Business workspace",
          email: owner?.email || "",
          permissions: getTeamRolePermissions(member.role),
        });
      });
    return clone(workspaces);
  }

  function listTeamMembersForUser(user) {
    if (!user || user.role === "admin") return clone(state.teamMembers);
    return clone(state.teamMembers.filter((member) => (
      member.ownerUserId === user.id
      || member.invitedByUserId === user.id
      || member.acceptedUserId === user.id
      || String(member.email || "").toLowerCase() === String(user.email || "").toLowerCase()
    )));
  }

  function listTeamMembersForWorkspace(ownerUserId) {
    return clone(state.teamMembers.filter((member) => member.ownerUserId === ownerUserId));
  }

  function createTeamMember(input = {}) {
    const email = String(input.email || "").trim().toLowerCase();
    if (!email) throw new Error("Team member email is required");
    const existing = state.teamMembers.find((member) => (
      member.ownerUserId === input.ownerUserId
      && member.email === email
      && member.status !== "removed"
    ));
    if (existing) return clone(existing);
    const member = {
      id: nextId("team", ++state.counters.teamMember),
      ownerUserId: input.ownerUserId ?? null,
      companyId: input.companyId ?? null,
      name: String(input.name || email.split("@")[0]).trim(),
      email,
      role: ["owner", "admin", "accountant", "viewer"].includes(input.role) ? input.role : "viewer",
      status: ["active", "invited"].includes(input.status) ? input.status : "active",
      invitedByUserId: input.invitedByUserId ?? input.ownerUserId ?? null,
      acceptedUserId: input.acceptedUserId ?? null,
      inviteToken: input.inviteToken || null,
      inviteExpiresAt: input.inviteExpiresAt || null,
      inviteDeliveryStatus: input.inviteDeliveryStatus || "queued",
      auditTrail: [{
        action: "sub_user_created",
        at: new Date().toISOString(),
        byUserId: input.invitedByUserId ?? input.ownerUserId ?? null,
        role: ["owner", "admin", "accountant", "viewer"].includes(input.role) ? input.role : "viewer",
        accessMethod: "verified_email",
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.teamMembers.push(member);
    persist();
    return clone(member);
  }

  function updateTeamMember(memberId, updates = {}, user = null) {
    const member = state.teamMembers.find((entry) => entry.id === memberId);
    if (!member) return null;
    if (user && user.role !== "admin" && member.ownerUserId !== user.id && member.invitedByUserId !== user.id) return null;
    const previousRole = member.role;
    const previousStatus = member.status;
    if (updates.name !== undefined) member.name = String(updates.name || member.name).trim();
    if (["owner", "admin", "accountant", "viewer"].includes(updates.role)) member.role = updates.role;
    if (["active", "invited", "removed"].includes(updates.status)) member.status = updates.status;
    if (updates.acceptedUserId !== undefined) member.acceptedUserId = updates.acceptedUserId || null;
    if (updates.inviteDeliveryStatus !== undefined) member.inviteDeliveryStatus = String(updates.inviteDeliveryStatus || "queued");
    if (updates.inviteDeliveryMessage !== undefined) member.inviteDeliveryMessage = String(updates.inviteDeliveryMessage || "");
    if (updates.inviteSentAt !== undefined) member.inviteSentAt = updates.inviteSentAt || null;
    member.auditTrail = Array.isArray(member.auditTrail) ? member.auditTrail : [];
    if (previousRole !== member.role) {
      member.roleChangedAt = new Date().toISOString();
      member.auditTrail.push({
        action: "role_changed",
        at: member.roleChangedAt,
        byUserId: user?.id || null,
        fromRole: previousRole,
        toRole: member.role,
      });
    }
    if (previousStatus !== member.status) {
      const changedAt = new Date().toISOString();
      if (member.status === "removed") member.revokedAt = changedAt;
      member.auditTrail.push({
        action: member.status === "removed" ? "revoked" : "status_changed",
        at: changedAt,
        byUserId: user?.id || null,
        fromStatus: previousStatus,
        toStatus: member.status,
      });
    }
    member.updatedAt = new Date().toISOString();
    persist();
    return clone(member);
  }

  function listApprovalRequestsForUser(user) {
    if (!user || user.role === "admin") return clone(state.approvalRequests);
    return clone(state.approvalRequests.filter((request) => (
      request.ownerUserId === user.id
      || request.requestedByUserId === user.id
      || request.approverUserId === user.id
    )));
  }

  function createApprovalRequest(input = {}) {
    const documentType = ["invoice", "purchase_order", "work_order"].includes(input.documentType)
      ? input.documentType
      : "invoice";
    const request = {
      id: nextId("apr", ++state.counters.approvalRequest),
      ownerUserId: input.ownerUserId ?? null,
      companyId: input.companyId ?? null,
      documentType,
      documentId: input.documentId ?? null,
      documentNumber: String(input.documentNumber || "Draft document").trim(),
      requestedByUserId: input.requestedByUserId ?? input.ownerUserId ?? null,
      approverUserId: input.approverUserId ?? null,
      status: "pending",
      notes: String(input.notes || "").trim(),
      decisionNotes: "",
      decidedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.approvalRequests.push(request);
    persist();
    return clone(request);
  }

  function decideApprovalRequest(approvalId, updates = {}, user = null) {
    const request = state.approvalRequests.find((entry) => entry.id === approvalId);
    if (!request) return null;
    if (user && user.role !== "admin" && request.ownerUserId !== user.id && request.approverUserId !== user.id) return null;
    if (["pending", "approved", "rejected"].includes(updates.status)) request.status = updates.status;
    request.approverUserId = updates.approverUserId ?? user?.id ?? request.approverUserId;
    request.decisionNotes = String(updates.decisionNotes || updates.notes || request.decisionNotes || "").trim();
    request.decidedAt = request.status === "pending" ? null : new Date().toISOString();
    request.updatedAt = new Date().toISOString();
    persist();
    return clone(request);
  }

  function listApiKeysForUser(user, includeSecret = false) {
    const keys = (!user || user.role === "admin")
      ? state.apiKeys
      : state.apiKeys.filter((key) => key.ownerUserId === user.id);
    return clone(keys.map((key) => ({
      ...key,
      token: includeSecret ? key.token : "",
    })));
  }

  function findActiveApiKeyByToken(token) {
    const candidate = String(token || "").trim();
    if (!candidate) return null;
    const candidateBuffer = Buffer.from(candidate);
    const key = state.apiKeys.find((entry) => {
      if (entry.status !== "active" || !entry.token) return false;
      const entryBuffer = Buffer.from(entry.token);
      return entryBuffer.length === candidateBuffer.length
        && crypto.timingSafeEqual(entryBuffer, candidateBuffer);
    });
    return key ? clone({ ...key, token: "" }) : null;
  }

  function createApiKey(input = {}) {
    const token = `eaz_live_${crypto.randomBytes(24).toString("hex")}`;
    const key = {
      id: nextId("key", ++state.counters.apiKey),
      ownerUserId: input.ownerUserId ?? null,
      companyId: input.companyId ?? null,
      label: String(input.label || "Website integration").trim(),
      token,
      tokenPreview: `${token.slice(0, 12)}...${token.slice(-4)}`,
      scopes: Array.isArray(input.scopes) && input.scopes.length
        ? input.scopes.map((scope) => String(scope).trim()).filter(Boolean)
        : ["invoices:write", "po:write", "reports:read"],
      status: "active",
      createdAt: new Date().toISOString(),
      revokedAt: null,
    };
    state.apiKeys.push(key);
    persist();
    return clone(key);
  }

  function revokeApiKey(apiKeyId, user = null) {
    const key = state.apiKeys.find((entry) => entry.id === apiKeyId);
    if (!key) return null;
    if (user && user.role !== "admin" && key.ownerUserId !== user.id) return null;
    key.status = "revoked";
    key.revokedAt = new Date().toISOString();
    persist();
    return clone({ ...key, token: "" });
  }

  function listInvoices() {
    return clone(state.invoices);
  }

  function runRecurringInvoiceScheduler(input = {}) {
    const ownerUserId = input.ownerUserId ?? null;
    const target = parseDateOnly(input.targetDate) || parseDateOnly(new Date().toISOString().slice(0, 10));
    const created = [];
    const skipped = [];
    const maxPerTemplate = Math.max(1, Math.min(24, Number(input.maxPerTemplate || 12)));
    const sources = state.invoices.filter((invoice) => (
      invoice.ownerUserId === ownerUserId
      && invoice.recurringEnabled
      && String(invoice.status || "").toLowerCase() !== "draft"
      && String(invoice.status || "").toLowerCase() !== "deleted"
    ));

    sources.forEach((source) => {
      let nextDate = parseDateOnly(source.recurringNextDate);
      if (!nextDate) {
        skipped.push({ invoiceId: source.id, invoiceNumber: source.invoiceNumber, reason: "missing_next_date" });
        return;
      }

      const frequency = normalizeRecurringFrequency(source.recurringFrequency);
      let generatedForTemplate = 0;
      while (nextDate <= target && generatedForTemplate < maxPerTemplate) {
        const generatedForDate = formatDateOnly(nextDate);
        const duplicate = state.invoices.find((invoice) => (
          invoice.recurringSourceInvoiceId === source.id
          && invoice.recurringGeneratedForDate === generatedForDate
        ));

        if (duplicate) {
          skipped.push({
            invoiceId: source.id,
            invoiceNumber: source.invoiceNumber,
            generatedForDate,
            reason: "already_generated",
          });
        } else {
          const invoiceDate = parseDateOnly(source.invoiceDate);
          const dueDate = parseDateOnly(source.dueDate);
          const dueOffset = Math.max(0, dateDiffDays(invoiceDate, dueDate) ?? 7);
          const generatedDueDate = new Date(nextDate.getTime());
          generatedDueDate.setUTCDate(generatedDueDate.getUTCDate() + dueOffset);
          const invoiceSequence = state.counters.invoice + 1;
          const items = clone(source.items || []);
          const totals = calculateInvoiceTotals(items, toNumber(source.taxRate), source);
          const draft = {
            ...clone(source),
            id: nextId("inv", ++state.counters.invoice),
            invoiceNumber: formatDocumentNumber(source.invoiceCode || "INV", generatedForDate, invoiceSequence),
            status: "draft",
            paymentStatus: "draft",
            paidAmount: 0,
            balanceAmount: totals.total,
            paymentGateway: null,
            paymentLink: null,
            invoiceDate: generatedForDate,
            dueDate: formatDateOnly(generatedDueDate),
            recurringEnabled: false,
            recurringFrequency: "",
            recurringNextDate: "",
            recurringSourceInvoiceId: source.id,
            recurringGeneratedForDate: generatedForDate,
            items,
            ...totals,
            createdAt: new Date().toISOString(),
          };
          state.invoices.push(draft);
          created.push(clone(draft));
        }

        generatedForTemplate += 1;
        nextDate = nextRecurringDate(nextDate, frequency);
      }

      source.recurringFrequency = frequency;
      source.recurringNextDate = formatDateOnly(nextDate);
      if (generatedForTemplate >= maxPerTemplate && nextDate <= target) {
        skipped.push({
          invoiceId: source.id,
          invoiceNumber: source.invoiceNumber,
          reason: "max_generation_limit_reached",
          nextDate: formatDateOnly(nextDate),
        });
      }
    });

    if (created.length || skipped.length || sources.length) persist();
    return {
      targetDate: formatDateOnly(target),
      templatesChecked: sources.length,
      created,
      skipped,
    };
  }

  function refreshInvoicePaymentStatus(invoice) {
    const paidAmount = state.payments
      .filter((payment) => payment.invoiceId === invoice.id && payment.status === "captured")
      .reduce((sum, payment) => sum + toNumber(payment.amount), 0);
    invoice.paidAmount = Math.min(toNumber(invoice.total), paidAmount);
    invoice.balanceAmount = Math.max(0, toNumber(invoice.total) - invoice.paidAmount);
    if (invoice.status === "draft") invoice.paymentStatus = "draft";
    else if (invoice.total > 0 && invoice.balanceAmount <= 0) invoice.paymentStatus = "paid";
    else if (invoice.paidAmount > 0) invoice.paymentStatus = "part_paid";
    else if (invoice.dueDate && new Date(invoice.dueDate) < new Date()) invoice.paymentStatus = "overdue";
    else invoice.paymentStatus = "unpaid";
    return invoice;
  }

  function recordInvoicePayment(invoiceId, input = {}) {
    const invoice = state.invoices.find((entry) => entry.id === invoiceId);
    if (!invoice) return null;
    assertInvoiceCanReceivePayment(invoice);
    const amount = toNumber(input.amount);
    if (amount <= 0) throw new Error("Enter a valid received amount.");
    const balance = toNumber(invoice.balanceAmount, invoice.total);
    if (balance > 0 && amount > balance + 0.01) {
      throw new Error("Payment amount cannot be more than the pending invoice balance.");
    }
    const payment = {
      id: nextId("pay", ++state.counters.payment),
      ownerUserId: invoice.ownerUserId,
      invoiceId,
      amount,
      currency: input.currency?.trim() || invoice.currency || "INR",
      mode: input.mode?.trim() || "manual",
      reference: input.reference?.trim() || "",
      notes: input.notes?.trim() || "",
      status: input.status?.trim() || "captured",
      gateway: input.gateway?.trim() || "",
      gatewayPaymentId: input.gatewayPaymentId?.trim() || "",
      gatewayOrderId: input.gatewayOrderId?.trim() || "",
      paymentDate: input.paymentDate?.trim() || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    };
    state.payments.push(payment);
    refreshInvoicePaymentStatus(invoice);
    persist();
    return clone({ invoice, payment });
  }

  function createInvoicePaymentLink(invoiceId, input = {}) {
    const invoice = state.invoices.find((entry) => entry.id === invoiceId);
    if (!invoice) return null;
    assertInvoiceCanReceivePayment(invoice);
    const linkId = `plink_${invoice.id}_${Date.now()}`;
    invoice.paymentGateway = input.gateway?.trim() || "razorpay";
    invoice.paymentLink = {
      id: linkId,
      provider: invoice.paymentGateway,
      status: "created",
      amount: Math.max(0, toNumber(invoice.balanceAmount || invoice.total)),
      currency: invoice.currency || "INR",
      url: input.url?.trim() || `https://rzp.io/i/${linkId}`,
      createdAt: new Date().toISOString(),
    };
    persist();
    return clone(invoice);
  }

  function recordGatewayPayment(input = {}) {
    const paymentLinkId = String(input.paymentLinkId || input.razorpay_payment_link_id || "").trim();
    const invoiceId = String(input.invoiceId || "").trim();
    const invoice = state.invoices.find((entry) => entry.id === invoiceId || entry.paymentLink?.id === paymentLinkId);
    if (!invoice) return null;
    return recordInvoicePayment(invoice.id, {
      amount: input.amount ?? invoice.paymentLink?.amount ?? invoice.balanceAmount ?? invoice.total,
      currency: input.currency || invoice.currency,
      mode: "payment_gateway",
      reference: input.reference || input.razorpay_payment_id || input.paymentId || "",
      notes: "Auto-updated from payment gateway webhook",
      status: "captured",
      gateway: input.gateway || invoice.paymentGateway || "razorpay",
      gatewayPaymentId: input.razorpay_payment_id || input.paymentId || "",
      gatewayOrderId: input.razorpay_order_id || input.orderId || "",
      paymentDate: input.paymentDate || new Date().toISOString().slice(0, 10),
    });
  }

  function listPaymentsForUser(user) {
    if (!user || user.role === "admin") return clone(state.payments);
    const invoiceIds = new Set(listInvoicesForUser(user).map((invoice) => invoice.id));
    return clone(state.payments.filter((payment) => invoiceIds.has(payment.invoiceId)));
  }

  function listPurchaseOrdersForUser(user) {
    if (!user || user.role === "admin") return clone(state.purchaseOrders);
    const companiesOwned = new Set(state.companies.filter((company) => company.ownerUserId === user.id).map((company) => company.id));
    return clone(state.purchaseOrders.filter((purchaseOrder) => purchaseOrder.ownerUserId === user.id || companiesOwned.has(purchaseOrder.companyId)));
  }

  function setUserRestriction(userId, updates) {
    const user = state.users.find((entry) => entry.id === userId);
    if (!user) return null;
    if (updates.accountStatus) user.accountStatus = updates.accountStatus;
    if (typeof updates.restrictedReason === "string") user.restrictedReason = updates.restrictedReason;
    if (typeof updates.restrictedAt === "string") user.restrictedAt = updates.restrictedAt;
    persist();
    return clone(user);
  }

  function listRestrictedUsers() {
    return clone(state.users.filter((user) => user.accountStatus === "restricted"));
  }

  function setUserPermissions(userId, permissions) {
    const user = state.users.find((entry) => entry.id === userId);
    if (!user) return null;
    user.permissions = Array.isArray(permissions) ? permissions : [];
    persist();
    return clone(user);
  }

  function listInvoicesForUser(user) {
    if (!user || user.role === "admin") return clone(state.invoices);
    const companiesOwned = new Set(state.companies.filter((company) => company.ownerUserId === user.id).map((company) => company.id));
    return clone(state.invoices.filter((invoice) => invoice.ownerUserId === user.id || companiesOwned.has(invoice.companyId)));
  }

  function getInvoice(id, user) {
    const invoice = state.invoices.find((entry) => entry.id === id);
    if (!invoice) return null;
    if (!user || user.role === "admin") return clone(invoice);
    const companiesOwned = new Set(state.companies.filter((company) => company.ownerUserId === user.id).map((company) => company.id));
    if (invoice.ownerUserId !== user.id && !companiesOwned.has(invoice.companyId)) return null;
    return invoice ? clone(invoice) : null;
  }

  function getPurchaseOrder(id, user) {
    const purchaseOrder = state.purchaseOrders.find((entry) => entry.id === id);
    if (!purchaseOrder) return null;
    if (!user || user.role === "admin") return clone(purchaseOrder);
    const companiesOwned = new Set(state.companies.filter((company) => company.ownerUserId === user.id).map((company) => company.id));
    if (purchaseOrder.ownerUserId !== user.id && !companiesOwned.has(purchaseOrder.companyId)) return null;
    return clone(purchaseOrder);
  }

  function countUsage() {
    return {
      companies: state.companies.length,
      customers: state.customers.length,
      invoicesPerMonth: state.invoices.length,
      invoiceItemsPerInvoice: Math.max(0, ...state.invoices.map((invoice) => invoice.items.length), 0),
      templates: 1,
      aiCommandsPerMonth: state.aiUsageLogs.filter((entry) => entry.billable && String(entry.createdAt || "").slice(0, 7) === new Date().toISOString().slice(0, 7)).length,
    };
  }

  function countUsageForUser(user) {
    if (!user || user.role === "admin") return countUsage();
    const companyIds = new Set(state.companies.filter((company) => company.ownerUserId === user.id).map((company) => company.id));
    const userInvoices = state.invoices.filter((invoice) => invoice.ownerUserId === user.id || companyIds.has(invoice.companyId));
    return {
      companies: companyIds.size,
      customers: state.customers.filter((customer) => customer.ownerUserId === user.id || companyIds.has(customer.companyId)).length,
      invoicesPerMonth: userInvoices.length,
      invoiceItemsPerInvoice: Math.max(0, ...userInvoices.map((invoice) => invoice.items.length), 0),
      templates: 1,
      aiCommandsPerMonth: state.aiUsageLogs.filter((entry) => entry.ownerUserId === user.id && entry.billable && String(entry.createdAt || "").slice(0, 7) === new Date().toISOString().slice(0, 7)).length,
    };
  }

  function summarizeRecords() {
    return {
      users: state.users.length,
      companies: state.companies.length,
      customers: state.customers.length,
      vendors: state.vendors.length,
      invoices: state.invoices.length,
      purchaseOrders: state.purchaseOrders.length,
      payments: state.payments.length,
      subscriptions: state.subscriptions.length,
      billingOrders: state.billingOrders.length,
      monetization: state.monetization.length,
      reports: state.reports.length,
      aiUsageLogs: state.aiUsageLogs.length,
      teamMembers: state.teamMembers.length,
      approvalRequests: state.approvalRequests.length,
      apiKeys: state.apiKeys.length,
      businessSettings: state.businessSettings.length,
      complianceTasks: state.complianceTasks.length,
    };
  }

  function exportState() {
    return clone(state);
  }

  function updateInvoice(id, updates, limits) {
    const invoice = state.invoices.find((entry) => entry.id === id);
    if (!invoice) return null;
    assertInvoiceCanBeEdited(invoice);

    [
      "status",
      "customerId",
      "invoiceNumber",
      "invoiceDate",
      "dueDate",
      "currency",
      "paymentTerms",
      "placeOfSupply",
      "gstMode",
      "modeOfDelivery",
      "modeOfPayment",
      "notes",
      "paymentInstructions",
      "terms",
      "recurringNextDate",
      "billToName",
      "billToAddress",
    ].forEach((field) => {
      if (updates[field] !== undefined) invoice[field] = field === "status"
        ? normalizeRecordStatus(updates[field], invoice.status || "draft")
        : String(updates[field] || "").trim();
    });
    if (updates.recurringEnabled !== undefined) invoice.recurringEnabled = Boolean(updates.recurringEnabled);
    if (updates.recurringFrequency !== undefined) {
      invoice.recurringFrequency = updates.recurringFrequency ? normalizeRecurringFrequency(updates.recurringFrequency) : "";
    }
    if (updates.hideEazinvoiceBranding !== undefined) invoice.hideEazinvoiceBranding = Boolean(updates.hideEazinvoiceBranding);
    if (updates.companyId !== undefined) invoice.companyId = updates.companyId || null;
    if (updates.taxRate !== undefined) invoice.taxRate = toNumber(updates.taxRate);
    if (updates.discount !== undefined) invoice.discount = toNumber(updates.discount);
    if (updates.shipping !== undefined) invoice.shipping = toNumber(updates.shipping);
    if (updates.roundOff !== undefined) invoice.roundOff = toNumber(updates.roundOff);
    if (updates.items !== undefined) {
      invoice.items = updates.items.map((item) => ({
        description: String(item.description || "").trim(),
        hsnSac: String(item.hsnSac || "").trim(),
        unit: String(item.unit || "").trim(),
        quantity: toNumber(item.quantity),
        rate: toNumber(item.rate),
        discount: toNumber(item.discount),
        gstRate: toNumber(item.gstRate, toNumber(updates.taxRate ?? invoice.taxRate)),
      })).filter((item) => item.description);
    }

    const totalsNeedRefresh = ["items", "taxRate", "discount", "shipping", "roundOff"].some((field) => updates[field] !== undefined);
    if (totalsNeedRefresh) {
      if (invoice.items.length > limits.invoiceItemsPerInvoice) {
        throw new Error("invoice items exceed active plan limit");
      }

      const totals = calculateInvoiceTotals(invoice.items, toNumber(invoice.taxRate), invoice);
      Object.assign(invoice, totals);
    }
    refreshInvoicePaymentStatus(invoice);

    persist();
    return clone(invoice);
  }

  function updatePurchaseOrder(id, updates, limits) {
    const purchaseOrder = state.purchaseOrders.find((entry) => entry.id === id);
    if (!purchaseOrder) return null;
    assertPurchaseOrderCanBeEdited(purchaseOrder);

    [
      "status",
      "documentType",
      "customerId",
      "poNumber",
      "poDate",
      "dueDate",
      "currency",
      "paymentTerms",
      "placeOfSupply",
      "gstMode",
      "modeOfDelivery",
      "modeOfPayment",
      "notes",
      "paymentInstructions",
      "terms",
      "billToName",
      "billToAddress",
    ].forEach((field) => {
      if (updates[field] !== undefined) purchaseOrder[field] = field === "status"
        ? normalizeRecordStatus(updates[field], purchaseOrder.status || "created")
        : String(updates[field] || "").trim();
    });
    if (updates.companyId !== undefined) purchaseOrder.companyId = updates.companyId || null;
    if (updates.taxRate !== undefined) purchaseOrder.taxRate = toNumber(updates.taxRate);
    if (updates.discount !== undefined) purchaseOrder.discount = toNumber(updates.discount);
    if (updates.shipping !== undefined) purchaseOrder.shipping = toNumber(updates.shipping);
    if (updates.roundOff !== undefined) purchaseOrder.roundOff = toNumber(updates.roundOff);
    if (updates.items !== undefined) {
      purchaseOrder.items = updates.items.map((item) => ({
        description: String(item.description || "").trim(),
        hsnSac: String(item.hsnSac || "").trim(),
        unit: String(item.unit || "").trim(),
        quantity: toNumber(item.quantity),
        rate: toNumber(item.rate),
        discount: toNumber(item.discount),
        gstRate: toNumber(item.gstRate, toNumber(updates.taxRate ?? purchaseOrder.taxRate)),
      })).filter((item) => item.description);
    }

    const totalsNeedRefresh = ["items", "taxRate", "discount", "shipping", "roundOff"].some((field) => updates[field] !== undefined);
    if (totalsNeedRefresh) {
      if (purchaseOrder.items.length > limits.invoiceItemsPerInvoice) {
        throw new Error("purchase/work order items exceed active plan limit");
      }
      Object.assign(purchaseOrder, calculateInvoiceTotals(purchaseOrder.items, toNumber(purchaseOrder.taxRate), purchaseOrder));
    }

    persist();
    return clone(purchaseOrder);
  }

  function deleteInvoice(id, user) {
    const invoice = state.invoices.find((entry) => entry.id === id);
    if (!invoice) return null;
    const companiesOwned = new Set(state.companies.filter((company) => company.ownerUserId === user?.id).map((company) => company.id));
    if (user && user.role !== "admin" && invoice.ownerUserId !== user.id && !companiesOwned.has(invoice.companyId)) return null;
    invoice.status = "deleted";
    invoice.paymentStatus = "deleted";
    invoice.deletedAt = new Date().toISOString();
    persist();
    return clone(invoice);
  }

  function deletePurchaseOrder(id, user) {
    const purchaseOrder = state.purchaseOrders.find((entry) => entry.id === id);
    if (!purchaseOrder) return null;
    const companiesOwned = new Set(state.companies.filter((company) => company.ownerUserId === user?.id).map((company) => company.id));
    if (user && user.role !== "admin" && purchaseOrder.ownerUserId !== user.id && !companiesOwned.has(purchaseOrder.companyId)) return null;
    purchaseOrder.status = "deleted";
    purchaseOrder.deletedAt = new Date().toISOString();
    persist();
    return clone(purchaseOrder);
  }
  return {
    createUser,
    listUsers,
    getUserById,
    getUserByEmail,
    updateUserAuthDetails,
    updateUserProfile,
    createCompany,
    listCompanies,
    updateCompanyKyc,
    updateCompany,
    createCustomer,
    listCustomers,
    getCustomer,
    updateCustomer,
    deleteCustomer,
    reactivateCustomer,
    createVendor,
    listVendors,
    getVendor,
    updateVendor,
    deleteVendor,
    reactivateVendor,
    createInvoice,
    createPurchaseOrder,
    runRecurringInvoiceScheduler,
    listInvoicesForUser,
    listPurchaseOrdersForUser,
    createSubscription,
    createBillingOrder,
    getBillingOrderByGatewayOrderId,
    updateBillingOrder,
    listBillingOrders,
    createReport,
    createAiUsageLog,
    listAiUsageLogsForUser,
    countAiUsageForUser,
    createTeamMember,
    listTeamMembersForUser,
    listTeamMembersForWorkspace,
    listBusinessWorkspacesForUser,
    getBusinessWorkspaceAccess,
    updateTeamMember,
    getBusinessSettingsForUser,
    getRawBusinessSettingsForUser,
    upsertBusinessSettings,
    validateBusinessEmailSettings,
    getBusinessComplianceDashboard,
    updateComplianceTask,
    recordComplianceReminderDelivery,
    createApprovalRequest,
    listApprovalRequestsForUser,
    decideApprovalRequest,
    createApiKey,
    findActiveApiKeyByToken,
    listApiKeysForUser,
    revokeApiKey,
    listSubscriptions,
    listSubscriptionsForUser,
    getSubscription,
    updateSubscription,
    cancelSubscription,
    renewSubscription,
    expireSubscriptions,
    listMonetization,
    summarizeMonetization,
    listReportsForUser,
    listInvoices,
    getInvoice,
    updateInvoice,
    updatePurchaseOrder,
    deleteInvoice,
    deletePurchaseOrder,
    recordInvoicePayment,
    createInvoicePaymentLink,
    recordGatewayPayment,
    listPaymentsForUser,
    getPurchaseOrder,
    setUserRestriction,
    setUserPermissions,
    listRestrictedUsers,
    countUsage,
    countUsageForUser,
    summarizeRecords,
    exportState,
  };
}


