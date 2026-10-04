import assert from "node:assert/strict";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { createServer } from "../apps/api/src/server.js";
import { createStore } from "../apps/api/src/store.js";

function scenario({ persistenceAdapter, ownerName = "Payment Request Owner", email = "payment-request-owner@example.com" } = {}) {
  const store = createStore({}, {
    persist: persistenceAdapter ? true : false,
    persistenceAdapter,
    useSupabaseEmailOtp: false,
  });
  const api = createApi({ store });
  const user = api.createUser({ name: ownerName, email });
  const businessId = api.listBusinessWorkspaces(user)[0].businessId;
  const customer = api.createCustomer({ ownerUserId: user.id, businessId, name: "Payment Request Customer" });
  const invoice = api.createInvoice({
    ownerUserId: user.id,
    businessId,
    customerId: customer.id,
    status: "created",
    currency: "INR",
    invoiceDate: "2026-10-02",
    items: [{ description: "Payment Request service", quantity: 1, rate: 10000, gstRate: 0 }],
  }, { user, businessId });
  return { api, store, user, businessId, customer, invoice };
}

function requestInput(s, overrides = {}) {
  return {
    invoiceId: s.invoice.id,
    businessId: s.businessId,
    workspaceOwnerUserId: s.user.id,
    requestedAmount: 4000,
    currency: "INR",
    requestKey: "pay-req-1",
    ...overrides,
  };
}

test("PaymentRequest creation is invoice-bound, provider-neutral, persisted, and financially non-effecting", () => {
  const s = scenario();
  const before = s.api.exportDataSnapshot();
  const result = s.api.createPaymentRequest(requestInput(s), { user: s.user, businessId: s.businessId });
  assert.equal(result.paymentRequest.documentType, "INVOICE");
  assert.equal(result.paymentRequest.invoiceId, s.invoice.id);
  assert.equal(result.paymentRequest.requestedAmount, 4000);
  assert.equal(result.paymentRequest.provider, "");
  assert.equal(result.paymentRequest.status, "active");
  assert.equal(s.api.getInvoice(s.invoice.id, s.user, { businessId: s.businessId }).balanceAmount, s.invoice.balanceAmount);
  assert.equal(s.api.listPayments(s.user, { businessId: s.businessId }).length, 0);
  assert.equal(s.api.listPaymentAllocations(s.user, { businessId: s.businessId }).length, 0);
  const after = s.api.exportDataSnapshot();
  assert.equal(after.invoices[0].balanceAmount, before.invoices[0].balanceAmount);
  assert.equal(after.payments.length, before.payments.length);
  assert.equal(after.paymentAllocations.length, before.paymentAllocations.length);
  assert.equal(after.accountingJournals.length, before.accountingJournals.length);
  assert.equal(after.bankStatementLines.length, before.bankStatementLines.length);
  assert.equal(s.api.listPaymentRequests(s.user, { businessId: s.businessId, invoiceId: s.invoice.id }).length, 1);
});

test("PaymentRequest validates positive amount, outstanding balance, and currency", () => {
  const s = scenario();
  assert.throws(() => s.api.createPaymentRequest(requestInput(s, { requestedAmount: 0 })), /greater than zero/i);
  assert.throws(() => s.api.createPaymentRequest(requestInput(s, { requestedAmount: -1, requestKey: "negative" })), /greater than zero/i);
  assert.throws(() => s.api.createPaymentRequest(requestInput(s, { requestedAmount: 10001, requestKey: "over" })), /outstanding/i);
  assert.throws(() => s.api.createPaymentRequest(requestInput(s, { currency: "USD", requestKey: "currency" })), /currency/i);
});

test("PaymentRequest idempotency replays identical intent and rejects changed intent", () => {
  const s = scenario();
  const first = s.api.createPaymentRequest(requestInput(s), { user: s.user, businessId: s.businessId });
  const replay = s.api.createPaymentRequest(requestInput(s), { user: s.user, businessId: s.businessId });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.paymentRequest.id, first.paymentRequest.id);
  assert.throws(() => s.api.createPaymentRequest(requestInput(s, { requestedAmount: 5000 })), /idempotency/i);
  assert.throws(() => s.api.createPaymentRequest(requestInput(s, { currency: "USD" })), /idempotency|currency/i);
  const otherInvoice = s.api.createInvoice({ ownerUserId: s.user.id, businessId: s.businessId, status: "created", items: [{ description: "Other", quantity: 1, rate: 1000 }] }, { user: s.user, businessId: s.businessId });
  assert.throws(() => s.api.createPaymentRequest(requestInput(s, { invoiceId: otherInvoice.id, requestedAmount: 1000 })), /idempotency/i);
});

