import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { describePersistence } from "../apps/api/src/persistence.js";
import { resolveReportPeriod } from "../apps/api/src/postgres-reporting.js";
import { buildPlanUsageDetails, getFeatureRequirement, getPlanDefinition, resolvePlanUsageStatus } from "../apps/api/src/plans.js";
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

test("Postgres report periods support monthly, yearly, custom, and financial-year filters", () => {
  assert.deepEqual(resolveReportPeriod({ month: "6", year: "2026" }), {
    mode: "month",
    year: 2026,
    month: 6,
    startDate: "2026-06-01",
    endDate: "2026-06-30",
  });
  assert.deepEqual(resolveReportPeriod({ year: "2026" }), {
    mode: "year",
    year: 2026,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  });
  assert.deepEqual(resolveReportPeriod({ financialYear: "2026-2027" }), {
    mode: "financial-year",
    financialYear: "2026-2027",
    startDate: "2026-04-01",
    endDate: "2027-03-31",
  });
  assert.deepEqual(resolveReportPeriod({ startDate: "2026-05-01", endDate: "2026-05-15" }), {
    mode: "custom",
    startDate: "2026-05-01",
    endDate: "2026-05-15",
  });
});

test("persistence can use a mounted production data directory", () => {
  const previousDataDir = process.env.EAZINVOICE_DATA_DIR;
  const mountedDir = path.join(process.cwd(), "data", "test-mounted-json");
  fs.rmSync(mountedDir, { recursive: true, force: true });
  process.env.EAZINVOICE_DATA_DIR = mountedDir;
  try {
    const persistence = describePersistence();
    assert.equal(persistence.mode, "mounted-json");
    assert.equal(persistence.dataDir, mountedDir);
    assert.ok(fs.existsSync(path.join(mountedDir, "eazinvoice-data.json")));
  } finally {
    if (previousDataDir === undefined) {
      delete process.env.EAZINVOICE_DATA_DIR;
    } else {
      process.env.EAZINVOICE_DATA_DIR = previousDataDir;
    }
    fs.rmSync(mountedDir, { recursive: true, force: true });
  }
});

test("persistence keeps a backup before replacing saved state", () => {
  const previousDataDir = process.env.EAZINVOICE_DATA_DIR;
  const mountedDir = path.join(process.cwd(), "data", "test-mounted-json-backup");
  fs.rmSync(mountedDir, { recursive: true, force: true });
  process.env.EAZINVOICE_DATA_DIR = mountedDir;
  try {
    const store = createStore();
    store.createUser({ name: "Backup User", email: "backup@example.com" });
    const persistence = describePersistence();
    assert.equal(persistence.backupExists, true);
    assert.ok(fs.existsSync(path.join(mountedDir, "eazinvoice-data.backup.json")));
  } finally {
    if (previousDataDir === undefined) {
      delete process.env.EAZINVOICE_DATA_DIR;
    } else {
      process.env.EAZINVOICE_DATA_DIR = previousDataDir;
    }
    fs.rmSync(mountedDir, { recursive: true, force: true });
  }
});

test("store can use an injected persistence adapter", () => {
  const savedStates = [];
  const store = createStore({}, {
    persistenceAdapter: {
      load() {
        return {
          users: [{ id: "usr_0001", name: "Loaded User", email: "loaded@example.com" }],
          counters: { user: 1 },
        };
      },
      save(state) {
        savedStates.push(state);
      },
    },
  });

  assert.equal(store.getUserByEmail("loaded@example.com").name, "Loaded User");
  const created = store.createUser({ name: "Saved User", email: "saved@example.com" });
  assert.equal(created.id, "usr_0002");
  assert.equal(savedStates.length, 1);
  assert.equal(savedStates[0].users.length, 2);
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

test("purchase/work order drafts edit safely and deleted records are preserved historically", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "PO User", email: "po-user@example.com" });
  const draft = api.createPurchaseOrder({
    ownerUserId: user.id,
    status: "draft",
    documentType: "wo",
    taxRate: 18,
    items: [{ description: "Vendor work", quantity: 1, rate: 1000, gstRate: 18 }],
  });
  assert.equal(draft.status, "draft");
  assert.equal(draft.documentType, "wo");
  assert.equal(draft.total, 1180);

  const edited = api.updatePurchaseOrder(draft.id, { discount: 100 });
  assert.equal(edited.subtotal, 1000);
  assert.equal(edited.discount, 100);
  assert.equal(edited.taxAmount, 162);
  assert.equal(edited.total, 1062);

  const created = api.updatePurchaseOrder(draft.id, { status: "created" });
  assert.equal(created.status, "created");
  assert.equal(created.total, 1062);

  const deleted = api.deletePurchaseOrder(draft.id, user);
  assert.equal(deleted.status, "deleted");
  assert.equal(api.listPurchaseOrders(user).some((entry) => entry.id === draft.id && entry.status === "deleted"), true);
  assert.throws(
    () => api.updatePurchaseOrder(draft.id, { discount: 0 }),
    /Deleted purchase\/work orders cannot be edited/,
  );
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

test("draft and deleted invoices cannot receive payments", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "Guarded User", email: "guarded@example.com" });
  const draft = api.createInvoice({
    ownerUserId: user.id,
    status: "draft",
    taxRate: 0,
    items: [{ description: "Draft work", quantity: 1, rate: 1000 }],
  });

  assert.throws(
    () => api.recordInvoicePayment(draft.id, { amount: 100 }),
    /Create the invoice before recording payment/,
  );
  assert.throws(
    () => api.createInvoicePaymentLink(draft.id, { gateway: "razorpay" }),
    /Create the invoice before recording payment/,
  );

  const invoice = api.createInvoice({
    ownerUserId: user.id,
    status: "created",
    taxRate: 0,
    items: [{ description: "Created work", quantity: 1, rate: 500 }],
  });
  const deleted = api.deleteInvoice(invoice.id, user);
  assert.equal(deleted.status, "deleted");
  assert.throws(
    () => api.recordInvoicePayment(invoice.id, { amount: 100 }),
    /Deleted invoices cannot receive payments/,
  );
});

test("invoice amount edits recalculate totals and payment balance", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const invoice = api.createInvoice({
    status: "created",
    taxRate: 18,
    items: [{ description: "Design", quantity: 1, rate: 1000, gstRate: 18 }],
  });
  assert.equal(invoice.total, 1180);

  const discounted = api.updateInvoice(invoice.id, { discount: 100 });
  assert.equal(discounted.subtotal, 1000);
  assert.equal(discounted.discount, 100);
  assert.equal(discounted.taxAmount, 162);
  assert.equal(discounted.total, 1062);
  assert.equal(discounted.balanceAmount, 1062);
});

