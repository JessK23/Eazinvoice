import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const dashboardHtml = read("apps/web/dashboard.html");
const dashboardJs = read("apps/web/dashboard.js");

test("Sales and Purchases own their Web master-data surfaces", () => {
  assert.match(dashboardHtml, /href="\/apps\/web\/dashboard\.html#customers" data-page-link="customers">Customers/);
  assert.match(dashboardHtml, /href="\/apps\/web\/dashboard\.html#vendors" data-page-link="vendors">Vendors/);
  assert.match(dashboardHtml, /id="customers"[^>]*data-surface-owner="sales"[^>]*data-surface-purpose="customer-master"/);
  assert.match(dashboardHtml, /id="vendors"[^>]*data-surface-owner="purchases"[^>]*data-surface-purpose="vendor-master"/);
});

test("Customer and Vendor creation stay on their owning surfaces", () => {
  assert.match(dashboardHtml, /id="customerForm"[^>]*data-surface-action="customer\.create"/);
  assert.match(dashboardHtml, /id="vendorForm"/);
  assert.match(dashboardHtml, /href="\/apps\/web\/dashboard\.html#customers" data-page-link="customers">Add Customer/);
  assert.match(dashboardHtml, /href="\/apps\/web\/dashboard\.html#vendors" data-page-link="vendors">Add Vendor/);
  assert.match(dashboardJs, /apiClient\.createCustomer\(token/);
  assert.match(dashboardJs, /apiClient\.createVendor\(token/);
  assert.match(dashboardJs, /customerFormStatus/);
  assert.match(dashboardJs, /vendorFormStatus/);
});

test("Dashboard quick access does not route master-data creation into invoice or PO workflows", () => {
  assert.doesNotMatch(dashboardHtml, /href="\/apps\/web\/invoice\.html#customerStep">Add Customer/);
  assert.doesNotMatch(dashboardHtml, /href="\/apps\/web\/invoice\.html\?type=po">Add Vendor Through PO\/WO/);
});

test("Operational sections declare one canonical page owner", () => {
  const expected = [
    ["dashboard-home", "command-center", "operational-summary"],
    ["reports", "reports", "report-consumption"],
    ["invoices", "sales", "invoice-operations"],
    ["purchase-orders", "purchases", "purchase-orders"],
    ["vendor-bills", "purchases", "vendor-bills"],
    ["accounting", "accounting", "accounting-operations"],
    ["general-ledger", "accounting", "general-ledger-read"],
    ["banking", "banking", "banking-operations"],
    ["business-profiles", "business-profile", "business-identity"],
    ["business-workspace", "workspace", "business-configuration"],
  ];
  for (const [id, owner, purpose] of expected) {
    const section = dashboardHtml.match(new RegExp(`<section id="${id}"[^>]*>`))?.[0] || "";
    assert.match(section, new RegExp(`data-surface-owner="${owner}"`), `${id} owner`);
    assert.match(section, new RegExp(`data-surface-purpose="${purpose}"`), `${id} purpose`);
  }
});

test("Account, Business Profile, and Workspace remain separate presentation owners", () => {
  const access = read("apps/web/access.html");
  const settings = read("apps/web/account-settings.html");
  assert.match(access, /data-surface-owner="account"[^>]*data-surface-purpose="personal-profile"/);
  assert.match(access, /data-surface-owner="business-profile"[^>]*data-surface-purpose="business-identity"/);
  assert.match(settings, /data-surface-owner="workspace"[^>]*data-surface-purpose="business-configuration"/);
});

test("Bank Book and Cash Book retain explicit Accounting ownership", () => {
  const bankingNav = dashboardHtml.match(/<div class="nav-section-label">Banking<\/div>[\s\S]*?<div class="nav-section-label">Compliance<\/div>/)?.[0] || "";
  assert.match(bankingNav, /data-page-link="accounting" data-nav-owner="accounting" data-owner-decision="accounting-book">Bank Book/);
  assert.match(bankingNav, /data-page-link="accounting" data-nav-owner="accounting" data-owner-decision="accounting-book">Cash Book/);
  assert.match(bankingNav, /href="\/apps\/web\/dashboard\.html#banking" data-page-link="banking">Reconciliation/);
});

test("Navigation preserves direct dashboard hashes and active-state routing", () => {
  assert.match(dashboardJs, /const dashboardPages = document\.querySelectorAll\("\[data-dashboard-page\]"\)/);
  assert.match(dashboardJs, /window\.location\.hash/);
  assert.match(dashboardJs, /window\.addEventListener\("hashchange", \(\) => showDashboardPage\(\)\)/);
  assert.match(dashboardHtml, /href="\/apps\/web\/dashboard\.html#banking" data-page-link="banking">Banking Overview/);
});