test("only one active PaymentRequest owns an Invoice collection authority", () => {
  const s = scenario();
  const first = s.api.createPaymentRequest(requestInput(s, { requestedAmount: 6000, requestKey: "reserve-a" }), { user: s.user, businessId: s.businessId });
  assert.equal(first.paymentRequest.status, "active");
  const replay = s.api.createPaymentRequest(requestInput(s, { requestedAmount: 6000, requestKey: "reserve-a" }), { user: s.user, businessId: s.businessId });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.paymentRequest.id, first.paymentRequest.id);
  assert.throws(() => s.api.createPaymentRequest(requestInput(s, { requestedAmount: 4000, requestKey: "reserve-b" })), /active payment request/i);
  assert.throws(() => s.api.createPaymentRequest(requestInput(s, { requestedAmount: 1, requestKey: "reserve-c" })), /active payment request/i);
  assert.equal(s.api.getInvoice(s.invoice.id, s.user, { businessId: s.businessId }).balanceAmount, 10000);
});

test("ambiguous PaymentRequest statuses fail closed for create, reissue, and provider intent", () => {
  const ambiguousStatuses = [undefined, null, "", "   ", "mystery", { malformed: true }];
  for (const status of ambiguousStatuses) {
    const s = scenario({ ownerName: `Ambiguous ${String(status)}`, email: `ambiguous-${Math.random().toString(16).slice(2)}@example.com` });
    const created = s.api.createPaymentRequest(requestInput(s, { requestKey: `ambiguous-${Math.random().toString(16).slice(2)}` }), { user: s.user, businessId: s.businessId });
    const state = s.store.exportState();
    if (status === undefined) delete state.paymentRequests[0].status;
    else state.paymentRequests[0].status = status;
    const malformedStore = createStore(state, { persist: false, useSupabaseEmailOtp: false });
    const malformedApi = createApi({ store: malformedStore });
    const user = state.users.find((entry) => entry.id === s.user.id);
    assert.throws(() => malformedApi.createPaymentRequest(requestInput({ ...s, user }, { requestKey: `different-${Math.random().toString(16).slice(2)}` }), { user, businessId: s.businessId }), /ambiguous/i);
    assert.throws(() => malformedApi.reissuePaymentRequest(s.invoice.id, { requestKey: `reissue-${Math.random().toString(16).slice(2)}` }, { user, businessId: s.businessId }), /ambiguous/i);
    assert.throws(() => malformedApi.beginPaymentRequestProviderIntent(created.paymentRequest.id, user, { businessId: s.businessId }), /ambiguous/i);
    assert.equal(malformedApi.getPaymentRequest(created.paymentRequest.id, user, { businessId: s.businessId }).providerIntent, null);
  }
});

test("completed, expired, and cancelled statuses retain valid reissue behavior", async () => {
  for (const status of ["completed", "expired", "cancelled"]) {
    const s = scenario({ ownerName: `Valid ${status}`, email: `valid-${status}-${Math.random().toString(16).slice(2)}@example.com` });
    const created = s.api.createPaymentRequest(requestInput(s, { requestKey: `valid-${status}` }), { user: s.user, businessId: s.businessId });
    const state = s.store.exportState();
    state.paymentRequests[0].status = status;
    if (status === "expired") state.paymentRequests[0].expiresAt = new Date(Date.now() - 1000).toISOString();
    const validStore = createStore(state, { persist: false, useSupabaseEmailOtp: false });
    const validApi = createApi({ store: validStore });
    const user = state.users.find((entry) => entry.id === s.user.id);
    const reissued = validApi.reissuePaymentRequest(s.invoice.id, { requestKey: `reissue-${status}` }, { user, businessId: s.businessId });
    assert.equal(reissued.paymentRequest.status, "active");
    assert.notEqual(reissued.paymentRequest.id, created.paymentRequest.id);
  }
});

