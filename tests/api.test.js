import assert from "node:assert/strict";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { createStore } from "../apps/api/src/store.js";
import { createServer } from "../apps/api/src/server.js";

const TEST_ADMIN_EMAIL = "support@eazinvoice.com";

function useTestAdminEmail() {
  const previousAdminEmail = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = TEST_ADMIN_EMAIL;
  return () => {
    if (previousAdminEmail === undefined) {
      delete process.env.ADMIN_EMAIL;
    } else {
      process.env.ADMIN_EMAIL = previousAdminEmail;
    }
  };
}

test("health check is ok", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  assert.equal(api.healthCheck().ok, true);
});

test("can create invoice and calculate totals", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const company = api.createCompany({ name: "Acme" });
  const customer = api.createCustomer({ name: "Buyer", companyId: company.id });
  assert.equal(customer.customerCode, "CUS-0001");
  const invoice = api.createInvoice({
    companyId: company.id,
    customerId: customer.id,
    invoiceNumber: "INV-1",
    taxRate: 18,
    items: [{ description: "Work", quantity: 2, rate: 100 }],
  });

  assert.equal(invoice.subtotal, 200);
  assert.equal(invoice.taxAmount, 36);
  assert.equal(invoice.total, 236);
});

test("records subscription monetization by subscriber type", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });

  const subscription = api.createSubscription({
    subscriberType: "company",
    subscriberName: "Acme Group",
    amount: 1499,
    currency: "INR",
    plan: "free",
    adminUserId: "usr_admin",
  });

  assert.equal(subscription.amount, 1499);

  const summary = api.summarizeMonetization();
  assert.equal(summary.totalAmount, 1499);
  assert.equal(summary.byType.company, 1499);
  assert.equal(summary.count, 1);
});

test("isolates invoices per user and generates owner-specific codes", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const alice = api.createUser({ name: "Alice", email: "alice@example.com" });
  const bob = api.createUser({ name: "Bob", email: "bob@example.com" });

  const aliceCompany = api.createCompany({ name: "Alice Co", ownerUserId: alice.id });
  const bobCompany = api.createCompany({ name: "Bob Co", ownerUserId: bob.id });

  const aliceInvoice = api.createInvoice({
    ownerUserId: alice.id,
    companyId: aliceCompany.id,
    customerId: null,
    invoiceDate: "2026-05-24",
    dueDate: "2026-05-31",
    taxRate: 18,
    items: [{ description: "Work", quantity: 1, rate: 100 }],
  });

  api.createInvoice({
    ownerUserId: bob.id,
    companyId: bobCompany.id,
    customerId: null,
    invoiceDate: "2026-05-24",
    dueDate: "2026-05-31",
    taxRate: 18,
    items: [{ description: "Work", quantity: 1, rate: 200 }],
  });

  assert.match(aliceInvoice.invoiceCode, /^ALICECO|^CMP|^INV/);
  assert.match(aliceInvoice.invoiceNumber, /^[A-Z0-9]+\/2026\/\d{4}$/);
  assert.equal(api.listInvoices(alice).length, 1);
  assert.equal(api.listInvoices(bob).length, 1);
  assert.equal(api.getInvoice(aliceInvoice.id, bob), null);
  assert.ok(api.getInvoice(aliceInvoice.id, alice));
});

test("purchase orders follow the same ownership rules", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "User", email: "user@example.com" });
  const company = api.createCompany({ name: "User Co", ownerUserId: user.id });

  const po = api.createPurchaseOrder({
    ownerUserId: user.id,
    companyId: company.id,
    taxRate: 18,
    items: [{ description: "Materials", quantity: 2, rate: 50 }],
  });

  assert.match(po.poCode, /^[A-Z0-9]+$/);
  assert.match(po.poNumber, /^[A-Z0-9]+-\d{4}$/);
  assert.equal(po.vendorCode, "VEN-0001");
  assert.equal(api.listPurchaseOrders(user).length, 1);
  assert.ok(api.getPurchaseOrder(po.id, user));
});

