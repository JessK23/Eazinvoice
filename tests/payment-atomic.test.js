import assert from "node:assert/strict";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { createStore } from "../apps/api/src/store.js";

function scenario({ amount = 10000, requestedAmount = amount, email = `atomic-${Math.random().toString(16).slice(2)}@example.com` } = {}) {
  const store = createStore({}, { persist: false, useSupabaseEmailOtp: false });
  const api = createApi({ store });
  const user = api.createUser({ name: "Atomic Owner", email });
  const businessId = api.listBusinessWorkspaces(user)[0].businessId;
  const customer = api.createCustomer({ ownerUserId: user.id, businessId, name: "Atomic Customer" });
  const invoice = api.createInvoice({
    ownerUserId: user.id,
    businessId,
    customerId: customer.id,
    status: "created",
    currency: "INR",
    items: [{ description: "Atomic service", quantity: 1, rate: amount, gstRate: 0 }],
  }, { user, businessId });
  const created = api.createPaymentRequest({
    invoiceId: invoice.id,
    businessId,
    workspaceOwnerUserId: user.id,
    requestedAmount,
    currency: "INR",
    requestKey: `atomic-request-${Math.random().toString(16).slice(2)}`,
  }, { user, businessId });
  api.beginPaymentRequestProviderIntent(created.paymentRequest.id, user, {}, { businessId });
  api.bindPaymentRequestProviderIntent(created.paymentRequest.id, user, {
    providerOrderId: `order_${Math.random().toString(16).slice(2)}`,
    providerOrder: {
      amount: requestedAmount * 100,
      currency: "INR",
      receipt: `eaz_preq_${created.paymentRequest.id}`,
      notes: { paymentRequestId: created.paymentRequest.id, invoiceId: invoice.id, businessId },
    },
  }, { businessId });
  const request = api.getPaymentRequest(created.paymentRequest.id, user, { businessId });
  return { api, store, user, businessId, customer, invoice, request };
}

function complete(s, paymentId, amountMinor, overrides = {}) {
  return s.api.completeVerifiedProviderPaymentAtomic({
    verifiedPaymentEvidence: true,
    provider: "razorpay",
    providerPaymentId: paymentId,
    providerOrderId: s.request.providerIntent.providerOrderId,
    paymentRequestId: s.request.id,
    businessId: s.businessId,
    workspaceOwnerUserId: s.user.id,
    customerId: s.customer.id,
    amountMinor,
    currency: "INR",
    status: "captured",
    ...overrides,
  });
}

test("PAY-ATOMIC exact payment creates one receipt, allocation, invoice effect, and completion", () => {
  const s = scenario();
  const result = complete(s, "pay_atomic_exact", 1000000);
  assert.equal(result.payment.amount, 10000);
  assert.equal(result.allocation.allocatedAmount, 10000);
  assert.equal(result.paymentRequest.status, "completed");
  assert.equal(s.api.getInvoice(s.invoice.id, s.user, { businessId: s.businessId }).balanceAmount, 0);
  assert.equal(s.api.listPayments(s.user, { businessId: s.businessId }).length, 1);
  assert.equal(s.api.listPaymentAllocations(s.user, { businessId: s.businessId }).length, 1);
});

test("PAY-ATOMIC partial payment consumes the request and leaves the Invoice balance", () => {
  const s = scenario({ amount: 10000, requestedAmount: 4000 });
  const result = complete(s, "pay_atomic_partial", 400000);
  assert.equal(result.allocation.allocatedAmount, 4000);
  assert.equal(result.paymentRequest.status, "completed");
  assert.equal(s.api.getInvoice(s.invoice.id, s.user, { businessId: s.businessId }).balanceAmount, 6000);
  assert.equal(s.api.listPaymentRequests(s.user, { businessId: s.businessId, invoiceId: s.invoice.id }).length, 1);
});

test("completed partial PaymentRequest can be explicitly reissued for the remaining balance", () => {
  const s = scenario({ amount: 10000, requestedAmount: 4000 });
  const result = complete(s, "pay_atomic_reissue_partial", 400000);
  const reissued = s.api.reissuePaymentRequest(s.invoice.id, { requestKey: "pay-atomic-remaining" }, { user: s.user, businessId: s.businessId });
  assert.equal(result.paymentRequest.status, "completed");
  assert.equal(reissued.paymentRequest.requestedAmount, 6000);
  assert.notEqual(reissued.paymentRequest.id, result.paymentRequest.id);
  const intent = s.api.beginPaymentRequestProviderIntent(reissued.paymentRequest.id, s.user, { businessId: s.businessId });
  assert.notEqual(intent.providerIntent.receipt, s.request.providerIntent.receipt);
  assert.equal(intent.providerIntent.paymentRequestId, reissued.paymentRequest.id);
  assert.equal(s.api.listPayments(s.user, { businessId: s.businessId }).length, 1);
  assert.equal(s.api.listPaymentAllocations(s.user, { businessId: s.businessId }).length, 1);
});

test("PAY-ATOMIC derives overpayment remainder from current Invoice capacity", () => {
  const s = scenario({ amount: 10000 });
  s.api.recordInvoicePayment(s.invoice.id, { businessId: s.businessId, amount: 2000, idempotencyKey: "pre-existing-payment" }, { user: s.user, businessId: s.businessId });
  const result = complete(s, "pay_atomic_overpayment", 1000000);
  assert.equal(result.allocation.allocatedAmount, 8000);
  assert.equal(s.api.getInvoice(s.invoice.id, s.user, { businessId: s.businessId }).balanceAmount, 0);
  assert.equal(s.api.getPaymentUnappliedAmount(result.payment.id, { businessId: s.businessId }), 2000);
});