test("remaining-balance reissue derives current canonical outstanding and stays financially inert", () => {
  const s = scenario();
  const first = s.api.createPaymentRequest(requestInput(s, { requestedAmount: 4000, requestKey: "partial-request" }), { user: s.user, businessId: s.businessId });
  s.api.cancelPaymentRequest(first.paymentRequest.id, {}, { user: s.user, businessId: s.businessId });
  s.api.recordInvoicePayment(s.invoice.id, { businessId: s.businessId, amount: 4000, currency: "INR", idempotencyKey: "partial-before-reissue" }, { user: s.user, businessId: s.businessId });
  const before = s.api.exportDataSnapshot();
  const reissued = s.api.reissuePaymentRequest(s.invoice.id, { requestKey: "remaining-request" }, { user: s.user, businessId: s.businessId });
  assert.equal(reissued.paymentRequest.requestedAmount, 6000);
  assert.notEqual(reissued.paymentRequest.id, first.paymentRequest.id);
  assert.equal(reissued.paymentRequest.invoiceId, s.invoice.id);
  assert.equal(s.api.listPayments(s.user, { businessId: s.businessId }).length, before.payments.length);
  assert.equal(s.api.listPaymentAllocations(s.user, { businessId: s.businessId }).length, before.paymentAllocations.length);
  assert.equal(s.api.exportDataSnapshot().accountingJournals.length, before.accountingJournals.length);
});

test("remaining-balance reissue rejects caller-supplied stale amount and zero capacity", () => {
  const s = scenario();
  assert.throws(() => s.api.reissuePaymentRequest(s.invoice.id, { requestedAmount: 4000, requestKey: "stale-amount" }, { user: s.user, businessId: s.businessId }), /outstanding authority/i);
  const paid = s.api.recordInvoicePayment(s.invoice.id, { businessId: s.businessId, amount: 10000, currency: "INR", idempotencyKey: "paid-before-reissue" }, { user: s.user, businessId: s.businessId });
  assert.equal(paid.payment.amount, 10000);
  assert.throws(() => s.api.reissuePaymentRequest(s.invoice.id, { requestKey: "zero-balance" }, { user: s.user, businessId: s.businessId }), /fully paid|no collectible outstanding/i);
});

test("remaining-balance reissue uses Credit Note-adjusted capacity and preserves historical amounts", () => {
  const s = scenario();
  const first = s.api.createPaymentRequest(requestInput(s, { requestedAmount: 8000, requestKey: "credit-request" }), { user: s.user, businessId: s.businessId });
  s.api.cancelPaymentRequest(first.paymentRequest.id, {}, { user: s.user, businessId: s.businessId });
  s.api.createSalesCreditNote({
    businessId: s.businessId,
    sourceInvoiceId: s.invoice.id,
    status: "posted",
    currency: "INR",
    items: [{ description: "Credit", quantity: 1, rate: 2000, gstRate: 0 }],
  }, { user: s.user, businessId: s.businessId });
  const reissued = s.api.reissuePaymentRequest(s.invoice.id, { requestKey: "credit-reissue" }, { user: s.user, businessId: s.businessId });
  assert.equal(first.paymentRequest.requestedAmount, 8000);
  assert.equal(reissued.paymentRequest.requestedAmount, 8000);
  assert.notEqual(reissued.paymentRequest.id, first.paymentRequest.id);
});

test("active reissue retries converge on one collection authority", () => {
  const s = scenario();
  const first = s.api.reissuePaymentRequest(s.invoice.id, { requestKey: "active-reissue" }, { user: s.user, businessId: s.businessId });
  const replay = s.api.reissuePaymentRequest(s.invoice.id, { requestKey: "different-retry-key" }, { user: s.user, businessId: s.businessId });
  assert.equal(replay.paymentRequest.id, first.paymentRequest.id);
  assert.equal(replay.activeAuthorityReplay, true);
});

