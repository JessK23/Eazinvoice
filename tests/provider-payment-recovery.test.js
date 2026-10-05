import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { createServer } from "../apps/api/src/server.js";
import { createStore } from "../apps/api/src/store.js";

function scenario() {
  const store = createStore({}, { persist: false, useSupabaseEmailOtp: false });
  const api = createApi({ store });
  const user = api.createUser({ name: "Recovery Owner", email: `recovery-${crypto.randomBytes(4).toString("hex")}@example.com` });
  const business = api.createBusiness(user, { name: "Recovery Business" });
  const customer = api.createCustomer({ ownerUserId: user.id, businessId: business.id, name: "Recovery Customer" }, { user, businessId: business.id });
  const invoice = api.createInvoice({
    ownerUserId: user.id,
    businessId: business.id,
    customerId: customer.id,
    status: "created",
    currency: "INR",
    invoiceDate: "2026-10-03",
    items: [{ description: "Recovery service", quantity: 1, rate: 10000, gstRate: 0 }],
  }, { user, businessId: business.id });
  api.updateBusinessSettings(user, {
    businessId: business.id,
    paymentSettings: {
      keyId: "rzp_test_recovery",
      keySecret: "recovery-secret",
      webhookSecret: "recovery-webhook",
      merchantAccountId: "acct_recovery",
      paymentLinkEnabled: true,
    },
  }, { businessId: business.id, previewPlan: "business" });
  const paymentRequest = api.createPaymentRequest({
    invoiceId: invoice.id,
    businessId: business.id,
    workspaceOwnerUserId: user.id,
    requestedAmount: 4000,
    currency: "INR",
    requestKey: `recovery-${crypto.randomBytes(4).toString("hex")}`,
  }, { user, businessId: business.id });
  const credentialVersionId = api.getBusinessRazorpayCredentialsForSystem(business.id).credentialVersionId;
  const started = api.beginPaymentRequestProviderIntent(paymentRequest.paymentRequest.id, user, { businessId: business.id });
  const bound = api.bindPaymentRequestProviderIntent(paymentRequest.paymentRequest.id, user, {
    providerOrderId: `order_recovery_${crypto.randomBytes(4).toString("hex")}`,
    mode: "test",
    merchantAccountId: "acct_recovery",
    credentialVersionId,
  }, { businessId: business.id });
  return { api, store, user, business, customer, invoice, paymentRequest: paymentRequest.paymentRequest, started, bound };
}

function providerEvent(s, { eventId = `evt_${crypto.randomBytes(4).toString("hex")}`, paymentId = `pay_${crypto.randomBytes(4).toString("hex")}`, status = "captured", amount = 400000 } = {}) {
  const rawBody = JSON.stringify({
    event: "payment.captured",
    id: eventId,
    payload: { payment: { entity: {
      id: paymentId,
      order_id: s.bound.providerIntent.providerOrderId,
      amount,
      currency: "INR",
      status,
      notes: {
        paymentRequestId: s.paymentRequest.id,
        invoiceId: s.invoice.id,
        businessId: s.business.id,
        receipt: s.started.providerIntent.receipt,
      },
    } } },
  });
  return {
    rawBody,
    signature: crypto.createHmac("sha256", "recovery-webhook").update(rawBody).digest("hex"),
    eventId,
    paymentId,
  };
}

async function openServer(store) {
  const server = createServer({ persist: false, useSupabaseEmailOtp: false, store });
  await new Promise((resolve) => server.listen(0, resolve));
  return server;
}

async function postWebhook(server, event) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/webhooks/razorpay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Razorpay-Signature": event.signature, "X-Razorpay-Event-Id": event.eventId },
    body: event.rawBody,
  });
  return { response, payload: await response.json() };
}

test("provider recovery inbox is safe, idempotent, and redacts raw evidence", () => {
  const s = scenario();
  const event = providerEvent(s, { eventId: "evt_recovery_idempotent" });
  const first = s.api.ingestProviderEvent({ provider: "razorpay", providerEventId: event.eventId, eventType: "payment.captured", providerPaymentId: event.paymentId, providerOrderId: s.bound.providerIntent.providerOrderId, businessId: s.business.id, workspaceOwnerUserId: s.user.id, rawBody: event.rawBody, signature: event.signature });
  const replay = s.api.ingestProviderEvent({ provider: "razorpay", providerEventId: event.eventId, eventType: "payment.captured", providerPaymentId: event.paymentId, providerOrderId: s.bound.providerIntent.providerOrderId, businessId: s.business.id, workspaceOwnerUserId: s.user.id, rawBody: event.rawBody, signature: event.signature });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(s.api.listProviderRecoveryEvents().length, 1);
  assert.equal(Object.hasOwn(s.api.getProviderRecoveryEvent(first.event.id), "rawBody"), false);
  assert.equal(Object.hasOwn(s.api.getProviderRecoveryEvent(first.event.id), "signature"), false);
  assert.throws(() => s.api.ingestProviderEvent({ provider: "razorpay", providerEventId: event.eventId, eventType: "payment.captured", providerPaymentId: "pay_other", providerOrderId: s.bound.providerIntent.providerOrderId, businessId: s.business.id, rawBody: `${event.rawBody} `, signature: event.signature }), /conflict|immutable|identity/i);
});