test("PAY-ATOMIC preserves overpayment after a Credit Note-adjusted allocation", () => {
  const s = scenario({ amount: 10000, requestedAmount: 9000 });
  s.api.createSalesCreditNote({
    businessId: s.businessId,
    sourceInvoiceId: s.invoice.id,
    status: "posted",
    currency: "INR",
    items: [{ description: "Credit", quantity: 1, rate: 2000, gstRate: 0 }],
  }, { user: s.user, businessId: s.businessId });
  const result = complete(s, "pay_atomic_credit_overpayment", 900000);
  assert.equal(result.payment.amount, 9000);
  assert.equal(result.allocation.allocatedAmount, 8000);
  assert.equal(s.api.getInvoice(s.invoice.id, s.user, { businessId: s.businessId }).balanceAmount, 0);
  assert.equal(s.api.getPaymentUnappliedAmount(result.payment.id, { businessId: s.businessId }), 1000);
});

test("PAY-ATOMIC preserves a genuine captured payment when Invoice capacity is zero", () => {
  const s = scenario();
  s.api.recordInvoicePayment(s.invoice.id, { businessId: s.businessId, amount: 10000, idempotencyKey: "paid-before-capture" }, { user: s.user, businessId: s.businessId });
  const result = complete(s, "pay_atomic_zero_allocation", 1000000);
  assert.equal(result.allocation, null);
  assert.equal(result.paymentRequest.status, "completed");
  assert.equal(s.api.getPaymentUnappliedAmount(result.payment.id, { businessId: s.businessId }), 10000);
});

test("PAY-ATOMIC provider identity replay does not duplicate Payment or Allocation", () => {
  const s = scenario();
  const first = complete(s, "pay_atomic_replay", 1000000);
  const replay = complete(s, "pay_atomic_replay", 1000000);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(s.api.listPayments(s.user, { businessId: s.businessId }).length, 1);
  assert.equal(s.api.listPaymentAllocations(s.user, { businessId: s.businessId }).length, 1);
  assert.equal(replay.paymentRequest.completedPaymentId, first.paymentRequest.completedPaymentId);
});

test("PAY-ATOMIC preserves a second genuine Payment without rebinding the request", () => {
  const s = scenario();
  const first = complete(s, "pay_atomic_first", 1000000);
  const second = complete(s, "pay_atomic_second", 1000000);
  assert.equal(second.preservedCompletion, true);
  assert.equal(second.paymentRequest.completedPaymentId, first.paymentRequest.completedPaymentId);
  assert.equal(s.api.listPayments(s.user, { businessId: s.businessId }).length, 2);
  assert.equal(s.api.listPaymentAllocations(s.user, { businessId: s.businessId }).length, 1);
  assert.equal(s.api.getPaymentUnappliedAmount(second.payment.id, { businessId: s.businessId }), 10000);
});

test("PAY-ATOMIC preserves captured money while resolving an ambiguous historical request status", () => {
  const s = scenario({ amount: 10000, requestedAmount: 4000 });
  const state = s.store.exportState();
  state.paymentRequests[0].status = "legacy_unknown";
  const malformedStore = createStore(state, { persist: false, useSupabaseEmailOtp: false });
  const malformedApi = createApi({ store: malformedStore });
  const malformed = { ...s, api: malformedApi, request: state.paymentRequests[0] };
  const result = complete(malformed, "pay_atomic_ambiguous_status", 400000);
  assert.equal(result.payment.amount, 4000);
  assert.equal(result.allocation.allocatedAmount, 4000);
  assert.equal(result.paymentRequest.status, "completed");
});

test("PAY-ATOMIC fails closed for non-captured provider evidence", () => {
  const s = scenario();
  assert.throws(() => complete(s, "pay_atomic_authorized", 1000000, { status: "authorized" }), /captured/i);
  assert.equal(s.api.listPayments(s.user, { businessId: s.businessId }).length, 0);
  assert.equal(s.api.getPaymentRequest(s.request.id, s.user, { businessId: s.businessId }).status, "active");
});

test("PAY-ATOMIC rejects conflicting provider identity payloads", () => {
  const s = scenario();
  complete(s, "pay_atomic_conflict", 1000000);
  assert.throws(() => complete(s, "pay_atomic_conflict", 90000), /amount|conflict|PaymentRequest/i);
  assert.throws(() => complete(s, "pay_atomic_other", 1000000, { providerOrderId: "order_conflicting" }), /Order|PaymentRequest|lineage/i);
});

test("PAY-ATOMIC persistence failure leaves no applied local financial state", async () => {
  const setup = scenario();
  const snapshot = setup.store.exportState();
  const persistenceAdapter = {
    load: () => snapshot,
    reload: async () => snapshot,
    mutateState: async (mutation) => {
      await mutation(JSON.parse(JSON.stringify(snapshot)));
      throw new Error("atomic persistence failed");
    },
  };
  const store = createStore(snapshot, { persist: true, persistenceAdapter, useSupabaseEmailOtp: false });
  const api = createApi({ store });
  await assert.rejects(() => api.completeVerifiedProviderPaymentAtomic({
    verifiedPaymentEvidence: true,
    provider: "razorpay",
    providerPaymentId: "pay_atomic_persistence_failure",
    providerOrderId: setup.request.providerIntent.providerOrderId,
    paymentRequestId: setup.request.id,
    businessId: setup.businessId,
    workspaceOwnerUserId: setup.user.id,
    customerId: setup.customer.id,
    amountMinor: 1000000,
    currency: "INR",
    status: "captured",
  }), /atomic persistence failed/i);
  assert.equal(api.listPayments(setup.user, { businessId: setup.businessId }).length, 0);
  assert.equal(api.getPaymentRequest(setup.request.id, setup.user, { businessId: setup.businessId }).status, "active");
});
