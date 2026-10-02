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
