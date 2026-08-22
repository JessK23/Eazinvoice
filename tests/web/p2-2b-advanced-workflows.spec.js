import { expect, test } from "@playwright/test";

const json = (payload) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(payload),
});

async function mockAuthenticatedApi(page) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.startsWith("/apps/") || path === "/favicon.ico") {
      await route.continue();
      return;
    }
    if (path === "/me") {
      await route.fulfill(json({
        user: { id: "user-p22b", name: "P2-2B Owner", email: "p22b@example.com", role: "user" },
        plan: { plan: "business", label: "Business", features: { teamAccess: true, apiAccess: true, aiAgent: true } },
      }));
      return;
    }
    if (path === "/plan/free" || path === "/plans") {
      await route.fulfill(json({ plan: "business", label: "Business", features: { teamAccess: true, apiAccess: true } }));
      return;
    }
    if (path === "/business/workspaces") {
      await route.fulfill(json([
        { ownerUserId: "user-p22b", businessId: "biz-p22b", label: "P2B Trading", role: "owner", source: "owned", permissions: { read: true, writeRecords: true, compliance: true, approvals: true, apiAccess: true, manageTeam: true, manageSettings: true } },
      ]));
      return;
    }
    if (path === "/companies") {
      await route.fulfill(json([{ id: "biz-p22b", ownerUserId: "user-p22b", legalName: "P2B Trading", name: "P2B Trading", entityType: "company", state: "Maharashtra", gstNumber: "27AAACP1234C1ZV" }]));
      return;
    }
    if (path === "/invoices") {
      await route.fulfill(json([{ id: "inv-p22b", businessId: "biz-p22b", invoiceNumber: "INV-P22B", billToName: "Browser Customer", invoiceDate: "2026-08-15", dueDate: "2026-08-30", status: "created", paymentStatus: "part_paid", currency: "INR", total: 1180, paidAmount: 500, balanceAmount: 680, taxAmount: 180 }]));
      return;
    }
    if (path === "/purchase-orders") {
      await route.fulfill(json([{ id: "bill-p22b", businessId: "biz-p22b", poNumber: "BILL-P22B", documentType: "bill", billToName: "Browser Vendor", poDate: "2026-08-14", status: "created", paymentStatus: "unpaid", currency: "INR", total: 590, paidAmount: 0, balanceAmount: 590, taxAmount: 90 }]));
      return;
    }
    if (path === "/payments") {
      await route.fulfill(json([{ id: "pay-p22b", businessId: "biz-p22b", invoiceId: "inv-p22b", amount: 500, currency: "INR", paymentDate: "2026-08-16", mode: "bank", reference: "BANK-P22B" }]));
      return;
    }
    if (path === "/reports/summary") {
      await route.fulfill(json({ available: true, totals: { createdInvoices: 1, paidAmount: 500, unpaidAmount: 680, revenue: 1000, expenses: 500, profit: 500, outputGst: 180, inputGst: 90, netGstPayable: 90 }, monthlyTrend: [] }));
      return;
    }
    if (path === "/business/settings") {
      await route.fulfill(json({ complianceProfile: { fiscalYearStartMonth: 4, gstin: "27AAACP1234C1ZV", entityType: "company" }, emailSettings: {}, paymentSettings: {} }));
      return;
    }
    if (path === "/business/compliance-dashboard") {
      await route.fulfill(json({ readiness: { overall: true }, complianceEngine: { summary: { pending: 1, filed: 0, overdue: 0 }, reminders: { counts: { upcoming: 1, overdue: 0 } } }, gst: { outputGst: 180, inputGst: 90, netGstPayable: 90 }, complianceTasks: [] }));
      return;
    }
    if (path === "/credit-notes") {
      await route.fulfill(json([{ id: "cn-p22b", sourceInvoiceId: "inv-p22b", creditNoteNumber: "CN-P22B", creditNoteDate: "2026-08-17", reason: "price correction", currency: "INR", taxAmount: 18, total: 118, unappliedCredit: 0, status: "posted", journalId: "jn-cn" }]));
      return;
    }
    if (path === "/vendor-credits") {
      await route.fulfill(json([{ id: "vc-p22b", sourceVendorBillId: "bill-p22b", vendorCreditNumber: "VC-P22B", vendorCreditDate: "2026-08-17", reason: "vendor adjustment", currency: "INR", taxAmount: 9, total: 59, unappliedCredit: 0, status: "posted", journalId: "jn-vc" }]));
      return;
    }
    if (path === "/payment-reversals" || path === "/vendor-payment-reversals" || path === "/customer-refunds" || path === "/vendor-refunds") {
      await route.fulfill(json([]));
      return;
    }
    if (path === "/bank/accounts") {
      await route.fulfill(json([{ id: "bacc-p22b", displayName: "Current Account", accountType: "bank", maskedAccountReference: "****1234", ledgerAccountCode: "1110", status: "active" }]));
      return;
    }
    if (path === "/bank/statement-lines") {
      await route.fulfill(json([{ id: "bline-p22b", statementDate: "2026-08-16", narration: "BANK-P22B", reference: "BANK-P22B", credit: 500, debit: 0, currency: "INR", reconciliationStatus: "unmatched", matchedAmount: 0 }]));
      return;
    }
    if (path === "/bank/reconciliation/summary") {
      await route.fulfill(json({ matchedAmount: 0, difference: 500, status: "unreconciled" }));
      return;
    }
    if (path === "/accounting/periods") {
      await route.fulfill(json([{ periodKey: "2026-08", status: "open", readinessStatus: "ready", startDate: "2026-08-01", endDate: "2026-08-31" }]));
      return;
    }
    if (path === "/accounting/opening-balances" || path === "/accounting/financial-years" || path === "/accounting/year-end-closes") {
      await route.fulfill(json([]));
      return;
    }
    if (path === "/reports/gst-sales-register") {
      await route.fulfill(json({ rows: [{ invoiceNumber: "INV-P22B", invoiceDate: "2026-08-15", customerName: "Browser Customer", taxableAmount: 1000, cgst: 90, sgst: 90, igst: 0, status: "prepared" }] }));
      return;
    }
    if (path === "/reports/gst-purchase-register") {
      await route.fulfill(json({ rows: [{ vendorName: "Browser Vendor", vendorBillNumber: "BILL-P22B", billDate: "2026-08-14", taxableAmount: 500, inputCgst: 45, inputSgst: 45, inputIgst: 0, itcStatus: "needs_review" }] }));
      return;
    }
    if (path === "/reports/gst-reconciliation" || path === "/reports/tds-reconciliation") {
      await route.fulfill(json({ rows: [{ component: "Output CGST", registerAmount: 90, ledgerAmount: 90, difference: 0, status: "reconciled" }] }));
      return;
    }
    if (path === "/reports/tds-register") {
      await route.fulfill(json({ rows: [{ vendorName: "Browser Vendor", natureOfPayment: "professional_fees", ruleVersion: "configured-2026", grossAmount: 500, amountSubjectToTds: 500, tdsAmount: 50, netVendorPayable: 450, status: "needs_review", sourceMetadata: "configured" }] }));
      return;
    }
    if (path === "/reports/compliance-obligations") {
      await route.fulfill(json({ rows: [{ complianceName: "GST return reconciliation", period: "2026-08", dueDate: "2026-09-20", status: "prepared", filedExternally: false }] }));
      return;
    }
    await route.fulfill(json([]));
  });
}