test("online invoice collection links require Standard or higher", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const freeUser = api.createUser({ name: "Free Link User", email: "free-link@example.com" });
  const freeInvoice = api.createInvoice({
    ownerUserId: freeUser.id,
    status: "created",
    taxRate: 0,
    items: [{ description: "Consulting", quantity: 1, rate: 1000 }],
  });

  assert.throws(
    () => api.createInvoicePaymentLink(freeInvoice.id, { gateway: "razorpay" }),
    /Razorpay collection links are available on Standard, Pro, and Business plans/,
  );

  const standardUser = api.createUser({ name: "Standard Link User", email: "standard-link@example.com" });
  api.createSubscription({
    userId: standardUser.id,
    subscriberName: standardUser.name,
    plan: "standard",
    amount: 3588,
    billingCycle: "yearly",
    status: "active",
  });
  const standardInvoice = api.createInvoice({
    ownerUserId: standardUser.id,
    status: "created",
    taxRate: 0,
    items: [{ description: "Retainer", quantity: 1, rate: 2000 }],
  });
  const linked = api.createInvoicePaymentLink(standardInvoice.id, { gateway: "razorpay" });
  assert.equal(linked.paymentGateway, "razorpay");
  assert.equal(linked.paymentLink.status, "created");
  assert.equal(linked.paymentLink.amount, 2000);
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
    assert.equal(paidPending.payload.amount, 3588);
    assert.equal(paidPending.payload.monthlyAmount, 299);
    assert.equal(paidPending.payload.billingCycle, "yearly");

    const planAfterPending = await request("/plans", { token });
    assert.equal(planAfterPending.response.status, 200);
    assert.equal(planAfterPending.payload.active.plan, "free");
    assert.equal(planAfterPending.payload.active.features.razorpayCollections, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("razorpay subscription activation requires verified signature and is idempotent", async () => {
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  const previousKeySecret = process.env.RAZORPAY_KEY_SECRET;
  const previousWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_KEY_ID = "rzp_test_eazinvoice";
  process.env.RAZORPAY_KEY_SECRET = "test_secret_for_signature";
  process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret_for_signature";

  const originalFetch = globalThis.fetch;
  let capturedRazorpayOrderBody = null;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith("https://api.razorpay.com/v1/orders")) {
      const body = JSON.parse(options.body || "{}");
      capturedRazorpayOrderBody = body;
      return new Response(JSON.stringify({
        id: "order_test_standard",
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

  const server = createServer({ persist: false, useSupabaseEmailOtp: false });
  await new Promise((resolve) => server.listen(0, resolve));
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

  try {
    const otpResult = await request("/auth/email-otp/request", {
      method: "POST",
      body: {
        mode: "signup",
        email: "razorpay-user@example.com",
        phone: "9123456780",
      },
    });
    const signupResult = await request("/auth/signup", {
      method: "POST",
      body: {
        name: "Razorpay User",
        email: "razorpay-user@example.com",
        password: "Secure123",
        phone: "9123456780",
        otp: otpResult.payload.devOtp,
      },
    });
    assert.equal(signupResult.response.status, 201);
    const token = signupResult.payload.token;

    const companyResult = await request("/companies", {
      method: "POST",
      token,
      body: {
        name: "Razorpay Co",
        entityType: "company",
        address: "1 Billing Street",
        panNumber: "ABCDE1234F",
        documentNames: ["pan.pdf"],
      },
    });
    assert.equal(companyResult.response.status, 201);

    const orderResult = await request("/billing/razorpay/order", {
      method: "POST",
      token,
      body: { kind: "subscription", plan: "standard" },
    });
    assert.equal(orderResult.response.status, 201);
    assert.equal(orderResult.payload.order.id, "order_test_standard");
    assert.equal(capturedRazorpayOrderBody.amount, 358800);
    assert.equal(orderResult.payload.description, "Standard plan - INR 299/month billed yearly");

    const invalidVerify = await request("/billing/razorpay/verify", {
      method: "POST",
      token,
      body: {
        razorpay_order_id: "order_test_standard",
        razorpay_payment_id: "pay_test_standard",
        razorpay_signature: "invalid",
      },
    });
    assert.equal(invalidVerify.response.status, 401);

    const stillFree = await request("/plans", { token });
    assert.equal(stillFree.payload.active.plan, "free");

    const validSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update("order_test_standard|pay_test_standard")
      .digest("hex");
    const verified = await request("/billing/razorpay/verify", {
      method: "POST",
      token,
      body: {
        razorpay_order_id: "order_test_standard",
        razorpay_payment_id: "pay_test_standard",
        razorpay_signature: validSignature,
      },
    });
    assert.equal(verified.response.status, 200);
    assert.equal(verified.payload.subscription.plan, "standard");
    assert.equal(verified.payload.subscription.status, "active");
    assert.equal(verified.payload.subscription.amount, 3588);
    assert.equal(verified.payload.subscription.monthlyAmount, 299);
    assert.equal(verified.payload.subscription.annualAmount, 3588);
    assert.equal(verified.payload.subscription.billingCycle, "yearly");
    assert.ok(verified.payload.subscription.renewsAt);

    const paidPlan = await request("/plans", { token });
    assert.equal(paidPlan.payload.active.plan, "standard");
    assert.equal(paidPlan.payload.active.features.razorpayCollections, true);

    const duplicate = await request("/billing/razorpay/verify", {
      method: "POST",
      token,
      body: {
        razorpay_order_id: "order_test_standard",
        razorpay_payment_id: "pay_test_standard",
        razorpay_signature: validSignature,
      },
    });
    assert.equal(duplicate.response.status, 200);
    assert.equal(duplicate.payload.duplicate, true);

    const subscriptions = await request("/subscriptions/me", { token });
    assert.equal(subscriptions.payload.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = originalFetch;
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
    if (previousKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previousKeySecret;
    if (previousWebhookSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = previousWebhookSecret;
  }
});

test("manual paid subscription requests remain pending even when kyc is verified", async () => {
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
    const otpResult = await request("/auth/email-otp/request", {
      method: "POST",
      body: { mode: "signup", email, phone },
    });
    const signupResult = await request("/auth/signup", {
      method: "POST",
      body: { name, email, password, phone, otp: otpResult.payload.devOtp },
    });
    assert.equal(signupResult.response.status, 201);
    return signupResult.payload;
  }

  try {
    const admin = await signup({
      name: "Support Admin",
      email: TEST_ADMIN_EMAIL,
      password: "AdminSecure123",
      phone: "9665444554",
    });
    const signupResult = await signup({
      name: "Verified KYC",
      email: "verified-kyc@example.com",
      password: "Secure123",
      phone: "9123456780",
    });
    const token = signupResult.token;

    const companyResult = await request("/companies", {
      method: "POST",
      token,
      body: {
        name: "Verified KYC Co",
        entityType: "company",
        address: "1 Verified Street",
        panNumber: "ABCDE1234F",
        documentNames: ["pan.pdf"],
      },
    });
    assert.equal(companyResult.response.status, 201);
    assert.equal(companyResult.payload.kycStatus, "pending");

    const approved = await request(`/admin/kyc-review/${companyResult.payload.id}?action=approve`, {
      method: "PATCH",
      token: admin.token,
      body: { notes: "Approved for payment-pending test" },
    });
    assert.equal(approved.response.status, 200);
    assert.equal(approved.payload.kycStatus, "verified");

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
    assert.equal(paidPending.payload.status, "payment_pending");
    assert.equal(paidPending.payload.amount, 3588);
    assert.equal(paidPending.payload.monthlyAmount, 299);
    assert.equal(paidPending.payload.billingCycle, "yearly");

    const planAfterPending = await request("/plans", { token });
    assert.equal(planAfterPending.payload.active.plan, "free");
    assert.equal(planAfterPending.payload.active.features.razorpayCollections, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreAdminEmail();
  }
});

test("razorpay webhooks require configured signature verification", async () => {
  const previousWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret_for_signature";

  const server = createServer({ persist: false, useSupabaseEmailOtp: false });
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const rawBody = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_unsigned",
          order_id: "order_unsigned",
          amount: 10000,
          currency: "INR",
        },
      },
    },
  });

  try {
    const unsigned = await fetch(`${baseUrl}/webhooks/razorpay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: rawBody,
    });
    assert.equal(unsigned.status, 401);

    const signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");
    const signed = await fetch(`${baseUrl}/webhooks/razorpay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Razorpay-Signature": signature,
      },
      body: rawBody,
    });
    assert.equal(signed.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousWebhookSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = previousWebhookSecret;
  }
});

test("active paid plans change limits and unlock feature flags", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "Pro User", email: "pro@example.com" });
  api.createSubscription({
    userId: user.id,
    subscriberType: "individual",
    subscriberName: user.name,
    plan: "pro",
    amount: 999,
    status: "active",
  });

  const summary = api.getFreePlanSummary(user);
  assert.equal(summary.plan, "pro");
  assert.equal(summary.features.aiInvoiceAssist, true);
  assert.equal(summary.features.razorpayCollections, true);
  assert.equal(summary.limits.companies, 5);
  assert.equal(api.userCanUseFeature(user, "aiPoAssist"), true);
});

