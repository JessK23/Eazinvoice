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

test("accounting summary is safe when Postgres is not configured", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
    const user = api.createUser({ name: "Accounting User", email: "accounting@example.com" });
    const summary = await api.getAccountingSummary(user);
    assert.equal(summary.enabled, false);
    assert.match(summary.reason, /DATABASE_URL/i);
    const accounts = await api.getLedgerAccounts(user);
    assert.equal(accounts.enabled, false);
    const journals = await api.getJournalEntries(user);
    assert.equal(journals.enabled, false);
    const bankBook = await api.getBookEntries(user, { book: "bank" });
    assert.equal(bankBook.enabled, false);
    const gstSummary = await api.getGstComplianceSummary(user);
    assert.equal(gstSummary.enabled, false);
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  }
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

test("purchase/work order payments update payable status", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "Vendor Pay User", email: "vendor-pay@example.com" });
  api.createSubscription({
    userId: user.id,
    subscriberName: user.name,
    subscriberType: "individual",
    plan: "business",
    amount: 11988,
    billingCycle: "yearly",
    status: "active",
  });
  const vendor = api.createVendor({
    ownerUserId: user.id,
    name: "Supply Partner",
    email: "vendor@example.com",
  });
  const purchaseOrder = api.createPurchaseOrder({
    ownerUserId: user.id,
    vendorId: vendor.id,
    customerId: vendor.id,
    billToName: vendor.name,
    status: "created",
    taxRate: 18,
    items: [{ description: "Materials", quantity: 1, rate: 1000, gstRate: 18 }],
  });

  assert.equal(purchaseOrder.vendorId, vendor.id);
  assert.equal(purchaseOrder.paymentStatus, "unpaid");
  assert.equal(purchaseOrder.balanceAmount, 1180);
  assert.equal(api.getBusinessComplianceDashboard(user).financials.payables, 1180);

  const partial = api.recordPurchaseOrderPayment(purchaseOrder.id, {
    amount: 500,
    mode: "Bank Transfer",
    reference: "PO-PAY-1",
  });
  assert.equal(partial.purchaseOrder.paymentStatus, "part_paid");
  assert.equal(partial.purchaseOrder.paidAmount, 500);
  assert.equal(partial.purchaseOrder.balanceAmount, 680);
  assert.equal(api.getBusinessComplianceDashboard(user).financials.payables, 680);

  const paid = api.recordPurchaseOrderPayment(purchaseOrder.id, {
    amount: 680,
    mode: "UPI",
    reference: "PO-PAY-2",
  });
  assert.equal(paid.purchaseOrder.paymentStatus, "paid");
  assert.equal(paid.purchaseOrder.balanceAmount, 0);
  assert.equal(api.listPayments(user).filter((payment) => payment.purchaseOrderId === purchaseOrder.id).length, 2);
  assert.equal(api.getBusinessComplianceDashboard(user).financials.payables, 0);
});

test("draft and deleted purchase/work orders cannot receive payments", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "Guarded PO User", email: "guarded-po@example.com" });
  const draft = api.createPurchaseOrder({
    ownerUserId: user.id,
    status: "draft",
    taxRate: 0,
    items: [{ description: "Draft purchase", quantity: 1, rate: 1000 }],
  });

  assert.throws(
    () => api.recordPurchaseOrderPayment(draft.id, { amount: 100 }),
    /Create this PO\/WO before recording payment/,
  );

  const purchaseOrder = api.createPurchaseOrder({
    ownerUserId: user.id,
    status: "created",
    taxRate: 0,
    items: [{ description: "Created purchase", quantity: 1, rate: 500 }],
  });
  const deleted = api.deletePurchaseOrder(purchaseOrder.id, user);
  assert.equal(deleted.status, "deleted");
  assert.equal(deleted.paymentStatus, "deleted");
  assert.throws(
    () => api.recordPurchaseOrderPayment(purchaseOrder.id, { amount: 100 }),
    /Deleted PO\/WO records cannot receive payment updates/,
  );
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
    amount: 2388,
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

