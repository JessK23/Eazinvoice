import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { createServer } from "../apps/api/src/server.js";
import { createStore } from "../apps/api/src/store.js";

function setup() {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const ownerA = api.createUser({ name: "Merchant A", email: "merchant-a@example.com" });
  const ownerB = api.createUser({ name: "Merchant B", email: "merchant-b@example.com" });
  const businessA = api.createBusiness(ownerA, { name: "Merchant A Business" });
  const businessB = api.createBusiness(ownerB, { name: "Merchant B Business" });
  return { api, ownerA, ownerB, businessA, businessB };
}

test("business Razorpay credentials are business-scoped and never fall back to platform env", () => {
  const previous = {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  };
  process.env.RAZORPAY_KEY_ID = "rzp_live_platform";
  process.env.RAZORPAY_KEY_SECRET = "platform-secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "platform-webhook";
  try {
    const { api, ownerA, ownerB, businessA, businessB } = setup();
    const missing = api.resolveBusinessRazorpayCredentials(ownerB, { businessId: businessB.id, previewPlan: "business" });
    assert.equal(missing.status, "NOT_CONFIGURED");
    assert.equal(missing.keyId, "");
    assert.equal(missing.keySecret, "");
    assert.throws(
      () => api.resolveBusinessRazorpayCredentials(ownerA, { businessId: businessB.id, previewPlan: "business" }),
      /workspace access denied/i,
    );

    api.updateBusinessSettings(ownerA, {
      businessId: businessA.id,
      paymentSettings: {
        keyId: "rzp_test_business_a",
        keySecret: "business-a-secret",
        webhookSecret: "business-a-webhook",
        merchantAccountId: "acct_business_a",
        paymentLinkEnabled: true,
      },
    }, { previewPlan: "business" });
    const resolved = api.resolveBusinessRazorpayCredentials(ownerA, { businessId: businessA.id, previewPlan: "business" });
    assert.equal(resolved.status, "READY_TEST");
    assert.equal(resolved.keyId, "rzp_test_business_a");
    assert.equal(resolved.keySecret, "business-a-secret");
    assert.equal(resolved.merchantAccountId, "acct_business_a");

    const publicSettings = api.getBusinessSettings(ownerA, { businessId: businessA.id, previewPlan: "business" });
    assert.equal(publicSettings.paymentSettings.keySecret, "");
    assert.equal(publicSettings.paymentSettings.webhookSecret, "");
    assert.equal(publicSettings.paymentSettings.keySecretConfigured, true);
    assert.equal(publicSettings.paymentSettings.webhookSecretConfigured, true);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[{ keyId: "RAZORPAY_KEY_ID", keySecret: "RAZORPAY_KEY_SECRET", webhookSecret: "RAZORPAY_WEBHOOK_SECRET" }[key]];
      else process.env[{ keyId: "RAZORPAY_KEY_ID", keySecret: "RAZORPAY_KEY_SECRET", webhookSecret: "RAZORPAY_WEBHOOK_SECRET" }[key]] = value;
    }
  }
});

test("credential mode mismatch and disabled merchant credentials fail closed", () => {
  const { api, ownerA, businessA } = setup();
  api.updateBusinessSettings(ownerA, {
    businessId: businessA.id,
    paymentSettings: {
      keyId: "rzp_live_business_a",
      keySecret: "business-a-secret",
      webhookSecret: "business-a-webhook",
      mode: "test",
      paymentLinkEnabled: true,
    },
  }, { previewPlan: "business" });
  assert.equal(api.resolveBusinessRazorpayCredentials(ownerA, { businessId: businessA.id, previewPlan: "business" }).status, "INCOMPLETE");

  api.updateBusinessSettings(ownerA, {
    businessId: businessA.id,
    paymentSettings: { enabled: false, paymentLinkEnabled: false },
  }, { previewPlan: "business" });
  assert.equal(api.resolveBusinessRazorpayCredentials(ownerA, { businessId: businessA.id, previewPlan: "business" }).status, "DISABLED");
});

