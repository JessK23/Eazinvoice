import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const authJs = read("apps/web/auth.js");
const accessHtml = read("apps/web/access.html");
const accessJs = read("apps/web/access.js");
const dashboardHtml = read("apps/web/dashboard.html");
const dashboardJs = read("apps/web/dashboard.js");
const homeHtml = read("apps/web/index.html");
const invoiceHtml = read("apps/web/invoice.html");
const mobileAppHtml = read("apps/web/mobile-app.html");
const navJs = read("apps/web/nav.js");
const onboardingHtml = read("apps/web/onboarding.html");

function anchorDestinationsStartingWith(html, label) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
    .filter(([, , body]) => body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().startsWith(label))
    .map(([, attributes]) => attributes.match(/\bhref="([^"]+)"/)?.[1])
    .filter(Boolean);
}

function searchDestination(source, title) {
  const item = [...source.matchAll(/\{\s*title:\s*"([^"]+)"[\s\S]*?url:\s*"([^"]+)"[\s\S]*?\}/g)]
    .find(([, itemTitle]) => itemTitle === title);
  return item?.[2];
}

test("normal authentication lands on the canonical workspace while explicit admin routing is preserved", () => {
  assert.match(authJs, /requestedNext === "admin-gateway" && admin/);
  assert.match(authJs, /requestedNext === "admin" && admin/);
  assert.doesNotMatch(authJs, /if \(admin\) return "\/apps\/web\/admin\.html";/);
  assert.match(authJs, /return "\/apps\/web\/dashboard\.html";/);
  assert.doesNotMatch(authJs, /return "\/apps\/web\/access\.html";/);
});

test("bare dashboard and reports are separate route states", () => {
  assert.match(dashboardHtml, /href="\/apps\/web\/dashboard\.html" data-page-link="home">Dashboard<\/a>/);
  assert.match(dashboardHtml, /href="\/apps\/web\/dashboard\.html#reports" data-page-link="reports">Reports<\/a>/);
  assert.match(dashboardHtml, /data-dashboard-page="home"/);
  assert.match(dashboardHtml, /data-dashboard-page="reports"/);
  assert.match(dashboardJs, /window\.location\.hash \|\| "#home"/);
  assert.match(dashboardJs, /supported\.has\(page\) \? page : "home"/);
});

test("Reports-labelled navigation uses the explicit reports route", () => {
  assert.deepEqual(anchorDestinationsStartingWith(homeHtml, "Reports"), [
    "/apps/web/dashboard.html#reports",
    "/apps/web/dashboard.html#reports",
  ]);
  assert.deepEqual(anchorDestinationsStartingWith(mobileAppHtml, "Reports"), [
    "/apps/web/dashboard.html#reports",
  ]);
  assert.equal(searchDestination(navJs, "Reports dashboard"), "./dashboard.html#reports");
});

test("legacy Access dashboard authority forwards to the canonical workspace", () => {
  assert.match(accessJs, /dashboard: "\/apps\/web\/dashboard\.html"/);
  assert.match(accessJs, /window\.location\.replace\(legacyAccessDestinations\[legacyAccessTab\]\)/);
  assert.match(accessHtml, /href="\/apps\/web\/dashboard\.html">My Workspace<\/a>/);
  assert.doesNotMatch(accessHtml, /data-tab="dashboard"/);
  assert.doesNotMatch(accessHtml, /data-pane="dashboard"/);
});

test("onboarding, AI, and document contextual routes retain their approved destinations", () => {
  assert.match(onboardingHtml, /href="\/apps\/web\/dashboard\.html">Go to Dashboard<\/a>/);
  assert.match(dashboardHtml, /href="\/apps\/web\/dashboard\.html#ai-agent" data-page-link="ai-agent">AI Agent<\/a>/);
  assert.match(invoiceHtml, /isPoFlow \? "\/apps\/web\/dashboard\.html#purchase-orders" : "\/apps\/web\/dashboard\.html#invoices"/);
});