test("auth OTP falls back to app SMTP when Supabase email delivery fails", async () => {
  const previousEnv = {
    EMAIL_SMTP_HOST: process.env.EMAIL_SMTP_HOST,
    EMAIL_SMTP_PORT: process.env.EMAIL_SMTP_PORT,
    EMAIL_SMTP_USER: process.env.EMAIL_SMTP_USER,
    EMAIL_SMTP_PASS: process.env.EMAIL_SMTP_PASS,
    EMAIL_SMTP_FROM: process.env.EMAIL_SMTP_FROM,
    EMAIL_SMTP_FROM_NAME: process.env.EMAIL_SMTP_FROM_NAME,
    EMAIL_SMTP_SECURE: process.env.EMAIL_SMTP_SECURE,
  };
  process.env.EMAIL_SMTP_HOST = "smtp.example.com";
  process.env.EMAIL_SMTP_PORT = "465";
  process.env.EMAIL_SMTP_USER = "info@example.com";
  process.env.EMAIL_SMTP_PASS = "app-password";
  process.env.EMAIL_SMTP_FROM = "info@example.com";
  process.env.EMAIL_SMTP_FROM_NAME = "EazInvoice";
  process.env.EMAIL_SMTP_SECURE = "true";

  const sentMessages = [];
  const server = createServer({
    persist: false,
    useSupabaseEmailOtp: true,
    supabaseEmailOtpRequester: async () => {
      throw new Error("Error sending magic link email");
    },
    supabaseEmailOtpVerifier: async () => {
      throw new Error("Token has expired or is invalid");
    },
    authEmailOtpSender: async (settings, message) => {
      sentMessages.push({ settings, message });
      return { ok: true };
    },
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const otpResponse = await fetch(`${baseUrl}/auth/email-otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "signup",
        email: "smtp-fallback@example.com",
      }),
    });
    const otp = await otpResponse.json();
    assert.equal(otpResponse.status, 200);
    assert.equal(otp.provider, "app-smtp");
    assert.match(otp.devOtp, /^\d{6}$/);
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].message.to, "smtp-fallback@example.com");
    assert.match(sentMessages[0].message.text, new RegExp(otp.devOtp));

    const signupResponse = await fetch(`${baseUrl}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "SMTP Fallback",
        email: "smtp-fallback@example.com",
        password: "Secure123",
        phone: "9876543210",
        otp: otp.devOtp,
      }),
    });
    const signup = await signupResponse.json();
    assert.equal(signupResponse.status, 201);
    assert.equal(signup.user.emailVerified, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("auth OTP reports safe diagnostics when Supabase and SMTP fallback fail", async () => {
  const previousEnv = {
    EMAIL_SMTP_HOST: process.env.EMAIL_SMTP_HOST,
    EMAIL_SMTP_PORT: process.env.EMAIL_SMTP_PORT,
    EMAIL_SMTP_USER: process.env.EMAIL_SMTP_USER,
    EMAIL_SMTP_PASS: process.env.EMAIL_SMTP_PASS,
    EMAIL_SMTP_FROM: process.env.EMAIL_SMTP_FROM,
    EMAIL_SMTP_FROM_NAME: process.env.EMAIL_SMTP_FROM_NAME,
    EMAIL_SMTP_SECURE: process.env.EMAIL_SMTP_SECURE,
  };
  process.env.EMAIL_SMTP_HOST = "smtp.example.com";
  process.env.EMAIL_SMTP_PORT = "465";
  process.env.EMAIL_SMTP_USER = "info@example.com";
  process.env.EMAIL_SMTP_PASS = "app-password";
  process.env.EMAIL_SMTP_FROM = "info@example.com";
  process.env.EMAIL_SMTP_FROM_NAME = "EazInvoice";
  process.env.EMAIL_SMTP_SECURE = "true";

  const server = createServer({
    persist: false,
    useSupabaseEmailOtp: true,
    supabaseEmailOtpRequester: async () => {
      throw new Error("Error sending magic link email");
    },
    authEmailOtpSender: async () => {
      throw new Error("SMTP server rejected SMTP password");
    },
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await fetch(`${baseUrl}/auth/email-otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "signup",
        email: "smtp-failure@example.com",
      }),
    });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.match(payload.error, /SMTP fallback also failed/);
    assert.equal(payload.diagnostics.appSmtpConfigured, true);
    assert.equal(payload.diagnostics.supabaseStatus, "failed");
    assert.equal(payload.diagnostics.appSmtpStatus, "failed");
    assert.doesNotMatch(JSON.stringify(payload), /app-password/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
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

test("admin subscription audit exposes yearly tier checkout amounts", async () => {
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
    const admin = await request("/auth/signup", {
      method: "POST",
      body: {
        name: "EazInvoice Admin",
        email: TEST_ADMIN_EMAIL,
        password: "AdminSecure123",
        phone: "9665444554",
        otp: otp.payload.devOtp,
      },
    });
    assert.equal(admin.response.status, 201);

    const audit = await request("/admin/subscription-audit", { token: admin.payload.token });
    assert.equal(audit.response.status, 200);
    const catalog = Object.fromEntries(audit.payload.catalog.map((plan) => [plan.plan, plan]));
    assert.equal(catalog.standard.monthlyAmount, 199);
    assert.equal(catalog.standard.annualAmount, 2388);
    assert.equal(catalog.standard.razorpayAmountPaise, 238800);
    assert.equal(catalog.pro.monthlyAmount, 499);
    assert.equal(catalog.pro.annualAmount, 5988);
    assert.equal(catalog.pro.razorpayAmountPaise, 598800);
    assert.equal(catalog.business.monthlyAmount, 999);
    assert.equal(catalog.business.annualAmount, 11988);
    assert.equal(catalog.business.razorpayAmountPaise, 1198800);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreAdminEmail();
  }
});

test("admin operations dashboard is admin-only and hides secrets", async () => {
  const restoreAdminEmail = useTestAdminEmail();
  const previousGatewaySecret = process.env.RAZORPAY_KEY_SECRET;
  const previousWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_KEY_SECRET = "super-secret-razorpay-value";
  process.env.RAZORPAY_WEBHOOK_SECRET = "super-secret-webhook-value";
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
    const adminOtp = await request("/auth/email-otp/request", {
      method: "POST",
      body: { mode: "signup", email: TEST_ADMIN_EMAIL, phone: "9665444554" },
    });
    const admin = await request("/auth/signup", {
      method: "POST",
      body: {
        name: "EazInvoice Admin",
        email: TEST_ADMIN_EMAIL,
        password: "AdminSecure123",
        phone: "9665444554",
        otp: adminOtp.payload.devOtp,
      },
    });
    const userOtp = await request("/auth/email-otp/request", {
      method: "POST",
      body: { mode: "signup", email: "operations-user@example.com", phone: "9000000000" },
    });
    const user = await request("/auth/signup", {
      method: "POST",
      body: {
        name: "Operations User",
        email: "operations-user@example.com",
        password: "UserSecure123",
        phone: "9000000000",
        otp: userOtp.payload.devOtp,
      },
    });

    const blocked = await request("/admin/operations", { token: user.payload.token });
    assert.equal(blocked.response.status, 403);

    const operations = await request("/admin/operations", { token: admin.payload.token });
    assert.equal(operations.response.status, 200);
    assert.equal(typeof operations.payload.generatedAt, "string");
    assert.equal(operations.payload.summary.users.total, 2);
    assert.ok(Array.isArray(operations.payload.risks));
    const raw = JSON.stringify(operations.payload);
    assert.equal(raw.includes("super-secret-razorpay-value"), false);
    assert.equal(raw.includes("super-secret-webhook-value"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreAdminEmail();
    if (previousGatewaySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previousGatewaySecret;
    if (previousWebhookSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = previousWebhookSecret;
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
        amount: 199,
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
        amount: 199,
        subscriberType: "company",
      },
    });
    assert.equal(paidPending.response.status, 201);
    assert.equal(paidPending.payload.status, "kyc_pending");
    assert.equal(paidPending.payload.companyId, companyResult.payload.id);
    assert.equal(paidPending.payload.amount, 2388);
    assert.equal(paidPending.payload.monthlyAmount, 199);
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
    assert.equal(capturedRazorpayOrderBody.amount, 238800);
    assert.equal(orderResult.payload.description, "Standard plan - INR 199/month billed yearly");

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
    assert.equal(verified.payload.subscription.amount, 2388);
    assert.equal(verified.payload.subscription.monthlyAmount, 199);
    assert.equal(verified.payload.subscription.annualAmount, 2388);
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
        amount: 199,
        subscriberType: "company",
      },
    });
    assert.equal(paidPending.response.status, 201);
    assert.equal(paidPending.payload.status, "payment_pending");
    assert.equal(paidPending.payload.amount, 2388);
    assert.equal(paidPending.payload.monthlyAmount, 199);
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
    amount: 2388,
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
    amount: 5988,
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
    amount: 2388,
    monthlyAmount: 199,
    annualAmount: 2388,
    status: "active",
    gateway: "razorpay",
    gatewayOrderId: "order_lifecycle_standard",
    gatewayPaymentId: "pay_lifecycle_standard",
  });

  const cancelled = api.cancelSubscription(standard.id, { reason: "user requested downgrade" });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(api.getFreePlanSummary(user).plan, "free");

  const renewed = api.renewSubscription(standard.id, {
    amount: 2388,
    monthlyAmount: 199,
    annualAmount: 2388,
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
    amount: 5988,
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
  assert.equal(plans.standard.monthlyAmount, 199);
  assert.equal(plans.standard.annualAmount, 2388);
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
  assert.equal(plans.pro.annualAmount, 5988);
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
    amount: 2388,
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
    amount: 5988,
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
    amount: 199,
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
      amount: 199,
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
    amount: 11988,
    billingCycle: "yearly",
    status: "active",
  });

  const member = api.createTeamMember(user, {
    name: "Accountant",
    email: "accountant@example.com",
    role: "accountant",
  });
  assert.equal(member.status, "active");
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

  const initialCompliance = api.getBusinessComplianceDashboard(user);
  assert.equal(initialCompliance.readiness.compliance, false);
  assert.ok(initialCompliance.complianceReview.missing.includes("state"));

  api.updateBusinessSettings(user, {
    complianceProfile: {
      legalName: "Business Owner LLP",
      entityType: "company",
      gstRegistered: true,
      gstin: "27ABCDE1234F1Z5",
      pan: "ABCDE1234F",
      state: "Maharashtra",
      address: "Pune, Maharashtra",
      placeOfBusiness: "Pune",
      invoicePrefix: "BO",
    },
  });

  api.createInvoice({
    ownerUserId: user.id,
    customerName: "Compliance Buyer",
    currency: "INR",
    status: "created",
    invoiceDate: "2026-07-01",
    taxRate: 18,
    items: [{ description: "Business consulting", quantity: 1, rate: 10000 }],
  });
  api.createPurchaseOrder({
    ownerUserId: user.id,
    vendorName: "Compliance Vendor",
    currency: "INR",
    status: "created",
    taxRate: 18,
    items: [{ description: "Vendor service", quantity: 1, rate: 2000 }],
  });

  const complianceDashboard = api.getBusinessComplianceDashboard(user);
  assert.equal(complianceDashboard.readiness.compliance, true);
  assert.equal(complianceDashboard.readiness.gst, true);
  assert.equal(complianceDashboard.readiness.smtp, true);
  assert.equal(complianceDashboard.readiness.gateway, true);
  assert.equal(complianceDashboard.readiness.overall, true);
  assert.equal(complianceDashboard.complianceEngine.enabled, true);
  assert.equal(complianceDashboard.complianceEngine.export.headers[0], "Compliance");
  assert.ok(complianceDashboard.complianceEngine.export.rows.length > 0);
  assert.ok(complianceDashboard.complianceEngine.reminders.counts.actionable > 0);
  const gstTask = complianceDashboard.complianceTasks.find((task) => task.id === "gst_return_reconciliation");
  assert.ok(gstTask);
  assert.match(gstTask.dueDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(gstTask.nextReminderDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(gstTask.requiredDocuments.includes("GSTIN"));
  assert.equal(complianceDashboard.gst.outputGst, 1800);
  assert.equal(complianceDashboard.gst.inputGst, 360);
  assert.equal(complianceDashboard.gst.netGstPayable, 1440);
  assert.equal(complianceDashboard.financials.revenue, 11800);
  assert.equal(complianceDashboard.financials.expenses, 2360);
  assert.equal(complianceDashboard.financials.profit, 9440);
  assert.equal(complianceDashboard.financials.receivables, 11800);

  const filedTask = api.updateComplianceTask(user, "gst_return_reconciliation", {
    status: "filed",
    reminderDaysBefore: 5,
    responsiblePerson: "Finance Head",
    dueDate: "2026-08-20",
    notes: "GSTR reconciliation checked for July.",
  });
  assert.equal(filedTask.status, "filed");
  assert.equal(filedTask.reminderDaysBefore, 5);
  assert.equal(filedTask.dueDate, "2026-08-20");
  assert.equal(filedTask.nextReminderDate, "2026-08-15");
  const refreshedCompliance = api.getBusinessComplianceDashboard(user);
  const refreshedGstTask = refreshedCompliance.complianceTasks.find((task) => task.id === "gst_return_reconciliation");
  assert.equal(refreshedGstTask.status, "filed");
  assert.equal(refreshedGstTask.responsiblePerson, "Finance Head");
  assert.equal(refreshedGstTask.record.auditTrail.at(-1).toStatus, "filed");
  assert.equal(refreshedCompliance.complianceEngine.summary.filed, 1);
  assert.equal(refreshedCompliance.complianceEngine.summary.total, complianceDashboard.complianceEngine.summary.total);
  assert.ok(refreshedCompliance.complianceEngine.summary.pending < complianceDashboard.complianceEngine.summary.pending);

  assert.equal(member.status, "active");
  assert.equal(member.inviteToken, null);
  assert.equal(member.auditTrail.at(-1).action, "sub_user_created");
  const invitee = api.createUser({ name: "Accountant", email: "accountant@example.com" });

  const accountantWorkspaces = api.listBusinessWorkspaces(invitee);
  const ownerWorkspace = accountantWorkspaces.find((workspace) => workspace.ownerUserId === user.id);
  assert.ok(ownerWorkspace);
  assert.equal(ownerWorkspace.role, "accountant");
  assert.equal(ownerWorkspace.permissions.read, true);
  assert.equal(ownerWorkspace.permissions.writeRecords, true);
  assert.equal(ownerWorkspace.permissions.compliance, true);
  assert.equal(ownerWorkspace.permissions.approvals, true);
  assert.equal(ownerWorkspace.permissions.apiAccess, false);
  assert.equal(ownerWorkspace.permissions.manageTeam, false);
  assert.equal(ownerWorkspace.permissions.manageSettings, false);

  const accountantTeamView = api.listTeamMembers(invitee, { workspaceOwnerUserId: user.id });
  assert.equal(accountantTeamView.length, 1);

  const accountantCompliance = api.updateComplianceTask(invitee, "gst_return_reconciliation", {
    workspaceOwnerUserId: user.id,
    status: "pending",
    notes: "Accountant reopened this for owner review.",
  });
  assert.equal(accountantCompliance.status, "pending");
  assert.match(accountantCompliance.notes, /Accountant reopened/);

  assert.throws(
    () => api.updateBusinessSettings(invitee, {
      workspaceOwnerUserId: user.id,
      emailSettings: { senderName: "Should not save" },
    }),
    /team role cannot perform/i,
  );

  const viewerMember = api.createTeamMember(user, {
    name: "Viewer",
    email: "viewer@example.com",
    role: "viewer",
  });
  const viewer = api.createUser({ name: "Viewer", email: "viewer@example.com" });
  assert.equal(viewerMember.status, "active");
  assert.equal(viewerMember.inviteToken, null);
  const viewerWorkspace = api.listBusinessWorkspaces(viewer).find((workspace) => workspace.ownerUserId === user.id);
  assert.equal(viewerWorkspace.permissions.read, true);
  assert.equal(viewerWorkspace.permissions.writeRecords, false);
  assert.equal(viewerWorkspace.permissions.compliance, false);
  assert.equal(viewerWorkspace.permissions.approvals, false);
  assert.equal(viewerWorkspace.permissions.apiAccess, false);
  assert.equal(viewerWorkspace.permissions.manageTeam, false);
  assert.equal(viewerWorkspace.permissions.manageSettings, false);
  assert.throws(
    () => api.updateComplianceTask(viewer, "gst_return_reconciliation", {
      workspaceOwnerUserId: user.id,
      status: "filed",
    }),
    /team role cannot perform/i,
  );

  const removedMember = api.updateTeamMember(user, member.id, { status: "removed" });
  assert.equal(removedMember.status, "removed");
  assert.equal(removedMember.auditTrail.at(-1).action, "revoked");
  assert.throws(
    () => api.listTeamMembers(invitee, { workspaceOwnerUserId: user.id }),
    /Business workspace access denied/,
  );
});

test("entity-aware compliance engine distinguishes company and freelancer obligations", () => {
  const store = createStore({}, { persist: false, useSupabaseEmailOtp: false });
  const api = createApi({ store });
  const companyUser = api.createUser({ name: "Company Owner", email: "company-owner@example.com", subscriberType: "company" });
  api.createSubscription({
    userId: companyUser.id,
    subscriberName: companyUser.name,
    subscriberType: "company",
    plan: "business",
    amount: 11988,
    billingCycle: "yearly",
    status: "active",
  });
  api.updateBusinessSettings(companyUser, {
    complianceProfile: {
      legalName: "Company Owner Private Limited",
      entityType: "private_limited_company",
      businessCategory: "service",
      gstRegistered: true,
      gstin: "27ABCDE1234F1Z5",
      pan: "ABCDE1234F",
      tan: "ABCD12345E",
      tanAvailable: true,
      state: "Maharashtra",
      address: "Pune, Maharashtra",
      placeOfBusiness: "Pune",
      invoicePrefix: "CO",
      employeeCount: 4,
      annualTurnover: 12000000,
      importExport: true,
      auditApplicable: true,
      responsiblePerson: "Finance Head",
    },
  });
  const companyCompliance = api.getBusinessComplianceDashboard(companyUser);
  const companyTaskIds = companyCompliance.complianceTasks.map((task) => task.id);
  assert.equal(companyCompliance.complianceReview.entityAwareReady, true);
  assert.ok(companyTaskIds.includes("gst_return_reconciliation"));
  assert.ok(companyTaskIds.includes("tds_tcs_review"));
  assert.ok(companyTaskIds.includes("mca_annual_filing"));
  assert.ok(companyTaskIds.includes("statutory_audit_review"));
  assert.ok(companyTaskIds.includes("iec_import_export_review"));
  const mcaTask = companyCompliance.complianceTasks.find((task) => task.id === "mca_annual_filing");
  assert.equal(mcaTask.periodLabel, "2026-27");
  assert.match(mcaTask.dueDate, /^2027-10-30$/);

  const freelancer = api.createUser({ name: "Solo Freelancer", email: "solo-freelancer@example.com", subscriberType: "individual" });
  api.createSubscription({
    userId: freelancer.id,
    subscriberName: freelancer.name,
    subscriberType: "individual",
    plan: "business",
    amount: 11988,
    billingCycle: "yearly",
    status: "active",
  });
  api.updateBusinessSettings(freelancer, {
    complianceProfile: {
      legalName: "Solo Freelancer",
      entityType: "freelancer",
      pan: "FGHIJ1234K",
      state: "Kerala",
      address: "Kochi, Kerala",
      placeOfBusiness: "Kochi",
      invoicePrefix: "SF",
    },
  });
  const freelancerCompliance = api.getBusinessComplianceDashboard(freelancer);
  const freelancerTaskIds = freelancerCompliance.complianceTasks.map((task) => task.id);
  assert.equal(freelancerCompliance.complianceReview.entityAwareReady, true);
  assert.ok(freelancerTaskIds.includes("income_tax_return"));
  assert.ok(freelancerTaskIds.includes("records_retention"));
  assert.ok(!freelancerTaskIds.includes("mca_annual_filing"));
  assert.ok(!freelancerTaskIds.includes("gst_return_reconciliation"));
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

    const blockedCompliance = await request("/business/compliance-dashboard", { token: signup.payload.token });
    assert.equal(blockedCompliance.response.status, 402);

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

    const missingSmtpReminder = await request("/business/compliance-tasks/income_tax_return/reminder", {
      method: "POST",
      token: signup.payload.token,
      previewPlan: "business",
      body: { recipient: "finance@example.com" },
    });
    assert.equal(missingSmtpReminder.response.status, 400);
    assert.match(missingSmtpReminder.payload.error, /Configure and validate Business SMTP settings/);

    const earlyNotifications = await request("/business/notifications", {
      token: signup.payload.token,
      previewPlan: "business",
    });
    assert.equal(earlyNotifications.response.status, 200);
    assert.ok(earlyNotifications.payload.some((notification) => notification.id === "smtp.not_configured"));
    assert.ok(earlyNotifications.payload.some((notification) => notification.id === "gateway.not_ready"));
    assert.equal(new Set(earlyNotifications.payload.map((notification) => notification.id)).size, earlyNotifications.payload.length);

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
        complianceProfile: {
          legalName: "EazInvoice Admin",
          gstRegistered: true,
          gstin: "27ABCDE1234F1Z5",
          pan: "ABCDE1234F",
          state: "Maharashtra",
          address: "Pune, Maharashtra",
          placeOfBusiness: "Pune",
          invoicePrefix: "EA",
        },
      },
    });
    assert.equal(settings.response.status, 200);
    assert.equal(settings.payload.emailSettings.smtpPass, "");
    assert.equal(settings.payload.emailSettings.smtpPassConfigured, true);
    assert.equal(settings.payload.paymentSettings.keySecret, "");
    assert.equal(settings.payload.paymentSettings.status, "test_mode");
    assert.equal(settings.payload.complianceReview.status, "ready");

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

    const compliance = await request("/business/compliance-dashboard", {
      token: signup.payload.token,
      previewPlan: "business",
    });
    assert.equal(compliance.response.status, 200);
    assert.equal(compliance.payload.readiness.compliance, true);
    assert.equal(compliance.payload.readiness.gateway, true);
    assert.ok(compliance.payload.complianceEngine.export.rows.length > 0);
    assert.ok(compliance.payload.complianceEngine.reminders.counts.actionable > 0);

    const blockedTaskUpdate = await request("/business/compliance-tasks/income_tax_return", {
      method: "PATCH",
      token: signup.payload.token,
      body: { status: "filed" },
    });
    assert.equal(blockedTaskUpdate.response.status, 402);

    const taskUpdate = await request("/business/compliance-tasks/income_tax_return", {
      method: "PATCH",
      token: signup.payload.token,
      previewPlan: "business",
      body: { status: "filed", dueDate: "2026-09-30", reminderDaysBefore: 10, notes: "Filed through endpoint test." },
    });
    assert.equal(taskUpdate.response.status, 200);
    assert.equal(taskUpdate.payload.status, "filed");
    assert.equal(taskUpdate.payload.dueDate, "2026-09-30");
    assert.equal(taskUpdate.payload.nextReminderDate, "2026-09-20");
    assert.equal(taskUpdate.payload.record.auditTrail.at(-1).toStatus, "filed");

    const refreshedCompliance = await request("/business/compliance-dashboard", {
      token: signup.payload.token,
      previewPlan: "business",
    });
    assert.equal(refreshedCompliance.payload.complianceEngine.summary.filed, 1);
    assert.equal(refreshedCompliance.payload.complianceEngine.summary.total, compliance.payload.complianceEngine.summary.total);
    assert.ok(refreshedCompliance.payload.complianceEngine.summary.pending < compliance.payload.complianceEngine.summary.pending);

    const approvalRequest = await request("/business/approvals", {
      method: "POST",
      token: signup.payload.token,
      previewPlan: "business",
      body: { documentType: "invoice", documentNumber: "EA/2026/0001", notes: "Review before sending." },
    });
    assert.equal(approvalRequest.response.status, 201);

    const auditEvents = await request("/business/audit-events", {
      token: signup.payload.token,
      previewPlan: "business",
    });
    assert.equal(auditEvents.response.status, 200);
    const actions = auditEvents.payload.map((event) => event.action);
    assert.ok(actions.includes("api_key.created"));
    assert.ok(actions.includes("settings.email_saved"));
    assert.ok(actions.includes("settings.gateway_saved"));
    assert.ok(actions.includes("smtp.validate"));
    assert.ok(actions.includes("smtp.compliance_reminder"));
    assert.ok(actions.includes("compliance.task_updated"));
    assert.equal(auditEvents.payload.every((event) => event.ownerUserId === signup.payload.user.id), true);
    const serializedAuditEvents = JSON.stringify(auditEvents.payload);
    assert.doesNotMatch(serializedAuditEvents, /app-password/);
    assert.doesNotMatch(serializedAuditEvents, /eaz_live_/);
    assert.doesNotMatch(serializedAuditEvents, /"keySecret":"secret"/);
    assert.doesNotMatch(serializedAuditEvents, /"webhookSecret":"webhook"/);

    const smtpAuditEvents = await request("/business/audit-events?category=smtp", {
      token: signup.payload.token,
      previewPlan: "business",
    });
    assert.equal(smtpAuditEvents.response.status, 200);
    assert.ok(smtpAuditEvents.payload.length > 0);
    assert.equal(smtpAuditEvents.payload.every((event) => event.category === "smtp"), true);

    const actionAuditEvents = await request("/business/audit-events?action=api_key.created", {
      token: signup.payload.token,
      previewPlan: "business",
    });
    assert.equal(actionAuditEvents.response.status, 200);
    assert.equal(actionAuditEvents.payload.every((event) => event.action === "api_key.created"), true);

    const actorAuditEvents = await request(`/business/audit-events?actor=${encodeURIComponent("support")}`, {
      token: signup.payload.token,
      previewPlan: "business",
    });
    assert.equal(actorAuditEvents.response.status, 200);
    assert.ok(actorAuditEvents.payload.length > 0);
    assert.equal(actorAuditEvents.payload.every((event) => /support/i.test(`${event.actorName} ${event.actorEmail}`)), true);

    const failedAuditEvents = await request("/business/audit-events?outcome=not_configured", {
      token: signup.payload.token,
      previewPlan: "business",
    });
    assert.equal(failedAuditEvents.response.status, 200);
    assert.equal(failedAuditEvents.payload.every((event) => event.outcome === "not_configured"), true);

    const businessNotifications = await request("/business/notifications", {
      token: signup.payload.token,
      previewPlan: "business",
    });
    assert.equal(businessNotifications.response.status, 200);
    const notificationIds = businessNotifications.payload.map((notification) => notification.id);
    assert.ok(notificationIds.includes("approvals.pending"));
    assert.ok(notificationIds.includes("api_keys.active"));
    assert.ok(notificationIds.some((id) => id.startsWith("compliance.")));
    assert.ok(notificationIds.some((id) => id.startsWith("audit.")));
    assert.equal(new Set(notificationIds).size, notificationIds.length);
    assert.ok(businessNotifications.payload.every((notification) => notification.targetSection?.startsWith("workspace-")));
    assert.equal(JSON.stringify(businessNotifications.payload).includes("notification_record"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreAdminEmail();
  }
});

test("business notification retry sends emails and records audit outcomes", async () => {
  const restoreAdminEmail = useTestAdminEmail();
  const sentMessages = [];
  const server = createServer({
    persist: false,
    useSupabaseEmailOtp: false,
    businessSmtpSender: async (settings, message) => {
      sentMessages.push({ settings, message });
      return { ok: true };
    },
  });
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
      body: { mode: "signup", email: TEST_ADMIN_EMAIL, phone: "9999999999" },
    });
    const signup = await request("/auth/signup", {
      method: "POST",
      body: {
        name: "Business Owner",
        email: TEST_ADMIN_EMAIL,
        password: "OwnerSecure123",
        phone: "9999999999",
        otp: otp.payload.devOtp,
      },
    });
    const token = signup.payload.token;
    await request("/business/settings", {
      method: "PATCH",
      token,
      previewPlan: "business",
      body: {
        emailSettings: {
          senderName: "Owner Co",
          smtpHost: "mail.privateemail.com",
          smtpPort: "465",
          smtpUser: "owner@example.com",
          smtpPass: "smtp-password",
          fromEmail: "owner@example.com",
          replyToEmail: "owner@example.com",
          smtpSecure: true,
        },
      },
    });

    const team = await request("/business/team", {
      method: "POST",
      token,
      previewPlan: "business",
      body: { name: "Accountant", email: "accountant@example.com", role: "accountant" },
    });
    assert.equal(team.response.status, 201);
    assert.equal(team.payload.inviteDeliveryStatus, "sent");

    const teamRetry = await request("/business/notifications/retry", {
      method: "POST",
      token,
      previewPlan: "business",
      body: { type: "team_access", targetId: team.payload.id },
    });
    assert.equal(teamRetry.response.status, 200);
    assert.equal(teamRetry.payload.deliveryStatus, "sent");

    const approval = await request("/business/approvals", {
      method: "POST",
      token,
      previewPlan: "business",
      body: { documentType: "invoice", documentNumber: "OWN/2026/001", notes: "Review." },
    });
    assert.equal(approval.response.status, 201);

    const approvalRetry = await request("/business/notifications/retry", {
      method: "POST",
      token,
      previewPlan: "business",
      body: { type: "approval", targetId: approval.payload.id },
    });
    assert.equal(approvalRetry.response.status, 200);
    assert.equal(approvalRetry.payload.deliveryStatus, "sent");

    const gatewayRetry = await request("/business/notifications/retry", {
      method: "POST",
      token,
      previewPlan: "business",
      body: { type: "gateway", reason: "Gateway validation failed during setup." },
    });
    assert.equal(gatewayRetry.response.status, 200);
    assert.equal(gatewayRetry.payload.deliveryStatus, "sent");

    const audit = await request("/business/audit-events?category=smtp", {
      token,
      previewPlan: "business",
    });
    const actions = audit.payload.map((event) => event.action);
    assert.ok(actions.includes("smtp.sub_user_access_email_retry"));
    assert.ok(actions.includes("smtp.approval_notification_retry"));
    assert.ok(actions.includes("smtp.gateway_attention"));
    assert.ok(sentMessages.length >= 4);
    assert.equal(JSON.stringify(audit.payload).includes("smtp-password"), false);

    const settings = await request("/business/settings", {
      token,
      previewPlan: "business",
    });
    assert.equal(settings.response.status, 200);
    assert.ok(settings.payload.emailSettings.deliveryAttempts >= 4);
    assert.ok(settings.payload.emailSettings.deliveryHistory.some((entry) => entry.action === "gateway_attention"));
    assert.equal(JSON.stringify(settings.payload.emailSettings.deliveryHistory).includes("smtp-password"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreAdminEmail();
  }
});

test("admin business notification automation sends due notices once per day", async () => {
  const restoreAdminEmail = useTestAdminEmail();
  const sentMessages = [];
  const server = createServer({
    persist: false,
    useSupabaseEmailOtp: false,
    businessSmtpSender: async (settings, message) => {
      sentMessages.push({ settings, message });
      return { ok: true };
    },
  });
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
      body: { mode: "signup", email: TEST_ADMIN_EMAIL, phone: "9999999999" },
    });
    const signup = await request("/auth/signup", {
      method: "POST",
      body: {
        name: "Business Owner",
        email: TEST_ADMIN_EMAIL,
        password: "OwnerSecure123",
        phone: "9999999999",
        otp: otp.payload.devOtp,
      },
    });
    const token = signup.payload.token;

    await request("/business/settings", {
      method: "PATCH",
      token,
      previewPlan: "business",
      body: {
        emailSettings: {
          senderName: "Owner Co",
          smtpHost: "mail.privateemail.com",
          smtpPort: "465",
          smtpUser: "owner@example.com",
          smtpPass: "smtp-password",
          fromEmail: "owner@example.com",
          replyToEmail: "owner@example.com",
          smtpSecure: true,
        },
        paymentSettings: {
          paymentLinkEnabled: true,
        },
        complianceProfile: {
          legalName: "Owner Co",
          entityType: "company",
          pan: "ABCDE1234F",
          state: "Maharashtra",
          address: "Pune",
          placeOfBusiness: "Pune",
          invoicePrefix: "OC",
          gstRegistered: true,
          gstin: "27ABCDE1234F1Z5",
          complianceYear: "2026",
        },
      },
    });

    const approval = await request("/business/approvals", {
      method: "POST",
      token,
      previewPlan: "business",
      body: { documentType: "invoice", documentNumber: "OC/2026/001", notes: "Pending owner approval." },
    });
    assert.equal(approval.response.status, 201);

    const status = await request("/admin/business-notifications/status", { token });
    assert.equal(status.response.status, 200);
    assert.equal(status.payload.enabled, false);

    const firstRun = await request("/admin/business-notifications/run", {
      method: "POST",
      token,
      body: { previewPlan: "business", approvalAgeDays: 0, includeDigest: true },
    });
    assert.equal(firstRun.response.status, 201);
    assert.ok(firstRun.payload.sent >= 3);
    const actions = firstRun.payload.notices.map((notice) => notice.deliveryAction);
    assert.ok(actions.includes("scheduled_compliance_reminder"));
    assert.ok(actions.includes("scheduled_approval_aging"));
    assert.ok(actions.includes("scheduled_gateway_attention"));
    assert.ok(actions.includes("scheduled_business_digest"));

    const secondRun = await request("/admin/business-notifications/run", {
      method: "POST",
      token,
      body: { previewPlan: "business", approvalAgeDays: 0, includeDigest: true },
    });
    assert.equal(secondRun.response.status, 201);
    assert.equal(secondRun.payload.sent, 0);
    assert.ok(secondRun.payload.skipped >= firstRun.payload.notices.length);

    const audit = await request("/business/audit-events?category=smtp", {
      token,
      previewPlan: "business",
    });
    const auditActions = audit.payload.map((event) => event.action);
    assert.ok(auditActions.includes("smtp.scheduled_compliance_reminder"));
    assert.ok(auditActions.includes("smtp.scheduled_approval_aging"));
    assert.ok(auditActions.includes("smtp.scheduled_gateway_attention"));
    assert.equal(JSON.stringify(audit.payload).includes("smtp-password"), false);
    assert.ok(sentMessages.length >= firstRun.payload.notices.length);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreAdminEmail();
  }
});

test("business workspace invite routes enforce owner accountant and viewer permissions", async () => {
  const store = createStore({}, { persist: false, useSupabaseEmailOtp: false });
  const api = createApi({ store });
  const server = createServer({ store, persist: false, useSupabaseEmailOtp: false });
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

  async function signup(name, email, phone) {
    const otp = await request("/auth/email-otp/request", {
      method: "POST",
      body: { mode: "signup", email, phone },
    });
    const created = await request("/auth/signup", {
      method: "POST",
      body: {
        name,
        email,
        password: "SecurePass123",
        phone,
        otp: otp.payload.devOtp,
      },
    });
    assert.equal(created.response.status, 201);
    return created.payload;
  }

  try {
    const owner = await signup("Workspace Owner", "workspace-owner@example.com", "9000000001");
    api.createSubscription({
      userId: owner.user.id,
      subscriberName: owner.user.name,
      subscriberType: "company",
      plan: "business",
      amount: 11988,
      billingCycle: "yearly",
      status: "active",
    });

    const ownerAsSubUser = await request("/business/team", {
      method: "POST",
      token: owner.token,
      body: { name: "Workspace Owner", email: "workspace-owner@example.com", role: "accountant" },
    });
    assert.equal(ownerAsSubUser.response.status, 400);
    assert.match(ownerAsSubUser.payload.error, /workspace owner\/admin email/i);

    api.createUser({ name: "Workspace Admin", email: "workspace-admin@example.com", role: "admin" });
    const adminAsSubUser = await request("/business/team", {
      method: "POST",
      token: owner.token,
      body: { name: "Workspace Admin", email: "workspace-admin@example.com", role: "viewer" },
    });
    assert.equal(adminAsSubUser.response.status, 400);
    assert.match(adminAsSubUser.payload.error, /Admin email addresses cannot be added/i);
    const ownerRoleSubUser = await request("/business/team", {
      method: "POST",
      token: owner.token,
      body: { name: "Owner Role", email: "workspace-owner-role@example.com", role: "owner" },
    });
    assert.equal(ownerRoleSubUser.response.status, 400);
    assert.match(ownerRoleSubUser.payload.error, /Accountant or Viewer/i);

    const adminRoleSubUser = await request("/business/team", {
      method: "POST",
      token: owner.token,
      body: { name: "Admin Role", email: "workspace-admin-role@example.com", role: "admin" },
    });
    assert.equal(adminRoleSubUser.response.status, 400);
    assert.match(adminRoleSubUser.payload.error, /Accountant or Viewer/i);
    const accountantInvite = await request("/business/team", {
      method: "POST",
      token: owner.token,
      body: { name: "Accountant User", email: "workspace-accountant@example.com", role: "accountant" },
    });
    assert.equal(accountantInvite.response.status, 201);
    assert.equal(accountantInvite.payload.role, "accountant");
    assert.equal(accountantInvite.payload.status, "active");
    assert.equal(accountantInvite.payload.inviteToken, null);
    assert.equal(accountantInvite.payload.inviteDeliveryStatus, "not_configured");
    assert.match(accountantInvite.payload.inviteDeliveryMessage, /SMTP is not configured/i);

    const duplicateAccountant = await request("/business/team", {
      method: "POST",
      token: owner.token,
      body: { name: "Accountant Again", email: "workspace-accountant@example.com", role: "viewer" },
    });
    assert.equal(duplicateAccountant.response.status, 400);
    assert.match(duplicateAccountant.payload.error, /already has workspace access/i);

    const accountant = await signup("Accountant User", "workspace-accountant@example.com", "9000000002");
    const accountantAccept = await request("/business/team/accept", {
      method: "POST",
      token: accountant.token,
      body: { inviteToken: "deprecated" },
    });
    assert.equal(accountantAccept.response.status, 410);
    assert.match(accountantAccept.payload.error, /Invite links are disabled/i);

    const accountantWorkspaces = await request("/business/workspaces", { token: accountant.token });
    assert.equal(accountantWorkspaces.response.status, 200);
    const sharedWorkspace = accountantWorkspaces.payload.find((workspace) => workspace.ownerUserId === owner.user.id);
    assert.equal(sharedWorkspace.role, "accountant");
    assert.equal(sharedWorkspace.permissions.approvals, true);
    assert.equal(sharedWorkspace.permissions.manageSettings, false);
    assert.equal(sharedWorkspace.permissions.apiAccess, false);

    const accountantApproval = await request("/business/approvals", {
      method: "POST",
      token: accountant.token,
      body: {
        workspaceOwnerUserId: owner.user.id,
        documentType: "invoice",
        documentNumber: "RA/2026/0099",
        notes: "Accountant route-level approval request.",
      },
    });
    assert.equal(accountantApproval.response.status, 201);
    assert.equal(accountantApproval.payload.status, "pending");
    assert.equal(accountantApproval.payload.notificationStatus, "not_configured");
    assert.match(accountantApproval.payload.notificationMessage, /approval notification/i);

    const ownerDecision = await request(`/business/approvals/${accountantApproval.payload.id}`, {
      method: "PATCH",
      token: owner.token,
      body: {
        status: "approved",
        decisionNotes: "Approved by owner.",
      },
    });
    assert.equal(ownerDecision.response.status, 200);
    assert.equal(ownerDecision.payload.status, "approved");
    assert.equal(ownerDecision.payload.notificationStatus, "not_configured");
    assert.match(ownerDecision.payload.notificationMessage, /approval notification/i);

    const reminderWithoutSmtp = await request("/business/compliance-tasks/income_tax_return/reminder", {
      method: "POST",
      token: owner.token,
      body: {},
    });
    assert.equal(reminderWithoutSmtp.response.status, 400);
    assert.equal(reminderWithoutSmtp.payload.deliveryStatus, "not_configured");
    assert.match(reminderWithoutSmtp.payload.deliveryMessage, /compliance reminders/i);

    const failingSmtpSettings = await request("/business/settings", {
      method: "PATCH",
      token: owner.token,
      body: {
        emailSettings: {
          senderName: "Workspace Owner",
          fromEmail: "owner@example.com",
          replyToEmail: "owner@example.com",
          smtpHost: "127.0.0.1",
          smtpPort: "1",
          smtpUser: "owner@example.com",
          smtpPass: "app-password",
          smtpSecure: false,
        },
      },
    });
    assert.equal(failingSmtpSettings.response.status, 200);
    assert.equal(failingSmtpSettings.payload.emailSettings.smtpPassConfigured, true);

    const failedDeliveryInvite = await request("/business/team", {
      method: "POST",
      token: owner.token,
      body: { name: "Delivery Failure User", email: "workspace-delivery-fail@example.com", role: "viewer" },
    });
    assert.equal(failedDeliveryInvite.response.status, 201);
    assert.equal(failedDeliveryInvite.payload.inviteDeliveryStatus, "failed");
    assert.match(failedDeliveryInvite.payload.inviteDeliveryMessage, /Could not send sub-user access email/i);

    const accountantSettingsDenied = await request("/business/settings", {
      method: "PATCH",
      token: accountant.token,
      body: {
        workspaceOwnerUserId: owner.user.id,
        emailSettings: { smtpHost: "smtp.example.com" },
      },
    });
    assert.notEqual(accountantSettingsDenied.response.status, 200);
    assert.match(accountantSettingsDenied.payload.error, /team role cannot perform/i);

    const viewerInvite = await request("/business/team", {
      method: "POST",
      token: owner.token,
      body: { name: "Viewer User", email: "workspace-viewer@example.com", role: "viewer" },
    });
    assert.equal(viewerInvite.response.status, 201);

    const ownerEscalationDenied = await request(`/business/team/${viewerInvite.payload.id}`, {
      method: "PATCH",
      token: owner.token,
      body: { role: "owner" },
    });
    assert.equal(ownerEscalationDenied.response.status, 400);
    assert.match(ownerEscalationDenied.payload.error, /Accountant or Viewer/i);

    const viewer = await signup("Viewer User", "workspace-viewer@example.com", "9000000003");
    assert.equal(viewerInvite.payload.status, "active");
    assert.equal(viewerInvite.payload.inviteToken, null);

    const viewerWorkspaces = await request("/business/workspaces", { token: viewer.token });
    const viewerWorkspace = viewerWorkspaces.payload.find((workspace) => workspace.ownerUserId === owner.user.id);
    assert.equal(viewerWorkspace.role, "viewer");
    assert.equal(viewerWorkspace.permissions.read, true);
    assert.equal(viewerWorkspace.permissions.approvals, false);

    const viewerApprovals = await request(`/business/approvals?workspaceOwnerUserId=${owner.user.id}`, { token: viewer.token });
    assert.equal(viewerApprovals.response.status, 200);
    assert.equal(viewerApprovals.payload.length, 1);

    const viewerTaskDenied = await request("/business/compliance-tasks/income_tax_return", {
      method: "PATCH",
      token: viewer.token,
      body: {
        workspaceOwnerUserId: owner.user.id,
        status: "filed",
      },
    });
    assert.notEqual(viewerTaskDenied.response.status, 200);
    assert.match(viewerTaskDenied.payload.error, /team role cannot perform/i);

    const viewerApiDenied = await request(`/business/api-keys?workspaceOwnerUserId=${owner.user.id}`, { token: viewer.token });
    assert.notEqual(viewerApiDenied.response.status, 200);
    assert.match(viewerApiDenied.payload.error, /team role cannot perform/i);

    const accountantCustomer = await request("/customers", {
      method: "POST",
      token: accountant.token,
      body: {
        workspaceOwnerUserId: owner.user.id,
        name: "Shared Customer",
        email: "shared-customer@example.com",
      },
    });
    assert.equal(accountantCustomer.response.status, 201);
    assert.equal(accountantCustomer.payload.ownerUserId, owner.user.id);

    const accountantCustomerUpdate = await request(`/customers/${accountantCustomer.payload.id}`, {
      method: "PATCH",
      token: accountant.token,
      body: {
        workspaceOwnerUserId: owner.user.id,
        phone: "9000000999",
        billingAddress: "Shared workspace billing address",
      },
    });
    assert.equal(accountantCustomerUpdate.response.status, 200);
    assert.equal(accountantCustomerUpdate.payload.phone, "9000000999");

    const viewerCustomerUpdateDenied = await request(`/customers/${accountantCustomer.payload.id}`, {
      method: "PATCH",
      token: viewer.token,
      body: {
        workspaceOwnerUserId: owner.user.id,
        phone: "viewer-should-not-edit",
      },
    });
    assert.notEqual(viewerCustomerUpdateDenied.response.status, 200);
    assert.match(viewerCustomerUpdateDenied.payload.error, /team role cannot perform/i);

    const deletedCustomer = await request(`/customers/${accountantCustomer.payload.id}?workspaceOwnerUserId=${owner.user.id}`, {
      method: "DELETE",
      token: accountant.token,
    });
    assert.equal(deletedCustomer.response.status, 200);
    assert.equal(deletedCustomer.payload.status, "deleted");

    const restoredCustomer = await request(`/customers/${accountantCustomer.payload.id}/reactivate`, {
      method: "POST",
      token: accountant.token,
      body: { workspaceOwnerUserId: owner.user.id },
    });
    assert.equal(restoredCustomer.response.status, 200);
    assert.equal(restoredCustomer.payload.status, "active");

    const accountantVendor = await request("/vendors", {
      method: "POST",
      token: accountant.token,
      body: {
        workspaceOwnerUserId: owner.user.id,
        vendorType: "company",
        name: "Shared Vendor",
        email: "shared-vendor@example.com",
        phone: "9000000888",
      },
    });
    assert.equal(accountantVendor.response.status, 201);
    assert.equal(accountantVendor.payload.ownerUserId, owner.user.id);
    assert.match(accountantVendor.payload.vendorCode, /^VEN-/);

    const accountantVendorUpdate = await request(`/vendors/${accountantVendor.payload.id}`, {
      method: "PATCH",
      token: accountant.token,
      body: {
        workspaceOwnerUserId: owner.user.id,
        phone: "9000000777",
        billingAddress: "Shared vendor billing address",
      },
    });
    assert.equal(accountantVendorUpdate.response.status, 200);
    assert.equal(accountantVendorUpdate.payload.phone, "9000000777");

    const viewerVendorUpdateDenied = await request(`/vendors/${accountantVendor.payload.id}`, {
      method: "PATCH",
      token: viewer.token,
      body: {
        workspaceOwnerUserId: owner.user.id,
        phone: "viewer-should-not-edit-vendor",
      },
    });
    assert.notEqual(viewerVendorUpdateDenied.response.status, 200);
    assert.match(viewerVendorUpdateDenied.payload.error, /team role cannot perform/i);

    const deletedVendor = await request(`/vendors/${accountantVendor.payload.id}?workspaceOwnerUserId=${owner.user.id}`, {
      method: "DELETE",
      token: accountant.token,
    });
    assert.equal(deletedVendor.response.status, 200);
    assert.equal(deletedVendor.payload.status, "deleted");

    const restoredVendor = await request(`/vendors/${accountantVendor.payload.id}/reactivate`, {
      method: "POST",
      token: accountant.token,
      body: { workspaceOwnerUserId: owner.user.id },
    });
    assert.equal(restoredVendor.response.status, 200);
    assert.equal(restoredVendor.payload.status, "active");

    const accountantInvoice = await request("/invoices", {
      method: "POST",
      token: accountant.token,
      body: {
        workspaceOwnerUserId: owner.user.id,
        customerId: accountantCustomer.payload.id,
        billToName: "Shared Customer",
        invoiceDate: "2026-07-10",
        dueDate: "2026-07-20",
        currency: "INR",
        taxRate: 18,
        status: "created",
        items: [{ description: "Business service", quantity: 1, rate: 1000, gstRate: 18 }],
      },
    });
    assert.equal(accountantInvoice.response.status, 201);
    assert.equal(accountantInvoice.payload.ownerUserId, owner.user.id);
    assert.equal(accountantInvoice.payload.total, 1180);

    const viewerInvoices = await request(`/invoices?workspaceOwnerUserId=${owner.user.id}`, { token: viewer.token });
    assert.equal(viewerInvoices.response.status, 200);
    assert.equal(viewerInvoices.payload.some((invoice) => invoice.id === accountantInvoice.payload.id), true);

    const viewerInvoiceRead = await request(`/invoices/${accountantInvoice.payload.id}?workspaceOwnerUserId=${owner.user.id}`, {
      token: viewer.token,
    });
    assert.equal(viewerInvoiceRead.response.status, 200);
    assert.equal(viewerInvoiceRead.payload.ownerUserId, owner.user.id);

    const viewerReports = await request(`/reports?workspaceOwnerUserId=${owner.user.id}`, { token: viewer.token });
    assert.equal(viewerReports.response.status, 200);

    const viewerAccounting = await request(`/accounting/summary?workspaceOwnerUserId=${owner.user.id}`, { token: viewer.token });
    assert.notEqual(viewerAccounting.response.status, 401);

    const viewerInvoiceWriteDenied = await request(`/invoices/${accountantInvoice.payload.id}`, {
      method: "PATCH",
      token: viewer.token,
      body: {
        workspaceOwnerUserId: owner.user.id,
        paymentTerms: "Viewer should not edit",
      },
    });
    assert.notEqual(viewerInvoiceWriteDenied.response.status, 200);
    assert.match(viewerInvoiceWriteDenied.payload.error, /team role cannot perform/i);

    const viewerReportCreateDenied = await request("/reports", {
      method: "POST",
      token: viewer.token,
      body: {
        workspaceOwnerUserId: owner.user.id,
        title: "Viewer should not create report records",
      },
    });
    assert.notEqual(viewerReportCreateDenied.response.status, 200);
    assert.match(viewerReportCreateDenied.payload.error, /team role cannot perform/i);

    const accountantPayment = await request(`/invoices/${accountantInvoice.payload.id}/payments`, {
      method: "POST",
      token: accountant.token,
      body: {
        workspaceOwnerUserId: owner.user.id,
        amount: 500,
        mode: "UPI",
        reference: "TEAM-PAY-1",
      },
    });
    assert.equal(accountantPayment.response.status, 201);
    assert.equal(accountantPayment.payload.invoice.paymentStatus, "part_paid");
    assert.equal(accountantPayment.payload.invoice.ownerUserId, owner.user.id);

    const viewerPaymentLinkDenied = await request(`/invoices/${accountantInvoice.payload.id}/payment-link`, {
      method: "POST",
      token: viewer.token,
      body: { workspaceOwnerUserId: owner.user.id },
    });
    assert.notEqual(viewerPaymentLinkDenied.response.status, 200);
    assert.match(viewerPaymentLinkDenied.payload.error, /team role cannot perform/i);

    const accountantAiDraft = await request("/ai/command", {
      method: "POST",
      token: accountant.token,
      body: {
        workspaceOwnerUserId: owner.user.id,
        command: "Create invoice for Shared Customer for consulting INR 1000 plus 18% GST due in 7 days",
        useLlm: false,
      },
    });
    assert.equal(accountantAiDraft.response.status, 201);
    assert.equal(accountantAiDraft.payload.createdRecord.ownerUserId, owner.user.id);
    assert.equal(accountantAiDraft.payload.quota.plan, "business");

    const viewerAiDraftDenied = await request("/ai/command", {
      method: "POST",
      token: viewer.token,
      body: {
        workspaceOwnerUserId: owner.user.id,
        command: "Create invoice for Shared Customer for consulting INR 1000 plus 18% GST",
        useLlm: false,
      },
    });
    assert.notEqual(viewerAiDraftDenied.response.status, 201);
    assert.match(viewerAiDraftDenied.payload.error, /team role cannot perform/i);

    const accountantPo = await request("/purchase-orders", {
      method: "POST",
      token: accountant.token,
      body: {
        workspaceOwnerUserId: owner.user.id,
        billToName: "Shared Vendor",
        poDate: "2026-07-10",
        currency: "INR",
        taxRate: 18,
        status: "created",
        documentType: "po",
        items: [{ description: "Vendor service", quantity: 1, rate: 700, gstRate: 18 }],
      },
    });
    assert.equal(accountantPo.response.status, 201);
    assert.equal(accountantPo.payload.ownerUserId, owner.user.id);

    const viewerPoRead = await request(`/purchase-orders/${accountantPo.payload.id}?workspaceOwnerUserId=${owner.user.id}`, {
      token: viewer.token,
    });
    assert.equal(viewerPoRead.response.status, 200);
    assert.equal(viewerPoRead.payload.ownerUserId, owner.user.id);

    const viewerPoPaymentDenied = await request(`/purchase-orders/${accountantPo.payload.id}/payments`, {
      method: "POST",
      token: viewer.token,
      body: {
        workspaceOwnerUserId: owner.user.id,
        amount: 100,
        mode: "UPI",
      },
    });
    assert.notEqual(viewerPoPaymentDenied.response.status, 200);
    assert.match(viewerPoPaymentDenied.payload.error, /team role cannot perform/i);

    const viewerPoDeleteDenied = await request(`/purchase-orders/${accountantPo.payload.id}?workspaceOwnerUserId=${owner.user.id}`, {
      method: "DELETE",
      token: viewer.token,
    });
    assert.notEqual(viewerPoDeleteDenied.response.status, 200);
    assert.match(viewerPoDeleteDenied.payload.error, /team role cannot perform/i);

    const unrelated = await signup("Other User", "workspace-other@example.com", "9000000004");
    const unrelatedInvoices = await request(`/invoices?workspaceOwnerUserId=${owner.user.id}`, { token: unrelated.token });
    assert.notEqual(unrelatedInvoices.response.status, 200);
    assert.match(unrelatedInvoices.payload.error, /Business workspace access denied/i);

    const unrelatedCustomerDeleteDenied = await request(`/customers/${accountantCustomer.payload.id}?workspaceOwnerUserId=${owner.user.id}`, {
      method: "DELETE",
      token: unrelated.token,
    });
    assert.notEqual(unrelatedCustomerDeleteDenied.response.status, 200);
    assert.match(unrelatedCustomerDeleteDenied.payload.error, /Business workspace access denied/i);

    const unrelatedVendorDeleteDenied = await request(`/vendors/${accountantVendor.payload.id}?workspaceOwnerUserId=${owner.user.id}`, {
      method: "DELETE",
      token: unrelated.token,
    });
    assert.notEqual(unrelatedVendorDeleteDenied.response.status, 200);
    assert.match(unrelatedVendorDeleteDenied.payload.error, /Business workspace access denied/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("security hardening blocks public uploads and cross-user business records", async () => {
  const store = createStore({}, { persist: false, useSupabaseEmailOtp: false });
  const api = createApi({ store });
  const server = createServer({ store, persist: false, useSupabaseEmailOtp: false });
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

  async function signup(name, email, phone) {
    const otp = await request("/auth/email-otp/request", {
      method: "POST",
      body: { mode: "signup", email, phone },
    });
    const created = await request("/auth/signup", {
      method: "POST",
      body: {
        name,
        email,
        password: "SecurePass123",
        phone,
        otp: otp.payload.devOtp,
      },
    });
    assert.equal(created.response.status, 201);
    return created.payload;
  }

  try {
    const owner = await signup("Secure Owner", "secure-owner@example.com", "9100000001");
    const other = await signup("Secure Other", "secure-other@example.com", "9100000002");
    const company = api.createCompany({
      name: "Secure Owner Co",
      ownerUserId: owner.user.id,
      entityType: "company",
      panNumber: "ABCDE1234F",
    });
    const invoice = api.createInvoice({
      ownerUserId: owner.user.id,
      companyId: company.id,
      billToName: "Owner Client",
      invoiceDate: "2026-07-15",
      status: "created",
      currency: "INR",
      items: [{ description: "Private service", quantity: 1, rate: 1000, gstRate: 18 }],
    });
    const purchaseOrder = api.createPurchaseOrder({
      ownerUserId: owner.user.id,
      companyId: company.id,
      billToName: "Owner Vendor",
      poDate: "2026-07-15",
      status: "created",
      currency: "INR",
      items: [{ description: "Private purchase", quantity: 1, rate: 500, gstRate: 18 }],
    });

    const upload = await request("/uploads", {
      method: "POST",
      token: owner.token,
      body: {
        files: [{
          fileName: "kyc-proof.txt",
          mimeType: "text/plain",
          dataUrl: `data:text/plain;base64,${Buffer.from("private kyc").toString("base64")}`,
        }],
      },
    });
    assert.equal(upload.response.status, 201);
    assert.match(upload.payload.files[0].filePath, /^\/data\/uploads\//);

    const publicUploadFetch = await fetch(`${baseUrl}${upload.payload.files[0].filePath}`);
    assert.equal(publicUploadFetch.status, 401);

    const crossCompanyUpdate = await request(`/companies/${company.id}`, {
      method: "PATCH",
      token: other.token,
      body: { name: "Hijacked Company" },
    });
    assert.equal(crossCompanyUpdate.response.status, 404);

    const crossInvoiceRead = await request(`/invoices/${invoice.id}`, { token: other.token });
    assert.equal(crossInvoiceRead.response.status, 404);

    const crossInvoicePayment = await request(`/invoices/${invoice.id}/payments`, {
      method: "POST",
      token: other.token,
      body: { amount: 100 },
    });
    assert.equal(crossInvoicePayment.response.status, 404);

    const crossPoRead = await request(`/purchase-orders/${purchaseOrder.id}`, { token: other.token });
    assert.equal(crossPoRead.response.status, 404);

    const ownerInvoiceRead = await request(`/invoices/${invoice.id}`, { token: owner.token });
    assert.equal(ownerInvoiceRead.response.status, 200);
    assert.equal(ownerInvoiceRead.payload.ownerUserId, owner.user.id);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("production access audit requires authentication for sensitive api routes", async () => {
  const server = createServer({ persist: false, useSupabaseEmailOtp: false });
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const sensitiveRequests = [
    { path: "/me" },
    { path: "/profile", method: "PATCH", body: { name: "No Token" } },
    { path: "/admin/money" },
    { path: "/admin/operations" },
    { path: "/admin/users" },
    { path: "/uploads", method: "POST", body: { files: [] } },
    { path: "/companies" },
    { path: "/companies", method: "POST", body: { name: "Public Company" } },
    { path: "/customers" },
    { path: "/customers", method: "POST", body: { name: "Public Customer" } },
    { path: "/vendors" },
    { path: "/vendors", method: "POST", body: { name: "Public Vendor" } },
    { path: "/billing/razorpay/order", method: "POST", body: { plan: "standard" } },
    { path: "/subscriptions/me" },
    { path: "/reports/summary" },
    { path: "/accounting/summary" },
    { path: "/reports" },
    { path: "/business/team" },
    { path: "/business/settings" },
    { path: "/business/audit-events" },
    { path: "/business/notifications" },
    { path: "/business/api-keys" },
    { path: "/business/approvals" },
    { path: "/ai/usage" },
    { path: "/ai/command", method: "POST", body: { command: "Create invoice" } },
    { path: "/invoices" },
    { path: "/invoices", method: "POST", body: { billToName: "Public Client" } },
    { path: "/payments" },
    { path: "/purchase-orders" },
    { path: "/purchase-orders", method: "POST", body: { vendorName: "Public Vendor" } },
  ];

  try {
    for (const request of sensitiveRequests) {
      const response = await fetch(`${baseUrl}${request.path}`, {
        method: request.method || "GET",
        headers: { "Content-Type": "application/json" },
        body: request.body ? JSON.stringify(request.body) : undefined,
      });
      assert.equal(
        response.status,
        401,
        `${request.method || "GET"} ${request.path} should require authentication`,
      );
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
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
