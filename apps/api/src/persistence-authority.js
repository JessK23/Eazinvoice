import { resolveStorageMode } from "./production-config.js";

export const PERSISTENCE_AUTHORITY_CONTRACT_VERSION = "3c-auth-01";

export const PERSISTENCE_MODES = Object.freeze({
  MEMORY: "memory",
  RUNTIME_JSON: "runtime-json",
  RUNTIME_POSTGRES_DUAL_WRITE: "runtime-postgres-dual-write",
  POSTGRES: "postgres",
  MIXED_TRANSITIONAL: "mixed-transitional",
});

export const AUTHORITY_SOURCES = Object.freeze({
  MEMORY: "memory",
  RUNTIME: "runtime",
  POSTGRES: "postgres",
  STORAGE_ADAPTER: "storage-adapter",
  DERIVED: "derived",
  DOCUMENT_SERVICE: "document-service",
});

export const FALLBACK_POLICIES = Object.freeze({
  NONE: "none",
  FAIL_CLOSED: "fail-closed",
  RUNTIME_COMPATIBILITY: "runtime-compatibility",
  RUNTIME_ON_UNAVAILABLE: "runtime-on-unavailable",
  MIRROR_ONLY: "mirror-only",
  NOT_APPLICABLE: "not-applicable",
});

export const VERIFICATION_STATES = Object.freeze({
  NOT_APPLICABLE: "not-applicable",
  UNAVAILABLE: "unavailable",
  UNVERIFIED: "unverified",
  CONFIGURED: "configured",
  SELECTED: "selected",
});

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const RUNTIME_REPORT_VALUES = new Set(["runtime", "json", "local", "false", "off"]);

const ENTITY_FAMILIES = Object.freeze([
  ["users-memberships-roles", "state"],
  ["business-company-profile", "state"],
  ["customers", "state"],
  ["vendors", "state"],
  ["invoices", "state"],
  ["purchase-orders-work-orders", "state"],
  ["payments-receipts", "state"],
  ["subscriptions", "subscription"],
  ["entitlements", "entitlement"],
  ["kyc-state", "state"],
  ["kyc-document-authority", "kyc-document"],
  ["document-registry-metadata", "state"],
  ["document-binary-storage", "binary"],
  ["accounting-ledger-posting", "accounting"],
  ["reports-reporting-projections", "report"],
  ["banking-reconciliation", "state"],
  ["compliance-tax-obligations", "state"],
  ["team-approvals-api-keys", "state"],
  ["audit-events-notifications", "state"],
]);

function text(value = "") {
  return String(value ?? "").trim();
}

function truthy(value) {
  return TRUE_VALUES.has(text(value).toLowerCase());
}

function normalizedOption(options, key, env, envKey) {
  const value = options[key] ?? env[envKey] ?? "";
  return text(value).toLowerCase();
}

function hasDatabaseUrl(env) {
  return Boolean(text(env.DATABASE_URL));
}

function resolveReportReadAuthority(options, env, postgresConfigured) {
  const requested = normalizedOption(options, "reportsSource", env, "EAZINVOICE_REPORTS_SOURCE");
  if (RUNTIME_REPORT_VALUES.has(requested)) return AUTHORITY_SOURCES.RUNTIME;
  if (requested === "postgres") return AUTHORITY_SOURCES.POSTGRES;
  // This mirrors server.js: an unspecified report source uses Postgres when it
  // is configured, while the query path may still fall back at runtime.
  return postgresConfigured ? AUTHORITY_SOURCES.POSTGRES : AUTHORITY_SOURCES.RUNTIME;
}

function resolveEntitlementReadAuthority(options, env) {
  return normalizedOption(options, "entitlementsSource", env, "EAZINVOICE_ENTITLEMENTS_SOURCE") === "postgres"
    ? AUTHORITY_SOURCES.POSTGRES
    : AUTHORITY_SOURCES.RUNTIME;
}

function baseStateAuthority(storageMode) {
  if (storageMode === "memory") return AUTHORITY_SOURCES.MEMORY;
  if (storageMode === "postgres") return AUTHORITY_SOURCES.POSTGRES;
  return AUTHORITY_SOURCES.RUNTIME;
}

