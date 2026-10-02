import {
  AUTHORITY_SOURCES,
  FALLBACK_POLICIES,
  VERIFICATION_STATES,
} from "./persistence-authority.js";

export const REPORTING_AUTHORITY_CONTRACT_VERSION = "3c-auth-03";

export const REPORTING_SOURCES = Object.freeze({
  RUNTIME: AUTHORITY_SOURCES.RUNTIME,
  POSTGRES: AUTHORITY_SOURCES.POSTGRES,
  UNAVAILABLE: "unavailable",
});

export const REPORTING_AUTHORITIES = Object.freeze({
  REPORTS: "reports",
  ACCOUNTING: "accounting",
  COMPLIANCE: "compliance",
  BANKING: "banking",
  COMMAND_CENTER: "command-center",
});

const RUNTIME_REPORT_VALUES = new Set(["runtime", "json", "local", "false", "off"]);

const REPORT_FAMILIES = Object.freeze({
  reportsSummary: {
    label: "Reports summary",
    sourceSelector: "EAZINVOICE_REPORTS_SOURCE / DATABASE_URL default",
    authority: REPORTING_AUTHORITIES.REPORTS,
    projectionRole: "PostgreSQL reporting projection when selected",
    drilldownAuthority: "underlying invoice, purchase, payment and accounting records",
    businessScope: "authenticated user and visible business IDs",
  },
  profitLoss: {
    label: "Profit & Loss",
    sourceSelector: "financial report route",
    authority: REPORTING_AUTHORITIES.ACCOUNTING,
    projectionRole: "runtime financial-reporting projection",
    drilldownAuthority: "accounting ledger and financial events",
    businessScope: "resolved business workspace",
  },
  trialBalance: {
    label: "Trial Balance",
    sourceSelector: "accounting report route",
    authority: REPORTING_AUTHORITIES.ACCOUNTING,
    projectionRole: "runtime financial-reporting projection",
    drilldownAuthority: "accounting ledger and journal entries",
    businessScope: "resolved business workspace",
  },
  generalLedger: {
    label: "General Ledger",
    sourceSelector: "accounting report route",
    authority: REPORTING_AUTHORITIES.ACCOUNTING,
    projectionRole: "runtime financial-reporting projection",
    drilldownAuthority: "accounting ledger and source events",
    businessScope: "resolved business workspace",
  },
  arAgeing: {
    label: "Accounts receivable ageing",
    sourceSelector: "financial report route",
    authority: REPORTING_AUTHORITIES.ACCOUNTING,
    projectionRole: "runtime receivables projection",
    drilldownAuthority: "invoice and customer authority",
    businessScope: "resolved business workspace",
  },
  apAgeing: {
    label: "Accounts payable ageing",
    sourceSelector: "financial report route",
    authority: REPORTING_AUTHORITIES.ACCOUNTING,
    projectionRole: "runtime payables projection",
    drilldownAuthority: "purchase order/vendor bill authority",
    businessScope: "resolved business workspace",
  },
  sales: {
    label: "Sales reporting",
    sourceSelector: "financial report route",
    authority: REPORTING_AUTHORITIES.REPORTS,
    projectionRole: "runtime sales projection",
    drilldownAuthority: "invoice and customer authority",
    businessScope: "resolved business workspace",
  },
  purchases: {
    label: "Purchase reporting",
    sourceSelector: "financial report route",
    authority: REPORTING_AUTHORITIES.REPORTS,
    projectionRole: "runtime purchase projection",
    drilldownAuthority: "purchase order, vendor bill and vendor authority",
    businessScope: "resolved business workspace",
  },
  gst: {
    label: "GST reporting",
    sourceSelector: "financial report route / accounting GST summary",
    authority: REPORTING_AUTHORITIES.COMPLIANCE,
    projectionRole: "runtime tax projection",
    drilldownAuthority: "accounting and tax-obligation authority",
    businessScope: "resolved business workspace",
  },
  tds: {
    label: "TDS reporting",
    sourceSelector: "financial report route",
    authority: REPORTING_AUTHORITIES.COMPLIANCE,
    projectionRole: "runtime tax projection",
    drilldownAuthority: "accounting and tax-obligation authority",
    businessScope: "resolved business workspace",
  },
  bankReconciliation: {
    label: "Bank/reconciliation reporting",
    sourceSelector: "financial report route / banking service",
    authority: REPORTING_AUTHORITIES.BANKING,
    projectionRole: "runtime reconciliation projection",
    drilldownAuthority: "bank account, statement line and match authority",
    businessScope: "resolved business workspace",
  },
  commandCenter: {
    label: "Command Center summary",
    sourceSelector: "dashboard summary composition",
    authority: REPORTING_AUTHORITIES.COMMAND_CENTER,
    projectionRole: "operational snapshot and alerts",
    drilldownAuthority: "underlying operational record authority",
    businessScope: "resolved business workspace",
  },
  accountingSummary: {
    label: "Accounting summary/views",
    sourceSelector: "DATABASE_URL / PostgreSQL accounting implementation",
    authority: REPORTING_AUTHORITIES.ACCOUNTING,
    projectionRole: "accounting read projection",
    drilldownAuthority: "ledger, journal and period authority",
    businessScope: "resolved business workspace",
  },
  complianceSummary: {
    label: "Compliance summary/views",
    sourceSelector: "compliance report routes",
    authority: REPORTING_AUTHORITIES.COMPLIANCE,
    projectionRole: "compliance read projection",
    drilldownAuthority: "compliance obligation and tax authority",
    businessScope: "resolved business workspace",
  },
});