test("P2-2B advanced financial workflows render authenticated UI and mobile layout", async ({ page }) => {
  await mockAuthenticatedApi(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("eazinvoice_token", "browser-test-token");
    window.sessionStorage.setItem("eazinvoice_token", "browser-test-token");
  });
  await page.goto("/apps/web/dashboard.html#advanced-workflows");

  await expect(page.getByRole("heading", { name: "Advanced Financial Workflows" })).toBeVisible();
  await expect(page.locator("#advancedStatus")).toContainText(/loaded/i);
  await expect(page.locator("#advancedActionTitle")).toContainText("Credit Note");
  await expect(page.locator("#advancedRegister")).toContainText("CN-P22B");

  const expectedTitles = {
    settlements: "Settlement Register",
    banking: "Bank Reconciliation Workspace",
    periods: "Accounting Governance",
    "year-end": "Year-End Close Register",
    gst: "GST Compliance Center",
    tds: "TDS Compliance Center",
  };
  for (const [tab, title] of Object.entries(expectedTitles)) {
    await page.locator(`[data-advanced-tab="${tab}"]`).click();
    await expect(page.locator("#advancedRegisterTitle")).toContainText(title);
    await expect(page.locator("#advancedActionForm")).toBeVisible();
  }

  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator('[data-advanced-tab="banking"]').click();
  await expect(page.locator(".advanced-workspace-grid")).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(hasHorizontalOverflow).toBeFalsy();
});