test("cancelled and expired PaymentRequests release reservation without creating money movement", async () => {
  const s = scenario();
  const cancellable = s.api.createPaymentRequest(requestInput(s, { requestedAmount: 6000, requestKey: "cancel-me" }), { user: s.user, businessId: s.businessId });
  const cancelled = s.api.cancelPaymentRequest(cancellable.paymentRequest.id, {}, { user: s.user, businessId: s.businessId });
  assert.equal(cancelled.paymentRequest.status, "cancelled");
  const replacement = s.api.createPaymentRequest(requestInput(s, { requestedAmount: 10000, requestKey: "replacement" }), { user: s.user, businessId: s.businessId });
  assert.equal(replacement.paymentRequest.status, "active");

  const expiring = scenario({ ownerName: "Expiry Owner", email: "payment-request-expiry@example.com" });
  const request = expiring.api.createPaymentRequest(requestInput(expiring, { requestedAmount: 1000, requestKey: "expires", expiresAt: new Date(Date.now() + 25).toISOString() }), { user: expiring.user, businessId: expiring.businessId });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(expiring.api.getPaymentRequest(request.paymentRequest.id, expiring.user, { businessId: expiring.businessId }).status, "expired");
  const afterExpiry = expiring.api.createPaymentRequest(requestInput(expiring, { requestedAmount: 10000, requestKey: "after-expiry" }), { user: expiring.user, businessId: expiring.businessId });
  assert.equal(afterExpiry.paymentRequest.status, "active");
  assert.equal(expiring.api.listPayments(expiring.user, { businessId: expiring.businessId }).length, 0);
});

test("PaymentRequest terminal completion requires verified evidence and cannot be reused", () => {
  const s = scenario();
  const created = s.api.createPaymentRequest(requestInput(s), { user: s.user, businessId: s.businessId });
  assert.throws(() => s.api.completePaymentRequest(created.paymentRequest.id, {}, { user: s.user, businessId: s.businessId }), /verified provider evidence|canonical Payment/i);
  const receipt = s.api.recordCustomerReceipt({
    customerId: s.customer.id,
    businessId: s.businessId,
    amount: 4000,
    currency: "INR",
    provider: "razorpay",
    providerPaymentId: "pay_verified_1",
  }, { user: s.user, businessId: s.businessId });
  const completed = s.api.completePaymentRequest(created.paymentRequest.id, {
    verifiedPaymentEvidence: true,
    paymentId: receipt.payment.id,
  }, { user: s.user, businessId: s.businessId });
  assert.equal(completed.paymentRequest.status, "completed");
  assert.equal(completed.paymentRequest.completedPaymentId, receipt.payment.id);
  assert.throws(() => s.api.cancelPaymentRequest(created.paymentRequest.id, {}, { user: s.user, businessId: s.businessId }), /terminal/i);
  const replay = s.api.completePaymentRequest(created.paymentRequest.id, {
    verifiedPaymentEvidence: true,
    paymentId: receipt.payment.id,
  }, { user: s.user, businessId: s.businessId });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(s.api.listPayments(s.user, { businessId: s.businessId }).length, 1);
});

test("PaymentRequest completion requires explicit persisted captured status", () => {
  const invalidStatuses = [
    { label: "absent", mutate: (payment) => delete payment.status },
    { label: "blank", value: "" },
    { label: "whitespace", value: "   " },
    { label: "null", value: null },
    { label: "authorized", value: "authorized" },
    { label: "failed", value: "failed" },
    { label: "refunded", value: "refunded" },
    { label: "unknown", value: "provider_unknown" },
  ];

  for (const invalid of invalidStatuses) {
    const s = scenario({ ownerName: `Status Guard ${invalid.label}`, email: `status-guard-${invalid.label}@example.com` });
    const created = s.api.createPaymentRequest(requestInput(s, { requestKey: `status-${invalid.label}` }), { user: s.user, businessId: s.businessId });
    const receipt = s.api.recordCustomerReceipt({
      customerId: s.customer.id,
      businessId: s.businessId,
      amount: 4000,
      currency: "INR",
      provider: "razorpay",
      providerPaymentId: `pay_status_${invalid.label}`,
    }, { user: s.user, businessId: s.businessId }).payment;
    const snapshot = s.store.exportState();
    const persistedPayment = snapshot.payments.find((payment) => payment.id === receipt.id);
    if (Object.prototype.hasOwnProperty.call(invalid, "value")) persistedPayment.status = invalid.value;
    else invalid.mutate(persistedPayment);
    const alteredStore = createStore(snapshot, { persist: false, useSupabaseEmailOtp: false });
    const alteredApi = createApi({ store: alteredStore });

    assert.throws(() => alteredApi.completePaymentRequest(created.paymentRequest.id, {
      verifiedPaymentEvidence: true,
      paymentId: receipt.id,
      status: "captured",
    }, { user: s.user, businessId: s.businessId }), /explicitly captured/i, invalid.label);
    const unchanged = alteredApi.getPaymentRequest(created.paymentRequest.id, s.user, { businessId: s.businessId });
    assert.equal(unchanged.status, "active", invalid.label);
    assert.ok(!unchanged.completedAt, invalid.label);
  }
});

