import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTHORITY_SOURCES,
  FALLBACK_POLICIES,
  PERSISTENCE_MODES,
  VERIFICATION_STATES,
  describePersistenceAuthority,
} from "../apps/api/src/persistence-authority.js";

function authority(env = {}) {
  return describePersistenceAuthority({}, {
    NODE_ENV: "development",
    ...env,
  });
}

test("runtime compatibility mode keeps runtime state authoritative", () => {
  const result = authority({});
  assert.equal(result.currentMode, PERSISTENCE_MODES.RUNTIME_JSON);
  assert.equal(result.targetAuthority, AUTHORITY_SOURCES.POSTGRES);
  assert.equal(result.targetCutoverState, "pending-separate-approved-cutover");
  assert.equal(result.entities.invoices.readAuthority, AUTHORITY_SOURCES.RUNTIME);
  assert.equal(result.entities.invoices.writeAuthority, AUTHORITY_SOURCES.RUNTIME);
  assert.equal(result.entities.invoices.fallbackPolicy, FALLBACK_POLICIES.RUNTIME_COMPATIBILITY);
  assert.equal(result.postgres.state, VERIFICATION_STATES.UNAVAILABLE);
});

test("configured dual-write preserves runtime as primary and describes Postgres as a mirror", () => {
  const result = authority({
    DATABASE_URL: "postgres://user:password@example.test/eazinvoice",
    EAZINVOICE_POSTGRES_DUAL_WRITE: "true",
  });
  assert.equal(result.currentMode, PERSISTENCE_MODES.RUNTIME_POSTGRES_DUAL_WRITE);
  assert.equal(result.entities.customers.readAuthority, AUTHORITY_SOURCES.RUNTIME);
  assert.equal(result.entities.customers.writeAuthority, AUTHORITY_SOURCES.RUNTIME);
  assert.equal(result.entities.customers.mirror, "postgres-state-document");
  assert.equal(result.postgres.state, VERIFICATION_STATES.UNVERIFIED);
});

test("Postgres-selected mode reports selection without claiming runtime readiness", () => {
  const result = authority({
    EAZINVOICE_STORAGE: "postgres",
    DATABASE_URL: "postgres://user:password@example.test/eazinvoice",
  });
  assert.equal(result.currentMode, PERSISTENCE_MODES.POSTGRES);
  assert.equal(result.entities.invoices.readAuthority, AUTHORITY_SOURCES.POSTGRES);
  assert.equal(result.entities.invoices.writeAuthority, AUTHORITY_SOURCES.POSTGRES);
  assert.equal(result.entities.invoices.fallbackPolicy, FALLBACK_POLICIES.NONE);
  assert.equal(result.postgres.selected, true);
  assert.equal(result.postgres.ready, false);
  assert.equal(result.postgres.state, VERIFICATION_STATES.SELECTED);
});

test("report and entitlement source flags are interpreted independently", () => {
  const result = authority({
    DATABASE_URL: "postgres://user:password@example.test/eazinvoice",
    EAZINVOICE_REPORTS_SOURCE: "runtime",
    EAZINVOICE_ENTITLEMENTS_SOURCE: "postgres",
  });
  assert.equal(result.currentMode, PERSISTENCE_MODES.MIXED_TRANSITIONAL);
  assert.equal(result.entities["reports-reporting-projections"].readAuthority, AUTHORITY_SOURCES.RUNTIME);
  assert.equal(result.entities["reports-reporting-projections"].fallbackPolicy, FALLBACK_POLICIES.RUNTIME_COMPATIBILITY);
  assert.equal(result.entities.entitlements.readAuthority, AUTHORITY_SOURCES.POSTGRES);
  assert.equal(result.entities.entitlements.writeAuthority, AUTHORITY_SOURCES.RUNTIME);
  assert.equal(result.entities.entitlements.fallbackPolicy, FALLBACK_POLICIES.RUNTIME_ON_UNAVAILABLE);
});

test("Postgres-selected reports are fail-closed when Postgres is unavailable", () => {
  const result = authority({
    EAZINVOICE_REPORTS_SOURCE: "postgres",
  });
  assert.equal(result.entities["reports-reporting-projections"].readAuthority, AUTHORITY_SOURCES.POSTGRES);
  assert.equal(result.entities["reports-reporting-projections"].fallbackPolicy, FALLBACK_POLICIES.FAIL_CLOSED);
  assert.equal(result.entities["reports-reporting-projections"].cutoverState, "selected-read-fail-closed");
  assert.equal(result.postgres.configured, false);
  assert.equal(result.postgres.ready, false);
  assert.equal(result.postgres.state, VERIFICATION_STATES.UNAVAILABLE);
  assert.match(result.postgres.reason, /not configured/i);
});

test("target authority cannot activate a current source", () => {
  const result = describePersistenceAuthority({ targetAuthority: "postgres" }, {
    NODE_ENV: "development",
  });
  assert.equal(result.targetAuthority, AUTHORITY_SOURCES.POSTGRES);
  assert.equal(result.currentMode, PERSISTENCE_MODES.RUNTIME_JSON);
  assert.equal(result.entities.invoices.readAuthority, AUTHORITY_SOURCES.RUNTIME);
  assert.equal(result.entities.invoices.writeAuthority, AUTHORITY_SOURCES.RUNTIME);
});

test("diagnostic output is structural and does not echo secrets", () => {
  const result = authority({
    DATABASE_URL: "postgres://secret-user:super-secret-password@example.test/eazinvoice",
    API_KEY_HASH_SECRET: "do-not-leak",
    ADMIN_ACCESS_KEY: "also-do-not-leak",
  });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /super-secret-password|do-not-leak|also-do-not-leak/);
  assert.doesNotMatch(serialized, /postgres:\/\//);
  assert.ok(result.entities["users-memberships-roles"]);
  assert.ok(result.entities["document-binary-storage"]);
});

