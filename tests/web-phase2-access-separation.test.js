import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const accessHtml = read("apps/web/access.html");
const accessJs = read("apps/web/access.js");
const dashboardHtml = read("apps/web/dashboard.html");
const homeHtml = read("apps/web/index.html");
const homeJs = read("apps/web/home.js");
const mobileAppHtml = read("apps/web/mobile-app.html");
const navJs = read("apps/web/nav.js");
const userManualHtml = read("apps/web/user-manual-web.html");

test("My Account is the customer-facing account administration surface", () => {
  assert.match(accessHtml, /<h1>My Account<\/h1>/);
  assert.match(accessHtml, /Manage your profile, business details, account settings and subscription\./);
  assert.match(accessHtml, /data-tab="status">Overview<\/button>/);
  assert.match(accessHtml, /data-tab="profile">Account Profile<\/button>/);
  assert.match(accessHtml, /data-tab="company">Business Profile<\/button>/);
  assert.match(accessHtml, /<h2>Individual \/ Entity Identity<\/h2>/);
  assert.match(accessHtml, /<h2>Business \/ Entity Profile<\/h2>/);
});

test("My Account sends operational work to canonical Workspace destinations", () => {
  assert.match(accessHtml, /class="ghost workspace-nav-link" href="\/apps\/web\/dashboard\.html">My Workspace<\/a>/);
  assert.match(accessHtml, /href="\/apps\/web\/dashboard\.html">Go to Workspace<\/a>/);
  assert.match(accessHtml, /class="tier-banner-card" href="\/apps\/web\/dashboard\.html" aria-label="Open My Workspace">/);
  assert.match(accessHtml, /href="\/apps\/web\/subscription\.html">Manage Subscription<\/a>/);
  assert.match(accessHtml, /href="\/apps\/web\/mobile-app\.html">Mobile App<\/a>/);
  assert.match(accessJs, /invoice: "\/apps\/web\/dashboard\.html#invoices"/);
  assert.match(accessJs, /po: "\/apps\/web\/dashboard\.html#purchase-orders"/);
  assert.match(accessJs, /reports: "\/apps\/web\/dashboard\.html#reports"/);
  assert.match(accessJs, /ai: "\/apps\/web\/dashboard\.html#ai-agent"/);
  assert.match(accessJs, /features: "\/apps\/web\/subscription\.html"/);
});

test("duplicate operational and admin panels are absent from My Account", () => {
  for (const tab of ["ai", "invoice", "po", "reports", "features", "admin"]) {
    assert.doesNotMatch(accessHtml, new RegExp(`data-(?:tab|pane)="${tab}"`));
  }
  for (const endpoint of ["/customers", "/invoices", "/purchase-orders", "/plans", "/admin/money", "/admin/users", "/admin/kyc-review"]) {
    assert.equal(accessJs.includes(`request("${endpoint}"`), false, `${endpoint} must not load from My Account`);
  }
  assert.doesNotMatch(accessJs, /renderAccessInvoiceWorkspace|renderAccessPoWorkspace|loadAdminAccess/);
  assert.doesNotMatch(accessHtml, /Mobile download center/);
});

test("existing account and business API contracts remain in place", () => {
  assert.match(accessJs, /request\("\/me"\)/);
  assert.match(accessJs, /request\("\/companies"\)/);
  assert.match(accessJs, /request\("\/me", \{[\s\S]*?method: "PATCH"/);
  assert.match(accessJs, /request\("\/companies", \{ method: "POST", body: payload \}\)/);
  assert.match(accessJs, /request\(`\/companies\/\$\{existingCompany\.id\}`/);
});

test("legacy admin routing is authorized before leaving My Account", () => {
  assert.match(accessJs, /legacyAccessTab === "admin" && adminAuthorized/);
  assert.match(accessJs, /window\.location\.replace\("\/apps\/web\/admin\.html"\)/);
  assert.match(accessJs, /normalizeRejectedAdminRoute\(\)/);
  assert.match(accessHtml, /id="accessAdminLink" href="\/apps\/web\/admin\.html" hidden/);
});

test("surrounding Web navigation consistently calls the surface My Account", () => {
  for (const source of [homeHtml, homeJs, mobileAppHtml, navJs, userManualHtml]) {
    assert.doesNotMatch(source, /User Access|User access/);
  }
  assert.match(homeHtml, /href="\/apps\/web\/access\.html">My Account<\/a>/);
  assert.match(navJs, /title: "My Account"/);
  assert.match(dashboardHtml, /href="\/apps\/web\/access\.html\?tab=profile">Account Settings<\/a>/);
  assert.match(dashboardHtml, /href="\/apps\/web\/dashboard\.html" data-page-link="home">Dashboard<\/a>/);
  assert.match(dashboardHtml, /href="\/apps\/web\/dashboard\.html#reports" data-page-link="reports">Reports<\/a>/);
});