test("plan usage status names the active tier and exposes remaining counts", () => {
  const standard = getPlanDefinition("standard");
  const blockedStatus = resolvePlanUsageStatus(
    { invoicesPerMonth: standard.limits.invoicesPerMonth + 1 },
    standard.limits,
    { planLabel: standard.label },
  );
  assert.equal(blockedStatus.allowed, false);
  assert.equal(blockedStatus.limitKey, "invoicesPerMonth");
  assert.equal(blockedStatus.limitLabel, "monthly invoices");
  assert.match(blockedStatus.reason, /monthly invoices exceeds Standard plan limit/);

  const pro = getPlanDefinition("pro");
  const usageDetails = buildPlanUsageDetails(
    { aiCommandsPerMonth: pro.limits.aiCommandsPerMonth - 1 },
    pro.limits,
  );
  assert.equal(usageDetails.aiCommandsPerMonth.label, "AI commands this month");
  assert.equal(usageDetails.aiCommandsPerMonth.remaining, 1);
  assert.equal(usageDetails.aiCommandsPerMonth.exceeded, false);
});

test("new active paid subscription supersedes older paid entitlement without deleting history", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "Upgrade User", email: "upgrade@example.com" });

  const standard = api.createSubscription({
    userId: user.id,
    subscriberType: "individual",
    subscriberName: user.name,
    plan: "standard",
    amount: 3588,
    status: "active",
    gateway: "razorpay",
    gatewayOrderId: "order_standard",
    gatewayPaymentId: "pay_standard",
  });
  const pro = api.createSubscription({
    userId: user.id,
    subscriberType: "individual",
    subscriberName: user.name,
    plan: "pro",
    amount: 8388,
    status: "active",
    gateway: "razorpay",
    gatewayOrderId: "order_pro",
    gatewayPaymentId: "pay_pro",
  });

  const subscriptions = api.listSubscriptionsForUser(user);
  assert.equal(subscriptions.length, 2);
  assert.equal(subscriptions.find((subscription) => subscription.id === standard.id).status, "superseded");
  assert.equal(subscriptions.find((subscription) => subscription.id === pro.id).status, "active");
  assert.equal(api.getFreePlanSummary(user).plan, "pro");
});

test("subscription lifecycle updates cancel renew downgrade without deleting history", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "Lifecycle User", email: "lifecycle@example.com" });

  const standard = api.createSubscription({
    userId: user.id,
    subscriberType: "individual",
    subscriberName: user.name,
    plan: "standard",
    amount: 3588,
    monthlyAmount: 299,
    annualAmount: 3588,
    status: "active",
    gateway: "razorpay",
    gatewayOrderId: "order_lifecycle_standard",
    gatewayPaymentId: "pay_lifecycle_standard",
  });

  const cancelled = api.cancelSubscription(standard.id, { reason: "user requested downgrade" });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(api.getFreePlanSummary(user).plan, "free");

  const renewed = api.renewSubscription(standard.id, {
    amount: 3588,
    monthlyAmount: 299,
    annualAmount: 3588,
    gatewayPaymentId: "pay_lifecycle_renewal",
  });
  assert.equal(renewed.status, "active");
  assert.equal(renewed.renewalCount, 1);
  assert.equal(api.getFreePlanSummary(user).plan, "standard");

  const freeDowngrade = api.createSubscription({
    userId: user.id,
    subscriberType: "individual",
    subscriberName: user.name,
    plan: "free",
    amount: 0,
    monthlyAmount: 0,
    annualAmount: 0,
    status: "active",
    gateway: "manual",
    previousSubscriptionId: renewed.id,
    lifecycleAction: "downgrade",
  });

  const subscriptions = api.listSubscriptionsForUser(user);
  assert.equal(subscriptions.length, 2);
  assert.equal(subscriptions.find((subscription) => subscription.id === renewed.id).status, "superseded");
  assert.equal(subscriptions.find((subscription) => subscription.id === freeDowngrade.id).status, "active");
  assert.equal(freeDowngrade.previousSubscriptionId, renewed.id);
  assert.equal(api.getFreePlanSummary(user).plan, "free");
});

test("expired active subscription does not unlock paid features", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "Expired User", email: "expired@example.com" });
  api.createSubscription({
    userId: user.id,
    subscriberType: "individual",
    subscriberName: user.name,
    plan: "pro",
    amount: 8388,
    status: "active",
    expiresAt: "2025-01-01T00:00:00.000Z",
  });

  const summary = api.getFreePlanSummary(user);
  assert.equal(summary.plan, "free");
  assert.equal(summary.features.aiInvoiceAssist, false);
});

