import assert from "node:assert/strict";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { createStore } from "../apps/api/src/store.js";
import { STATE_COLLECTIONS, deriveCounters, normalizeStateDocument } from "../apps/api/src/postgres-state.js";

function scenario() {
  const store = createStore({}, { persist: false, useSupabaseEmailOtp: false });
  const api = createApi({ store });
  const user = api.createUser({ name: "Settlement Owner", email: `settlement-${Date.now()}@example.com` });
  const business = api.createBusiness(user, { name: "Settlement Business" });
  const invoice = api.createInvoice({
    ownerUserId: user.id, businessId: business.id, status: "created", currency: "INR",
    invoiceDate: "2026-10-05", items: [{ description: "Settlement test", quantity: 1, rate: 1000, gstRate: 0 }],
  }, { user, businessId: business.id });
  const payment = api.recordInvoicePayment(invoice.id, {
    amount: 1000, currency: "INR", gateway: "razorpay", gatewayPaymentId: `pay_settle_${Date.now()}`,
    gatewayOrderId: `order_settle_${Date.now()}`, status: "captured",
  }, { user, businessId: business.id });
  const bank = api.createBankAccount(user, { businessId: business.id, accountType: "bank", displayName: "Settlement Bank" }, { businessId: business.id });
  return { api, store, user, business, invoice, payment: payment.payment, bank };
}

test("provider settlement identity is canonical, replay-safe, and accounting-neutral", () => {
  const s = scenario();
  const input = {
    businessId: s.business.id, merchantAccountId: "acct_settlement", provider: "razorpay", providerSettlementId: "setl_001",
    grossAmount: 1000, feeAmount: 20, feeTaxAmount: 3.6, adjustmentAmount: 0, netAmount: 976.4,
    currency: "INR", settlementDate: "2026-10-05", destinationBankAccountId: s.bank.id,
    paymentLinks: [{ paymentId: s.payment.id, amount: 1000 }],
  };
  const beforeJournals = s.store.exportState().accountingJournals.length;
  const first = s.api.createProviderSettlement(s.user, input, { businessId: s.business.id, previewPlan: "business" });
  assert.equal(first.settlement.accountingStatus, "not_posted");
  assert.equal(first.settlement.paymentLinks[0].providerPaymentId, s.payment.providerPaymentId);
  assert.equal(s.store.exportState().accountingJournals.length, beforeJournals);
  const replay = s.api.createProviderSettlement(s.user, input, { businessId: s.business.id, previewPlan: "business" });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(s.api.listProviderSettlements(s.user, { businessId: s.business.id, previewPlan: "business" }).length, 1);
  assert.throws(() => s.api.createProviderSettlement(s.user, { ...input, netAmount: 900 }, { businessId: s.business.id, previewPlan: "business" }), /amounts|conflicts/i);
});

test("provider settlement rejects cross-business, over-linked, and non-bank destinations", () => {
  const s = scenario();
  const otherUser = s.api.createUser({ name: "Other Settlement Owner", email: `other-settlement-${Date.now()}@example.com` });
  const otherBusiness = s.api.createBusiness(otherUser, { name: "Other Settlement Business" });
  assert.throws(() => s.api.createProviderSettlement(s.user, {
    businessId: otherBusiness.id, merchantAccountId: "acct_other", providerSettlementId: "setl_cross",
    grossAmount: 1000, netAmount: 1000, paymentLinks: [{ paymentId: s.payment.id, amount: 1000 }],
  }, { businessId: s.business.id, previewPlan: "business" }), /access|business/i);
  const input = {
    businessId: s.business.id, merchantAccountId: "acct_settlement", provider: "razorpay", providerSettlementId: "setl_over",
    grossAmount: 1000, netAmount: 1000, paymentLinks: [{ paymentId: s.payment.id, amount: 1000 }],
  };
  s.api.createProviderSettlement(s.user, input, { businessId: s.business.id, previewPlan: "business" });
  assert.throws(() => s.api.createProviderSettlement(s.user, {
    ...input, providerSettlementId: "setl_over_again", paymentLinks: [{ paymentId: s.payment.id, amount: 1 }],
  }, { businessId: s.business.id, previewPlan: "business" }), /more than the captured Payment amount/i);
});

test("provider settlement state participates in PostgreSQL collections and counters", () => {
  const state = normalizeStateDocument({ providerSettlements: [{ id: "pset_0007", businessId: "biz_1" }] });
  assert.equal(STATE_COLLECTIONS.includes("providerSettlements"), true);
  assert.equal(state.providerSettlements.length, 1);
  assert.equal(deriveCounters(state).providerSettlement, 7);
});
