import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer } from "../apps/api/src/server.js";
import { PLAN_CATALOG } from "../apps/api/src/plans.js";
import { loadLocalEnv } from "./postgres-env.mjs";

loadLocalEnv();

const EXPECTED_PAID_PLANS = {
  standard: {
    monthlyAmount: 199,
    annualAmount: 2388,
    paise: 238800,
    features: {
      razorpayCollections: true,
      recurringInvoices: true,
      aiInvoiceAssist: false,
      aiPoAssist: false,
      advancedReports: false,
      teamAccess: false,
      apiAccess: false,
      approvals: false,
    },
  },
  pro: {
    monthlyAmount: 499,
    annualAmount: 5988,
    paise: 598800,
    features: {
      razorpayCollections: true,
      recurringInvoices: true,
      aiInvoiceAssist: true,
      aiPoAssist: true,
      advancedReports: true,
      teamAccess: false,
      apiAccess: false,
      approvals: false,
    },
  },
  business: {
    monthlyAmount: 999,
    annualAmount: 11988,
    paise: 1198800,
    features: {
      razorpayCollections: true,
      recurringInvoices: true,
      aiInvoiceAssist: true,
      aiPoAssist: true,
      advancedReports: true,
      teamAccess: true,
      apiAccess: true,
      approvals: true,
    },
  },
};

const TEST_ADMIN_EMAIL = "support@eazinvoice.com";

function assertPlanCatalogPricing() {
  Object.entries(EXPECTED_PAID_PLANS).forEach(([planId, expected]) => {
    const plan = PLAN_CATALOG[planId];
    assert.ok(plan, `${planId} must exist in PLAN_CATALOG`);
    assert.equal(plan.monthlyAmount, expected.monthlyAmount, `${planId} monthly amount`);
    assert.equal(plan.annualAmount, expected.annualAmount, `${planId} annual amount`);
    assert.equal(plan.amount, expected.monthlyAmount, `${planId} legacy monthly amount`);
    assert.equal(plan.billingCycle, "yearly", `${planId} billing cycle`);
    assert.equal(Math.round(Number(plan.annualAmount) * 100), expected.paise, `${planId} Razorpay paise`);
  });
}

async function startAuditServer() {
  const server = createServer({ persist: false, useSupabaseEmailOtp: false });
  await new Promise((resolve) => server.listen(0, resolve));
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
}