test("admin plan preview unlocks tiers without creating a subscription", async () => {
  const restoreAdminEmail = useTestAdminEmail();
  const server = createServer({ persist: false, useSupabaseEmailOtp: false });
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(path, { method = "GET", token, body, previewPlan } = {}) {
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

  const manyItems = Array.from({ length: 30 }, (_, index) => ({
    description: `Service ${index + 1}`,
    quantity: 1,
    rate: 100,
    gstRate: 18,
  }));

  try {
    const admin = await signup({
      name: "Support Admin",
      email: TEST_ADMIN_EMAIL,
      password: "AdminSecure123",
      phone: "9665444554",
    });
    const user = await signup({
      name: "Preview User",
      email: "preview-user@example.com",
      password: "UserSecure123",
      phone: "9876543210",
    });

    const adminPlans = await request("/plans", { token: admin.token, previewPlan: "pro" });
    assert.equal(adminPlans.response.status, 200);
    assert.equal(adminPlans.payload.active.plan, "pro");
    assert.equal(adminPlans.payload.active.preview.enabled, true);
    assert.equal(adminPlans.payload.active.features.aiPoAssist, true);

    const userPlans = await request("/plans", { token: user.token, previewPlan: "pro" });
    assert.equal(userPlans.response.status, 200);
    assert.equal(userPlans.payload.active.plan, "free");
    assert.equal(userPlans.payload.active.preview.enabled, false);

    const blockedUserInvoice = await request("/invoices", {
      method: "POST",
      token: user.token,
      previewPlan: "pro",
      body: { billToName: "Blocked Customer", items: manyItems },
    });
    assert.equal(blockedUserInvoice.response.status, 400);
    assert.match(blockedUserInvoice.payload.error, /active plan limit/);

    const adminInvoice = await request("/invoices", {
      method: "POST",
      token: admin.token,
      previewPlan: "pro",
      body: { billToName: "Admin Preview Customer", items: manyItems },
    });
    assert.equal(adminInvoice.response.status, 201);
    assert.equal(adminInvoice.payload.items.length, 30);

    const subscriptions = await request("/subscriptions/me", { token: admin.token });
    assert.equal(subscriptions.response.status, 200);
    assert.equal(subscriptions.payload.length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreAdminEmail();
  }
});

test("paid tier catalog keeps promised feature gates explicit", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const plans = Object.fromEntries(api.listPlans().map((plan) => [plan.plan, plan]));

  assert.equal(plans.free.amount, 0);
  assert.equal(plans.free.features.whatsappShare, false);
  assert.equal(plans.free.features.aiInvoiceAssist, false);
  assert.equal(plans.free.features.razorpayCollections, false);
  assert.equal(plans.free.billingCycle, "yearly");
  assert.equal(plans.free.implementation.status, "active");

  assert.equal(plans.standard.billingCycle, "yearly");
  assert.equal(plans.standard.monthlyAmount, 499);
  assert.equal(plans.standard.discountedAmount, 299);
  assert.equal(plans.standard.annualAmount, 5988);
  assert.equal(plans.standard.discountedAnnualAmount, 3588);
  assert.equal(plans.standard.features.whatsappShare, true);
  assert.equal(plans.standard.features.razorpayCollections, true);
  assert.equal(plans.standard.features.aiInvoiceAssist, false);
  assert.equal(plans.standard.implementation.ready.includes("Recurring invoice metadata"), true);
  assert.equal(plans.standard.implementation.ready.includes("Branding removal controls"), true);
  assert.equal(plans.standard.implementation.ready.includes("Automatic recurring scheduler"), true);
  assert.equal(plans.standard.implementation.pending.length, 0);

  assert.equal(plans.pro.features.aiInvoiceAssist, true);
  assert.equal(plans.pro.features.aiPoAssist, true);
  assert.equal(plans.pro.features.advancedReports, true);
  assert.equal(plans.pro.features.multiBusiness, true);
  assert.equal(plans.pro.billingCycle, "yearly");
  assert.equal(plans.pro.discountedAnnualAmount, 8388);
  assert.equal(plans.pro.implementation.status, "active");
  assert.equal(plans.pro.implementation.pending.length, 0);

  assert.equal(plans.business.features.teamAccess, true);
  assert.equal(plans.business.features.apiAccess, true);
  assert.equal(plans.business.features.approvals, true);
  assert.equal(plans.business.implementation.status, "active");
  assert.equal(plans.business.implementation.ready.includes("Customer API key portal"), true);
  assert.equal(plans.business.implementation.ready.includes("Business Razorpay gateway settings"), true);
  assert.equal(plans.business.implementation.pending.length, 0);
});

test("paid tier inheritance flows upward only", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const plans = Object.fromEntries(api.listPlans().map((plan) => [plan.plan, plan]));
  const freeFeatures = ["basicInvoices", "gstInvoices", "pdfPrint", "manualPayments", "emailOtp", "wordpressFree"];
  const standardFeatures = ["whatsappShare", "razorpayCollections", "recurringInvoices", "wordpressPaid"];
  const proFeatures = ["aiInvoiceAssist", "aiPoAssist", "advancedReports", "multiBusiness"];
  const businessFeatures = ["teamAccess", "apiAccess", "approvals"];

  freeFeatures.forEach((feature) => {
    assert.equal(plans.free.features[feature], true);
    assert.equal(plans.standard.features[feature], true);
    assert.equal(plans.pro.features[feature], true);
    assert.equal(plans.business.features[feature], true);
  });

  standardFeatures.forEach((feature) => {
    assert.equal(plans.free.features[feature], false);
    assert.equal(plans.standard.features[feature], true);
    assert.equal(plans.pro.features[feature], true);
    assert.equal(plans.business.features[feature], true);
  });

  proFeatures.forEach((feature) => {
    assert.equal(plans.free.features[feature], false);
    assert.equal(plans.standard.features[feature], false);
    assert.equal(plans.pro.features[feature], true);
    assert.equal(plans.business.features[feature], true);
  });

  businessFeatures.forEach((feature) => {
    assert.equal(plans.free.features[feature], false);
    assert.equal(plans.standard.features[feature], false);
    assert.equal(plans.pro.features[feature], false);
    assert.equal(plans.business.features[feature], true);
  });
});

test("paid feature requirements give the correct upgrade tier", () => {
  assert.equal(getFeatureRequirement("whatsappShare").minimumPlan, "standard");
  assert.match(getFeatureRequirement("whatsappShare").message, /Standard, Pro, and Business/);
  assert.equal(getFeatureRequirement("razorpayCollections").minimumPlan, "standard");
  assert.match(getFeatureRequirement("recurringInvoices").message, /Standard, Pro, and Business/);

  assert.equal(getFeatureRequirement("aiInvoiceAssist").minimumPlan, "pro");
  assert.match(getFeatureRequirement("aiPoAssist").message, /Pro and Business/);
  assert.match(getFeatureRequirement("advancedReports").message, /Pro and Business/);

  assert.equal(getFeatureRequirement("teamAccess").minimumPlan, "business");
  assert.match(getFeatureRequirement("apiAccess").message, /Business plan/);
  assert.match(getFeatureRequirement("approvals").message, /Business plan/);
});

