import assert from "node:assert/strict";
import test from "node:test";
import {
  REPORTING_AUTHORITIES,
  REPORTING_SOURCES,
  describeReportingAuthority,
  getReportFamilyAuthority,
} from "../apps/api/src/reporting-authority.js";

const env = (overrides = {}) => ({ NODE_ENV: "test", ...overrides });

test("reporting authority enumerates every supported report family", () => {
  const contract = describeReportingAuthority({}, env());
  for (const family of [
    "reportsSummary", "profitLoss", "trialBalance", "generalLedger", "arAgeing", "apAgeing",
    "sales", "purchases", "gst", "tds", "bankReconciliation", "commandCenter",
    "accountingSummary", "complianceSummary",
  ]) {
    assert.ok(contract.families[family]);
    assert.ok(contract.families[family].currentAuthority);
    assert.ok(contract.families[family].drilldownAuthority);
  }
});

test("runtime-selected reporting is explicit and preserves runtime compatibility", () => {
  const contract = describeReportingAuthority({ reportsSource: "runtime" }, env({ DATABASE_URL: "postgres://hidden" }));
  assert.equal(contract.selectedSource, REPORTING_SOURCES.RUNTIME);
  assert.equal(contract.fallbackPolicy, "runtime-compatibility");
  assert.equal(contract.families.profitLoss.currentSource, REPORTING_SOURCES.RUNTIME);
  assert.equal(contract.families.profitLoss.fallbackPolicy, "runtime-compatibility");
  assert.equal(contract.families.reportsSummary.currentSource, REPORTING_SOURCES.UNAVAILABLE);
  assert.equal(contract.families.reportsSummary.fallbackPolicy, "none");
  assert.equal(contract.families.reportsSummary.availability.state, "unavailable");
  assert.doesNotMatch(contract.families.reportsSummary.compatibilityBehavior, /runtime report summary/i);
});

test("PostgreSQL-selected reporting is explicit and fail-closed", () => {
  const contract = describeReportingAuthority({ reportsSource: "postgres" }, env());
  assert.equal(contract.selectedSource, REPORTING_SOURCES.POSTGRES);
  assert.equal(contract.fallbackPolicy, "fail-closed");
  assert.equal(contract.families.reportsSummary.currentSource, REPORTING_SOURCES.POSTGRES);
  assert.equal(contract.families.reportsSummary.fallbackPolicy, "fail-closed");
  assert.match(contract.families.reportsSummary.compatibilityBehavior, /never be substituted/i);
});

test("reporting remains distinct from accounting, compliance, banking and Command Center", () => {
  const contract = describeReportingAuthority({}, env());
  assert.equal(contract.reportingAuthority, REPORTING_AUTHORITIES.REPORTS);
  assert.equal(contract.families.profitLoss.currentAuthority, REPORTING_AUTHORITIES.ACCOUNTING);
  assert.equal(contract.families.gst.currentAuthority, REPORTING_AUTHORITIES.COMPLIANCE);
  assert.equal(contract.families.bankReconciliation.currentAuthority, REPORTING_AUTHORITIES.BANKING);
  assert.equal(contract.families.commandCenter.currentAuthority, REPORTING_AUTHORITIES.COMMAND_CENTER);
  assert.match(contract.accountingAuthority, /ledger/i);
});

test("accounting summary is PostgreSQL-backed when configured and unavailable otherwise", () => {
  const configured = describeReportingAuthority({}, env({ DATABASE_URL: "postgres://hidden" }));
  assert.equal(configured.families.accountingSummary.currentSource, REPORTING_SOURCES.POSTGRES);
  assert.equal(configured.families.accountingSummary.availability.state, "unverified");

  const unavailable = describeReportingAuthority({}, env());
  assert.equal(unavailable.families.accountingSummary.currentSource, REPORTING_SOURCES.UNAVAILABLE);
  assert.equal(unavailable.families.accountingSummary.availability.state, "unavailable");
  assert.equal(unavailable.families.accountingSummary.fallbackPolicy, "none");
  assert.equal(unavailable.families.accountingSummary.availability.fallback, "none");
});

test("drilldowns point to underlying authorities and never make Reports the ledger", () => {
  const contract = describeReportingAuthority({}, env());
  assert.match(contract.families.sales.drilldownAuthority, /invoice/i);
  assert.match(contract.families.generalLedger.drilldownAuthority, /accounting/i);
  assert.doesNotMatch(contract.accountingAuthority, /reports/i);
  assert.equal(contract.diagnostics.tenantScopeRequired, true);
});

test("diagnostics are structural, deterministic and side-effect-free", () => {
  const contract = describeReportingAuthority({}, env({
    DATABASE_URL: "postgres://secret-user:secret-password@example.test/db",
    API_KEY_HASH_SECRET: "do-not-leak",
  }));
  const serialized = JSON.stringify(contract);
  assert.doesNotMatch(serialized, /secret-password|do-not-leak|postgres:\/\//);
  assert.equal(contract.diagnostics.secretsExcluded, true);
  assert.equal(contract.diagnostics.sideEffectFree, true);
  assert.equal(contract.diagnostics.sourceCutover, false);
  assert.equal(contract.diagnostics.migration, false);
});

test("unknown report families do not invent authority", () => {
  assert.equal(getReportFamilyAuthority("not-a-report", {}, env()), null);
});