test("invalid provider signature is durably terminal and creates no financial state", async () => {
  const s = scenario();
  const event = providerEvent(s, { eventId: "evt_recovery_bad_signature" });
  event.signature = "not-a-valid-signature";
  const server = await openServer(s.store);
  try {
    const result = await postWebhook(server, event);
    assert.equal(result.response.status, 401, JSON.stringify(result.payload));
    const events = s.api.listProviderRecoveryEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].processingStatus, "terminal_failure");
    assert.equal(events[0].errorCode, "INVALID_SIGNATURE");
    assert.equal(s.store.exportState().payments.length, 0);
    assert.equal(s.store.exportState().paymentAllocations.length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("received evidence remains untrusted but is recoverable after restart", async () => {
  const s = scenario();
  const event = providerEvent(s, { eventId: "evt_recovery_received_restart", paymentId: "pay_recovery_received" });
  const ingested = s.api.ingestProviderEvent({ provider: "razorpay", providerEventId: event.eventId, eventType: "payment.captured", providerPaymentId: event.paymentId, providerOrderId: s.bound.providerIntent.providerOrderId, businessId: s.business.id, workspaceOwnerUserId: s.user.id, rawBody: event.rawBody, signature: event.signature });
  assert.equal(ingested.event.processingStatus, "received");
  assert.equal(ingested.event.verificationStatus, "unverified");
  const restarted = createServer({ persist: false, useSupabaseEmailOtp: false, store: s.store });
  const processed = await restarted.eazinvoiceProcessProviderRecoveryEvent(ingested.event.id);
  assert.equal(processed.event.processingStatus, "completed");
  assert.equal(s.store.exportState().payments.length, 1);
  assert.equal(s.store.exportState().paymentAllocations.length, 1);
});

test("received restart recovery still fails closed before PAY-ATOMIC on invalid signature", async () => {
  const s = scenario();
  const event = providerEvent(s, { eventId: "evt_recovery_received_invalid", paymentId: "pay_recovery_received_invalid" });
  const ingested = s.api.ingestProviderEvent({ provider: "razorpay", providerEventId: event.eventId, eventType: "payment.captured", providerPaymentId: event.paymentId, providerOrderId: s.bound.providerIntent.providerOrderId, businessId: s.business.id, workspaceOwnerUserId: s.user.id, rawBody: event.rawBody, signature: "invalid" });
  const restarted = createServer({ persist: false, useSupabaseEmailOtp: false, store: s.store });
  const processed = await restarted.eazinvoiceProcessProviderRecoveryEvent(ingested.event.id);
  assert.equal(processed.event.processingStatus, "terminal_failure");
  assert.equal(processed.event.errorCode, "INVALID_SIGNATURE");
  assert.equal(s.store.exportState().payments.length, 0);
  assert.equal(s.store.exportState().paymentAllocations.length, 0);
});

test("valid webhook completes through PAY-ATOMIC and duplicate delivery remains idempotent", async () => {
  const s = scenario();
  const event = providerEvent(s, { eventId: "evt_recovery_success", paymentId: "pay_recovery_success" });
  const server = await openServer(s.store);
  try {
    const first = await postWebhook(server, event);
    assert.equal(first.response.status, 200, JSON.stringify(first.payload));
    assert.equal(first.payload.recovered, true);
    const replay = await postWebhook(server, event);
    assert.equal(replay.response.status, 200, JSON.stringify(replay.payload));
    assert.equal(s.store.exportState().payments.length, 1);
    assert.equal(s.store.exportState().paymentAllocations.length, 1);
    assert.equal(s.api.getPaymentRequest(s.paymentRequest.id, s.user, { businessId: s.business.id }).status, "completed");
    assert.equal(s.api.listProviderRecoveryEvents()[0].processingStatus, "completed");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("claim and lease authority prevents concurrent workers from processing one event", () => {
  const s = scenario();
  const event = providerEvent(s, { eventId: "evt_recovery_lease" });
  const ingested = s.api.ingestProviderEvent({ provider: "razorpay", providerEventId: event.eventId, eventType: "payment.captured", providerPaymentId: event.paymentId, providerOrderId: s.bound.providerIntent.providerOrderId, businessId: s.business.id, workspaceOwnerUserId: s.user.id, rawBody: event.rawBody, signature: event.signature });
  s.api.markProviderEventVerified(ingested.event.id, { businessId: s.business.id, workspaceOwnerUserId: s.user.id, merchantAccountId: "acct_recovery" });
  const first = s.api.claimProviderEvent(ingested.event.id, { workerId: "worker-a", leaseMs: 1000 });
  s.api.markProviderEventVerified(ingested.event.id, { businessId: s.business.id, workspaceOwnerUserId: s.user.id, merchantAccountId: "acct_recovery" });
  const second = s.api.claimProviderEvent(ingested.event.id, { workerId: "worker-b", leaseMs: 1000 });
  assert.equal(first.claimed, true);
  assert.equal(second.busy, true);
});

test("retry converges after PAY-ATOMIC commits but inbox completion marking fails", async () => {
  const s = scenario();
  const event = providerEvent(s, { eventId: "evt_recovery_crash_window", paymentId: "pay_recovery_crash" });
  const server = await openServer(s.store);
  const originalUpdate = server.eazinvoiceApi.updateProviderEvent;
  let failCompletionMark = true;
  server.eazinvoiceApi.updateProviderEvent = async (id, input) => {
    if (failCompletionMark && input.processingStatus === "completed") {
      throw new Error("simulated inbox completion persistence failure");
    }
    return originalUpdate(id, input);
  };
  try {
    await assert.rejects(() => server.eazinvoiceProcessProviderRecoveryEvent(
      s.api.ingestProviderEvent({ provider: "razorpay", providerEventId: event.eventId, eventType: "payment.captured", providerPaymentId: event.paymentId, providerOrderId: s.bound.providerIntent.providerOrderId, businessId: s.business.id, workspaceOwnerUserId: s.user.id, rawBody: event.rawBody, signature: event.signature }).event.id,
      { workerId: "worker-crash", leaseMs: 1000 },
    ), /completion persistence failure/);
    assert.equal(s.store.exportState().payments.length, 1);
    assert.equal(s.store.exportState().paymentAllocations.length, 1);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    failCompletionMark = false;
    const retry = await server.eazinvoiceProcessProviderRecoveryEvent(s.api.listProviderRecoveryEvents()[0].id, { workerId: "worker-retry", leaseMs: 1000 });
    assert.equal(retry.event.processingStatus, "completed");
    assert.equal(s.store.exportState().payments.length, 1);
    assert.equal(s.store.exportState().paymentAllocations.length, 1);
    assert.equal(s.api.getPaymentRequest(s.paymentRequest.id, s.user, { businessId: s.business.id }).status, "completed");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("historical credential version verifies recovery after business rotation and leaves immutable proof", async () => {
  const s = scenario();
  const versionA = s.api.getBusinessRazorpayCredentialsForSystem(s.business.id).credentialVersionId;
  const event = providerEvent(s, { eventId: "evt_recovery_rotated_secret", paymentId: "pay_recovery_rotated_secret" });
  const ingested = s.api.ingestProviderEvent({
    provider: "razorpay", providerEventId: event.eventId, eventType: "payment.captured",
    providerPaymentId: event.paymentId, providerOrderId: s.bound.providerIntent.providerOrderId,
    businessId: s.business.id, workspaceOwnerUserId: s.user.id, credentialVersionId: versionA,
    rawBody: event.rawBody, signature: event.signature,
  });
  s.api.updateBusinessSettings(s.user, {
    businessId: s.business.id,
    paymentSettings: { keyId: "rzp_test_recovery_rotated", keySecret: "rotated-secret", webhookSecret: "rotated-webhook", merchantAccountId: "acct_recovery", paymentLinkEnabled: true },
  }, { businessId: s.business.id, previewPlan: "business" });
  const current = s.api.getBusinessRazorpayCredentialsForSystem(s.business.id);
  assert.notEqual(current.credentialVersionId, versionA);
  assert.equal(s.api.getBusinessRazorpayCredentialsForSystem(s.business.id, null, versionA).credentialVersionStatus, "retired");
  const server = createServer({ persist: false, useSupabaseEmailOtp: false, store: s.store });
  try {
    const processed = await server.eazinvoiceProcessProviderRecoveryEvent(ingested.event.id);
    assert.equal(processed.event.processingStatus, "completed");
    assert.equal(processed.event.credentialVersionId, versionA);
    assert.equal(processed.event.verificationProof.credentialVersionId, versionA);
    assert.equal(s.store.exportState().payments.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("revoked credential version blocks unverified historical recovery", async () => {
  const s = scenario();
  const versionA = s.api.getBusinessRazorpayCredentialsForSystem(s.business.id).credentialVersionId;
  const event = providerEvent(s, { eventId: "evt_recovery_revoked_version", paymentId: "pay_recovery_revoked_version" });
  const ingested = s.api.ingestProviderEvent({
    provider: "razorpay", providerEventId: event.eventId, eventType: "payment.captured",
    providerPaymentId: event.paymentId, providerOrderId: s.bound.providerIntent.providerOrderId,
    businessId: s.business.id, workspaceOwnerUserId: s.user.id, credentialVersionId: versionA,
    rawBody: event.rawBody, signature: event.signature,
  });
  s.api.revokeProviderCredentialVersion(versionA, "compromised");
  const server = createServer({ persist: false, useSupabaseEmailOtp: false, store: s.store });
  try {
    const processed = await server.eazinvoiceProcessProviderRecoveryEvent(ingested.event.id);
    assert.equal(processed.event.processingStatus, "manual_review");
    assert.equal(processed.event.errorCode, "CREDENTIAL_VERSION_REVOKED");
    assert.equal(s.store.exportState().payments.length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
