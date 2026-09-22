import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const home = read("apps/web/index.html");
const carousel = read("apps/web/home-carousel.js");
const styles = read("apps/web/home-redesign.css");

test("Stage 2 homepage has exactly four primary product slides and selectors", () => {
  assert.equal((home.match(/\bdata-carousel-slide\b/g) || []).length, 4);
  assert.equal((home.match(/\bdata-carousel-select="/g) || []).length, 4);
  for (const label of ["Workspace", "PO / WO", "AI Agent", "Payments"]) {
    assert.match(home, new RegExp(`<strong>${label.replace("/", "\\/")}<\\/strong>`));
  }
});

test("four banners use the approved product stories and canonical routes", () => {
  assert.match(home, /Run your business without spreadsheet chaos\./);
  assert.match(home, /Purchase\. Order\.[\s\S]*?Deliver\. Track\./);
  assert.match(home, /Your business\.[\s\S]*?Assisted by AI\./);
  assert.match(home, /Know what's paid\.[\s\S]*?Know what's due\./);
  assert.match(home, /href="\/apps\/web\/dashboard\.html">Open Workspace<\/a>/);
  assert.match(home, /href="\/apps\/web\/dashboard\.html#purchase-orders">Manage PO \/ WO<\/a>/);
  assert.match(home, /href="\/apps\/web\/dashboard\.html#ai-agent">Explore AI Agent<\/a>/);
  assert.match(home, /href="\/apps\/web\/dashboard\.html#report-invoices">View Receivables<\/a>/);
});

test("homepage preserves account and architecture destinations", () => {
  assert.match(home, /href="\/apps\/web\/access\.html">My Account<\/a>/);
  assert.match(home, /href="\/apps\/web\/dashboard\.html#reports">Reports<\/a>/);
  assert.doesNotMatch(home, /access\.html\?tab=(?:invoice|po|reports|ai|features|admin)/);
  assert.doesNotMatch(home, /access\.html#(?:invoice|po|reports|ai|features|admin)/);
});

test("homepage adopts Design System v1 and approved local brand assets", () => {
  assert.equal((home.match(/design-system-v1\.css/g) || []).length, 1);
  assert.match(home, /\.\/assets\/logo-header\.png/);
  assert.match(styles, /url\("\.\/assets\/home-hero-v2\.png"\)/);
  assert.doesNotMatch(home, /<(?:img|source)\b[^>]+(?:src|srcset)="https?:\/\//i);
});

test("carousel controls expose accessible names and interaction support", () => {
  assert.match(home, /aria-roledescription="carousel"/);
  assert.match(home, /aria-label="Previous product highlight"/);
  assert.match(home, /aria-label="Next product highlight"/);
  assert.match(home, /role="tablist"/);
  assert.match(home, /aria-live="polite"/);
  assert.equal((home.match(/\bdata-carousel-dot="/g) || []).length, 4);
  assert.match(carousel, /6000/);
  assert.match(carousel, /prefers-reduced-motion: reduce/);
  assert.match(carousel, /ArrowLeft/);
  assert.match(carousel, /ArrowRight/);
  assert.match(carousel, /pointerdown/);
  assert.match(carousel, /mouseenter/);
  assert.match(carousel, /focusin/);
});

test("homepage includes the approved workflow and lower-page sections without the duplicate capability strip", () => {
  assert.doesNotMatch(home, /class="capability-strip"/);
  for (const step of ["Create", "Send / Issue", "Track", "Get Paid", "Review / Insight"]) {
    assert.match(home, new RegExp(`<strong>${step.replace("/", "\\/")}<\\/strong>`));
  }
  assert.match(home, /Your business moves\. EazInvoice moves with you\./);
  assert.match(home, /Manage your money\. Grow your business\./);
  assert.match(home, /<footer class="site-footer">/);
});
