import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { createServer } from "../apps/api/src/server.js";
import { createStore } from "../apps/api/src/store.js";

function scenario({ email = `provider-intent-${crypto.randomBytes(4).toString("hex")}@example.com` } = {}) {
  const store = createStore({}, { persist: false, useSupabaseEmailOtp: false });
  const api = createApi({ store });
  const user = api.createUser({ name: "Provider Intent Owner", email });
  const business = api.createBusiness(user, { name: "Provider Intent Business" });
  const invoice = api.createInvoice({
    ownerUserId: user.id,
    businessId: business.id,
    status: "created",
    currency: "INR",
    invoiceDate: "2026-10-03",
    items: [{ description: "Provider intent service", quantity: 1, rate: 10000, gstRate: 0 }],
  }, { user, businessId: business.id });
  api.updateBusinessSettings(user, {
    businessId: business.id,
    paymentSettings: {
      keyId: "rzp_test_business_intent",
      keySecret: "business-intent-secret",
      webhookSecret: "business-intent-webhook",
      merchantAccountId: "acct_intent",
      paymentLinkEnabled: true,
    },
  }, { businessId: business.id, previewPlan: "business" });
  const paymentRequest = api.createPaymentRequest({
    invoiceId: invoice.id,
    businessId: business.id,
    workspaceOwnerUserId: user.id,
    requestedAmount: 4000,
    currency: "INR",
    requestKey: `intent-${crypto.randomBytes(4).toString("hex")}`,
  }, { user, businessId: business.id });
  return { api, store, user, business, invoice, paymentRequest: paymentRequest.paymentRequest };
}

test("provider intent binding is immutable, amount-safe, and financially non-effecting", () => {
  const s = scenario();
  const started = s.api.beginPaymentRequestProviderIntent(s.paymentRequest.id, s.user, { businessId: s.business.id });
  assert.equal(started.providerIntent.status, "creating");
  assert.equal(started.providerIntent.amount, 4000);
  assert.equal(started.providerIntent.currency, "INR");
  const bound = s.api.bindPaymentRequestProviderIntent(s.paymentRequest.id, s.user, {
    providerOrderId: "order_provider_intent_1",
    mode: "test",
    merchantAccountId: "acct_intent",
  }, { businessId: s.business.id });
  assert.equal(bound.providerIntent.status, "created");
  assert.equal(bound.providerIntent.providerOrderId, "order_provider_intent_1");
  const replay = s.api.beginPaymentRequestProviderIntent(s.paymentRequest.id, s.user, { businessId: s.business.id });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(s.api.getPaymentRequest(s.paymentRequest.id, s.user, { businessId: s.business.id }).status, "active");
  assert.equal(s.api.listPayments(s.user, { businessId: s.business.id }).length, 0);
  assert.equal(s.api.listPaymentAllocations(s.user, { businessId: s.business.id }).length, 0);
  assert.throws(() => s.api.cancelPaymentRequest(s.paymentRequest.id, {}, { user: s.user, businessId: s.business.id }), /provider intent/i);
});

test("provider evidence resolves authoritative PaymentRequest lineage and rejects mismatches", () => {
  const s = scenario();
  const started = s.api.beginPaymentRequestProviderIntent(s.paymentRequest.id, s.user, { businessId: s.business.id });
  const bound = s.api.bindPaymentRequestProviderIntent(s.paymentRequest.id, s.user, {
    providerOrderId: "order_evidence_1",
    mode: "test",
    merchantAccountId: "acct_intent",
  }, { businessId: s.business.id });
  const resolved = s.api.resolvePaymentRequestProviderEvidence({
    providerOrderId: bound.providerIntent.providerOrderId,
    receipt: started.providerIntent.receipt,
    paymentRequestId: s.paymentRequest.id,
    invoiceId: s.invoice.id,
    businessId: s.business.id,
    workspaceOwnerUserId: s.user.id,
    amount: 400000,
    currency: "INR",
    notes: { paymentRequestId: s.paymentRequest.id, invoiceId: s.invoice.id, businessId: s.business.id },
  });
  assert.equal(resolved.paymentRequest.id, s.paymentRequest.id);
  assert.equal(resolved.invoice.id, s.invoice.id);
  assert.equal(resolved.business.id, s.business.id);
  assert.equal(resolved.workspace.ownerUserId, s.user.id);
  assert.throws(() => s.api.resolvePaymentRequestProviderEvidence({
    providerOrderId: "order_evidence_1",
    paymentRequestId: s.paymentRequest.id,
    businessId: "business_other",
  }), /does not match|invalid/i);
  assert.equal(s.store.exportState().payments.length, 0);
  assert.equal(s.store.exportState().paymentAllocations.length, 0);
});

