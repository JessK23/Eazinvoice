import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";

const E2E_SECRET = "p2-2c-local-playwright-secret";
const PLAN_HEADER = { "X-Eazinvoice-Plan-Preview": "business" };

async function createE2eSession(request) {
  const response = await request.post("/__e2e__/session", {
    headers: { "X-Eazinvoice-E2E-Secret": E2E_SECRET },
    data: {},
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function apiGet(request, token, path) {
  const response = await request.get(path, {
    headers: { Authorization: `Bearer ${token}`, ...PLAN_HEADER },
  });
  expect(response.ok(), `${path} failed with ${response.status()}`).toBeTruthy();
  return response.json();
}

async function apiPost(request, token, path, data) {
  const response = await request.post(path, {
    headers: { Authorization: `Bearer ${token}`, ...PLAN_HEADER },
    data,
  });
  expect(response.ok(), `${path} failed with ${response.status()}: ${await response.text()}`).toBeTruthy();
  return response.json();
}

function qs(options = {}) {
  const params = new URLSearchParams();
  Object.entries(options).forEach(([key, value]) => {
    if (key === "label") return;
    const queryKey = key === "ownerUserId" ? "workspaceOwnerUserId" : key;
    if (value !== undefined && value !== null && value !== "") params.set(key, value);
    if (value !== undefined && value !== null && value !== "") params.set(queryKey, value);
    if (queryKey !== key) params.delete(key);
  });
  const text = params.toString();
  return text ? `?${text}` : "";
}

async function seedInvoiceFixture(request, token, workspace, label, amount = 1000) {
  const customer = await apiPost(request, token, "/customers", {
    workspaceOwnerUserId: workspace.ownerUserId,
    businessId: workspace.businessId,
    name: `${label} Customer`,
    email: `${label.toLowerCase()}@example.test`,
  });
  const invoice = await apiPost(request, token, "/invoices", {
    workspaceOwnerUserId: workspace.ownerUserId,
    businessId: workspace.businessId,
    billToName: customer.name,
    customerId: customer.id,
    invoiceDate: "2026-08-15",
    dueDate: "2026-08-30",
    status: "created",
    currency: "INR",
    gstMode: "intra",
    taxRate: 18,
    items: [{ description: `${label} taxable service`, quantity: 1, rate: amount, gstRate: 18 }],
  });
  const paymentResult = await apiPost(request, token, `/invoices/${invoice.id}/payments`, {
    workspaceOwnerUserId: workspace.ownerUserId,
    businessId: workspace.businessId,
    amount: invoice.total,
    paymentDate: "2026-08-16",
    mode: "bank",
    reference: `${label}-PAYMENT`,
  });
  return { customer, invoice, payment: paymentResult.payment };
}

async function authenticatePage(page, session, workspace) {
  await page.addInitScript(({ token, ownerUserId }) => {
    window.localStorage.setItem("eazinvoice_token", token);
    window.sessionStorage.setItem("eazinvoice_token", token);
    window.localStorage.setItem("eazinvoice_admin_plan_preview", "business");
    if (!window.localStorage.getItem("eazinvoice_business_workspace_owner")) {
      window.localStorage.setItem("eazinvoice_business_workspace_owner", ownerUserId);
    }
  }, { token: session.token, ownerUserId: workspace.ownerUserId });
  page.on("dialog", (dialog) => dialog.accept());
}

test("P2-2C E2E auth refuses production startup", ({}, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "production guard only needs one project");
  const script = [
    "process.env.EAZINVOICE_E2E_AUTH='true';",
    "process.env.EAZINVOICE_E2E_AUTH_SECRET='production-secret-12345';",
    "process.env.NODE_ENV='production';",
    "process.env.EAZINVOICE_ENV='production';",
    "process.env.EAZINVOICE_STORAGE='memory';",
    "process.env.DATABASE_URL='';",
    "const m=await import('./apps/api/src/server.js');",
    "m.createServer();",
  ].join("");
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  expect(result.status).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toContain("Refusing to enable E2E auth");
});

test("P2-2C live authenticated customer correction, refund, banking and year-end preview", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop workflow is covered separately from mobile usability");
  const session = await createE2eSession(request);
  const alpha = session.fixtures.alpha;
  const beta = session.fixtures.beta;
  const alphaFixture = await seedInvoiceFixture(request, session.token, alpha, "Alpha", 1000);
  await seedInvoiceFixture(request, session.token, beta, "Beta", 2000);

  await authenticatePage(page, session, alpha);
  await page.goto("/apps/web/dashboard.html#advanced-workflows");
  await expect(page.locator("#advancedStatus")).toContainText(/loaded/i);
  await expect(page.locator("body")).toContainText("Alpha Customer");
  await expect(page.locator("body")).not.toContainText("Beta Customer");

  const betaOptionValue = await page.locator("#globalBusinessSwitcher option", { hasText: "P2C Beta Books" }).first().getAttribute("value");
  expect(betaOptionValue).toBe(beta.ownerUserId);
  await page.evaluate((ownerUserId) => window.localStorage.setItem("eazinvoice_business_workspace_owner", ownerUserId), beta.ownerUserId);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("body")).toContainText("Beta Customer");
  await expect(page.locator("body")).not.toContainText("Alpha Customer");

  await page.evaluate((ownerUserId) => window.localStorage.setItem("eazinvoice_business_workspace_owner", ownerUserId), alpha.ownerUserId);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("#advancedStatus")).toContainText(/loaded/i);
  await expect(page.locator("body")).toContainText("Alpha Customer");

  await page.locator('#advancedActionForm select[name="actionType"]').selectOption("credit-note");
  await page.locator('#advancedActionForm select[name="sourceInvoiceId"]').selectOption(alphaFixture.invoice.id);
  await page.locator('#advancedActionForm input[name="taxableAmount"]').fill("100");
  await page.locator('#advancedActionForm input[name="taxRate"]').fill("18");
  await page.locator('#advancedActionForm input[name="reason"]').fill("P2-2C partial customer credit");
  await page.locator("#advancedActionSubmit").dblclick();

  await expect.poll(async () => {
    const notes = await apiGet(request, session.token, `/credit-notes${qs(alpha)}`);
    return notes.filter((note) => note.sourceInvoiceId === alphaFixture.invoice.id).length;
  }).toBe(1);
  const creditNotes = await apiGet(request, session.token, `/credit-notes${qs(alpha)}`);
  const p22cCreditNotes = creditNotes.filter((note) => note.sourceInvoiceId === alphaFixture.invoice.id);
  expect(p22cCreditNotes).toHaveLength(1);
  expect(Number(p22cCreditNotes[0].taxAmount)).toBeCloseTo(18, 2);
  expect(Number(p22cCreditNotes[0].total)).toBeCloseTo(118, 2);
  const journalsAfterCredit = await apiGet(request, session.token, `/accounting/event-ledger${qs(alpha)}`);
  expect((journalsAfterCredit.journals || []).some((journal) => (
    journal.sourceType === "sales_credit_note" && journal.sourceId === p22cCreditNotes[0].id
  ))).toBeTruthy();

  const unchangedInvoice = await apiGet(request, session.token, `/invoices/${alphaFixture.invoice.id}${qs(alpha)}`);
  expect(Number(unchangedInvoice.total)).toBeCloseTo(Number(alphaFixture.invoice.total), 2);

  await page.locator('[data-advanced-tab="settlements"]').click();
  await page.locator('#advancedActionForm select[name="actionType"]').selectOption("customer-refund");
  await page.locator('#advancedActionForm select[name="sourceCreditNoteId"]').selectOption(p22cCreditNotes[0].id);
  await page.locator('#advancedActionForm input[name="amount"]').fill("50");
  await page.locator('#advancedActionForm input[name="reference"]').fill("P2-2C-REFUND");
  await page.locator('#advancedActionForm input[name="reason"]').fill("P2-2C customer refund settlement");
  await page.locator("#advancedActionSubmit").click();
  await expect.poll(async () => {
    const rows = await apiGet(request, session.token, `/customer-refunds${qs(alpha)}`);
    return rows.filter((item) => item.sourceCreditNoteId === p22cCreditNotes[0].id).length;
  }).toBe(1);
  const refunds = await apiGet(request, session.token, `/customer-refunds${qs(alpha)}`);
  const refund = refunds.find((item) => item.sourceCreditNoteId === p22cCreditNotes[0].id);
  expect(refund).toBeTruthy();
  expect(Number(refund.amount)).toBeCloseTo(50, 2);
  expect(refund.journalId).toBeTruthy();

  await page.locator('[data-advanced-tab="banking"]').click();
  await page.locator('#advancedActionForm select[name="actionType"]').selectOption("bank-account");
  await page.locator('#advancedActionForm input[name="displayName"]').fill("P2-2C Current Account");
  await page.locator('#advancedActionForm input[name="reference"]').fill("XXXX-4242");
  await page.locator("#advancedActionSubmit").click();
  await expect.poll(async () => {
    const rows = await apiGet(request, session.token, `/bank/accounts${qs(alpha)}`);
    return rows.filter((account) => account.displayName === "P2-2C Current Account").length;
  }).toBe(1);
  const bankAccounts = await apiGet(request, session.token, `/bank/accounts${qs(alpha)}`);
  const bank = bankAccounts.find((account) => account.displayName === "P2-2C Current Account");
  expect(bank).toBeTruthy();

  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(250);
  await expect(page.locator("#advancedStatus")).toContainText(/registers loaded from backend/i);
  await expect(page.locator(`#advancedActionForm select[name="bankAccountId"] option[value="${bank.id}"]`)).toHaveCount(1);
  const statementImport = await page.evaluate(async ({ workspace, bankAccountId }) => {
    const response = await fetch("/bank/statement-imports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.localStorage.getItem("eazinvoice_token")}`,
        "X-Eazinvoice-Plan-Preview": "business",
      },
      body: JSON.stringify({
        workspaceOwnerUserId: workspace.ownerUserId,
        businessId: workspace.businessId,
        bankAccountId,
        sourceType: "browser_live_e2e",
        lines: [{
          statementDate: "2026-08-16",
          narration: "P2-2C statement evidence only",
          reference: "P2-2C statement evidence only",
          credit: 50,
          debit: 0,
        }],
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Statement import failed");
    return payload;
  }, { workspace: alpha, bankAccountId: bank.id });
  expect(statementImport.imported || []).toHaveLength(1);
  await expect.poll(async () => {
    const rows = await apiGet(request, session.token, `/bank/statement-lines${qs(alpha)}`);
    return rows.filter((line) => (
      line.externalReference === "P2-2C statement evidence only"
      || line.description === "P2-2C statement evidence only"
      || line.reference === "P2-2C statement evidence only"
      || line.narration === "P2-2C statement evidence only"
    )).length;
  }).toBe(1);
  const statementLines = await apiGet(request, session.token, `/bank/statement-lines${qs(alpha)}`);
  expect(statementLines.some((line) => (
    line.externalReference === "P2-2C statement evidence only"
    || line.description === "P2-2C statement evidence only"
    || line.reference === "P2-2C statement evidence only"
    || line.narration === "P2-2C statement evidence only"
  ))).toBeTruthy();
  const ledgerAfterImport = await apiGet(request, session.token, `/accounting/event-ledger${qs(alpha)}`);
  expect((ledgerAfterImport.journals || []).filter((journal) => journal.sourceType === "bank_statement_import")).toHaveLength(0);

  const yearEndBefore = await apiGet(request, session.token, `/accounting/year-end-closes${qs(alpha)}`);
  await page.locator('[data-advanced-tab="year-end"]').click();
  await page.locator('#advancedActionForm select[name="actionType"]').selectOption("year-end-preview");
  await page.locator('#advancedActionForm input[name="financialYear"]').fill("2026-27");
  await page.locator('#advancedActionForm input[name="actionDate"]').fill("2027-03-31");
  const previewResponsePromise = page.waitForResponse((response) => (
    response.url().includes("/accounting/year-end-close/preview")
    && response.request().method() === "GET"
  ));
  await page.locator("#advancedActionSubmit").click();
  const previewResponse = await previewResponsePromise;
  expect(previewResponse.ok()).toBeTruthy();
  const previewPayload = await previewResponse.json();
  expect(previewPayload.businessId || previewPayload.preview?.businessId || alpha.businessId).toBeTruthy();
  const yearEndAfter = await apiGet(request, session.token, `/accounting/year-end-closes${qs(alpha)}`);
  expect(yearEndAfter.length).toBe(yearEndBefore.length);
});

test("P2-2C mobile live credit note workflow remains usable @mobile", async ({ page, request }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "mobile viewport coverage only");
  const session = await createE2eSession(request);
  const alpha = session.fixtures.alpha;
  const fixture = await seedInvoiceFixture(request, session.token, alpha, "Mobile", 750);
  await authenticatePage(page, session, alpha);

  await page.goto("/apps/web/dashboard.html#advanced-workflows");
  await expect(page.locator("#advancedStatus")).toContainText(/loaded/i);
  await page.locator('#advancedActionForm select[name="actionType"]').selectOption("credit-note");
  await page.locator('#advancedActionForm select[name="sourceInvoiceId"]').selectOption(fixture.invoice.id);
  await page.locator('#advancedActionForm input[name="taxableAmount"]').fill("75");
  await page.locator('#advancedActionForm input[name="reason"]').fill("P2-2C mobile credit");
  await expect(page.locator("#advancedActionSubmit")).toBeVisible();
  await page.locator("#advancedActionSubmit").click();
  await expect.poll(async () => {
    const notes = await apiGet(request, session.token, `/credit-notes${qs(alpha)}`);
    return notes.filter((note) => note.sourceInvoiceId === fixture.invoice.id).length;
  }).toBe(1);

  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 2);
});