function mirrorForState({ storageMode, dualWrite, coreTableSync }) {
  if (storageMode === "postgres") return null;
  if (dualWrite && coreTableSync) return "postgres-state-and-core-projection";
  if (dualWrite) return "postgres-state-document";
  if (coreTableSync) return "postgres-core-projection";
  return null;
}

function currentMode({ storageMode, postgresConfigured, dualWrite, coreTableSync, reportRead, entitlementRead }) {
  if (storageMode === "memory") return PERSISTENCE_MODES.MEMORY;
  if (storageMode === "postgres") return PERSISTENCE_MODES.POSTGRES;
  if (dualWrite) return PERSISTENCE_MODES.RUNTIME_POSTGRES_DUAL_WRITE;
  if (
    postgresConfigured
    && (coreTableSync || reportRead === AUTHORITY_SOURCES.POSTGRES || entitlementRead === AUTHORITY_SOURCES.POSTGRES)
  ) {
    return PERSISTENCE_MODES.MIXED_TRANSITIONAL;
  }
  return PERSISTENCE_MODES.RUNTIME_JSON;
}

function availability({ postgresConfigured, postgresSelected }) {
  if (!postgresConfigured) {
    return {
      state: VERIFICATION_STATES.UNAVAILABLE,
      configured: false,
      selected: postgresSelected,
      ready: false,
      reason: "DATABASE_URL is not configured; PostgreSQL availability was not claimed.",
    };
  }
  return {
    state: postgresSelected ? VERIFICATION_STATES.SELECTED : VERIFICATION_STATES.UNVERIFIED,
    configured: true,
    selected: postgresSelected,
    ready: false,
    reason: postgresSelected
      ? "PostgreSQL is selected by configuration; connectivity/schema readiness requires runtime verification."
      : "PostgreSQL is configured but is not the general runtime state authority in this mode.",
  };
}

function stateEntry({ name, storageMode, postgresConfigured, stateAuthority, mirror, fallbackPolicy, targetAuthority }) {
  return {
    entityFamily: name,
    currentMode: storageMode,
    readAuthority: stateAuthority,
    writeAuthority: stateAuthority,
    mirror,
    fallbackPolicy,
    targetAuthority,
    cutoverState: stateAuthority === AUTHORITY_SOURCES.POSTGRES ? "active-by-current-configuration" : "pending",
    postgresConfigured,
  };
}