async function request(baseUrl, path, { method = "GET", token, body, previewPlan } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
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

async function signup(baseUrl, { name, email, phone }) {
  const otp = await request(baseUrl, "/auth/email-otp/request", {
    method: "POST",
    body: { mode: "signup", email, phone },
  });
  assert.equal(otp.response.status, 200, `OTP request for ${email}`);
  const result = await request(baseUrl, "/auth/signup", {
    method: "POST",
    body: {
      name,
      email,
      phone,
      password: "AuditSecure123",
      otp: otp.payload.devOtp,
    },
  });
  assert.equal(result.response.status, 201, `signup for ${email}`);
  return result.payload;
}

async function createKycProfile(baseUrl, token, planId) {
  const result = await request(baseUrl, "/companies", {
    method: "POST",
    token,
    body: {
      name: `Audit ${planId} Co`,
      entityType: "company",
      address: "1 Audit Street",
      panNumber: "ABCDE1234F",
      gstin: "27ABCDE1234F1Z5",
      documentNames: ["pan.pdf"],
    },
  });
  assert.equal(result.response.status, 201, `KYC profile for ${planId}`);
  return result.payload;
}

async function assertPaidPlanFlow(baseUrl, planId, expected, capturedOrders) {
  const user = await signup(baseUrl, {
    name: `Audit ${planId}`,
    email: `audit-${planId}@example.com`,
    phone: `90000${String(Object.keys(capturedOrders).length + 1).padStart(5, "0")}`,
  });
  await createKycProfile(baseUrl, user.token, planId);

  const freePlan = await request(baseUrl, "/plans", { token: user.token });
  assert.equal(freePlan.response.status, 200, `${planId} free plan response`);
  assert.equal(freePlan.payload.active.plan, "free", `${planId} starts free`);
  assert.equal(freePlan.payload.active.features.razorpayCollections, false, `${planId} free Razorpay locked`);
  assert.equal(freePlan.payload.active.features.aiInvoiceAssist, false, `${planId} free AI locked`);
  assert.equal(freePlan.payload.active.features.teamAccess, false, `${planId} free team locked`);

  const order = await request(baseUrl, "/billing/razorpay/order", {
    method: "POST",
    token: user.token,
    body: { kind: "subscription", plan: planId },
  });
  assert.equal(order.response.status, 201, `${planId} order response`);
  assert.equal(order.payload.order.amount, expected.paise, `${planId} Razorpay order amount`);
  assert.equal(capturedOrders[planId].amount, expected.paise, `${planId} captured Razorpay amount`);
  assert.equal(capturedOrders[planId].currency, "INR", `${planId} captured Razorpay currency`);

  const rejected = await request(baseUrl, "/billing/razorpay/verify", {
    method: "POST",
    token: user.token,
    body: {
      razorpay_order_id: order.payload.order.id,
      razorpay_payment_id: `pay_audit_${planId}`,
      razorpay_signature: "invalid",
    },
  });
  assert.equal(rejected.response.status, 401, `${planId} rejects bad Razorpay signature`);
  const stillFree = await request(baseUrl, "/plans", { token: user.token });
  assert.equal(stillFree.payload.active.plan, "free", `${planId} stays free after failed payment verification`);

  const signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${order.payload.order.id}|pay_audit_${planId}`)
    .digest("hex");
  const verified = await request(baseUrl, "/billing/razorpay/verify", {
    method: "POST",
    token: user.token,
    body: {
      razorpay_order_id: order.payload.order.id,
      razorpay_payment_id: `pay_audit_${planId}`,
      razorpay_signature: signature,
    },
  });
  assert.equal(verified.response.status, 200, `${planId} verification response`);
  assert.equal(verified.payload.subscription.plan, planId, `${planId} activated plan`);
  assert.equal(verified.payload.subscription.status, "active", `${planId} active status`);
  assert.equal(verified.payload.subscription.amount, expected.annualAmount, `${planId} subscription amount`);
  assert.equal(verified.payload.subscription.monthlyAmount, expected.monthlyAmount, `${planId} monthly amount`);
  assert.equal(verified.payload.subscription.annualAmount, expected.annualAmount, `${planId} annual amount`);
  assert.equal(verified.payload.subscription.billingCycle, "yearly", `${planId} yearly billing`);

  const paidPlan = await request(baseUrl, "/plans", { token: user.token });
  assert.equal(paidPlan.response.status, 200, `${planId} paid plan response`);
  assert.equal(paidPlan.payload.active.plan, planId, `${planId} active plan`);
  Object.entries(expected.features).forEach(([feature, enabled]) => {
    assert.equal(paidPlan.payload.active.features[feature], enabled, `${planId} feature ${feature}`);
  });

  const duplicateVerification = await request(baseUrl, "/billing/razorpay/verify", {
    method: "POST",
    token: user.token,
    body: {
      razorpay_order_id: order.payload.order.id,
      razorpay_payment_id: `pay_audit_${planId}`,
      razorpay_signature: signature,
    },
  });
  assert.equal(duplicateVerification.response.status, 200, `${planId} duplicate verification response`);
  assert.equal(duplicateVerification.payload.duplicate, true, `${planId} duplicate verification is idempotent`);
  assert.equal(duplicateVerification.payload.subscription.id, verified.payload.subscription.id, `${planId} duplicate keeps subscription`);

  return {
    ...user,
    subscription: verified.payload.subscription,
  };
}

async function assertAdminPreview(baseUrl) {
  const admin = await signup(baseUrl, {
    name: "Support Admin",
    email: TEST_ADMIN_EMAIL,
    phone: "9665444554",
  });
  const normalUser = await signup(baseUrl, {
    name: "Normal Preview User",
    email: "audit-normal-preview@example.com",
    phone: "9000099999",
  });

  const adminPreview = await request(baseUrl, "/plans", {
    token: admin.token,
    previewPlan: "business",
  });
  assert.equal(adminPreview.response.status, 200, "admin preview response");
  assert.equal(adminPreview.payload.active.plan, "business", "admin preview plan");
  assert.equal(adminPreview.payload.active.preview.enabled, true, "admin preview enabled");
  assert.equal(adminPreview.payload.active.features.teamAccess, true, "admin preview business features");

  const userPreview = await request(baseUrl, "/plans", {
    token: normalUser.token,
    previewPlan: "business",
  });
  assert.equal(userPreview.response.status, 200, "user preview response");
  assert.equal(userPreview.payload.active.plan, "free", "non-admin cannot preview paid plan");
  assert.equal(userPreview.payload.active.preview.enabled, false, "non-admin preview disabled");
  assert.equal(userPreview.payload.active.features.teamAccess, false, "non-admin paid feature remains locked");

  const audit = await request(baseUrl, "/admin/subscription-audit", { token: admin.token });
  assert.equal(audit.response.status, 200, "admin subscription audit response");
  const catalog = Object.fromEntries(audit.payload.catalog.map((plan) => [plan.plan, plan]));
  Object.entries(EXPECTED_PAID_PLANS).forEach(([planId, expected]) => {
    assert.equal(catalog[planId].monthlyAmount, expected.monthlyAmount, `${planId} audit monthly amount`);
    assert.equal(catalog[planId].annualAmount, expected.annualAmount, `${planId} audit annual amount`);
    assert.equal(catalog[planId].razorpayAmountPaise, expected.paise, `${planId} audit Razorpay paise`);
    assert.equal(catalog[planId].billingCycle, "yearly", `${planId} audit billing cycle`);
  });
}

async function assertSubscriptionLifecycleEndpoints(baseUrl, user) {
  const cancelled = await request(baseUrl, `/subscriptions/${user.subscription.id}/cancel`, {
    method: "POST",
    token: user.token,
    body: { reason: "audit cancellation" },
  });
  assert.equal(cancelled.response.status, 200, "subscription cancellation response");
  assert.equal(cancelled.payload.status, "cancelled", "subscription cancelled status");
  assert.equal(typeof cancelled.payload.entitlementSync.synced, "boolean", "cancel sync reports entitlement state");
  const afterCancel = await request(baseUrl, "/plans", { token: user.token });
  assert.equal(afterCancel.payload.active.plan, "free", "cancelled subscription locks paid features");

  const renewed = await request(baseUrl, `/subscriptions/${user.subscription.id}/renew`, {
    method: "POST",
    token: user.token,
    body: {
      gateway: "razorpay",
      gatewayPaymentId: "pay_audit_lifecycle_renewal",
    },
  });
  assert.equal(renewed.response.status, 200, "subscription renewal response");
  assert.equal(renewed.payload.status, "active", "renewed subscription active");
  assert.equal(renewed.payload.billingCycle, "yearly", "renewed subscription remains yearly");
  assert.equal(renewed.payload.renewalCount, 1, "renewal count increments");
  const afterRenew = await request(baseUrl, "/plans", { token: user.token });
  assert.equal(afterRenew.payload.active.plan, user.subscription.plan, "renewal unlocks original plan");

  const downgraded = await request(baseUrl, `/subscriptions/${user.subscription.id}/downgrade`, {
    method: "POST",
    token: user.token,
    body: { plan: "free", gateway: "manual" },
  });
  assert.equal(downgraded.response.status, 201, "subscription downgrade response");
  assert.equal(downgraded.payload.plan, "free", "downgrade creates free entitlement");
  assert.equal(downgraded.payload.previousSubscriptionId, user.subscription.id, "downgrade keeps previous subscription reference");
  const afterDowngrade = await request(baseUrl, "/plans", { token: user.token });
  assert.equal(afterDowngrade.payload.active.plan, "free", "downgrade locks paid features");

  return downgraded.payload;
}

async function assertSubscriptionExpiryEndpoint(baseUrl, user) {
  const expired = await request(baseUrl, "/subscriptions/expire", {
    method: "POST",
    token: user.token,
    body: { now: "2099-01-01T00:00:00.000Z" },
  });
  assert.equal(expired.response.status, 403, "non-admin cannot run subscription expiry");
}

async function runEndpointAudit() {
  const previousAdminEmail = process.env.ADMIN_EMAIL;
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  const previousKeySecret = process.env.RAZORPAY_KEY_SECRET;
  const originalFetch = globalThis.fetch;
  const capturedOrders = {};

  process.env.ADMIN_EMAIL = TEST_ADMIN_EMAIL;
  process.env.RAZORPAY_KEY_ID = "rzp_test_subscription_audit";
  process.env.RAZORPAY_KEY_SECRET = "subscription_audit_secret";

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith("https://api.razorpay.com/v1/orders")) {
      const body = JSON.parse(options.body || "{}");
      const planId = String(body.notes?.plan || "unknown").toLowerCase();
      capturedOrders[planId] = body;
      return new Response(JSON.stringify({
        id: `order_audit_${planId}`,
        amount: body.amount,
        currency: body.currency,
        status: "created",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(url, options);
  };

  const { server, baseUrl } = await startAuditServer();
  try {
    let lifecycleUser = null;
    for (const [planId, expected] of Object.entries(EXPECTED_PAID_PLANS)) {
      const user = await assertPaidPlanFlow(baseUrl, planId, expected, capturedOrders);
      if (planId === "standard") lifecycleUser = user;
    }
    await assertSubscriptionLifecycleEndpoints(baseUrl, lifecycleUser);
    await assertSubscriptionExpiryEndpoint(baseUrl, lifecycleUser);
    await assertAdminPreview(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = originalFetch;
    if (previousAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previousAdminEmail;
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
    if (previousKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previousKeySecret;
  }
}

function runPostgresEntitlementVerifierIfConfigured() {
  if (!process.env.DATABASE_URL) {
    return {
      status: "skipped",
      reason: "DATABASE_URL is not configured",
    };
  }
  const result = spawnSync(process.execPath, ["scripts/postgres-verify-entitlements.mjs"], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  assert.equal(result.status, 0, "Postgres entitlement verification must pass");
  return {
    status: "passed",
  };
}

assertPlanCatalogPricing();
await runEndpointAudit();
const postgres = runPostgresEntitlementVerifierIfConfigured();

console.log(JSON.stringify({
  ok: true,
  checkedPlans: Object.keys(EXPECTED_PAID_PLANS),
  checks: [
    "plan catalog monthly and yearly pricing",
    "Razorpay subscription order paise amounts",
    "verified payment activates the correct plan",
    "duplicate payment verification is idempotent",
    "subscription cancel, renewal, downgrade, and expiry routes",
    "paid feature unlocks and lower-tier inheritance",
    "free plan upgrade indicators remain locked",
    "admin preview remains admin-only",
    "Postgres entitlement verifier",
  ],
  postgres,
}, null, 2));