test("invoice totals default invalid numbers to zero and support item GST rates", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const company = api.createCompany({ name: "GST Co" });
  const invoice = api.createInvoice({
    companyId: company.id,
    taxRate: 18,
    discount: "bad",
    shipping: 25,
    roundOff: "not-a-number",
    items: [
      { description: "Design", quantity: 1, rate: 1000, gstRate: 18, hsnSac: "9983" },
      { description: "Free setup", quantity: "", rate: "", gstRate: 18 },
    ],
  });

  assert.equal(invoice.subtotal, 1000);
  assert.equal(invoice.discount, 0);
  assert.equal(invoice.taxAmount, 180);
  assert.equal(invoice.shipping, 25);
  assert.equal(invoice.roundOff, 0);
  assert.equal(invoice.total, 1205);
  assert.equal(invoice.items[0].hsnSac, "9983");
});

test("invoice item discounts reduce taxable line totals", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const company = api.createCompany({ name: "Discount Co" });
  const invoice = api.createInvoice({
    companyId: company.id,
    taxRate: 18,
    discount: 50,
    items: [
      { description: "Consulting", quantity: 2, rate: 1000, discount: 100, gstRate: 18, hsnSac: "9983" },
    ],
  });

  assert.equal(invoice.subtotal, 2000);
  assert.equal(invoice.discount, 150);
  assert.equal(invoice.taxAmount, 333);
  assert.equal(invoice.total, 2183);
  assert.equal(invoice.items[0].discount, 100);
});

test("manual payments update invoice payment status", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "Pay User", email: "pay@example.com" });
  const invoice = api.createInvoice({
    ownerUserId: user.id,
    status: "created",
    taxRate: 0,
    items: [{ description: "Work", quantity: 1, rate: 1000 }],
  });

  const partial = api.recordInvoicePayment(invoice.id, {
    amount: 400,
    mode: "UPI",
    reference: "UTR123",
  });
  assert.equal(partial.invoice.paymentStatus, "part_paid");
  assert.equal(partial.invoice.paidAmount, 400);
  assert.equal(partial.invoice.balanceAmount, 600);

  const paid = api.recordInvoicePayment(invoice.id, {
    amount: 600,
    mode: "Bank Transfer",
    reference: "UTR456",
  });
  assert.equal(paid.invoice.paymentStatus, "paid");
  assert.equal(paid.invoice.balanceAmount, 0);
});

test("admin can restrict and restore accounts", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "Risky User", email: "risk@example.com" });

  const restricted = api.setUserRestriction(user.id, {
    accountStatus: "restricted",
    restrictedReason: "Suspicious activity review",
    restrictedAt: "2026-05-24T00:00:00.000Z",
  });

  assert.equal(restricted.accountStatus, "restricted");
  assert.equal(api.listRestrictedUsers().length, 1);

  const restored = api.setUserRestriction(user.id, {
    accountStatus: "active",
    restrictedReason: "",
    restrictedAt: "",
  });

  assert.equal(restored.accountStatus, "active");
  assert.equal(api.listRestrictedUsers().length, 0);
});

test("admin can update kyc review status and permissions", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const company = api.createCompany({
    name: "Review Co",
    entityType: "company",
    kycStatus: "pending",
    documentNames: ["pan.pdf"],
  });
  const reviewed = api.updateCompanyKyc(company.id, {
    kycStatus: "verified",
    reviewStatus: "approved",
    reviewNotes: "Looks good",
    reviewedAt: "2026-05-24T00:00:00.000Z",
  });
  assert.equal(reviewed.kycStatus, "verified");
  assert.equal(reviewed.reviewStatus, "approved");

  const admin = api.createUser({ name: "Admin", email: "admin@example.com", role: "admin" });
  const updated = api.setUserPermissions(admin.id, ["admin", "kyc-review"]);
  assert.deepEqual(updated.permissions, ["admin", "kyc-review"]);
});