function buildEntityMatrix({ storageMode, postgresConfigured, dualWrite, coreTableSync, reportRead, entitlementRead }) {
  const stateAuthority = baseStateAuthority(storageMode);
  const stateMirror = mirrorForState({ storageMode, dualWrite, coreTableSync });
  const stateFallback = storageMode === "postgres"
    ? FALLBACK_POLICIES.NONE
    : FALLBACK_POLICIES.RUNTIME_COMPATIBILITY;
  const matrix = {};

  for (const [name, kind] of ENTITY_FAMILIES) {
    if (kind === "binary") {
      matrix[name] = {
        entityFamily: name,
        currentMode: storageMode,
        readAuthority: AUTHORITY_SOURCES.STORAGE_ADAPTER,
        writeAuthority: AUTHORITY_SOURCES.STORAGE_ADAPTER,
        mirror: null,
        fallbackPolicy: FALLBACK_POLICIES.NONE,
        targetAuthority: AUTHORITY_SOURCES.STORAGE_ADAPTER,
        cutoverState: "provider-selected-separately",
        postgresConfigured,
      };
      continue;
    }
    if (kind === "kyc-document") {
      matrix[name] = {
        entityFamily: name,
        currentMode: storageMode,
        readAuthority: AUTHORITY_SOURCES.DOCUMENT_SERVICE,
        writeAuthority: AUTHORITY_SOURCES.DOCUMENT_SERVICE,
        mirror: "registry-metadata",
        fallbackPolicy: FALLBACK_POLICIES.NONE,
        targetAuthority: AUTHORITY_SOURCES.DOCUMENT_SERVICE,
        cutoverState: "active-for-registry-backed-records-legacy-only-compatibility",
        postgresConfigured,
      };
      continue;
    }
    if (kind === "report") {
      matrix[name] = {
        entityFamily: name,
        currentMode: storageMode,
        readAuthority: reportRead,
        writeAuthority: AUTHORITY_SOURCES.DERIVED,
        mirror: reportRead === AUTHORITY_SOURCES.POSTGRES || coreTableSync ? "postgres-report-projection" : null,
        fallbackPolicy: reportRead === AUTHORITY_SOURCES.POSTGRES
          ? FALLBACK_POLICIES.FAIL_CLOSED
          : FALLBACK_POLICIES.RUNTIME_COMPATIBILITY,
        targetAuthority: AUTHORITY_SOURCES.POSTGRES,
        cutoverState: reportRead === AUTHORITY_SOURCES.POSTGRES ? "selected-read-fail-closed" : "pending",
        postgresConfigured,
      };
      continue;
    }
    if (kind === "entitlement") {
      matrix[name] = {
        entityFamily: name,
        currentMode: storageMode,
        readAuthority: entitlementRead,
        // server.js keeps subscription creation/payment activation and feature
        // gates on the runtime path even when entitlement reads are enabled.
        writeAuthority: AUTHORITY_SOURCES.RUNTIME,
        mirror: entitlementRead === AUTHORITY_SOURCES.POSTGRES || coreTableSync ? "postgres-entitlement-projection" : null,
        fallbackPolicy: entitlementRead === AUTHORITY_SOURCES.POSTGRES
          ? FALLBACK_POLICIES.RUNTIME_ON_UNAVAILABLE
          : FALLBACK_POLICIES.RUNTIME_COMPATIBILITY,
        targetAuthority: AUTHORITY_SOURCES.POSTGRES,
        cutoverState: entitlementRead === AUTHORITY_SOURCES.POSTGRES ? "selected-read-with-runtime-fallback" : "pending",
        postgresConfigured,
      };
      continue;
    }
    if (kind === "subscription") {
      matrix[name] = stateEntry({
        name,
        storageMode,
        postgresConfigured,
        stateAuthority,
        mirror: stateMirror || (coreTableSync ? "postgres-subscription-projection" : null),
        fallbackPolicy: stateFallback,
        targetAuthority: AUTHORITY_SOURCES.POSTGRES,
      });
      continue;
    }
    matrix[name] = stateEntry({
      name,
      storageMode,
      postgresConfigured,
      stateAuthority,
      mirror: stateMirror,
      fallbackPolicy: stateFallback,
      targetAuthority: AUTHORITY_SOURCES.POSTGRES,
    });
  }

  return matrix;
}

/**
 * Describe current persistence authority without connecting to a database or
 * changing any active source. `targetAuthority` is intentionally separate from
 * current read/write fields so a target cannot silently become active.
 */
export function describePersistenceAuthority(options = {}, env = process.env) {
  const storageMode = resolveStorageMode(options, env);
  const postgresConfigured = hasDatabaseUrl(env);
  const postgresSelected = storageMode === "postgres";
  const dualWrite = truthy(options.postgresDualWrite ?? env.EAZINVOICE_POSTGRES_DUAL_WRITE);
  const coreTableSync = truthy(options.coreTableSync ?? env.EAZINVOICE_CORE_TABLE_SYNC);
  const reportRead = resolveReportReadAuthority(options, env, postgresConfigured);
  const entitlementRead = resolveEntitlementReadAuthority(options, env);
  const mode = currentMode({
    storageMode,
    postgresConfigured,
    dualWrite,
    coreTableSync,
    reportRead,
    entitlementRead,
  });
  const postgres = availability({ postgresConfigured, postgresSelected });

  return {
    contractVersion: PERSISTENCE_AUTHORITY_CONTRACT_VERSION,
    currentMode: mode,
    configuredStorageMode: storageMode,
    targetAuthority: AUTHORITY_SOURCES.POSTGRES,
    targetCutoverState: "pending-separate-approved-cutover",
    flags: {
      postgresConfigured,
      postgresSelected,
      postgresDualWrite: dualWrite,
      coreTableSync,
      reportsSource: reportRead,
      entitlementsSource: entitlementRead,
    },
    postgres,
    entities: buildEntityMatrix({
      storageMode,
      postgresConfigured,
      dualWrite,
      coreTableSync,
      reportRead,
      entitlementRead,
    }),
  };
}

