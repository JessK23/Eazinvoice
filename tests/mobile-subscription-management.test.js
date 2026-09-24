import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mobileScript = readFileSync(new URL("../apps/mobile/app.js", import.meta.url), "utf8");

test("mobile manage subscription renders human-readable status and plan catalog", () => {
  assert.match(mobileScript, /function subscriptionStatusLabel\(/);
  assert.match(mobileScript, /function subscriptionCatalog\(/);
  assert.match(mobileScript, /state\.accountPlan\?\.catalog/);
  assert.doesNotMatch(mobileScript, /String\(state\.accountPlan\?\.status \|\| "active"\)/);
  assert.match(mobileScript, /<span>Status<\/span><strong>\$\{escapeHtml\(activeStatus\)\}<\/strong>/);
  assert.match(mobileScript, /subscription-plan-list/);
  assert.match(mobileScript, /Upgrade to \$\{label\}/);
  assert.match(mobileScript, /Open Subscription Management/);
  assert.doesNotMatch(mobileScript, /data-action="set-plan"|local-only plan switch|fake upgrade/i);
});
