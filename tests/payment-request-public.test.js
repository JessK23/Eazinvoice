import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { createServer } from "../apps/api/src/server.js";
import { createStore } from "../apps/api/src/store.js";

function scenario() {
  const store = createStore({}, { persist: false, useSupabaseEmailOtp: false });
  const api = createApi({ store });
  const user = api.createUser({ name: "Public Payment Owner", email: `public-${crypto.randomBytes(4).toString("hex")}@example.com` });
  const businessId = api.listBusinessWorkspaces(user)[0].businessId;
  const customer = api.createCustomer({ ownerUserId: user.id, businessId, name: "Public Customer" });
  const invoice = api.createInvoice({
    ownerUserId: user.id,
    businessId,
    customerId: customer.id,
    status: "created",
    invoiceNumber: "PUB/2026/0001",
    currency: "INR",
    items: [{ description: "Public payment service", quantity: 1, rate: 10000, gstRate: 0 }],
  }, { user, businessId });
  const created = api.createPaymentRequest({
    invoiceId: invoice.id,
    businessId,
    workspaceOwnerUserId: user.id,
    requestedAmount: 8000,
    currency: "INR",
    requestKey: `public-${crypto.randomBytes(4).toString("hex")}`,
  }, { user, businessId });
  return { api, store, user, businessId, invoice, request: created.paymentRequest };
}

test("public PaymentRequest identity and projection are opaque and financially inert", () => {
  const s = scenario();
  assert.match(s.request.publicAccessToken, /^eaz_payreq_[A-Za-z0-9_-]{43}$/);
  const before = s.api.exportDataSnapshot();
  const view = s.api.getPublicPaymentRequest(s.request.publicAccessToken);
  assert.equal(view.status, "active");
  assert.equal(view.amount, 8000);
  assert.equal(view.currency, "INR");
  assert.equal(view.paymentAllowed, true);
  assert.equal(view.invoice.number, "PUB/2026/0001");
  assert.equal("publicAccessToken" in view, false);
  assert.equal("businessId" in view, false);
  assert.equal("invoiceId" in view, false);
  assert.equal("providerIntent" in view, false);
  assert.equal(s.api.getPublicPaymentRequest(s.request.id), null);
  assert.equal(s.api.getPublicPaymentRequest(`${s.request.publicAccessToken}x`), null);
  const after = s.api.exportDataSnapshot();
  assert.equal(after.payments.length, before.payments.length);
  assert.equal(after.paymentAllocations.length, before.paymentAllocations.length);
  assert.equal(after.accountingJournals.length, before.accountingJournals.length);
});

test("public preparation rejects a stale PaymentRequest after a Credit Note", () => {
  const s = scenario();
  const draft = s.api.createSalesCreditNote({
    businessId: s.businessId,
    sourceInvoiceId: s.invoice.id,
    status: "draft",
    creditNoteDate: "2026-10-04",
    reason: "rate_adjustment",
    items: [{ description: "Reduction", quantity: 1, rate: 3000, gstRate: 0 }],
  }, { user: s.user, businessId: s.businessId });
  s.api.updateCreditNote(draft.id, { status: "posted" }, { user: s.user, businessId: s.businessId });
  const view = s.api.getPublicPaymentRequest(s.request.publicAccessToken);
  assert.equal(view.status, "active");
  assert.equal(view.paymentAllowed, false);
  assert.equal(view.paymentBlockReason, "amount_no_longer_collectible");
  assert.throws(() => s.api.preparePublicPaymentRequest(s.request.publicAccessToken), /not currently payable|no longer fully collectible/i);
  assert.equal(s.api.exportDataSnapshot().payments.length, 0);
});

test("cancelled public PaymentRequest is terminal and cannot prepare checkout", () => {
  const s = scenario();
  s.api.cancelPaymentRequest(s.request.id, {}, { user: s.user, businessId: s.businessId });
  const view = s.api.getPublicPaymentRequest(s.request.publicAccessToken);
  assert.equal(view.status, "cancelled");
  assert.equal(view.paymentAllowed, false);
  assert.equal(view.paymentBlockReason, "cancelled");
  assert.throws(() => s.api.preparePublicPaymentRequest(s.request.publicAccessToken), /not currently payable/i);
});

test("public HTTP lookup is unauthenticated and returns only the safe projection", async () => {
  const s = scenario();
  const server = createServer({ persist: false, useSupabaseEmailOtp: false, store: s.store });
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${base}/public/payment-requests/${encodeURIComponent(s.request.publicAccessToken)}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.paymentRequest.amount, 8000);
    assert.equal(body.paymentRequest.paymentAllowed, true);
    assert.equal("businessId" in body.paymentRequest, false);
    const invalid = await fetch(`${base}/public/payment-requests/${encodeURIComponent(s.request.id)}`);
    assert.equal(invalid.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