test("unrelated business settings updates preserve merchant secrets and rotation replaces them", () => {
  const { api, ownerA, businessA } = setup();
  api.updateBusinessSettings(ownerA, {
    businessId: businessA.id,
    paymentSettings: {
      keyId: "rzp_test_business_a",
      keySecret: "old-secret",
      webhookSecret: "old-webhook",
      paymentLinkEnabled: true,
    },
  }, { previewPlan: "business" });
  api.updateBusinessSettings(ownerA, {
    businessId: businessA.id,
    emailSettings: { fromEmail: "billing@example.com" },
  }, { previewPlan: "business" });
  assert.equal(api.resolveBusinessRazorpayCredentials(ownerA, { businessId: businessA.id, previewPlan: "business" }).keySecret, "old-secret");

  api.updateBusinessSettings(ownerA, {
    businessId: businessA.id,
    paymentSettings: { keySecret: "new-secret", webhookSecret: "new-webhook", paymentLinkEnabled: true },
  }, { previewPlan: "business" });
  const rotated = api.resolveBusinessRazorpayCredentials(ownerA, { businessId: businessA.id, previewPlan: "business" });
  assert.equal(rotated.keySecret, "new-secret");
  assert.equal(rotated.webhookSecret, "new-webhook");
});

test("partial credential rotation preserves omitted readiness fields and explicit revocation is distinct from disable", () => {
  const { api, ownerA, businessA } = setup();
  const options = { businessId: businessA.id, previewPlan: "business" };
  api.updateBusinessSettings(ownerA, {
    businessId: businessA.id,
    paymentSettings: {
      keyId: "rzp_test_business_a",
      keySecret: "secret-a",
      webhookSecret: "webhook-a",
      merchantAccountId: "account-a",
      mode: "test",
      enabled: true,
      paymentLinkEnabled: true,
    },
  }, options);
  api.updateBusinessSettings(ownerA, { businessId: businessA.id, paymentSettings: { keySecret: "secret-b" } }, options);
  let resolved = api.resolveBusinessRazorpayCredentials(ownerA, options);
  assert.equal(resolved.status, "READY_TEST");
  assert.equal(resolved.keySecret, "secret-b");
  assert.equal(resolved.webhookSecret, "webhook-a");
  assert.equal(resolved.merchantAccountId, "account-a");

  api.updateBusinessSettings(ownerA, { businessId: businessA.id, paymentSettings: { enabled: false } }, options);
  resolved = api.resolveBusinessRazorpayCredentials(ownerA, options);
  assert.equal(resolved.status, "DISABLED");
  api.updateBusinessSettings(ownerA, { businessId: businessA.id, paymentSettings: { enabled: true } }, options);
  assert.equal(api.resolveBusinessRazorpayCredentials(ownerA, options).status, "READY_TEST");

  api.updateBusinessSettings(ownerA, { businessId: businessA.id, paymentSettings: { revokeKeySecret: true } }, options);
  resolved = api.resolveBusinessRazorpayCredentials(ownerA, options);
  assert.equal(resolved.keySecret, "");
  assert.equal(resolved.status, "INCOMPLETE");
  api.updateBusinessSettings(ownerA, { businessId: businessA.id, paymentSettings: { enabled: true } }, options);
  assert.equal(api.resolveBusinessRazorpayCredentials(ownerA, options).status, "INCOMPLETE");

  api.updateBusinessSettings(ownerA, { businessId: businessA.id, paymentSettings: { keySecret: "" } }, options);
  assert.equal(api.resolveBusinessRazorpayCredentials(ownerA, options).keySecret, "");
  api.updateBusinessSettings(ownerA, { businessId: businessA.id, paymentSettings: { keySecret: "secret-c" } }, options);
  api.updateBusinessSettings(ownerA, { businessId: businessA.id, paymentSettings: { revokeWebhookSecret: true } }, options);
  assert.equal(api.resolveBusinessRazorpayCredentials(ownerA, options).webhookSecret, "");
});

test("business credential persistence rejection prevents apparent success", async () => {
  const persistenceAdapter = {
    load() {
      return {};
    },
    async reload() {
      return {};
    },
    save(snapshot) {
      if (snapshot.businessSettings.some((entry) => entry.paymentSettings?.keyId)) {
        return Promise.reject(new Error("business credential persistence failed"));
      }
      return Promise.resolve();
    },
  };
  const api = createApi({
    store: createStore({}, { persistenceAdapter, persist: true, useSupabaseEmailOtp: false }),
  });
  const owner = await api.createUser({ name: "Persistence Owner", email: "credential-persistence@example.com" });
  const business = await api.createBusiness(owner, { name: "Persistence Business" });
  await assert.rejects(
    () => api.updateBusinessSettings(owner, {
      businessId: business.id,
      paymentSettings: { keyId: "rzp_test_persist", keySecret: "secret", paymentLinkEnabled: true },
    }, { businessId: business.id, previewPlan: "business" }),
    /persistence failed/i,
  );
});