function text(value = "") {
  return String(value ?? "").trim();
}

function selectedSource(options = {}, env = process.env) {
  const requested = text(options.reportsSource ?? env.EAZINVOICE_REPORTS_SOURCE).toLowerCase();
  if (RUNTIME_REPORT_VALUES.has(requested)) return REPORTING_SOURCES.RUNTIME;
  if (requested === REPORTING_SOURCES.POSTGRES) return REPORTING_SOURCES.POSTGRES;
  return text(options.databaseUrl ?? env.DATABASE_URL)
    ? REPORTING_SOURCES.POSTGRES
    : REPORTING_SOURCES.RUNTIME;
}

function availability(source, env) {
  const configured = Boolean(text(env.DATABASE_URL));
  if (source === REPORTING_SOURCES.POSTGRES) {
    return {
      state: configured ? VERIFICATION_STATES.UNVERIFIED : VERIFICATION_STATES.UNAVAILABLE,
      configured,
      selected: true,
      fallback: FALLBACK_POLICIES.FAIL_CLOSED,
      reason: configured
        ? "PostgreSQL reporting is selected; connectivity and projection readiness require runtime verification."
        : "PostgreSQL reporting is selected but DATABASE_URL is not configured.",
    };
  }
  return {
    state: VERIFICATION_STATES.CONFIGURED,
    configured,
    selected: false,
    fallback: FALLBACK_POLICIES.RUNTIME_COMPATIBILITY,
    reason: "Runtime reporting is the selected compatibility source for runtime-backed report families.",
  };
}