test("paid tier runtime gates stop at the correct tier boundary", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const standardUser = api.createUser({ name: "Standard User", email: "standard-boundary@example.com" });
  api.createSubscription({
    userId: standardUser.id,
    subscriberName: standardUser.name,
    plan: "standard",
    amount: 3588,
    billingCycle: "yearly",
    status: "active",
  });

  assert.throws(
    () => api.runAiCommand(standardUser, { command: "Create invoice for Rahul INR 1000 plus GST" }),
    /AI invoice assistant is available on Pro and Business plans/,
  );

  const proUser = api.createUser({ name: "Pro User", email: "pro-boundary@example.com" });
  api.createSubscription({
    userId: proUser.id,
    subscriberName: proUser.name,
    plan: "pro",
    amount: 8388,
    billingCycle: "yearly",
    status: "active",
  });

  assert.throws(
    () => api.createApiKey(proUser, { label: "WordPress site" }),
    /API access is available on the Business plan/,
  );
});

test("standard tier recurring scheduler creates due invoice drafts once", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "Recurring User", email: "recurring@example.com" });

  assert.throws(
    () => api.runRecurringInvoiceScheduler(user, { targetDate: "2026-06-20" }),
    /Standard and higher/
  );

  api.createSubscription({
    userId: user.id,
    subscriberName: user.name,
    plan: "standard",
    amount: 499,
    status: "active",
  });

  const source = api.createInvoice({
    ownerUserId: user.id,
    billToName: "Monthly Client",
    invoiceDate: "2026-05-15",
    dueDate: "2026-05-22",
    status: "created",
    taxRate: 18,
    items: [{ description: "Retainer", quantity: 1, rate: 1000, gstRate: 18 }],
    recurringEnabled: true,
    recurringFrequency: "monthly",
    recurringNextDate: "2026-06-15",
  });

  const firstRun = api.runRecurringInvoiceScheduler(user, { targetDate: "2026-06-20" });
  assert.equal(firstRun.created.length, 1);
  assert.equal(firstRun.created[0].status, "draft");
  assert.equal(firstRun.created[0].paymentStatus, "draft");
  assert.equal(firstRun.created[0].recurringSourceInvoiceId, source.id);
  assert.equal(firstRun.created[0].recurringGeneratedForDate, "2026-06-15");
  assert.equal(firstRun.created[0].recurringEnabled, false);
  assert.equal(firstRun.created[0].dueDate, "2026-06-22");

  const secondRun = api.runRecurringInvoiceScheduler(user, { targetDate: "2026-06-20" });
  assert.equal(secondRun.created.length, 0);

  const invoices = api.listInvoices(user);
  assert.equal(invoices.filter((invoice) => invoice.recurringSourceInvoiceId === source.id).length, 1);
  const updatedSource = invoices.find((invoice) => invoice.id === source.id);
  assert.equal(updatedSource.recurringNextDate, "2026-07-15");
});

test("admin recurring scheduler endpoint processes paid users only", async () => {
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
      name: "Support Admin",
      email: TEST_ADMIN_EMAIL,
      password: "AdminSecure123",
      phone: "9665444554",
    });
    const paid = await signup({
      name: "Paid Recurring",
      email: "paid-recurring@example.com",
      password: "PaidSecure123",
      phone: "9123456780",
    });
    const free = await signup({
      name: "Free Recurring",
      email: "free-recurring@example.com",
      password: "FreeSecure123",
      phone: "9123456781",
    });

    server.eazinvoiceApi.createSubscription({
      userId: paid.user.id,
      subscriberName: paid.user.name,
      plan: "standard",
      amount: 499,
      status: "active",
      subscriberType: "individual",
    });

    const paidInvoice = await request("/invoices", {
      method: "POST",
      token: paid.token,
      body: {
        status: "created",
        billToName: "Paid Customer",
        invoiceDate: "2026-06-01",
        dueDate: "2026-06-08",
        recurringEnabled: true,
        recurringFrequency: "weekly",
        recurringNextDate: "2026-06-15",
        items: [{ description: "Weekly Work", quantity: 1, rate: 1000, gstRate: 18 }],
      },
    });
    assert.equal(paidInvoice.response.status, 201);

    const freeInvoice = await request("/invoices", {
      method: "POST",
      token: free.token,
      body: {
        status: "created",
        billToName: "Free Customer",
        invoiceDate: "2026-06-01",
        dueDate: "2026-06-08",
        recurringEnabled: true,
        recurringFrequency: "weekly",
        recurringNextDate: "2026-06-15",
        items: [{ description: "Free Work", quantity: 1, rate: 1000, gstRate: 18 }],
      },
    });
    assert.equal(freeInvoice.response.status, 201);
    assert.equal(freeInvoice.payload.recurringEnabled, false);

    const status = await request("/admin/recurring/status", { token: admin.token });
    assert.equal(status.response.status, 200);
    assert.equal(status.payload.note.includes("idempotent"), true);

    const run = await request("/admin/recurring/run", {
      method: "POST",
      token: admin.token,
      body: { targetDate: "2026-06-20" },
    });
    assert.equal(run.response.status, 201);
    assert.equal(run.payload.createdCount, 1);
    assert.equal(run.payload.usersProcessed, 1);

    const paidInvoices = await request("/invoices", { token: paid.token });
    assert.equal(paidInvoices.payload.filter((invoice) => invoice.recurringSourceInvoiceId === paidInvoice.payload.id).length, 1);
    const freeInvoices = await request("/invoices", { token: free.token });
    assert.equal(freeInvoices.payload.filter((invoice) => invoice.recurringSourceInvoiceId === freeInvoice.payload.id).length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreAdminEmail();
  }
});