test("legacy Invoice HTTP collection fails closed without business credentials and uses business credentials when configured", async () => {
  const previous = {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
    adminEmail: process.env.ADMIN_EMAIL,
  };
  process.env.RAZORPAY_KEY_ID = "rzp_live_platform";
  process.env.RAZORPAY_KEY_SECRET = "platform-secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "platform-webhook";
  process.env.ADMIN_EMAIL = "merchant-http@example.com";
  const originalFetch = globalThis.fetch;
  let providerAuthorization = "";
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith("https://api.razorpay.com/v1/orders")) {
      providerAuthorization = String(options.headers?.Authorization || "");
      const body = JSON.parse(options.body || "{}");
      return new Response(JSON.stringify({ id: "order_business_http", amount: body.amount, currency: body.currency, status: "created" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(url, options);
  };
  const store = createStore({}, { persist: false, useSupabaseEmailOtp: false });
  const server = createServer({ persist: false, useSupabaseEmailOtp: false, store });
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { method = "GET", token, body, previewPlan = "" } = {}) {
    const response = await originalFetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(previewPlan ? { "X-Eazinvoice-Plan-Preview": previewPlan } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { response, payload: await response.json() };
  }
  try {
    const otp = await request("/auth/email-otp/request", { method: "POST", body: { mode: "signup", email: "merchant-http@example.com", phone: "9123456789" } });
    const signup = await request("/auth/signup", {
      method: "POST",
      body: { name: "Merchant HTTP", email: "merchant-http@example.com", password: "Secure123", phone: "9123456789", otp: otp.payload.devOtp },
    });
    const token = signup.payload.token;
    const authenticatedUser = store.getUserByEmail("merchant-http@example.com");
    store.createSubscription({ userId: authenticatedUser.id, plan: "business", status: "active", amount: 4788, annualAmount: 4788, monthlyAmount: 399 });
    const workspaces = await request("/business/workspaces", { token });
    const businessId = workspaces.payload[0].businessId;
    const invoice = await request("/invoices", {
      method: "POST",
      token,
      previewPlan: "standard",
      body: { businessId, status: "draft", invoiceDate: "2026-10-03", billToName: "Customer", items: [{ description: "HTTP credential test", quantity: 1, rate: 1000, gstRate: 0 }] },
    });
    assert.equal(invoice.response.status, 201, invoice.payload.error || "invoice creation failed");
    const missing = await request("/billing/razorpay/order", {
      method: "POST",
      token,
      previewPlan: "standard",
      body: { kind: "invoice", invoiceId: invoice.payload.id, businessId },
    });
    assert.equal(missing.response.status, 503, missing.payload.error || "unexpected missing-credentials response");
    assert.match(missing.payload.error, /business.*credentials/i);
    assert.equal(providerAuthorization, "");

    store.upsertBusinessSettings(authenticatedUser, {
      businessId,
      paymentSettings: { keyId: "rzp_test_business_http", keySecret: "business-http-secret", webhookSecret: "business-http-webhook", paymentLinkEnabled: true },
    });
    const order = await request("/billing/razorpay/order", {
      method: "POST",
      token,
      previewPlan: "standard",
      body: { kind: "invoice", invoiceId: invoice.payload.id, businessId },
    });
    assert.equal(order.response.status, 201);
    assert.equal(providerAuthorization, `Basic ${Buffer.from("rzp_test_business_http:business-http-secret").toString("base64")}`);

    const platformSignature = crypto.createHmac("sha256", "platform-secret").update("order_business_http|pay_business_http").digest("hex");
    const wrongVerification = await request("/billing/razorpay/verify", {
      method: "POST",
      token,
      previewPlan: "standard",
      body: { razorpay_order_id: "order_business_http", razorpay_payment_id: "pay_business_http", razorpay_signature: platformSignature },
    });
    assert.equal(wrongVerification.response.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      const envKey = { keyId: "RAZORPAY_KEY_ID", keySecret: "RAZORPAY_KEY_SECRET", webhookSecret: "RAZORPAY_WEBHOOK_SECRET", adminEmail: "ADMIN_EMAIL" }[key];
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
  }
});
