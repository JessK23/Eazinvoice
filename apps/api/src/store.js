import crypto from "node:crypto";
import { loadPersistedState, savePersistedState } from "./persistence.js";
import {
  assessComplianceProfile,
  buildComplianceReminderDigest,
  generateComplianceSchedule,
  normalizeComplianceProfile,
  summarizeComplianceTasks,
} from "./compliance-engine.js";
import {
  ensureDefaultAccountingAccounts,
  postInvoiceIssued,
  postPaymentCaptured,
  postVendorBillPosted,
  postVendorPaymentCaptured,
  postCustomerPaymentReversed,
  postVendorPaymentReversed,
  postCustomerRefundProcessed,
  postVendorRefundReceived,
  postSalesCreditNotePosted,
  postVendorCreditPosted,
  publicJournalWithLines,
  reconcileAccountingPostings,
  validateBalancedJournal,
} from "./accounting-service.js";
import {
  calculateFinancialDocument,
  calculatePaymentState,
  normalizeFinancialItems,
  paymentIdempotencyKey,
  validatePaymentApplication,
} from "./financial-service.js";
import {
  buildInternalBankTransactions,
  calculateBankReconciliationSummary,
  maskAccountReference,
  moneyFromMinor,
  normalizeBankAccountType,
  normalizeStatementLine,
  suggestMatchesForLine,
  toMinor,
} from "./bank-reconciliation-service.js";
import {
  buildComplianceReadiness,
  buildGstReconciliation,
  buildGstPurchaseRegister,
  buildGstSalesRegister,
  buildTdsReconciliation,
  buildTdsRegister,
  classifyGstTransaction,
  evaluateTdsForVendorBill,
  maskTaxIdentifier,
  normalizeCompliancePeriod,
  normalizeIndiaTaxProfile,
  publicTaxProfile,
  selectComplianceRuleSet,
  validateGstin,
  validatePan,
  validateTan,
  money as complianceMoney,
  toMinor as complianceToMinor,
} from "./india-compliance-service.js";

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function canonicalEmail(email) {
  return String(email || "").trim().toLowerCase();
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

const API_KEY_HASH_ALGORITHM = "hmac-sha256";

function apiKeyHashSecret() {
  return process.env.API_KEY_HASH_SECRET
    || process.env.EAZINVOICE_API_KEY_HASH_SECRET
    || process.env.ADMIN_ACCESS_KEY
    || "eazinvoice-development-api-key-hash-secret";
}

function hashApiKeyToken(token) {
  return crypto
    .createHmac("sha256", apiKeyHashSecret())
    .update(String(token || "").trim(), "utf8")
    .digest("hex");
}

function tokenPreview(token) {
  const value = String(token || "").trim();
  return `${value.slice(0, 12)}...${value.slice(-4)}`;
}

function tokenPrefix(token) {
  return String(token || "").trim().slice(0, 12);
}

function secureStringEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
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
    businesses: [],
    companies: [],
    customers: [],
    vendors: [],
    vendorBills: [],
    creditNotes: [],
    vendorCredits: [],
    paymentReversals: [],
    customerRefunds: [],
    vendorPaymentReversals: [],
    vendorRefunds: [],
    bankAccounts: [],
    bankStatementImportBatches: [],
    bankStatementLines: [],
    bankReconciliationMatches: [],
    taxRegistrations: [],
    complianceRuleSets: [],
    transactionComplianceSnapshots: [],
    complianceObligations: [],
    tdsTransactions: [],
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
    ledgerAccounts: [],
    financialEvents: [],
    accountingJournals: [],
    accountingJournalLines: [],
    businessSettings: [],
    complianceTasks: [],
    businessAuditEvents: [],
    counters: {
      user: 0,
      business: 0,
      company: 0,
      customer: 0,
      vendor: 0,
      vendorBill: 0,
      creditNote: 0,
      vendorCredit: 0,
      paymentReversal: 0,
      customerRefund: 0,
      vendorPaymentReversal: 0,
      vendorRefund: 0,
      bankAccount: 0,
      bankStatementImportBatch: 0,
      bankStatementLine: 0,
      bankReconciliationMatch: 0,
      taxRegistration: 0,
      complianceRuleSet: 0,
      transactionComplianceSnapshot: 0,
      complianceObligation: 0,
      tdsTransaction: 0,
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
      ledgerAccount: 0,
      financialEvent: 0,
      accountingJournal: 0,
      businessSetting: 0,
      complianceTask: 0,
      businessAuditEvent: 0,
    },
    ...clone(seed),
    ...clone(persisted),
  };

  state.counters = {
    user: 0,
    business: 0,
    company: 0,
    customer: 0,
    vendor: 0,
    vendorBill: 0,
    creditNote: 0,
    vendorCredit: 0,
    paymentReversal: 0,
    customerRefund: 0,
    vendorPaymentReversal: 0,
    vendorRefund: 0,
    bankAccount: 0,
    bankStatementImportBatch: 0,
    bankStatementLine: 0,
    bankReconciliationMatch: 0,
    taxRegistration: 0,
    complianceRuleSet: 0,
    transactionComplianceSnapshot: 0,
    complianceObligation: 0,
    tdsTransaction: 0,
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
    ledgerAccount: 0,
    financialEvent: 0,
    accountingJournal: 0,
    businessSetting: 0,
    complianceTask: 0,
    businessAuditEvent: 0,
    ...(clone(seed).counters || {}),
    ...(clone(persisted).counters || {}),
  };

  function persist() {
    if (!usePersistence) return;
    persistenceAdapter.save({
      users: state.users,
      businesses: state.businesses,
      companies: state.companies,
      customers: state.customers,
      vendors: state.vendors,
      vendorBills: state.vendorBills,
      creditNotes: state.creditNotes,
      vendorCredits: state.vendorCredits,
      paymentReversals: state.paymentReversals,
      customerRefunds: state.customerRefunds,
      vendorPaymentReversals: state.vendorPaymentReversals,
      vendorRefunds: state.vendorRefunds,
      bankAccounts: state.bankAccounts,
      bankStatementImportBatches: state.bankStatementImportBatches,
      bankStatementLines: state.bankStatementLines,
      bankReconciliationMatches: state.bankReconciliationMatches,
      taxRegistrations: state.taxRegistrations,
      complianceRuleSets: state.complianceRuleSets,
      transactionComplianceSnapshots: state.transactionComplianceSnapshots,
      complianceObligations: state.complianceObligations,
      tdsTransactions: state.tdsTransactions,
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
      ledgerAccounts: state.ledgerAccounts,
      financialEvents: state.financialEvents,
      accountingJournals: state.accountingJournals,
      accountingJournalLines: state.accountingJournalLines,
      businessSettings: state.businessSettings,
      complianceTasks: state.complianceTasks,
      businessAuditEvents: state.businessAuditEvents,
      counters: state.counters,
    });
  }

  function migratePlaintextApiKeysAtRest() {
    let migrated = false;
    state.apiKeys = (Array.isArray(state.apiKeys) ? state.apiKeys : []).map((apiKey) => {
      if (!apiKey || typeof apiKey !== "object") return apiKey;
      const token = String(apiKey.token || "").trim();
      if (!token || apiKey.tokenHash) {
        if (Object.hasOwn(apiKey, "token") && apiKey.token) {
          const { token: _token, ...safeKey } = apiKey;
          migrated = true;
          return safeKey;
        }
        return apiKey;
      }
      const { token: _token, ...safeKey } = apiKey;
      migrated = true;
      return {
        ...safeKey,
        tokenPrefix: apiKey.tokenPrefix || tokenPrefix(token),
        tokenPreview: apiKey.tokenPreview || tokenPreview(token),
        tokenHash: hashApiKeyToken(token),
        tokenHashAlgorithm: API_KEY_HASH_ALGORITHM,
        tokenMigratedAt: new Date().toISOString(),
      };
    });
    if (migrated) persist();
  }

  function migrateIdentityCanonicalFields() {
    let migrated = false;
    state.users = (Array.isArray(state.users) ? state.users : []).map((user) => {
      if (!user || typeof user !== "object") return user;
      const email = canonicalEmail(user.email);
      if (user.email !== email || user.canonicalEmail !== email) {
        migrated = true;
        return {
          ...user,
          email,
          canonicalEmail: email,
        };
      }
      return user;
    });

    const usersByCanonicalEmail = new Map();
    state.users.forEach((user) => {
      const email = canonicalEmail(user?.canonicalEmail || user?.email);
      if (!email) return;
      const list = usersByCanonicalEmail.get(email) || [];
      list.push(user);
      usersByCanonicalEmail.set(email, list);
    });

    state.teamMembers = (Array.isArray(state.teamMembers) ? state.teamMembers : []).map((member) => {
      if (!member || typeof member !== "object") return member;
      const email = canonicalEmail(member.email);
      const updated = {
        ...member,
        email,
        canonicalEmail: email,
      };
      if (!updated.acceptedUserId && email) {
        const verifiedMatches = (usersByCanonicalEmail.get(email) || []).filter((user) => user.emailVerified);
        if (verifiedMatches.length === 1) {
          updated.acceptedUserId = verifiedMatches[0].id;
        } else if (verifiedMatches.length > 1) {
          updated.identityConflict = "duplicate_verified_email";
        }
      }
      if (
        updated.email !== member.email
        || updated.canonicalEmail !== member.canonicalEmail
        || updated.acceptedUserId !== member.acceptedUserId
        || updated.identityConflict !== member.identityConflict
      ) {
        migrated = true;
      }
      return updated;
    });
  }

  function findBusinessByIdOrLegacyOwner(identifier) {
    const value = String(identifier || "").trim();
    if (!value) return null;
    return state.businesses.find((business) => (
      business.id === value
      || business.ownerUserId === value
      || business.legacyOwnerUserId === value
    )) || null;
  }

  function createBusinessRecord(input = {}, persistChange = true) {
    const ownerUserId = input.ownerUserId || input.legacyOwnerUserId || null;
    if (!ownerUserId) throw new Error("Business owner is required");
    const existing = findBusinessByIdOrLegacyOwner(input.id || ownerUserId);
    if (existing && !input.forceNew) return clone(existing);
    const owner = state.users.find((entry) => entry.id === ownerUserId) || null;
    const business = {
      id: input.id || nextId("biz", ++state.counters.business),
      ownerUserId,
      legacyOwnerUserId: input.legacyOwnerUserId || ownerUserId,
      name: String(input.name || owner?.name || owner?.email || "Business workspace").trim(),
      legalName: String(input.legalName || "").trim(),
      status: String(input.status || "active").trim().toLowerCase(),
      createdAt: input.createdAt || new Date().toISOString(),
      updatedAt: input.updatedAt || new Date().toISOString(),
    };
    state.businesses.push(business);
    if (persistChange) persist();
    return clone(business);
  }

  function ensureBusinessForOwner(ownerUserId, input = {}, persistChange = false) {
    if (!ownerUserId) return null;
    const existing = findBusinessByIdOrLegacyOwner(input.businessId || ownerUserId);
    if (existing) return existing;
    return createBusinessRecord({
      ...input,
      ownerUserId,
      legacyOwnerUserId: input.legacyOwnerUserId || ownerUserId,
    }, persistChange);
  }

  function inferBusinessIdForRecord(record) {
    if (!record || typeof record !== "object") return null;
    if (record.businessId && findBusinessByIdOrLegacyOwner(record.businessId)) {
      return findBusinessByIdOrLegacyOwner(record.businessId).id;
    }
    if (record.ownerUserId) return ensureBusinessForOwner(record.ownerUserId)?.id || null;
    if (record.userId) return ensureBusinessForOwner(record.userId)?.id || null;
    if (record.companyId) {
      const company = state.companies.find((entry) => entry.id === record.companyId);
      if (company?.businessId) return company.businessId;
      if (company?.ownerUserId) return ensureBusinessForOwner(company.ownerUserId)?.id || null;
    }
    if (record.invoiceId) {
      const invoice = state.invoices.find((entry) => entry.id === record.invoiceId);
      if (invoice?.businessId) return invoice.businessId;
      if (invoice?.ownerUserId) return ensureBusinessForOwner(invoice.ownerUserId)?.id || null;
    }
    if (record.sourceInvoiceId) {
      const invoice = state.invoices.find((entry) => entry.id === record.sourceInvoiceId);
      if (invoice?.businessId) return invoice.businessId;
      if (invoice?.ownerUserId) return ensureBusinessForOwner(invoice.ownerUserId)?.id || null;
    }
    if (record.purchaseOrderId) {
      const purchaseOrder = state.purchaseOrders.find((entry) => entry.id === record.purchaseOrderId);
      if (purchaseOrder?.businessId) return purchaseOrder.businessId;
      if (purchaseOrder?.ownerUserId) return ensureBusinessForOwner(purchaseOrder.ownerUserId)?.id || null;
    }
    if (record.vendorBillId) {
      const vendorBill = state.vendorBills.find((entry) => entry.id === record.vendorBillId);
      if (vendorBill?.businessId) return vendorBill.businessId;
      if (vendorBill?.ownerUserId) return ensureBusinessForOwner(vendorBill.ownerUserId)?.id || null;
    }
    if (record.sourceVendorBillId) {
      const vendorBill = state.vendorBills.find((entry) => entry.id === record.sourceVendorBillId);
      if (vendorBill?.businessId) return vendorBill.businessId;
      if (vendorBill?.ownerUserId) return ensureBusinessForOwner(vendorBill.ownerUserId)?.id || null;
    }
    if (record.originalPaymentId) {
      const payment = state.payments.find((entry) => entry.id === record.originalPaymentId);
      if (payment?.businessId) return payment.businessId;
      if (payment?.ownerUserId) return ensureBusinessForOwner(payment.ownerUserId)?.id || null;
    }
    if (record.sourceCreditNoteId) {
      const note = state.creditNotes.find((entry) => entry.id === record.sourceCreditNoteId);
      if (note?.businessId) return note.businessId;
      if (note?.ownerUserId) return ensureBusinessForOwner(note.ownerUserId)?.id || null;
    }
    if (record.sourceVendorCreditId) {
      const credit = state.vendorCredits.find((entry) => entry.id === record.sourceVendorCreditId);
      if (credit?.businessId) return credit.businessId;
      if (credit?.ownerUserId) return ensureBusinessForOwner(credit.ownerUserId)?.id || null;
    }
    return null;
  }

  function migrateCanonicalBusinessFields() {
    state.businesses = Array.isArray(state.businesses) ? state.businesses : [];
    if (!state.counters.business) {
      state.counters.business = state.businesses.reduce((max, business) => {
        const match = String(business?.id || "").match(/^biz_(\d+)$/);
        return match ? Math.max(max, Number(match[1])) : max;
      }, 0);
    }

    state.users.forEach((user) => {
      if (user?.id) ensureBusinessForOwner(user.id, { name: user.name || user.email }, false);
    });

    [
      state.companies,
      state.customers,
      state.vendors,
      state.vendorBills,
      state.creditNotes,
      state.vendorCredits,
      state.paymentReversals,
      state.customerRefunds,
      state.vendorPaymentReversals,
      state.vendorRefunds,
      state.bankAccounts,
      state.bankStatementImportBatches,
      state.bankStatementLines,
      state.bankReconciliationMatches,
      state.taxRegistrations,
      state.complianceRuleSets,
      state.transactionComplianceSnapshots,
      state.complianceObligations,
      state.tdsTransactions,
      state.invoices,
      state.purchaseOrders,
      state.payments,
      state.subscriptions,
      state.reports,
      state.teamMembers,
      state.approvalRequests,
      state.apiKeys,
      state.ledgerAccounts,
      state.financialEvents,
      state.accountingJournals,
      state.accountingJournalLines,
      state.businessSettings,
      state.complianceTasks,
      state.businessAuditEvents,
    ].forEach((collection) => {
      (Array.isArray(collection) ? collection : []).forEach((record) => {
        if (!record || typeof record !== "object" || record.businessId) return;
        const businessId = inferBusinessIdForRecord(record);
        if (businessId) record.businessId = businessId;
      });
    });
  }

  migratePlaintextApiKeysAtRest();
  migrateIdentityCanonicalFields();
  migrateCanonicalBusinessFields();

  function createUser(input) {
    const email = canonicalEmail(input.email);
    const emailVerified = input.emailVerified ?? false;
    if (emailVerified) {
      const duplicateVerified = state.users.find((entry) => (
        canonicalEmail(entry.canonicalEmail || entry.email) === email
        && entry.emailVerified
      ));
      if (duplicateVerified) {
        throw new Error("A verified account already exists for this email. Please login.");
      }
    }
    const user = {
      id: nextId("usr", ++state.counters.user),
      name: String(input.name || "").trim(),
      email,
      canonicalEmail: email,
      phone: input.phone?.trim() ?? "",
      mobileVerified: input.mobileVerified ?? false,
      emailVerified,
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
    ensureBusinessForOwner(user.id, { name: user.name || user.email }, false);
    state.teamMembers.forEach((member) => {
      if (
        !member.acceptedUserId
        && canonicalEmail(member.canonicalEmail || member.email) === user.canonicalEmail
        && isEmailLinkedTeamMember(member)
      ) {
        const verifiedMatches = state.users.filter((entry) => (
          canonicalEmail(entry.canonicalEmail || entry.email) === user.canonicalEmail
          && entry.emailVerified
        ));
        if (verifiedMatches.length === 1) {
          member.acceptedUserId = user.id;
          member.updatedAt = new Date().toISOString();
        }
      }
    });
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
    const normalized = canonicalEmail(email);
    const user = state.users.find((entry) => canonicalEmail(entry.canonicalEmail || entry.email) === normalized);
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
    const business = input.businessId
      ? findBusinessByIdOrLegacyOwner(input.businessId)
      : ensureBusinessForOwner(ownerUserId);
    const companyCode = input.companyCode || makeCodeFromText(input.name, `CMP${state.counters.company + 1}`);
    const company = {
      id: nextId("cmp", ++state.counters.company),
      ownerUserId,
      businessId: business?.id || null,
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
    const business = input.businessId
      ? findBusinessByIdOrLegacyOwner(input.businessId)
      : ensureBusinessForOwner(input.ownerUserId);
    const customer = {
      id: nextId("cus", ++state.counters.customer),
      customerCode: input.customerCode?.trim() || `CUS-${String(customerSequence).padStart(4, "0")}`,
      ownerUserId: input.ownerUserId ?? null,
      businessId: business?.id || null,
      name: input.name.trim(),
      businessName: input.businessName?.trim() ?? "",
      gstNumber: input.gstNumber?.trim() ?? "",
      panNumber: input.panNumber?.trim() ?? "",
      billingState: input.billingState?.trim() ?? input.state?.trim() ?? "",
      stateCode: input.stateCode?.trim() ?? "",
      registrationStatus: input.registrationStatus?.trim() ?? (input.gstNumber ? "registered" : "unregistered"),
      customerType: input.customerType?.trim() ?? "",
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
      "billingState",
      "stateCode",
      "registrationStatus",
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
    const business = input.businessId
      ? findBusinessByIdOrLegacyOwner(input.businessId)
      : ensureBusinessForOwner(input.ownerUserId);
    const vendor = {
      id: nextId("ven", ++state.counters.vendor),
      vendorCode: input.vendorCode?.trim() || `VEN-${String(vendorSequence).padStart(4, "0")}`,
      ownerUserId: input.ownerUserId ?? null,
      businessId: business?.id || null,
      vendorType: input.vendorType?.trim() || input.category?.trim() || "business",
      name: input.name?.trim() || input.vendorName?.trim() || input.businessName?.trim() || "",
      businessName: input.businessName?.trim() || "",
      gstNumber: input.gstNumber?.trim() ?? input.gstin?.trim() ?? "",
      panNumber: input.panNumber?.trim() ?? input.pan?.trim() ?? "",
      billingState: input.billingState?.trim() ?? input.state?.trim() ?? "",
      stateCode: input.stateCode?.trim() ?? "",
      registrationStatus: input.registrationStatus?.trim() ?? (input.gstNumber || input.gstin ? "registered" : "unregistered"),
      tdsApplicability: input.tdsApplicability?.trim() ?? "",
      defaultTdsNatureOfPayment: input.defaultTdsNatureOfPayment?.trim() ?? "",
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
      "billingState",
      "stateCode",
      "registrationStatus",
      "tdsApplicability",
      "defaultTdsNatureOfPayment",
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
    return calculateFinancialDocument({
      ...adjustments,
      items,
      taxRate,
      gstMode: adjustments.gstMode || "intra",
    });
  }

  function createInvoice(input, limits) {
    const items = normalizeFinancialItems(input.items, toNumber(input.taxRate)).filter((item) => item.description);

    if (items.length > limits.invoiceItemsPerInvoice) {
      throw new Error("invoice items exceed active plan limit");
    }

    const totals = calculateInvoiceTotals(items, toNumber(input.taxRate), input);
    const ownerUserId = input.ownerUserId ?? null;
    const business = input.businessId
      ? findBusinessByIdOrLegacyOwner(input.businessId)
      : ensureBusinessForOwner(ownerUserId);
    const company = state.companies.find((entry) => entry.id === input.companyId) ?? null;
    const owner = state.users.find((entry) => entry.id === ownerUserId) ?? null;
    const status = normalizeRecordStatus(input.status, "draft");
    const invoiceCode = input.invoiceCode || (company
      ? makeCodeFromText(company.companyCode || company.name, `INV${state.counters.invoice + 1}`)
      : makeInitialCode(input.ownerCode || owner?.name, "IND"));
    const invoiceSequence = state.invoices.filter((entry) => (
      (business?.id && entry.businessId === business.id)
      || entry.ownerUserId === ownerUserId
    )).length + 1;
    const invoiceNumber = input.invoiceNumber?.trim() || formatDocumentNumber(invoiceCode, input.invoiceDate, invoiceSequence);
    const duplicateInvoice = state.invoices.find((entry) => (
      entry.invoiceNumber === invoiceNumber
      && String(entry.status || "").toLowerCase() !== "deleted"
      && ((business?.id && entry.businessId === business.id) || entry.ownerUserId === ownerUserId)
    ));
    if (duplicateInvoice) throw new Error("Invoice number already exists for this business.");
    const invoice = {
      id: nextId("inv", ++state.counters.invoice),
      ownerUserId,
      businessId: business?.id || company?.businessId || null,
      companyId: input.companyId ?? null,
      invoiceCode,
      invoiceNumber,
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
    if (normalizeRecordStatus(invoice.status, "draft") !== "draft") {
      buildComplianceSnapshot("invoice", invoice, { direction: "output" });
    }
    const postingBusiness = invoice.businessId ? (business || findBusinessByIdOrLegacyOwner(invoice.businessId)) : null;
    if (postingBusiness) postInvoiceIssued(state, invoice, postingBusiness);
    persist();
    return clone(invoice);
  }

  function createPurchaseOrder(input, limits) {
    const items = normalizeFinancialItems(input.items, toNumber(input.taxRate)).filter((item) => item.description);

    if (items.length > limits.invoiceItemsPerInvoice) {
      throw new Error("purchase/work order items exceed active plan limit");
    }

    const totals = calculateInvoiceTotals(items, toNumber(input.taxRate), input);
    const ownerUserId = input.ownerUserId ?? null;
    const business = input.businessId
      ? findBusinessByIdOrLegacyOwner(input.businessId)
      : ensureBusinessForOwner(ownerUserId);
    const company = state.companies.find((entry) => entry.id === input.companyId) ?? null;
    const status = normalizeRecordStatus(input.status, "created");
    const poCode = input.poCode || makeCodeFromText(company?.companyCode || input.ownerCode || "PO", `PO${state.counters.purchaseOrder + 1}`);
    const poSequenceNumber = state.purchaseOrders.filter((entry) => (
      (business?.id && entry.businessId === business.id)
      || entry.ownerUserId === ownerUserId
    )).length + 1;
    const poSequence = String(poSequenceNumber).padStart(4, "0");
    const vendorCode = input.vendorCode?.trim() || `VEN-${poSequence}`;
    const poNumber = input.poNumber?.trim() ?? `${poCode}-${poSequence}`;
    const duplicatePurchaseOrder = state.purchaseOrders.find((entry) => (
      entry.poNumber === poNumber
      && String(entry.status || "").toLowerCase() !== "deleted"
      && ((business?.id && entry.businessId === business.id) || entry.ownerUserId === ownerUserId)
    ));
    if (duplicatePurchaseOrder) throw new Error("Purchase/work order number already exists for this business.");
    const purchaseOrder = {
      id: nextId("po", ++state.counters.purchaseOrder),
      ownerUserId,
      businessId: business?.id || company?.businessId || null,
      companyId: input.companyId ?? null,
      vendorCode,
      documentType: input.documentType?.trim() || "po",
      poCode,
      poNumber,
      status,
      vendorId: input.vendorId ?? input.customerId ?? null,
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
    refreshPurchaseOrderPaymentStatus(purchaseOrder);
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
    const business = input.businessId
      ? findBusinessByIdOrLegacyOwner(input.businessId)
      : ensureBusinessForOwner(input.userId);
    const billingCycle = input.billingCycle ?? "yearly";
    const createdAt = new Date().toISOString();
    const renewalDate = nextSubscriptionRenewalDate(createdAt, billingCycle);
    const subscription = {
      id: nextId("sub", ++state.counters.subscription),
      subscriberType: input.subscriberType ?? "individual",
      subscriberName: input.subscriberName?.trim() ?? "",
      companyId: input.companyId ?? null,
      userId: input.userId ?? null,
      businessId: business?.id || null,
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
    const business = input.businessId
      ? findBusinessByIdOrLegacyOwner(input.businessId)
      : ensureBusinessForOwner(input.ownerUserId);
    const report = {
      id: nextId("rpt", ++state.counters.report),
      ownerUserId: input.ownerUserId ?? null,
      businessId: business?.id || null,
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
    const business = input.businessId
      ? findBusinessByIdOrLegacyOwner(input.businessId)
      : ensureBusinessForOwner(input.ownerUserId);
    const log = {
      id: nextId("ailog", ++state.counters.aiUsageLog),
      ownerUserId: input.ownerUserId ?? null,
      businessId: business?.id || null,
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
    const deliveryHistory = Array.isArray(settings.emailSettings?.deliveryHistory)
      ? settings.emailSettings.deliveryHistory.slice(-10).map((entry) => ({
        at: entry.at || "",
        status: String(entry.status || "").trim().toLowerCase(),
        message: String(entry.message || "").trim().slice(0, 500),
        recipient: String(entry.recipient || "").trim().toLowerCase(),
        action: String(entry.action || "email").trim().slice(0, 80),
      }))
      : [];
    return clone({
      ...settings,
      emailSettings: {
        ...settings.emailSettings,
        smtpPass: "",
        smtpPassConfigured: Boolean(settings.emailSettings?.smtpPass),
        deliveryAttempts: deliveryHistory.length,
        deliveryHistory,
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
    const businessId = ensureBusinessForOwner(ownerUserId)?.id || null;
    const settings = state.businessSettings.find((entry) => (
      (entry.businessId === businessId || entry.ownerUserId === ownerUserId) && (entry.companyId || null) === (companyId || null)
    ));
    return sanitizeBusinessSettings(settings);
  }

  function getRawBusinessSettingsForUser(user, companyId = null) {
    const ownerUserId = user?.role === "admin" && user?.id ? user.id : user?.id;
    if (!ownerUserId) return null;
    const businessId = ensureBusinessForOwner(ownerUserId)?.id || null;
    const settings = state.businessSettings.find((entry) => (
      (entry.businessId === businessId || entry.ownerUserId === ownerUserId) && (entry.companyId || null) === (companyId || null)
    ));
    return clone(settings);
  }

  function upsertBusinessSettings(user, input = {}) {
    if (!user?.id) throw new Error("Authentication required");
    const companyId = input.companyId || null;
    const businessId = ensureBusinessForOwner(user.id)?.id || null;
    const now = new Date().toISOString();
    const normalized = normalizeBusinessSettings(input);
    let settings = state.businessSettings.find((entry) => (
      (entry.businessId === businessId || entry.ownerUserId === user.id) && (entry.companyId || null) === companyId
    ));
    if (!settings) {
      settings = {
        id: nextId("bset", ++state.counters.businessSetting),
        ownerUserId: user.id,
        businessId,
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

  function recordBusinessEmailDelivery(user, input = {}) {
    if (!user?.id) throw new Error("Authentication required");
    const companyId = input.companyId || null;
    const businessId = ensureBusinessForOwner(user.id)?.id || null;
    let settings = state.businessSettings.find((entry) => (
      (entry.businessId === businessId || entry.ownerUserId === user.id) && (entry.companyId || null) === companyId
    ));
    if (!settings) {
      settings = {
        id: nextId("bset", ++state.counters.businessSetting),
        ownerUserId: user.id,
        businessId,
        companyId,
        emailSettings: {},
        paymentSettings: {},
        complianceProfile: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.businessSettings.push(settings);
    }
    const deliveryEntry = {
      at: new Date().toISOString(),
      status: String(input.status || "failed").trim().toLowerCase(),
      message: String(input.message || "").trim().slice(0, 500),
      recipient: String(input.recipient || "").trim().toLowerCase(),
      action: String(input.action || "email").trim().slice(0, 80),
    };
    const deliveryHistory = Array.isArray(settings.emailSettings?.deliveryHistory)
      ? settings.emailSettings.deliveryHistory.slice(-19)
      : [];
    deliveryHistory.push(deliveryEntry);
    settings.emailSettings = {
      ...(settings.emailSettings || {}),
      lastDeliveryAt: deliveryEntry.at,
      lastDeliveryStatus: deliveryEntry.status,
      lastDeliveryMessage: deliveryEntry.message,
      lastDeliveryRecipient: deliveryEntry.recipient,
      lastDeliveryAction: deliveryEntry.action,
      deliveryHistory,
    };
    settings.updatedAt = new Date().toISOString();
    recordBusinessAuditEvent(user, {
      ownerUserId: user.id,
      companyId,
      actorUserId: user.id,
      actorEmail: user.email,
      actorName: user.name,
      actorRole: user.role,
      category: "smtp",
      action: String(input.action || "smtp.delivery").trim().toLowerCase().replace(/[^a-z0-9_.:-]/g, "_").slice(0, 100) || "smtp.delivery",
      outcome: deliveryEntry.status,
      targetType: "email_delivery",
      targetLabel: deliveryEntry.recipient || deliveryEntry.action,
      message: deliveryEntry.message || "Business email delivery attempt recorded",
      metadata: {
        status: deliveryEntry.status,
        recipient: deliveryEntry.recipient,
        action: deliveryEntry.action,
      },
    });
    persist();
    return sanitizeBusinessSettings(settings);
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
    const businessId = ensureBusinessForOwner(user.id)?.id || null;
    return {
      ownerUserId: user.id,
      businessId,
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
    recordBusinessAuditEvent(user, {
      ownerUserId: user.id,
      companyId,
      actorUserId: user.id,
      actorEmail: user.email,
      actorName: user.name,
      actorRole: user.role,
      category: "smtp",
      action: "smtp.compliance_reminder",
      outcome: stored.lastReminderStatus,
      targetType: "compliance_task",
      targetId: taskId,
      targetLabel: sourceTask.complianceName,
      message: stored.lastReminderStatus === "sent" ? "Compliance reminder delivery recorded" : "Compliance reminder delivery failed or was not configured",
      metadata: {
        recipient: stored.lastReminderRecipient,
        status: stored.lastReminderStatus,
        dueDate: sourceTask.dueDate || "",
        frequency: sourceTask.frequency || "",
      },
    });
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
    const expensesPaid = purchaseOrders.reduce((sum, po) => sum + toNumber(po.paidAmount, 0), 0);
    const paid = invoices.reduce((sum, invoice) => sum + toNumber(invoice.paidAmount, 0), 0);
    const receivables = invoices.reduce((sum, invoice) => sum + toNumber(invoice.balanceAmount, Math.max(0, toNumber(invoice.total, 0) - toNumber(invoice.paidAmount, 0))), 0);
    const payables = purchaseOrders.reduce((sum, po) => sum + toNumber(po.balanceAmount, Math.max(0, toNumber(po.total, 0) - toNumber(po.paidAmount, 0))), 0);
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
        expensesPaid,
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

  function getBusinessById(id) {
    const business = findBusinessByIdOrLegacyOwner(id);
    return business ? clone(business) : null;
  }

  function createBusinessForUser(user, input = {}) {
    if (!user?.id) throw new Error("Authentication required");
    return createBusinessRecord({
      ...input,
      ownerUserId: user.id,
      legacyOwnerUserId: input.legacyOwnerUserId || user.id,
      forceNew: true,
    });
  }

  function transferBusinessOwnership(businessId, newOwnerUserId, input = {}) {
    const business = findBusinessByIdOrLegacyOwner(businessId);
    const newOwner = state.users.find((entry) => entry.id === newOwnerUserId);
    if (!business || !newOwner) return null;
    const previousOwnerUserId = business.ownerUserId;
    business.ownerUserId = newOwnerUserId;
    business.name = input.name ? String(input.name).trim() : business.name;
    business.updatedAt = new Date().toISOString();
    if (input.keepPreviousOwnerAsAdmin !== false && previousOwnerUserId && previousOwnerUserId !== newOwnerUserId) {
      const previousOwner = state.users.find((entry) => entry.id === previousOwnerUserId);
      const existing = state.teamMembers.find((member) => (
        member.businessId === business.id
        && member.acceptedUserId === previousOwnerUserId
        && member.status !== "removed"
      ));
      if (previousOwner && !existing) {
        createTeamMember({
          ownerUserId: newOwnerUserId,
          businessId: business.id,
          name: previousOwner.name || previousOwner.email,
          email: previousOwner.email,
          role: "admin",
          status: "active",
          invitedByUserId: newOwnerUserId,
          acceptedUserId: previousOwnerUserId,
        });
      }
    }
    persist();
    return clone(business);
  }

  function getBusinessWorkspaceAccess(user, ownerUserId = null, businessId = null) {
    if (!user?.id) return null;
    const business = businessId
      ? findBusinessByIdOrLegacyOwner(businessId)
      : (findBusinessByIdOrLegacyOwner(ownerUserId) || ensureBusinessForOwner(ownerUserId || user.id));
    const targetOwnerUserId = business?.ownerUserId || ownerUserId || user.id;
    if (user.role === "admin" || targetOwnerUserId === user.id) {
      return {
        ownerUserId: targetOwnerUserId,
        businessId: business?.id || null,
        legacyOwnerUserId: business?.legacyOwnerUserId || targetOwnerUserId,
        role: user.role === "admin" && targetOwnerUserId !== user.id ? "admin" : "owner",
        source: targetOwnerUserId === user.id ? "owned" : "admin",
        permissions: getTeamRolePermissions("owner"),
      };
    }
    const email = canonicalEmail(user.canonicalEmail || user.email);
    const member = state.teamMembers.find((entry) => (
      (business?.id ? entry.businessId === business.id : entry.ownerUserId === targetOwnerUserId)
      && isEmailLinkedTeamMember(entry)
      && (
        entry.acceptedUserId === user.id
        || canonicalEmail(entry.canonicalEmail || entry.email) === email
      )
    ));
    if (!member) return null;
    return {
      ownerUserId: member.ownerUserId,
      businessId: member.businessId || business?.id || null,
      legacyOwnerUserId: business?.legacyOwnerUserId || member.ownerUserId,
      companyId: member.companyId || null,
      memberId: member.id,
      role: member.role || "viewer",
      source: "team",
      permissions: getTeamRolePermissions(member.role),
    };
  }

  function listBusinessWorkspacesForUser(user) {
    if (!user?.id) return [];
    const ownedBusinesses = state.businesses.filter((business) => business.ownerUserId === user.id);
    const workspaces = ownedBusinesses.map((business) => ({
      ownerUserId: business.ownerUserId,
      businessId: business.id,
      legacyOwnerUserId: business.legacyOwnerUserId,
      companyId: null,
      role: user.role === "admin" ? "admin" : "owner",
      source: "owned",
      label: business.name || user.name || user.email || "My workspace",
      email: user.email || "",
      permissions: getTeamRolePermissions("owner"),
    }));
    if (!workspaces.length) {
      const business = ensureBusinessForOwner(user.id, { name: user.name || user.email });
      workspaces.push({
        ownerUserId: user.id,
        businessId: business?.id || null,
        legacyOwnerUserId: business?.legacyOwnerUserId || user.id,
        companyId: null,
        role: user.role === "admin" ? "admin" : "owner",
        source: "owned",
        label: user.name || user.email || "My workspace",
        email: user.email || "",
        permissions: getTeamRolePermissions("owner"),
      });
    }
    const email = canonicalEmail(user.canonicalEmail || user.email);
    state.teamMembers
      .filter((member) => (
        isEmailLinkedTeamMember(member)
        && (
          member.acceptedUserId === user.id
          || canonicalEmail(member.canonicalEmail || member.email) === email
        )
      ))
      .forEach((member) => {
        const business = member.businessId ? findBusinessByIdOrLegacyOwner(member.businessId) : findBusinessByIdOrLegacyOwner(member.ownerUserId);
        const owner = state.users.find((entry) => entry.id === (business?.ownerUserId || member.ownerUserId));
        workspaces.push({
          ownerUserId: business?.ownerUserId || member.ownerUserId,
          businessId: business?.id || member.businessId || null,
          legacyOwnerUserId: business?.legacyOwnerUserId || member.ownerUserId,
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
      || canonicalEmail(member.canonicalEmail || member.email) === canonicalEmail(user.canonicalEmail || user.email)
    )));
  }

  function listTeamMembersForWorkspace(ownerUserId) {
    const business = findBusinessByIdOrLegacyOwner(ownerUserId);
    return clone(state.teamMembers.filter((member) => (
      business?.id ? member.businessId === business.id : member.ownerUserId === ownerUserId
    )));
  }

  function sanitizeAuditMetadata(value, depth = 0) {
    if (depth > 4) return "[truncated]";
    if (Array.isArray(value)) return value.slice(0, 20).map((entry) => sanitizeAuditMetadata(entry, depth + 1));
    if (!value || typeof value !== "object") {
      if (typeof value === "string") return value.slice(0, 500);
      return value ?? null;
    }
    return Object.fromEntries(Object.entries(value).slice(0, 50).map(([key, entry]) => {
      if (/^(tokenPrefix|tokenPreview)$/i.test(key)) return [key, sanitizeAuditMetadata(entry, depth + 1)];
      if (/pass|secret|token|webhook|authorization|credential/i.test(key)) return [key, "[redacted]"];
      return [key, sanitizeAuditMetadata(entry, depth + 1)];
    }));
  }

  function normalizeAuditOutcome(outcome) {
    const candidate = String(outcome || "info").trim().toLowerCase();
    return ["success", "failed", "not_configured", "blocked", "queued", "info", "sent"].includes(candidate)
      ? candidate
      : "info";
  }

  function recordBusinessAuditEvent(actorUser, input = {}) {
    const ownerUserId = input.ownerUserId || input.workspaceOwnerUserId || actorUser?.id || null;
    if (!ownerUserId) throw new Error("Business audit owner is required");
    const category = String(input.category || "workspace").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 60) || "workspace";
    const action = String(input.action || "workspace.event").trim().toLowerCase().replace(/[^a-z0-9_.:-]/g, "_").slice(0, 100) || "workspace.event";
    const event = {
      id: nextId("baud", ++state.counters.businessAuditEvent),
      ownerUserId,
      businessId: input.businessId || ensureBusinessForOwner(ownerUserId)?.id || null,
      companyId: input.companyId || null,
      actorUserId: input.actorUserId || actorUser?.id || null,
      actorEmail: String(input.actorEmail || actorUser?.email || "").trim().toLowerCase(),
      actorName: String(input.actorName || actorUser?.name || "").trim(),
      actorRole: String(input.actorRole || actorUser?.role || "").trim(),
      workspaceRole: String(input.workspaceRole || "").trim(),
      category,
      action,
      outcome: normalizeAuditOutcome(input.outcome),
      targetType: String(input.targetType || "").trim().slice(0, 80),
      targetId: String(input.targetId || "").trim().slice(0, 120),
      targetLabel: String(input.targetLabel || "").trim().slice(0, 160),
      message: String(input.message || "").trim().slice(0, 500),
      metadata: sanitizeAuditMetadata(input.metadata || {}),
      createdAt: input.createdAt || new Date().toISOString(),
    };
    state.businessAuditEvents.push(event);
    if (state.businessAuditEvents.length > 10000) {
      state.businessAuditEvents = state.businessAuditEvents.slice(-10000);
    }
    persist();
    return clone(event);
  }

  function listBusinessAuditEventsForWorkspace(ownerUserId, options = {}) {
    const business = findBusinessByIdOrLegacyOwner(options.businessId || ownerUserId);
    const limit = Math.max(1, Math.min(200, Number(options.limit || 50)));
    const category = String(options.category || "").trim().toLowerCase();
    const action = String(options.action || "").trim().toLowerCase();
    const outcome = String(options.outcome || "").trim().toLowerCase();
    const companyId = String(options.companyId || "").trim();
    const actor = String(options.actor || options.actorEmail || "").trim().toLowerCase();
    const dateFrom = options.dateFrom ? new Date(options.dateFrom) : null;
    const dateTo = options.dateTo ? new Date(options.dateTo) : null;
    const fromTime = dateFrom && !Number.isNaN(dateFrom.getTime()) ? dateFrom.getTime() : null;
    const toTime = dateTo && !Number.isNaN(dateTo.getTime()) ? dateTo.getTime() + 86400000 - 1 : null;
    return clone(state.businessAuditEvents
      .filter((event) => business?.id ? event.businessId === business.id || event.ownerUserId === ownerUserId : event.ownerUserId === ownerUserId)
      .filter((event) => !companyId || event.companyId === companyId)
      .filter((event) => !category || event.category === category)
      .filter((event) => !action || event.action === action)
      .filter((event) => !outcome || event.outcome === outcome)
      .filter((event) => !actor || String(event.actorEmail || "").toLowerCase().includes(actor) || String(event.actorName || "").toLowerCase().includes(actor))
      .filter((event) => {
        if (!fromTime && !toTime) return true;
        const eventTime = new Date(event.createdAt || "").getTime();
        if (Number.isNaN(eventTime)) return false;
        return (!fromTime || eventTime >= fromTime) && (!toTime || eventTime <= toTime);
      })
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, limit));
  }

  function createTeamMember(input = {}) {
    const email = canonicalEmail(input.email);
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
      businessId: input.businessId || ensureBusinessForOwner(input.ownerUserId)?.id || null,
      companyId: input.companyId ?? null,
      name: String(input.name || email.split("@")[0]).trim(),
      email,
      canonicalEmail: email,
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
    if (!member.acceptedUserId) {
      const verifiedMatches = state.users.filter((user) => (
        canonicalEmail(user.canonicalEmail || user.email) === email
        && user.emailVerified
      ));
      if (verifiedMatches.length === 1) {
        member.acceptedUserId = verifiedMatches[0].id;
      } else if (verifiedMatches.length > 1) {
        member.identityConflict = "duplicate_verified_email";
      }
    }
    state.teamMembers.push(member);
    recordBusinessAuditEvent(null, {
      ownerUserId: input.ownerUserId ?? null,
      companyId: input.companyId ?? null,
      actorUserId: input.invitedByUserId ?? input.ownerUserId ?? null,
      actorEmail: String(input.inviterEmail || "").trim().toLowerCase(),
      actorName: String(input.inviterName || "").trim(),
      actorRole: String(input.inviterRole || "").trim(),
      category: "team",
      action: "team.sub_user_created",
      outcome: "queued",
      targetType: "team_member",
      targetId: member.id,
      targetLabel: `${member.name} <${member.email}>`,
      message: "Sub-user created and invitation queued for email delivery",
      metadata: {
        email: member.email,
        role: member.role,
        inviteDeliveryStatus: member.inviteDeliveryStatus,
        accessMethod: "verified_email",
      },
    });
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
    recordBusinessAuditEvent(user, {
      ownerUserId: member.ownerUserId ?? user?.id ?? null,
      companyId: member.companyId ?? null,
      actorUserId: user?.id || null,
      actorEmail: user?.email || "",
      actorName: user?.name || "",
      actorRole: user?.role || "",
      category: "team",
      action: "team.member_updated",
      outcome: "success",
      targetType: "team_member",
      targetId: member.id,
      targetLabel: `${member.name} <${member.email}>`,
      message: "Team member record updated",
      metadata: {
        previousRole,
        previousStatus,
        role: member.role,
        status: member.status,
        inviteDeliveryStatus: member.inviteDeliveryStatus || "",
      },
    });
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
      businessId: input.businessId || ensureBusinessForOwner(input.ownerUserId)?.id || null,
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
    recordBusinessAuditEvent(null, {
      ownerUserId: input.ownerUserId ?? null,
      companyId: input.companyId ?? null,
      actorUserId: input.requestedByUserId ?? input.ownerUserId ?? null,
      actorEmail: String(input.requestedByEmail || "").trim().toLowerCase(),
      actorName: String(input.requestedByName || "").trim(),
      actorRole: String(input.requestedByRole || "").trim(),
      category: "approval",
      action: "approval.request_created",
      outcome: "queued",
      targetType: "approval_request",
      targetId: request.id,
      targetLabel: request.documentNumber,
      message: "Approval request created",
      metadata: {
        documentType: request.documentType,
        documentId: request.documentId,
        approverUserId: request.approverUserId,
      },
    });
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
    recordBusinessAuditEvent(user, {
      ownerUserId: request.ownerUserId ?? user?.id ?? null,
      companyId: request.companyId ?? null,
      actorUserId: user?.id || null,
      actorEmail: user?.email || "",
      actorName: user?.name || "",
      actorRole: user?.role || "",
      category: "approval",
      action: "approval.request_decided",
      outcome: request.status === "approved" ? "success" : request.status === "rejected" ? "blocked" : "info",
      targetType: "approval_request",
      targetId: request.id,
      targetLabel: request.documentNumber,
      message: `Approval request ${request.status}`,
      metadata: {
        documentType: request.documentType,
        documentId: request.documentId,
        status: request.status,
        decisionNotes: request.decisionNotes,
      },
    });
    persist();
    return clone(request);
  }

  function recordApprovalNotification(approvalId, input = {}, user = null) {
    const request = state.approvalRequests.find((entry) => entry.id === approvalId);
    if (!request) return null;
    if (user && user.role !== "admin" && request.ownerUserId !== user.id && request.approverUserId !== user.id && request.requestedByUserId !== user.id) return null;
    request.notificationStatus = String(input.status || "not_configured").trim().toLowerCase();
    request.notificationMessage = String(input.message || "").trim().slice(0, 500);
    request.notificationRecipient = String(input.recipient || "").trim().toLowerCase();
    request.notificationAt = new Date().toISOString();
    request.updatedAt = new Date().toISOString();
    request.auditTrail = Array.isArray(request.auditTrail) ? request.auditTrail.slice(-24) : [];
    request.auditTrail.push({
      action: "notification",
      at: request.notificationAt,
      byUserId: user?.id || null,
      status: request.notificationStatus,
      recipient: request.notificationRecipient,
      message: request.notificationMessage,
    });
    recordBusinessAuditEvent(user, {
      ownerUserId: request.ownerUserId ?? user?.id ?? null,
      companyId: request.companyId ?? null,
      actorUserId: user?.id || null,
      actorEmail: user?.email || "",
      actorName: user?.name || "",
      actorRole: user?.role || "",
      category: "smtp",
      action: `smtp.${String(input.action || "approval_notification").trim().toLowerCase().replace(/[^a-z0-9_.:-]/g, "_").slice(0, 100) || "approval_notification"}`,
      outcome: request.notificationStatus || "info",
      targetType: "approval_request",
      targetId: request.id,
      targetLabel: request.documentNumber,
      message: request.notificationMessage || "Approval notification delivery recorded",
      metadata: {
        recipient: request.notificationRecipient,
        status: request.notificationStatus,
      },
    });
    persist();
    return clone(request);
  }

  function safeApiKeyRecord(key, includeSecret = false, oneTimeToken = "") {
    const { token: _token, tokenHash: _tokenHash, ...safeKey } = key || {};
    return {
      ...safeKey,
      token: includeSecret ? oneTimeToken : "",
    };
  }

  function listApiKeysForUser(user) {
    const ownedBusinessIds = new Set(state.businesses.filter((business) => business.ownerUserId === user?.id).map((business) => business.id));
    const keys = (!user || user.role === "admin")
      ? state.apiKeys
      : state.apiKeys.filter((key) => key.ownerUserId === user.id || ownedBusinessIds.has(key.businessId));
    return clone(keys.map((key) => safeApiKeyRecord(key)));
  }

  function findActiveApiKeyByToken(token) {
    const candidate = String(token || "").trim();
    if (!candidate) return null;
    const candidateHash = hashApiKeyToken(candidate);
    const key = state.apiKeys.find((entry) => {
      if (entry.status !== "active" || !entry.tokenHash) return false;
      return secureStringEqual(entry.tokenHash, candidateHash);
    });
    if (!key) return null;
    key.lastUsedAt = new Date().toISOString();
    persist();
    return clone(safeApiKeyRecord(key));
  }

  function createApiKey(input = {}) {
    const token = `eaz_live_${crypto.randomBytes(24).toString("hex")}`;
    const business = input.businessId
      ? findBusinessByIdOrLegacyOwner(input.businessId)
      : ensureBusinessForOwner(input.ownerUserId);
    const key = {
      id: nextId("key", ++state.counters.apiKey),
      ownerUserId: input.ownerUserId ?? null,
      businessId: business?.id || null,
      companyId: input.companyId ?? null,
      label: String(input.label || "Website integration").trim(),
      tokenPrefix: tokenPrefix(token),
      tokenPreview: tokenPreview(token),
      tokenHash: hashApiKeyToken(token),
      tokenHashAlgorithm: API_KEY_HASH_ALGORITHM,
      scopes: Array.isArray(input.scopes) && input.scopes.length
        ? input.scopes.map((scope) => String(scope).trim()).filter(Boolean)
        : ["invoices:write", "po:write", "reports:read"],
      status: "active",
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    };
    state.apiKeys.push(key);
    persist();
    return clone(safeApiKeyRecord(key, true, token));
  }

  function revokeApiKey(apiKeyId, user = null) {
    const key = state.apiKeys.find((entry) => entry.id === apiKeyId);
    if (!key) return null;
    const business = key.businessId ? findBusinessByIdOrLegacyOwner(key.businessId) : null;
    if (user && user.role !== "admin" && key.ownerUserId !== user.id && business?.ownerUserId !== user.id) return null;
    key.status = "revoked";
    key.revokedAt = new Date().toISOString();
    persist();
    return clone(safeApiKeyRecord(key));
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
    Object.assign(invoice, calculatePaymentState(
      invoice,
      effectiveInvoicePayments(invoice.id),
    ));
    return invoice;
  }

  function refreshPurchaseOrderPaymentStatus(purchaseOrder) {
    Object.assign(purchaseOrder, calculatePaymentState(
      purchaseOrder,
      state.payments.filter((payment) => payment.purchaseOrderId === purchaseOrder.id),
    ));
    return purchaseOrder;
  }

  function recordInvoicePayment(invoiceId, input = {}) {
    const invoice = state.invoices.find((entry) => entry.id === invoiceId);
    if (!invoice) return null;
    assertInvoiceCanReceivePayment(invoice);
    if (input.businessId && invoice.businessId && input.businessId !== invoice.businessId) {
      throw new Error("Payment business does not match invoice business.");
    }
    const idempotencyKey = paymentIdempotencyKey(input);
    const existingPayment = idempotencyKey ? state.payments.find((payment) => (
      payment.invoiceId === invoiceId
      && payment.idempotencyKey === idempotencyKey
    )) : null;
    if (existingPayment) {
      refreshInvoicePaymentStatus(invoice);
      return clone({ invoice, payment: existingPayment, idempotentReplay: true });
    }
    const amount = validatePaymentApplication(
      invoice,
      {
        ...input,
        invalidAmountMessage: "Enter a valid received amount.",
        overpaymentMessage: "Payment amount cannot be more than the pending invoice balance.",
      },
      effectiveInvoicePayments(invoice.id),
    );
    const payment = {
      id: nextId("pay", ++state.counters.payment),
      ownerUserId: invoice.ownerUserId,
      businessId: invoice.businessId || ensureBusinessForOwner(invoice.ownerUserId)?.id || null,
      invoiceId,
      idempotencyKey,
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
    const postingBusiness = invoice.businessId ? findBusinessByIdOrLegacyOwner(invoice.businessId) : null;
    if (postingBusiness) postPaymentCaptured(state, payment, invoice, postingBusiness);
    persist();
    return clone({ invoice, payment });
  }

  function recordPurchaseOrderPayment(purchaseOrderId, input = {}) {
    const purchaseOrder = state.purchaseOrders.find((entry) => entry.id === purchaseOrderId);
    if (!purchaseOrder) return null;
    const status = String(purchaseOrder.status || "").toLowerCase();
    if (status === "draft") throw new Error("Create this PO/WO before recording payment.");
    if (status === "deleted") throw new Error("Deleted PO/WO records cannot receive payment updates.");
    if (input.businessId && purchaseOrder.businessId && input.businessId !== purchaseOrder.businessId) {
      throw new Error("Payment business does not match purchase/work order business.");
    }
    const idempotencyKey = paymentIdempotencyKey(input);
    const existingPayment = idempotencyKey ? state.payments.find((payment) => (
      payment.purchaseOrderId === purchaseOrderId
      && payment.idempotencyKey === idempotencyKey
    )) : null;
    if (existingPayment) {
      refreshPurchaseOrderPaymentStatus(purchaseOrder);
      return clone({ purchaseOrder, payment: existingPayment, idempotentReplay: true });
    }
    refreshPurchaseOrderPaymentStatus(purchaseOrder);
    const amount = validatePaymentApplication(
      purchaseOrder,
      {
        ...input,
        invalidAmountMessage: "Enter a valid paid amount.",
        overpaymentMessage: "Payment amount cannot be more than the pending PO/WO balance.",
      },
      state.payments.filter((payment) => payment.purchaseOrderId === purchaseOrder.id),
    );
    const payment = {
      id: nextId("pay", ++state.counters.payment),
      ownerUserId: purchaseOrder.ownerUserId,
      businessId: purchaseOrder.businessId || ensureBusinessForOwner(purchaseOrder.ownerUserId)?.id || null,
      purchaseOrderId,
      idempotencyKey,
      amount,
      currency: input.currency?.trim() || purchaseOrder.currency || "INR",
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
    refreshPurchaseOrderPaymentStatus(purchaseOrder);
    persist();
    return clone({ purchaseOrder, payment });
  }

  function recordVendorBillPayment(vendorBillId, input = {}) {
    const vendorBill = state.vendorBills.find((entry) => entry.id === vendorBillId);
    if (!vendorBill) return null;
    const status = normalizeRecordStatus(vendorBill.status, "draft");
    if (status === "draft") throw new Error("Post this vendor bill before recording payment.");
    if (status === "deleted" || status === "cancelled" || status === "void") throw new Error("Deleted/cancelled vendor bills cannot receive payments.");
    if (input.businessId && vendorBill.businessId && input.businessId !== vendorBill.businessId) {
      throw new Error("Payment business does not match vendor bill business.");
    }
    const idempotencyKey = paymentIdempotencyKey(input);
    const existingPayment = idempotencyKey ? state.payments.find((payment) => (
      payment.vendorBillId === vendorBillId
      && payment.idempotencyKey === idempotencyKey
    )) : null;
    if (existingPayment) {
      refreshVendorBillPaymentStatus(vendorBill);
      return clone({ vendorBill, payment: existingPayment, idempotentReplay: true });
    }
    refreshVendorBillPaymentStatus(vendorBill);
    const amount = validatePaymentApplication(
      vendorBill,
      {
        ...input,
        invalidAmountMessage: "Enter a valid vendor payment amount.",
        overpaymentMessage: "Payment amount cannot be more than the pending vendor bill balance.",
      },
      effectiveVendorBillPayments(vendorBill.id),
    );
    const payment = {
      id: nextId("pay", ++state.counters.payment),
      ownerUserId: vendorBill.ownerUserId,
      businessId: vendorBill.businessId,
      vendorBillId,
      vendorId: vendorBill.vendorId || null,
      idempotencyKey,
      amount,
      currency: input.currency?.trim() || vendorBill.currency || "INR",
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
    refreshVendorBillPaymentStatus(vendorBill);
    const business = findBusinessByIdOrLegacyOwner(vendorBill.businessId);
    if (business) postVendorPaymentCaptured(state, payment, vendorBill, business);
    persist();
    return clone({ vendorBill, payment });
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

  function fromMinor(value) {
    return Math.round(toNumber(value)) / 100;
  }

  function postedCustomerPaymentReversalsForPayment(paymentId) {
    return state.paymentReversals.filter((reversal) => reversal.originalPaymentId === paymentId && normalizeRecordStatus(reversal.status, "posted") === "posted");
  }

  function postedVendorPaymentReversalsForPayment(paymentId) {
    return state.vendorPaymentReversals.filter((reversal) => reversal.originalPaymentId === paymentId && normalizeRecordStatus(reversal.status, "posted") === "posted");
  }

  function reversedMinorForPayment(paymentId, direction) {
    const collection = direction === "vendor" ? postedVendorPaymentReversalsForPayment(paymentId) : postedCustomerPaymentReversalsForPayment(paymentId);
    return collection.reduce((sum, reversal) => sum + Math.round(toNumber(reversal.amount) * 100), 0);
  }

  function effectiveInvoicePayments(invoiceId) {
    return state.payments
      .filter((payment) => payment.invoiceId === invoiceId)
      .map((payment) => ({
        ...payment,
        amount: fromMinor(Math.max(0, Math.round(toNumber(payment.amount) * 100) - reversedMinorForPayment(payment.id, "customer"))),
      }));
  }

  function effectiveVendorBillPayments(vendorBillId) {
    return state.payments
      .filter((payment) => payment.vendorBillId === vendorBillId)
      .map((payment) => ({
        ...payment,
        amount: fromMinor(Math.max(0, Math.round(toNumber(payment.amount) * 100) - reversedMinorForPayment(payment.id, "vendor"))),
      }));
  }

  function refreshPaymentReversalState(payment, direction) {
    const amountMinor = Math.round(toNumber(payment.amount) * 100);
    const reversedMinor = Math.min(amountMinor, reversedMinorForPayment(payment.id, direction));
    payment.reversedAmount = fromMinor(reversedMinor);
    payment.effectiveAmount = fromMinor(Math.max(0, amountMinor - reversedMinor));
    payment.economicStatus = reversedMinor <= 0 ? "captured" : reversedMinor >= amountMinor ? "fully_reversed" : "partially_reversed";
    return payment;
  }

  function postedCustomerRefundsForCreditNote(creditNoteId) {
    return state.customerRefunds.filter((refund) => refund.sourceCreditNoteId === creditNoteId && normalizeRecordStatus(refund.status, "processed") === "processed");
  }

  function postedVendorRefundsForVendorCredit(vendorCreditId) {
    return state.vendorRefunds.filter((refund) => refund.sourceVendorCreditId === vendorCreditId && normalizeRecordStatus(refund.status, "received") === "received");
  }

  function customerRefundMinorForInvoice(invoiceId, excludeRefundId = "") {
    const creditNoteIds = new Set(state.creditNotes.filter((note) => note.sourceInvoiceId === invoiceId).map((note) => note.id));
    return state.customerRefunds
      .filter((refund) => refund.id !== excludeRefundId && creditNoteIds.has(refund.sourceCreditNoteId) && normalizeRecordStatus(refund.status, "processed") === "processed")
      .reduce((sum, refund) => sum + Math.round(toNumber(refund.amount) * 100), 0);
  }

  function vendorRefundMinorForBill(vendorBillId, excludeRefundId = "") {
    const vendorCreditIds = new Set(state.vendorCredits.filter((credit) => credit.sourceVendorBillId === vendorBillId).map((credit) => credit.id));
    return state.vendorRefunds
      .filter((refund) => refund.id !== excludeRefundId && vendorCreditIds.has(refund.sourceVendorCreditId) && normalizeRecordStatus(refund.status, "received") === "received")
      .reduce((sum, refund) => sum + Math.round(toNumber(refund.amount) * 100), 0);
  }

  function refundableCustomerCreditMinor(creditNote, excludeRefundId = "") {
    const invoice = state.invoices.find((entry) => entry.id === creditNote.sourceInvoiceId);
    if (!invoice) return 0;
    const paidMinor = effectiveInvoicePayments(invoice.id).reduce((sum, payment) => sum + Math.round(toNumber(payment.amount) * 100), 0);
    const creditMinor = postedCreditNotesForInvoice(invoice.id).reduce((sum, note) => sum + Math.round(toNumber(note.total) * 100), 0);
    const refundMinor = customerRefundMinorForInvoice(invoice.id, excludeRefundId);
    const customerCreditMinor = Math.max(0, paidMinor + creditMinor - Math.round(toNumber(invoice.total) * 100) - refundMinor);
    const remainingSourceCreditMinor = Math.max(0, Math.round(toNumber(creditNote.total) * 100) - postedCustomerRefundsForCreditNote(creditNote.id)
      .filter((refund) => refund.id !== excludeRefundId)
      .reduce((sum, refund) => sum + Math.round(toNumber(refund.amount) * 100), 0));
    return Math.min(customerCreditMinor, remainingSourceCreditMinor);
  }

  function recoverableVendorCreditMinor(vendorCredit, excludeRefundId = "") {
    const bill = state.vendorBills.find((entry) => entry.id === vendorCredit.sourceVendorBillId);
    if (!bill) return 0;
    const paidMinor = effectiveVendorBillPayments(bill.id).reduce((sum, payment) => sum + Math.round(toNumber(payment.amount) * 100), 0);
    const creditMinor = postedVendorCreditsForBill(bill.id).reduce((sum, credit) => sum + Math.round(toNumber(credit.total) * 100), 0);
    const refundMinor = vendorRefundMinorForBill(bill.id, excludeRefundId);
    const supplierCreditMinor = Math.max(0, paidMinor + creditMinor - Math.round(toNumber(bill.total) * 100) - refundMinor);
    const remainingSourceCreditMinor = Math.max(0, Math.round(toNumber(vendorCredit.total) * 100) - postedVendorRefundsForVendorCredit(vendorCredit.id)
      .filter((refund) => refund.id !== excludeRefundId)
      .reduce((sum, refund) => sum + Math.round(toNumber(refund.amount) * 100), 0));
    return Math.min(supplierCreditMinor, remainingSourceCreditMinor);
  }

  function createCustomerPaymentReversal(input = {}) {
    const payment = state.payments.find((entry) => entry.id === input.originalPaymentId || entry.id === input.paymentId);
    if (!payment || !payment.invoiceId) throw new Error("Original customer payment is required for reversal.");
    const invoice = state.invoices.find((entry) => entry.id === payment.invoiceId);
    const business = findBusinessByIdOrLegacyOwner(input.businessId || payment.businessId);
    if (!invoice || !business || payment.businessId !== business.id || invoice.businessId !== business.id) throw new Error("Payment reversal business does not match source payment.");
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    if (idempotencyKey) {
      const existing = state.paymentReversals.find((reversal) => reversal.businessId === business.id && reversal.idempotencyKey === idempotencyKey);
      if (existing) return clone(existing);
    }
    const remainingMinor = Math.round(toNumber(payment.amount) * 100) - reversedMinorForPayment(payment.id, "customer");
    const amountMinor = input.amount === undefined ? remainingMinor : Math.round(toNumber(input.amount) * 100);
    if (amountMinor <= 0) throw new Error("Enter a valid payment reversal amount.");
    if (amountMinor > remainingMinor) throw new Error("Payment reversal amount cannot exceed unreversed payment amount.");
    const { journal, event } = sourceJournalAndEvent("payment", payment.id);
    const reversal = {
      id: nextId("prev", ++state.counters.paymentReversal),
      ownerUserId: payment.ownerUserId,
      businessId: business.id,
      originalPaymentId: payment.id,
      invoiceId: invoice.id,
      paymentDirection: "customer_payment",
      amount: fromMinor(amountMinor),
      currency: input.currency?.trim() || payment.currency || invoice.currency || "INR",
      method: input.method?.trim() || input.mode?.trim() || payment.mode || "manual",
      reference: input.reference?.trim() || "",
      providerReference: input.providerReference?.trim() || input.gatewayRefundId?.trim() || "",
      reason: String(input.reason || "payment_entered_in_error").trim(),
      status: normalizeRecordStatus(input.status, "posted"),
      reversalDate: input.reversalDate || new Date().toISOString().slice(0, 10),
      idempotencyKey,
      createdByUserId: input.createdByUserId || input.actorUserId || "",
      reversesFinancialEventId: event?.id || "",
      reversesJournalId: journal?.id || "",
      financialEventId: "",
      journalId: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.paymentReversals.push(reversal);
    if (reversal.status === "posted") {
      const result = postCustomerPaymentReversed(state, reversal, payment, invoice, business, { lineage: { journal, event } });
      reversal.financialEventId = result.event?.id || "";
      reversal.journalId = result.journal?.id || result.event?.journalId || "";
    }
    refreshPaymentReversalState(payment, "customer");
    refreshInvoicePaymentStatus(invoice);
    persist();
    return clone(reversal);
  }

  function createVendorPaymentReversal(input = {}) {
    const payment = state.payments.find((entry) => entry.id === input.originalPaymentId || entry.id === input.paymentId);
    if (!payment || !payment.vendorBillId) throw new Error("Original vendor payment is required for reversal.");
    const bill = state.vendorBills.find((entry) => entry.id === payment.vendorBillId);
    const business = findBusinessByIdOrLegacyOwner(input.businessId || payment.businessId);
    if (!bill || !business || payment.businessId !== business.id || bill.businessId !== business.id) throw new Error("Vendor payment reversal business does not match source payment.");
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    if (idempotencyKey) {
      const existing = state.vendorPaymentReversals.find((reversal) => reversal.businessId === business.id && reversal.idempotencyKey === idempotencyKey);
      if (existing) return clone(existing);
    }
    const remainingMinor = Math.round(toNumber(payment.amount) * 100) - reversedMinorForPayment(payment.id, "vendor");
    const amountMinor = input.amount === undefined ? remainingMinor : Math.round(toNumber(input.amount) * 100);
    if (amountMinor <= 0) throw new Error("Enter a valid vendor payment reversal amount.");
    if (amountMinor > remainingMinor) throw new Error("Vendor payment reversal amount cannot exceed unreversed payment amount.");
    const { journal, event } = sourceJournalAndEvent("vendor_payment", payment.id);
    const reversal = {
      id: nextId("vprev", ++state.counters.vendorPaymentReversal),
      ownerUserId: payment.ownerUserId,
      businessId: business.id,
      originalPaymentId: payment.id,
      vendorBillId: bill.id,
      vendorId: bill.vendorId || null,
      paymentDirection: "vendor_payment",
      amount: fromMinor(amountMinor),
      currency: input.currency?.trim() || payment.currency || bill.currency || "INR",
      method: input.method?.trim() || input.mode?.trim() || payment.mode || "manual",
      reference: input.reference?.trim() || "",
      providerReference: input.providerReference?.trim() || "",
      reason: String(input.reason || "payment_entered_in_error").trim(),
      status: normalizeRecordStatus(input.status, "posted"),
      reversalDate: input.reversalDate || new Date().toISOString().slice(0, 10),
      idempotencyKey,
      createdByUserId: input.createdByUserId || input.actorUserId || "",
      reversesFinancialEventId: event?.id || "",
      reversesJournalId: journal?.id || "",
      financialEventId: "",
      journalId: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.vendorPaymentReversals.push(reversal);
    if (reversal.status === "posted") {
      const result = postVendorPaymentReversed(state, reversal, payment, bill, business, { lineage: { journal, event } });
      reversal.financialEventId = result.event?.id || "";
      reversal.journalId = result.journal?.id || result.event?.journalId || "";
    }
    refreshPaymentReversalState(payment, "vendor");
    refreshVendorBillPaymentStatus(bill);
    persist();
    return clone(reversal);
  }

  function createCustomerRefund(input = {}) {
    const creditNote = state.creditNotes.find((entry) => entry.id === input.sourceCreditNoteId || entry.id === input.creditNoteId);
    if (!creditNote || normalizeRecordStatus(creditNote.status, "draft") === "draft") throw new Error("Posted source credit note is required for customer refund.");
    const invoice = state.invoices.find((entry) => entry.id === creditNote.sourceInvoiceId);
    const customer = state.customers.find((entry) => entry.id === (input.customerId || creditNote.customerId));
    const business = findBusinessByIdOrLegacyOwner(input.businessId || creditNote.businessId);
    if (!invoice || !business || creditNote.businessId !== business.id || invoice.businessId !== business.id) throw new Error("Customer refund business does not match source credit note.");
    if (customer && customer.businessId && customer.businessId !== business.id) throw new Error("Customer does not belong to this business.");
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    if (idempotencyKey) {
      const existing = state.customerRefunds.find((refund) => refund.businessId === business.id && refund.idempotencyKey === idempotencyKey);
      if (existing) return clone(existing);
    }
    const amountMinor = Math.round(toNumber(input.amount) * 100);
    if (amountMinor <= 0) throw new Error("Enter a valid customer refund amount.");
    const availableMinor = refundableCustomerCreditMinor(creditNote);
    if (amountMinor > availableMinor) throw new Error("Customer refund amount cannot exceed available customer credit balance.");
    const { journal, event } = sourceJournalAndEvent("sales_credit_note", creditNote.id);
    const refund = {
      id: nextId("cref", ++state.counters.customerRefund),
      ownerUserId: creditNote.ownerUserId,
      businessId: business.id,
      customerId: customer?.id || creditNote.customerId || null,
      sourceCreditNoteId: creditNote.id,
      sourceInvoiceId: invoice.id,
      sourcePaymentId: input.sourcePaymentId || "",
      amount: fromMinor(amountMinor),
      currency: input.currency?.trim() || creditNote.currency || invoice.currency || "INR",
      method: input.method?.trim() || input.mode?.trim() || "manual",
      reference: input.reference?.trim() || "",
      providerReference: input.providerReference?.trim() || input.gatewayRefundId?.trim() || "",
      reason: String(input.reason || "customer_credit_refund").trim(),
      status: normalizeRecordStatus(input.status, "processed"),
      refundDate: input.refundDate || new Date().toISOString().slice(0, 10),
      idempotencyKey,
      createdByUserId: input.createdByUserId || input.actorUserId || "",
      financialEventId: "",
      journalId: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.customerRefunds.push(refund);
    if (refund.status === "processed") {
      const result = postCustomerRefundProcessed(state, refund, creditNote, business, { lineage: { journal, event } });
      refund.financialEventId = result.event?.id || "";
      refund.journalId = result.journal?.id || result.event?.journalId || "";
    }
    persist();
    return clone(refund);
  }

  function createVendorRefund(input = {}) {
    const vendorCredit = state.vendorCredits.find((entry) => entry.id === input.sourceVendorCreditId || entry.id === input.vendorCreditId);
    if (!vendorCredit || normalizeRecordStatus(vendorCredit.status, "draft") === "draft") throw new Error("Posted source vendor credit is required for vendor refund.");
    const bill = state.vendorBills.find((entry) => entry.id === vendorCredit.sourceVendorBillId);
    const vendor = state.vendors.find((entry) => entry.id === (input.vendorId || vendorCredit.vendorId));
    const business = findBusinessByIdOrLegacyOwner(input.businessId || vendorCredit.businessId);
    if (!bill || !business || vendorCredit.businessId !== business.id || bill.businessId !== business.id) throw new Error("Vendor refund business does not match source vendor credit.");
    if (vendor && vendor.businessId && vendor.businessId !== business.id) throw new Error("Vendor does not belong to this business.");
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    if (idempotencyKey) {
      const existing = state.vendorRefunds.find((refund) => refund.businessId === business.id && refund.idempotencyKey === idempotencyKey);
      if (existing) return clone(existing);
    }
    const amountMinor = Math.round(toNumber(input.amount) * 100);
    if (amountMinor <= 0) throw new Error("Enter a valid vendor refund amount.");
    const availableMinor = recoverableVendorCreditMinor(vendorCredit);
    if (amountMinor > availableMinor) throw new Error("Vendor refund amount cannot exceed available supplier credit balance.");
    const { journal, event } = sourceJournalAndEvent("vendor_credit", vendorCredit.id);
    const refund = {
      id: nextId("vref", ++state.counters.vendorRefund),
      ownerUserId: vendorCredit.ownerUserId,
      businessId: business.id,
      vendorId: vendor?.id || vendorCredit.vendorId || null,
      sourceVendorCreditId: vendorCredit.id,
      sourceVendorBillId: bill.id,
      sourceVendorPaymentId: input.sourceVendorPaymentId || "",
      amount: fromMinor(amountMinor),
      currency: input.currency?.trim() || vendorCredit.currency || bill.currency || "INR",
      method: input.method?.trim() || input.mode?.trim() || "manual",
      reference: input.reference?.trim() || "",
      providerReference: input.providerReference?.trim() || "",
      reason: String(input.reason || "vendor_credit_recovery").trim(),
      status: normalizeRecordStatus(input.status, "received"),
      receivedDate: input.receivedDate || input.refundDate || new Date().toISOString().slice(0, 10),
      idempotencyKey,
      createdByUserId: input.createdByUserId || input.actorUserId || "",
      financialEventId: "",
      journalId: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.vendorRefunds.push(refund);
    if (refund.status === "received") {
      const result = postVendorRefundReceived(state, refund, vendorCredit, business, { lineage: { journal, event } });
      refund.financialEventId = result.event?.id || "";
      refund.journalId = result.journal?.id || result.event?.journalId || "";
    }
    persist();
    return clone(refund);
  }

  function publicTaxRegistration(registration = {}) {
    return clone({
      ...registration,
      gstin: undefined,
      pan: undefined,
      tan: undefined,
      maskedGstin: registration.maskedGstin || maskTaxIdentifier(registration.gstin),
      maskedPan: registration.maskedPan || maskTaxIdentifier(registration.pan),
      maskedTan: registration.maskedTan || maskTaxIdentifier(registration.tan),
    });
  }

  function upsertBusinessTaxProfile(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for tax profile.");
    const profile = normalizeIndiaTaxProfile(input, business.taxProfile || {});
    business.taxProfile = { ...(business.taxProfile || {}), ...profile, updatedByUserId: input.actorUserId || input.updatedByUserId || "" };
    business.updatedAt = new Date().toISOString();
    const existingRegistration = state.taxRegistrations.find((entry) => entry.businessId === business.id && entry.taxType === "GST" && entry.primary);
    if (profile.gstRegistered && profile.gstin) {
      const gstinValidation = validateGstin(profile.gstin);
      const registrationPatch = {
        gstin: gstinValidation.value,
        maskedGstin: gstinValidation.masked,
        gstinStructurallyValid: gstinValidation.structurallyValid,
        externallyVerified: false,
        stateCode: profile.stateCode || gstinValidation.stateCode,
        registrationState: profile.registrationState,
        registrationType: profile.gstScheme || "regular",
        status: "active",
        updatedAt: new Date().toISOString(),
      };
      if (existingRegistration) Object.assign(existingRegistration, registrationPatch);
      else state.taxRegistrations.push({
        id: nextId("taxreg", ++state.counters.taxRegistration),
        businessId: business.id,
        ownerUserId: business.ownerUserId,
        taxType: "GST",
        primary: true,
        createdAt: new Date().toISOString(),
        ...registrationPatch,
      });
    }
    persist();
    return publicTaxProfile(business.taxProfile);
  }

  function getBusinessTaxProfile(user, businessId = "") {
    const business = findBusinessByIdOrLegacyOwner(businessId);
    if (!business) return null;
    if (user && user.role !== "admin" && business.ownerUserId !== user.id) return null;
    return publicTaxProfile(business.taxProfile || {});
  }

  function createTaxRegistration(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for tax registration.");
    const gstinValidation = validateGstin(input.gstin || input.gstNumber || "");
    const registration = {
      id: nextId("taxreg", ++state.counters.taxRegistration),
      businessId: business.id,
      ownerUserId: business.ownerUserId,
      taxType: String(input.taxType || "GST").trim().toUpperCase(),
      registrationType: String(input.registrationType || input.gstScheme || "regular").trim(),
      gstin: gstinValidation.value,
      maskedGstin: gstinValidation.masked,
      gstinStructurallyValid: gstinValidation.value ? gstinValidation.structurallyValid : false,
      externallyVerified: false,
      stateCode: String(input.stateCode || gstinValidation.stateCode || "").trim(),
      registrationState: String(input.registrationState || input.state || "").trim(),
      status: String(input.status || "active").trim(),
      primary: Boolean(input.primary),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.taxRegistrations.push(registration);
    persist();
    return publicTaxRegistration(registration);
  }

  function listTaxRegistrationsForUser(user, businessId = "") {
    return state.taxRegistrations
      .filter((entry) => (!businessId || entry.businessId === businessId) && (!user || user.role === "admin" || entry.ownerUserId === user.id))
      .map(publicTaxRegistration);
  }

  function createComplianceRuleSet(input = {}) {
    const rule = {
      id: nextId("crule", ++state.counters.complianceRuleSet),
      jurisdiction: String(input.jurisdiction || "IN").trim().toUpperCase(),
      taxType: String(input.taxType || "").trim().toUpperCase(),
      ruleKey: String(input.ruleKey || "").trim(),
      version: String(input.version || "1").trim(),
      effectiveFrom: String(input.effectiveFrom || "2026-04-01").slice(0, 10),
      effectiveTo: input.effectiveTo ? String(input.effectiveTo).slice(0, 10) : "",
      config: clone(input.config || {}),
      authority: String(input.authority || "").trim(),
      reference: String(input.reference || "").trim(),
      sourceType: String(input.sourceType || "configured").trim(),
      lastVerifiedDate: input.lastVerifiedDate ? String(input.lastVerifiedDate).slice(0, 10) : "",
      status: String(input.status || "active").trim(),
      productionReady: Boolean(input.productionReady),
      notes: String(input.notes || "").trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (!rule.taxType || !rule.ruleKey) throw new Error("Compliance rule tax type and key are required.");
    state.complianceRuleSets.push(rule);
    persist();
    return clone(rule);
  }

  function listComplianceRuleSets(input = {}) {
    return clone(state.complianceRuleSets.filter((rule) => (
      (!input.jurisdiction || rule.jurisdiction === input.jurisdiction)
      && (!input.taxType || rule.taxType === input.taxType)
      && (!input.ruleKey || rule.ruleKey === input.ruleKey)
    )));
  }

  function selectedComplianceRuleSet(input = {}) {
    return clone(selectComplianceRuleSet(state.complianceRuleSets, input));
  }

  function buildComplianceSnapshot(sourceType, transaction, input = {}) {
    if (!transaction?.businessId) return null;
    const business = findBusinessByIdOrLegacyOwner(transaction.businessId);
    if (!business) return null;
    const existing = state.transactionComplianceSnapshots.find((entry) => entry.sourceType === sourceType && entry.sourceId === transaction.id && entry.taxType === "GST");
    if (existing) return existing;
    const party = input.party || (input.direction === "input"
      ? state.vendors.find((entry) => entry.id === transaction.vendorId)
      : state.customers.find((entry) => entry.id === transaction.customerId)) || {};
    const registration = state.taxRegistrations.find((entry) => entry.businessId === business.id && entry.taxType === "GST" && entry.status === "active");
    const classification = classifyGstTransaction(state, business, transaction, {
      ...input,
      sourceType,
      party,
      registrationId: registration?.id || "",
    });
    const snapshot = {
      id: nextId("csnap", ++state.counters.transactionComplianceSnapshot),
      businessId: business.id,
      ownerUserId: business.ownerUserId,
      taxType: "GST",
      direction: input.direction || "output",
      sourceType,
      sourceId: transaction.id,
      documentNumber: classification.documentNumber,
      documentDate: classification.documentDate,
      registrationId: classification.registrationId,
      ruleSetId: classification.ruleSetId,
      ruleVersion: classification.ruleVersion,
      ruleKey: classification.ruleKey,
      classificationStatus: classification.classificationStatus,
      issues: classification.issues,
      supplierState: classification.supplierState,
      recipientState: classification.recipientState,
      expectedGstMode: classification.expectedGstMode,
      suppliedGstMode: classification.suppliedGstMode,
      placeOfSupply: classification.placeOfSupply,
      b2bB2c: classification.b2bB2c,
      counterpartyGstinMasked: classification.counterpartyGstinMasked,
      counterpartyGstinStructurallyValid: classification.counterpartyGstinStructurallyValid,
      supplyType: classification.supplyType,
      reverseChargeApplicable: classification.reverseChargeApplicable,
      itcStatus: classification.itcStatus,
      hsnSacStatus: classification.hsnSacStatus,
      taxableValue: classification.tax.taxableValue,
      cgst: classification.tax.cgst,
      sgst: classification.tax.sgst,
      igst: classification.tax.igst,
      taxAmount: classification.tax.taxAmount,
      grossValue: classification.tax.grossValue,
      sourceSemantics: "classification_snapshot_not_filing",
      createdAt: new Date().toISOString(),
    };
    state.transactionComplianceSnapshots.push(snapshot);
    transaction.complianceSnapshotId = snapshot.id;
    transaction.gstComplianceStatus = snapshot.classificationStatus;
    transaction.gstRuleSetId = snapshot.ruleSetId;
    transaction.gstRuleVersion = snapshot.ruleVersion;
    return snapshot;
  }

  function createTdsTransactionForVendorBill(bill, vendor, tds) {
    const existing = state.tdsTransactions.find((entry) => entry.sourceType === "vendor_bill" && entry.sourceId === bill.id);
    if (existing) return existing;
    const transaction = {
      id: nextId("tds", ++state.counters.tdsTransaction),
      businessId: bill.businessId,
      ownerUserId: bill.ownerUserId,
      vendorId: bill.vendorId || "",
      sourceType: "vendor_bill",
      sourceId: bill.id,
      vendorBillNumber: bill.vendorBillNumber || bill.internalBillNumber || "",
      transactionDate: bill.billDate || bill.createdAt?.slice(0, 10),
      deductionDate: tds.deductionDate || bill.billDate || bill.createdAt?.slice(0, 10),
      natureOfPayment: tds.natureOfPayment || bill.tdsNatureOfPayment || bill.expenseCategory || "",
      ruleSetId: tds.ruleSetId || "",
      ruleVersion: tds.ruleVersion || "",
      ruleReference: tds.ruleReference || "",
      sourceMetadata: tds.sourceType || "configured",
      status: tds.status || "needs_review",
      applicability: tds.applicability || "",
      issues: tds.issues || [],
      vendorPanMasked: maskTaxIdentifier(vendor?.panNumber || vendor?.pan || ""),
      grossAmount: complianceMoney(complianceToMinor(tds.grossAmount)),
      amountSubjectToTds: complianceMoney(complianceToMinor(tds.amountSubjectToTds)),
      tdsRate: Number(tds.rate || 0),
      tdsAmount: complianceMoney(complianceToMinor(tds.amount)),
      netVendorPayable: complianceMoney(complianceToMinor(tds.netVendorPayable || bill.total)),
      period: normalizeCompliancePeriod({ date: bill.billDate || new Date().toISOString().slice(0, 10), taxYearStartMonth: 4 }),
      filingStatus: "internal_register_not_filed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.tdsTransactions.push(transaction);
    return transaction;
  }

  function classifyVendorBillTds(bill) {
    const business = findBusinessByIdOrLegacyOwner(bill.businessId);
    const vendor = state.vendors.find((entry) => entry.id === bill.vendorId) || {};
    const tds = evaluateTdsForVendorBill(state, business, bill, vendor);
    bill.tdsSnapshot = clone(tds);
    bill.tdsAmount = complianceMoney(complianceToMinor(tds.amount));
    bill.netVendorPayable = tds.netVendorPayable !== undefined ? complianceMoney(complianceToMinor(tds.netVendorPayable)) : bill.total;
    if (tds.status === "classified" || tds.status === "needs_review") {
      const transaction = createTdsTransactionForVendorBill(bill, vendor, tds);
      bill.tdsTransactionId = transaction.id;
    }
    return tds;
  }

  function getGstSalesRegister(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for GST sales register.");
    return buildGstSalesRegister(state, business, input);
  }

  function getGstPurchaseRegister(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for GST purchase register.");
    return buildGstPurchaseRegister(state, business, input);
  }

  function getComplianceReadiness(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for compliance readiness.");
    return buildComplianceReadiness(state, business, input);
  }

  function getGstComplianceReconciliation(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for GST reconciliation.");
    return buildGstReconciliation(state, business, input);
  }

  function getTdsRegister(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for TDS register.");
    return buildTdsRegister(state, business, input);
  }

  function getTdsReconciliation(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for TDS reconciliation.");
    return buildTdsReconciliation(state, business, input);
  }

  function createComplianceObligation(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for compliance obligation.");
    const period = input.period || normalizeCompliancePeriod({ date: input.periodDate || input.dueDate || new Date().toISOString().slice(0, 10), periodType: input.periodType || "month" });
    const rule = input.ruleSetId
      ? state.complianceRuleSets.find((entry) => entry.id === input.ruleSetId)
      : selectComplianceRuleSet(state.complianceRuleSets, { jurisdiction: "IN", taxType: input.complianceType || input.taxType || "GST", ruleKey: input.ruleKey || "obligation", effectiveDate: period.from });
    const obligation = {
      id: nextId("obl", ++state.counters.complianceObligation),
      businessId: business.id,
      ownerUserId: business.ownerUserId,
      registrationId: input.registrationId || "",
      complianceType: String(input.complianceType || input.taxType || "GST").trim().toUpperCase(),
      obligationType: String(input.obligationType || "return_preparation").trim(),
      periodType: period.periodType,
      periodKey: period.periodKey,
      periodFrom: period.from,
      periodTo: period.to,
      financialYear: period.financialYear,
      dueDate: String(input.dueDate || rule?.config?.dueDate || "").slice(0, 10),
      ruleSetId: rule?.id || input.ruleSetId || "",
      ruleVersion: rule?.version || input.ruleVersion || "",
      status: String(input.status || "upcoming").trim(),
      filingSemantics: "manual_or_preparation_status_not_government_verified",
      externallyVerified: false,
      completionDate: "",
      notes: String(input.notes || "").trim(),
      sourceMetadata: clone(input.sourceMetadata || {}),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.complianceObligations.push(obligation);
    persist();
    return clone(obligation);
  }

  function updateComplianceObligation(id, input = {}) {
    const obligation = state.complianceObligations.find((entry) => entry.id === id);
    if (!obligation) return null;
    if (input.businessId && obligation.businessId !== input.businessId) throw new Error("Compliance obligation not found in this business.");
    ["status", "notes"].forEach((field) => {
      if (input[field] !== undefined) obligation[field] = String(input[field] || "").trim();
    });
    if (input.completionDate !== undefined) obligation.completionDate = String(input.completionDate || "").slice(0, 10);
    if (input.externalFilingReference !== undefined) obligation.externalFilingReference = String(input.externalFilingReference || "").trim();
    obligation.externallyVerified = false;
    obligation.updatedAt = new Date().toISOString();
    persist();
    return clone(obligation);
  }

  function listComplianceObligationsForUser(user, businessId = "") {
    return clone(state.complianceObligations.filter((entry) => (
      (!businessId || entry.businessId === businessId)
      && (!user || user.role === "admin" || entry.ownerUserId === user.id)
    )));
  }

  function publicBankAccount(account = {}) {
    return clone({
      ...account,
      maskedAccountReference: account.maskedAccountReference || maskAccountReference(account.accountReference),
      accountReference: undefined,
    });
  }

  function findBankAccount(id) {
    return state.bankAccounts.find((account) => account.id === id && account.status !== "deleted");
  }

  function createBankLedgerAccount(business, input = {}) {
    const accountType = normalizeBankAccountType(input.accountType);
    const existingCount = state.ledgerAccounts.filter((account) => account.businessId === business.id && ["bank", "cash", "clearing"].includes(String(account.bankAccountType || ""))).length;
    const defaultCode = accountType === "cash" ? `113${existingCount}` : accountType === "clearing" ? "1110" : `112${existingCount}`;
    if (accountType === "clearing") {
      return ensureDefaultAccountingAccounts(state, business, business.ownerUserId).bank_clearing;
    }
    const account = {
      id: nextId("acct", ++state.counters.ledgerAccount),
      businessId: business.id,
      ownerUserId: business.ownerUserId,
      accountCode: String(input.accountCode || defaultCode).trim(),
      accountName: String(input.ledgerAccountName || input.displayName || (accountType === "cash" ? "Cash Account" : "Bank Account")).trim(),
      accountType: "asset",
      normalBalance: "debit",
      bankAccountType: accountType,
      systemAccount: false,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.ledgerAccounts.push(account);
    return account;
  }

  function createBankAccount(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for bank account.");
    ensureDefaultAccountingAccounts(state, business, business.ownerUserId);
    const accountType = normalizeBankAccountType(input.accountType);
    let ledgerAccount = input.ledgerAccountId
      ? state.ledgerAccounts.find((account) => account.id === input.ledgerAccountId)
      : createBankLedgerAccount(business, { ...input, accountType });
    if (!ledgerAccount && input.ledgerAccountCode) {
      ledgerAccount = state.ledgerAccounts.find((account) => account.businessId === business.id && account.accountCode === input.ledgerAccountCode);
    }
    if (!ledgerAccount || ledgerAccount.businessId !== business.id) throw new Error("Ledger account does not belong to this business.");
    const account = {
      id: nextId("bacc", ++state.counters.bankAccount),
      businessId: business.id,
      ownerUserId: business.ownerUserId,
      ledgerAccountId: ledgerAccount.id,
      ledgerAccountCode: ledgerAccount.accountCode,
      accountType,
      displayName: String(input.displayName || ledgerAccount.accountName || "Bank Account").trim(),
      institutionName: String(input.institutionName || "").trim(),
      accountReference: String(input.accountReference || "").trim(),
      maskedAccountReference: maskAccountReference(input.accountReference || input.maskedAccountReference || ""),
      currency: String(input.currency || "INR").trim(),
      openingBalance: moneyFromMinor(toMinor(input.openingBalance)),
      status: String(input.status || "active").trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.bankAccounts.push(account);
    persist();
    return publicBankAccount(account);
  }

  function listBankAccountsForUser(user, businessId = "") {
    if (!user || user.role === "admin") return state.bankAccounts.filter((account) => !businessId || account.businessId === businessId).map(publicBankAccount);
    return state.bankAccounts.filter((account) => account.ownerUserId === user.id && (!businessId || account.businessId === businessId)).map(publicBankAccount);
  }

  function getBankAccount(id, user) {
    const account = findBankAccount(id);
    if (!account) return null;
    if (!user || user.role === "admin" || account.ownerUserId === user.id) return publicBankAccount(account);
    return null;
  }

  function importBankStatementLines(input = {}) {
    const account = findBankAccount(input.bankAccountId);
    const business = findBusinessByIdOrLegacyOwner(input.businessId || account?.businessId);
    if (!account || !business || account.businessId !== business.id) throw new Error("Bank account not found in this business.");
    const linesInput = Array.isArray(input.lines) ? input.lines : [];
    if (!linesInput.length) throw new Error("At least one statement line is required.");
    const batch = {
      id: nextId("bstmt", ++state.counters.bankStatementImportBatch),
      businessId: business.id,
      ownerUserId: business.ownerUserId,
      bankAccountId: account.id,
      sourceType: String(input.sourceType || input.source || "manual").trim(),
      fileName: String(input.fileName || input.filename || "").trim(),
      reference: String(input.reference || "").trim(),
      importedByUserId: input.importedByUserId || input.actorUserId || "",
      status: "imported",
      lineCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      importedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    const imported = [];
    const duplicates = [];
    const errors = [];
    linesInput.forEach((lineInput, index) => {
      try {
        const normalized = normalizeStatementLine(lineInput, {
          businessId: business.id,
          bankAccountId: account.id,
          importBatchId: batch.id,
          currency: account.currency,
          source: batch.sourceType,
        });
        const duplicate = state.bankStatementLines.find((line) => line.businessId === business.id && line.bankAccountId === account.id && line.fingerprint === normalized.fingerprint);
        if (duplicate) {
          duplicates.push({ index, statementLineId: duplicate.id, fingerprint: normalized.fingerprint });
          return;
        }
        const line = {
          id: nextId("bline", ++state.counters.bankStatementLine),
          ...normalized,
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        state.bankStatementLines.push(line);
        imported.push(clone(line));
      } catch (error) {
        errors.push({ index, error: error.message });
      }
    });
    batch.lineCount = imported.length;
    batch.duplicateCount = duplicates.length;
    batch.errorCount = errors.length;
    batch.status = errors.length ? "completed_with_errors" : "imported";
    state.bankStatementImportBatches.push(batch);
    persist();
    return clone({ batch, imported, duplicates, errors });
  }

  function listBankStatementLinesForUser(user, businessId = "", bankAccountId = "") {
    const visibleAccounts = new Set(listBankAccountsForUser(user, businessId).map((account) => account.id));
    return clone(state.bankStatementLines.filter((line) => visibleAccounts.has(line.bankAccountId) && (!bankAccountId || line.bankAccountId === bankAccountId)));
  }

  function suggestBankStatementMatches(statementLineId, input = {}) {
    const line = state.bankStatementLines.find((entry) => entry.id === statementLineId);
    if (!line) return null;
    const account = findBankAccount(line.bankAccountId);
    if (!account || (input.businessId && account.businessId !== input.businessId)) throw new Error("Bank statement line not found in this business.");
    return clone({
      statementLineId,
      ...suggestMatchesForLine(state, account, line, input),
    });
  }

  function refreshStatementLineMatchState(line) {
    const lineMinor = Math.max(toMinor(line.debit), toMinor(line.credit));
    const matchedMinor = state.bankReconciliationMatches
      .filter((match) => match.statementLineId === line.id && match.status === "matched")
      .reduce((sum, match) => sum + toMinor(match.matchedAmount), 0);
    line.matchedAmount = moneyFromMinor(matchedMinor);
    line.unmatchedAmount = moneyFromMinor(Math.max(0, lineMinor - matchedMinor));
    line.reconciliationStatus = matchedMinor <= 0 ? "unmatched" : matchedMinor >= lineMinor ? "matched" : "partially_matched";
    line.updatedAt = new Date().toISOString();
  }

  function confirmBankReconciliationMatch(input = {}) {
    const line = state.bankStatementLines.find((entry) => entry.id === input.statementLineId);
    if (!line) throw new Error("Bank statement line is required for reconciliation match.");
    const account = findBankAccount(input.bankAccountId || line.bankAccountId);
    if (!account || line.businessId !== account.businessId || line.bankAccountId !== account.id) throw new Error("Bank account does not match statement line.");
    if (input.businessId && input.businessId !== account.businessId) throw new Error("Bank reconciliation business does not match.");
    if (state.bankReconciliationMatches.some((match) => match.statementLineId === line.id && match.status === "matched")) {
      throw new Error("Statement line is already matched.");
    }
    const suggestions = suggestMatchesForLine(state, account, line, input);
    const candidate = suggestions.candidates.find((entry) => (
      entry.sourceType === input.sourceType
      && entry.sourceId === input.sourceId
      && (!input.journalId || entry.journalId === input.journalId)
    ));
    if (!candidate) throw new Error("Statement line and internal transaction are not compatible for reconciliation.");
    const amountMinor = input.matchedAmount === undefined ? Math.max(toMinor(line.debit), toMinor(line.credit)) : toMinor(input.matchedAmount);
    if (amountMinor <= 0 || amountMinor !== candidate.amountMinor) throw new Error("Only exact one-to-one reconciliation matches are supported in this phase.");
    if (state.bankReconciliationMatches.some((match) => match.sourceType === candidate.sourceType && match.sourceId === candidate.sourceId && match.status === "matched")) {
      throw new Error("Internal transaction is already matched.");
    }
    const match = {
      id: nextId("bmatch", ++state.counters.bankReconciliationMatch),
      businessId: account.businessId,
      ownerUserId: account.ownerUserId,
      bankAccountId: account.id,
      statementLineId: line.id,
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      journalId: candidate.journalId,
      journalLineId: candidate.journalLineId,
      matchedAmount: moneyFromMinor(amountMinor),
      matchMethod: input.matchMethod || "manual",
      confidence: candidate.confidence,
      reason: input.reason || candidate.confidence,
      status: "matched",
      matchedByUserId: input.matchedByUserId || input.actorUserId || "",
      matchedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.bankReconciliationMatches.push(match);
    refreshStatementLineMatchState(line);
    persist();
    return clone(match);
  }

  function unmatchBankReconciliation(matchId, input = {}) {
    const match = state.bankReconciliationMatches.find((entry) => entry.id === matchId);
    if (!match) return null;
    if (input.businessId && match.businessId !== input.businessId) throw new Error("Bank reconciliation match not found in this business.");
    match.status = "unmatched";
    match.unmatchedByUserId = input.unmatchedByUserId || input.actorUserId || "";
    match.unmatchedAt = new Date().toISOString();
    match.updatedAt = new Date().toISOString();
    const line = state.bankStatementLines.find((entry) => entry.id === match.statementLineId);
    if (line) refreshStatementLineMatchState(line);
    persist();
    return clone(match);
  }

  function getBankReconciliationSummary(input = {}) {
    const account = findBankAccount(input.bankAccountId);
    if (!account || (input.businessId && account.businessId !== input.businessId)) throw new Error("Bank account not found in this business.");
    return clone(calculateBankReconciliationSummary(state, account, input));
  }

  function listPaymentsForUser(user) {
    if (!user || user.role === "admin") return clone(state.payments);
    const invoiceIds = new Set(listInvoicesForUser(user).map((invoice) => invoice.id));
    const purchaseOrderIds = new Set(listPurchaseOrdersForUser(user).map((purchaseOrder) => purchaseOrder.id));
    const vendorBillIds = new Set(listVendorBillsForUser(user).map((bill) => bill.id));
    return clone(state.payments.filter((payment) => invoiceIds.has(payment.invoiceId) || purchaseOrderIds.has(payment.purchaseOrderId) || vendorBillIds.has(payment.vendorBillId)));
  }

  function listPurchaseOrdersForUser(user) {
    if (!user || user.role === "admin") return clone(state.purchaseOrders);
    const companiesOwned = new Set(state.companies.filter((company) => company.ownerUserId === user.id).map((company) => company.id));
    return clone(state.purchaseOrders.filter((purchaseOrder) => purchaseOrder.ownerUserId === user.id || companiesOwned.has(purchaseOrder.companyId)));
  }

  function listVendorBillsForUser(user) {
    if (!user || user.role === "admin") return clone(state.vendorBills);
    const companiesOwned = new Set(state.companies.filter((company) => company.ownerUserId === user.id).map((company) => company.id));
    return clone(state.vendorBills.filter((bill) => bill.ownerUserId === user.id || companiesOwned.has(bill.companyId)));
  }

  function listCreditNotesForUser(user) {
    if (!user || user.role === "admin") return clone(state.creditNotes);
    return clone(state.creditNotes.filter((note) => note.ownerUserId === user.id));
  }

  function listVendorCreditsForUser(user) {
    if (!user || user.role === "admin") return clone(state.vendorCredits);
    return clone(state.vendorCredits.filter((credit) => credit.ownerUserId === user.id));
  }

  function listPaymentReversalsForUser(user) {
    if (!user || user.role === "admin") return clone(state.paymentReversals);
    return clone(state.paymentReversals.filter((reversal) => reversal.ownerUserId === user.id));
  }

  function listCustomerRefundsForUser(user) {
    if (!user || user.role === "admin") return clone(state.customerRefunds);
    return clone(state.customerRefunds.filter((refund) => refund.ownerUserId === user.id));
  }

  function listVendorPaymentReversalsForUser(user) {
    if (!user || user.role === "admin") return clone(state.vendorPaymentReversals);
    return clone(state.vendorPaymentReversals.filter((reversal) => reversal.ownerUserId === user.id));
  }

  function listVendorRefundsForUser(user) {
    if (!user || user.role === "admin") return clone(state.vendorRefunds);
    return clone(state.vendorRefunds.filter((refund) => refund.ownerUserId === user.id));
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
      vendorBills: state.vendorBills.length,
      creditNotes: state.creditNotes.length,
      vendorCredits: state.vendorCredits.length,
      paymentReversals: state.paymentReversals.length,
      customerRefunds: state.customerRefunds.length,
      vendorPaymentReversals: state.vendorPaymentReversals.length,
      vendorRefunds: state.vendorRefunds.length,
      bankAccounts: state.bankAccounts.length,
      bankStatementImportBatches: state.bankStatementImportBatches.length,
      bankStatementLines: state.bankStatementLines.length,
      bankReconciliationMatches: state.bankReconciliationMatches.length,
      taxRegistrations: state.taxRegistrations.length,
      complianceRuleSets: state.complianceRuleSets.length,
      transactionComplianceSnapshots: state.transactionComplianceSnapshots.length,
      complianceObligations: state.complianceObligations.length,
      tdsTransactions: state.tdsTransactions.length,
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
      ledgerAccounts: state.ledgerAccounts.length,
      financialEvents: state.financialEvents.length,
      accountingJournals: state.accountingJournals.length,
      accountingJournalLines: state.accountingJournalLines.length,
      businessSettings: state.businessSettings.length,
      complianceTasks: state.complianceTasks.length,
      businessAuditEvents: state.businessAuditEvents.length,
    };
  }

  function listLedgerAccountsForBusiness(businessId) {
    const business = findBusinessByIdOrLegacyOwner(businessId);
    if (!business) return [];
    ensureDefaultAccountingAccounts(state, business, business.ownerUserId);
    return clone(state.ledgerAccounts.filter((account) => account.businessId === business.id && account.status !== "deleted"));
  }

  function listFinancialEventsForBusiness(businessId) {
    const business = findBusinessByIdOrLegacyOwner(businessId);
    if (!business) return [];
    return clone(state.financialEvents.filter((event) => event.businessId === business.id));
  }

  function listAccountingJournalsForBusiness(businessId) {
    const business = findBusinessByIdOrLegacyOwner(businessId);
    if (!business) return [];
    return clone(state.accountingJournals
      .filter((journal) => journal.businessId === business.id)
      .map((journal) => publicJournalWithLines(state, journal)));
  }

  function createManualAccountingJournal(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for manual journal.");
    ensureDefaultAccountingAccounts(state, business, business.ownerUserId);
    const lines = (Array.isArray(input.lines) ? input.lines : []).map((line) => {
      const account = state.ledgerAccounts.find((entry) => entry.id === line.accountId || (
        entry.businessId === business.id && entry.accountCode === line.accountCode
      ));
      if (!account || account.businessId !== business.id) throw new Error("Ledger account does not belong to this business.");
      return {
        account,
        debit: toNumber(line.debit),
        credit: toNumber(line.credit),
        description: String(line.description || input.narration || "Manual journal").trim(),
      };
    });
    const totals = validateBalancedJournal(lines);
    const journal = {
      id: nextId("mjrnl", ++state.counters.accountingJournal),
      businessId: business.id,
      ownerUserId: business.ownerUserId,
      journalNumber: input.journalNumber || `JV-${String(state.counters.accountingJournal).padStart(4, "0")}`,
      journalDate: input.journalDate || new Date().toISOString().slice(0, 10),
      narration: String(input.narration || "Manual journal entry").trim(),
      status: "posted",
      sourceType: "manual",
      sourceId: input.sourceId || "",
      financialEventId: "",
      postingRule: "manual_journal",
      postingRuleVersion: "1",
      automatic: false,
      immutable: false,
      currency: input.currency || "INR",
      totalDebit: totals.totalDebit,
      totalCredit: totals.totalCredit,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.accountingJournals.push(journal);
    lines.forEach((line, index) => {
      state.accountingJournalLines.push({
        id: `${journal.id}:line:${index + 1}`,
        journalId: journal.id,
        businessId: business.id,
        ownerUserId: business.ownerUserId,
        accountId: line.account.id,
        accountCode: line.account.accountCode,
        accountName: line.account.accountName,
        lineIndex: index + 1,
        description: line.description,
        debit: toNumber(line.debit),
        credit: toNumber(line.credit),
        currency: journal.currency,
        createdAt: journal.createdAt,
      });
    });
    persist();
    return publicJournalWithLines(state, journal);
  }

  function reconcileAccountingForBusiness(businessId) {
    const business = findBusinessByIdOrLegacyOwner(businessId);
    return reconcileAccountingPostings(state, business?.id || "");
  }

  function exportState() {
    return clone(state);
  }

  function updateInvoice(id, updates, limits) {
    const invoice = state.invoices.find((entry) => entry.id === id);
    if (!invoice) return null;
    assertInvoiceCanBeEdited(invoice);
    const materialFields = ["items", "taxRate", "discount", "shipping", "roundOff", "currency", "customerId", "companyId"];
    const hasFinancialPosting = state.financialEvents.some((event) => (
      event.eventType === "invoice_issued"
      && event.sourceId === invoice.id
      && event.postingStatus === "posted"
    ));
    if (hasFinancialPosting && materialFields.some((field) => updates[field] !== undefined)) {
      throw new Error("Posted invoices cannot be financially edited. Use a controlled reversal or adjustment.");
    }

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
    if (updates.invoiceNumber !== undefined) {
      const duplicateInvoice = state.invoices.find((entry) => (
        entry.id !== invoice.id
        && entry.invoiceNumber === invoice.invoiceNumber
        && String(entry.status || "").toLowerCase() !== "deleted"
        && ((invoice.businessId && entry.businessId === invoice.businessId) || entry.ownerUserId === invoice.ownerUserId)
      ));
      if (duplicateInvoice) throw new Error("Invoice number already exists for this business.");
    }
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
      invoice.items = normalizeFinancialItems(updates.items, toNumber(updates.taxRate ?? invoice.taxRate))
        .filter((item) => item.description);
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
    const postingBusiness = invoice.businessId ? findBusinessByIdOrLegacyOwner(invoice.businessId) : null;
    if (postingBusiness) postInvoiceIssued(state, invoice, postingBusiness);

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
      "vendorId",
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
    if (updates.poNumber !== undefined) {
      const duplicatePurchaseOrder = state.purchaseOrders.find((entry) => (
        entry.id !== purchaseOrder.id
        && entry.poNumber === purchaseOrder.poNumber
        && String(entry.status || "").toLowerCase() !== "deleted"
        && ((purchaseOrder.businessId && entry.businessId === purchaseOrder.businessId) || entry.ownerUserId === purchaseOrder.ownerUserId)
      ));
      if (duplicatePurchaseOrder) throw new Error("Purchase/work order number already exists for this business.");
    }
    if (updates.companyId !== undefined) purchaseOrder.companyId = updates.companyId || null;
    if (updates.taxRate !== undefined) purchaseOrder.taxRate = toNumber(updates.taxRate);
    if (updates.discount !== undefined) purchaseOrder.discount = toNumber(updates.discount);
    if (updates.shipping !== undefined) purchaseOrder.shipping = toNumber(updates.shipping);
    if (updates.roundOff !== undefined) purchaseOrder.roundOff = toNumber(updates.roundOff);
    if (updates.items !== undefined) {
      purchaseOrder.items = normalizeFinancialItems(updates.items, toNumber(updates.taxRate ?? purchaseOrder.taxRate))
        .filter((item) => item.description);
    }

    const totalsNeedRefresh = ["items", "taxRate", "discount", "shipping", "roundOff"].some((field) => updates[field] !== undefined);
    if (totalsNeedRefresh) {
      if (purchaseOrder.items.length > limits.invoiceItemsPerInvoice) {
        throw new Error("purchase/work order items exceed active plan limit");
      }
      Object.assign(purchaseOrder, calculateInvoiceTotals(purchaseOrder.items, toNumber(purchaseOrder.taxRate), purchaseOrder));
    }
    refreshPurchaseOrderPaymentStatus(purchaseOrder);

    persist();
    return clone(purchaseOrder);
  }

  function getVendorBill(id, user) {
    const vendorBill = state.vendorBills.find((entry) => entry.id === id);
    if (!vendorBill) return null;
    if (!user || user.role === "admin") return clone(vendorBill);
    const companiesOwned = new Set(state.companies.filter((company) => company.ownerUserId === user.id).map((company) => company.id));
    if (vendorBill.ownerUserId !== user.id && !companiesOwned.has(vendorBill.companyId)) return null;
    return clone(vendorBill);
  }

  function getCreditNote(id, user) {
    const note = state.creditNotes.find((entry) => entry.id === id);
    if (!note) return null;
    if (!user || user.role === "admin" || note.ownerUserId === user.id) return clone(note);
    return null;
  }

  function getVendorCredit(id, user) {
    const credit = state.vendorCredits.find((entry) => entry.id === id);
    if (!credit) return null;
    if (!user || user.role === "admin" || credit.ownerUserId === user.id) return clone(credit);
    return null;
  }

  function getPaymentReversal(id, user) {
    const reversal = state.paymentReversals.find((entry) => entry.id === id);
    if (!reversal) return null;
    if (!user || user.role === "admin" || reversal.ownerUserId === user.id) return clone(reversal);
    return null;
  }

  function getCustomerRefund(id, user) {
    const refund = state.customerRefunds.find((entry) => entry.id === id);
    if (!refund) return null;
    if (!user || user.role === "admin" || refund.ownerUserId === user.id) return clone(refund);
    return null;
  }

  function getVendorPaymentReversal(id, user) {
    const reversal = state.vendorPaymentReversals.find((entry) => entry.id === id);
    if (!reversal) return null;
    if (!user || user.role === "admin" || reversal.ownerUserId === user.id) return clone(reversal);
    return null;
  }

  function getVendorRefund(id, user) {
    const refund = state.vendorRefunds.find((entry) => entry.id === id);
    if (!refund) return null;
    if (!user || user.role === "admin" || refund.ownerUserId === user.id) return clone(refund);
    return null;
  }

  function refreshVendorBillPaymentStatus(vendorBill) {
    const payableDocument = {
      ...vendorBill,
      total: toNumber(vendorBill.netVendorPayable || vendorBill.total),
    };
    Object.assign(vendorBill, calculatePaymentState(
      payableDocument,
      effectiveVendorBillPayments(vendorBill.id),
    ));
    return vendorBill;
  }

  function vendorBillIsRecognized(vendorBill) {
    return ["posted", "recognized", "approved"].includes(normalizeRecordStatus(vendorBill?.status, "draft"));
  }

  function createVendorBill(input, limits) {
    const ownerUserId = input.ownerUserId ?? null;
    const business = input.businessId
      ? findBusinessByIdOrLegacyOwner(input.businessId)
      : ensureBusinessForOwner(ownerUserId);
    if (!business) throw new Error("Business is required for vendor bill.");
    if (input.vendorId) {
      const vendor = state.vendors.find((entry) => entry.id === input.vendorId);
      if (!vendor || vendor.businessId !== business.id) throw new Error("Vendor does not belong to this business.");
    }
    const vendorBillNumber = String(input.vendorBillNumber || input.billNumber || "").trim();
    if (vendorBillNumber && input.vendorId) {
      const duplicate = state.vendorBills.find((entry) => (
        entry.businessId === business.id
        && entry.vendorId === input.vendorId
        && entry.vendorBillNumber === vendorBillNumber
        && normalizeRecordStatus(entry.status, "draft") !== "deleted"
      ));
      if (duplicate) throw new Error("Vendor bill number already exists for this vendor.");
    }
    const items = normalizeFinancialItems(input.items, toNumber(input.taxRate)).filter((item) => item.description);
    if (items.length > limits.invoiceItemsPerInvoice) {
      throw new Error("vendor bill items exceed active plan limit");
    }
    const totals = calculateInvoiceTotals(items, toNumber(input.taxRate), input);
    const billSequence = state.vendorBills.filter((entry) => entry.businessId === business.id).length + 1;
    const status = normalizeRecordStatus(input.status, "draft");
    const bill = {
      id: nextId("vbill", ++state.counters.vendorBill),
      ownerUserId: business.ownerUserId || ownerUserId,
      businessId: business.id,
      vendorId: input.vendorId || null,
      vendorBillNumber,
      internalBillNumber: String(input.internalBillNumber || `VB-${String(billSequence).padStart(4, "0")}`).trim(),
      billDate: input.billDate || new Date().toISOString().slice(0, 10),
      dueDate: input.dueDate || "",
      status,
      paymentStatus: status === "draft" ? "draft" : "unpaid",
      expenseCategory: String(input.expenseCategory || input.category || "Operating Expense").trim(),
      expenseAccountCode: String(input.expenseAccountCode || "5100").trim(),
      currency: input.currency?.trim() || "INR",
      taxRate: toNumber(input.taxRate),
      gstMode: input.gstMode?.trim() || "intra",
      placeOfSupply: input.placeOfSupply?.trim() || "",
      tdsNatureOfPayment: String(input.tdsNatureOfPayment || input.paymentNature || "").trim(),
      itcStatus: String(input.itcStatus || "not_verified").trim(),
      reverseChargeApplicable: Boolean(input.reverseChargeApplicable),
      notes: input.notes?.trim() || "",
      source: input.source?.trim() || "manual",
      items,
      ...totals,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    refreshVendorBillPaymentStatus(bill);
    if (vendorBillIsRecognized(bill)) {
      buildComplianceSnapshot("vendor_bill", bill, { direction: "input" });
      classifyVendorBillTds(bill);
      refreshVendorBillPaymentStatus(bill);
    }
    state.vendorBills.push(bill);
    if (vendorBillIsRecognized(bill)) {
      const accounts = ensureDefaultAccountingAccounts(state, business, bill.ownerUserId);
      const expenseAccount = state.ledgerAccounts.find((account) => account.businessId === business.id && account.accountCode === bill.expenseAccountCode) || accounts.operating_expense;
      postVendorBillPosted(state, bill, business, { expenseAccount });
    }
    persist();
    return clone(bill);
  }

  function postedCreditNotesForInvoice(invoiceId) {
    return state.creditNotes.filter((note) => note.sourceInvoiceId === invoiceId && normalizeRecordStatus(note.status, "draft") !== "draft");
  }

  function postedVendorCreditsForBill(vendorBillId) {
    return state.vendorCredits.filter((credit) => credit.sourceVendorBillId === vendorBillId && normalizeRecordStatus(credit.status, "draft") !== "draft");
  }

  function postedCreditMinorForInvoice(invoiceId, excludeCreditNoteId = "") {
    return postedCreditNotesForInvoice(invoiceId)
      .filter((note) => note.id !== excludeCreditNoteId)
      .reduce((sum, note) => sum + Math.round(toNumber(note.total) * 100), 0);
  }

  function postedVendorCreditMinorForBill(vendorBillId, excludeVendorCreditId = "") {
    return postedVendorCreditsForBill(vendorBillId)
      .filter((credit) => credit.id !== excludeVendorCreditId)
      .reduce((sum, credit) => sum + Math.round(toNumber(credit.total) * 100), 0);
  }

  function sourceJournalAndEvent(sourceType, sourceId) {
    const journal = state.accountingJournals.find((entry) => entry.sourceType === sourceType && entry.sourceId === sourceId && entry.status === "posted");
    const event = journal ? state.financialEvents.find((entry) => entry.id === journal.financialEventId) : null;
    return { journal, event };
  }

  function createSalesCreditNote(input, limits) {
    const invoice = state.invoices.find((entry) => entry.id === input.sourceInvoiceId || entry.id === input.invoiceId);
    if (!invoice) throw new Error("Source invoice is required for sales credit note.");
    const business = findBusinessByIdOrLegacyOwner(input.businessId || invoice.businessId);
    if (!business || invoice.businessId !== business.id) throw new Error("Credit note business does not match source invoice.");
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    if (idempotencyKey) {
      const existing = state.creditNotes.find((note) => note.businessId === business.id && note.idempotencyKey === idempotencyKey);
      if (existing) return clone(existing);
    }
    const status = normalizeRecordStatus(input.status, "draft");
    const items = normalizeFinancialItems(input.items, toNumber(input.taxRate ?? invoice.taxRate)).filter((item) => item.description);
    if (items.length > limits.invoiceItemsPerInvoice) throw new Error("credit note items exceed active plan limit");
    const totals = calculateInvoiceTotals(items, toNumber(input.taxRate ?? invoice.taxRate), { ...input, gstMode: input.gstMode || invoice.gstMode || "intra" });
    const priorCreditMinor = postedCreditMinorForInvoice(invoice.id);
    const remainingMinor = Math.round(toNumber(invoice.total) * 100) - priorCreditMinor;
    if (status !== "draft" && Math.round(toNumber(totals.total) * 100) > remainingMinor) throw new Error("Credit note exceeds remaining creditable invoice amount.");
    const sequence = state.creditNotes.filter((note) => note.businessId === business.id).length + 1;
    const { journal, event } = sourceJournalAndEvent("invoice", invoice.id);
    const note = {
      id: nextId("cn", ++state.counters.creditNote),
      ownerUserId: invoice.ownerUserId,
      businessId: business.id,
      sourceInvoiceId: invoice.id,
      customerId: invoice.customerId || null,
      creditNoteNumber: String(input.creditNoteNumber || `CN-${String(sequence).padStart(4, "0")}`).trim(),
      creditNoteDate: input.creditNoteDate || new Date().toISOString().slice(0, 10),
      reason: String(input.reason || "correction").trim(),
      status,
      idempotencyKey,
      currency: input.currency?.trim() || invoice.currency || "INR",
      gstMode: input.gstMode?.trim() || invoice.gstMode || "intra",
      fullReversal: Boolean(input.fullReversal),
      reversesFinancialEventId: event?.id || "",
      reversesJournalId: journal?.id || "",
      amountApplied: 0,
      unappliedCredit: 0,
      items,
      ...totals,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.creditNotes.push(note);
    if (status !== "draft") {
      buildComplianceSnapshot("sales_credit_note", note, { direction: "output" });
      postSalesCreditNotePosted(state, note, invoice, business);
    }
    persist();
    return clone(note);
  }

  function createVendorCredit(input, limits) {
    const bill = state.vendorBills.find((entry) => entry.id === input.sourceVendorBillId || entry.id === input.vendorBillId);
    if (!bill) throw new Error("Source vendor bill is required for vendor credit.");
    const business = findBusinessByIdOrLegacyOwner(input.businessId || bill.businessId);
    if (!business || bill.businessId !== business.id) throw new Error("Vendor credit business does not match source vendor bill.");
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    if (idempotencyKey) {
      const existing = state.vendorCredits.find((credit) => credit.businessId === business.id && credit.idempotencyKey === idempotencyKey);
      if (existing) return clone(existing);
    }
    const status = normalizeRecordStatus(input.status, "draft");
    const items = normalizeFinancialItems(input.items, toNumber(input.taxRate ?? bill.taxRate)).filter((item) => item.description);
    if (items.length > limits.invoiceItemsPerInvoice) throw new Error("vendor credit items exceed active plan limit");
    const totals = calculateInvoiceTotals(items, toNumber(input.taxRate ?? bill.taxRate), { ...input, gstMode: input.gstMode || bill.gstMode || "intra" });
    const priorCreditMinor = postedVendorCreditMinorForBill(bill.id);
    const remainingMinor = Math.round(toNumber(bill.total) * 100) - priorCreditMinor;
    if (status !== "draft" && Math.round(toNumber(totals.total) * 100) > remainingMinor) throw new Error("Vendor credit exceeds remaining creditable bill amount.");
    const sequence = state.vendorCredits.filter((credit) => credit.businessId === business.id).length + 1;
    const { journal, event } = sourceJournalAndEvent("vendor_bill", bill.id);
    const credit = {
      id: nextId("vcred", ++state.counters.vendorCredit),
      ownerUserId: bill.ownerUserId,
      businessId: business.id,
      sourceVendorBillId: bill.id,
      vendorId: bill.vendorId || null,
      vendorCreditNumber: String(input.vendorCreditNumber || `VC-${String(sequence).padStart(4, "0")}`).trim(),
      vendorCreditDate: input.vendorCreditDate || new Date().toISOString().slice(0, 10),
      reason: String(input.reason || "supplier_credit").trim(),
      status,
      idempotencyKey,
      currency: input.currency?.trim() || bill.currency || "INR",
      gstMode: input.gstMode?.trim() || bill.gstMode || "intra",
      fullReversal: Boolean(input.fullReversal),
      reversesFinancialEventId: event?.id || "",
      reversesJournalId: journal?.id || "",
      amountApplied: 0,
      unappliedCredit: 0,
      items,
      ...totals,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.vendorCredits.push(credit);
    if (status !== "draft") {
      buildComplianceSnapshot("vendor_credit", credit, { direction: "input" });
      credit.tdsAdjustmentStatus = bill.tdsTransactionId ? "needs_review" : "not_applicable";
      postVendorCreditPosted(state, credit, bill, business);
    }
    persist();
    return clone(credit);
  }

  function updateVendorBill(id, updates, limits) {
    const vendorBill = state.vendorBills.find((entry) => entry.id === id);
    if (!vendorBill) return null;
    const hasFinancialPosting = state.financialEvents.some((event) => (
      event.eventType === "vendor_bill_posted"
      && event.sourceId === vendorBill.id
      && event.postingStatus === "posted"
    ));
    const materialFields = ["vendorId", "vendorBillNumber", "items", "taxRate", "discount", "shipping", "roundOff", "currency", "gstMode", "billDate", "expenseAccountCode", "expenseCategory"];
    if (hasFinancialPosting && materialFields.some((field) => updates[field] !== undefined)) {
      throw new Error("Posted vendor bills cannot be financially edited. Use a controlled reversal or adjustment.");
    }
    if (hasFinancialPosting && ["deleted", "cancelled", "void"].includes(normalizeRecordStatus(updates.status, ""))) {
      throw new Error("Posted vendor bills cannot be cancelled or deleted without a controlled reversal.");
    }
    if (updates.vendorId !== undefined) {
      const vendor = state.vendors.find((entry) => entry.id === updates.vendorId);
      if (updates.vendorId && (!vendor || vendor.businessId !== vendorBill.businessId)) throw new Error("Vendor does not belong to this business.");
      vendorBill.vendorId = updates.vendorId || null;
    }
    if (updates.vendorBillNumber !== undefined) {
      const nextNumber = String(updates.vendorBillNumber || "").trim();
      if (nextNumber && vendorBill.vendorId) {
        const duplicate = state.vendorBills.find((entry) => (
          entry.id !== vendorBill.id
          && entry.businessId === vendorBill.businessId
          && entry.vendorId === vendorBill.vendorId
          && entry.vendorBillNumber === nextNumber
          && normalizeRecordStatus(entry.status, "draft") !== "deleted"
        ));
        if (duplicate) throw new Error("Vendor bill number already exists for this vendor.");
      }
      vendorBill.vendorBillNumber = nextNumber;
    }
    ["internalBillNumber", "billDate", "dueDate", "currency", "gstMode", "placeOfSupply", "notes", "source", "expenseCategory", "expenseAccountCode"].forEach((field) => {
      if (updates[field] !== undefined) vendorBill[field] = String(updates[field] || "").trim();
    });
    if (updates.status !== undefined) vendorBill.status = normalizeRecordStatus(updates.status, vendorBill.status || "draft");
    if (updates.taxRate !== undefined) vendorBill.taxRate = toNumber(updates.taxRate);
    if (updates.discount !== undefined) vendorBill.discount = toNumber(updates.discount);
    if (updates.shipping !== undefined) vendorBill.shipping = toNumber(updates.shipping);
    if (updates.roundOff !== undefined) vendorBill.roundOff = toNumber(updates.roundOff);
    if (updates.items !== undefined) {
      vendorBill.items = normalizeFinancialItems(updates.items, toNumber(updates.taxRate ?? vendorBill.taxRate)).filter((item) => item.description);
    }
    const totalsNeedRefresh = ["items", "taxRate", "discount", "shipping", "roundOff", "gstMode"].some((field) => updates[field] !== undefined);
    if (totalsNeedRefresh) {
      if (vendorBill.items.length > limits.invoiceItemsPerInvoice) throw new Error("vendor bill items exceed active plan limit");
      Object.assign(vendorBill, calculateInvoiceTotals(vendorBill.items, toNumber(vendorBill.taxRate), vendorBill));
    }
    refreshVendorBillPaymentStatus(vendorBill);
    vendorBill.updatedAt = new Date().toISOString();
    if (vendorBillIsRecognized(vendorBill)) {
      const business = findBusinessByIdOrLegacyOwner(vendorBill.businessId);
      buildComplianceSnapshot("vendor_bill", vendorBill, { direction: "input" });
      classifyVendorBillTds(vendorBill);
      refreshVendorBillPaymentStatus(vendorBill);
      const accounts = ensureDefaultAccountingAccounts(state, business, vendorBill.ownerUserId);
      const expenseAccount = state.ledgerAccounts.find((account) => account.businessId === business.id && account.accountCode === vendorBill.expenseAccountCode) || accounts.operating_expense;
      postVendorBillPosted(state, vendorBill, business, { expenseAccount });
    }
    persist();
    return clone(vendorBill);
  }

  function updateCreditNote(id, updates, limits) {
    const note = state.creditNotes.find((entry) => entry.id === id);
    if (!note) return null;
    const posted = normalizeRecordStatus(note.status, "draft") !== "draft";
    const materialFields = ["sourceInvoiceId", "customerId", "items", "taxRate", "discount", "shipping", "roundOff", "currency", "gstMode", "creditNoteDate"];
    if (posted && materialFields.some((field) => updates[field] !== undefined)) {
      throw new Error("Posted credit notes cannot be financially edited. Use a controlled reversal or adjustment.");
    }
    if (posted && updates.status !== undefined) throw new Error("Posted credit notes cannot be status-edited without a controlled reversal.");
    ["creditNoteNumber", "creditNoteDate", "reason", "currency", "gstMode"].forEach((field) => {
      if (updates[field] !== undefined) note[field] = String(updates[field] || "").trim();
    });
    if (updates.status !== undefined) note.status = normalizeRecordStatus(updates.status, note.status || "draft");
    if (updates.items !== undefined) {
      note.items = normalizeFinancialItems(updates.items, toNumber(updates.taxRate ?? note.taxRate)).filter((item) => item.description);
      if (note.items.length > limits.invoiceItemsPerInvoice) throw new Error("credit note items exceed active plan limit");
      Object.assign(note, calculateInvoiceTotals(note.items, toNumber(updates.taxRate ?? note.taxRate), note));
    }
    note.updatedAt = new Date().toISOString();
    if (normalizeRecordStatus(note.status, "draft") !== "draft") {
      const invoice = state.invoices.find((entry) => entry.id === note.sourceInvoiceId);
      const business = findBusinessByIdOrLegacyOwner(note.businessId);
      const remainingMinor = Math.round(toNumber(invoice?.total) * 100) - postedCreditMinorForInvoice(note.sourceInvoiceId, note.id);
      if (Math.round(toNumber(note.total) * 100) > remainingMinor) throw new Error("Credit note exceeds remaining creditable invoice amount.");
      postSalesCreditNotePosted(state, note, invoice, business);
    }
    persist();
    return clone(note);
  }

  function updateVendorCredit(id, updates, limits) {
    const credit = state.vendorCredits.find((entry) => entry.id === id);
    if (!credit) return null;
    const posted = normalizeRecordStatus(credit.status, "draft") !== "draft";
    const materialFields = ["sourceVendorBillId", "vendorId", "items", "taxRate", "discount", "shipping", "roundOff", "currency", "gstMode", "vendorCreditDate"];
    if (posted && materialFields.some((field) => updates[field] !== undefined)) {
      throw new Error("Posted vendor credits cannot be financially edited. Use a controlled reversal or adjustment.");
    }
    if (posted && updates.status !== undefined) throw new Error("Posted vendor credits cannot be status-edited without a controlled reversal.");
    ["vendorCreditNumber", "vendorCreditDate", "reason", "currency", "gstMode"].forEach((field) => {
      if (updates[field] !== undefined) credit[field] = String(updates[field] || "").trim();
    });
    if (updates.status !== undefined) credit.status = normalizeRecordStatus(updates.status, credit.status || "draft");
    if (updates.items !== undefined) {
      credit.items = normalizeFinancialItems(updates.items, toNumber(updates.taxRate ?? credit.taxRate)).filter((item) => item.description);
      if (credit.items.length > limits.invoiceItemsPerInvoice) throw new Error("vendor credit items exceed active plan limit");
      Object.assign(credit, calculateInvoiceTotals(credit.items, toNumber(updates.taxRate ?? credit.taxRate), credit));
    }
    credit.updatedAt = new Date().toISOString();
    if (normalizeRecordStatus(credit.status, "draft") !== "draft") {
      const bill = state.vendorBills.find((entry) => entry.id === credit.sourceVendorBillId);
      const business = findBusinessByIdOrLegacyOwner(credit.businessId);
      const remainingMinor = Math.round(toNumber(bill?.total) * 100) - postedVendorCreditMinorForBill(credit.sourceVendorBillId, credit.id);
      if (Math.round(toNumber(credit.total) * 100) > remainingMinor) throw new Error("Vendor credit exceeds remaining creditable bill amount.");
      postVendorCreditPosted(state, credit, bill, business);
    }
    persist();
    return clone(credit);
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
    purchaseOrder.paymentStatus = "deleted";
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
    getBusinessById,
    createBusinessForUser,
    transferBusinessOwnership,
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
    createVendorBill,
    createSalesCreditNote,
    createVendorCredit,
    createCustomerPaymentReversal,
    createVendorPaymentReversal,
    createCustomerRefund,
    createVendorRefund,
    upsertBusinessTaxProfile,
    getBusinessTaxProfile,
    createTaxRegistration,
    listTaxRegistrationsForUser,
    createComplianceRuleSet,
    listComplianceRuleSets,
    selectedComplianceRuleSet,
    getGstSalesRegister,
    getGstPurchaseRegister,
    getComplianceReadiness,
    getGstComplianceReconciliation,
    getTdsRegister,
    getTdsReconciliation,
    createComplianceObligation,
    updateComplianceObligation,
    listComplianceObligationsForUser,
    createBankAccount,
    importBankStatementLines,
    suggestBankStatementMatches,
    confirmBankReconciliationMatch,
    unmatchBankReconciliation,
    getBankReconciliationSummary,
    runRecurringInvoiceScheduler,
    listInvoicesForUser,
    listPurchaseOrdersForUser,
    listVendorBillsForUser,
    listCreditNotesForUser,
    listVendorCreditsForUser,
    listPaymentReversalsForUser,
    listCustomerRefundsForUser,
    listVendorPaymentReversalsForUser,
    listVendorRefundsForUser,
    listBankAccountsForUser,
    listBankStatementLinesForUser,
    getVendorBill,
    getCreditNote,
    getVendorCredit,
    getPaymentReversal,
    getCustomerRefund,
    getVendorPaymentReversal,
    getVendorRefund,
    getBankAccount,
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
    recordBusinessEmailDelivery,
    recordBusinessAuditEvent,
    listBusinessAuditEventsForWorkspace,
    getBusinessComplianceDashboard,
    updateComplianceTask,
    recordComplianceReminderDelivery,
    createApprovalRequest,
    listApprovalRequestsForUser,
    decideApprovalRequest,
    recordApprovalNotification,
    createApiKey,
    findActiveApiKeyByToken,
    listApiKeysForUser,
    revokeApiKey,
    listLedgerAccountsForBusiness,
    listFinancialEventsForBusiness,
    listAccountingJournalsForBusiness,
    createManualAccountingJournal,
    reconcileAccountingForBusiness,
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
    updateVendorBill,
    updateCreditNote,
    updateVendorCredit,
    deleteInvoice,
    deletePurchaseOrder,
    recordInvoicePayment,
    recordPurchaseOrderPayment,
    recordVendorBillPayment,
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