test("Pro AI command assistant drafts invoices, PO/WO, and report summaries", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "AI User", email: "ai@example.com" });
  api.createSubscription({
    userId: user.id,
    subscriberName: user.name,
    subscriberType: "individual",
    plan: "pro",
    amount: 999,
    status: "active",
  });
  const company = api.createCompany({ name: "AI Services", ownerUserId: user.id, state: "Maharashtra" });
  const customer = api.createCustomer({ name: "Rahul Sharma", ownerUserId: user.id, billingAddress: "Pune" });

  const previewResult = api.runAiCommand(user, {
    command: "Create invoice for Rahul Sharma for website design INR 15000 plus 18% GST due in 7 days",
    previewOnly: true,
  });
  assert.equal(previewResult.intent, "invoice");
  assert.equal(previewResult.createdRecord, undefined);
  assert.equal(previewResult.proposedRecord.total, 17700);
  assert.equal(previewResult.quota.used, 1);
  assert.equal(previewResult.quota.remaining, 299);
  assert.equal(api.listInvoices(user).length, 0);

  const invoiceResult = api.runAiCommand(user, {
    command: "Create invoice for Rahul Sharma for website design INR 15000 plus 18% GST due in 7 days",
  });
  assert.equal(invoiceResult.intent, "invoice");
  assert.equal(invoiceResult.createdRecord.status, "draft");
  assert.equal(invoiceResult.createdRecord.companyId, company.id);
  assert.equal(invoiceResult.createdRecord.customerId, customer.id);
  assert.equal(invoiceResult.createdRecord.billToName, "Rahul Sharma");
  assert.equal(invoiceResult.createdRecord.currency, "INR");
  assert.equal(invoiceResult.createdRecord.taxRate, 18);
  assert.equal(invoiceResult.createdRecord.total, 17700);

  const missingCustomerPreview = api.runAiCommand(user, {
    command: "Create an invoice for Rachel Antony, amount 40000 plus 18% gst with her account details, Pan Card and address.",
    previewOnly: true,
  });
  assert.equal(missingCustomerPreview.intent, "invoice");
  assert.equal(missingCustomerPreview.customerMatch.status, "missing");
  assert.equal(missingCustomerPreview.customerMatch.name, "Rachel Antony");
  assert.equal(missingCustomerPreview.proposedRecord.customerId, null);
  assert.equal(missingCustomerPreview.proposedRecord.billToName, "Rachel Antony");
  assert.equal(missingCustomerPreview.proposedRecord.total, 47200);
  assert.match(missingCustomerPreview.warnings[0], /not saved in your customer list/i);

  const poResult = api.runAiCommand(user, {
    command: "Generate work order for Dell laptops quantity 5 INR 50000 plus 18% GST",
  });
  assert.equal(poResult.intent, "purchase_order");
  assert.equal(poResult.createdRecord.status, "draft");
  assert.equal(poResult.createdRecord.documentType, "wo");
  assert.equal(poResult.createdRecord.currency, "INR");
  assert.equal(poResult.createdRecord.items[0].quantity, 5);

  const report = api.runAiCommand(user, { command: "Show profit and loss report summary" });
  assert.equal(report.intent, "report");
  assert.equal(report.metrics.totalInvoices, 0);
  assert.equal(report.metrics.totalPurchaseOrders, 0);
  assert.equal(report.quota.used, 5);
  assert.equal(report.quota.remaining, 295);
  const aiUsage = api.exportDataSnapshot().aiUsageLogs;
  assert.equal(aiUsage.length, 5);
  assert.equal(aiUsage.every((entry) => entry.ownerUserId === user.id), true);
});

test("Pro AI assistant can refine commands with OpenAI JSON and save the approved proposal", async () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "LLM User", email: "llm@example.com" });
  api.createSubscription({
    userId: user.id,
    subscriberName: user.name,
    subscriberType: "individual",
    plan: "pro",
    amount: 999,
    status: "active",
  });
  api.createCompany({ name: "LLM Services", ownerUserId: user.id, state: "Maharashtra" });
  api.createCustomer({ name: "Priya Nair", ownerUserId: user.id, billingAddress: "Mumbai" });

  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({
      output_text: JSON.stringify({
        intent: "invoice",
        customerName: "Priya Nair",
        description: "brand consulting",
        amount: 24000,
        quantity: 1,
        currency: "INR",
        taxRate: 18,
        dueDays: 14,
      }),
    }),
  });

  const preview = await api.runAiCommandAsync(user, {
    command: "Please prepare the consulting bill for Priya with taxes, due after two weeks",
    previewOnly: true,
  }, {
    fetchImpl: fakeFetch,
    openAiApiKey: "test-key",
  });

  assert.equal(preview.provider, "openai");
  assert.equal(preview.intent, "invoice");
  assert.equal(preview.proposedRecord.billToName, "Priya Nair");
  assert.equal(preview.proposedRecord.total, 28320);
  assert.equal(preview.quota.used, 1);
  assert.equal(api.listInvoices(user).length, 0);

  const saved = api.runAiCommand(user, {
    command: "approved preview",
    approvedDraft: {
      intent: preview.intent,
      confidence: preview.confidence,
      payload: preview.payload,
    },
  });
  assert.equal(saved.createdRecord.billToName, "Priya Nair");
  assert.equal(saved.createdRecord.total, 28320);
  assert.equal(saved.quota.used, 2);
  assert.equal(api.exportDataSnapshot().aiUsageLogs.filter((entry) => entry.billable).length, 2);
});

test("AI assistant asks for missing details instead of creating unsafe drafts", async () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "Clarify User", email: "clarify@example.com" });
  api.createSubscription({
    userId: user.id,
    subscriberName: user.name,
    subscriberType: "individual",
    plan: "pro",
    amount: 999,
    status: "active",
  });

  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({
      output_text: JSON.stringify({
        intent: "clarification",
        missingFields: ["customer", "amount"],
        question: "Which customer and amount should I use?",
      }),
    }),
  });

  const result = await api.runAiCommandAsync(user, {
    command: "Create that invoice",
    previewOnly: true,
  }, {
    fetchImpl: fakeFetch,
    openAiApiKey: "test-key",
  });

  assert.equal(result.intent, "clarification");
  assert.deepEqual(result.missingFields, ["customer", "amount"]);
  assert.equal(result.quota.used, 1);
  assert.equal(api.listInvoices(user).length, 0);
});

test("Pro AI monthly quota blocks after the active limit is used", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "Quota User", email: "quota-ai@example.com" });
  api.createSubscription({
    userId: user.id,
    subscriberName: user.name,
    subscriberType: "individual",
    plan: "pro",
    amount: 999,
    status: "active",
  });

  const options = { planLimits: { aiCommandsPerMonth: 1 } };
  const first = api.runAiCommand(user, {
    command: "Create invoice for Rahul Sharma INR 1000 plus 18% GST",
    previewOnly: true,
  }, options);
  assert.equal(first.quota.used, 1);
  assert.equal(first.quota.remaining, 0);

  assert.throws(
    () => api.runAiCommand(user, {
      command: "Create invoice for Rahul Sharma INR 2000 plus 18% GST",
      previewOnly: true,
    }, options),
    /AI command monthly limit reached/,
  );
});

test("AI usage summary exposes monthly quota, history, and reset information", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "Usage User", email: "usage-ai@example.com" });
  api.createSubscription({
    userId: user.id,
    subscriberName: user.name,
    subscriberType: "individual",
    plan: "pro",
    amount: 999,
    status: "active",
  });

  api.runAiCommand(user, {
    command: "Create invoice for Usage Client INR 2000 plus 18% GST",
    previewOnly: true,
  });
  api.runAiCommand(user, { command: "Show revenue report summary" });

  const summary = api.getAiUsageSummary(user);
  assert.equal(summary.quota.plan, "pro");
  assert.equal(summary.quota.used, 2);
  assert.equal(summary.summary.billable, 2);
  assert.equal(summary.history.length, 2);
  assert.match(summary.reset.nextResetAt, /^\d{4}-\d{2}-01$/);
  assert.equal(summary.history.every((entry) => entry.ownerUserId === user.id), true);
});

