import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { createStore } from "../apps/api/src/store.js";

function scenario() {
  const store = createStore({}, { persist: false, useSupabaseEmailOtp: false });
  const api = createApi({ store });
  const user = api.createUser({ name: "Payment Identity Owner", email: `payment-identity-${crypto.randomBytes(4).toString("hex")}@example.com` });
  const business = api.createBusiness(user, { name: "Payment Identity Business" });
  const invoice = api.createInvoice({
    ownerUserId: user.id,
    businessId: business.id,
    status: "created",
    currency: "INR",
    invoiceDate: "2026-10-03",
    items: [{ description: "Identity test", quantity: 1, rate: 10000, gstRate: 0 }],
  }, { user, businessId: business.id });
  return { api, store, user, business, invoice };
}

function providerPayment(s, overrides = {}) {
  return s.api.recordInvoicePayment((s.paymentInvoice || s.invoice).id, {
    amount: 10000,
    currency: "INR",
    gateway: "RazorPay",
    gatewayPaymentId: "pay_identity_1",
    gatewayOrderId: "order_identity_1",
    status: "captured",
    ...overrides,
  }, { user: s.user, businessId: s.business.id });
}

test("external provider Payment identity is canonical and replay-safe", async () => {
  const s = scenario();
  const first = await providerPayment(s);
  const replay = await providerPayment(s, { reference: "different-webhook-event" });

  assert.equal(first.payment.provider, "razorpay");
  assert.equal(first.payment.providerPaymentId, "pay_identity_1");
  assert.equal(first.payment.providerOrderId, "order_identity_1");
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.payment.id, first.payment.id);
  assert.equal(s.store.exportState().payments.length, 1);
});

test("same external identity rejects changed financial or lineage payloads", async () => {
  const s = scenario();
  await providerPayment(s);
  assert.throws(() => providerPayment(s, { amount: 9000 }), /identity.*amount/i);
  assert.throws(() => providerPayment(s, { currency: "USD" }), /identity.*currency/i);
  assert.throws(() => providerPayment(s, { gatewayOrderId: "order_other" }), /identity.*order/i);
});

test("external identity is scoped by business and provider", async () => {
  const s = scenario();
  await providerPayment(s);
  const otherUser = s.api.createUser({ name: "Other Owner", email: `other-${crypto.randomBytes(4).toString("hex")}@example.com` });
  const otherBusiness = s.api.createBusiness(otherUser, { name: "Other Business" });
  const otherInvoice = s.api.createInvoice({
    ownerUserId: otherUser.id,
    businessId: otherBusiness.id,
    status: "created",
    currency: "INR",
    invoiceDate: "2026-10-03",
    items: [{ description: "Other identity test", quantity: 1, rate: 10000, gstRate: 0 }],
  }, { user: otherUser, businessId: otherBusiness.id });
  const otherPayment = await s.api.recordInvoicePayment(otherInvoice.id, {
    amount: 10000,
    currency: "INR",
    gateway: "razorpay",
    gatewayPaymentId: "pay_identity_1",
    gatewayOrderId: "order_other_business",
  }, { user: otherUser, businessId: otherBusiness.id });
  assert.notEqual(otherPayment.payment.id, s.store.exportState().payments[0].id);

  const secondInvoice = s.api.createInvoice({
    ownerUserId: s.user.id,
    businessId: s.business.id,
    status: "created",
    currency: "INR",
    invoiceDate: "2026-10-03",
    items: [{ description: "Second identity test", quantity: 1, rate: 10000, gstRate: 0 }],
  }, { user: s.user, businessId: s.business.id });
  s.paymentInvoice = secondInvoice;
  const differentProvider = await providerPayment(s, { gateway: "stripe", gatewayOrderId: "stripe_order_1" });
  assert.equal(differentProvider.payment.provider, "stripe");
  assert.equal(s.store.exportState().payments.length, 3);
});

test("legacy gateway identity remains readable without provider fields", async () => {
  const s = scenario();
  const state = s.store.exportState();
  state.payments.push({
    id: "pay_legacy_identity",
    ownerUserId: s.user.id,
    businessId: s.business.id,
    invoiceId: s.invoice.id,
    amount: 10000,
    currency: "INR",
    status: "captured",
    gateway: "razorpay",
    gatewayPaymentId: "pay_legacy_identity",
    gatewayOrderId: "order_legacy_identity",
  });
  s.store = createStore(state, { persist: false, useSupabaseEmailOtp: false });
  s.api = createApi({ store: s.store });
  const replay = await s.api.recordInvoicePayment(s.invoice.id, {
    amount: 10000,
    currency: "INR",
    gateway: "razorpay",
    gatewayPaymentId: "pay_legacy_identity",
    gatewayOrderId: "order_legacy_identity",
  }, { user: s.user, businessId: s.business.id });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(s.store.exportState().payments.length, 1);
});

test("manual payment and vendor-payment paths remain available", () => {
  const s = scenario();
  const manual = s.api.recordInvoicePayment(s.invoice.id, { amount: 10000, mode: "manual", reference: "receipt-1" }, { user: s.user, businessId: s.business.id });
  assert.equal(manual.payment.provider, undefined);
  assert.equal(manual.payment.gatewayPaymentId, "");
});