function familyEntry(key, definition, source, reportAvailability, env) {
  const postgresSummary = key === "reportsSummary";
  const postgresAccountingSummary = key === "accountingSummary";
  const accountingConfigured = Boolean(text(env.DATABASE_URL));
  const familySource = postgresSummary
    ? (source === REPORTING_SOURCES.POSTGRES ? REPORTING_SOURCES.POSTGRES : REPORTING_SOURCES.UNAVAILABLE)
    : postgresAccountingSummary
      ? (accountingConfigured ? REPORTING_SOURCES.POSTGRES : REPORTING_SOURCES.UNAVAILABLE)
      : REPORTING_SOURCES.RUNTIME;
  const fallback = postgresSummary && source === REPORTING_SOURCES.POSTGRES
    ? FALLBACK_POLICIES.FAIL_CLOSED
    : postgresSummary || postgresAccountingSummary
      ? FALLBACK_POLICIES.NONE
      : FALLBACK_POLICIES.RUNTIME_COMPATIBILITY;
  const familyAvailability = postgresSummary
    ? (source === REPORTING_SOURCES.POSTGRES
      ? reportAvailability
      : {
        state: VERIFICATION_STATES.UNAVAILABLE,
        configured: Boolean(text(env.DATABASE_URL)),
        selected: false,
        fallback: FALLBACK_POLICIES.NONE,
        reason: "Postgres dashboard reports are not enabled; this endpoint does not read runtime report summaries.",
      })
    : postgresAccountingSummary
      ? {
        state: accountingConfigured ? VERIFICATION_STATES.UNVERIFIED : VERIFICATION_STATES.UNAVAILABLE,
        configured: accountingConfigured,
        selected: accountingConfigured,
        fallback: FALLBACK_POLICIES.NONE,
        reason: accountingConfigured
          ? "PostgreSQL accounting is configured; connectivity and schema readiness require runtime verification."
          : "PostgreSQL accounting is not configured; the accounting summary endpoint is unavailable.",
      }
      : {
        state: VERIFICATION_STATES.CONFIGURED,
        configured: true,
        selected: false,
        fallback: FALLBACK_POLICIES.RUNTIME_COMPATIBILITY,
        reason: "Existing runtime reporting implementation is available subject to its existing business access checks.",
      };
  return {
    family: key,
    label: definition.label,
    currentSource: familySource,
    sourceSelector: definition.sourceSelector,
    currentAuthority: definition.authority,
    targetAuthority: REPORTING_AUTHORITIES.REPORTS,
    projectionRole: definition.projectionRole,
    businessScope: definition.businessScope,
    drilldownAuthority: definition.drilldownAuthority,
    fallbackPolicy: fallback,
    compatibilityBehavior: postgresSummary && source !== REPORTING_SOURCES.POSTGRES
      ? "Existing summary endpoint is unavailable; it does not read runtime reports and has no runtime fallback."
      : postgresAccountingSummary
        ? "Existing accounting summary is PostgreSQL-backed when configured and unavailable otherwise; it has no runtime fallback."
        : postgresSummary
      ? "PostgreSQL query/projection failure is explicit and fail-closed; runtime data must never be substituted."
        : "Existing runtime financial/reporting behavior is preserved. PostgreSQL selection does not silently reroute this family.",
    availability: familyAvailability,
  };
}

export function describeReportingAuthority(options = {}, env = process.env) {
  const source = selectedSource(options, env);
  const reportAvailability = availability(source, env);
  const families = Object.fromEntries(
    Object.entries(REPORT_FAMILIES).map(([key, definition]) => [key, familyEntry(key, definition, source, reportAvailability, env)]),
  );
  return {
    contractVersion: REPORTING_AUTHORITY_CONTRACT_VERSION,
    selectedSource: source,
    sourceSelector: "EAZINVOICE_REPORTS_SOURCE, then DATABASE_URL default",
    reportingAuthority: REPORTING_AUTHORITIES.REPORTS,
    reportingRole: "read/projection authority only",
    commandCenterRole: "operational snapshot, actions and alerts; not the analytical source of truth",
    accountingAuthority: "ledger, journals, periods, postings, reversals and financial events",
    complianceAuthority: "GST/TDS review, filing and compliance workflow state where implemented",
    bankingAuthority: "bank accounts, statement lines, reconciliation matches and banking mutations",
    fallbackPolicy: source === REPORTING_SOURCES.POSTGRES
      ? FALLBACK_POLICIES.FAIL_CLOSED
      : FALLBACK_POLICIES.RUNTIME_COMPATIBILITY,
    availability: reportAvailability,
    families,
    diagnostics: {
      secretsExcluded: true,
      sideEffectFree: true,
      sourceCutover: false,
      migration: false,
      tenantScopeRequired: true,
    },
  };
}

export function getReportFamilyAuthority(family, options = {}, env = process.env) {
  return describeReportingAuthority(options, env).families[family] || null;
}