test("Admin AI usage summary aggregates users and rejects normal users", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const admin = api.createUser({ name: "Admin", email: "support@eazinvoice.com", role: "admin" });
  const user = api.createUser({ name: "Normal AI", email: "normal-ai@example.com" });
  api.createSubscription({
    userId: user.id,
    subscriberName: user.name,
    subscriberType: "individual",
    plan: "pro",
    amount: 999,
    status: "active",
  });

  api.runAiCommand(user, {
    command: "Create invoice for Normal Client INR 3000 plus 18% GST",
    previewOnly: true,
  });

  const adminSummary = api.getAdminAiUsageSummary(admin);
  assert.equal(adminSummary.summary.billable, 1);
  assert.equal(adminSummary.users.length, 1);
  assert.equal(adminSummary.users[0].email, "normal-ai@example.com");
  assert.throws(() => api.getAdminAiUsageSummary(user), /Forbidden/);
});

test("Business AI quota is treated as unlimited", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "Business AI", email: "business-ai@example.com" });
  api.createSubscription({
    userId: user.id,
    subscriberName: user.name,
    subscriberType: "company",
    plan: "business",
    amount: 1999,
    status: "active",
  });

  const first = api.runAiCommand(user, { command: "Show report summary" });
  const second = api.runAiCommand(user, {
    command: "Create invoice for Client INR 2000 plus 18% GST",
    previewOnly: true,
  });
  const third = api.runAiCommand(user, {
    command: "Generate PO for laptops quantity 2 INR 50000 plus 18% GST",
    previewOnly: true,
  });

  assert.equal(first.quota.unlimited, true);
  assert.equal(second.quota.unlimited, true);
  assert.equal(third.quota.unlimited, true);
  assert.equal(third.quota.remaining, null);
  assert.equal(third.quota.used, 3);
});

test("Approved AI invoice drafts still obey invoice item limits", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "AI Limit User", email: "ai-limit@example.com" });
  api.createSubscription({
    userId: user.id,
    subscriberName: user.name,
    subscriberType: "individual",
    plan: "pro",
    amount: 999,
    status: "active",
  });

  assert.throws(
    () => api.runAiCommand(user, {
      command: "approved draft with too many items",
      approvedDraft: {
        intent: "invoice",
        payload: {
          billToName: "Limit Customer",
          currency: "INR",
          items: [
            { description: "Service One", quantity: 1, rate: 1000, gstRate: 18 },
            { description: "Service Two", quantity: 1, rate: 2000, gstRate: 18 },
          ],
        },
      },
    }, { planLimits: { aiCommandsPerMonth: 5, invoiceItemsPerInvoice: 1 } }),
    /invoice items exceed active plan limit/,
  );
  assert.equal(api.listInvoices(user).length, 0);
  assert.equal(api.exportDataSnapshot().aiUsageLogs.length, 0);
});

test("AI usage logs and approved drafts are included in persisted state snapshots", () => {
  const savedStates = [];
  const api = createApi({
    store: createStore({}, {
      persistenceAdapter: {
        load() {
          return {};
        },
        save(state) {
          savedStates.push(state);
        },
      },
    }),
  });
  const user = api.createUser({ name: "Persisted AI", email: "persisted-ai@example.com" });
  api.createSubscription({
    userId: user.id,
    subscriberName: user.name,
    subscriberType: "individual",
    plan: "pro",
    amount: 999,
    status: "active",
  });

  const preview = api.runAiCommand(user, {
    command: "Create invoice for Persisted Customer INR 1000 plus 18% GST",
    previewOnly: true,
  });
  const saved = api.runAiCommand(user, {
    command: "approved persisted preview",
    approvedDraft: {
      intent: preview.intent,
      payload: preview.payload,
    },
  });

  const latest = savedStates.at(-1);
  assert.ok(latest);
  assert.equal(latest.aiUsageLogs.filter((entry) => entry.ownerUserId === user.id && entry.billable).length, 2);
  assert.equal(latest.invoices.some((invoice) => invoice.id === saved.createdRecord.id && invoice.status === "draft"), true);
});

test("AI command endpoint is gated and unlocks for Pro subscriptions", async () => {
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
      body: { mode: "signup", email: "ai-preview@example.com", phone: "9000011112" },
    });
    const signup = await request("/auth/signup", {
      method: "POST",
      body: {
        name: "AI Preview",
        email: "ai-preview@example.com",
        password: "Secure123",
        phone: "9000011112",
        otp: otp.payload.devOtp,
      },
    });
    assert.equal(signup.response.status, 201);

    const blocked = await request("/ai/command", {
      method: "POST",
      token: signup.payload.token,
      body: { command: "Create invoice for Rahul INR 1000 plus 18% GST" },
    });
    assert.equal(blocked.response.status, 402);
    assert.match(blocked.payload.error, /Pro and Business/);

    server.eazinvoiceApi.createSubscription({
      userId: signup.payload.user.id,
      subscriberName: signup.payload.user.name,
      subscriberType: "individual",
      plan: "pro",
      amount: 999,
      status: "active",
    });

    const preview = await request("/ai/command", {
      method: "POST",
      token: signup.payload.token,
      body: { command: "Create invoice for Rahul INR 1000 plus 18% GST" },
    });
    assert.equal(preview.response.status, 201);
    assert.equal(preview.payload.intent, "invoice");
    assert.equal(preview.payload.createdRecord.status, "draft");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("admin can inspect persistence status without exposing data", async () => {
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

  try {
    const otp = await request("/auth/email-otp/request", {
      method: "POST",
      body: { mode: "signup", email: TEST_ADMIN_EMAIL, phone: "9665444554" },
    });
    const signup = await request("/auth/signup", {
      method: "POST",
      body: {
        name: "Support Admin",
        email: TEST_ADMIN_EMAIL,
        password: "AdminSecure123",
        phone: "9665444554",
        otp: otp.payload.devOtp,
      },
    });
    const status = await request("/admin/persistence", { token: signup.payload.token });
    assert.equal(status.response.status, 200);
    assert.equal(status.payload.persistence.mode, "local-json");
    assert.equal(status.payload.records.users, 1);
    assert.match(status.payload.warning, /persistent storage/);
    assert.equal(status.payload.users, undefined);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreAdminEmail();
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

test("business tier unlocks team approvals and API keys", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "Business Owner", email: "business@example.com" });

  assert.throws(
    () => api.createTeamMember(user, { email: "accountant@example.com", role: "accountant" }),
    /Team access is available on the Business plan/,
  );

  api.createSubscription({
    userId: user.id,
    subscriberName: user.name,
    subscriberType: "company",
    plan: "business",
    amount: 17988,
    billingCycle: "yearly",
    status: "active",
  });

  const member = api.createTeamMember(user, {
    name: "Accountant",
    email: "accountant@example.com",
    role: "accountant",
  });
  assert.equal(member.status, "invited");
  assert.equal(api.listTeamMembers(user).length, 1);

  const request = api.createApprovalRequest(user, {
    documentType: "invoice",
    documentNumber: "RA/2026/0001",
    notes: "Please review before sending",
  });
  assert.equal(request.status, "pending");
  const approved = api.decideApprovalRequest(user, request.id, { status: "approved", decisionNotes: "Approved" });
  assert.equal(approved.status, "approved");

  const apiKey = api.createApiKey(user, { label: "WordPress site" });
  assert.match(apiKey.token, /^eaz_live_/);
  const listedKeys = api.listApiKeys(user);
  assert.equal(listedKeys[0].token, "");
  assert.equal(listedKeys[0].tokenPreview, apiKey.tokenPreview);
  const revoked = api.revokeApiKey(user, apiKey.id);
  assert.equal(revoked.status, "revoked");

  const settings = api.updateBusinessSettings(user, {
    emailSettings: {
      smtpHost: "smtp.example.com",
      smtpPort: "465",
      smtpUser: "accounts@example.com",
      smtpPass: "secret-password",
      fromEmail: "accounts@example.com",
    },
    paymentSettings: {
      keyId: "rzp_live_business",
      keySecret: "razorpay-secret",
      webhookSecret: "webhook-secret",
      paymentLinkEnabled: true,
    },
    complianceProfile: {
      legalName: "Business Owner LLP",
      gstRegistered: true,
      gstin: "27ABCDE1234F1Z5",
      pan: "ABCDE1234F",
    },
  });
  assert.equal(settings.emailSettings.smtpPass, "");
  assert.equal(settings.emailSettings.smtpPassConfigured, true);
  assert.equal(settings.paymentSettings.keySecret, "");
  assert.equal(settings.paymentSettings.keySecretConfigured, true);
  assert.equal(settings.paymentSettings.webhookSecretConfigured, true);
  assert.equal(settings.paymentSettings.status, "live_ready");
  assert.equal(settings.complianceProfile.gstin, "27ABCDE1234F1Z5");

  const invitee = api.createUser({ name: "Accountant", email: "accountant@example.com" });
  const accepted = api.acceptTeamInvite(invitee, member.inviteToken);
  assert.equal(accepted.status, "active");
  assert.equal(accepted.acceptedUserId, invitee.id);
});