test("PaymentRequest completion accepts an explicitly persisted captured status", () => {
  const s = scenario({ ownerName: "Explicit Captured Status", email: "explicit-captured-status@example.com" });
  const created = s.api.createPaymentRequest(requestInput(s, { requestKey: "explicit-captured" }), { user: s.user, businessId: s.businessId });
  const receipt = s.api.recordCustomerReceipt({
    customerId: s.customer.id,
    businessId: s.businessId,
    amount: 4000,
    currency: "INR",
    provider: "razorpay",
    providerPaymentId: "pay_explicit_captured",
  }, { user: s.user, businessId: s.businessId }).payment;
  const snapshot = s.store.exportState();
  const persistedPayment = snapshot.payments.find((payment) => payment.id === receipt.id);
  persistedPayment.status = " captured ";
  const alteredStore = createStore(snapshot, { persist: false, useSupabaseEmailOtp: false });
  const alteredApi = createApi({ store: alteredStore });
  const completed = alteredApi.completePaymentRequest(created.paymentRequest.id, {
    verifiedPaymentEvidence: true,
    paymentId: receipt.id,
    status: "failed",
  }, { user: s.user, businessId: s.businessId });
  assert.equal(completed.paymentRequest.status, "completed");
  assert.equal(completed.paymentRequest.completedPaymentId, receipt.id);
});

test("PaymentRequest completion requires persisted receipt authority and cannot rebind", () => {
  const s = scenario({ ownerName: "Completion Guard", email: "completion-guard@example.com" });
  const created = s.api.createPaymentRequest(requestInput(s, { requestKey: "completion-guard" }), { user: s.user, businessId: s.businessId });
  assert.throws(() => s.api.completePaymentRequest(created.paymentRequest.id, {
    verifiedPaymentEvidence: true,
    providerReference: "client-only-reference",
  }, { user: s.user, businessId: s.businessId }), /canonical Payment/i);
  const payment = s.api.recordCustomerReceipt({
    customerId: s.customer.id,
    businessId: s.businessId,
    amount: 4000,
    currency: "INR",
    provider: "razorpay",
    providerPaymentId: "pay_guard_a",
  }, { user: s.user, businessId: s.businessId }).payment;
  const completed = s.api.completePaymentRequest(created.paymentRequest.id, { verifiedPaymentEvidence: true, paymentId: payment.id }, { user: s.user, businessId: s.businessId });
  assert.equal(completed.paymentRequest.completedPaymentId, payment.id);
  const otherPayment = s.api.recordCustomerReceipt({
    customerId: s.customer.id,
    businessId: s.businessId,
    amount: 1000,
    currency: "INR",
    provider: "razorpay",
    providerPaymentId: "pay_guard_b",
  }, { user: s.user, businessId: s.businessId }).payment;
  assert.throws(() => s.api.completePaymentRequest(created.paymentRequest.id, { verifiedPaymentEvidence: true, paymentId: otherPayment.id }, { user: s.user, businessId: s.businessId }), /rebound|completed/i);
});

test("PaymentRequest completion rejects legacy direct-to-A/R Payments", () => {
  const s = scenario({ ownerName: "Legacy Completion Guard", email: "legacy-completion-guard@example.com" });
  const created = s.api.createPaymentRequest(requestInput(s, { requestKey: "legacy-completion-guard" }), { user: s.user, businessId: s.businessId });
  const legacyPayment = s.api.recordInvoicePayment(s.invoice.id, {
    businessId: s.businessId,
    amount: 4000,
    provider: "razorpay",
    providerPaymentId: "pay_legacy_direct",
  }, { user: s.user, businessId: s.businessId }).payment;
  assert.throws(() => s.api.completePaymentRequest(created.paymentRequest.id, {
    verifiedPaymentEvidence: true,
    paymentId: legacyPayment.id,
  }, { user: s.user, businessId: s.businessId }), /customer receipt|receipt-first|accounting/i);
});