test("partial provider identities fail closed while genuine manual payments remain valid", () => {
  const s = scenario();
  assert.throws(() => providerPayment(s, { gatewayPaymentId: undefined }), /identity.*incomplete/i);
  assert.throws(() => providerPayment(s, { gateway: undefined, gatewayPaymentId: undefined, providerPaymentId: "pay_without_provider" }), /identity.*incomplete/i);
  assert.throws(() => providerPayment(s, { gateway: undefined, gatewayPaymentId: undefined, gatewayOrderId: "order_without_payment" }), /identity.*incomplete/i);
  const manual = s.api.recordInvoicePayment(s.invoice.id, { amount: 10000, mode: "manual" }, { user: s.user, businessId: s.business.id });
  assert.equal(manual.payment.gateway, "");
});

test("canonical and legacy provider lineage conflicts fail closed", () => {
  const s = scenario();
  assert.throws(() => s.api.recordInvoicePayment(s.invoice.id, {
    amount: 10000, provider: "razorpay", providerPaymentId: "pay_A", gateway: "razorpay", gatewayPaymentId: "pay_B",
  }, { user: s.user, businessId: s.business.id }), /payment identities conflict/i);
  assert.throws(() => s.api.recordInvoicePayment(s.invoice.id, {
    amount: 10000, provider: "razorpay", providerPaymentId: "pay_A", providerOrderId: "order_A", gateway: "razorpay", gatewayPaymentId: "pay_A", gatewayOrderId: "order_B",
  }, { user: s.user, businessId: s.business.id }), /order identities conflict/i);

  const matching = s.api.recordInvoicePayment(s.invoice.id, {
    amount: 10000, provider: "RazorPay", providerPaymentId: "pay_matching", providerOrderId: "order_matching", gateway: "razorpay", gatewayPaymentId: "pay_matching", gatewayOrderId: "order_matching",
  }, { user: s.user, businessId: s.business.id });
  assert.equal(matching.payment.provider, "razorpay");
  assert.equal(s.api.recordInvoicePayment(s.invoice.id, {
    amount: 10000, provider: "razorpay", providerPaymentId: "pay_matching", providerOrderId: "order_matching", gateway: "razorpay", gatewayPaymentId: "pay_matching", gatewayOrderId: "order_matching",
  }, { user: s.user, businessId: s.business.id }).idempotentReplay, true);
});

test("provider identity cannot hide behind a conflicting idempotency key", () => {
  const s = scenario();
  const first = s.api.recordInvoicePayment(s.invoice.id, {
    amount: 4000, gateway: "razorpay", gatewayPaymentId: "pay_idem_A", gatewayOrderId: "order_idem_A", idempotencyKey: "idem_conflict",
  }, { user: s.user, businessId: s.business.id });
  assert.equal(first.payment.providerPaymentId, "pay_idem_A");
  assert.throws(() => s.api.recordInvoicePayment(s.invoice.id, {
    amount: 4000, gateway: "razorpay", gatewayPaymentId: "pay_idem_B", gatewayOrderId: "order_idem_B", idempotencyKey: "idem_conflict",
  }, { user: s.user, businessId: s.business.id }), /identity.*conflicts/i);
});

test("conflicting historical canonical and legacy identity fails closed", () => {
  const s = scenario();
  const state = s.store.exportState();
  state.payments.push({
    id: "pay_corrupt_identity",
    ownerUserId: s.user.id,
    businessId: s.business.id,
    invoiceId: s.invoice.id,
    amount: 10000,
    currency: "INR",
    status: "captured",
    provider: "razorpay",
    providerPaymentId: "pay_canonical",
    providerOrderId: "order_canonical",
    gateway: "razorpay",
    gatewayPaymentId: "pay_legacy",
    gatewayOrderId: "order_legacy",
  });
  const store = createStore(state, { persist: false, useSupabaseEmailOtp: false });
  const api = createApi({ store });
  assert.throws(() => api.recordInvoicePayment(s.invoice.id, {
    amount: 10000, gateway: "razorpay", gatewayPaymentId: "pay_canonical", gatewayOrderId: "order_canonical",
  }, { user: s.user, businessId: s.business.id }), /identities conflict/i);
});

test("authoritative external Payment mutation surfaces persistence rejection", async () => {
  const persistenceAdapter = {
    load: () => ({}),
    save: () => null,
    mutateState: async () => { throw new Error("persistence unavailable"); },
  };
  const store = createStore({}, { persist: false, persistenceAdapter, useSupabaseEmailOtp: false });
  const api = createApi({ store });
  const user = api.createUser({ name: "Failure Owner", email: `failure-${crypto.randomBytes(4).toString("hex")}@example.com` });
  const business = api.createBusiness(user, { name: "Failure Business" });
  const invoice = api.createInvoice({ ownerUserId: user.id, businessId: business.id, status: "created", currency: "INR", items: [{ description: "Failure test", quantity: 1, rate: 1000, gstRate: 0 }] }, { user, businessId: business.id });
  await assert.rejects(() => api.recordInvoicePayment(invoice.id, { amount: 1000, gateway: "razorpay", gatewayPaymentId: "pay_failure", gatewayOrderId: "order_failure" }, { user, businessId: business.id }), /persistence unavailable/i);
});