test("Razorpay webhook identifies PaymentRequest lineage without financial completion", async () => {
  const s = scenario();
  const started = s.api.beginPaymentRequestProviderIntent(s.paymentRequest.id, s.user, { businessId: s.business.id });
  const bound = s.api.bindPaymentRequestProviderIntent(s.paymentRequest.id, s.user, {
    providerOrderId: "order_webhook_evidence",
    mode: "test",
    merchantAccountId: "acct_intent",
  }, { businessId: s.business.id });
  const server = createServer({ persist: false, useSupabaseEmailOtp: false, store: s.store });
  await new Promise((resolve) => server.listen(0, resolve));
  const rawBody = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: {
      id: "pay_webhook_evidence",
      order_id: bound.providerIntent.providerOrderId,
      amount: 400000,
      currency: "INR",
      notes: { paymentRequestId: s.paymentRequest.id, invoiceId: s.invoice.id, businessId: s.business.id, receipt: started.providerIntent.receipt },
    } } },
  });
  const signature = crypto.createHmac("sha256", "business-intent-webhook").update(rawBody).digest("hex");
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/webhooks/razorpay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Razorpay-Signature": signature },
      body: rawBody,
    });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.identified, true);
    assert.equal(payload.paymentRequestId, s.paymentRequest.id);
    assert.equal(payload.invoiceId, s.invoice.id);
    assert.equal(payload.businessId, s.business.id);
    assert.equal(s.store.exportState().payments.length, 0);
    assert.equal(s.store.exportState().paymentAllocations.length, 0);
    assert.equal(s.api.getPaymentRequest(s.paymentRequest.id, s.user, { businessId: s.business.id }).status, "active");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("provider intent eligibility rejects cancelled, completed, and expired requests", async () => {
  const cancelled = scenario();
  cancelled.api.cancelPaymentRequest(cancelled.paymentRequest.id, {}, { user: cancelled.user, businessId: cancelled.business.id });
  assert.throws(() => cancelled.api.beginPaymentRequestProviderIntent(cancelled.paymentRequest.id, cancelled.user, { businessId: cancelled.business.id }), /terminal/i);

  const completed = scenario();
  completed.api.completePaymentRequest(completed.paymentRequest.id, { verifiedPaymentEvidence: true, provider: "manual", providerReference: "verified" }, { user: completed.user, businessId: completed.business.id });
  assert.throws(() => completed.api.beginPaymentRequestProviderIntent(completed.paymentRequest.id, completed.user, { businessId: completed.business.id }), /terminal/i);

  const expired = scenario();
  const expiring = expired.api.createPaymentRequest({ invoiceId: expired.invoice.id, businessId: expired.business.id, workspaceOwnerUserId: expired.user.id, requestedAmount: 1000, currency: "INR", requestKey: "expiring-provider-intent", expiresAt: new Date(Date.now() + 5).toISOString() }, { user: expired.user, businessId: expired.business.id });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.throws(() => expired.api.beginPaymentRequestProviderIntent(expiring.paymentRequest.id, expired.user, { businessId: expired.business.id }), /expired/i);
});

test("provider intent binding rejects cross-business access and preserves lineage", () => {
  const s = scenario();
  const otherUser = s.api.createUser({ name: "Other Provider Intent Owner", email: `other-${crypto.randomBytes(4).toString("hex")}@example.com` });
  const otherBusiness = s.api.createBusiness(otherUser, { name: "Other Business" });
  assert.throws(() => s.api.beginPaymentRequestProviderIntent(s.paymentRequest.id, otherUser, { businessId: otherBusiness.id }), /not found|access denied/i);
  const started = s.api.beginPaymentRequestProviderIntent(s.paymentRequest.id, s.user, { businessId: s.business.id });
  const bound = s.api.bindPaymentRequestProviderIntent(s.paymentRequest.id, s.user, { providerOrderId: "order_lineage_1", mode: "test", merchantAccountId: "acct_intent" }, { businessId: s.business.id });
  assert.equal(bound.providerIntent.paymentRequestId, s.paymentRequest.id);
  assert.equal(bound.providerIntent.invoiceId, s.invoice.id);
  assert.equal(bound.providerIntent.businessId, s.business.id);
  assert.equal(started.providerIntent.amount, 4000);
});