test("PaymentRequest tenant scope prevents cross-business create, read, and cancel", () => {
  const owner = scenario({ ownerName: "Tenant A", email: "payment-request-tenant-a@example.com" });
  const otherUser = owner.api.createUser({ name: "Tenant B", email: "payment-request-tenant-b@example.com" });
  const otherBusinessId = owner.api.listBusinessWorkspaces(otherUser)[0].businessId;
  const created = owner.api.createPaymentRequest(requestInput(owner), { user: owner.user, businessId: owner.businessId });
  assert.equal(owner.api.createPaymentRequest({ invoiceId: owner.invoice.id, businessId: otherBusinessId, requestedAmount: 1000 }, { user: otherUser, businessId: otherBusinessId }), null);
  assert.equal(owner.api.getPaymentRequest(created.paymentRequest.id, otherUser, { businessId: otherBusinessId }), null);
  assert.equal(owner.api.cancelPaymentRequest(created.paymentRequest.id, {}, { user: otherUser, businessId: otherBusinessId }), null);
  assert.equal(owner.api.getPaymentRequest(created.paymentRequest.id, owner.user, { businessId: owner.businessId }).status, "active");
});

test("PaymentRequest persistence rejection prevents apparent success", async () => {
  let committed = {};
  const persistenceAdapter = {
    load: () => ({}),
    reload: async () => committed,
    save: (snapshot) => {
      if (snapshot.paymentRequests.length) return Promise.reject(new Error("payment request persistence failed"));
      committed = JSON.parse(JSON.stringify(snapshot));
      return undefined;
    },
  };
  const s = scenario({ persistenceAdapter, email: "payment-request-persistence@example.com" });
  await assert.rejects(
    () => s.api.createPaymentRequest(requestInput(s), { user: s.user, businessId: s.businessId }),
    /payment request persistence failed/i,
  );
});

test("PaymentRequest HTTP API exposes list, get, create, and cancel only", async () => {
  const server = createServer({ persist: false, useSupabaseEmailOtp: false });
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { method = "GET", token, body } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { response, payload: await response.json() };
  }
  try {
    const otp = await request("/auth/email-otp/request", { method: "POST", body: { mode: "signup", email: "payment-request-http@example.com", phone: "9123456780" } });
    const signup = await request("/auth/signup", {
      method: "POST",
      body: { name: "Payment Request HTTP", email: "payment-request-http@example.com", password: "Secure123", phone: "9123456780", otp: otp.payload.devOtp },
    });
    assert.equal(signup.response.status, 201);
    const user = signup.payload.user;
    const businessId = server.eazinvoiceApi.listBusinessWorkspaces(user)[0].businessId;
    const invoice = server.eazinvoiceApi.createInvoice({
      ownerUserId: user.id,
      businessId,
      status: "created",
      items: [{ description: "HTTP request service", quantity: 1, rate: 1000 }],
    }, { user, businessId });
    const created = await request("/payment-requests", {
      method: "POST",
      token: signup.payload.token,
      body: { invoiceId: invoice.id, businessId, requestedAmount: 1000, currency: "INR", requestKey: "http-request-1" },
    });
    assert.equal(created.response.status, 201);
    const id = created.payload.paymentRequest.id;
    const listed = await request(`/payment-requests?invoiceId=${encodeURIComponent(invoice.id)}`, { token: signup.payload.token });
    assert.equal(listed.response.status, 200);
    assert.equal(listed.payload.length, 1);
    const fetched = await request(`/payment-requests/${encodeURIComponent(id)}`, { token: signup.payload.token });
    assert.equal(fetched.response.status, 200);
    const cancelled = await request(`/payment-requests/${encodeURIComponent(id)}/cancel`, { method: "POST", token: signup.payload.token, body: {} });
    assert.equal(cancelled.response.status, 200);
    assert.equal(cancelled.payload.paymentRequest.status, "cancelled");
    const reissued = await request(`/invoices/${encodeURIComponent(invoice.id)}/payment-requests/reissue`, {
      method: "POST",
      token: signup.payload.token,
      body: { requestKey: "http-request-reissue" },
    });
    assert.equal(reissued.response.status, 201);
    assert.equal(reissued.payload.paymentRequest.requestedAmount, 1000);
    assert.notEqual(reissued.payload.paymentRequest.id, id);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
