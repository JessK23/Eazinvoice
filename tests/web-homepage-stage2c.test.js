import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const home = read("apps/web/index.html");
const homeJs = read("apps/web/home.js");
const styles = read("apps/web/home-redesign.css");

test("public homepage no longer renders a duplicate logged-in workspace or pricing block", () => {
  assert.doesNotMatch(home, /loggedInHomePanel|logged-feature-grid|logged-plan-grid/);
  assert.doesNotMatch(homeJs, /loggedInHomePanel|loggedInHomeName|loggedInHomeMeta/);
  assert.equal((home.match(/class="home-section pricing-section"/g) || []).length, 1);
  assert.doesNotMatch(home, /Paid checkout must be live-verified before broad paid advertising/);
});

test("workflow is a five-step semantic progression", () => {
  assert.equal((home.match(/class="journey-step journey-step--/g) || []).length, 5);
  for (const name of ["Create", "Send / Issue", "Track", "Get Paid", "Review / Insight"]) {
    assert.match(home, new RegExp(`<strong>${name.replace("/", "\\/")}<\\/strong>`));
  }
  assert.match(styles, /workflow-track::before[\s\S]*linear-gradient/);
  assert.match(styles, /journey-icon svg/);
});

test("five product stories use rich local UI previews and canonical destinations", () => {
  for (const id of ["feature-invoicing", "feature-purchase-orders", "feature-payments", "feature-reports", "feature-ai"]) {
    assert.match(home, new RegExp(`id="${id}"`));
  }
  assert.match(home, /href="\/apps\/web\/dashboard\.html#invoices">Open Invoice Workspace/);
  assert.match(home, /href="\/apps\/web\/dashboard\.html#purchase-orders">Open Purchase Orders/);
  assert.match(home, /href="\/apps\/web\/dashboard\.html#reports">Review Receivables/);
  assert.match(home, /href="\/apps\/web\/dashboard\.html#reports">Open Business Reports/);
  assert.match(home, /href="\/apps\/web\/dashboard\.html#ai-agent">Open AI Agent/);
  assert.match(home, /No record has been created yet/);
  assert.match(home, /Human review stays in control/);
});

test("lower homepage follows the approved audience, device, trust, resource, and CTA journey", () => {
  assert.equal((home.match(/class="audience-card audience-card--/g) || []).length, 6);
  assert.match(home, /class="desktop-frame"/);
  assert.match(home, /class="phone-frame"/);
  assert.match(home, /Connected business records/);
  assert.equal((home.match(/class="trust-item trust-item--/g) || []).length, 4);
  assert.equal((home.match(/class="resource-icon"/g) || []).length, 3);
  assert.match(home, /Manage your money\. Grow your business\./);
});

test("Stage 2C keeps carousel artwork and selectors untouched", () => {
  assert.equal((home.match(/\bdata-carousel-slide\b/g) || []).length, 4);
  assert.equal((home.match(/\bdata-carousel-select="/g) || []).length, 4);
  for (const asset of [
    "home-slider-po-wo.png", "home-slider-ai-agent.png", "home-slider-payments.png",
    "home-selector-workspace.png", "home-selector-po-wo.png", "home-selector-ai-agent.png", "home-selector-payments.png",
  ]) assert.ok(home.includes(asset), `missing ${asset}`);
  assert.match(styles, /url\("\.\/assets\/home-hero-v2\.png"\)/);
});

test("Stage 2C uses semantic colour and responsive presentation contracts", () => {
  for (const token of ["journey-step--create", "journey-step--paid", "metric-overdue", "story-link--indigo", "trust-section"]) {
    assert.ok(styles.includes(token), `missing style contract ${token}`);
  }
  assert.match(styles, /@media \(max-width: 430px\)[\s\S]*\.audience-list \{ grid-template-columns: 1fr;/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.story-link/);
});
