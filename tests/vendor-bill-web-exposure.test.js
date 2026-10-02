import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const dashboardHtml = read("apps/web/dashboard.html");
const dashboardJs = read("apps/web/dashboard.js");
const apiClient = read("apps/api/src/client.js");
const server = read("apps/api/src/server.js");

test("Purchases owns the dedicated Vendor Bills surface", () => {
  assert.match(dashboardHtml, /href="\/apps\/web\/dashboard\.html#vendor-bills" data-page-link="vendor-bills">Vendor Bills/);
  assert.match(dashboardHtml, /id="vendor-bills"[^>]*data-surface-owner="purchases"[^>]*data-surface-purpose="vendor-bills"/);
  assert.match(dashboardHtml, /id="vendorBillsList"/);
  assert.doesNotMatch(dashboardHtml, /id="vendor-bills"[^>]*data-surface-owner="(sales|accounting|dashboard)"/);
});

test("Web Vendor Bill exposure reuses the existing API routes and workspace context", () => {
  assert.match(apiClient, /listVendorBills\(token, options = \{\}\)[\s\S]*request\(`\/vendor-bills\$\{queryString\(options\)\}`/);
  assert.match(apiClient, /createVendorBill\(token, body\)[\s\S]*request\("\/vendor-bills", \{ method: "POST"/);
  assert.match(apiClient, /getVendorBill\(token, billId, options = \{\}\)[\s\S]*`\/vendor-bills\/\$\{billId\}/);
  assert.match(apiClient, /updateVendorBill\(token, billId, body\)[\s\S]*method: "PATCH"/);
  assert.match(server, /url\.pathname === "\/vendor-bills" && req\.method === "GET"/);
  assert.match(server, /url\.pathname === "\/vendor-bills" && req\.method === "POST"/);
  assert.match(dashboardJs, /selectedWorkspaceOptions\(\)[\s\S]*apiClient\.createVendorBill\(token/);
});

test("Vendor Bill creation remains scoped and terminal", () => {
  assert.match(dashboardHtml, /id="vendorBillForm"[^>]*data-surface-action="vendor-bill\.create"/);
  assert.match(dashboardJs, /vendorBillForm\?\.addEventListener\("submit"/);
  assert.match(dashboardJs, /items: \[\{ description, quantity, rate \}\]/);
  assert.match(dashboardJs, /setInlineStatus\(vendorBillFormStatus, `\$\{bill\.vendorBillNumber/);
  assert.match(dashboardJs, /renderVendorBills\(dashboardVendorBills\)/);
  assert.doesNotMatch(dashboardJs, /createVendorBill\(token[\s\S]{0,250}(Expense|Payment|Purchase Order|Work Order|Invoice)/);
});

test("Payment is represented as backend state, not an automatic create handoff", () => {
  assert.match(dashboardJs, /Payment: \$\{escapeHtml\(paymentStatus\)\}/);
  assert.match(apiClient, /recordVendorBillPayment\(token, billId, body\)[\s\S]*\/payments/);
  assert.doesNotMatch(dashboardHtml, /vendorBillForm[\s\S]{0,400}(payment|expense|accounting)/i);
});