test("onboarding business profile can be created without KYC documents", async () => {
  const server = createServer({ persist: false, useSupabaseEmailOtp: false });
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(path, { method = "GET", token, body } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { response, payload: await response.json() };
  }

  try {
    const otp = await request("/auth/email-otp/request", {
      method: "POST",
      body: { mode: "signup", email: "onboard@example.com", phone: "9011122233" },
    });
    const signup = await request("/auth/signup", {
      method: "POST",
      body: {
        name: "Onboard User",
        email: "onboard@example.com",
        password: "Secure123",
        phone: "9011122233",
        otp: otp.payload.devOtp,
      },
    });
    const profile = await request("/companies", {
      method: "POST",
      token: signup.payload.token,
      body: {
        profilePurpose: "onboarding",
        name: "Onboard Studio",
        entityType: "company",
        businessType: "Agency",
        gstRegistered: false,
        state: "Maharashtra",
        pincode: "400001",
      },
    });

    assert.equal(profile.response.status, 201);
    assert.equal(profile.payload.kycStatus, "not_submitted");
    assert.equal(profile.payload.businessType, "Agency");
    assert.equal(profile.payload.state, "Maharashtra");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("signed-in user can update access profile", async () => {
  const server = createServer({ persist: false, useSupabaseEmailOtp: false });
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(path, { method = "GET", token, body } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { response, payload: await response.json() };
  }

  try {
    const otp = await request("/auth/email-otp/request", {
      method: "POST",
      body: { mode: "signup", email: "access@example.com", phone: "9022233344" },
    });
    const signup = await request("/auth/signup", {
      method: "POST",
      body: {
        name: "Access User",
        email: "access@example.com",
        password: "Secure123",
        phone: "9022233344",
        otp: otp.payload.devOtp,
      },
    });
    const updated = await request("/me", {
      method: "PATCH",
      token: signup.payload.token,
      body: { name: "Access Updated", phone: "9033344455" },
    });

    assert.equal(updated.response.status, 200);
    assert.equal(updated.payload.user.name, "Access Updated");
    assert.equal(updated.payload.user.phone, "919033344455");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("signup and login require email OTP verification", async () => {
  const server = createServer({ persist: false, useSupabaseEmailOtp: false });
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const signupOtpResponse = await fetch(`${baseUrl}/auth/email-otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "signup",
        email: "otp@example.com",
        phone: "98765 43210",
      }),
    });
    const signupOtp = await signupOtpResponse.json();
    assert.equal(signupOtpResponse.status, 200);
    assert.match(signupOtp.devOtp, /^\d{6}$/);

    const signupResponse = await fetch(`${baseUrl}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "OTP User",
        email: "otp@example.com",
        password: "Secure123",
        phone: "98765 43210",
        otp: signupOtp.devOtp,
      }),
    });
    const signup = await signupResponse.json();
    assert.equal(signupResponse.status, 201);
    assert.equal(signup.user.phone, "919876543210");
    assert.equal(signup.user.emailVerified, true);
    assert.equal(signup.user.mobileVerified, false);

    const loginOtpResponse = await fetch(`${baseUrl}/auth/email-otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "login",
        email: "otp@example.com",
        phone: "9876543210",
      }),
    });
    const loginOtp = await loginOtpResponse.json();
    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "otp@example.com",
        password: "Secure123",
        phone: "9876543210",
        otp: loginOtp.devOtp,
      }),
    });
    const login = await loginResponse.json();
    assert.equal(loginResponse.status, 200);
    assert.ok(login.token);

    const badOtpResponse = await fetch(`${baseUrl}/auth/email-otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "login",
        email: "otp@example.com",
        phone: "9876543210",
      }),
    });
    const badOtp = await badOtpResponse.json();
    const badLoginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "otp@example.com",
        password: "Wrong123",
        phone: "9876543210",
        otp: badOtp.devOtp,
      }),
    });
    assert.equal(badLoginResponse.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("signup OTP blocks already registered users and login OTP blocks unknown users", async () => {
  const server = createServer({ persist: false, useSupabaseEmailOtp: false });
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function requestOtp(mode, email) {
    const response = await fetch(`${baseUrl}/auth/email-otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, email }),
    });
    return { response, payload: await response.json() };
  }

  try {
    const firstOtp = await requestOtp("signup", "registered@example.com");
    assert.equal(firstOtp.response.status, 200);

    const signupResponse = await fetch(`${baseUrl}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Registered User",
        email: "registered@example.com",
        password: "Secure123",
        phone: "9876543210",
        otp: firstOtp.payload.devOtp,
      }),
    });
    assert.equal(signupResponse.status, 201);

    const duplicateOtp = await requestOtp("signup", "registered@example.com");
    assert.equal(duplicateOtp.response.status, 409);
    assert.equal(duplicateOtp.payload.error, "You have already registered. Please login.");

    const unknownLoginOtp = await requestOtp("login", "unknown@example.com");
    assert.equal(unknownLoginOtp.response.status, 404);
    assert.equal(unknownLoginOtp.payload.error, "This email is not registered yet. Please signup first.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("configured admin email receives admin rights through normal signup and login", async () => {
  const restoreAdminEmail = useTestAdminEmail();
  const server = createServer({ persist: false, useSupabaseEmailOtp: false });
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function requestOtp({ mode, email, phone }) {
    const response = await fetch(`${baseUrl}/auth/email-otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, email, phone }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.match(payload.devOtp, /^\d{6}$/);
    return payload.devOtp;
  }

  try {
    const adminOtp = await requestOtp({
      mode: "signup",
      email: "support@eazinvoice.com",
      phone: "9665444554",
    });
    const adminSignupResponse = await fetch(`${baseUrl}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Jess Kurian",
        email: "support@eazinvoice.com",
        password: "AdminSecure123",
        phone: "9665444554",
        otp: adminOtp,
      }),
    });
    const adminSignup = await adminSignupResponse.json();
    assert.equal(adminSignupResponse.status, 201);
    assert.equal(adminSignup.user.role, "admin");
    assert.deepEqual(adminSignup.user.permissions, ["admin", "subscriptions", "kyc-review", "account-control"]);

    const adminLoginOtp = await requestOtp({
      mode: "login",
      email: "support@eazinvoice.com",
      phone: "9665444554",
    });
    const adminLoginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "support@eazinvoice.com",
        password: "AdminSecure123",
        phone: "9665444554",
        otp: adminLoginOtp,
      }),
    });
    const adminLogin = await adminLoginResponse.json();
    assert.equal(adminLoginResponse.status, 200);
    assert.equal(adminLogin.user.role, "admin");

    const userOtp = await requestOtp({
      mode: "signup",
      email: "customer@example.com",
      phone: "9876543210",
    });
    const userSignupResponse = await fetch(`${baseUrl}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Customer User",
        email: "customer@example.com",
        password: "UserSecure123",
        phone: "9876543210",
        otp: userOtp,
      }),
    });
    const userSignup = await userSignupResponse.json();
    assert.equal(userSignupResponse.status, 201);
    assert.equal(userSignup.user.role, "user");
    assert.deepEqual(userSignup.user.permissions, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreAdminEmail();
  }
});

test("admin access is restricted to the configured admin email", async () => {
  const restoreAdminEmail = useTestAdminEmail();
  const server = createServer({ persist: false, useSupabaseEmailOtp: false });
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(path, { method = "GET", token, body } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { response, payload: await response.json() };
  }

  async function signup({ name, email, password, phone }) {
    const otp = await request("/auth/email-otp/request", {
      method: "POST",
      body: { mode: "signup", email, phone },
    });
    const result = await request("/auth/signup", {
      method: "POST",
      body: { name, email, password, phone, otp: otp.payload.devOtp },
    });
    assert.equal(result.response.status, 201);
    return result.payload;
  }

  try {
    const admin = await signup({
      name: "Jess Kurian",
      email: "support@eazinvoice.com",
      password: "AdminSecure123",
      phone: "9665444554",
    });
    const user = await signup({
      name: "Normal User",
      email: "normal@example.com",
      password: "UserSecure123",
      phone: "9876543210",
    });

    const adminMe = await request("/me", { token: admin.token });
    assert.equal(adminMe.payload.admin.authorized, true);

    const userMe = await request("/me", { token: user.token });
    assert.equal(userMe.payload.admin.authorized, false);

    const blockedMoney = await request("/admin/money", { token: user.token });
    assert.equal(blockedMoney.response.status, 403);

    const permissions = await request(`/admin/users/${user.user.id}?action=permissions`, {
      method: "PATCH",
      token: admin.token,
      body: { permissions: ["admin", "subscriptions", "kyc-review", "account-control"] },
    });
    assert.equal(permissions.response.status, 200);
    assert.equal(permissions.payload.role, "user");
    assert.deepEqual(permissions.payload.permissions, ["subscriptions", "kyc-review", "account-control"]);

    const stillBlocked = await request("/admin/money", { token: user.token });
    assert.equal(stillBlocked.response.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreAdminEmail();
  }
});

test("paid subscriptions require submitted KYC documents while free does not", async () => {
  const server = createServer({ persist: false, useSupabaseEmailOtp: false });
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(path, { method = "GET", token, body } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { response, payload: await response.json() };
  }

  try {
    const otpResult = await request("/auth/email-otp/request", {
      method: "POST",
      body: {
        mode: "signup",
        email: "paid@example.com",
        phone: "9123456780",
      },
    });
    const signupResult = await request("/auth/signup", {
      method: "POST",
      body: {
        name: "Paid User",
        email: "paid@example.com",
        password: "Secure123",
        phone: "9123456780",
        otp: otpResult.payload.devOtp,
      },
    });
    const token = signupResult.payload.token;

    const freeResult = await request("/subscriptions", {
      method: "POST",
      token,
      body: {
        plan: "free",
        amount: 0,
        subscriberType: "individual",
      },
    });
    assert.equal(freeResult.response.status, 201);

    const paidBlocked = await request("/subscriptions", {
      method: "POST",
      token,
      body: {
        plan: "standard",
        amount: 499,
        subscriberType: "individual",
      },
    });
    assert.equal(paidBlocked.response.status, 400);
    assert.match(paidBlocked.payload.error, /KYC documents/);

    const companyResult = await request("/companies", {
      method: "POST",
      token,
      body: {
        name: "Paid Co",
        entityType: "company",
        address: "1 Test Street",
        panNumber: "ABCDE1234F",
        documentNames: ["pan.pdf"],
      },
    });
    assert.equal(companyResult.response.status, 201);

    const paidPending = await request("/subscriptions", {
      method: "POST",
      token,
      body: {
        plan: "standard",
        amount: 499,
        subscriberType: "company",
      },
    });
    assert.equal(paidPending.response.status, 201);
    assert.equal(paidPending.payload.status, "kyc_pending");
    assert.equal(paidPending.payload.companyId, companyResult.payload.id);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("company signup stores registrant details", async () => {
  const server = createServer({ persist: false, useSupabaseEmailOtp: false });
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const otpResponse = await fetch(`${baseUrl}/auth/email-otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "signup",
        email: "company@example.com",
        phone: "9000011111",
      }),
    });
    const otp = await otpResponse.json();
    const signupResponse = await fetch(`${baseUrl}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriberType: "company",
        name: "Company Owner",
        email: "company@example.com",
        password: "Secure123",
        phone: "9000011111",
        otp: otp.devOtp,
        registrantName: "Company Owner",
        registrantDesignation: "Director",
        registrantEmail: "owner@company.example",
        registrantPhone: "9000011111",
      }),
    });
    const signup = await signupResponse.json();
    assert.equal(signupResponse.status, 201);
    assert.equal(signup.user.registrant.name, "Company Owner");
    assert.equal(signup.user.registrant.designation, "Director");
    assert.equal(signup.user.registrant.phone, "919000011111");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
