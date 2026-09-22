import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../apps/web/design-system-v1.css", import.meta.url), "utf8");
const home = readFileSync(new URL("../apps/web/index.html", import.meta.url), "utf8");

test("Design System v1 exposes approved semantic foundations", () => {
  for (const token of [
    "--eaz-color-navy", "--eaz-color-gold", "--eaz-color-green", "--eaz-color-blue",
    "--eaz-color-indigo", "--eaz-color-amber", "--eaz-color-red", "--eaz-space-4",
    "--eaz-radius-card", "--eaz-shadow-1", "--eaz-duration-fast", "--eaz-focus-ring",
  ]) assert.ok(css.includes(token), `missing ${token}`);
});

test("component foundations cover operations, finance, forms, feedback and overlays", () => {
  for (const selector of [
    ".eaz-button--primary", ".eaz-button--brand", ".eaz-button--danger", ".eaz-button--financial",
    ".eaz-card--metric", ".eaz-card--ai", ".eaz-metric__value", ".eaz-status--draft",
    ".eaz-status--finalized", ".eaz-status--paid", ".eaz-status--overdue", ".eaz-field__control",
    ".eaz-table-tools", ".eaz-pagination", ".eaz-nav--workspace", ".eaz-empty", ".eaz-icon",
    ".eaz-skeleton", ".eaz-notice--error", ".eaz-modal", ".eaz-drawer", ".eaz-logo--header",
  ]) assert.ok(css.includes(selector), `missing ${selector}`);
});

test("semantic colors and accessibility contracts remain explicit", () => {
  assert.match(css, /\.eaz-status--paid,[\s\S]*?var\(--eaz-color-green\)/);
  assert.match(css, /\.eaz-status--overdue,[\s\S]*?var\(--eaz-color-red\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /--eaz-touch-target: 44px/);
});

test("Stage 2 adopts the Stage 1 foundation on the public homepage", () => {
  assert.equal((home.match(/design-system-v1\.css/g) || []).length, 1);
});
