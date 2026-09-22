import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getProfileSetupState } from "../apps/web/profile-setup.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const auth = read("apps/web/auth.js");
const home = read("apps/web/index.html");
const carousel = read("apps/web/home-carousel.js");
const dashboard = read("apps/web/dashboard.html");
const dashboardJs = read("apps/web/dashboard.js");
const styles = read("apps/web/home-redesign.css");

test("normal authentication lands in Workspace while explicit authorized Admin routes remain", () => {
  const destinationBody = auth.match(/function postAuthDestination[\s\S]*?\n}/)?.[0] || "";
  assert.match(destinationBody, /requestedNext === "admin-gateway" && admin/);
  assert.match(destinationBody, /requestedNext === "admin" && admin/);
  assert.match(destinationBody, /return "\/apps\/web\/dashboard\.html"/);
  assert.doesNotMatch(destinationBody, /if \(admin\) return "\/apps\/web\/admin\.html"/);
  assert.match(dashboard, /id="profileAdminLink" href="\/apps\/web\/admin\.html" hidden/);
});

test("required profile data, rather than record existence, determines setup guidance", () => {
  const completeUser = { name: "Jess Kurian", email: "jess@example.com", phone: "9876543210" };
  const completeCompany = { name: "EazInvoice", businessType: "Software", entityType: "company" };

  assert.equal(getProfileSetupState(completeUser, [completeCompany]).needsSetup, false);
  assert.deepEqual(getProfileSetupState({ ...completeUser, phone: "" }, [completeCompany]).accountMissing, ["phone"]);
  assert.equal(getProfileSetupState(completeUser, [{ name: "Existing row" }]).businessComplete, false);
  assert.deepEqual(getProfileSetupState(completeUser, [{ name: "Existing row" }]).businessMissing, ["businessType", "entityType"]);
  assert.equal(getProfileSetupState(completeUser, [{ name: "Active row" }, completeCompany]).businessComplete, false);
  assert.equal(getProfileSetupState(completeUser, []).destination, "/apps/web/access.html?tab=company");
});

test("dashboard presents a non-blocking accessible setup dialog using existing My Account sections", () => {
  assert.match(dashboard, /<dialog id="profileSetupDialog"/);
  assert.match(dashboard, /data-profile-status="account"/);
  assert.match(dashboard, /data-profile-status="business"/);
  assert.match(dashboard, /Continue to Workspace/);
  assert.match(dashboardJs, /getProfileSetupState\(currentUser, dashboardCompanies\)/);
  assert.match(dashboardJs, /showProfileSetupDialog/);
});

test("Stage 2A keeps exactly four slides and visual selectors", () => {
  assert.equal((home.match(/\bdata-carousel-slide\b/g) || []).length, 4);
  assert.equal((home.match(/\bdata-carousel-select="/g) || []).length, 4);
  assert.equal((home.match(/class="selector-visual"/g) || []).length, 4);
  assert.doesNotMatch(home, /class="selector-icon"[^>]*>0[1-4]</);
});

test("carousel uses four accessible dots and edge controls without visible position copy", () => {
  assert.equal((home.match(/\bdata-carousel-dot="/g) || []).length, 4);
  assert.match(home, /carousel-arrow--previous[\s\S]*aria-label="Previous product highlight"/);
  assert.match(home, /carousel-arrow--next[\s\S]*aria-label="Next product highlight"/);
  assert.match(home, /class="visually-hidden" data-carousel-status/);
  assert.doesNotMatch(home, /class="carousel-status"/);
  assert.match(carousel, /dots\.forEach/);
  assert.match(styles, /\.carousel-arrow--previous/);
  assert.match(styles, /\.carousel-arrow--next/);
});

test("approved slide and selector artwork remains local", () => {
  for (const asset of [
    "home-slider-po-wo.png", "home-slider-ai-agent.png", "home-slider-payments.png",
    "home-selector-workspace.png", "home-selector-po-wo.png", "home-selector-ai-agent.png", "home-selector-payments.png",
  ]) assert.ok(home.includes(asset), `missing ${asset}`);
  assert.doesNotMatch(home, /class="capability-strip"/);
  assert.doesNotMatch(home, /<(?:img|source)\b[^>]+(?:src|srcset)="https?:\/\//i);
  assert.match(styles, /\.landing-page \.landing-header \.header-full-logo \{\s+width: 300px;\s+height: auto;\s+transform: translate\(-18px, -31px\)/);
});
