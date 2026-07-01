import crypto from "node:crypto";
import { loadPersistedState, savePersistedState } from "./persistence.js";

function clone(value) {
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

function isActivePaidSubscription(subscription) {
  return String(subscription.status || "active").toLowerCase() === "active"
    && String(subscription.plan || "free").toLowerCase() !== "free"
    && toNumber(subscription.amount) > 0;
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
  const persisted = usePersistence ? loadPersistedState() : {};
  const state = {
    users: [],
    companies: [],
    customers: [],
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
    counters: {
      user: 0,
      company: 0,
      customer: 0,
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
    },
    ...clone(seed),
    ...clone(persisted),
  };

  state.counters = {
    user: 0,
    company: 0,
    customer: 0,
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
    ...(clone(seed).counters || {}),
    ...(clone(persisted).counters || {}),
  };

  function persist() {
    if (!usePersistence) return;
    savePersistedState({
      users: state.users,
      companies: state.companies,
      customers: state.customers,
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
    const items = input.items.map((item) => ({
      description: item.description.trim(),
      hsnSac: item.hsnSac?.trim() ?? "",
      unit: item.unit?.trim() ?? "",
      quantity: toNumber(item.quantity),
      rate: toNumber(item.rate),
      discount: toNumber(item.discount),
      gstRate: toNumber(item.gstRate, toNumber(input.taxRate)),
    }));

    if (items.length > limits.invoiceItemsPerInvoice) {
      throw new Error("invoice items exceed free plan limit");
    }

    const totals = calculateInvoiceTotals(items, toNumber(input.taxRate), input);
    const ownerUserId = input.ownerUserId ?? null;
    const company = state.companies.find((entry) => entry.id === input.companyId) ?? null;
    const owner = state.users.find((entry) => entry.id === ownerUserId) ?? null;
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
      status: input.status?.trim() || "draft",
      paymentStatus: input.status === "draft" ? "draft" : input.paymentStatus?.trim() || "unpaid",
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
    state.invoices.push(invoice);
    persist();
    return clone(invoice);
  }

  function createPurchaseOrder(input, limits) {
    const items = input.items.map((item) => ({
      description: item.description.trim(),
      hsnSac: item.hsnSac?.trim() ?? "",
      unit: item.unit?.trim() ?? "",
      quantity: toNumber(item.quantity),
      rate: toNumber(item.rate),
      discount: toNumber(item.discount),
      gstRate: toNumber(item.gstRate, toNumber(input.taxRate)),
    }));

    if (items.length > limits.invoiceItemsPerInvoice) {
      throw new Error("purchase order items exceed free plan limit");
    }

    const totals = calculateInvoiceTotals(items, toNumber(input.taxRate), input);
    const ownerUserId = input.ownerUserId ?? null;
    const company = state.companies.find((entry) => entry.id === input.companyId) ?? null;
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
      status: input.status?.trim() || "created",
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
    const renewalDate = new Date(createdAt);
    if (billingCycle === "monthly") {
      renewalDate.setUTCMonth(renewalDate.getUTCMonth() + 1);
    } else {
      renewalDate.setUTCFullYear(renewalDate.getUTCFullYear() + 1);
    }
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
      startedAt: input.startedAt ?? createdAt,
      expiresAt: input.expiresAt ?? renewalDate.toISOString(),
      renewsAt: input.renewsAt ?? renewalDate.toISOString(),
      createdAt,
    };
    if (isActivePaidSubscription(subscription)) {
      state.subscriptions.forEach((entry) => {
        const sameAccount = subscription.userId
          ? entry.userId === subscription.userId
          : subscription.companyId && entry.companyId === subscription.companyId;
        if (sameAccount && isActivePaidSubscription(entry)) {
          entry.status = "superseded";
          entry.supersededAt = createdAt;
          entry.supersededByGatewayOrderId = subscription.gatewayOrderId || "";
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
    const complianceProfile = input.complianceProfile || {};
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
      complianceProfile: {
        legalName: String(complianceProfile.legalName || "").trim(),
        gstRegistered: Boolean(complianceProfile.gstRegistered),
        gstin: String(complianceProfile.gstin || "").trim().toUpperCase(),
        pan: String(complianceProfile.pan || "").trim().toUpperCase(),
        tan: String(complianceProfile.tan || "").trim().toUpperCase(),
        state: String(complianceProfile.state || "").trim(),
        address: String(complianceProfile.address || "").trim(),
        placeOfBusiness: String(complianceProfile.placeOfBusiness || "").trim(),
        invoicePrefix: String(complianceProfile.invoicePrefix || "").trim().toUpperCase(),
        fiscalYearStartMonth: Math.min(12, Math.max(1, Number(complianceProfile.fiscalYearStartMonth || 4))),
      },
    };
  }

  function sanitizeBusinessSettings(settings) {
    if (!settings) return null;
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

  function listTeamMembersForUser(user) {
    if (!user || user.role === "admin") return clone(state.teamMembers);
    return clone(state.teamMembers.filter((member) => (
      member.ownerUserId === user.id
      || member.invitedByUserId === user.id
      || member.acceptedUserId === user.id
      || String(member.email || "").toLowerCase() === String(user.email || "").toLowerCase()
    )));
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
      status: ["active", "invited"].includes(input.status) ? input.status : "invited",
      invitedByUserId: input.invitedByUserId ?? input.ownerUserId ?? null,
      acceptedUserId: input.acceptedUserId ?? null,
      inviteToken: input.inviteToken || `invite_${crypto.randomBytes(16).toString("hex")}`,
      inviteExpiresAt: input.inviteExpiresAt || new Date(Date.now() + 7 * 86400000).toISOString(),
      inviteDeliveryStatus: input.inviteDeliveryStatus || "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.teamMembers.push(member);
    persist();
    return clone(member);
  }

  function acceptTeamInvite(user, inviteToken) {
    if (!user?.id) throw new Error("Authentication required");
    const tokenValue = String(inviteToken || "").trim();
    const member = state.teamMembers.find((entry) => entry.inviteToken === tokenValue && entry.status === "invited");
    if (!member) return null;
    if (String(member.email || "").toLowerCase() !== String(user.email || "").toLowerCase()) return null;
    if (new Date(member.inviteExpiresAt).getTime() < Date.now()) throw new Error("Team invite has expired");
    member.status = "active";
    member.acceptedUserId = user.id;
    member.updatedAt = new Date().toISOString();
    persist();
    return clone(member);
  }

  function updateTeamMember(memberId, updates = {}, user = null) {
    const member = state.teamMembers.find((entry) => entry.id === memberId);
    if (!member) return null;
    if (user && user.role !== "admin" && member.ownerUserId !== user.id && member.invitedByUserId !== user.id) return null;
    if (updates.name !== undefined) member.name = String(updates.name || member.name).trim();
    if (["owner", "admin", "accountant", "viewer"].includes(updates.role)) member.role = updates.role;
    if (["active", "invited", "removed"].includes(updates.status)) member.status = updates.status;
    if (updates.acceptedUserId !== undefined) member.acceptedUserId = updates.acceptedUserId || null;
    if (updates.inviteDeliveryStatus !== undefined) member.inviteDeliveryStatus = String(updates.inviteDeliveryStatus || "queued");
    if (updates.inviteDeliveryMessage !== undefined) member.inviteDeliveryMessage = String(updates.inviteDeliveryMessage || "");
    if (updates.inviteSentAt !== undefined) member.inviteSentAt = updates.inviteSentAt || null;
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
    const payment = {
      id: nextId("pay", ++state.counters.payment),
      ownerUserId: invoice.ownerUserId,
      invoiceId,
      amount: toNumber(input.amount),
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
    };
  }

  function exportState() {
    return clone(state);
  }

  function updateInvoice(id, updates, limits) {
    const invoice = state.invoices.find((entry) => entry.id === id);
    if (!invoice) return null;

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
      if (updates[field] !== undefined) invoice[field] = String(updates[field] || "").trim();
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

    if (updates.items !== undefined || updates.taxRate !== undefined) {
      if (invoice.items.length > limits.invoiceItemsPerInvoice) {
        throw new Error("invoice items exceed free plan limit");
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
      if (updates[field] !== undefined) purchaseOrder[field] = String(updates[field] || "").trim();
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

    if (updates.items !== undefined || updates.taxRate !== undefined) {
      if (purchaseOrder.items.length > limits.invoiceItemsPerInvoice) {
        throw new Error("purchase order items exceed free plan limit");
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
    updateTeamMember,
    acceptTeamInvite,
    getBusinessSettingsForUser,
    getRawBusinessSettingsForUser,
    upsertBusinessSettings,
    validateBusinessEmailSettings,
    createApprovalRequest,
    listApprovalRequestsForUser,
    decideApprovalRequest,
    createApiKey,
    findActiveApiKeyByToken,
    listApiKeysForUser,
    revokeApiKey,
    listSubscriptions,
    listSubscriptionsForUser,
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