test("business workspace endpoints honor plan preview and gating", async () => {
  const restoreAdminEmail = useTestAdminEmail();
  const server = createServer({ persist: false, useSupabaseEmailOtp: false });
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(path, { method = "GET", token, body, previewPlan } = {}) {
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

  try {
    const otp = await request("/auth/email-otp/request", {
      method: "POST",
      body: { mode: "signup", email: TEST_ADMIN_EMAIL, phone: "9665444554" },
    });
    const signup = await request("/auth/signup", {
      method: "POST",
      body: {
        name: "Support Admin",
        email: TEST_ADMIN_EMAIL,
        password: "AdminSecure123",
        phone: "9665444554",
        otp: otp.payload.devOtp,
      },
    });
    assert.equal(signup.response.status, 201);

    const blocked = await request("/business/api-keys", { token: signup.payload.token });
    assert.equal(blocked.response.status, 402);

    const created = await request("/business/api-keys", {
      method: "POST",
      token: signup.payload.token,
      previewPlan: "business",
      body: { label: "Local WordPress" },
    });
    assert.equal(created.response.status, 201);
    assert.match(created.payload.token, /^eaz_live_/);

    const listed = await request("/business/api-keys", {
      token: signup.payload.token,
      previewPlan: "business",
    });
    assert.equal(listed.response.status, 200);
    assert.equal(listed.payload[0].token, "");

    const settings = await request("/business/settings", {
      method: "PATCH",
      token: signup.payload.token,
      previewPlan: "business",
      body: {
        emailSettings: {
          smtpHost: "smtp.namecheap.com",
          smtpPort: "465",
          smtpUser: "info@eazinvoice.com",
          smtpPass: "app-password",
          fromEmail: "info@eazinvoice.com",
        },
        paymentSettings: {
          keyId: "rzp_test_admin",
          keySecret: "secret",
          webhookSecret: "webhook",
          paymentLinkEnabled: true,
        },
      },
    });
    assert.equal(settings.response.status, 200);
    assert.equal(settings.payload.emailSettings.smtpPass, "");
    assert.equal(settings.payload.emailSettings.smtpPassConfigured, true);
    assert.equal(settings.payload.paymentSettings.keySecret, "");
    assert.equal(settings.payload.paymentSettings.status, "test_mode");

    const validated = await request("/business/settings/email/test", {
      method: "POST",
      token: signup.payload.token,
      previewPlan: "business",
      body: {
        emailSettings: {
          smtpHost: "smtp.namecheap.com",
          smtpPort: "465",
          smtpUser: "info@eazinvoice.com",
          fromEmail: "info@eazinvoice.com",
          smtpSecure: true,
        },
      },
    });
    assert.equal(validated.response.status, 200);
    assert.equal(validated.payload.emailSettings.lastTestStatus, "ready");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreAdminEmail();
  }
});

test("wordpress connection validates active api keys and blocks mismatched accounts", async () => {
  const store = createStore({}, { persist: false, useSupabaseEmailOtp: false });
  const api = createApi({ store });
  const user = api.createUser({ name: "Plugin Owner", email: "plugin-owner@example.com" });
  api.createSubscription({
    userId: user.id,
    subscriberName: user.name,
    subscriberType: "company",
    plan: "business",
    amount: 23988,
    billingCycle: "yearly",
    status: "active",
  });
  const key = api.createApiKey(user, { label: "WordPress production site" });
  const server = createServer({ store, persist: false, useSupabaseEmailOtp: false });
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const connected = await fetch(`${baseUrl}/wordpress/connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountEmail: "plugin-owner@example.com",
        apiKey: key.token,
        siteUrl: "https://client.example",
      }),
    });
    const connectedPayload = await connected.json();
    assert.equal(connected.status, 200);
    assert.equal(connectedPayload.ok, true);
    assert.equal(connectedPayload.plan.id, "business");
    assert.equal(connectedPayload.wordpress.gatewayReady, true);
    assert.equal(connectedPayload.apiKey.tokenPreview, key.tokenPreview);
    assert.equal(connectedPayload.apiKey.token, undefined);

    const mismatch = await fetch(`${baseUrl}/wordpress/connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountEmail: "other@example.com",
        apiKey: key.token,
      }),
    });
    const mismatchPayload = await mismatch.json();
    assert.equal(mismatch.status, 401);
    assert.match(mismatchPayload.error, /does not belong/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("static server exposes only the browser api client from api source", async () => {
  const server = createServer({ persist: false, useSupabaseEmailOtp: false });
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const client = await fetch(`${baseUrl}/apps/api/src/client.js`);
    assert.equal(client.status, 200);
    assert.equal(client.headers.get("x-content-type-options"), "nosniff");

    const source = await fetch(`${baseUrl}/apps/api/src/server.js`);
    assert.equal(source.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
