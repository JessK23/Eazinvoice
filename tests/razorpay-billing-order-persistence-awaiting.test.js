import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../apps/api/src/server.js";
import { createStore } from "../apps/api/src/store.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function createRazorpayOrderHarness({ failBillingOrder = false } = {}) {
  const previous = {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  };
  process.env.RAZORPAY_KEY_ID = "rzp_test_eazinvoice";
  process.env.RAZORPAY_KEY_SECRET = "test_secret_for_auth01f";
  process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret_for_auth01f";

  let releaseBillingOrder;
  let billingOrderPersistStarted = false;
  let lastCommittedSnapshot = {};
  const store = createStore({}, {
    persist: true,
    useSupabaseEmailOtp: false,
    persistenceAdapter: {
      load: () => ({}),
      reload: async () => clone(lastCommittedSnapshot),
      save: (snapshot) => {
        if (snapshot.billingOrders.length > 0) {
          billingOrderPersistStarted = true;
          if (failBillingOrder) return Promise.reject(new Error("simulated billing-order persistence failure"));
          return new Promise((resolve) => {
            releaseBillingOrder = () => {
              lastCommittedSnapshot = clone(snapshot);
              resolve();
            };
          });
        }
        lastCommittedSnapshot = clone(snapshot);
        return undefined;
      },
    },
  });
  const server = createServer({ persist: true, useSupabaseEmailOtp: false, store });
  await new Promise((resolve) => server.listen(0, resolve));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith("https://api.razorpay.com/v1/orders")) {
      const body = JSON.parse(options.body || "{}");
      return new Response(JSON.stringify({ id: "order_auth01f", amount: body.amount, currency: body.currency, status: "created" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(url, options);
  };

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { method = "GET", token, body } = {}) {
    const response = await originalFetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { response, payload: await response.json() };
  }

  async function close() {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      const envKey = key === "keyId" ? "RAZORPAY_KEY_ID" : key === "keySecret" ? "RAZORPAY_KEY_SECRET" : "RAZORPAY_WEBHOOK_SECRET";
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
  }

  async function prepareEntitlement(userId) {
    const user = server.eazinvoiceApi.getUserById(userId);
    const company = await server.eazinvoiceApi.createCompany({
      ownerUserId: user.id,
      name: "AUTH-01F Razorpay Company",
      entityType: "company",
      country: "IN",
      address: "1 Billing Street",
      panNumber: "ABCDE1234F",
      addressProof: "billing-address.pdf",
      documentNames: ["pan.pdf"],
      kycStatus: "verified",
      reviewStatus: "approved",
    });
    await server.eazinvoiceApi.createSubscription({
      userId: user.id,
      companyId: company.id,
      businessId: company.businessId,
      plan: "standard",
      amount: 2388,
      monthlyAmount: 199,
      annualAmount: 2388,
      currency: "INR",
      billingCycle: "yearly",
      status: "active",
    });
  }

  return { request, close, prepareEntitlement, releaseBillingOrder: () => releaseBillingOrder?.(), get billingOrderPersistStarted() { return billingOrderPersistStarted; } };
}

async function signInExistingUser(harness) {
  const otp = await harness.request("/auth/email-otp/request", {
    method: "POST",
    body: { mode: "signup", email: "auth01f-razorpay@example.com", phone: "9123456780" },
  });
  assert.equal(otp.response.status, 200, JSON.stringify(otp.payload));
  const signup = await harness.request("/auth/signup", {
    method: "POST",
    body: {
      name: "AUTH-01F Razorpay User",
      email: "auth01f-razorpay@example.com",
      password: "Secure123",
      phone: "9123456780",
      otp: otp.payload.devOtp,
    },
  });
  assert.equal(signup.response.status, 201);
  await harness.prepareEntitlement(signup.payload.user.id);
  return signup.payload.token;
}

test("Razorpay billing-order success waits for authoritative persistence", async () => {
  const harness = await createRazorpayOrderHarness();
  try {
    const token = await signInExistingUser(harness);
    let settled = false;
    const orderPromise = harness.request("/billing/razorpay/order", {
      method: "POST",
      token,
      body: { kind: "subscription", plan: "standard" },
    }).then((result) => {
      settled = true;
      return result;
    });

    for (let attempt = 0; attempt < 100 && !harness.billingOrderPersistStarted; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(harness.billingOrderPersistStarted, true);
    assert.equal(settled, false);
    harness.releaseBillingOrder();
    const result = await orderPromise;
    assert.equal(result.response.status, 201);
    assert.equal(result.payload.order.id, "order_auth01f");
  } finally {
    await harness.close();
  }
});

test("Razorpay billing-order persistence failure reaches the caller", async () => {
  const harness = await createRazorpayOrderHarness({ failBillingOrder: true });
  try {
    const token = await signInExistingUser(harness);
    const result = await harness.request("/billing/razorpay/order", {
      method: "POST",
      token,
      body: { kind: "subscription", plan: "standard" },
    });
    assert.equal(result.response.status, 400);
    assert.match(result.payload.error, /simulated billing-order persistence failure/i);
  } finally {
    await harness.close();
  }
});
