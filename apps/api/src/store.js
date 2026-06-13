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
    monetization: [],
    reports: [],
    counters: {
      user: 0,
      company: 0,
      customer: 0,
      invoice: 0,
      purchaseOrder: 0,
      payment: 0,
      subscription: 0,
      monetization: 0,
      report: 0,
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
    monetization: 0,
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
      monetization: state.monetization,
      reports: state.reports,
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
    const amount = Number(input.amount ?? 0);
    const subscription = {
      id: nextId("sub", ++state.counters.subscription),
      subscriberType: input.subscriberType ?? "individual",
      subscriberName: input.subscriberName?.trim() ?? "",
      companyId: input.companyId ?? null,
      userId: input.userId ?? null,
      groupName: input.groupName?.trim() ?? "",
      plan: input.plan ?? "free",
      amount,
      currency: input.currency ?? "INR",
      billingCycle: input.billingCycle ?? "monthly",
      status: input.status ?? "active",
      adminUserId: input.adminUserId ?? null,
      createdAt: new Date().toISOString(),
    };
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

  function listSubscriptions() {
    return clone(state.subscriptions);
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

  function listInvoices() {
    return clone(state.invoices);
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
    };
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
      "billToName",
      "billToAddress",
    ].forEach((field) => {
      if (updates[field] !== undefined) invoice[field] = String(updates[field] || "").trim();
    });
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
    listInvoicesForUser,
    listPurchaseOrdersForUser,
    createSubscription,
    createReport,
    listSubscriptions,
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
  };
}


