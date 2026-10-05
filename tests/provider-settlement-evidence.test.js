import assert from "node:assert/strict";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { createStore } from "../apps/api/src/store.js";

function scenario() {
  const store = createStore({}, { persist: false, useSupabaseEmailOtp: false });
  const api = createApi({ store });
  const user = api.createUser({ name: "Evidence Owner", email: `evidence-${Date.now()}@example.com` });
  const business = api.createBusiness(user, { name: "Evidence Business" });
  const invoice = api.createInvoice({
    ownerUserId: user.id, businessId: business.id, status: "created", currency: "INR",
    invoiceDate: "2026-10-05", items: [{ description: "Evidence", quantity: 1, rate: 1000, gstRate: 0 }],
  }, { user, businessId: business.id });
  const payment = api.recordInvoicePayment(invoice.id, {
    amount: 1000, currency: "INR", gateway: "razorpay", gatewayPaymentId: `pay_evidence_${Date.now()}`,
    gatewayOrderId: `order_evidence_${Date.now()}`, status: "captured",
  }, { user, businessId: business.id });
  const bank = api.createBankAccount(user, { businessId: business.id, accountType: "bank", displayName: "Evidence Bank" }, { businessId: business.id });
  const base = {
    businessId: business.id, merchantAccountId: "acct_evidence", provider: "razorpay", providerSettlementId: "setl_evidence",
    grossAmount: 1000, feeAmount: 20, feeTaxAmount: 3.6, adjustmentAmount: 0, netAmount: 976.4,
    currency: "INR", settlementDate: "2026-10-05", destinationBankAccountId: bank.id,
    paymentLinks: [{ paymentId: payment.payment.id, amount: 1000 }],
    sourceType: "settlement_report", sourceReference: "report-2026-10-05-row-1", payloadHash: "hash-evidence-1",
    taxComponents: { cgstAmount: 1.8, sgstAmount: 1.8, igstAmount: 0, sourceReference: "tax-invoice-row-1" },
  };
  return { api, store, user, business, invoice, payment: payment.payment, bank, base };
}

test("normalized provider evidence is provenance-bound and ledger-inert", () => {
  const s = scenario();
  const before = s.store.exportState();
  const result = s.api.createProviderSettlement(s.user, s.base, { businessId: s.business.id, previewPlan: "business" });
  assert.equal(result.settlement.evidenceLifecycle, "evidence_verified");
  assert.equal(result.settlement.accountingReadiness, "blocked");
  assert.equal(result.settlement.accountingStatus, "not_posted");
  assert.equal(result.settlement.provenance.sourceType, "settlement_report");
  assert.equal(s.store.exportState().accountingJournals.length, before.accountingJournals.length);
  assert.equal(s.store.exportState().payments.length, before.payments.length);
});

test("identical evidence replays and conflicting evidence is rejected", () => {
  const s = scenario();
  s.api.createProviderSettlement(s.user, s.base, { businessId: s.business.id, previewPlan: "business" });
  const replay = s.api.createProviderSettlement(s.user, s.base, { businessId: s.business.id, previewPlan: "business" });
  assert.equal(replay.idempotentReplay, true);
  assert.throws(() => s.api.createProviderSettlement(s.user, { ...s.base, netAmount: 900 }, { businessId: s.business.id, previewPlan: "business" }), /amounts|conflicts/i);
});

test("provenance, tenant, merchant, linkage, currency, and over-link rules fail closed", () => {
  const s = scenario();
  const missing = s.api.createProviderSettlement(s.user, { ...s.base, providerSettlementId: "setl_no_provenance", sourceType: "settlement_report", sourceReference: "", payloadHash: "" }, { businessId: s.business.id, previewPlan: "business" });
  assert.equal(missing.settlement.evidenceLifecycle, "evidence_pending");
  assert.throws(() => s.api.createProviderSettlement(s.user, { ...s.base, providerSettlementId: "setl_currency", currency: "USD" }, { businessId: s.business.id, previewPlan: "business" }), /currency/i);
  const over = scenario();
  over.api.createProviderSettlement(over.user, { ...over.base, providerSettlementId: "setl_over", paymentLinks: [{ paymentId: over.payment.id, amount: 1000 }] }, { businessId: over.business.id, previewPlan: "business" });
  assert.throws(() => over.api.createProviderSettlement(over.user, { ...over.base, providerSettlementId: "setl_over_2", paymentLinks: [{ paymentId: over.payment.id, amount: 1 }] }, { businessId: over.business.id, previewPlan: "business" }), /more than the captured/i);
});

test("bank destination is bank-only and clearing cannot be a destination", () => {
  const s = scenario();
  const cash = s.api.createBankAccount(s.user, { businessId: s.business.id, accountType: "cash", displayName: "Cash" }, { businessId: s.business.id });
  assert.throws(() => s.api.createProviderSettlement(s.user, { ...s.base, providerSettlementId: "setl_cash", destinationBankAccountId: cash.id }, { businessId: s.business.id, previewPlan: "business" }), /bank account/i);
  assert.throws(() => s.api.createProviderSettlement(s.user, { ...s.base, providerSettlementId: "setl_clearing", destinationBankAccountId: "missing" }, { businessId: s.business.id, previewPlan: "business" }), /bank account/i);
});

test("tax, adjustment, withholding, and legacy evidence remain blocked without inference", () => {
  const s = scenario();
  const unknownTax = s.api.createProviderSettlement(s.user, { ...s.base, providerSettlementId: "setl_tax_unknown", taxComponents: undefined, feeCgstAmount: undefined, feeSgstAmount: undefined, feeIgstAmount: undefined }, { businessId: s.business.id, previewPlan: "business" });
  assert.equal(unknownTax.settlement.accountingReadiness, "blocked");
  const adjustment = scenario();
  const unknownAdjustment = adjustment.api.createProviderSettlement(adjustment.user, { ...adjustment.base, providerSettlementId: "setl_adjustment_unknown", adjustments: [{ type: "mystery", amount: 1 }] }, { businessId: adjustment.business.id, previewPlan: "business" });
  assert.equal(unknownAdjustment.settlement.evidenceLifecycle, "manual_review");
  const withholding = scenario();
  const unknownWithholding = withholding.api.createProviderSettlement(withholding.user, { ...withholding.base, providerSettlementId: "setl_withholding", withholding: { type: "tds", amount: 1 } }, { businessId: withholding.business.id, previewPlan: "business" });
  assert.equal(unknownWithholding.settlement.evidenceLifecycle, "manual_review");
  const legacyScenario = scenario();
  const legacy = legacyScenario.api.createProviderSettlement(legacyScenario.user, { ...legacyScenario.base, providerSettlementId: "setl_legacy", provenance: undefined, sourceType: undefined, sourceReference: undefined, payloadHash: undefined, taxComponents: undefined }, { businessId: legacyScenario.business.id, previewPlan: "business" });
  assert.equal(legacy.settlement.evidenceLifecycle, "evidence_pending");
});

test("client cannot forge accounting readiness or status", () => {
  const s = scenario();
  const result = s.api.createProviderSettlement(s.user, { ...s.base, providerSettlementId: "setl_forge", accountingReady: true, accountingReadiness: "accounting_ready", accountingStatus: "posted", evidenceLifecycle: "accounting_ready" }, { businessId: s.business.id, previewPlan: "business" });
  assert.equal(result.settlement.accountingReadiness, "blocked");
  assert.equal(result.settlement.accountingStatus, "not_posted");
});
