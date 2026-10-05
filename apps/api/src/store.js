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
  resolveProviderFeeAccount,
  postInvoiceIssued,
  postPaymentCaptured,
  postCustomerReceiptUnapplied,
  postCustomerPaymentAllocation,
  postCustomerPaymentAllocationReversed,
  postCustomerReceiptReversed,
  postCustomerReceiptRefunded,
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
import {
  ensureAccountingPeriod,
  financialYearForAccountingDate,
  resolveAccountingPeriod,
  transitionAccountingPeriod,
  validateAccountingDate,
  validatePostingPeriod,
} from "./accounting-period-service.js";
import { buildBalanceSheet } from "./balance-sheet-service.js";
import {
  buildComparativeFinancialYears,
  buildOpeningRollForwardSummary,
  buildYearEndClosePreview,
  buildYearEndReadiness,
  buildYearEndReportBundle,
  normalizeFinancialYear,
} from "./year-end-close-service.js";

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

function nextDocumentId() {
  if (typeof crypto.randomUUID === "function") {
    return `doc_${crypto.randomUUID()}`;
  }
  return `doc_${crypto.randomBytes(16).toString("hex")}`;
}

function nextPaymentRequestPublicAccessToken() {
  return `eaz_payreq_${crypto.randomBytes(32).toString("base64url")}`;
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

function isInvoiceFinalized(invoice) {
  return !["draft", "deleted", "cancelled", "void"].includes(normalizeRecordStatus(invoice?.status));
}

function isPurchaseOrderIssued(purchaseOrder) {
  return !["draft", "deleted", "cancelled", "void", "closed"].includes(normalizeRecordStatus(purchaseOrder?.status, "created"));
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
  let pendingPersistence = null;
  let persistenceHealthy = true;
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
    accountingPeriods: [],
    accountingPeriodHistory: [],
    openingBalanceSets: [],
    openingBalanceDetails: [],
    financialYears: [],
    yearEndCloses: [],
    yearEndCloseHistory: [],
    invoices: [],
    purchaseOrders: [],
    payments: [],
    paymentAllocations: [],
    paymentRequests: [],
    providerRecoveryEvents: [],
    providerCredentialVersions: [],
    providerSettlements: [],
    subscriptions: [],
    billingOrders: [],
    monetization: [],
    reports: [],
    documents: [],
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
      accountingPeriod: 0,
      accountingPeriodHistory: 0,
      openingBalanceSet: 0,
      openingBalanceDetail: 0,
      financialYear: 0,
      yearEndClose: 0,
      yearEndCloseHistory: 0,
      invoice: 0,
      purchaseOrder: 0,
      payment: 0,
      paymentAllocation: 0,
      paymentRequest: 0,
      providerRecoveryEvent: 0,
      providerCredentialVersion: 0,
      providerSettlement: 0,
      subscription: 0,
      billingOrder: 0,
      monetization: 0,
      report: 0,
      document: 0,
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
    accountingPeriod: 0,
    accountingPeriodHistory: 0,
    openingBalanceSet: 0,
    openingBalanceDetail: 0,
    financialYear: 0,
    yearEndClose: 0,
    yearEndCloseHistory: 0,
    invoice: 0,
    purchaseOrder: 0,
    payment: 0,
    paymentAllocation: 0,
    paymentRequest: 0,
    providerRecoveryEvent: 0,
    providerCredentialVersion: 0,
    providerSettlement: 0,
    subscription: 0,
    billingOrder: 0,
    monetization: 0,
    report: 0,
    document: 0,
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
    if (!persistenceHealthy) {
      const error = new Error("Authoritative persistence is unhealthy; reload is required before further writes.");
      const rejected = Promise.reject(error);
      pendingPersistence = rejected;
      rejected.finally(() => {
        if (pendingPersistence === rejected) pendingPersistence = null;
      }).catch(() => {});
      return rejected;
    }
    const snapshot = {
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
      accountingPeriods: state.accountingPeriods,
      accountingPeriodHistory: state.accountingPeriodHistory,
      openingBalanceSets: state.openingBalanceSets,
      openingBalanceDetails: state.openingBalanceDetails,
      financialYears: state.financialYears,
      yearEndCloses: state.yearEndCloses,
      yearEndCloseHistory: state.yearEndCloseHistory,
      invoices: state.invoices,
      purchaseOrders: state.purchaseOrders,
      payments: state.payments,
      paymentAllocations: state.paymentAllocations,
      paymentRequests: state.paymentRequests,
      providerRecoveryEvents: state.providerRecoveryEvents,
      providerCredentialVersions: state.providerCredentialVersions,
      providerSettlements: state.providerSettlements,
      subscriptions: state.subscriptions,
      billingOrders: state.billingOrders,
      monetization: state.monetization,
      reports: state.reports,
      documents: state.documents,
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
    };
    const result = persistenceAdapter.save(snapshot);
    if (!result || typeof result.then !== "function") return null;
    const pending = Promise.resolve(result).then((value) => {
      persistenceHealthy = true;
      return value;
    }).catch(async (error) => {
        try {
          if (typeof persistenceAdapter.reload !== "function") throw new Error("Authoritative persistence reload is unavailable.");
          const authoritativeState = await persistenceAdapter.reload();
          applyAuthoritativeState(authoritativeState);
          persistenceHealthy = true;
        } catch (reloadError) {
          persistenceHealthy = false;
          error.reloadError = reloadError;
        }
        throw error;
      });
    const tracked = pending.finally(() => {
      if (pendingPersistence === tracked) pendingPersistence = null;
    });
    pendingPersistence = tracked;
    return tracked;
  }

  function persistAndReturn(value) {
    const pending = persist();
    return pending ? pending.then(() => value) : value;
  }

  function awaitPersistence() {
    return pendingPersistence;
  }

  function getPersistenceHealth() {
    return { healthy: persistenceHealthy };
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
      state.accountingPeriods,
      state.accountingPeriodHistory,
      state.openingBalanceSets,
      state.openingBalanceDetails,
      state.financialYears,
      state.yearEndCloses,
      state.yearEndCloseHistory,
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
      country: input.country?.trim() ?? input.kycCountry?.trim() ?? "IN",
      gstRegistered: Boolean(input.gstRegistered),
      address: input.address?.trim() ?? "",
      state: input.state?.trim() ?? "",
      pincode: input.pincode?.trim() ?? "",
      gstNumber: input.gstNumber?.trim() ?? "",
      panNumber: input.panNumber?.trim() ?? "",
      taxId: input.taxId?.trim() ?? "",
      registrationNumber: input.registrationNumber?.trim() ?? "",
      logoUrl: input.logoUrl?.trim() ?? "",
      upiId: input.upiId?.trim() ?? "",
      bankDetails: input.bankDetails?.trim() ?? "",
      kycStatus: input.kycStatus ?? "pending",
      kycMode: input.kycMode ?? "document-review",
      kycDocumentType: input.kycDocumentType ?? "",
      kycCountry: input.kycCountry?.trim() ?? input.country?.trim() ?? "IN",
      aadhaarLast4: input.aadhaarLast4?.trim() ?? "",
      addressProof: input.addressProof?.trim() ?? "",
      documentNames: Array.isArray(input.documentNames) ? input.documentNames : [],
      documentFiles: Array.isArray(input.documentFiles) ? input.documentFiles : [],
      kycDocuments: Array.isArray(input.kycDocuments) ? input.kycDocuments : [],
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
    if (Array.isArray(updates.kycDocuments)) company.kycDocuments = updates.kycDocuments;
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
      "country",
      "address",
      "state",
      "pincode",
      "gstNumber",
      "panNumber",
      "taxId",
      "registrationNumber",
      "kycCountry",
      "kycDocumentType",
      "phone",
      "email",
      "upiId",
      "bankDetails",
      "aadhaarLast4",
      "addressProof",
    ].forEach((field) => {
      if (updates[field] !== undefined) company[field] = String(updates[field] || "").trim();
    });
    if (updates.entityType !== undefined) company.entityType = String(updates.entityType || company.entityType);
    if (updates.gstRegistered !== undefined) company.gstRegistered = Boolean(updates.gstRegistered);
    if (Array.isArray(updates.documentNames)) company.documentNames = updates.documentNames;
    if (Array.isArray(updates.documentFiles)) company.documentFiles = updates.documentFiles;
    if (Array.isArray(updates.kycDocuments)) company.kycDocuments = updates.kycDocuments;
    if (typeof updates.kycStatus === "string") company.kycStatus = updates.kycStatus;
    if (typeof updates.reviewStatus === "string") company.reviewStatus = updates.reviewStatus;
    if (typeof updates.reviewNotes === "string") company.reviewNotes = updates.reviewNotes;
    if (typeof updates.reviewedAt === "string") company.reviewedAt = updates.reviewedAt;
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

  function documentBelongsToBusiness(record, businessId, ownerUserId) {
    return (businessId && record.businessId === businessId) || record.ownerUserId === ownerUserId;
  }

  function nextAvailableInvoiceNumber(invoice, business, preferredNumber = "") {
    const owner = state.users.find((entry) => entry.id === invoice.ownerUserId) ?? null;
    const company = state.companies.find((entry) => entry.id === invoice.companyId) ?? null;
    const invoiceCode = invoice.invoiceCode || (company
      ? makeCodeFromText(company.companyCode || company.name, `INV${state.counters.invoice + 1}`)
      : makeInitialCode(invoice.ownerCode || owner?.name, "IND"));
    const preferred = String(preferredNumber || "").trim();
    const duplicatePreferred = preferred ? state.invoices.find((entry) => (
      entry.id !== invoice.id
      && entry.invoiceNumber === preferred
      && String(entry.status || "").toLowerCase() !== "deleted"
      && documentBelongsToBusiness(entry, business?.id || invoice.businessId, invoice.ownerUserId)
    )) : null;
    if (preferred && !duplicatePreferred) return { invoiceCode, invoiceNumber: preferred };
    let sequence = state.invoices.filter((entry) => (
      entry.id !== invoice.id
      && isInvoiceFinalized(entry)
      && documentBelongsToBusiness(entry, business?.id || invoice.businessId, invoice.ownerUserId)
    )).length + 1;
    let invoiceNumber = formatDocumentNumber(invoiceCode, invoice.invoiceDate, sequence);
    while (state.invoices.some((entry) => (
      entry.id !== invoice.id
      && entry.invoiceNumber === invoiceNumber
      && String(entry.status || "").toLowerCase() !== "deleted"
      && documentBelongsToBusiness(entry, business?.id || invoice.businessId, invoice.ownerUserId)
    ))) {
      sequence += 1;
      invoiceNumber = formatDocumentNumber(invoiceCode, invoice.invoiceDate, sequence);
    }
    return { invoiceCode, invoiceNumber };
  }

  function nextAvailablePurchaseOrderNumber(purchaseOrder, preferredNumber = "") {
    const type = String(purchaseOrder.documentType || "po").toLowerCase() === "wo" ? "wo" : "po";
    const prefix = type === "wo" ? "WO" : "PO";
    const company = state.companies.find((entry) => entry.id === purchaseOrder.companyId) ?? null;
    const poCode = purchaseOrder.poCode || makeCodeFromText(company?.companyCode || purchaseOrder.ownerCode || prefix, `${prefix}${state.counters.purchaseOrder + 1}`);
    const preferred = String(preferredNumber || "").trim();
    const duplicatePreferred = preferred ? state.purchaseOrders.find((entry) => (
      entry.id !== purchaseOrder.id
      && entry.poNumber === preferred
      && String(entry.status || "").toLowerCase() !== "deleted"
      && documentBelongsToBusiness(entry, purchaseOrder.businessId, purchaseOrder.ownerUserId)
    )) : null;
    if (preferred && !duplicatePreferred) return { poCode, poNumber: preferred };
    let sequence = state.purchaseOrders.filter((entry) => (
      entry.id !== purchaseOrder.id
      && isPurchaseOrderIssued(entry)
      && documentBelongsToBusiness(entry, purchaseOrder.businessId, purchaseOrder.ownerUserId)
    )).length + 1;
    let poNumber = `${poCode}-${String(sequence).padStart(4, "0")}`;
    while (state.purchaseOrders.some((entry) => (
      entry.id !== purchaseOrder.id
      && entry.poNumber === poNumber
      && String(entry.status || "").toLowerCase() !== "deleted"
      && documentBelongsToBusiness(entry, purchaseOrder.businessId, purchaseOrder.ownerUserId)
    ))) {
      sequence += 1;
      poNumber = `${poCode}-${String(sequence).padStart(4, "0")}`;
    }
    return { poCode, poNumber };
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
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    const existingIdempotentInvoice = idempotencyKey ? state.invoices.find((entry) => (
      entry.idempotencyKey === idempotencyKey
      && documentBelongsToBusiness(entry, business?.id || company?.businessId || null, ownerUserId)
    )) : null;
    if (existingIdempotentInvoice) return clone(existingIdempotentInvoice);
    const invoiceCode = input.invoiceCode || (company
      ? makeCodeFromText(company.companyCode || company.name, `INV${state.counters.invoice + 1}`)
      : makeInitialCode(input.ownerCode || owner?.name, "IND"));
    const invoice = {
      id: nextId("inv", ++state.counters.invoice),
      ownerUserId,
      businessId: business?.id || company?.businessId || null,
      companyId: input.companyId ?? null,
      invoiceCode,
      invoiceNumber: "",
      draftNumber: String(input.draftNumber || input.invoiceNumber || "").trim(),
      idempotencyKey,
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
    if (status === "draft") {
      invoice.draftNumber = invoice.draftNumber || `DRAFT-${invoice.id}`;
    } else {
      const allocated = nextAvailableInvoiceNumber(invoice, business, input.invoiceNumber);
      invoice.invoiceCode = allocated.invoiceCode;
      invoice.invoiceNumber = allocated.invoiceNumber;
      invoice.finalizedAt = invoice.createdAt;
      invoice.finalizationIdempotencyKey = idempotencyKey;
    }
    invoice.balanceAmount = Math.max(0, invoice.total - invoice.paidAmount);
    refreshInvoicePaymentStatus(invoice);
    const postingBusiness = invoice.businessId ? (business || findBusinessByIdOrLegacyOwner(invoice.businessId)) : null;
    if (postingBusiness && normalizeRecordStatus(invoice.status, "draft") !== "draft") {
      validateAccountingPosting(postingBusiness, invoice.invoiceDate || invoice.createdAt.slice(0, 10), { ...input, sourceType: "invoice", sourceId: invoice.id });
    }
    state.invoices.push(invoice);
    if (normalizeRecordStatus(invoice.status, "draft") !== "draft") {
      buildComplianceSnapshot("invoice", invoice, { direction: "output" });
    }
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
    const status = normalizeRecordStatus(input.status, "draft");
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    const existingIdempotentPurchaseOrder = idempotencyKey ? state.purchaseOrders.find((entry) => (
      entry.idempotencyKey === idempotencyKey
      && documentBelongsToBusiness(entry, business?.id || company?.businessId || null, ownerUserId)
    )) : null;
    if (existingIdempotentPurchaseOrder) return clone(existingIdempotentPurchaseOrder);
    const poCode = input.poCode || makeCodeFromText(company?.companyCode || input.ownerCode || "PO", `PO${state.counters.purchaseOrder + 1}`);
    const poSequenceNumber = state.purchaseOrders.filter((entry) => (
      (business?.id && entry.businessId === business.id)
      || entry.ownerUserId === ownerUserId
    )).length + 1;
    const poSequence = String(poSequenceNumber).padStart(4, "0");
    const vendorCode = input.vendorCode?.trim() || `VEN-${poSequence}`;
    const purchaseOrder = {
      id: nextId("po", ++state.counters.purchaseOrder),
      ownerUserId,
      businessId: business?.id || company?.businessId || null,
      companyId: input.companyId ?? null,
      vendorCode,
      documentType: input.documentType?.trim() || "po",
      poCode,
      poNumber: "",
      draftNumber: String(input.draftNumber || input.poNumber || "").trim(),
      idempotencyKey,
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
    if (status === "draft") {
      purchaseOrder.draftNumber = purchaseOrder.draftNumber || `DRAFT-${purchaseOrder.id}`;
    } else {
      const allocated = nextAvailablePurchaseOrderNumber(purchaseOrder, input.poNumber);
      purchaseOrder.poCode = allocated.poCode;
      purchaseOrder.poNumber = allocated.poNumber;
      purchaseOrder.issuedAt = purchaseOrder.createdAt;
      purchaseOrder.issueIdempotencyKey = idempotencyKey;
    }
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
      businessId: input.businessId ?? null,
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


  function createDocument(input = {}) {
    state.counters.document += 1;
    const providedId = String(input.id || "").trim();
    const document = {
      id: providedId || nextDocumentId(),
      ownerUserId: input.ownerUserId || null,
      businessId: input.businessId || null,
      classification: String(input.classification || "supporting_attachment").trim().toLowerCase(),
      relatedEntityType: String(input.relatedEntityType || "").trim().toLowerCase(),
      relatedEntityId: String(input.relatedEntityId || "").trim(),
      storageProvider: String(input.storageProvider || "local").trim().toLowerCase(),
      storageKey: String(input.storageKey || "").trim(),
      originalFilename: String(input.originalFilename || "").trim(),
      mimeType: String(input.mimeType || "").trim().toLowerCase(),
      sizeBytes: Math.max(0, Number(input.sizeBytes || 0) || 0),
      checksumSha256: String(input.checksumSha256 || "").trim().toLowerCase(),
      status: String(input.status || "pending_storage").trim().toLowerCase(),
      retentionClass: String(input.retentionClass || "").trim().toLowerCase(),
      securityClass: String(input.securityClass || "").trim().toLowerCase(),
      createdByUserId: input.createdByUserId || input.ownerUserId || null,
      idempotencyKey: String(input.idempotencyKey || "").trim(),
      legacyFilePath: String(input.legacyFilePath || "").trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.documents.push(document);
    persist();
    return clone(document);
  }

  function listDocuments() {
    return clone(state.documents);
  }

  function listDocumentsForBusiness(businessId) {
    const normalizedBusinessId = String(businessId || "").trim();
    return clone(state.documents.filter((entry) => String(entry.businessId || "") === normalizedBusinessId));
  }

  function getDocumentById(documentId) {
    return clone(state.documents.find((entry) => entry.id === documentId) || null);
  }

  function updateDocument(documentId, updates = {}) {
    const document = state.documents.find((entry) => entry.id === documentId);
    if (!document) return null;
    [
      "classification",
      "relatedEntityType",
      "relatedEntityId",
      "storageProvider",
      "storageKey",
      "originalFilename",
      "mimeType",
      "checksumSha256",
      "status",
      "retentionClass",
      "securityClass",
      "idempotencyKey",
      "legacyFilePath",
    ].forEach((field) => {
      if (updates[field] !== undefined) document[field] = String(updates[field] || "").trim();
    });
    if (updates.ownerUserId !== undefined) document.ownerUserId = updates.ownerUserId || null;
    if (updates.businessId !== undefined) document.businessId = updates.businessId || null;
    if (updates.createdByUserId !== undefined) document.createdByUserId = updates.createdByUserId || null;
    if (updates.sizeBytes !== undefined) document.sizeBytes = Math.max(0, Number(updates.sizeBytes || 0) || 0);
    document.updatedAt = new Date().toISOString();
    persist();
    return clone(document);
  }

  function findDocumentByIdempotencyKey(input = {}) {
    const ownerUserId = String(input.ownerUserId || "").trim();
    const businessId = String(input.businessId || "").trim();
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    if (!ownerUserId || !businessId || !idempotencyKey) return null;
    const match = state.documents.find((entry) => (
      String(entry.ownerUserId || "") === ownerUserId
      && String(entry.businessId || "") === businessId
      && String(entry.idempotencyKey || "") === idempotencyKey
    ));
    return clone(match || null);
  }

  function listDocumentStorageKeys(businessId = "") {
    const normalizedBusinessId = String(businessId || "").trim();
    const scoped = normalizedBusinessId
      ? state.documents.filter((entry) => String(entry.businessId || "") === normalizedBusinessId)
      : state.documents;
    return scoped
      .map((entry) => String(entry.storageKey || "").trim())
      .filter(Boolean);
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
        ...(Object.prototype.hasOwnProperty.call(paymentSettings, "keyId") ? { keyId: String(paymentSettings.keyId || "").trim() } : {}),
        ...(Object.prototype.hasOwnProperty.call(paymentSettings, "keySecret") ? { keySecret: String(paymentSettings.keySecret || "") } : {}),
        ...(Object.prototype.hasOwnProperty.call(paymentSettings, "webhookSecret") ? { webhookSecret: String(paymentSettings.webhookSecret || "") } : {}),
        ...(Object.prototype.hasOwnProperty.call(paymentSettings, "merchantAccountId") || Object.prototype.hasOwnProperty.call(paymentSettings, "accountId")
          ? { merchantAccountId: String(paymentSettings.merchantAccountId || paymentSettings.accountId || "").trim() }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(paymentSettings, "mode") ? { mode: String(paymentSettings.mode || "").trim().toLowerCase() } : {}),
        ...(Object.prototype.hasOwnProperty.call(paymentSettings, "enabled") ? { enabled: Boolean(paymentSettings.enabled) } : {}),
        ...(Object.prototype.hasOwnProperty.call(paymentSettings, "paymentLinkEnabled") ? { paymentLinkEnabled: Boolean(paymentSettings.paymentLinkEnabled) } : {}),
        ...(paymentSettings.revokeKeySecret === true ? { revokeKeySecret: true } : {}),
        ...(paymentSettings.revokeWebhookSecret === true ? { revokeWebhookSecret: true } : {}),
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
        merchantAccountId: String(settings.paymentSettings?.merchantAccountId || "").trim(),
        mode: resolveRazorpayCredentialMode(settings.paymentSettings || {}).mode,
        enabled: resolveRazorpayCredentialMode(settings.paymentSettings || {}).enabled,
        keySecretConfigured: Boolean(settings.paymentSettings?.keySecret),
        webhookSecretConfigured: Boolean(settings.paymentSettings?.webhookSecret),
        status: (() => {
          const readiness = resolveRazorpayCredentialMode(settings.paymentSettings || {}).status;
          return readiness === "READY_LIVE" ? "live_ready" : readiness === "READY_TEST" ? "test_mode" : readiness.toLowerCase();
        })(),
        readiness: resolveRazorpayCredentialMode(settings.paymentSettings || {}).status,
      },
      complianceStatus: complianceReview.status,
      complianceReview,
    });
  }

  function getBusinessSettingsForUser(user, companyId = null, requestedBusinessId = null) {
    const ownerUserId = user?.role === "admin" && user?.id ? user.id : user?.id;
    if (!ownerUserId) return null;
    const businessId = requestedBusinessId || ensureBusinessForOwner(ownerUserId)?.id || null;
    const settings = state.businessSettings.find((entry) => (
      (entry.businessId === businessId || entry.ownerUserId === ownerUserId) && (entry.companyId || null) === (companyId || null)
    ));
    return sanitizeBusinessSettings(settings);
  }

  function getRawBusinessSettingsForUser(user, companyId = null, requestedBusinessId = null) {
    const ownerUserId = user?.role === "admin" && user?.id ? user.id : user?.id;
    if (!ownerUserId) return null;
    const businessId = requestedBusinessId || ensureBusinessForOwner(ownerUserId)?.id || null;
    const settings = state.businessSettings.find((entry) => (
      (entry.businessId === businessId || entry.ownerUserId === ownerUserId) && (entry.companyId || null) === (companyId || null)
    ));
    return clone(settings);
  }

  function resolveRazorpayCredentialMode(paymentSettings = {}) {
    const keyId = String(paymentSettings.keyId || "").trim();
    const requestedMode = String(paymentSettings.mode || "").trim().toLowerCase();
    const inferredMode = keyId.startsWith("rzp_live_") ? "live" : keyId.startsWith("rzp_test_") ? "test" : "unknown";
    const mode = requestedMode || inferredMode;
    const modeMismatch = requestedMode && inferredMode !== "unknown" && requestedMode !== inferredMode;
    const enabled = paymentSettings.enabled !== undefined
      ? Boolean(paymentSettings.enabled)
      : Boolean(paymentSettings.paymentLinkEnabled);
    const hasAnyCredential = Boolean(keyId || paymentSettings.keySecret || paymentSettings.webhookSecret);
    const hasCoreCredentials = Boolean(keyId && paymentSettings.keySecret);
    let status = "NOT_CONFIGURED";
    if (hasAnyCredential && !enabled) status = "DISABLED";
    else if (hasAnyCredential && (!hasCoreCredentials || modeMismatch || !["test", "live"].includes(mode))) status = "INCOMPLETE";
    else if (hasCoreCredentials) status = mode === "live" ? "READY_LIVE" : "READY_TEST";
    return { mode, inferredMode, modeMismatch, enabled, status, hasAnyCredential, hasCoreCredentials };
  }

  function providerCredentialVersionView(version, options = {}) {
    if (!version) return null;
    const safe = clone(version);
    if (!options.includeSecrets) {
      delete safe.keySecret;
      delete safe.webhookSecret;
    }
    safe.keySecretConfigured = Boolean(version.keySecret);
    safe.webhookSecretConfigured = Boolean(version.webhookSecret);
    return safe;
  }

  function credentialVersionScopeMatches(version, input = {}) {
    return version.provider === String(input.provider || "razorpay").trim().toLowerCase()
      && version.businessId === String(input.businessId || "").trim()
      && (version.companyId || null) === (input.companyId || null)
      && version.merchantAccountId === String(input.merchantAccountId || "").trim()
      && version.mode === String(input.mode || "").trim().toLowerCase();
  }

  function ensureProviderCredentialVersionLocal(input = {}) {
    const businessId = String(input.businessId || "").trim();
    const keyId = String(input.keyId || "").trim();
    const keySecret = String(input.keySecret || "");
    const webhookSecret = String(input.webhookSecret || "");
    if (!businessId || !keyId || !keySecret || !webhookSecret) return null;
    const mode = String(input.mode || resolveRazorpayCredentialMode({ keyId }).mode || "").trim().toLowerCase();
    const merchantAccountId = String(input.merchantAccountId || "").trim();
    const fingerprint = crypto.createHash("sha256").update([keyId, keySecret, webhookSecret, merchantAccountId, mode].join("\u0000"), "utf8").digest("hex");
    const scope = { provider: "razorpay", businessId, companyId: input.companyId || null, merchantAccountId, mode };
    const existing = state.providerCredentialVersions.find((version) => credentialVersionScopeMatches(version, scope) && version.fingerprint === fingerprint && version.status === "active");
    if (existing) return providerCredentialVersionView(existing, { includeSecrets: true });
    state.providerCredentialVersions.filter((version) => credentialVersionScopeMatches(version, scope) && version.status === "active").forEach((version) => {
      version.status = "retired";
      version.retiredAt = new Date().toISOString();
    });
    const now = new Date().toISOString();
    const version = {
      id: nextId("pcv", ++state.counters.providerCredentialVersion),
      provider: "razorpay", businessId, companyId: input.companyId || null,
      merchantAccountId, mode, keyId, keySecret, webhookSecret, fingerprint,
      status: "active", createdAt: now, retiredAt: "", revokedAt: "", revocationReason: "",
    };
    state.providerCredentialVersions.push(version);
    return providerCredentialVersionView(version, { includeSecrets: true });
  }

  function ensureProviderCredentialVersion(input = {}) {
    const result = ensureProviderCredentialVersionLocal(input);
    if (result) persist();
    return result ? providerCredentialVersionView(result) : null;
  }

  function getProviderCredentialVersion(id, options = {}) {
    const version = state.providerCredentialVersions.find((entry) => entry.id === String(id || "").trim());
    return providerCredentialVersionView(version, options);
  }

  function revokeProviderCredentialVersion(id, reason = "compromised") {
    const version = state.providerCredentialVersions.find((entry) => entry.id === String(id || "").trim());
    if (!version) return null;
    version.status = "revoked";
    version.revokedAt = new Date().toISOString();
    version.revocationReason = String(reason || "compromised").trim().slice(0, 120);
    persist();
    return providerCredentialVersionView(version);
  }

  function providerSettlementView(settlement) {
    if (!settlement) return null;
    return clone(settlement);
  }

  const KNOWN_SETTLEMENT_ADJUSTMENTS = new Set([
    "rounding", "refund", "chargeback", "dispute", "provider_correction",
    "reserve", "reserve_release", "incentive", "rebate",
  ]);

  function normalizeSettlementProvenance(input = {}) {
    const source = input.provenance && typeof input.provenance === "object" ? input.provenance : {};
    const normalized = {
      sourceType: String(source.sourceType || input.sourceType || "").trim().toLowerCase(),
      sourceReference: String(source.sourceReference || input.sourceReference || "").trim(),
      sourceRecordId: String(source.sourceRecordId || input.sourceRecordId || "").trim(),
      providerEvidenceId: String(source.providerEvidenceId || input.providerEvidenceId || "").trim(),
      payloadHash: String(source.payloadHash || input.payloadHash || "").trim(),
      adapterVersion: String(source.adapterVersion || input.adapterVersion || "PAY-SETTLE-EVIDENCE-01A").trim(),
      observedAt: String(source.observedAt || input.observedAt || new Date().toISOString()).trim(),
      verifiedAt: String(source.verifiedAt || input.verifiedAt || "").trim(),
      credentialVersionId: String(source.credentialVersionId || input.credentialVersionId || "").trim(),
    };
    const hasIdentity = Boolean(normalized.sourceReference || normalized.sourceRecordId || normalized.providerEvidenceId || normalized.payloadHash);
    return { value: normalized, complete: Boolean(normalized.sourceType && hasIdentity) };
  }

  function normalizeSettlementTax(input = {}) {
    const source = input.taxComponents && typeof input.taxComponents === "object" ? input.taxComponents : {};
    const amounts = {
      cgstAmount: toNumber(source.cgstAmount ?? input.feeCgstAmount),
      sgstAmount: toNumber(source.sgstAmount ?? input.feeSgstAmount),
      igstAmount: toNumber(source.igstAmount ?? input.feeIgstAmount),
    };
    const total = Math.round((amounts.cgstAmount + amounts.sgstAmount + amounts.igstAmount) * 100) / 100;
    const aggregate = toNumber(input.feeTaxAmount);
    const hasComponents = total > 0 || aggregate === 0;
    const reasons = [];
    if (Object.values(amounts).some((amount) => amount < 0)) reasons.push("negative_tax_component");
    if (hasComponents && Math.abs(total - aggregate) > 0.01) reasons.push("tax_component_total_mismatch");
    if (amounts.igstAmount > 0 && (amounts.cgstAmount > 0 || amounts.sgstAmount > 0)) reasons.push("mixed_gst_jurisdiction");
    if (amounts.cgstAmount > 0 && Math.abs(amounts.cgstAmount - amounts.sgstAmount) > 0.01) reasons.push("intra_state_gst_mismatch");
    return {
      value: { ...amounts, taxRate: source.taxRate ?? input.feeTaxRate ?? null, taxableAmount: source.taxableAmount ?? input.feeTaxableAmount ?? null, providerGstin: String(source.providerGstin || input.providerGstin || "").trim(), placeOfSupply: String(source.placeOfSupply || input.feePlaceOfSupply || "").trim(), sourceReference: String(source.sourceReference || input.taxSourceReference || "").trim() },
      supplied: Boolean(input.taxComponents || input.feeCgstAmount !== undefined || input.feeSgstAmount !== undefined || input.feeIgstAmount !== undefined),
      reasons,
    };
  }

  function normalizeSettlementAdjustments(input = {}) {
    const raw = Array.isArray(input.adjustments) ? input.adjustments : [];
    const reasons = [];
    const value = raw.map((adjustment) => {
      const type = String(adjustment?.type || "").trim().toLowerCase();
      const amount = toNumber(adjustment?.amount);
      if (!KNOWN_SETTLEMENT_ADJUSTMENTS.has(type)) reasons.push("unknown_adjustment_type");
      if (!Number.isFinite(amount) || amount === 0) reasons.push("invalid_adjustment_amount");
      return { type, amount, currency: String(adjustment?.currency || input.currency || "INR").trim().toUpperCase(), providerReference: String(adjustment?.providerReference || "").trim(), sourceReference: String(adjustment?.sourceReference || "").trim() };
    });
    return { value, reasons };
  }

  function normalizeSettlementWithholding(input = {}) {
    if (input.withholding === undefined || input.withholding === null) return { value: null, reasons: [] };
    const withholding = input.withholding && typeof input.withholding === "object" ? input.withholding : {};
    return {
      value: { type: String(withholding.type || "").trim().toLowerCase(), amount: toNumber(withholding.amount), currency: String(withholding.currency || input.currency || "INR").trim().toUpperCase(), sourceReference: String(withholding.sourceReference || "").trim() },
      reasons: ["withholding_contract_unverified"],
    };
  }

  function evaluateProviderSettlementReadiness(settlement = {}) {
    const reasons = [];
    if (!settlement.provenance?.sourceType || !(settlement.provenance.sourceReference || settlement.provenance.sourceRecordId || settlement.provenance.providerEvidenceId || settlement.provenance.payloadHash)) reasons.push("missing_provenance");
    if (settlement.taxComponents?.feeTaxAmount > 0 && !settlement.taxComponents?.sourceReference) reasons.push("missing_tax_evidence_reference");
    if (settlement.evidenceValidationReasons?.length) reasons.push(...settlement.evidenceValidationReasons);
    if (!settlement.destinationBankAccountId) reasons.push("missing_destination_bank_mapping");
    if (settlement.evidenceLifecycle === "manual_review") return { evidenceStatus: "manual_review", accountingReadiness: "blocked", reasons: [...new Set(reasons)] };
    if (reasons.length) return { evidenceStatus: settlement.provenance?.sourceType ? "evidence_verified" : "evidence_pending", accountingReadiness: "blocked", reasons: [...new Set(reasons)] };
    return { evidenceStatus: "evidence_verified", accountingReadiness: "blocked", reasons: ["tax_document_and_accounting_authority_pending"] };
  }

  function settlementFingerprint(input = {}) {
    return crypto.createHash("sha256").update(JSON.stringify({
      provider: String(input.provider || "").trim().toLowerCase(),
      businessId: String(input.businessId || "").trim(),
      companyId: input.companyId || null,
      merchantAccountId: String(input.merchantAccountId || "").trim(),
      providerSettlementId: String(input.providerSettlementId || input.payoutId || input.settlementId || "").trim(),
      grossAmount: toNumber(input.grossAmount),
      feeAmount: toNumber(input.feeAmount),
      feeTaxAmount: toNumber(input.feeTaxAmount),
      adjustmentAmount: toNumber(input.adjustmentAmount),
      netAmount: toNumber(input.netAmount),
      currency: String(input.currency || "INR").trim().toUpperCase(),
      settlementDate: String(input.settlementDate || "").trim(),
      paymentLinks: (Array.isArray(input.paymentLinks) ? input.paymentLinks : []).map((link) => ({
        paymentId: String(link.paymentId || "").trim(),
        amount: toNumber(link.amount),
      })),
      provenance: input.provenance || {},
      taxComponents: input.taxComponents || {},
      adjustments: input.adjustments || [],
      withholding: input.withholding || null,
      destinationBankAccountId: input.destinationBankAccountId || "",
    })).digest("hex");
  }

  function normalizeSettlementPaymentLinks(input = {}, businessId, provider, currency, excludeSettlementId = "") {
    const links = Array.isArray(input.paymentLinks) ? input.paymentLinks : [];
    const seen = new Set();
    return links.map((link) => {
      const paymentId = String(link.paymentId || "").trim();
      if (!paymentId || seen.has(paymentId)) throw new Error("Provider settlement Payment linkage must contain unique Payment IDs.");
      seen.add(paymentId);
      const payment = state.payments.find((entry) => entry.id === paymentId);
      if (!payment || payment.businessId !== businessId) throw new Error("Provider settlement Payment does not belong to this business.");
      if (String(payment.status || "").trim().toLowerCase() !== "captured") throw new Error("Provider settlement can link only captured Payments.");
      const identity = paymentExternalProviderIdentity(payment);
      if (!identity || identity.provider !== provider) throw new Error("Provider settlement Payment provider identity does not match.");
      const paymentCurrency = String(payment.currency || "INR").trim().toUpperCase();
      if (paymentCurrency !== currency) throw new Error("Provider settlement Payment currency does not match.");
      const amount = toNumber(link.amount ?? payment.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > toNumber(payment.amount)) throw new Error("Provider settlement Payment linkage amount is invalid.");
      const alreadyLinkedMinor = state.providerSettlements
        .filter((settlement) => settlement.businessId === businessId && settlement.id !== excludeSettlementId)
        .flatMap((settlement) => settlement.paymentLinks || [])
        .filter((entry) => entry.paymentId === paymentId)
        .reduce((sum, entry) => sum + Math.round(toNumber(entry.amount) * 100), 0);
      if (alreadyLinkedMinor + Math.round(amount * 100) > Math.round(toNumber(payment.amount) * 100)) {
        throw new Error("Provider settlement would link more than the captured Payment amount.");
      }
      return { paymentId, providerPaymentId: identity.providerPaymentId, providerOrderId: identity.providerOrderId || "", amount, currency };
    });
  }

  function createProviderSettlementLocal(input = {}) {
    const provider = String(input.provider || "razorpay").trim().toLowerCase();
    const businessId = String(input.businessId || "").trim();
    const providerSettlementId = String(input.providerSettlementId || input.payoutId || input.settlementId || "").trim();
    const merchantAccountId = String(input.merchantAccountId || "").trim();
    const currency = String(input.currency || "INR").trim().toUpperCase();
    if (!businessId || !findBusinessByIdOrLegacyOwner(businessId)) throw new Error("Provider settlement business is required.");
    if (!provider || !providerSettlementId || !merchantAccountId) throw new Error("Provider settlement identity is incomplete.");
    const grossAmount = toNumber(input.grossAmount);
    const feeAmount = toNumber(input.feeAmount);
    const feeTaxAmount = toNumber(input.feeTaxAmount);
    const adjustmentAmount = toNumber(input.adjustmentAmount);
    const provenance = normalizeSettlementProvenance(input);
    const tax = normalizeSettlementTax(input);
    const adjustments = normalizeSettlementAdjustments(input);
    const withholding = normalizeSettlementWithholding(input);
    const evidenceValidationReasons = [...tax.reasons, ...adjustments.reasons, ...withholding.reasons];
    if (adjustmentAmount !== 0 && adjustments.value.length === 0) evidenceValidationReasons.push("unclassified_aggregate_adjustment");
    const calculatedNet = Math.round((grossAmount - feeAmount - feeTaxAmount + adjustmentAmount) * 100) / 100;
    const netAmount = input.netAmount === undefined ? calculatedNet : toNumber(input.netAmount);
    if (grossAmount <= 0 || feeAmount < 0 || feeTaxAmount < 0 || !Number.isFinite(adjustmentAmount) || netAmount < 0 || Math.round(netAmount * 100) !== Math.round(calculatedNet * 100)) {
      throw new Error("Provider settlement amounts are invalid or do not reconcile to net amount.");
    }
    const identityMatch = state.providerSettlements.find((settlement) => (
      settlement.provider === provider
      && settlement.businessId === businessId
      && (settlement.companyId || null) === (input.companyId || null)
      && settlement.merchantAccountId === merchantAccountId
      && settlement.providerSettlementId === providerSettlementId
    ));
    const paymentLinks = normalizeSettlementPaymentLinks(input, businessId, provider, currency, identityMatch?.id || "");
    const fingerprint = settlementFingerprint({ ...input, provider, businessId, merchantAccountId, currency, grossAmount, feeAmount, feeTaxAmount, adjustmentAmount, netAmount, paymentLinks });
    if (identityMatch) {
      if (identityMatch.fingerprint !== fingerprint) throw new Error("Provider settlement identity conflicts with immutable payout evidence.");
      return { settlement: providerSettlementView(identityMatch), idempotentReplay: true };
    }
    const destinationBankAccountId = String(input.destinationBankAccountId || "").trim();
    if (destinationBankAccountId) {
      const bankAccount = state.bankAccounts.find((entry) => entry.id === destinationBankAccountId && entry.businessId === businessId && entry.status !== "deleted");
      if (!bankAccount || String(bankAccount.accountType || "").toLowerCase() !== "bank") throw new Error("Provider settlement destination must be an active tenant bank account.");
      const ledgerAccount = state.ledgerAccounts.find((account) => account.id === bankAccount.ledgerAccountId && account.businessId === businessId && account.status !== "deleted");
      if (!ledgerAccount) throw new Error("Provider settlement destination must resolve to an active tenant ledger account.");
      if (ledgerAccount.accountCode === "1110" || ledgerAccount.accountRole === "bank_clearing") throw new Error("Provider settlement destination cannot be the 1110 Provider Clearing account.");
    }
    const now = new Date().toISOString();
    const settlement = {
      id: nextId("pset", ++state.counters.providerSettlement),
      provider, businessId, companyId: input.companyId || null, merchantAccountId, providerSettlementId,
      status: String(input.status || "received").trim().toLowerCase(), currency,
      grossAmount, feeAmount, feeTaxAmount, adjustmentAmount, netAmount,
      settlementDate: String(input.settlementDate || "").trim(), providerCreatedAt: String(input.providerCreatedAt || "").trim(),
      destinationBankAccountId, paymentLinks, fingerprint,
      provenance: provenance.value,
      taxComponents: { ...tax.value, feeTaxAmount },
      adjustments: adjustments.value,
      withholding: withholding.value,
      evidenceValidationReasons,
      evidenceLifecycle: evidenceValidationReasons.length ? "manual_review" : (provenance.complete ? "evidence_verified" : "evidence_pending"),
      accountingReadiness: "blocked",
      accountingStatus: "not_posted", createdAt: now, updatedAt: now,
      metadata: input.metadata && typeof input.metadata === "object" ? clone(input.metadata) : {},
    };
    const readiness = evaluateProviderSettlementReadiness(settlement);
    settlement.evidenceLifecycle = readiness.evidenceStatus === "manual_review" ? "manual_review" : settlement.evidenceLifecycle;
    settlement.accountingReadiness = readiness.accountingReadiness;
    settlement.readinessReasons = readiness.reasons;
    state.providerSettlements.push(settlement);
    return persistAndReturn({ settlement: providerSettlementView(settlement) });
  }

  function createProviderSettlement(input = {}) {
    if (typeof persistenceAdapter.mutateState !== "function") return createProviderSettlementLocal(input);
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.createProviderSettlementLocal(input);
      return { result, state: transactionStore.exportState(), persist: !result?.idempotentReplay };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function getProviderSettlement(id, input = {}) {
    const settlement = state.providerSettlements.find((entry) => entry.id === String(id || "").trim());
    if (!settlement || (input.businessId && settlement.businessId !== input.businessId)) return null;
    return providerSettlementView(settlement);
  }

  function listProviderSettlements(input = {}) {
    return state.providerSettlements
      .filter((entry) => (!input.businessId || entry.businessId === input.businessId) && (!input.provider || entry.provider === String(input.provider).trim().toLowerCase()))
      .map(providerSettlementView);
  }

  function resolveBusinessRazorpayCredentials(businessId, companyId = null, credentialVersionId = null) {
    const normalizedBusinessId = String(businessId || "").trim();
    if (!normalizedBusinessId) {
      return {
        provider: "razorpay",
        businessId: "",
        companyId: companyId || null,
        keyId: "",
        keySecret: "",
        webhookSecret: "",
        merchantAccountId: "",
        ...resolveRazorpayCredentialMode({}),
      };
    }
    const settings = state.businessSettings.find((entry) => (
      entry.businessId === normalizedBusinessId
      && (entry.companyId || null) === (companyId || null)
    ));
    const paymentSettings = settings?.paymentSettings || {};
    const currentMode = resolveRazorpayCredentialMode(paymentSettings);
    const currentCredentialsComplete = Boolean(paymentSettings.keyId && paymentSettings.keySecret && paymentSettings.webhookSecret);
    const matchingVersion = credentialVersionId
      ? state.providerCredentialVersions.find((version) => version.id === String(credentialVersionId).trim() && version.businessId === normalizedBusinessId && (version.companyId || null) === (companyId || null))
      : currentCredentialsComplete && state.providerCredentialVersions.find((version) => credentialVersionScopeMatches(version, {
        businessId: normalizedBusinessId,
        companyId,
        merchantAccountId: paymentSettings.merchantAccountId || paymentSettings.accountId,
        mode: currentMode.mode,
      }) && version.status === "active");
    const source = matchingVersion || paymentSettings;
    return {
      provider: "razorpay",
      businessId: normalizedBusinessId,
      companyId: companyId || null,
      keyId: String(source.keyId || "").trim(),
      keySecret: String(source.keySecret || ""),
      webhookSecret: String(source.webhookSecret || ""),
      merchantAccountId: String(source.merchantAccountId || source.accountId || "").trim(),
      credentialVersionId: matchingVersion?.id || "",
      credentialVersionStatus: matchingVersion?.status || "legacy",
      ...resolveRazorpayCredentialMode({ ...paymentSettings, ...source }),
    };
  }

  function upsertBusinessSettings(user, input = {}) {
    if (!user?.id) throw new Error("Authentication required");
    const companyId = input.companyId || null;
    const requestedBusiness = input.businessId ? findBusinessByIdOrLegacyOwner(input.businessId) : null;
    const businessId = requestedBusiness?.id || ensureBusinessForOwner(user.id)?.id || null;
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
      const existingPaymentSettings = settings.paymentSettings || {};
      const paymentPatch = normalized.paymentSettings || {};
      const nextPaymentSettings = { ...existingPaymentSettings, provider: "razorpay" };
      ["keyId", "mode", "merchantAccountId", "paymentLinkEnabled"].forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(paymentPatch, field)) nextPaymentSettings[field] = paymentPatch[field];
      });
      if (Object.prototype.hasOwnProperty.call(paymentPatch, "enabled")) nextPaymentSettings.enabled = paymentPatch.enabled;
      else if (!settings.id && Object.prototype.hasOwnProperty.call(paymentPatch, "paymentLinkEnabled")) nextPaymentSettings.enabled = paymentPatch.paymentLinkEnabled;
      if (paymentPatch.revokeKeySecret) nextPaymentSettings.keySecret = "";
      else if (Object.prototype.hasOwnProperty.call(paymentPatch, "keySecret") && paymentPatch.keySecret !== "") nextPaymentSettings.keySecret = paymentPatch.keySecret;
      if (paymentPatch.revokeWebhookSecret) nextPaymentSettings.webhookSecret = "";
      else if (Object.prototype.hasOwnProperty.call(paymentPatch, "webhookSecret") && paymentPatch.webhookSecret !== "") nextPaymentSettings.webhookSecret = paymentPatch.webhookSecret;
      delete nextPaymentSettings.revokeKeySecret;
      delete nextPaymentSettings.revokeWebhookSecret;
      settings.paymentSettings = {
        ...nextPaymentSettings,
      };
      if (settings.paymentSettings.keyId && settings.paymentSettings.keySecret && settings.paymentSettings.webhookSecret) {
        ensureProviderCredentialVersionLocal({
          businessId,
          companyId,
          keyId: settings.paymentSettings.keyId,
          keySecret: settings.paymentSettings.keySecret,
          webhookSecret: settings.paymentSettings.webhookSecret,
          merchantAccountId: settings.paymentSettings.merchantAccountId,
          mode: settings.paymentSettings.mode,
        });
      }
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
      isInvoiceFinalized(invoice)
      && String(invoice.currency || "INR").toUpperCase() === "INR"
      && (!companyId || invoice.companyId === companyId)
    ));
    const purchaseOrders = listPurchaseOrdersForUser(user).filter((po) => (
      isPurchaseOrderIssued(po)
      && String(po.currency || "INR").toUpperCase() === "INR"
      && (!companyId || po.companyId === companyId)
    ));
    const vendorBills = listVendorBillsForUser(user).filter((bill) => (
      vendorBillIsRecognized(bill)
      && String(bill.currency || "INR").toUpperCase() === "INR"
      && (!companyId || bill.companyId === companyId)
    ));
    const outputGst = invoices.reduce((sum, invoice) => sum + toNumber(invoice.taxAmount, 0), 0);
    const inputGst = vendorBills.reduce((sum, bill) => sum + toNumber(bill.taxAmount, 0), 0);
    const revenue = invoices.reduce((sum, invoice) => sum + toNumber(invoice.total, 0), 0);
    const expenses = vendorBills.reduce((sum, bill) => sum + toNumber(bill.total, 0), 0);
    const expensesPaid = vendorBills.reduce((sum, bill) => sum + toNumber(bill.paidAmount, 0), 0);
    const paid = invoices.reduce((sum, invoice) => sum + toNumber(invoice.paidAmount, 0), 0);
    const receivables = invoices.reduce((sum, invoice) => sum + toNumber(invoice.balanceAmount, Math.max(0, toNumber(invoice.total, 0) - toNumber(invoice.paidAmount, 0))), 0);
    const payables = vendorBills.reduce((sum, bill) => sum + toNumber(bill.balanceAmount, Math.max(0, toNumber(bill.total, 0) - toNumber(bill.paidAmount, 0))), 0);
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

  function listInvoicePayments(invoiceId) {
    const allocatedPaymentIds = new Set(state.paymentAllocations
      .filter((allocation) => allocation.documentType === "INVOICE"
        && allocation.documentId === invoiceId
        && normalizeRecordStatus(allocation.status, "active") === "active")
      .map((allocation) => allocation.paymentId));
    return clone(state.payments.filter((payment) => payment.invoiceId === invoiceId || allocatedPaymentIds.has(payment.id)));
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
    const paymentState = calculatePaymentState(
      invoice,
      effectiveInvoicePayments(invoice.id),
    );
    paymentState.balanceAmount = fromMinor(invoiceOutstandingMinor(invoice));
    if (paymentState.balanceAmount <= 0 && isInvoiceFinalized(invoice)) {
      paymentState.paymentStatus = "paid";
    }
    Object.assign(invoice, paymentState);
    return invoice;
  }

  function refreshPurchaseOrderPaymentStatus(purchaseOrder) {
    purchaseOrder.paidAmount = 0;
    purchaseOrder.balanceAmount = 0;
    purchaseOrder.paymentStatus = normalizeRecordStatus(purchaseOrder.status, "draft") === "draft" ? "draft" : "not_applicable";
    return purchaseOrder;
  }

  function activePaymentAllocationsForPayment(paymentId) {
    return state.paymentAllocations.filter((allocation) => (
      allocation.paymentId === paymentId
      && normalizeRecordStatus(allocation.status, "active") === "active"
    ));
  }

  function paymentDirection(payment) {
    if (payment?.invoiceId && !payment?.vendorBillId) return "customer";
    if (payment?.customerId && !payment?.vendorBillId) return "customer";
    if (payment?.vendorBillId && !payment?.invoiceId) return "vendor";
    return "unknown";
  }

  function allocationDocument(documentType, documentId) {
    const normalizedType = String(documentType || "").trim().toUpperCase();
    if (normalizedType === "INVOICE") {
      return {
        type: normalizedType,
        record: state.invoices.find((entry) => entry.id === documentId) || null,
        direction: "customer",
      };
    }
    if (normalizedType === "VENDOR_BILL") {
      return {
        type: normalizedType,
        record: state.vendorBills.find((entry) => entry.id === documentId) || null,
        direction: "vendor",
      };
    }
    throw new Error("Payment allocation document type must be INVOICE or VENDOR_BILL.");
  }

  function documentOutstandingMinor(documentType, document) {
    if (documentType === "INVOICE") return invoiceOutstandingMinor(document);
    const total = documentType === "VENDOR_BILL"
      ? toNumber(document?.netVendorPayable ?? document?.total)
      : toNumber(document?.balanceAmount ?? document?.total);
    return Math.max(0, Math.round(total * 100));
  }

  // Single operational receivable-capacity authority for Invoice consumers.
  // Invoice.balanceAmount remains a compatibility projection; it must not
  // override this derived value at a financial mutation boundary.
  function invoiceOutstandingMinor(invoice) {
    if (!invoice?.id) return 0;
    const invoiceCurrency = String(invoice.currency || "INR").trim().toUpperCase();
    const effectivePaidMinor = effectiveInvoicePayments(invoice.id)
      .filter((payment) => String(payment.currency || invoiceCurrency).trim().toUpperCase() === invoiceCurrency)
      .reduce((sum, payment) => sum + Math.max(0, Math.round(toNumber(payment.amount) * 100)), 0);
    const creditMinor = state.creditNotes
      .filter((note) => (
        note.sourceInvoiceId === invoice.id
        && note.businessId === invoice.businessId
        && (!invoice.customerId || !note.customerId || note.customerId === invoice.customerId)
        && String(note.currency || invoiceCurrency).trim().toUpperCase() === invoiceCurrency
        && normalizeRecordStatus(note.status, "draft") !== "draft"
      ))
      .reduce((sum, note) => sum + Math.max(0, Math.round(toNumber(note.total) * 100)), 0);
    const refundedCreditMinor = customerRefundMinorForInvoice(invoice.id);
    const totalMinor = Math.max(0, Math.round(toNumber(invoice.total) * 100));
    return Math.max(0, totalMinor - Math.min(totalMinor, effectivePaidMinor) - creditMinor + refundedCreditMinor);
  }

  function paymentAvailableMinor(payment) {
    const amountMinor = Math.max(0, Math.round(toNumber(payment.amount) * 100));
    const direction = paymentDirection(payment);
    const reversedMinor = direction === "vendor"
      ? reversedMinorForPayment(payment.id, "vendor")
      : reversedMinorForPayment(payment.id, "customer");
    const allocatedMinor = activePaymentAllocationsForPayment(payment.id)
      .reduce((sum, allocation) => sum + Math.round(toNumber(allocation.allocatedAmount) * 100), 0);
    const refundedMinor = state.customerRefunds
      .filter((refund) => refund.sourcePaymentId === payment.id && normalizeRecordStatus(refund.status, "processed") === "processed")
      .reduce((sum, refund) => sum + Math.round(toNumber(refund.amount) * 100), 0);
    return Math.max(0, amountMinor - Math.min(amountMinor, reversedMinor) - allocatedMinor - refundedMinor);
  }

  // Derived from canonical Payment + active PaymentAllocation state. No
  // second receipt balance is stored, so this remains compatible with the
  // existing allocation authority and future atomic mutations.
  function getPaymentUnappliedAmount(paymentId, input = {}) {
    const payment = state.payments.find((entry) => entry.id === paymentId);
    if (!payment) return null;
    if (input.businessId && payment.businessId !== input.businessId) return null;
    if (!payment.customerId) return 0;
    return fromMinor(paymentAvailableMinor(payment));
  }

  function postCustomerReceiptAccountingLocal(paymentId, input = {}) {
    const payment = state.payments.find((entry) => entry.id === paymentId);
    if (!payment) throw new Error("Payment was not found.");
    const business = findBusinessByIdOrLegacyOwner(input.businessId || payment.businessId);
    if (!business || payment.businessId !== business.id) throw new Error("Payment business does not match customer receipt business.");
    const customer = state.customers.find((entry) => entry.id === payment.customerId && entry.businessId === business.id);
    if (!customer) throw new Error("Payment customer does not belong to the Payment business.");
    return persistAndReturn(clone(postCustomerReceiptUnapplied(state, payment, business, input)));
  }

  function postCustomerReceiptAccounting(paymentId, input = {}) {
    if (typeof persistenceAdapter.mutateState !== "function") return postCustomerReceiptAccountingLocal(paymentId, input);
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.postCustomerReceiptAccountingLocal(paymentId, input);
      return { result, state: transactionStore.exportState(), persist: !result?.replay };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function postCustomerPaymentAllocationAccountingLocal(allocationId, input = {}) {
    const allocation = state.paymentAllocations.find((entry) => entry.id === allocationId);
    if (!allocation) throw new Error("Payment allocation was not found.");
    const payment = state.payments.find((entry) => entry.id === allocation.paymentId);
    const invoice = allocation.documentType === "INVOICE"
      ? state.invoices.find((entry) => entry.id === allocation.documentId)
      : null;
    if (!payment || !invoice) throw new Error("Customer payment allocation lineage is incomplete.");
    if (!payment.customerId || !invoice.customerId || payment.customerId !== invoice.customerId) {
      throw new Error("Customer payment allocation customer does not match the invoice customer.");
    }
    const business = findBusinessByIdOrLegacyOwner(input.businessId || allocation.businessId);
    if (!business || allocation.businessId !== business.id) throw new Error("Payment allocation business does not match.");
    const customer = state.customers.find((entry) => entry.id === payment.customerId && entry.businessId === business.id);
    if (!customer) throw new Error("Payment customer does not belong to the Payment business.");
    const availableBeforeAllocation = paymentAvailableMinor(payment) + Math.round(toNumber(allocation.allocatedAmount) * 100);
    if (Math.round(toNumber(allocation.allocatedAmount) * 100) > availableBeforeAllocation) throw new Error("Customer Advance capacity is insufficient for this allocation.");
    return persistAndReturn(clone(postCustomerPaymentAllocation(state, allocation, payment, invoice, business, input)));
  }

  function postCustomerPaymentAllocationAccounting(allocationId, input = {}) {
    if (typeof persistenceAdapter.mutateState !== "function") return postCustomerPaymentAllocationAccountingLocal(allocationId, input);
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.postCustomerPaymentAllocationAccountingLocal(allocationId, input);
      return { result, state: transactionStore.exportState(), persist: !result?.replay };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function listPaymentAllocations(input = {}) {
    const businessId = input.businessId || null;
    const documentType = input.documentType ? String(input.documentType).trim().toUpperCase() : null;
    const documentId = input.documentId || null;
    return clone(state.paymentAllocations.filter((allocation) => (
      (!businessId || allocation.businessId === businessId)
      && (!input.ownerUserId || allocation.ownerUserId === input.ownerUserId)
      && (!input.paymentId || allocation.paymentId === input.paymentId)
      && (!documentType || allocation.documentType === documentType)
      && (!documentId || allocation.documentId === documentId)
      && (input.includeReversed || normalizeRecordStatus(allocation.status, "active") === "active")
    )));
  }

  function createPaymentAllocationLocal(input = {}) {
    const paymentId = String(input.paymentId || "").trim();
    const documentType = String(input.documentType || input.targetType || "").trim().toUpperCase();
    const documentId = String(input.documentId || input.targetId || "").trim();
    const payment = state.payments.find((entry) => entry.id === paymentId);
    if (!payment) throw new Error("Payment is required for allocation.");
    const business = findBusinessByIdOrLegacyOwner(input.businessId || payment.businessId);
    if (!business || payment.businessId !== business.id) throw new Error("Payment allocation business does not match the Payment.");

    const target = allocationDocument(documentType, documentId);
    if (!target.record) throw new Error("Payment allocation document was not found.");
    if (target.record.businessId !== business.id) throw new Error("Payment allocation document does not belong to this business.");
    if (target.direction === "customer" && payment.customerId && target.record.customerId && payment.customerId !== target.record.customerId) {
      throw new Error("Payment allocation customer does not match the invoice customer.");
    }
    if (paymentDirection(payment) !== target.direction) throw new Error("Payment allocation direction does not match the document.");
    if (payment.invoiceId && (target.type !== "INVOICE" || target.record.id !== payment.invoiceId)) {
      throw new Error("Invoice-bound Payment can only be allocated to its original Invoice.");
    }
    if (payment.vendorBillId && (target.type !== "VENDOR_BILL" || target.record.id !== payment.vendorBillId)) {
      throw new Error("Vendor-Bill-bound Payment can only be allocated to its original Vendor Bill.");
    }
    if (!["INVOICE", "VENDOR_BILL"].includes(target.type)) throw new Error("Payment allocation document type is not supported.");
    const targetStatus = normalizeRecordStatus(target.record.status, "draft");
    if (["draft", "deleted", "cancelled", "void"].includes(targetStatus)) throw new Error("Payment allocation document is not eligible.");
    const paymentStatus = normalizeRecordStatus(payment.status, "captured");
    if (["failed", "cancelled", "void", "reversed", "refunded"].includes(paymentStatus)) throw new Error("Payment is not usable for allocation.");

    const paymentCurrency = String(payment.currency || "INR").trim().toUpperCase();
    const documentCurrency = String(target.record.currency || "INR").trim().toUpperCase();
    const requestedCurrency = String(input.currency || paymentCurrency).trim().toUpperCase();
    if (requestedCurrency !== paymentCurrency || requestedCurrency !== documentCurrency) throw new Error("Payment allocation currency must match the Payment and document.");

    const amountMinor = Math.round(toNumber(input.allocatedAmount ?? input.amount) * 100);
    if (amountMinor <= 0) throw new Error("Payment allocation amount must be greater than zero.");
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    if (idempotencyKey) {
      const existing = state.paymentAllocations.find((allocation) => allocation.businessId === business.id && allocation.idempotencyKey === idempotencyKey);
      if (existing) {
        const sameRequest = existing.paymentId === payment.id
          && existing.documentType === target.type
          && existing.documentId === target.record.id
          && Math.round(toNumber(existing.allocatedAmount) * 100) === amountMinor
          && String(existing.currency || "INR").trim().toUpperCase() === requestedCurrency;
        if (!sameRequest) throw new Error("Payment allocation idempotency key was already used for a different request.");
        return clone({ allocation: existing, idempotentReplay: true });
      }
    }
    const availablePaymentMinor = paymentAvailableMinor(payment);
    if (amountMinor > availablePaymentMinor) throw new Error("Payment allocation cannot exceed the Payment's available amount.");
    const outstandingMinor = documentOutstandingMinor(target.type, target.record);
    const existingTargetAllocations = state.paymentAllocations
      .filter((allocation) => allocation.documentType === target.type && allocation.documentId === target.record.id && normalizeRecordStatus(allocation.status, "active") === "active")
      .reduce((sum, allocation) => sum + Math.round(toNumber(allocation.allocatedAmount) * 100), 0);
    if (target.type === "VENDOR_BILL" && amountMinor + existingTargetAllocations > outstandingMinor) {
      throw new Error("Payment allocation cannot exceed the document's outstanding balance.");
    }
    if (target.type === "INVOICE" && amountMinor > outstandingMinor) {
      throw new Error("Payment allocation cannot exceed the document's outstanding balance.");
    }

    const now = new Date().toISOString();
    const allocation = {
      id: nextId("palloc", ++state.counters.paymentAllocation),
      ownerUserId: payment.ownerUserId,
      businessId: business.id,
      paymentId: payment.id,
      documentType: target.type,
      documentId: target.record.id,
      allocatedAmount: fromMinor(amountMinor),
      currency: requestedCurrency,
      status: "active",
      idempotencyKey,
      createdByUserId: input.createdByUserId || input.actorUserId || "",
      createdAt: now,
      updatedAt: now,
    };
    const allocationStateBeforeAccounting = clone(state);
    state.paymentAllocations.push(allocation);
    let accounting = null;
    if (payment.accountingTreatment === "receipt_first") {
      try {
        accounting = postCustomerPaymentAllocation(state, allocation, payment, target.record, business, input);
        if (!accounting?.posted) throw new Error(accounting?.error || "Customer payment allocation accounting failed.");
      } catch (error) {
        applyAuthoritativeState(allocationStateBeforeAccounting);
        throw error;
      }
    }
    if (target.type === "INVOICE") refreshInvoicePaymentStatus(target.record);
    persist();
    return clone({ allocation, ...(accounting ? { accounting } : {}) });
  }

  function applyAuthoritativeState(nextState) {
    Object.keys(state).forEach((key) => {
      if (!(key in nextState)) delete state[key];
    });
    Object.entries(nextState).forEach(([key, value]) => {
      state[key] = clone(value);
    });
  }

  function createPaymentAllocation(input = {}) {
    if (typeof persistenceAdapter.mutateState !== "function") {
      return createPaymentAllocationLocal(input);
    }
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.createPaymentAllocationLocal(input);
      return {
        result,
        state: transactionStore.exportState(),
        persist: !result?.idempotentReplay,
      };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function reversePaymentAllocationLocal(allocationId, input = {}) {
    const allocation = state.paymentAllocations.find((entry) => entry.id === allocationId);
    if (!allocation) return null;
    if (input.businessId && allocation.businessId !== input.businessId) throw new Error("Payment allocation was not found in this business.");
    if (normalizeRecordStatus(allocation.status, "active") === "reversed") return clone({ allocation, idempotentReplay: true });
    if (input.amount !== undefined && Math.round(toNumber(input.amount) * 100) !== Math.round(toNumber(allocation.allocatedAmount) * 100)) {
      throw new Error("Partial payment allocation reversal is not supported.");
    }
    const payment = state.payments.find((entry) => entry.id === allocation.paymentId);
    const invoice = allocation.documentType === "INVOICE" ? state.invoices.find((entry) => entry.id === allocation.documentId) : null;
    const business = findBusinessByIdOrLegacyOwner(input.businessId || allocation.businessId);
    const allocationEvent = state.financialEvents.find((entry) => entry.eventType === "customer_payment_allocated" && entry.sourceType === "payment_allocation" && entry.sourceId === allocation.id && entry.postingStatus === "posted");
    if (allocationEvent) {
      if (!payment || !invoice || !business) throw new Error("Receipt-first allocation lineage is incomplete.");
      allocation.status = "reversed";
      allocation.reversedByUserId = input.actorUserId || input.createdByUserId || "";
      allocation.reversedAt = new Date().toISOString();
      allocation.updatedAt = allocation.reversedAt;
      const result = postCustomerPaymentAllocationReversed(state, allocation, payment, invoice, business, { reversalDate: allocation.reversedAt });
      if (!result.posted) throw new Error(result.error || "Allocation reversal accounting failed.");
      allocation.reversalFinancialEventId = result.event?.id || "";
      allocation.reversalJournalId = result.journal?.id || result.event?.journalId || "";
      refreshInvoicePaymentStatus(invoice);
      return persistAndReturn(clone({ allocation }));
    }
    allocation.status = "reversed";
    allocation.reversedByUserId = input.actorUserId || input.createdByUserId || "";
    allocation.reversedAt = new Date().toISOString();
    allocation.updatedAt = allocation.reversedAt;
    if (invoice) refreshInvoicePaymentStatus(invoice);
    persist();
    return clone({ allocation });
  }

  function reversePaymentAllocation(allocationId, input = {}) {
    if (typeof persistenceAdapter.mutateState !== "function") {
      return reversePaymentAllocationLocal(allocationId, input);
    }
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.reversePaymentAllocationLocal(allocationId, input);
      return {
        result,
        state: transactionStore.exportState(),
        persist: Boolean(result && !result.idempotentReplay),
      };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function providerRecoveryEventView(event, options = {}) {
    if (!event) return null;
    const safe = clone(event);
    if (!options.includeRaw) {
      delete safe.rawBody;
      delete safe.signature;
    }
    return safe;
  }

  function providerRecoveryEventIdentity(input = {}, payloadHash = "") {
    const provider = String(input.provider || "razorpay").trim().toLowerCase();
    const merchantScope = String(input.merchantAccountId || input.businessId || "unknown").trim();
    const eventId = String(input.providerEventId || "").trim();
    if (eventId) return `${provider}:${merchantScope}:event:${eventId}`;
    return [
      provider,
      merchantScope,
      String(input.eventType || "unknown").trim().toLowerCase(),
      String(input.providerPaymentId || "").trim(),
      String(input.providerOrderId || "").trim(),
      payloadHash,
    ].join(":");
  }

  function ingestProviderEventLocal(input = {}) {
    const provider = String(input.provider || "razorpay").trim().toLowerCase();
    const rawBody = String(input.rawBody || "");
    if (!provider || !rawBody) throw new Error("Provider event raw evidence is required.");
    const payloadHash = crypto.createHash("sha256").update(rawBody, "utf8").digest("hex");
    const eventIdentity = providerRecoveryEventIdentity(input, payloadHash);
    const existing = state.providerRecoveryEvents.find((event) => event.eventIdentity === eventIdentity);
    if (existing) {
      if (existing.payloadHash !== payloadHash
        || existing.providerPaymentId !== String(input.providerPaymentId || "").trim()
        || existing.providerOrderId !== String(input.providerOrderId || "").trim()
        || (input.credentialVersionId && existing.credentialVersionId && existing.credentialVersionId !== String(input.credentialVersionId).trim())) {
        throw new Error("Provider event identity conflicts with immutable recovery evidence.");
      }
      return { event: providerRecoveryEventView(existing), idempotentReplay: true };
    }
    const now = new Date().toISOString();
    const event = {
      id: nextId("pevt", ++state.counters.providerRecoveryEvent),
      eventIdentity,
      provider,
      providerEventId: String(input.providerEventId || "").trim(),
      merchantAccountId: String(input.merchantAccountId || "").trim(),
      businessId: String(input.businessId || "").trim(),
      workspaceOwnerUserId: String(input.workspaceOwnerUserId || "").trim(),
      eventType: String(input.eventType || "").trim().toLowerCase(),
      providerPaymentId: String(input.providerPaymentId || "").trim(),
      providerOrderId: String(input.providerOrderId || "").trim(),
      credentialVersionId: String(input.credentialVersionId || "").trim(),
      rawBody,
      signature: String(input.signature || "").trim(),
      payloadHash,
      verificationStatus: "unverified",
      processingStatus: "received",
      attemptCount: 0,
      lastAttemptAt: "",
      nextRetryAt: "",
      leaseOwnerId: "",
      leaseExpiresAt: "",
      errorCategory: "",
      errorCode: "",
      lastError: "",
      createdAt: now,
      updatedAt: now,
      verifiedAt: "",
      verificationProof: null,
      completedAt: "",
      version: 1,
    };
    state.providerRecoveryEvents.push(event);
    return persistAndReturn({ event: providerRecoveryEventView(event) });
  }

  function ingestProviderEvent(input = {}) {
    if (typeof persistenceAdapter.mutateState !== "function") return ingestProviderEventLocal(input);
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.ingestProviderEventLocal(input);
      return { result, state: transactionStore.exportState(), persist: !result?.idempotentReplay };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function getProviderRecoveryEventLocal(id, options = {}) {
    return providerRecoveryEventView(state.providerRecoveryEvents.find((event) => event.id === id), options);
  }

  function getProviderRecoveryEvent(id, options = {}) {
    return getProviderRecoveryEventLocal(id, options);
  }

  function markProviderEventVerifiedLocal(id, input = {}) {
    const event = state.providerRecoveryEvents.find((entry) => entry.id === id);
    if (!event) return null;
    if (["completed", "terminal_failure"].includes(event.processingStatus)) return providerRecoveryEventView(event);
    if (event.processingStatus === "processing") return providerRecoveryEventView(event);
    if (input.businessId && event.businessId && input.businessId !== event.businessId) {
      throw new Error("Provider recovery business lineage is immutable.");
    }
    event.businessId = event.businessId || String(input.businessId || "").trim();
    event.workspaceOwnerUserId = event.workspaceOwnerUserId || String(input.workspaceOwnerUserId || "").trim();
    event.merchantAccountId = event.merchantAccountId || String(input.merchantAccountId || "").trim();
    const credentialVersionId = String(input.credentialVersionId || event.credentialVersionId || "").trim();
    if (event.credentialVersionId && credentialVersionId && event.credentialVersionId !== credentialVersionId) {
      throw new Error("Provider credential version lineage is immutable.");
    }
    if (credentialVersionId) {
      const version = state.providerCredentialVersions.find((entry) => entry.id === credentialVersionId);
      if (!version || version.businessId !== event.businessId || (version.companyId || null) !== (input.companyId || null)) {
        throw new Error("Provider credential version is not valid for this recovery event.");
      }
      if (version.status === "revoked") throw new Error("Revoked provider credential versions cannot verify new evidence.");
      event.credentialVersionId = credentialVersionId;
    }
    event.verificationStatus = "verified";
    event.processingStatus = "verified_pending";
    event.verifiedAt = event.verifiedAt || new Date().toISOString();
    event.verificationProof = event.verificationProof || {
      provider: event.provider,
      businessId: event.businessId,
      merchantAccountId: event.merchantAccountId,
      credentialVersionId: event.credentialVersionId || "",
      payloadHash: event.payloadHash,
      signatureFingerprint: event.signature ? crypto.createHash("sha256").update(event.signature, "utf8").digest("hex") : "",
      verifiedAt: event.verifiedAt,
    };
    event.updatedAt = new Date().toISOString();
    event.errorCategory = "";
    event.errorCode = "";
    event.lastError = "";
    return persistAndReturn(providerRecoveryEventView(event));
  }

  function markProviderEventVerified(id, input = {}) {
    if (typeof persistenceAdapter.mutateState !== "function") return markProviderEventVerifiedLocal(id, input);
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.markProviderEventVerifiedLocal(id, input);
      return { result, state: transactionStore.exportState(), persist: Boolean(result) };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function claimProviderEventLocal(id, input = {}) {
    const event = state.providerRecoveryEvents.find((entry) => entry.id === id);
    if (!event) return null;
    const now = new Date(input.now || Date.now());
    if (event.processingStatus === "completed") return { event: providerRecoveryEventView(event), claimed: false, alreadyCompleted: true };
    if (event.processingStatus === "terminal_failure" || event.processingStatus === "manual_review") return { event: providerRecoveryEventView(event), claimed: false, blocked: true };
    if (event.verificationStatus !== "verified") throw new Error("Provider event must be verified before processing.");
    if (event.processingStatus === "processing" && event.leaseExpiresAt && Date.parse(event.leaseExpiresAt) > now.getTime()) {
      return { event: providerRecoveryEventView(event), claimed: false, busy: true };
    }
    const requestedLeaseMs = input.leaseMs === undefined ? 60000 : Number(input.leaseMs);
    const leaseMs = Math.max(1, Number.isFinite(requestedLeaseMs) ? requestedLeaseMs : 60000);
    event.processingStatus = "processing";
    event.attemptCount = Number(event.attemptCount || 0) + 1;
    event.lastAttemptAt = now.toISOString();
    event.leaseOwnerId = String(input.workerId || crypto.randomUUID());
    event.leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
    event.updatedAt = now.toISOString();
    return persistAndReturn({ event: providerRecoveryEventView(event), claimed: true });
  }

  function claimProviderEvent(id, input = {}) {
    if (typeof persistenceAdapter.mutateState !== "function") return claimProviderEventLocal(id, input);
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.claimProviderEventLocal(id, input);
      return { result, state: transactionStore.exportState(), persist: Boolean(result?.claimed) };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function updateProviderEventLocal(id, input = {}) {
    const event = state.providerRecoveryEvents.find((entry) => entry.id === id);
    if (!event) return null;
    const status = String(input.processingStatus || "").trim().toLowerCase();
    if (!["completed", "retryable_failure", "terminal_failure", "manual_review"].includes(status)) {
      throw new Error("Invalid provider recovery transition.");
    }
    if (event.processingStatus === "terminal_failure" && status === "completed") throw new Error("Terminal provider recovery event cannot complete without re-verification.");
    event.processingStatus = status;
    event.errorCategory = String(input.errorCategory || "").trim().toLowerCase();
    event.errorCode = String(input.errorCode || "").trim().slice(0, 100);
    event.lastError = String(input.lastError || "").replace(/\s+/g, " ").trim().slice(0, 500);
    event.nextRetryAt = status === "retryable_failure" ? new Date(input.nextRetryAt || Date.now() + 60000).toISOString() : "";
    event.leaseOwnerId = "";
    event.leaseExpiresAt = "";
    if (status === "completed") event.completedAt = new Date().toISOString();
    event.updatedAt = new Date().toISOString();
    return persistAndReturn(providerRecoveryEventView(event));
  }

  function updateProviderEvent(id, input = {}) {
    if (typeof persistenceAdapter.mutateState !== "function") return updateProviderEventLocal(id, input);
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.updateProviderEventLocal(id, input);
      return { result, state: transactionStore.exportState(), persist: Boolean(result) };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function listProviderRecoveryEvents(options = {}) {
    const now = Date.now();
    return clone(state.providerRecoveryEvents)
      .filter((event) => !options.status || event.processingStatus === options.status)
      .filter((event) => !options.due || (event.processingStatus === "retryable_failure" && Date.parse(event.nextRetryAt || 0) <= now))
      .map((event) => providerRecoveryEventView(event));
  }

  function paymentRequestEffectiveStatus(request, now = Date.now()) {
    const status = normalizeRecordStatus(request?.status, "");
    if (!["active", "completed", "expired", "cancelled"].includes(status)) return "unknown";
    if (status === "active" && request?.expiresAt) {
      const expiresAt = Date.parse(request.expiresAt);
      if (Number.isFinite(expiresAt) && expiresAt <= now) return "expired";
    }
    return status;
  }

  function assertPaymentRequestStatusKnown(request) {
    const status = paymentRequestEffectiveStatus(request);
    if (status === "unknown") throw new Error("Payment request lifecycle status is ambiguous; collection authority is blocked.");
    return status;
  }

  function paymentRequestView(request, now = Date.now()) {
    if (!request) return null;
    return clone({ ...request, status: paymentRequestEffectiveStatus(request, now) });
  }

  function paymentRequestPublicView(request, now = Date.now()) {
    if (!request) return null;
    const status = paymentRequestEffectiveStatus(request, now);
    const invoice = state.invoices.find((entry) => entry.id === request.invoiceId);
    const business = state.businesses.find((entry) => entry.id === request.businessId);
    const requestedMinor = Math.round(toNumber(request.requestedAmount) * 100);
    const outstandingMinor = invoice ? invoiceOutstandingMinor(invoice) : 0;
    const amountStillCollectible = outstandingMinor >= requestedMinor && requestedMinor > 0;
    const paymentAllowed = status === "active" && Boolean(invoice) && amountStillCollectible;
    let paymentBlockReason = "";
    if (!invoice) paymentBlockReason = "invoice_unavailable";
    else if (status === "completed") paymentBlockReason = "completed";
    else if (status === "expired") paymentBlockReason = "expired";
    else if (status === "cancelled") paymentBlockReason = "cancelled";
    else if (status === "unknown") paymentBlockReason = "invalid_status";
    else if (outstandingMinor <= 0) paymentBlockReason = "no_collectible_outstanding";
    else if (!amountStillCollectible) paymentBlockReason = "amount_no_longer_collectible";
    return {
      publicReference: String(request.publicAccessToken || "").slice(-12),
      status,
      amount: request.requestedAmount,
      currency: String(request.currency || "INR").toUpperCase(),
      expiresAt: request.expiresAt || null,
      paymentAllowed,
      paymentBlockReason: paymentBlockReason || null,
      business: { name: String(business?.name || "EazInvoice business").trim() },
      invoice: {
        number: String(invoice?.invoiceNumber || invoice?.draftNumber || "").trim() || null,
        description: String(invoice?.description || "Invoice payment").trim() || "Invoice payment",
      },
      provider: String(request.provider || request.providerIntent?.provider || "razorpay").trim().toLowerCase() || "razorpay",
    };
  }

  function getPublicPaymentRequest(token) {
    const supplied = String(token || "").trim();
    if (!supplied || supplied.length < 32 || supplied.length > 128) return null;
    const request = state.paymentRequests.find((entry) => entry.publicAccessToken === supplied);
    return request ? paymentRequestPublicView(request) : null;
  }

  function getPublicPaymentRequestAuthority(token) {
    const supplied = String(token || "").trim();
    if (!supplied || supplied.length < 32 || supplied.length > 128) return null;
    const request = state.paymentRequests.find((entry) => entry.publicAccessToken === supplied);
    if (!request) return null;
    return {
      id: request.id,
      businessId: request.businessId,
      workspaceOwnerUserId: request.workspaceOwnerUserId,
      invoiceId: request.invoiceId,
      publicPaymentRequest: paymentRequestPublicView(request),
    };
  }

  function paymentRequestProviderIntentView(request) {
    if (!request?.providerIntent) return null;
    return clone({
      provider: request.providerIntent.provider || "",
      status: request.providerIntent.status || "",
      providerOrderId: request.providerIntent.providerOrderId || "",
      paymentRequestId: request.id,
      invoiceId: request.invoiceId,
      businessId: request.businessId,
      workspaceOwnerUserId: request.workspaceOwnerUserId,
      amount: request.providerIntent.amount,
      currency: request.providerIntent.currency || request.currency,
      mode: request.providerIntent.mode || "",
      merchantAccountId: request.providerIntent.merchantAccountId || "",
      credentialVersionId: request.providerIntent.credentialVersionId || "",
      providerStatus: request.providerIntent.providerStatus || "",
      receipt: request.providerIntent.receipt || "",
      createdAt: request.providerIntent.createdAt || "",
    });
  }

  function activePaymentRequestReservationMinor(invoiceId, now = Date.now()) {
    const requests = state.paymentRequests.filter((request) => request.invoiceId === invoiceId);
    if (requests.some((request) => paymentRequestEffectiveStatus(request, now) === "unknown")) {
      throw new Error("Payment request lifecycle status is ambiguous; collection authority is blocked.");
    }
    return requests
      .filter((request) => paymentRequestEffectiveStatus(request, now) === "active")
      .reduce((sum, request) => sum + Math.round(toNumber(request.requestedAmount) * 100), 0);
  }

  function paymentRequestMaterialMatches(request, input) {
    return request.invoiceId === String(input.invoiceId || "").trim()
      && Math.round(toNumber(request.requestedAmount) * 100) === Math.round(toNumber(input.requestedAmount ?? input.amount) * 100)
      && String(request.currency || "").toUpperCase() === String(input.currency || "").trim().toUpperCase()
      && String(request.expiresAt || "") === String(input.expiresAt || "");
  }

  function activePaymentRequestForInvoice(invoiceId, businessId, now = Date.now()) {
    const requests = state.paymentRequests.filter((request) => request.invoiceId === invoiceId && request.businessId === businessId);
    if (requests.some((request) => paymentRequestEffectiveStatus(request, now) === "unknown")) {
      throw new Error("Payment request lifecycle status is ambiguous; collection authority is blocked.");
    }
    return requests.find((request) => (
      request.invoiceId === invoiceId
      && request.businessId === businessId
      && paymentRequestEffectiveStatus(request, now) === "active"
    )) || null;
  }

  function createPaymentRequestLocal(input = {}) {
    const invoiceId = String(input.invoiceId || "").trim();
    const invoice = state.invoices.find((entry) => entry.id === invoiceId);
    if (!invoice) throw new Error("Invoice not found.");
    assertInvoiceCanReceivePayment(invoice);
    const businessId = String(input.businessId || invoice.businessId || "").trim();
    if (!businessId || invoice.businessId !== businessId) throw new Error("Payment request business does not match invoice business.");
    const workspaceOwnerUserId = String(input.workspaceOwnerUserId || invoice.ownerUserId || "").trim();
    if (workspaceOwnerUserId && invoice.ownerUserId && workspaceOwnerUserId !== invoice.ownerUserId) {
      throw new Error("Payment request owner does not match invoice owner.");
    }
    const requestedAmount = toNumber(input.requestedAmount ?? input.amount);
    const amountMinor = Math.round(requestedAmount * 100);
    if (amountMinor <= 0) throw new Error("Payment request amount must be greater than zero.");
    const currency = String(input.currency || invoice.currency || "INR").trim().toUpperCase();
    const invoiceCurrency = String(invoice.currency || "INR").trim().toUpperCase();
    if (currency !== invoiceCurrency) throw new Error("Payment request currency must match the invoice currency.");
    const expiresAt = String(input.expiresAt || "").trim();
    if (expiresAt) {
      const expiryTime = Date.parse(expiresAt);
      if (!Number.isFinite(expiryTime) || expiryTime <= Date.now()) throw new Error("Payment request expiry must be a valid future timestamp.");
    }
    const activeRequest = activePaymentRequestForInvoice(invoiceId, businessId);
    const requestKey = String(input.requestKey || input.idempotencyKey || "").trim();
    if (requestKey) {
      const existing = state.paymentRequests.find((request) => request.businessId === businessId && request.requestKey === requestKey);
      if (existing) {
        if (!paymentRequestMaterialMatches(existing, { ...input, invoiceId, requestedAmount, currency, expiresAt })) {
          throw new Error("Payment request idempotency key was already used with a different collection intent.");
        }
        return { paymentRequest: paymentRequestView(existing), idempotentReplay: true };
      }
    }
    if (activeRequest) {
      if (paymentRequestMaterialMatches(activeRequest, { ...input, invoiceId, requestedAmount, currency, expiresAt })) {
        return { paymentRequest: paymentRequestView(activeRequest), idempotentReplay: true, activeAuthorityReplay: true };
      }
      throw new Error("An active payment request already exists for this Invoice.");
    }
    const outstandingMinor = documentOutstandingMinor("INVOICE", invoice);
    if (amountMinor > outstandingMinor) throw new Error("Payment request amount cannot exceed the invoice's collectible outstanding balance.");
    const reservedMinor = activePaymentRequestReservationMinor(invoiceId);
    if (amountMinor + reservedMinor > outstandingMinor) throw new Error("Active payment requests cannot exceed the invoice's collectible outstanding balance.");
    const now = new Date().toISOString();
    const paymentRequest = {
      id: nextId("preq", ++state.counters.paymentRequest),
      publicAccessToken: nextPaymentRequestPublicAccessToken(),
      workspaceOwnerUserId: invoice.ownerUserId || workspaceOwnerUserId || null,
      businessId,
      invoiceId,
      documentType: "INVOICE",
      currency,
      requestedAmount,
      status: "active",
      createdAt: now,
      updatedAt: now,
      expiresAt,
      cancelledAt: "",
      completedAt: "",
      requestKey,
      provider: String(input.provider || "").trim().toLowerCase(),
      providerReference: String(input.providerReference || "").trim(),
      providerIntent: null,
      metadata: input.metadata && typeof input.metadata === "object" ? clone(input.metadata) : {},
    };
    state.paymentRequests.push(paymentRequest);
    return persistAndReturn({ paymentRequest: paymentRequestView(paymentRequest) });
  }

  function createPaymentRequest(input = {}) {
    if (typeof persistenceAdapter.mutateState !== "function") return createPaymentRequestLocal(input);
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.createPaymentRequestLocal(input);
      return { result, state: transactionStore.exportState(), persist: !result?.idempotentReplay };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function reissuePaymentRequestLocal(input = {}) {
    const invoiceId = String(input.invoiceId || "").trim();
    const invoice = state.invoices.find((entry) => entry.id === invoiceId);
    if (!invoice) throw new Error("Invoice not found.");
    assertInvoiceCanReceivePayment(invoice);
    const businessId = String(input.businessId || invoice.businessId || "").trim();
    if (!businessId || invoice.businessId !== businessId) throw new Error("Payment request business does not match invoice business.");
    const workspaceOwnerUserId = String(input.workspaceOwnerUserId || invoice.ownerUserId || "").trim();
    if (workspaceOwnerUserId && invoice.ownerUserId && workspaceOwnerUserId !== invoice.ownerUserId) {
      throw new Error("Payment request owner does not match invoice owner.");
    }
    const currency = String(invoice.currency || "INR").trim().toUpperCase();
    if (input.currency && String(input.currency).trim().toUpperCase() !== currency) {
      throw new Error("Payment request currency must match the invoice currency.");
    }
    const outstandingMinor = documentOutstandingMinor("INVOICE", invoice);
    if (outstandingMinor <= 0) throw new Error("Invoice has no collectible outstanding balance.");
    if (input.requestedAmount != null || input.amount != null) {
      const suppliedMinor = Math.round(toNumber(input.requestedAmount ?? input.amount) * 100);
      if (suppliedMinor !== outstandingMinor) throw new Error("Remaining balance is determined by the Invoice outstanding authority.");
    }
    return createPaymentRequestLocal({
      ...input,
      invoiceId,
      businessId,
      workspaceOwnerUserId: invoice.ownerUserId || workspaceOwnerUserId,
      requestedAmount: outstandingMinor / 100,
      currency,
    });
  }

  function reissuePaymentRequest(invoiceId, input = {}) {
    const normalizedInput = { ...input, invoiceId };
    if (typeof persistenceAdapter.mutateState !== "function") return reissuePaymentRequestLocal(normalizedInput);
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.reissuePaymentRequestLocal(normalizedInput);
      return { result, state: transactionStore.exportState(), persist: !result?.idempotentReplay };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function listPaymentRequests(input = {}) {
    const now = Date.now();
    return clone(state.paymentRequests
      .filter((request) => (
        (!input.businessId || request.businessId === input.businessId)
        && (!input.workspaceOwnerUserId || request.workspaceOwnerUserId === input.workspaceOwnerUserId)
        && (!input.invoiceId || request.invoiceId === input.invoiceId)
        && (!input.status || paymentRequestEffectiveStatus(request, now) === String(input.status).toLowerCase())
      ))
      .map((request) => ({ ...request, status: paymentRequestEffectiveStatus(request, now) })));
  }

  function getPaymentRequest(id, input = {}) {
    const request = state.paymentRequests.find((entry) => entry.id === id);
    if (!request) return null;
    if (input.businessId && request.businessId !== input.businessId) return null;
    if (input.workspaceOwnerUserId && request.workspaceOwnerUserId !== input.workspaceOwnerUserId) return null;
    return paymentRequestView(request);
  }

  function preparePublicPaymentRequestLocal(token) {
    const supplied = String(token || "").trim();
    const request = state.paymentRequests.find((entry) => entry.publicAccessToken === supplied);
    if (!request) return null;
    const publicView = paymentRequestPublicView(request);
    if (!publicView.paymentAllowed) {
      const error = new Error("Payment request is not currently payable.");
      error.code = "PAYMENT_REQUEST_NOT_PAYABLE";
      throw error;
    }
    const result = beginPaymentRequestProviderIntentLocal(request.id, {
      businessId: request.businessId,
      workspaceOwnerUserId: request.workspaceOwnerUserId,
    });
    return {
      ...result,
      publicPaymentRequest: paymentRequestPublicView(state.paymentRequests.find((entry) => entry.id === request.id)),
    };
  }

  function preparePublicPaymentRequest(token) {
    if (typeof persistenceAdapter.mutateState !== "function") return preparePublicPaymentRequestLocal(token);
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.preparePublicPaymentRequestLocal(token);
      return { result, state: transactionStore.exportState(), persist: !result?.idempotentReplay && !result?.recoveryRequired };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function resolvePaymentRequestProviderEvidence(input = {}) {
    const provider = String(input.provider || "razorpay").trim().toLowerCase();
    if (provider !== "razorpay") return null;
    const providerOrderId = String(input.providerOrderId || input.orderId || "").trim();
    const receipt = String(input.receipt || "").trim();
    const notes = input.notes && typeof input.notes === "object" ? input.notes : {};
    const notePaymentRequestId = String(notes.paymentRequestId || "").trim();
    const suppliedPaymentRequestId = String(input.paymentRequestId || "").trim();
    const candidateIds = new Set([notePaymentRequestId, suppliedPaymentRequestId].filter(Boolean));
    let matches = state.paymentRequests.filter((request) => request.providerIntent?.provider === "razorpay");
    if (providerOrderId) matches = matches.filter((request) => (
      request.providerIntent?.providerOrderId === providerOrderId
      || (candidateIds.size && !request.providerIntent?.providerOrderId)
    ));
    if (receipt) matches = matches.filter((request) => request.providerIntent?.receipt === receipt);
    if (candidateIds.size) matches = matches.filter((request) => candidateIds.has(request.id));
    if (!providerOrderId && !receipt && !candidateIds.size) return null;
    if (matches.length !== 1) {
      if (matches.length > 1 || candidateIds.size || receipt.startsWith("eaz_preq_")) {
        throw new Error("PaymentRequest provider evidence is ambiguous or does not match persisted lineage.");
      }
      return null;
    }
    const request = matches[0];
    const invoice = state.invoices.find((entry) => entry.id === request.invoiceId);
    const business = state.businesses.find((entry) => entry.id === request.businessId);
    if (!invoice || !business || invoice.businessId !== request.businessId) {
      throw new Error("PaymentRequest provider evidence has invalid Invoice or business lineage.");
    }
    const assertMatch = (actual, expected, label) => {
      if (actual !== undefined && actual !== null && String(actual) !== "" && String(actual) !== String(expected)) {
        throw new Error(`PaymentRequest provider evidence ${label} does not match persisted lineage.`);
      }
    };
    assertMatch(input.invoiceId || notes.invoiceId, request.invoiceId, "Invoice");
    assertMatch(input.businessId || notes.businessId, request.businessId, "business");
    assertMatch(input.workspaceOwnerUserId || notes.workspaceOwnerUserId, request.workspaceOwnerUserId, "workspace");
    if (request.providerIntent.providerOrderId) {
      assertMatch(input.providerOrderId || input.orderId, request.providerIntent.providerOrderId, "provider Order");
    }
    assertMatch(input.receipt, request.providerIntent.receipt, "receipt");
    if (input.amount !== undefined && input.amount !== null && Number(input.amount) !== Math.round(toNumber(request.requestedAmount) * 100)) {
      throw new Error("PaymentRequest provider evidence amount does not match persisted lineage.");
    }
    if (input.currency && String(input.currency).trim().toUpperCase() !== String(request.currency || "INR").trim().toUpperCase()) {
      throw new Error("PaymentRequest provider evidence currency does not match persisted lineage.");
    }
    return clone({
      provider: "razorpay",
      providerOrderId: request.providerIntent.providerOrderId || providerOrderId,
      receipt: request.providerIntent.receipt || receipt,
      paymentRequest: paymentRequestView(request),
      providerIntent: paymentRequestProviderIntentView(request),
      invoice,
      business,
      workspace: {
        businessId: request.businessId,
        ownerUserId: request.workspaceOwnerUserId || business.ownerUserId || null,
        companyId: invoice.companyId || null,
      },
    });
  }

  function beginPaymentRequestProviderIntentLocal(id, input = {}) {
    const request = state.paymentRequests.find((entry) => entry.id === id);
    if (!request) return null;
    if (input.businessId && request.businessId !== input.businessId) throw new Error("Payment request was not found in this business.");
    if (input.workspaceOwnerUserId && request.workspaceOwnerUserId !== input.workspaceOwnerUserId) throw new Error("Payment request was not found in this workspace.");
    const status = assertPaymentRequestStatusKnown(request);
    if (["cancelled", "completed"].includes(status)) throw new Error("Payment request is terminal and cannot initiate a provider intent.");
    const providerIntentStatus = request.providerIntent?.status || "";
    if (status === "expired" && !["creating", "created", "recovery_required"].includes(providerIntentStatus)) {
      throw new Error("Expired payment requests cannot initiate a new provider intent.");
    }
    const invoice = state.invoices.find((entry) => entry.id === request.invoiceId);
    if (!invoice || invoice.businessId !== request.businessId) throw new Error("Payment request Invoice lineage is no longer valid.");
    if (String(invoice.currency || "INR").toUpperCase() !== String(request.currency || "INR").toUpperCase()) {
      throw new Error("Payment request Invoice currency is no longer compatible.");
    }
    if (invoiceOutstandingMinor(invoice) < Math.round(toNumber(request.requestedAmount) * 100)) {
      const error = new Error("Payment request amount is no longer fully collectible from the current Invoice outstanding balance.");
      error.code = "PAYMENT_REQUEST_AMOUNT_STALE";
      throw error;
    }
    if (request.providerIntent?.status === "created" && request.providerIntent.providerOrderId) {
      return {
        paymentRequest: paymentRequestView(request),
        providerIntent: paymentRequestProviderIntentView(request),
        idempotentReplay: true,
      };
    }
    if (["creating", "recovery_required"].includes(request.providerIntent?.status)) {
      return {
        paymentRequest: paymentRequestView(request),
        providerIntent: paymentRequestProviderIntentView(request),
        recoveryRequired: true,
      };
    }
    const now = new Date().toISOString();
    request.providerIntent = {
      provider: "razorpay",
      status: "creating",
      providerOrderId: "",
      amount: toNumber(request.requestedAmount),
      currency: String(request.currency || "INR").toUpperCase(),
      mode: "",
      merchantAccountId: "",
      providerStatus: "",
      receipt: `eaz_preq_${request.id}`.slice(0, 40),
      createdAt: now,
    };
    request.updatedAt = now;
    return persistAndReturn({
      paymentRequest: paymentRequestView(request),
      providerIntent: paymentRequestProviderIntentView(request),
    });
  }

  function beginPaymentRequestProviderIntent(id, input = {}) {
    if (typeof persistenceAdapter.mutateState !== "function") return beginPaymentRequestProviderIntentLocal(id, input);
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.beginPaymentRequestProviderIntentLocal(id, input);
      return {
        result,
        state: transactionStore.exportState(),
        persist: !result?.idempotentReplay && !result?.inProgress,
      };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function bindPaymentRequestProviderIntentLocal(id, input = {}) {
    const request = state.paymentRequests.find((entry) => entry.id === id);
    if (!request) return null;
    if (input.businessId && request.businessId !== input.businessId) throw new Error("Payment request was not found in this business.");
    if (input.workspaceOwnerUserId && request.workspaceOwnerUserId !== input.workspaceOwnerUserId) throw new Error("Payment request was not found in this workspace.");
    assertPaymentRequestStatusKnown(request);
    const providerOrderId = String(input.providerOrderId || "").trim();
    if (!providerOrderId) throw new Error("Provider order identity is required.");
    if (request.providerIntent?.status === "created" && request.providerIntent.providerOrderId === providerOrderId) {
      return { paymentRequest: paymentRequestView(request), providerIntent: paymentRequestProviderIntentView(request), idempotentReplay: true };
    }
    if (!["creating", "recovery_required"].includes(request.providerIntent?.status)) throw new Error("Payment request provider intent is not available for binding.");
    const credentialVersionId = String(input.credentialVersionId || "").trim();
    if (credentialVersionId) {
      const version = state.providerCredentialVersions.find((entry) => entry.id === credentialVersionId);
      if (!version || version.businessId !== request.businessId || version.status !== "active") {
        throw new Error("Only an active business credential version may create a provider Order.");
      }
    }
    const providerOrder = input.providerOrder && typeof input.providerOrder === "object" ? input.providerOrder : null;
    const expectedAmountMinor = Math.round(toNumber(request.requestedAmount) * 100);
    const providerAmountMinor = providerOrder ? Number(providerOrder.amount) : expectedAmountMinor;
    const providerCurrency = String(providerOrder?.currency || request.currency || "INR").trim().toUpperCase();
    const providerReceipt = String(providerOrder?.receipt || request.providerIntent.receipt || "").trim();
    const providerNotes = providerOrder?.notes && typeof providerOrder.notes === "object" ? providerOrder.notes : {};
    if (providerOrder && (!Number.isFinite(providerAmountMinor) || providerAmountMinor !== expectedAmountMinor)) throw new Error("Recovered provider order amount does not match the PaymentRequest.");
    if (providerOrder && providerCurrency !== String(request.currency || "INR").toUpperCase()) throw new Error("Recovered provider order currency does not match the PaymentRequest.");
    if (providerOrder && providerReceipt !== request.providerIntent.receipt) throw new Error("Recovered provider order receipt does not match the PaymentRequest.");
    if (providerOrder && providerNotes.paymentRequestId && String(providerNotes.paymentRequestId) !== request.id) throw new Error("Recovered provider order PaymentRequest lineage does not match.");
    if (providerOrder && providerNotes.invoiceId && String(providerNotes.invoiceId) !== request.invoiceId) throw new Error("Recovered provider order Invoice lineage does not match.");
    if (providerOrder && providerNotes.businessId && String(providerNotes.businessId) !== request.businessId) throw new Error("Recovered provider order business lineage does not match.");
    const now = new Date().toISOString();
    request.provider = "razorpay";
    request.providerIntent = {
      ...request.providerIntent,
      provider: "razorpay",
      status: "created",
      providerOrderId,
      mode: String(input.mode || "").trim().toLowerCase(),
      merchantAccountId: String(input.merchantAccountId || "").trim(),
      credentialVersionId,
      providerStatus: String(input.providerStatus || "created").trim().toLowerCase(),
      createdAt: request.providerIntent.createdAt || now,
    };
    request.updatedAt = now;
    return persistAndReturn({ paymentRequest: paymentRequestView(request), providerIntent: paymentRequestProviderIntentView(request) });
  }

  function markPaymentRequestProviderIntentRecoveryRequiredLocal(id, input = {}) {
    const request = state.paymentRequests.find((entry) => entry.id === id);
    if (!request) return null;
    if (input.businessId && request.businessId !== input.businessId) throw new Error("Payment request was not found in this business.");
    assertPaymentRequestStatusKnown(request);
    if (["created", "failed"].includes(request.providerIntent?.status)) return { paymentRequest: paymentRequestView(request), providerIntent: paymentRequestProviderIntentView(request), idempotentReplay: true };
    request.providerIntent = {
      ...(request.providerIntent || {}),
      provider: "razorpay",
      status: "recovery_required",
      providerStatus: String(input.providerStatus || "unknown").trim().toLowerCase(),
    };
    request.updatedAt = new Date().toISOString();
    return persistAndReturn({ paymentRequest: paymentRequestView(request), providerIntent: paymentRequestProviderIntentView(request) });
  }

  function markPaymentRequestProviderIntentRecoveryRequired(id, input = {}) {
    if (typeof persistenceAdapter.mutateState !== "function") return markPaymentRequestProviderIntentRecoveryRequiredLocal(id, input);
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.markPaymentRequestProviderIntentRecoveryRequiredLocal(id, input);
      return { result, state: transactionStore.exportState(), persist: !result?.idempotentReplay };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function recoverPaymentRequestProviderIntentLocal(id, input = {}) {
    const request = state.paymentRequests.find((entry) => entry.id === id);
    if (!request) return null;
    if (input.businessId && request.businessId !== input.businessId) throw new Error("Payment request was not found in this business.");
    assertPaymentRequestStatusKnown(request);
    if (!request.providerIntent || !["creating", "recovery_required"].includes(request.providerIntent.status)) {
      if (request.providerIntent?.status === "created") return { paymentRequest: paymentRequestView(request), providerIntent: paymentRequestProviderIntentView(request), idempotentReplay: true };
      throw new Error("Payment request is not awaiting provider recovery.");
    }
    try {
      return bindPaymentRequestProviderIntentLocal(id, {
        ...input,
        providerOrderId: input.providerOrderId || input.providerOrder?.id || "",
      });
    } catch (error) {
      request.providerIntent = {
        ...request.providerIntent,
        status: "recovery_required",
        providerStatus: "recovery_mismatch",
      };
      request.updatedAt = new Date().toISOString();
      return persistAndReturn({
        paymentRequest: paymentRequestView(request),
        providerIntent: paymentRequestProviderIntentView(request),
        recoveryRequired: true,
        recoveryError: error.message,
      });
    }
  }

  function recoverPaymentRequestProviderIntent(id, input = {}) {
    if (typeof persistenceAdapter.mutateState !== "function") return recoverPaymentRequestProviderIntentLocal(id, input);
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.recoverPaymentRequestProviderIntentLocal(id, input);
      return { result, state: transactionStore.exportState(), persist: !result?.idempotentReplay };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function receiptAccountingAuthorityForPayment(payment, business) {
    const event = state.financialEvents.find((entry) => (
      entry.businessId === business.id
      && entry.eventType === "customer_receipt_unapplied"
      && entry.sourceType === "payment"
      && entry.sourceId === payment.id
      && entry.postingStatus === "posted"
    ));
    if (!event) return null;
    const journal = state.accountingJournals.find((entry) => entry.id === event.journalId && entry.status === "posted");
    if (!journal || journal.businessId !== business.id) return null;
    const lines = state.accountingJournalLines.filter((line) => line.journalId === journal.id);
    const paymentMinor = Math.round(toNumber(payment.amount) * 100);
    const clearingDebit = lines
      .filter((line) => line.accountCode === "1110")
      .reduce((sum, line) => sum + Math.round(toNumber(line.debit) * 100), 0);
    const advanceCredit = lines
      .filter((line) => line.accountCode === "2110")
      .reduce((sum, line) => sum + Math.round(toNumber(line.credit) * 100), 0);
    if (clearingDebit !== paymentMinor || advanceCredit !== paymentMinor) return null;
    if (event.metadata?.customerId !== payment.customerId) return null;
    if (String(journal.currency || "INR").trim().toUpperCase() !== String(payment.currency || "INR").trim().toUpperCase()) return null;
    return { event, journal };
  }

  function bindPaymentRequestProviderIntent(id, input = {}) {
    if (typeof persistenceAdapter.mutateState !== "function") return bindPaymentRequestProviderIntentLocal(id, input);
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.bindPaymentRequestProviderIntentLocal(id, input);
      return { result, state: transactionStore.exportState(), persist: !result?.idempotentReplay };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function failPaymentRequestProviderIntentLocal(id, input = {}) {
    const request = state.paymentRequests.find((entry) => entry.id === id);
    if (!request) return null;
    if (input.businessId && request.businessId !== input.businessId) throw new Error("Payment request was not found in this business.");
    assertPaymentRequestStatusKnown(request);
    if (request.providerIntent?.status !== "creating") return { paymentRequest: paymentRequestView(request), providerIntent: paymentRequestProviderIntentView(request), idempotentReplay: true };
    request.providerIntent = { ...request.providerIntent, status: "failed", providerStatus: String(input.providerStatus || "failed").trim().toLowerCase() };
    request.updatedAt = new Date().toISOString();
    return persistAndReturn({ paymentRequest: paymentRequestView(request), providerIntent: paymentRequestProviderIntentView(request) });
  }

  function failPaymentRequestProviderIntent(id, input = {}) {
    if (typeof persistenceAdapter.mutateState !== "function") return failPaymentRequestProviderIntentLocal(id, input);
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.failPaymentRequestProviderIntentLocal(id, input);
      return { result, state: transactionStore.exportState(), persist: !result?.idempotentReplay };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function cancelPaymentRequestLocal(id, input = {}) {
    const request = state.paymentRequests.find((entry) => entry.id === id);
    if (!request) return null;
    if (input.businessId && request.businessId !== input.businessId) throw new Error("Payment request was not found in this business.");
    if (input.workspaceOwnerUserId && request.workspaceOwnerUserId !== input.workspaceOwnerUserId) throw new Error("Payment request was not found in this workspace.");
    const status = assertPaymentRequestStatusKnown(request);
    if (status === "completed") throw new Error("Completed payment requests are terminal and cannot be cancelled.");
    if (status === "cancelled" || status === "expired") return { paymentRequest: paymentRequestView(request), idempotentReplay: true };
    if (["creating", "created", "recovery_required"].includes(request.providerIntent?.status)) {
      throw new Error("Payment requests with a provider intent cannot be cancelled.");
    }
    const now = new Date().toISOString();
    request.status = "cancelled";
    request.cancelledAt = now;
    request.updatedAt = now;
    return persistAndReturn({ paymentRequest: paymentRequestView(request) });
  }

  function cancelPaymentRequest(id, input = {}) {
    if (typeof persistenceAdapter.mutateState !== "function") return cancelPaymentRequestLocal(id, input);
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.cancelPaymentRequestLocal(id, input);
      return { result, state: transactionStore.exportState(), persist: !result?.idempotentReplay };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function completePaymentRequestLocal(id, input = {}) {
    const request = state.paymentRequests.find((entry) => entry.id === id);
    if (!request) return null;
    if (input.businessId && request.businessId !== input.businessId) throw new Error("Payment request was not found in this business.");
    if (input.workspaceOwnerUserId && request.workspaceOwnerUserId !== input.workspaceOwnerUserId) throw new Error("Payment request was not found in this workspace.");
    const status = paymentRequestEffectiveStatus(request);
    const requestedPaymentId = String(input.paymentId || input.canonicalPaymentId || "").trim();
    const completedPaymentId = String(request.completedPaymentId || "").trim();
    if (status === "completed") {
      if (requestedPaymentId && completedPaymentId && requestedPaymentId !== completedPaymentId) {
        throw new Error("Completed PaymentRequest cannot be rebound to another Payment.");
      }
      if (input.providerPaymentId && request.completedProviderPaymentId
        && String(input.providerPaymentId).trim() !== String(request.completedProviderPaymentId).trim()) {
        throw new Error("Completed PaymentRequest cannot be rebound to another provider Payment.");
      }
      if (input.providerOrderId && request.completedProviderOrderId
        && String(input.providerOrderId).trim() !== String(request.completedProviderOrderId).trim()) {
        throw new Error("Completed PaymentRequest cannot be rebound to another provider Order.");
      }
      return { paymentRequest: paymentRequestView(request), idempotentReplay: true };
    }
    if (!requestedPaymentId) {
      throw new Error("Payment request completion requires a canonical Payment.");
    }
    if (input.verifiedPaymentEvidence !== true) {
      throw new Error("Payment request completion requires verified provider evidence.");
    }
    if (["cancelled"].includes(paymentRequestEffectiveStatus(request))) throw new Error("Payment request is terminal.");

    const payment = state.payments.find((entry) => entry.id === requestedPaymentId);
    if (!payment) throw new Error("Payment request completion requires a persisted canonical Payment.");
    const identity = paymentExternalProviderIdentity(payment);
    if (!identity) throw new Error("Payment request completion requires a complete external provider Payment identity.");
    if (identity.provider !== String(request.providerIntent?.provider || request.provider || identity.provider).trim().toLowerCase()) {
      throw new Error("Payment provider does not match the PaymentRequest provider lineage.");
    }
    // Completion must be authorized by the persisted canonical Payment status.
    // Do not use the status normalizer's fallback here: an absent/blank status
    // is not evidence that money was captured.
    const persistedPaymentStatus = String(payment.status ?? "").trim().toLowerCase();
    if (persistedPaymentStatus !== "captured") {
      throw new Error("Payment request completion requires an explicitly captured Payment.");
    }
    if (payment.invoiceId || payment.vendorBillId || !payment.customerId) {
      throw new Error("Payment request completion requires a customer receipt Payment.");
    }
    const invoice = state.invoices.find((entry) => entry.id === request.invoiceId);
    const business = findBusinessByIdOrLegacyOwner(request.businessId);
    if (!invoice || !business || invoice.businessId !== request.businessId || payment.businessId !== request.businessId) {
      throw new Error("Payment request completion Payment lineage does not match the business or Invoice.");
    }
    if (request.workspaceOwnerUserId && payment.ownerUserId !== request.workspaceOwnerUserId) {
      throw new Error("Payment request completion Payment lineage does not match the workspace.");
    }
    if (invoice.customerId && payment.customerId !== invoice.customerId) {
      throw new Error("Payment request completion Payment customer does not match the Invoice customer.");
    }
    const requestCurrency = String(request.currency || invoice.currency || "INR").trim().toUpperCase();
    if (String(payment.currency || "INR").trim().toUpperCase() !== requestCurrency
      || (invoice.currency && String(invoice.currency).trim().toUpperCase() !== requestCurrency)) {
      throw new Error("Payment request completion Payment currency does not match the authoritative currency.");
    }
    const requestOrderId = String(request.providerIntent?.providerOrderId || "").trim();
    if (requestOrderId && identity.providerOrderId !== requestOrderId) {
      throw new Error("Payment request completion Payment Order does not match the PaymentRequest provider Order.");
    }
    if (input.providerPaymentId && String(input.providerPaymentId).trim() !== identity.providerPaymentId) {
      throw new Error("Payment request completion provider Payment identity does not match the persisted Payment.");
    }
    if (input.providerOrderId && String(input.providerOrderId).trim() !== identity.providerOrderId) {
      throw new Error("Payment request completion provider Order identity does not match the persisted Payment.");
    }
    if (!receiptAccountingAuthorityForPayment(payment, business)) {
      throw new Error("Payment request completion requires successful receipt-first Customer Advance accounting.");
    }
    const now = new Date().toISOString();
    request.status = "completed";
    request.provider = identity.provider;
    request.providerReference = identity.providerPaymentId;
    request.completedPaymentId = payment.id;
    request.completedProviderPaymentId = identity.providerPaymentId;
    request.completedProviderOrderId = identity.providerOrderId || "";
    request.completionSource = "provider_payment";
    request.completedAt = now;
    request.updatedAt = now;
    return persistAndReturn({ paymentRequest: paymentRequestView(request) });
  }

  function completePaymentRequest(id, input = {}) {
    if (typeof persistenceAdapter.mutateState !== "function") return completePaymentRequestLocal(id, input);
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.completePaymentRequestLocal(id, input);
      return { result, state: transactionStore.exportState(), persist: !result?.idempotentReplay };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function completeVerifiedProviderPaymentAtomicLocal(input = {}) {
    if (input.verifiedPaymentEvidence !== true) throw new Error("Verified provider payment evidence is required.");
    const provider = String(input.provider || "").trim().toLowerCase();
    const providerPaymentId = String(input.providerPaymentId || "").trim();
    const providerOrderId = String(input.providerOrderId || "").trim();
    const paymentRequestId = String(input.paymentRequestId || "").trim();
    const status = String(input.status ?? "").trim().toLowerCase();
    if (!provider || !providerPaymentId || !paymentRequestId || (provider === "razorpay" && !providerOrderId)) throw new Error("Verified provider payment identity is incomplete.");
    if (status !== "captured") throw new Error("Verified provider payment must have an explicitly captured status.");
    const amountMinor = Number(input.amountMinor);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Verified provider payment amount is invalid.");
    const currency = String(input.currency || "INR").trim().toUpperCase();
    const request = state.paymentRequests.find((entry) => entry.id === paymentRequestId);
    if (!request) throw new Error("PaymentRequest was not found for verified provider payment.");
    if (input.businessId && request.businessId !== input.businessId) throw new Error("PaymentRequest business lineage does not match.");
    if (input.workspaceOwnerUserId && request.workspaceOwnerUserId !== input.workspaceOwnerUserId) throw new Error("PaymentRequest workspace lineage does not match.");
    const invoice = state.invoices.find((entry) => entry.id === request.invoiceId);
    const business = findBusinessByIdOrLegacyOwner(request.businessId);
    if (!invoice || !business || invoice.businessId !== request.businessId) throw new Error("Verified provider payment Invoice or business lineage is invalid.");
    if (input.invoiceId && input.invoiceId !== invoice.id) throw new Error("Verified provider payment Invoice lineage does not match.");
    if (invoice.customerId && input.customerId && invoice.customerId !== input.customerId) throw new Error("Verified provider payment customer lineage does not match.");
    if (String(request.currency || invoice.currency || "INR").trim().toUpperCase() !== currency
      || (invoice.currency && String(invoice.currency).trim().toUpperCase() !== currency)) throw new Error("Verified provider payment currency does not match the PaymentRequest Invoice.");
    if (amountMinor !== Math.round(toNumber(request.requestedAmount) * 100)) throw new Error("Verified provider payment amount does not match the PaymentRequest.");
    const requestProvider = String(request.providerIntent?.provider || request.provider || provider).trim().toLowerCase();
    if (requestProvider !== provider) throw new Error("Verified provider does not match the PaymentRequest.");
    const requestOrderId = String(request.providerIntent?.providerOrderId || "").trim();
    if (requestOrderId && requestOrderId !== providerOrderId) throw new Error("Verified provider Order does not match the PaymentRequest.");
    const identity = { provider, providerPaymentId, providerOrderId };
    const paymentInput = {
      provider, providerPaymentId, providerOrderId, amount: amountMinor / 100, currency, status: "captured", direction: "customer",
      customerId: invoice.customerId, businessId: business.id,
      workspaceOwnerUserId: request.workspaceOwnerUserId || business.ownerUserId || "",
    };
    let payment = findPaymentByExternalProviderIdentity(identity, business.id);
    let receiptResult;
    if (payment) {
      assertExternalProviderPaymentCompatible(payment, paymentInput, identity, "");
      if (payment.businessId !== business.id || payment.customerId !== invoice.customerId || payment.invoiceId || payment.vendorBillId) throw new Error("Verified provider Payment is bound to incompatible financial lineage.");
      const existingIdentity = paymentExternalProviderIdentity(payment);
      if (!existingIdentity?.providerOrderId || existingIdentity.providerOrderId !== providerOrderId) throw new Error("Verified provider Payment Order identity is incomplete or conflicting.");
    } else {
      receiptResult = recordCustomerReceiptLocal({
        ...paymentInput, customerId: invoice.customerId, businessId: business.id,
        workspaceOwnerUserId: request.workspaceOwnerUserId || business.ownerUserId || "",
        mode: "payment_gateway", reference: providerPaymentId, notes: "Verified Razorpay PaymentRequest payment",
      });
      payment = receiptResult.payment;
    }
    if (String(payment.status ?? "").trim().toLowerCase() !== "captured") throw new Error("Verified provider Payment is not explicitly captured.");
    if (!receiptAccountingAuthorityForPayment(payment, business)) throw new Error("Verified provider Payment has no valid receipt-first accounting authority.");

    const existingAllocation = state.paymentAllocations.find((allocation) => (
      allocation.paymentId === payment.id && allocation.documentType === "INVOICE" && allocation.documentId === invoice.id
      && normalizeRecordStatus(allocation.status, "active") === "active"
    ));
    let allocationResult = existingAllocation ? { allocation: clone(existingAllocation), idempotentReplay: true } : null;
    if (!existingAllocation) {
      const availableMinor = paymentAvailableMinor(payment);
      const outstandingMinor = invoiceOutstandingMinor(invoice);
      const allocationMinor = Math.min(availableMinor, outstandingMinor);
      if (allocationMinor > 0) {
        allocationResult = createPaymentAllocationLocal({
          paymentId: payment.id, documentType: "INVOICE", documentId: invoice.id,
          allocatedAmount: allocationMinor / 100, currency,
          idempotencyKey: `pay-atomic:${provider}:${providerPaymentId}:${invoice.id}`,
          businessId: business.id, workspaceOwnerUserId: request.workspaceOwnerUserId || business.ownerUserId || "",
        });
      }
    }

    const requestCompleted = normalizeRecordStatus(request.status, "active") === "completed";
    let completionResult;
    if (requestCompleted) {
      if (request.completedPaymentId && request.completedPaymentId !== payment.id) completionResult = { paymentRequest: paymentRequestView(request), preservedCompletion: true };
      else completionResult = { paymentRequest: paymentRequestView(request), idempotentReplay: true };
    } else {
      completionResult = completePaymentRequestLocal(request.id, {
        paymentId: payment.id, providerPaymentId, providerOrderId, verifiedPaymentEvidence: true,
        businessId: business.id, workspaceOwnerUserId: request.workspaceOwnerUserId || business.ownerUserId || "",
      });
    }
    return {
      payment,
      receiptAccounting: receiptResult?.receiptAccounting || receiptAccountingAuthorityForPayment(payment, business),
      allocation: allocationResult?.allocation || null,
      paymentRequest: completionResult.paymentRequest,
      ...(completionResult.idempotentReplay ? { idempotentReplay: true } : {}),
      ...(completionResult.preservedCompletion ? { preservedCompletion: true } : {}),
    };
  }

  function completeVerifiedProviderPaymentAtomic(input = {}) {
    if (typeof persistenceAdapter.mutateState !== "function") return completeVerifiedProviderPaymentAtomicLocal(input);
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.completeVerifiedProviderPaymentAtomic(input);
      return { result, state: transactionStore.exportState(), persist: true };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function normalizeExternalProvider(value) {
    const provider = String(value || "").trim().toLowerCase();
    return provider && !["manual", "cash", "bank_transfer", "bank-transfer", "upi_manual"].includes(provider)
      ? provider
      : "";
  }

  function externalProviderPaymentIdentity(input = {}) {
    const canonicalProvider = String(input.provider ?? "").trim().toLowerCase();
    const legacyProvider = String(input.gateway ?? "").trim().toLowerCase();
    const provider = normalizeExternalProvider(canonicalProvider || legacyProvider);
    const canonicalPaymentId = String(input.providerPaymentId ?? "").trim();
    const legacyPaymentId = String(input.gatewayPaymentId ?? input.razorpay_payment_id ?? input.paymentId ?? "").trim();
    const canonicalOrderId = String(input.providerOrderId ?? "").trim();
    const legacyOrderId = String(input.gatewayOrderId ?? input.razorpay_order_id ?? input.orderId ?? "").trim();
    const hasExternalSignal = Boolean(
      provider
      || canonicalPaymentId
      || legacyPaymentId
      || canonicalOrderId
      || legacyOrderId
      || (canonicalProvider && !["manual", "cash", "bank_transfer", "bank-transfer", "upi_manual"].includes(canonicalProvider))
      || (legacyProvider && !["manual", "cash", "bank_transfer", "bank-transfer", "upi_manual"].includes(legacyProvider)),
    );
    if (!hasExternalSignal) return null;
    if (canonicalProvider && legacyProvider && normalizeExternalProvider(canonicalProvider) !== normalizeExternalProvider(legacyProvider)) {
      throw new Error("Canonical and legacy provider identities conflict.");
    }
    if (canonicalPaymentId && legacyPaymentId && canonicalPaymentId !== legacyPaymentId) {
      throw new Error("Canonical and legacy provider Payment identities conflict.");
    }
    if (canonicalOrderId && legacyOrderId && canonicalOrderId !== legacyOrderId) {
      throw new Error("Canonical and legacy provider Order identities conflict.");
    }
    if (!provider || !canonicalPaymentId && !legacyPaymentId) {
      throw new Error("External provider Payment identity is incomplete.");
    }
    return {
      provider,
      providerPaymentId: canonicalPaymentId || legacyPaymentId,
      providerOrderId: canonicalOrderId || legacyOrderId,
    };
  }

  function paymentExternalProviderIdentity(payment = {}) {
    return externalProviderPaymentIdentity({
      provider: payment.provider,
      gateway: payment.gateway,
      providerPaymentId: payment.providerPaymentId,
      gatewayPaymentId: payment.gatewayPaymentId,
      providerOrderId: payment.providerOrderId,
      gatewayOrderId: payment.gatewayOrderId,
    });
  }

  function findPaymentByExternalProviderIdentity(identity, businessId) {
    if (!identity || !businessId) return null;
    const matches = state.payments.filter((payment) => {
      if (payment.businessId !== businessId) return false;
      const paymentIdentity = paymentExternalProviderIdentity(payment);
      return paymentIdentity
        && paymentIdentity.provider === identity.provider
        && paymentIdentity.providerPaymentId === identity.providerPaymentId;
    });
    if (matches.length > 1) {
      throw new Error("External provider Payment identity is duplicated in authoritative state.");
    }
    return matches[0] || null;
  }

  function assertExternalProviderPaymentCompatible(existingPayment, input, identity, invoiceId) {
    const existingIdentity = paymentExternalProviderIdentity(existingPayment);
    if (!existingIdentity
      || existingIdentity.provider !== identity.provider
      || existingIdentity.providerPaymentId !== identity.providerPaymentId) {
      throw new Error("External provider Payment identity conflicts with existing Payment.");
    }
    const inputAmount = Math.round(toNumber(input.amount) * 100);
    const existingAmount = Math.round(toNumber(existingPayment.amount) * 100);
    if (Number.isFinite(inputAmount) && input.amount !== undefined && inputAmount !== existingAmount) {
      throw new Error("External provider Payment identity conflicts with existing Payment amount.");
    }
    const inputCurrency = String(input.currency || "").trim().toUpperCase();
    const existingCurrency = String(existingPayment.currency || "").trim().toUpperCase();
    if (inputCurrency && existingCurrency && inputCurrency !== existingCurrency) {
      throw new Error("External provider Payment identity conflicts with existing Payment currency.");
    }
    const inputOrderId = identity.providerOrderId;
    if (inputOrderId && existingIdentity.providerOrderId && inputOrderId !== existingIdentity.providerOrderId) {
      throw new Error("External provider Payment identity conflicts with existing provider order.");
    }
    if (existingPayment.invoiceId && existingPayment.invoiceId !== invoiceId) {
      throw new Error("External provider Payment identity is already bound to another invoice.");
    }
    if (input.direction && String(input.direction).trim().toLowerCase() !== "customer") {
      throw new Error("External provider Payment direction is incompatible with an invoice payment.");
    }
  }

  function recordInvoicePaymentLocal(invoiceId, input = {}) {
    const invoice = state.invoices.find((entry) => entry.id === invoiceId);
    if (!invoice) return null;
    if (input.businessId && invoice.businessId && input.businessId !== invoice.businessId) {
      throw new Error("Payment business does not match invoice business.");
    }
    const externalIdentity = externalProviderPaymentIdentity(input);
    const businessId = invoice.businessId || ensureBusinessForOwner(invoice.ownerUserId)?.id || null;
    const existingExternalPayment = externalIdentity
      ? findPaymentByExternalProviderIdentity(externalIdentity, businessId)
      : null;
    if (existingExternalPayment) {
      assertExternalProviderPaymentCompatible(existingExternalPayment, input, externalIdentity, invoiceId);
      refreshInvoicePaymentStatus(invoice);
      return clone({ invoice, payment: existingExternalPayment, idempotentReplay: true });
    }
    assertInvoiceCanReceivePayment(invoice);
    const idempotencyKey = paymentIdempotencyKey(input);
    const existingPayment = idempotencyKey ? state.payments.find((payment) => (
      payment.invoiceId === invoiceId
      && payment.idempotencyKey === idempotencyKey
    )) : null;
    if (existingPayment) {
      if (externalIdentity) {
        const existingIdentity = paymentExternalProviderIdentity(existingPayment);
        if (!existingIdentity) {
          throw new Error("External provider Payment identity conflicts with an existing non-provider Payment.");
        }
        assertExternalProviderPaymentCompatible(existingPayment, input, externalIdentity, invoiceId);
      }
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
    if (Math.round(toNumber(amount) * 100) > invoiceOutstandingMinor(invoice)) {
      throw new Error("Payment amount cannot be more than the invoice's collectible outstanding balance.");
    }
    const payment = {
      id: nextId("pay", ++state.counters.payment),
      ownerUserId: invoice.ownerUserId,
      businessId,
      invoiceId,
      customerId: invoice.customerId || "",
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
      ...(externalIdentity ? {
        provider: externalIdentity.provider,
        providerPaymentId: externalIdentity.providerPaymentId,
        providerOrderId: externalIdentity.providerOrderId,
      } : {}),
      paymentDate: input.paymentDate?.trim() || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    };
    const postingBusiness = invoice.businessId ? findBusinessByIdOrLegacyOwner(invoice.businessId) : null;
    if (postingBusiness) validateAccountingPosting(postingBusiness, payment.paymentDate, { ...input, sourceType: "payment", sourceId: payment.id });
    state.payments.push(payment);
    if (invoice) refreshInvoicePaymentStatus(invoice);
    if (postingBusiness) postPaymentCaptured(state, payment, invoice, postingBusiness);
    return persistAndReturn(clone({ invoice, payment }));
  }

  function recordInvoicePayment(invoiceId, input = {}) {
    if (!externalProviderPaymentIdentity(input) || typeof persistenceAdapter.mutateState !== "function") {
      return recordInvoicePaymentLocal(invoiceId, input);
    }
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.recordInvoicePaymentLocal(invoiceId, input);
      return { result, state: transactionStore.exportState(), persist: !result?.idempotentReplay };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function recordCustomerReceiptLocal(input = {}) {
    const customerId = String(input.customerId || "").trim();
    if (!customerId) throw new Error("Customer is required for an unapplied customer receipt.");
    const customer = state.customers.find((entry) => entry.id === customerId);
    if (!customer) throw new Error("Customer was not found.");
    const business = findBusinessByIdOrLegacyOwner(input.businessId || customer.businessId);
    if (!business || customer.businessId !== business.id) {
      throw new Error("Customer receipt business does not match the customer business.");
    }
    const amountMinor = Math.round(toNumber(input.amount) * 100);
    if (amountMinor <= 0) throw new Error("Customer receipt amount must be greater than zero.");
    const currency = String(input.currency || "INR").trim().toUpperCase();
    const externalIdentity = externalProviderPaymentIdentity(input);
    const idempotencyKey = paymentIdempotencyKey(input);
    const matchesInput = (payment) => payment
      && !payment.invoiceId
      && !payment.vendorBillId
      && payment.businessId === business.id
      && payment.customerId === customer.id
      && Math.round(toNumber(payment.amount) * 100) === amountMinor
      && String(payment.currency || "INR").trim().toUpperCase() === currency;

    const existingExternalPayment = externalIdentity
      ? findPaymentByExternalProviderIdentity(externalIdentity, business.id)
      : null;
    if (existingExternalPayment) {
      if (!matchesInput(existingExternalPayment)) {
        throw new Error("External provider Payment identity is already bound to a different Payment lineage.");
      }
      assertExternalProviderPaymentCompatible(existingExternalPayment, input, externalIdentity, "");
      return clone({ payment: existingExternalPayment, idempotentReplay: true });
    }

    const existingPayment = idempotencyKey ? state.payments.find((payment) => (
      payment.businessId === business.id && payment.idempotencyKey === idempotencyKey
    )) : null;
    if (existingPayment) {
      if (!matchesInput(existingPayment)) {
        throw new Error("Payment idempotency key was already used for a different receipt.");
      }
      if (externalIdentity) assertExternalProviderPaymentCompatible(existingPayment, input, externalIdentity, "");
      return clone({ payment: existingPayment, idempotentReplay: true });
    }

    const now = new Date().toISOString();
    const payment = {
      id: nextId("pay", ++state.counters.payment),
      ownerUserId: input.workspaceOwnerUserId || input.ownerUserId || customer.ownerUserId || business.ownerUserId,
      businessId: business.id,
      invoiceId: "",
      vendorBillId: "",
      customerId: customer.id,
      idempotencyKey,
      amount: amountMinor / 100,
      currency,
      direction: "customer",
      paymentType: "customer_receipt",
      accountingTreatment: "receipt_first",
      mode: String(input.mode || "manual").trim(),
      reference: String(input.reference || "").trim(),
      notes: String(input.notes || "").trim(),
      status: String(input.status || "captured").trim(),
      gateway: String(input.gateway || input.provider || "").trim(),
      gatewayPaymentId: String(input.gatewayPaymentId || input.providerPaymentId || "").trim(),
      gatewayOrderId: String(input.gatewayOrderId || input.providerOrderId || "").trim(),
      ...(externalIdentity ? {
        provider: externalIdentity.provider,
        providerPaymentId: externalIdentity.providerPaymentId,
        providerOrderId: externalIdentity.providerOrderId,
      } : {}),
      paymentDate: String(input.paymentDate || new Date().toISOString().slice(0, 10)).trim(),
      createdAt: now,
    };
    validateAccountingPosting(business, payment.paymentDate, { ...input, sourceType: "payment", sourceId: payment.id });
    const receiptStateBeforeAccounting = clone(state);
    state.payments.push(payment);
    let receiptAccounting;
    try {
      receiptAccounting = postCustomerReceiptUnapplied(state, payment, business, input);
      if (!receiptAccounting?.posted) {
        throw new Error(receiptAccounting?.error || "Customer receipt accounting failed.");
      }
    } catch (error) {
      applyAuthoritativeState(receiptStateBeforeAccounting);
      throw error;
    }
    return persistAndReturn(clone({ payment, receiptAccounting }));
  }

  function recordCustomerReceipt(input = {}) {
    if (typeof persistenceAdapter.mutateState !== "function") return recordCustomerReceiptLocal(input);
    return persistenceAdapter.mutateState((authoritativeState) => {
      const transactionStore = createStore(authoritativeState, { persist: false, useSupabaseEmailOtp: false });
      const result = transactionStore.recordCustomerReceiptLocal(input);
      return { result, state: transactionStore.exportState(), persist: !result?.idempotentReplay };
    }).then((outcome) => {
      if (outcome.state) applyAuthoritativeState(outcome.state);
      return outcome.result;
    });
  }

  function recordPurchaseOrderPayment(purchaseOrderId, input = {}) {
    const purchaseOrder = state.purchaseOrders.find((entry) => entry.id === purchaseOrderId);
    if (!purchaseOrder) return null;
    throw new Error("PO/WO payment recording is disabled. Use vendor bills for payables, or a controlled advance-payment workflow when it is formally implemented.");
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
    const business = findBusinessByIdOrLegacyOwner(vendorBill.businessId);
    if (business) validateAccountingPosting(business, payment.paymentDate, { ...input, sourceType: "vendor_payment", sourceId: payment.id });
    state.payments.push(payment);
    refreshVendorBillPaymentStatus(vendorBill);
    if (business) postVendorPaymentCaptured(state, payment, vendorBill, business);
    return persistAndReturn(clone({ vendorBill, payment }));
  }

  function createInvoicePaymentLink(invoiceId, input = {}) {
    const invoice = state.invoices.find((entry) => entry.id === invoiceId);
    if (!invoice) return null;
    assertInvoiceCanReceivePayment(invoice);
    const outstandingMinor = invoiceOutstandingMinor(invoice);
    const requestedMinor = input.amount === undefined || input.amount === null
      ? outstandingMinor
      : Math.round(toNumber(input.amount) * 100);
    if (requestedMinor <= 0 || requestedMinor > outstandingMinor) {
      throw new Error("Payment link amount cannot exceed the invoice's collectible outstanding balance.");
    }
    const linkId = `plink_${invoice.id}_${Date.now()}`;
    invoice.paymentGateway = input.gateway?.trim() || "razorpay";
    invoice.paymentLink = {
      id: linkId,
      provider: invoice.paymentGateway,
      status: "created",
      amount: fromMinor(requestedMinor),
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
      amount: input.amount ?? invoice.paymentLink?.amount ?? fromMinor(invoiceOutstandingMinor(invoice)),
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
    const directPayments = state.payments
      .filter((payment) => payment.invoiceId === invoiceId)
      .map((payment) => ({
        ...payment,
        amount: fromMinor(Math.max(0, Math.round(toNumber(payment.amount) * 100) - reversedMinorForPayment(payment.id, "customer"))),
      }));
    const allocatedPayments = state.paymentAllocations
      .filter((allocation) => allocation.documentType === "INVOICE"
        && allocation.documentId === invoiceId
        && normalizeRecordStatus(allocation.status, "active") === "active")
      .map((allocation) => {
        const payment = state.payments.find((entry) => entry.id === allocation.paymentId);
        if (!payment || payment.invoiceId || payment.vendorBillId) return null;
        return {
          ...payment,
          id: `${payment.id}:allocation:${allocation.id}`,
          amount: fromMinor(Math.min(
            Math.round(toNumber(allocation.allocatedAmount) * 100),
            paymentAvailableMinor(payment) + Math.round(toNumber(allocation.allocatedAmount) * 100),
          )),
        };
      })
      .filter(Boolean);
    return [...directPayments, ...allocatedPayments];
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
    if (!payment) throw new Error("Original customer payment is required for reversal.");
    const receiptFirst = !payment.invoiceId && Boolean(payment.customerId);
    if (!payment.invoiceId && !receiptFirst) throw new Error("Original customer payment is required for reversal.");
    const invoice = payment.invoiceId ? state.invoices.find((entry) => entry.id === payment.invoiceId) : null;
    const business = findBusinessByIdOrLegacyOwner(input.businessId || payment.businessId);
    if (!business || payment.businessId !== business.id || (invoice && invoice.businessId !== business.id)) throw new Error("Payment reversal business does not match source payment.");
    if (receiptFirst && !state.financialEvents.some((entry) => entry.eventType === "customer_receipt_unapplied" && entry.sourceType === "payment" && entry.sourceId === payment.id && entry.postingStatus === "posted")) {
      throw new Error("Receipt-first Customer Advance authority is required before receipt reversal.");
    }
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    if (idempotencyKey) {
      const existing = state.paymentReversals.find((reversal) => reversal.businessId === business.id && reversal.idempotencyKey === idempotencyKey);
      if (existing) {
        const sameRequest = existing.originalPaymentId === payment.id
          && (input.amount === undefined || Math.round(toNumber(existing.amount) * 100) === Math.round(toNumber(input.amount) * 100))
          && String(existing.currency || "INR").toUpperCase() === String(input.currency || payment.currency || invoice?.currency || "INR").toUpperCase();
        if (!sameRequest) throw new Error("Payment reversal idempotency key was already used for a different request.");
        return clone(existing);
      }
    }
    const remainingMinor = receiptFirst
      ? paymentAvailableMinor(payment)
      : Math.round(toNumber(payment.amount) * 100) - reversedMinorForPayment(payment.id, "customer");
    const amountMinor = input.amount === undefined ? remainingMinor : Math.round(toNumber(input.amount) * 100);
    if (amountMinor <= 0) throw new Error("Enter a valid payment reversal amount.");
    if (amountMinor > remainingMinor) throw new Error("Payment reversal amount cannot exceed unreversed payment amount.");
    const { journal, event } = sourceJournalAndEvent("payment", payment.id);
    const reversal = {
      id: nextId("prev", ++state.counters.paymentReversal),
      ownerUserId: payment.ownerUserId,
      businessId: business.id,
      originalPaymentId: payment.id,
      invoiceId: invoice?.id || "",
      paymentDirection: "customer_payment",
      amount: fromMinor(amountMinor),
      currency: input.currency?.trim() || payment.currency || invoice?.currency || "INR",
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
    if (reversal.status === "posted") validateAccountingPosting(business, reversal.reversalDate, { ...input, sourceType: "customer_payment_reversal", sourceId: reversal.id });
    state.paymentReversals.push(reversal);
    if (reversal.status === "posted") {
      const result = receiptFirst
        ? postCustomerReceiptReversed(state, reversal, payment, business, { lineage: { journal, event } })
        : postCustomerPaymentReversed(state, reversal, payment, invoice, business, { lineage: { journal, event } });
      reversal.financialEventId = result.event?.id || "";
      reversal.journalId = result.journal?.id || result.event?.journalId || "";
    }
    refreshPaymentReversalState(payment, "customer");
    if (invoice) refreshInvoicePaymentStatus(invoice);
    return persistAndReturn(clone(reversal));
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
    if (reversal.status === "posted") validateAccountingPosting(business, reversal.reversalDate, { ...input, sourceType: "vendor_payment_reversal", sourceId: reversal.id });
    state.vendorPaymentReversals.push(reversal);
    if (reversal.status === "posted") {
      const result = postVendorPaymentReversed(state, reversal, payment, bill, business, { lineage: { journal, event } });
      reversal.financialEventId = result.event?.id || "";
      reversal.journalId = result.journal?.id || result.event?.journalId || "";
    }
    refreshPaymentReversalState(payment, "vendor");
    refreshVendorBillPaymentStatus(bill);
    return persistAndReturn(clone(reversal));
  }

  function createCustomerRefund(input = {}) {
    const creditNote = state.creditNotes.find((entry) => entry.id === input.sourceCreditNoteId || entry.id === input.creditNoteId);
    if (!creditNote || normalizeRecordStatus(creditNote.status, "draft") === "draft") throw new Error("Posted source credit note is required for customer refund.");
    const invoice = state.invoices.find((entry) => entry.id === creditNote.sourceInvoiceId);
    const sourcePayment = input.sourcePaymentId ? state.payments.find((entry) => entry.id === input.sourcePaymentId) : null;
    const receiptFirstRefund = Boolean(sourcePayment && !sourcePayment.invoiceId && sourcePayment.customerId);
    const customer = state.customers.find((entry) => entry.id === (input.customerId || creditNote.customerId));
    const business = findBusinessByIdOrLegacyOwner(input.businessId || creditNote.businessId);
    if (!invoice || !business || creditNote.businessId !== business.id || invoice.businessId !== business.id) throw new Error("Customer refund business does not match source credit note.");
    if (customer && customer.businessId && customer.businessId !== business.id) throw new Error("Customer does not belong to this business.");
    if (receiptFirstRefund && (sourcePayment.businessId !== business.id || sourcePayment.customerId !== customer?.id)) throw new Error("Customer refund does not match the receipt customer or business.");
    if (receiptFirstRefund && !state.financialEvents.some((entry) => entry.eventType === "customer_receipt_unapplied" && entry.sourceType === "payment" && entry.sourceId === sourcePayment.id && entry.postingStatus === "posted")) {
      throw new Error("Receipt-first Customer Advance authority is required before receipt refund.");
    }
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    if (idempotencyKey) {
      const existing = state.customerRefunds.find((refund) => refund.businessId === business.id && refund.idempotencyKey === idempotencyKey);
      if (existing) {
        const sameRequest = existing.sourceCreditNoteId === creditNote.id
          && (!input.sourcePaymentId || existing.sourcePaymentId === input.sourcePaymentId)
          && (input.amount === undefined || Math.round(toNumber(existing.amount) * 100) === Math.round(toNumber(input.amount) * 100))
          && String(existing.currency || "INR").toUpperCase() === String(input.currency || creditNote.currency || invoice.currency || "INR").toUpperCase()
          && (!input.customerId || existing.customerId === input.customerId);
        if (!sameRequest) throw new Error("Customer refund idempotency key was already used for a different request.");
        return clone(existing);
      }
    }
    const amountMinor = Math.round(toNumber(input.amount) * 100);
    if (amountMinor <= 0) throw new Error("Enter a valid customer refund amount.");
    const availableMinor = receiptFirstRefund ? paymentAvailableMinor(sourcePayment) : refundableCustomerCreditMinor(creditNote);
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
    if (refund.status === "processed") validateAccountingPosting(business, refund.refundDate, { ...input, sourceType: "customer_refund", sourceId: refund.id });
    state.customerRefunds.push(refund);
    if (refund.status === "processed") {
      const result = receiptFirstRefund
        ? postCustomerReceiptRefunded(state, refund, sourcePayment, business, { lineage: { journal, event } })
        : postCustomerRefundProcessed(state, refund, creditNote, business, { lineage: { journal, event } });
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
    if (refund.status === "received") validateAccountingPosting(business, refund.receivedDate, { ...input, sourceType: "vendor_refund", sourceId: refund.id });
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

  function validateAccountingPosting(business, accountingDate, input = {}) {
    return validatePostingPeriod(state, business, accountingDate, {
      actorUserId: input.actorUserId || input.createdByUserId || business.ownerUserId || "",
      overrideReason: input.periodOverrideReason || input.overrideReason || "",
      sourceType: input.sourceType || "",
      sourceId: input.sourceId || "",
    });
  }

  function getOrCreateAccountingPeriod(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for accounting period.");
    const period = ensureAccountingPeriod(state, business, input.accountingDate || input.date || input.periodStartDate || new Date().toISOString().slice(0, 10), input);
    persist();
    return clone(period);
  }

  function listAccountingPeriodsForUser(user, businessId = "") {
    return clone(state.accountingPeriods.filter((period) => (
      (!businessId || period.businessId === businessId)
      && (!user || user.role === "admin" || period.ownerUserId === user.id)
    )));
  }

  function periodReadiness(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for period readiness.");
    const period = ensureAccountingPeriod(state, business, input.accountingDate || input.date || input.periodStartDate || new Date().toISOString().slice(0, 10), input);
    const periodFilter = (date) => {
      const value = String(date || "").slice(0, 10);
      return value >= period.startDate && value <= period.endDate;
    };
    const blockers = [];
    const warnings = [];
    const journals = state.accountingJournals.filter((journal) => journal.businessId === business.id && journal.status === "posted" && periodFilter(journal.journalDate || journal.createdAt));
    const lines = state.accountingJournalLines.filter((line) => line.businessId === business.id && journals.some((journal) => journal.id === line.journalId));
    const debitMinor = lines.reduce((sum, line) => sum + Math.round(toNumber(line.debit) * 100), 0);
    const creditMinor = lines.reduce((sum, line) => sum + Math.round(toNumber(line.credit) * 100), 0);
    if (debitMinor !== creditMinor) blockers.push({ code: "trial_balance_imbalance", severity: "blocking", difference: fromMinor(debitMinor - creditMinor) });
    state.financialEvents
      .filter((event) => event.businessId === business.id && ["failed", "pending"].includes(String(event.postingStatus || "")) && periodFilter(event.eventTimestamp || event.createdAt))
      .forEach((event) => blockers.push({ code: `financial_event_${event.postingStatus}`, severity: "blocking", sourceType: event.sourceType, sourceId: event.sourceId }));
    const reconciliation = reconcileAccountingPostings(state, business.id);
    if ((reconciliation.failedEvents || []).length) blockers.push({ code: "failed_accounting_events", severity: "blocking", count: reconciliation.failedEvents.length });
    if ((reconciliation.duplicateJournalSources || []).length) blockers.push({ code: "duplicate_journal_sources", severity: "blocking", count: reconciliation.duplicateJournalSources.length });
    state.bankAccounts
      .filter((account) => account.businessId === business.id)
      .forEach((account) => {
        const summary = calculateBankReconciliationSummary(state, account, { from: period.startDate, to: period.endDate });
        if (summary.status !== "reconciled") warnings.push({ code: "bank_reconciliation_exception", severity: "warning", bankAccountId: account.id, status: summary.status });
      });
    const compliance = buildComplianceReadiness(state, business, { from: period.startDate, to: period.endDate });
    if (compliance.status !== "ready") warnings.push({ code: "compliance_readiness_not_ready", severity: "warning", status: compliance.status, issueCount: compliance.issues.length });
    return {
      businessId: business.id,
      period,
      status: blockers.length ? "blocked" : warnings.length ? "warning" : "ready",
      blockers,
      warnings,
      informational: [{ code: "period_close_is_governance_only", severity: "informational" }],
      generatedAt: new Date().toISOString(),
    };
  }

  function changeAccountingPeriodStatus(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for accounting period.");
    const period = ensureAccountingPeriod(state, business, input.accountingDate || input.date || input.periodStartDate || new Date().toISOString().slice(0, 10), input);
    const readiness = periodReadiness({ businessId: business.id, accountingDate: period.startDate });
    const action = String(input.action || "").trim();
    if (action === "close" && readiness.blockers.length) throw new Error("Accounting period has blocking readiness issues.");
    const updated = transitionAccountingPeriod(period, action, {
      actorUserId: input.actorUserId || "",
      reason: input.reason || input.notes || "",
      readinessStatus: readiness.status,
    });
    state.accountingPeriodHistory.push({
      id: nextId("aph", ++state.counters.accountingPeriodHistory),
      businessId: business.id,
      accountingPeriodId: period.id,
      action,
      previousStatus: period.closeHistory.at(-1)?.previousStatus || "",
      nextStatus: period.status,
      actorUserId: input.actorUserId || "",
      reason: input.reason || input.notes || "",
      readinessStatus: readiness.status,
      createdAt: new Date().toISOString(),
    });
    persist();
    return { period: updated, readiness };
  }

  function createOpeningBalanceSet(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for opening balances.");
    const cutoverDate = validateAccountingDate(input.cutoverDate || input.effectiveDate || input.accountingDate || new Date().toISOString().slice(0, 10), "cutoverDate");
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    if (idempotencyKey) {
      const existing = state.openingBalanceSets.find((set) => set.businessId === business.id && set.idempotencyKey === idempotencyKey);
      if (existing) return clone(existing);
    }
    const duplicate = state.openingBalanceSets.find((set) => set.businessId === business.id && set.cutoverDate === cutoverDate && set.status !== "reversed");
    if (duplicate) throw new Error("Opening balance set already exists for this cutover date.");
    validateAccountingPosting(business, cutoverDate, { ...input, sourceType: "opening_balance" });
    const accounts = ensureDefaultAccountingAccounts(state, business, business.ownerUserId);
    const lines = (Array.isArray(input.lines) ? input.lines : []).map((line) => {
      const account = state.ledgerAccounts.find((entry) => entry.id === line.accountId || (entry.businessId === business.id && entry.accountCode === line.accountCode));
      if (!account || account.businessId !== business.id) throw new Error("Ledger account does not belong to this business.");
      return {
        account,
        debit: toNumber(line.debit),
        credit: toNumber(line.credit),
        description: String(line.description || "Opening balance").trim(),
      };
    });
    if (!lines.length) throw new Error("Opening balance lines are required.");
    const totals = validateBalancedJournal(lines);
    const set = {
      id: nextId("obs", ++state.counters.openingBalanceSet),
      businessId: business.id,
      ownerUserId: business.ownerUserId,
      cutoverDate,
      status: "posted",
      idempotencyKey,
      notes: String(input.notes || "").trim(),
      immutable: true,
      createdByUserId: input.actorUserId || input.createdByUserId || "",
      journalId: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.openingBalanceSets.push(set);
    const journal = {
      id: nextId("ob", ++state.counters.accountingJournal),
      businessId: business.id,
      ownerUserId: business.ownerUserId,
      journalNumber: input.journalNumber || `OB-${String(state.counters.accountingJournal).padStart(4, "0")}`,
      journalDate: cutoverDate,
      narration: String(input.narration || "Opening balance journal").trim(),
      status: "posted",
      sourceType: "opening_balance",
      sourceId: set.id,
      financialEventId: "",
      postingRule: "opening_balance",
      postingRuleVersion: "1",
      automatic: false,
      immutable: true,
      currency: input.currency || "INR",
      totalDebit: totals.totalDebit,
      totalCredit: totals.totalCredit,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    set.journalId = journal.id;
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
    const detailInputs = [
      ...(input.openingReceivables || []).map((entry) => ({ ...entry, detailType: "receivable" })),
      ...(input.openingPayables || []).map((entry) => ({ ...entry, detailType: "payable" })),
    ];
    detailInputs.forEach((detail) => {
      state.openingBalanceDetails.push({
        id: nextId("obd", ++state.counters.openingBalanceDetail),
        businessId: business.id,
        ownerUserId: business.ownerUserId,
        openingBalanceSetId: set.id,
        detailType: detail.detailType,
        customerId: detail.customerId || "",
        vendorId: detail.vendorId || "",
        amount: toNumber(detail.amount),
        dueDate: detail.dueDate || "",
        reference: String(detail.reference || "").trim(),
        status: "open",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
    state.accountingPeriodHistory.push({
      id: nextId("aph", ++state.counters.accountingPeriodHistory),
      businessId: business.id,
      accountingPeriodId: ensureAccountingPeriod(state, business, cutoverDate).id,
      action: "opening_balance_posted",
      previousStatus: "",
      nextStatus: "posted",
      actorUserId: input.actorUserId || "",
      reason: input.reason || input.notes || "Opening balance posted",
      readinessStatus: "",
      createdAt: new Date().toISOString(),
    });
    persist();
    return clone({ ...set, journal: publicJournalWithLines(state, journal), details: state.openingBalanceDetails.filter((detail) => detail.openingBalanceSetId === set.id) });
  }

  function updateOpeningBalanceSet(id, input = {}) {
    const set = state.openingBalanceSets.find((entry) => entry.id === id);
    if (!set) return null;
    if (set.status === "posted") throw new Error("Posted opening balance sets are immutable. Use a controlled adjustment.");
    Object.assign(set, input, { updatedAt: new Date().toISOString() });
    persist();
    return clone(set);
  }

  function listOpeningBalanceSetsForUser(user, businessId = "") {
    return clone(state.openingBalanceSets.filter((set) => (
      (!businessId || set.businessId === businessId)
      && (!user || user.role === "admin" || set.ownerUserId === user.id)
    )));
  }

  function getBalanceSheet(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for Balance Sheet.");
    ensureDefaultAccountingAccounts(state, business, business.ownerUserId);
    return buildBalanceSheet(state, business.id, input);
  }

  function financialYearIdFor(businessId, label) {
    return `fy_${businessId}_${String(label || "").replace(/[^A-Za-z0-9]/g, "_")}`;
  }

  function ensureFinancialYearRecord(business, input = {}) {
    const fy = normalizeFinancialYear(input, business);
    state.financialYears = Array.isArray(state.financialYears) ? state.financialYears : [];
    let record = state.financialYears.find((entry) => entry.businessId === business.id && entry.financialYear === fy.label);
    if (!record) {
      record = {
        id: financialYearIdFor(business.id, fy.label),
        businessId: business.id,
        ownerUserId: business.ownerUserId,
        financialYear: fy.label,
        startDate: fy.startDate,
        endDate: fy.endDate,
        status: "open",
        closeReadinessStatus: "",
        closedAt: "",
        closedByUserId: "",
        closeReason: "",
        reopenedAt: "",
        reopenedByUserId: "",
        reopenReason: "",
        yearEndEventId: "",
        closingJournalId: "",
        nextFinancialYearId: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.financialYears.push(record);
    }
    return record;
  }

  function ensureNextFinancialYearAndPeriods(business, financialYear) {
    const nextFy = financialYearForAccountingDate(new Date(`${financialYear.endDate}T00:00:00.000Z`).toISOString().slice(0, 10), business.financialYearStartMonth || business.taxProfile?.taxYearStartMonth || 4);
    const nextStart = new Date(`${financialYear.endDate}T00:00:00.000Z`);
    nextStart.setUTCDate(nextStart.getUTCDate() + 1);
    const next = ensureFinancialYearRecord(business, { closeDate: nextStart.toISOString().slice(0, 10) });
    Array.from({ length: 12 }, (_, index) => {
      const date = new Date(`${next.startDate}T00:00:00.000Z`);
      date.setUTCMonth(date.getUTCMonth() + index);
      ensureAccountingPeriod(state, business, date.toISOString().slice(0, 10));
    });
    return next;
  }

  function postYearEndJournal(business, input = {}) {
    const lines = input.lines.map((line) => {
      const account = state.ledgerAccounts.find((entry) => entry.id === line.accountId && entry.businessId === business.id);
      if (!account) throw new Error("Year-end closing account does not belong to this business.");
      return {
        account,
        debit: toNumber(line.debit),
        credit: toNumber(line.credit),
        description: line.description,
      };
    });
    if (!lines.length) return null;
    const totals = validateBalancedJournal(lines);
    const journal = {
      id: nextId("ycl", ++state.counters.accountingJournal),
      businessId: business.id,
      ownerUserId: business.ownerUserId,
      journalNumber: input.journalNumber || `YEC-${input.financialYear}-${String(state.counters.accountingJournal).padStart(4, "0")}`,
      journalDate: input.journalDate,
      narration: input.narration,
      status: "posted",
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      financialEventId: "",
      postingRule: input.postingRule,
      postingRuleVersion: input.postingRuleVersion || "1",
      automatic: true,
      immutable: true,
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
    return journal;
  }

  function getYearEndCloseReadiness(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for year-end close readiness.");
    ensureDefaultAccountingAccounts(state, business, business.ownerUserId);
    return buildYearEndReadiness(state, business, input);
  }

  function previewYearEndClose(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for year-end close preview.");
    ensureDefaultAccountingAccounts(state, business, business.ownerUserId);
    return buildYearEndClosePreview(state, business, input);
  }

  function executeYearEndClose(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for year-end close.");
    ensureDefaultAccountingAccounts(state, business, business.ownerUserId);
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    if (idempotencyKey) {
      const existingByKey = state.yearEndCloses.find((close) => close.businessId === business.id && close.idempotencyKey === idempotencyKey);
      if (existingByKey) return clone({ ...existingByKey, journal: existingByKey.closingJournalId ? publicJournalWithLines(state, state.accountingJournals.find((journal) => journal.id === existingByKey.closingJournalId)) : null });
    }
    const readiness = buildYearEndReadiness(state, business, input);
    if (readiness.blockers.length) throw new Error(`Year-end close has blocking readiness issues: ${readiness.blockers.map((blocker) => blocker.code).join(", ")}`);
    const closeReason = String(input.reason || input.closeReason || "").trim();
    if (!closeReason) throw new Error("A year-end close reason is required.");
    const financialYear = ensureFinancialYearRecord(business, readiness);
    const activeClose = state.yearEndCloses.find((close) => close.businessId === business.id && close.financialYear === readiness.financialYear && close.status === "closed");
    if (activeClose) throw new Error("Year-end close already exists for this financial year.");
    const version = state.yearEndCloses.filter((close) => close.businessId === business.id && close.financialYear === readiness.financialYear).length + 1;
    const close = {
      id: nextId("yec", ++state.counters.yearEndClose),
      businessId: business.id,
      ownerUserId: business.ownerUserId,
      financialYearId: financialYear.id,
      financialYear: readiness.financialYear,
      startDate: readiness.startDate,
      endDate: readiness.endDate,
      closeDate: readiness.closeDate,
      closeMethod: readiness.preview.method,
      retainedEarningsAccountId: readiness.preview.retainedEarningsAccountId,
      closingJournalId: "",
      nextFinancialYearId: "",
      idempotencyKey,
      version,
      status: "closed",
      closedByUserId: input.actorUserId || input.createdByUserId || "",
      closeReason,
      readinessStatus: readiness.status,
      readinessSnapshot: clone(readiness),
      calculationSnapshot: clone(readiness.preview.totals),
      lineageFromCloseId: state.yearEndCloses.findLast?.((entry) => entry.businessId === business.id && entry.financialYear === readiness.financialYear)?.id || "",
      reopenedAt: "",
      reopenedByUserId: "",
      reopenReason: "",
      reversalJournalId: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const journal = postYearEndJournal(business, {
      financialYear: close.financialYear,
      journalDate: close.closeDate,
      sourceType: "year_end_close",
      sourceId: close.id,
      postingRule: "year_end_close_retained_earnings",
      narration: `Year-end close for FY ${close.financialYear}`,
      currency: input.currency || "INR",
      lines: readiness.preview.lines,
    });
    close.closingJournalId = journal?.id || "";
    const next = ensureNextFinancialYearAndPeriods(business, readiness);
    close.nextFinancialYearId = next.id;
    financialYear.status = "closed";
    financialYear.closeReadinessStatus = readiness.status;
    financialYear.closedAt = close.createdAt;
    financialYear.closedByUserId = close.closedByUserId;
    financialYear.closeReason = close.closeReason;
    financialYear.yearEndEventId = close.id;
    financialYear.closingJournalId = close.closingJournalId;
    financialYear.nextFinancialYearId = next.id;
    financialYear.updatedAt = new Date().toISOString();
    state.yearEndCloses.push(close);
    state.yearEndCloseHistory.push({
      id: nextId("ych", ++state.counters.yearEndCloseHistory),
      businessId: business.id,
      yearEndCloseId: close.id,
      financialYearId: financialYear.id,
      action: "close",
      actorUserId: close.closedByUserId,
      reason: close.closeReason,
      journalId: close.closingJournalId,
      version,
      createdAt: close.createdAt,
    });
    persist();
    return clone({ ...close, journal: journal ? publicJournalWithLines(state, journal) : null, nextFinancialYear: next, rollForward: buildOpeningRollForwardSummary(state, business, { financialYear: close.financialYear }) });
  }

  function reopenYearEndClose(id, input = {}) {
    const close = state.yearEndCloses.find((entry) => entry.id === id);
    if (!close) throw new Error("Year-end close not found.");
    const business = findBusinessByIdOrLegacyOwner(close.businessId);
    if (!business) throw new Error("Business is required for year-end reopen.");
    if (input.businessId && close.businessId !== input.businessId) throw new Error("Year-end close not found in this business.");
    if (close.status !== "closed") throw new Error("Only a closed financial year can be reopened.");
    const reason = String(input.reason || input.reopenReason || "").trim();
    if (!reason) throw new Error("A year-end reopen reason is required.");
    const originalJournal = state.accountingJournals.find((journal) => journal.id === close.closingJournalId);
    const originalLines = state.accountingJournalLines.filter((line) => line.journalId === close.closingJournalId);
    const reversalJournal = originalJournal ? postYearEndJournal(business, {
      financialYear: close.financialYear,
      journalDate: input.reopenDate || close.closeDate,
      sourceType: "year_end_close_reversal",
      sourceId: close.id,
      postingRule: "year_end_close_reversal",
      narration: `Reopen reversal for FY ${close.financialYear}`,
      currency: originalJournal.currency || "INR",
      lines: originalLines.map((line) => ({
        accountId: line.accountId,
        description: `Reverse ${line.description || originalJournal.narration}`,
        debit: line.credit,
        credit: line.debit,
      })),
    }) : null;
    close.status = "reopened";
    close.reopenedAt = new Date().toISOString();
    close.reopenedByUserId = input.actorUserId || input.createdByUserId || "";
    close.reopenReason = reason;
    close.reversalJournalId = reversalJournal?.id || "";
    close.updatedAt = new Date().toISOString();
    const financialYear = state.financialYears.find((entry) => entry.id === close.financialYearId);
    if (financialYear) {
      financialYear.status = "open";
      financialYear.reopenedAt = close.reopenedAt;
      financialYear.reopenedByUserId = close.reopenedByUserId;
      financialYear.reopenReason = reason;
      financialYear.updatedAt = close.updatedAt;
    }
    state.yearEndCloseHistory.push({
      id: nextId("ych", ++state.counters.yearEndCloseHistory),
      businessId: business.id,
      yearEndCloseId: close.id,
      financialYearId: close.financialYearId,
      action: "reopen",
      actorUserId: close.reopenedByUserId,
      reason,
      journalId: close.reversalJournalId,
      version: close.version,
      createdAt: close.reopenedAt,
    });
    persist();
    return clone({ ...close, reversalJournal: reversalJournal ? publicJournalWithLines(state, reversalJournal) : null });
  }

  function listFinancialYearsForUser(user, businessId = "") {
    return clone(state.financialYears.filter((year) => (
      (!businessId || year.businessId === businessId)
      && (!user || user.role === "admin" || year.ownerUserId === user.id)
    )));
  }

  function listYearEndClosesForUser(user, businessId = "") {
    return clone(state.yearEndCloses.filter((close) => (
      (!businessId || close.businessId === businessId)
      && (!user || user.role === "admin" || close.ownerUserId === user.id)
    )));
  }

  function getOpeningRollForwardSummary(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for opening roll-forward.");
    return buildOpeningRollForwardSummary(state, business, input);
  }

  function getYearEndReportBundle(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for year-end report bundle.");
    return buildYearEndReportBundle(state, business, input);
  }

  function getComparativeFinancialYears(input = {}) {
    const business = findBusinessByIdOrLegacyOwner(input.businessId);
    if (!business) throw new Error("Business is required for comparative financial years.");
    return buildComparativeFinancialYears(state, business, input);
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
    const customerIds = new Set(state.customers
      .filter((customer) => customer.ownerUserId === user.id)
      .map((customer) => customer.id));
    return clone(state.payments.filter((payment) => (
      payment.ownerUserId === user.id
      || invoiceIds.has(payment.invoiceId)
      || purchaseOrderIds.has(payment.purchaseOrderId)
      || vendorBillIds.has(payment.vendorBillId)
      || customerIds.has(payment.customerId)
    )));
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

  function getInvoiceOutstandingAmount(id, input = {}) {
    const invoice = state.invoices.find((entry) => entry.id === id);
    if (!invoice) return null;
    if (input.businessId && invoice.businessId !== input.businessId) return null;
    if (input.workspaceOwnerUserId && invoice.ownerUserId && invoice.ownerUserId !== input.workspaceOwnerUserId) return null;
    return fromMinor(invoiceOutstandingMinor(invoice));
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
      accountingPeriods: state.accountingPeriods.length,
      accountingPeriodHistory: state.accountingPeriodHistory.length,
      openingBalanceSets: state.openingBalanceSets.length,
      openingBalanceDetails: state.openingBalanceDetails.length,
      financialYears: state.financialYears.length,
      yearEndCloses: state.yearEndCloses.length,
      yearEndCloseHistory: state.yearEndCloseHistory.length,
      invoices: state.invoices.length,
      purchaseOrders: state.purchaseOrders.length,
      payments: state.payments.length,
      paymentAllocations: state.paymentAllocations.length,
      paymentRequests: state.paymentRequests.length,
      subscriptions: state.subscriptions.length,
      billingOrders: state.billingOrders.length,
      monetization: state.monetization.length,
      reports: state.reports.length,
      documents: state.documents.length,
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

  function getProviderFeeAccountAuthority(businessId) {
    const business = findBusinessByIdOrLegacyOwner(businessId);
    if (!business) return { status: "manual_review", reasonCode: "business_not_found", account: null };
    const historicalCandidates = state.ledgerAccounts.filter((entry) => entry.businessId === business.id && (
      entry.accountRole === "provider_fee_expense" || entry.accountCode === "5300"
    ));
    const lifecycleConflict = historicalCandidates.find((entry) => String(entry.status || "active").toLowerCase() !== "active");
    if (lifecycleConflict) {
      return resolveProviderFeeAccount(state, business);
    }
    ensureDefaultAccountingAccounts(state, business, business.ownerUserId);
    return resolveProviderFeeAccount(state, business);
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
    const journalDate = input.journalDate || new Date().toISOString().slice(0, 10);
    validateAccountingPosting(business, journalDate, { ...input, sourceType: "manual", sourceId: input.sourceId || "" });
    const journal = {
      id: nextId("mjrnl", ++state.counters.accountingJournal),
      businessId: business.id,
      ownerUserId: business.ownerUserId,
      journalNumber: input.journalNumber || `JV-${String(state.counters.accountingJournal).padStart(4, "0")}`,
      journalDate,
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
    const targetStatus = updates.status !== undefined ? normalizeRecordStatus(updates.status, invoice.status || "draft") : "";
    if (normalizeRecordStatus(invoice.status, "draft") === "draft" && targetStatus && targetStatus !== "draft") {
      return finalizeInvoice(id, updates, limits);
    }
    const materialFields = [
      "items",
      "taxRate",
      "discount",
      "shipping",
      "roundOff",
      "draftNumber",
      "currency",
      "customerId",
      "companyId",
      "invoiceNumber",
      "invoiceDate",
      "dueDate",
      "placeOfSupply",
      "gstMode",
      "billToName",
      "billToAddress",
    ];
    const hasFinancialPosting = state.financialEvents.some((event) => (
      event.eventType === "invoice_issued"
      && event.sourceId === invoice.id
      && event.postingStatus === "posted"
    ));
    if (isInvoiceFinalized(invoice) && materialFields.some((field) => updates[field] !== undefined)) {
      throw new Error("Posted invoices cannot be financially edited. Use a controlled reversal or adjustment.");
    }
    if ((hasFinancialPosting || isInvoiceFinalized(invoice)) && targetStatus) {
      throw new Error("Issued invoices cannot be status-edited without a controlled reversal, void, or adjustment.");
    }

    [
      "customerId",
      "draftNumber",
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
    if (updates.status !== undefined) invoice.status = normalizeRecordStatus(updates.status, invoice.status || "draft");
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
    if (postingBusiness && normalizeRecordStatus(invoice.status, "draft") !== "draft") {
      validateAccountingPosting(postingBusiness, invoice.invoiceDate || invoice.createdAt.slice(0, 10), { ...updates, sourceType: "invoice", sourceId: invoice.id });
      postInvoiceIssued(state, invoice, postingBusiness);
    }

    persist();
    return clone(invoice);
  }

  function finalizeInvoice(id, updates = {}, limits) {
    const invoice = state.invoices.find((entry) => entry.id === id);
    if (!invoice) return null;
    assertInvoiceCanBeEdited(invoice);
    const currentStatus = normalizeRecordStatus(invoice.status, "draft");
    if (isInvoiceFinalized(invoice)) return clone(invoice);
    const idempotencyKey = String(updates.idempotencyKey || updates.finalizationIdempotencyKey || "").trim();
    if (idempotencyKey && invoice.finalizationIdempotencyKey === idempotencyKey && isInvoiceFinalized(invoice)) return clone(invoice);
    const allowedDraftUpdates = { ...updates };
    delete allowedDraftUpdates.status;
    delete allowedDraftUpdates.idempotencyKey;
    delete allowedDraftUpdates.finalizationIdempotencyKey;
    if (Object.keys(allowedDraftUpdates).length > 0 && currentStatus === "draft") {
      const draftUpdates = { ...allowedDraftUpdates, status: "draft" };
      [
        "customerId",
        "draftNumber",
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
        if (draftUpdates[field] !== undefined) invoice[field] = String(draftUpdates[field] || "").trim();
      });
      if (draftUpdates.recurringEnabled !== undefined) invoice.recurringEnabled = Boolean(draftUpdates.recurringEnabled);
      if (draftUpdates.recurringFrequency !== undefined) invoice.recurringFrequency = draftUpdates.recurringFrequency ? normalizeRecurringFrequency(draftUpdates.recurringFrequency) : "";
      if (draftUpdates.hideEazinvoiceBranding !== undefined) invoice.hideEazinvoiceBranding = Boolean(draftUpdates.hideEazinvoiceBranding);
      if (draftUpdates.companyId !== undefined) invoice.companyId = draftUpdates.companyId || null;
      if (draftUpdates.taxRate !== undefined) invoice.taxRate = toNumber(draftUpdates.taxRate);
      if (draftUpdates.discount !== undefined) invoice.discount = toNumber(draftUpdates.discount);
      if (draftUpdates.shipping !== undefined) invoice.shipping = toNumber(draftUpdates.shipping);
      if (draftUpdates.roundOff !== undefined) invoice.roundOff = toNumber(draftUpdates.roundOff);
      if (draftUpdates.items !== undefined) {
        invoice.items = normalizeFinancialItems(draftUpdates.items, toNumber(draftUpdates.taxRate ?? invoice.taxRate))
          .filter((item) => item.description);
      }
      const totalsNeedRefresh = ["items", "taxRate", "discount", "shipping", "roundOff"].some((field) => draftUpdates[field] !== undefined);
      if (totalsNeedRefresh) {
        if (invoice.items.length > limits.invoiceItemsPerInvoice) throw new Error("invoice items exceed active plan limit");
        Object.assign(invoice, calculateInvoiceTotals(invoice.items, toNumber(invoice.taxRate), invoice));
      }
    }
    if (invoice.invoiceNumber) invoice.draftNumber = invoice.draftNumber || invoice.invoiceNumber;
    const business = invoice.businessId ? findBusinessByIdOrLegacyOwner(invoice.businessId) : ensureBusinessForOwner(invoice.ownerUserId);
    const allocated = nextAvailableInvoiceNumber(invoice, business, "");
    invoice.invoiceCode = allocated.invoiceCode;
    invoice.invoiceNumber = allocated.invoiceNumber;
    invoice.status = "issued";
    invoice.finalizedAt = invoice.finalizedAt || new Date().toISOString();
    invoice.finalizationIdempotencyKey = idempotencyKey || invoice.finalizationIdempotencyKey || "";
    invoice.paymentStatus = invoice.paymentStatus === "draft" ? "unpaid" : invoice.paymentStatus || "unpaid";
    refreshInvoicePaymentStatus(invoice);
    if (business) {
      validateAccountingPosting(business, invoice.invoiceDate || invoice.createdAt.slice(0, 10), { ...updates, sourceType: "invoice", sourceId: invoice.id });
      buildComplianceSnapshot("invoice", invoice, { direction: "output" });
      postInvoiceIssued(state, invoice, business);
    }
    persist();
    return clone(invoice);
  }

  function updatePurchaseOrder(id, updates, limits) {
    const purchaseOrder = state.purchaseOrders.find((entry) => entry.id === id);
    if (!purchaseOrder) return null;
    assertPurchaseOrderCanBeEdited(purchaseOrder);
    const targetStatus = updates.status !== undefined ? normalizeRecordStatus(updates.status, purchaseOrder.status || "draft") : "";
    if (normalizeRecordStatus(purchaseOrder.status, "draft") === "draft" && targetStatus && targetStatus !== "draft") {
      return issuePurchaseOrder(id, updates, limits);
    }
    const materialFields = ["items", "taxRate", "discount", "shipping", "roundOff", "draftNumber", "currency", "vendorId", "customerId", "companyId", "documentType", "poNumber", "poDate", "dueDate", "billToName", "billToAddress"];
    if (isPurchaseOrderIssued(purchaseOrder) && materialFields.some((field) => updates[field] !== undefined)) {
      throw new Error("Issued purchase/work orders cannot be materially edited. Create a revision or controlled cancellation.");
    }
    if (isPurchaseOrderIssued(purchaseOrder) && targetStatus) {
      throw new Error("Issued purchase/work orders cannot be status-edited without a controlled cancellation/close workflow.");
    }

    [
      "documentType",
      "vendorId",
      "customerId",
      "draftNumber",
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
    if (updates.status !== undefined) purchaseOrder.status = normalizeRecordStatus(updates.status, purchaseOrder.status || "draft");
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

  function issuePurchaseOrder(id, updates = {}, limits) {
    const purchaseOrder = state.purchaseOrders.find((entry) => entry.id === id);
    if (!purchaseOrder) return null;
    assertPurchaseOrderCanBeEdited(purchaseOrder);
    if (isPurchaseOrderIssued(purchaseOrder)) return clone(purchaseOrder);
    const idempotencyKey = String(updates.idempotencyKey || updates.issueIdempotencyKey || "").trim();
    const draftUpdates = { ...updates };
    delete draftUpdates.status;
    delete draftUpdates.idempotencyKey;
    delete draftUpdates.issueIdempotencyKey;
    [
      "documentType",
      "vendorId",
      "customerId",
      "draftNumber",
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
      if (draftUpdates[field] !== undefined) purchaseOrder[field] = String(draftUpdates[field] || "").trim();
    });
    if (draftUpdates.companyId !== undefined) purchaseOrder.companyId = draftUpdates.companyId || null;
    if (draftUpdates.taxRate !== undefined) purchaseOrder.taxRate = toNumber(draftUpdates.taxRate);
    if (draftUpdates.discount !== undefined) purchaseOrder.discount = toNumber(draftUpdates.discount);
    if (draftUpdates.shipping !== undefined) purchaseOrder.shipping = toNumber(draftUpdates.shipping);
    if (draftUpdates.roundOff !== undefined) purchaseOrder.roundOff = toNumber(draftUpdates.roundOff);
    if (draftUpdates.items !== undefined) {
      purchaseOrder.items = normalizeFinancialItems(draftUpdates.items, toNumber(draftUpdates.taxRate ?? purchaseOrder.taxRate))
        .filter((item) => item.description);
    }
    const totalsNeedRefresh = ["items", "taxRate", "discount", "shipping", "roundOff"].some((field) => draftUpdates[field] !== undefined);
    if (totalsNeedRefresh) {
      if (purchaseOrder.items.length > limits.invoiceItemsPerInvoice) throw new Error("purchase/work order items exceed active plan limit");
      Object.assign(purchaseOrder, calculateInvoiceTotals(purchaseOrder.items, toNumber(purchaseOrder.taxRate), purchaseOrder));
    }
    if (purchaseOrder.poNumber) purchaseOrder.draftNumber = purchaseOrder.draftNumber || purchaseOrder.poNumber;
    const allocated = nextAvailablePurchaseOrderNumber(purchaseOrder, "");
    purchaseOrder.poCode = allocated.poCode;
    purchaseOrder.poNumber = allocated.poNumber;
    purchaseOrder.status = "issued";
    purchaseOrder.issuedAt = purchaseOrder.issuedAt || new Date().toISOString();
    purchaseOrder.issueIdempotencyKey = idempotencyKey || purchaseOrder.issueIdempotencyKey || "";
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
      validateAccountingPosting(business, bill.billDate, { ...input, sourceType: "vendor_bill", sourceId: bill.id });
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
    const creditCurrency = String(input.currency || invoice.currency || "INR").trim().toUpperCase();
    const invoiceCurrency = String(invoice.currency || "INR").trim().toUpperCase();
    if (creditCurrency !== invoiceCurrency) throw new Error("Credit note currency must match the source invoice currency.");
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
      currency: creditCurrency,
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
    if (status !== "draft") validateAccountingPosting(business, note.creditNoteDate, { ...input, sourceType: "sales_credit_note", sourceId: note.id });
    state.creditNotes.push(note);
    if (status !== "draft") {
      buildComplianceSnapshot("sales_credit_note", note, { direction: "output" });
      postSalesCreditNotePosted(state, note, invoice, business);
      refreshInvoicePaymentStatus(invoice);
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
    if (status !== "draft") validateAccountingPosting(business, credit.vendorCreditDate, { ...input, sourceType: "vendor_credit", sourceId: credit.id });
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
      validateAccountingPosting(business, vendorBill.billDate, { ...updates, sourceType: "vendor_bill", sourceId: vendorBill.id });
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
    const invoice = state.invoices.find((entry) => entry.id === note.sourceInvoiceId);
    if (invoice && String(note.currency || invoice.currency || "INR").trim().toUpperCase() !== String(invoice.currency || "INR").trim().toUpperCase()) {
      throw new Error("Credit note currency must match the source invoice currency.");
    }
    if (updates.items !== undefined) {
      note.items = normalizeFinancialItems(updates.items, toNumber(updates.taxRate ?? note.taxRate)).filter((item) => item.description);
      if (note.items.length > limits.invoiceItemsPerInvoice) throw new Error("credit note items exceed active plan limit");
      Object.assign(note, calculateInvoiceTotals(note.items, toNumber(updates.taxRate ?? note.taxRate), note));
    }
    note.updatedAt = new Date().toISOString();
    if (normalizeRecordStatus(note.status, "draft") !== "draft") {
      const business = findBusinessByIdOrLegacyOwner(note.businessId);
      validateAccountingPosting(business, note.creditNoteDate, { ...updates, sourceType: "sales_credit_note", sourceId: note.id });
      const remainingMinor = Math.round(toNumber(invoice?.total) * 100) - postedCreditMinorForInvoice(note.sourceInvoiceId, note.id);
      if (Math.round(toNumber(note.total) * 100) > remainingMinor) throw new Error("Credit note exceeds remaining creditable invoice amount.");
      postSalesCreditNotePosted(state, note, invoice, business);
      refreshInvoicePaymentStatus(invoice);
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
      validateAccountingPosting(business, credit.vendorCreditDate, { ...updates, sourceType: "vendor_credit", sourceId: credit.id });
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
    if (normalizeRecordStatus(invoice.status, "draft") !== "draft") {
      throw new Error("Only draft invoices can be deleted. Use a controlled credit, reversal, refund, or void workflow for issued invoices.");
    }
    invoice.status = "deleted";
    invoice.paymentStatus = "deleted";
    invoice.deletedAt = new Date().toISOString();
    persist();
    return clone(invoice);
  }

  function archiveInvoice(id, input = {}, user = null) {
    const invoice = state.invoices.find((entry) => entry.id === id);
    if (!invoice) return null;
    const companiesOwned = new Set(state.companies.filter((company) => company.ownerUserId === user?.id).map((company) => company.id));
    if (user && user.role !== "admin" && invoice.ownerUserId !== user.id && !companiesOwned.has(invoice.companyId)) return null;
    const status = normalizeRecordStatus(invoice.status, "draft");
    if (status === "draft") throw new Error("Draft invoices can be deleted instead of archived.");
    if (status === "deleted") throw new Error("Deleted invoices cannot be archived.");
    const now = new Date().toISOString();
    invoice.archivedAt = invoice.archivedAt || now;
    invoice.archivedBy = user?.id || input.archivedBy || "";
    invoice.archiveReason = String(input.archiveReason || input.reason || invoice.archiveReason || "").trim();
    invoice.updatedAt = now;
    persist();
    return clone(invoice);
  }

  function restoreInvoice(id, input = {}, user = null) {
    const invoice = state.invoices.find((entry) => entry.id === id);
    if (!invoice) return null;
    const companiesOwned = new Set(state.companies.filter((company) => company.ownerUserId === user?.id).map((company) => company.id));
    if (user && user.role !== "admin" && invoice.ownerUserId !== user.id && !companiesOwned.has(invoice.companyId)) return null;
    if (normalizeRecordStatus(invoice.status, "draft") === "deleted") throw new Error("Deleted invoices cannot be restored through archive controls.");
    const now = new Date().toISOString();
    invoice.restoredAt = now;
    invoice.restoredBy = user?.id || input.restoredBy || "";
    invoice.archivedAt = "";
    invoice.archivedBy = "";
    invoice.archiveReason = "";
    invoice.updatedAt = now;
    persist();
    return clone(invoice);
  }

  function deletePurchaseOrder(id, user) {
    const purchaseOrder = state.purchaseOrders.find((entry) => entry.id === id);
    if (!purchaseOrder) return null;
    const companiesOwned = new Set(state.companies.filter((company) => company.ownerUserId === user?.id).map((company) => company.id));
    if (user && user.role !== "admin" && purchaseOrder.ownerUserId !== user.id && !companiesOwned.has(purchaseOrder.companyId)) return null;
    if (normalizeRecordStatus(purchaseOrder.status, "draft") !== "draft") {
      throw new Error("Only draft purchase/work orders can be deleted. Use a controlled cancellation/close workflow for issued PO/WO records.");
    }
    purchaseOrder.status = "deleted";
    purchaseOrder.paymentStatus = "deleted";
    purchaseOrder.deletedAt = new Date().toISOString();
    persist();
    return clone(purchaseOrder);
  }
  const storeApi = {
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
    getOrCreateAccountingPeriod,
    listAccountingPeriodsForUser,
    periodReadiness,
    changeAccountingPeriodStatus,
    createOpeningBalanceSet,
    updateOpeningBalanceSet,
    listOpeningBalanceSetsForUser,
    getBalanceSheet,
    getYearEndCloseReadiness,
    previewYearEndClose,
    executeYearEndClose,
    reopenYearEndClose,
    listFinancialYearsForUser,
    listYearEndClosesForUser,
    getOpeningRollForwardSummary,
    getYearEndReportBundle,
    getComparativeFinancialYears,
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
    createDocument,
    listDocuments,
    listDocumentsForBusiness,
    getDocumentById,
    updateDocument,
    findDocumentByIdempotencyKey,
    listDocumentStorageKeys,
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
    resolveBusinessRazorpayCredentials,
    ensureProviderCredentialVersion,
    getProviderCredentialVersion,
    revokeProviderCredentialVersion,
    createProviderSettlement,
    getProviderSettlement,
    listProviderSettlements,
    evaluateProviderSettlementReadiness,
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
    getProviderFeeAccountAuthority,
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
    listInvoicePayments,
    getInvoice,
    getInvoiceOutstandingAmount,
    updateInvoice,
    finalizeInvoice,
    updatePurchaseOrder,
    issuePurchaseOrder,
    updateVendorBill,
    updateCreditNote,
    updateVendorCredit,
    deleteInvoice,
    archiveInvoice,
    restoreInvoice,
    deletePurchaseOrder,
    recordInvoicePayment,
    recordPurchaseOrderPayment,
    recordVendorBillPayment,
    listPaymentAllocations,
    createPaymentAllocation,
    reversePaymentAllocation,
    recordCustomerReceipt,
    getPaymentUnappliedAmount,
    postCustomerReceiptAccounting,
    postCustomerPaymentAllocationAccounting,
    createPaymentRequest,
    reissuePaymentRequest,
    listPaymentRequests,
    getPaymentRequest,
    getPublicPaymentRequest,
    getPublicPaymentRequestAuthority,
    preparePublicPaymentRequest,
    resolvePaymentRequestProviderEvidence,
    beginPaymentRequestProviderIntent,
    bindPaymentRequestProviderIntent,
    failPaymentRequestProviderIntent,
    markPaymentRequestProviderIntentRecoveryRequired,
    recoverPaymentRequestProviderIntent,
    cancelPaymentRequest,
    completePaymentRequest,
    completeVerifiedProviderPaymentAtomic,
    ingestProviderEvent,
    getProviderRecoveryEvent,
    markProviderEventVerified,
    claimProviderEvent,
    updateProviderEvent,
    listProviderRecoveryEvents,
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
    awaitPersistence,
    getPersistenceHealth,
    exportState,
  };

  return new Proxy(storeApi, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function" || property === "awaitPersistence" || property === "getPersistenceHealth") return value;
      return (...args) => {
        const result = value.apply(target, args);
        const pending = pendingPersistence;
        if (!pending) return result;
        return Promise.resolve(result).then((resolved) => pending.then(() => resolved));
      };
    },
  });
}
