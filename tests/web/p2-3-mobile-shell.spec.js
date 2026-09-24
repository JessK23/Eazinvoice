import { expect, test } from "@playwright/test";

const json = (payload) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(payload),
});

async function mockMobileApi(page) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.startsWith("/apps/") || path === "/favicon.ico") {
      await route.continue();
      return;
    }
    if (path === "/me") {
      await route.fulfill(json({ user: { id: "mobile-owner", name: "Mobile Owner", email: "owner@example.com", phone: "9876543210" }, plan: { plan: "free", status: "active" } }));
      return;
    }
    if (path === "/business/workspaces") {
      await route.fulfill(json([
        { ownerUserId: "mobile-owner", businessId: "biz-a", businessName: "Alpha Traders", role: "owner" },
        { ownerUserId: "mobile-owner", businessId: "biz-b", businessName: "Beta Services", role: "viewer" },
      ]));
      return;
    }
    if (path === "/companies") {
      await route.fulfill(json([{ id: "biz-a", name: "Alpha Traders", businessType: "retail", entityType: "company" }]));
      return;
    }
    if (path === "/subscriptions/me") {
      await route.fulfill(json([{ id: "sub-1", plan: "free", status: "active" }]));
      return;
    }
    if (path === "/reports/summary") {
      const businessId = url.searchParams.get("businessId");
      await route.fulfill(json({ totals: { revenue: businessId === "biz-b" ? 25 : 1000, expenses: 300, profit: 700, receivables: 180, payables: 90, bankCash: 500 } }));
      return;
    }
    if (path === "/customers") {
      await route.fulfill(json([{ id: "cust-1", name: "Customer One", gstin: "27AAACP1234C1ZV" }]));
      return;
    }
    if (path === "/vendors") {
      await route.fulfill(json([{ id: "ven-1", name: "Vendor One", gstin: "29AAACP1234C1ZV" }]));
      return;
    }
    if (path === "/invoices") {
      await route.fulfill(json([
        { id: "inv-1", invoiceNumber: "INV-MOB-1", customerName: "Customer One", total: 1180, currency: "INR", status: "created", invoiceDate: "2026-09-21" },
        { id: "inv-2", invoiceNumber: "INV-MOB-2", customerName: "Customer Two", total: 900, currency: "INR", status: "issued", invoiceDate: "2026-09-20" },
        { id: "inv-3", invoiceNumber: "INV-MOB-3", customerName: "Customer Three", total: 700, currency: "INR", status: "draft", invoiceDate: "2026-09-19" },
        { id: "inv-4", invoiceNumber: "INV-MOB-4", customerName: "Customer Four", total: 500, currency: "INR", status: "paid", invoiceDate: "2026-09-18" },
        { id: "inv-5", invoiceNumber: "INV-MOB-5", customerName: "Customer Five", total: 400, currency: "INR", status: "part_paid", invoiceDate: "2026-09-17" },
        { id: "inv-6", invoiceNumber: "INV-MOB-6", customerName: "Customer Six", total: 300, currency: "INR", status: "overdue", invoiceDate: "2026-09-16" },
      ]));
      return;
    }
    if (path === "/payments") {
      await route.fulfill(json([{ id: "pay-1", reference: "UTR1", amount: 500, currency: "INR" }]));
      return;
    }
    if (path === "/purchase-orders") {
      await route.fulfill(json([
        { id: "po-1", poNumber: "PO-MOB-1", vendorName: "Vendor One", total: 590, currency: "INR", documentType: "po", poDate: "2026-09-21" },
        { id: "po-2", poNumber: "WO-MOB-2", vendorName: "Vendor Two", total: 490, currency: "INR", documentType: "wo", poDate: "2026-09-20" },
        { id: "po-3", poNumber: "PO-MOB-3", vendorName: "Vendor Three", total: 390, currency: "INR", documentType: "po", poDate: "2026-09-19" },
        { id: "po-4", poNumber: "PO-MOB-4", vendorName: "Vendor Four", total: 290, currency: "INR", documentType: "po", poDate: "2026-09-18" },
        { id: "po-5", poNumber: "WO-MOB-5", vendorName: "Vendor Five", total: 190, currency: "INR", documentType: "wo", poDate: "2026-09-17" },
        { id: "po-6", poNumber: "PO-MOB-6", vendorName: "Vendor Six", total: 90, currency: "INR", documentType: "po", poDate: "2026-09-16" },
      ]));
      return;
    }
    if (path === "/vendor-bills") {
      await route.fulfill(json([{ id: "bill-1", billNumber: "BILL-MOB-1", vendorName: "Vendor One", total: 590, currency: "INR" }]));
      return;
    }
    if (path === "/credit-notes") {
      await route.fulfill(json([{ id: "cn-1", creditNoteNumber: "CN-MOB-1", total: 118, currency: "INR" }]));
      return;
    }
    if (path === "/vendor-credits" || path === "/customer-refunds" || path === "/vendor-refunds") {
      await route.fulfill(json([]));
      return;
    }
    if (path === "/bank/accounts") {
      await route.fulfill(json([{ id: "bank-1", displayName: "Current Account", accountReference: "1234567890", bookBalance: 500, currency: "INR" }]));
      return;
    }
    if (path === "/bank/reconciliation/summary") {
      await route.fulfill(json({ unmatchedCount: 2 }));
      return;
    }
    if (path === "/reports/receivables") {
      await route.fulfill(json({ totalOutstanding: 180, overdueTotal: 0 }));
      return;
    }
    if (path === "/reports/vendor-payables") {
      await route.fulfill(json({ totalOutstanding: 90, overdueTotal: 0 }));
      return;
    }
    if (path === "/reports/profit-loss") {
      await route.fulfill(json({ revenue: 1000, expenses: 300, netProfit: 700 }));
      return;
    }
    if (path === "/reports/balance-sheet") {
      await route.fulfill(json({ assets: { total: 500 }, liabilities: { total: 90 }, equity: { total: 410 }, totals: { assets: 500, liabilities: 90, equity: 410 }, isBalanced: true }));
      return;
    }
    if (path === "/reports/trial-balance") {
      await route.fulfill(json({ debits: 1000, credits: 1000, isBalanced: true }));
      return;
    }
    if (path === "/accounting/gst-summary") {
      await route.fulfill(json({ outputGst: 180, inputGst: 90, netGst: 90, needsReviewCount: 1 }));
      return;
    }
    if (path === "/reports/tds-register") {
      await route.fulfill(json({ tdsPayable: 50, needsReviewCount: 1 }));
      return;
    }
    if (path === "/business/compliance-dashboard") {
      await route.fulfill(json({ openTasks: 1, dueSoon: 1, preparedCount: 1, filedCount: 0 }));
      return;
    }
    if (path === "/accounting/periods") {
      await route.fulfill(json([{ id: "period-1", periodKey: "2026-08", status: "open" }]));
      return;
    }
    if (path === "/accounting/year-end-close/readiness") {
      await route.fulfill(json({ financialYear: "2026-27", ready: true, status: "ready" }));
      return;
    }
    if (path === "/business/team") {
      await route.fulfill(json([{ id: "team-1", email: "accountant@example.com" }]));
      return;
    }
    if (path === "/business/settings") {
      await route.fulfill(json({ emailSettings: { smtpHost: "smtp.example.com" }, paymentSettings: { status: "configured" } }));
      return;
    }
    await route.fulfill(json([]));
  });
}