test("provider intent HTTP creation uses business credentials and authoritative PaymentRequest values", async () => {
  const previous = {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  };
  process.env.RAZORPAY_KEY_ID = "rzp_live_platform";
  process.env.RAZORPAY_KEY_SECRET = "platform-secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "platform-webhook";
  const originalFetch = globalThis.fetch;
  let authorization = "";
  let providerBody = null;
  let providerPostCount = 0;
  let recoveryItems = null;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith("https://api.razorpay.com/v1/orders")) {
      if (options.method === "GET") {
        return new Response(JSON.stringify({ items: recoveryItems || [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      providerPostCount += 1;
      authorization = String(options.headers?.Authorization || "");
      providerBody = JSON.parse(options.body || "{}");
      return new Response(JSON.stringify({ id: "order_payment_request_http", amount: providerBody.amount, currency: providerBody.currency, status: "created" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return originalFetch(url, options);
  };
  const store = createStore({}, { persist: false, useSupabaseEmailOtp: false });
  const server = createServer({ persist: false, useSupabaseEmailOtp: false, store });
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { method = "GET", token, body } = {}) {
    const response = await originalFetch(`${baseUrl}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { response, payload: await response.json() };
  }
  try {
    const otp = await request("/auth/email-otp/request", { method: "POST", body: { mode: "signup", email: "provider-intent-http@example.com", phone: "9123456789" } });
    const signup = await request("/auth/signup", { method: "POST", body: { name: "Provider Intent HTTP", email: "provider-intent-http@example.com", password: "Secure123", phone: "9123456789", otp: otp.payload.devOtp } });
    const user = store.getUserByEmail("provider-intent-http@example.com");
    const businessId = store.listBusinessWorkspacesForUser(user)[0].businessId;
    store.createSubscription({ userId: user.id, businessId, plan: "business", status: "active", amount: 4788, annualAmount: 4788, monthlyAmount: 399 });
    const api = server.eazinvoiceApi;
    const invoice = api.createInvoice({ ownerUserId: user.id, businessId, status: "created", currency: "INR", items: [{ description: "HTTP provider intent", quantity: 1, rate: 4000, gstRate: 0 }] }, { user, businessId });
    api.updateBusinessSettings(user, { businessId, paymentSettings: { keyId: "rzp_test_business_http_intent", keySecret: "business-http-intent-secret", webhookSecret: "business-http-intent-webhook", paymentLinkEnabled: true } }, { businessId, previewPlan: "business" });
    const created = api.createPaymentRequest({ invoiceId: invoice.id, businessId, workspaceOwnerUserId: user.id, requestedAmount: 4000, currency: "INR", requestKey: "provider-intent-http" }, { user, businessId });
    const result = await request(`/payment-requests/${encodeURIComponent(created.paymentRequest.id)}/provider-intent`, { method: "POST", token: signup.payload.token });
    assert.equal(result.response.status, 201, result.payload.error || "provider intent creation failed");
    assert.equal(result.payload.providerIntent.providerOrderId, "order_payment_request_http");
    assert.equal(result.payload.providerIntent.invoiceId, invoice.id);
    assert.equal(result.payload.providerIntent.businessId, businessId);
    assert.equal(providerBody.amount, 400000);
    assert.equal(providerBody.currency, "INR");
    assert.equal(authorization, `Basic ${Buffer.from("rzp_test_business_http_intent:business-http-intent-secret").toString("base64")}`);
    assert.equal(result.payload.publicKeyId, "rzp_test_business_http_intent");
    assert.equal(result.payload.providerIntent.providerOrderId, "order_payment_request_http");
    assert.equal(store.exportState().payments.length, 0);
    assert.equal(store.exportState().paymentAllocations.length, 0);
    const replay = await request(`/payment-requests/${encodeURIComponent(created.paymentRequest.id)}/provider-intent`, { method: "POST", token: signup.payload.token });
    assert.equal(replay.response.status, 200);
    assert.equal(replay.payload.providerIntent.providerOrderId, "order_payment_request_http");

    const recoveryInvoice = api.createInvoice({ ownerUserId: user.id, businessId, status: "created", currency: "INR", items: [{ description: "Recovery zero match", quantity: 1, rate: 4000, gstRate: 0 }] }, { user, businessId });
    const recoveryRequest = api.createPaymentRequest({ invoiceId: recoveryInvoice.id, businessId, workspaceOwnerUserId: user.id, requestedAmount: 4000, currency: "INR", requestKey: "provider-intent-zero-match" }, { user, businessId });
    api.beginPaymentRequestProviderIntent(recoveryRequest.paymentRequest.id, user, { businessId });
    api.markPaymentRequestProviderIntentRecoveryRequired(recoveryRequest.paymentRequest.id, user, { providerStatus: "timeout" }, { businessId });
    recoveryItems = [];
    const zeroMatch = await request(`/payment-requests/${encodeURIComponent(recoveryRequest.paymentRequest.id)}/provider-intent`, { method: "POST", token: signup.payload.token });
    assert.equal(zeroMatch.response.status, 409);
    assert.equal(zeroMatch.payload.code, "PROVIDER_RECOVERY_REQUIRED");

    const multipleInvoice = api.createInvoice({ ownerUserId: user.id, businessId, status: "created", currency: "INR", items: [{ description: "Recovery multiple match", quantity: 1, rate: 4000, gstRate: 0 }] }, { user, businessId });
    const multipleRequest = api.createPaymentRequest({ invoiceId: multipleInvoice.id, businessId, workspaceOwnerUserId: user.id, requestedAmount: 4000, currency: "INR", requestKey: "provider-intent-multiple-match" }, { user, businessId });
    const multipleStarted = api.beginPaymentRequestProviderIntent(multipleRequest.paymentRequest.id, user, { businessId });
    api.markPaymentRequestProviderIntentRecoveryRequired(multipleRequest.paymentRequest.id, user, { providerStatus: "timeout" }, { businessId });
    recoveryItems = [
      { id: "order_ambiguous_1", amount: 400000, currency: "INR", receipt: multipleStarted.providerIntent.receipt, status: "created" },
      { id: "order_ambiguous_2", amount: 400000, currency: "INR", receipt: multipleStarted.providerIntent.receipt, status: "created" },
    ];
    const multipleMatch = await request(`/payment-requests/${encodeURIComponent(multipleRequest.paymentRequest.id)}/provider-intent`, { method: "POST", token: signup.payload.token });
    assert.equal(multipleMatch.response.status, 409);
    assert.equal(multipleMatch.payload.code, "PROVIDER_RECOVERY_AMBIGUOUS");
    assert.equal(providerPostCount, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      const envKey = { keyId: "RAZORPAY_KEY_ID", keySecret: "RAZORPAY_KEY_SECRET", webhookSecret: "RAZORPAY_WEBHOOK_SECRET" }[key];
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
  }
});

test("provider order failure does not bind success or create financial effects", async () => {
  const s = scenario();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith("https://api.razorpay.com/v1/orders")) {
      return new Response(JSON.stringify({ error: { description: "provider unavailable" } }), { status: 503, headers: { "Content-Type": "application/json" } });
    }
    return originalFetch(url);
  };
  const server = createServer({ persist: false, useSupabaseEmailOtp: false, store: s.store });
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const request = await s.api.beginPaymentRequestProviderIntent(s.paymentRequest.id, s.user, { businessId: s.business.id });
    assert.equal(request.providerIntent.status, "creating");
    await assert.rejects(
      () => (async () => {
        const credentials = s.api.resolveBusinessRazorpayCredentials(s.user, { businessId: s.business.id, permission: "writeRecords", previewPlan: "business" });
        const response = await fetch("https://api.razorpay.com/v1/orders", { headers: { Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString("base64")}` }, body: JSON.stringify({ amount: 400000, currency: "INR" }) });
        if (!response.ok) throw new Error("provider order creation failed");
      })(),
      /provider order creation failed/i,
    );
    const failed = s.api.failPaymentRequestProviderIntent(s.paymentRequest.id, s.user, { providerStatus: "failed" }, { businessId: s.business.id });
    assert.equal(failed.providerIntent.status, "failed");
    assert.equal(s.store.exportState().payments.length, 0);
    assert.equal(s.store.exportState().paymentAllocations.length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = originalFetch;
  }
});

test("unknown provider outcome is recovery-required and cannot be retried into a duplicate order", () => {
  const s = scenario();
  const started = s.api.beginPaymentRequestProviderIntent(s.paymentRequest.id, s.user, { businessId: s.business.id });
  const uncertain = s.api.markPaymentRequestProviderIntentRecoveryRequired(s.paymentRequest.id, s.user, { providerStatus: "timeout" }, { businessId: s.business.id });
  assert.equal(started.providerIntent.receipt, uncertain.providerIntent.receipt);
  assert.equal(uncertain.providerIntent.status, "recovery_required");
  const retry = s.api.beginPaymentRequestProviderIntent(s.paymentRequest.id, s.user, { businessId: s.business.id });
  assert.equal(retry.recoveryRequired, true);
  assert.equal(retry.providerIntent.status, "recovery_required");
  assert.throws(() => s.api.cancelPaymentRequest(s.paymentRequest.id, {}, { user: s.user, businessId: s.business.id }), /provider intent/i);
});

test("provider recovery binds one matching order and rejects mismatch or ambiguity", () => {
  const s = scenario();
  const started = s.api.beginPaymentRequestProviderIntent(s.paymentRequest.id, s.user, { businessId: s.business.id });
  const validOrder = {
    id: "order_recovered_1",
    amount: 400000,
    currency: "INR",
    receipt: started.providerIntent.receipt,
    status: "created",
    notes: { paymentRequestId: s.paymentRequest.id, invoiceId: s.invoice.id, businessId: s.business.id },
  };
  const recovered = s.api.recoverPaymentRequestProviderIntent(s.paymentRequest.id, s.user, { providerOrder: validOrder }, { businessId: s.business.id });
  assert.equal(recovered.providerIntent.status, "created");
  assert.equal(recovered.providerIntent.providerOrderId, "order_recovered_1");

  const mismatch = scenario();
  const mismatchStarted = mismatch.api.beginPaymentRequestProviderIntent(mismatch.paymentRequest.id, mismatch.user, { businessId: mismatch.business.id });
  const mismatchResult = mismatch.api.recoverPaymentRequestProviderIntent(mismatch.paymentRequest.id, mismatch.user, {
    providerOrder: { ...validOrder, id: "order_mismatch", amount: 500000, receipt: mismatchStarted.providerIntent.receipt, notes: { paymentRequestId: mismatch.paymentRequest.id, invoiceId: mismatch.invoice.id, businessId: mismatch.business.id } },
  }, { businessId: mismatch.business.id });
  assert.equal(mismatchResult.recoveryRequired, true);
  assert.equal(mismatch.api.getPaymentRequest(mismatch.paymentRequest.id, mismatch.user, { businessId: mismatch.business.id }).providerIntent.status, "recovery_required");
});

test("expired requests retain recovery capability without permitting a new order", async () => {
  const s = scenario();
  const expiring = s.api.createPaymentRequest({ invoiceId: s.invoice.id, businessId: s.business.id, workspaceOwnerUserId: s.user.id, requestedAmount: 1000, currency: "INR", requestKey: "expiring-recovery", expiresAt: new Date(Date.now() + 20).toISOString() }, { user: s.user, businessId: s.business.id });
  const started = s.api.beginPaymentRequestProviderIntent(expiring.paymentRequest.id, s.user, { businessId: s.business.id });
  await new Promise((resolve) => setTimeout(resolve, 35));
  const recovery = s.api.markPaymentRequestProviderIntentRecoveryRequired(expiring.paymentRequest.id, s.user, { providerStatus: "timeout" }, { businessId: s.business.id });
  assert.equal(recovery.providerIntent.receipt, started.providerIntent.receipt);
  const retry = s.api.beginPaymentRequestProviderIntent(expiring.paymentRequest.id, s.user, { businessId: s.business.id });
  assert.equal(retry.recoveryRequired, true);
});

test("created-state persistence failure does not permit a second provider order", async () => {
  const prepared = scenario();
  const seed = prepared.store.exportState();
  let committed = JSON.parse(JSON.stringify(seed));
  const persistenceAdapter = {
    load: () => JSON.parse(JSON.stringify(committed)),
    reload: async () => JSON.parse(JSON.stringify(committed)),
    save: (snapshot) => {
      if (snapshot.paymentRequests.some((request) => request.providerIntent?.status === "created")) return Promise.reject(new Error("provider intent persistence failed"));
      committed = JSON.parse(JSON.stringify(snapshot));
      return undefined;
    },
  };
  const store = createStore({}, { persist: true, persistenceAdapter, useSupabaseEmailOtp: false });
  const api = createApi({ store });
  const started = await api.beginPaymentRequestProviderIntent(prepared.paymentRequest.id, prepared.user, { businessId: prepared.business.id });
  assert.equal(started.providerIntent.status, "creating");
  await assert.rejects(
    () => api.bindPaymentRequestProviderIntent(prepared.paymentRequest.id, prepared.user, { providerOrderId: "order_orphaned_1", providerOrder: { id: "order_orphaned_1", amount: 400000, currency: "INR", receipt: started.providerIntent.receipt, notes: { paymentRequestId: prepared.paymentRequest.id, invoiceId: prepared.invoice.id, businessId: prepared.business.id } } }, { businessId: prepared.business.id }),
    /provider intent persistence failed/i,
  );
  const retry = await api.beginPaymentRequestProviderIntent(prepared.paymentRequest.id, prepared.user, { businessId: prepared.business.id });
  assert.equal(retry.recoveryRequired, true);
  assert.equal(retry.providerIntent.status, "creating");
});