test("P2-3 mobile shell loads API-backed workspace and blocks stale tenant UI at phone width", async ({ page }) => {
  await mockMobileApi(page);
  await page.setViewportSize({ width: 390, height: 880 });
  await page.addInitScript(() => {
    window.localStorage.setItem("eazinvoice_mobile_session_v3", JSON.stringify({
      token: "mobile-token",
      user: { id: "mobile-owner", name: "Mobile Owner", email: "owner@example.com" },
      activeWorkspace: { ownerUserId: "mobile-owner", businessId: "biz-a", businessName: "Alpha Traders", role: "owner" },
    }));
  });
  await page.goto("/apps/mobile/index.html");

  await expect(page.locator("#profileMeta")).toHaveText("Alpha Traders - Owner");
  await expect(page.getByText("Total sales")).toBeVisible();
  await expect(page.getByText("Latest 5 Invoices")).toBeVisible();
  await expect(page.getByText("Latest 5 PO/WO")).toBeVisible();

  await page.getByRole("button", { name: "Sales" }).click();
  await expect(page.getByText("Create Invoice")).toBeVisible();
  await page.locator("#workspaceSelect").selectOption("biz-b:mobile-owner");
  await expect(page.locator("#profileMeta")).toHaveText("Beta Services - Viewer");
  await page.getByRole("button", { name: "Home" }).click();
  await expect(page.getByText("INR 25.00")).toBeVisible();

  await page.locator("#bottomNav [data-route=\"more\"]").click();
  await expect(page.getByRole("heading", { name: "Compliance" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("[object Object]");

  await page.getByRole("button", { name: "Home" }).click();
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(hasHorizontalOverflow).toBeFalsy();
});
test("mobile profile menu dismisses correctly and does not block dashboard controls", async ({ page }) => {
  await mockMobileApi(page);
  await page.setViewportSize({ width: 390, height: 880 });
  await page.addInitScript(() => {
    window.localStorage.setItem("eazinvoice_mobile_session_v3", JSON.stringify({
      token: "mobile-token",
      user: { id: "mobile-owner", name: "Mobile Owner", email: "owner@example.com" },
      activeWorkspace: { ownerUserId: "mobile-owner", businessId: "biz-a", businessName: "Alpha Traders", role: "owner" },
    }));
  });
  await page.goto("/apps/mobile/index.html");

  const profileButton = page.locator("#profileButton");
  const profileMenu = page.locator("#profileMenu");

  await expect(profileMenu).toBeHidden();
  await expect(profileButton).toHaveAttribute("aria-expanded", "false");

  await profileButton.click();
  await expect(profileMenu).toBeVisible();
  await expect(profileButton).toHaveAttribute("aria-expanded", "true");

  await profileButton.click();
  await expect(profileMenu).toBeHidden();
  await expect(profileButton).toHaveAttribute("aria-expanded", "false");

  await profileButton.click();
  await expect(profileMenu).toBeVisible();
  await page.locator("#content").click({ position: { x: 20, y: 20 } });
  await expect(profileMenu).toBeHidden();

  await profileButton.click();
  await page.getByRole("button", { name: "Account Settings" }).click();
  await expect(profileMenu).toBeHidden();
  await expect(page.getByRole("heading", { name: "API Access" })).toBeVisible();

  await profileButton.click();
  await page.getByRole("button", { name: "Change Password" }).click();
  await expect(profileMenu).toBeHidden();
  await expect(page.getByRole("heading", { name: "Account Profile" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(profileMenu).toBeHidden();

  await page.getByRole("button", { name: "Home" }).click();
  await expect(profileMenu).toBeHidden();

  await page.reload();
  await expect(profileMenu).toBeHidden();
  await expect(profileButton).toHaveAttribute("aria-expanded", "false");

  await profileButton.click();
  await expect(profileMenu).toBeVisible();
  await page.locator("#content").click({ position: { x: 32, y: 40 } });
  await expect(profileMenu).toBeHidden();
  await page.getByRole("button", { name: "Sales" }).click();
  await expect(page.getByText("Create Invoice")).toBeVisible();
});
