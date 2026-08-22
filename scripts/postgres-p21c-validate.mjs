import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { closePostgresPool } from "../apps/api/src/postgres.js";
import { saveStateToPostgres } from "../apps/api/src/postgres-state.js";
import { loadLocalEnv } from "./postgres-env.mjs";

const ROOT = process.cwd();
const SOURCE_DB = process.env.P21B_SOURCE_DB || "eazinvoice_p21b_test";
const RESTORE_DB = process.env.P21B_RESTORE_DB || "eazinvoice_p21b_restore";
const REQUIRED_SCHEMA = "023_transactional_financial_persistence";
const { Client } = pg;

loadLocalEnv(ROOT);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function databaseUrlFor(databaseName) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function runNodeScript(script, label) {
  const result = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed:\n${result.stderr || result.stdout}`);
  }
  return `${result.stdout || ""}${result.stderr || ""}`;
}

async function withClient(connectionString, callback) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

function p2State() {
  const now = "2026-04-01T00:00:00.000Z";
  return {
    users: [{ id: "user-a", email: "owner@example.test", name: "Owner A", createdAt: now }],
    businesses: [{ id: "biz-a", ownerUserId: "user-a", name: "Business A", createdAt: now }],
    companies: [],
    customers: [{ id: "cust-a", ownerUserId: "user-a", businessId: "biz-a", companyId: "biz-a", name: "Customer A", createdAt: now }],
    invoices: [{
      id: "inv-a",
      ownerUserId: "user-a",
      businessId: "biz-a",
      companyId: "biz-a",
      customerId: "cust-a",
      invoiceNumber: "INV-0001",
      invoiceDate: "2026-04-01",
      status: "issued",
      paymentStatus: "paid",
      subtotal: 1000,
      taxAmount: 180,
      total: 1180,
      paidAmount: 1180,
      balanceAmount: 0,
      currency: "INR",
      items: [{ description: "Service", quantity: 1, rate: 1000, gstRate: 18, lineTotal: 1000 }],
      createdAt: now,
    }],
    payments: [{
      id: "pay-a",
      ownerUserId: "user-a",
      businessId: "biz-a",
      invoiceId: "inv-a",
      amount: 1180,
      currency: "INR",
      mode: "bank",
      reference: "PAY-A",
      paymentDate: "2026-04-02",
      status: "recorded",
      idempotencyKey: "payment-pay-a",
      createdAt: now,
    }],
    vendorBills: [{
      id: "vbill-a",
      ownerUserId: "user-a",
      businessId: "biz-a",
      vendorId: "vendor-a",
      vendorBillNumber: "VB-0001",
      internalBillNumber: "BILL-0001",
      billDate: "2026-04-03",
      status: "posted",
      paymentStatus: "paid",
      currency: "INR",
      subtotal: 500,
      taxAmount: 90,
      total: 590,
      paidAmount: 590,
      balanceAmount: 0,
      items: [{ description: "Expense", quantity: 1, rate: 500, gstRate: 18, lineTotal: 500 }],
      createdAt: now,
    }],
    financialEvents: [
      { id: "fe-inv-a", businessId: "biz-a", eventType: "invoice_issued", sourceType: "invoice", sourceId: "inv-a", postingStatus: "posted", idempotencyKey: "invoice-inv-a", journalId: "jour-inv-a", createdAt: now },
      { id: "fe-pay-a", businessId: "biz-a", eventType: "payment_captured", sourceType: "payment", sourceId: "pay-a", postingStatus: "posted", idempotencyKey: "payment-pay-a", journalId: "jour-pay-a", createdAt: now },
    ],
    ledgerAccounts: [
      { id: "acct-ar", ownerUserId: "user-a", businessId: "biz-a", companyId: "biz-a", accountCode: "1100", accountName: "Accounts Receivable", accountType: "asset", normalBalance: "debit", createdAt: now },
      { id: "acct-rev", ownerUserId: "user-a", businessId: "biz-a", companyId: "biz-a", accountCode: "4000", accountName: "Revenue", accountType: "income", normalBalance: "credit", createdAt: now },
      { id: "acct-bank", ownerUserId: "user-a", businessId: "biz-a", companyId: "biz-a", accountCode: "1000", accountName: "Bank", accountType: "asset", normalBalance: "debit", createdAt: now },
    ],
    accountingJournals: [
      { id: "jour-inv-a", ownerUserId: "user-a", businessId: "biz-a", companyId: "biz-a", journalNumber: "AUTO-0001", journalDate: "2026-04-01", status: "posted", currency: "INR", totalDebit: 1180, totalCredit: 1180, financialEventId: "fe-inv-a", sourceType: "invoice", sourceId: "inv-a", automatic: true, immutable: true, createdAt: now },
      { id: "jour-pay-a", ownerUserId: "user-a", businessId: "biz-a", companyId: "biz-a", journalNumber: "AUTO-0002", journalDate: "2026-04-02", status: "posted", currency: "INR", totalDebit: 1180, totalCredit: 1180, financialEventId: "fe-pay-a", sourceType: "payment", sourceId: "pay-a", automatic: true, immutable: true, createdAt: now },
    ],
    accountingJournalLines: [
      { id: "jl-inv-dr", journalId: "jour-inv-a", ownerUserId: "user-a", businessId: "biz-a", companyId: "biz-a", accountId: "acct-ar", lineIndex: 1, debit: 1180, credit: 0, currency: "INR", createdAt: now },
      { id: "jl-inv-cr", journalId: "jour-inv-a", ownerUserId: "user-a", businessId: "biz-a", companyId: "biz-a", accountId: "acct-rev", lineIndex: 2, debit: 0, credit: 1180, currency: "INR", createdAt: now },
      { id: "jl-pay-dr", journalId: "jour-pay-a", ownerUserId: "user-a", businessId: "biz-a", companyId: "biz-a", accountId: "acct-bank", lineIndex: 1, debit: 1180, credit: 0, currency: "INR", createdAt: now },
      { id: "jl-pay-cr", journalId: "jour-pay-a", ownerUserId: "user-a", businessId: "biz-a", companyId: "biz-a", accountId: "acct-ar", lineIndex: 2, debit: 0, credit: 1180, currency: "INR", createdAt: now },
    ],
    creditNotes: [],
    vendorCredits: [],
    paymentReversals: [],
    vendorPaymentReversals: [],
    customerRefunds: [],
    vendorRefunds: [],
    bankAccounts: [],
    bankStatementImportBatches: [],
    bankStatementLines: [],
    bankReconciliationMatches: [],
    taxRegistrations: [],
    transactionComplianceSnapshots: [],
    complianceObligations: [],
    tdsTransactions: [],
    accountingPeriods: [],
    accountingPeriodHistory: [],
    openingBalanceSets: [],
    openingBalanceDetails: [],
    financialYears: [],
    yearEndCloses: [],
    yearEndCloseHistory: [],
    purchaseOrders: [],
    subscriptions: [],
    businessSettings: [],
    teamMembers: [],
    approvalRequests: [],
    apiKeys: [],
    businessAuditEvents: [],
    counters: {},
  };
}

async function countSummary(client) {
  const tables = [
    "eazinvoice_state_documents",
    "eazinvoice_invoices",
    "eazinvoice_payments",
    "eazinvoice_vendor_bills",
    "eazinvoice_financial_events",
    "eazinvoice_journal_entries",
    "eazinvoice_journal_lines",
  ];
  const summary = {};
  for (const table of tables) {
    const result = await client.query(`select count(*)::int as count from ${table}`);
    summary[table] = result.rows[0].count;
  }
  return summary;
}

async function validateTransactionalAuthority() {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrlFor(SOURCE_DB);
  process.env.NODE_ENV = "test";
  await closePostgresPool();
  try {
    const before = await withClient(process.env.DATABASE_URL, countSummary);
    await saveStateToPostgres(p2State(), { source: "p2-1c-validator", sourcePath: "disposable" });
    await closePostgresPool();
    const after = await withClient(process.env.DATABASE_URL, countSummary);
    assert(after.eazinvoice_state_documents === 1, "State document was not persisted.");
    assert(after.eazinvoice_invoices === 1, "Invoice normalized row was not persisted.");
    assert(after.eazinvoice_payments === 1, "Payment normalized row was not persisted.");
    assert(after.eazinvoice_vendor_bills === 1, "Vendor bill normalized row was not persisted.");
    assert(after.eazinvoice_financial_events === 2, "Financial events were not persisted.");
    assert(after.eazinvoice_journal_entries === 2, "Journal entries were not persisted.");
    assert(after.eazinvoice_journal_lines === 4, "Journal lines were not persisted.");

    let failed = false;
    try {
      await saveStateToPostgres({ ...p2State(), invoices: [] }, {
        source: "p2-1c-validator",
        sourcePath: "disposable",
        testFailurePoint: "after_state_document",
      });
    } catch {
      failed = true;
    }
    assert(failed, "Failure injection did not trigger rollback.");
    await closePostgresPool();
    const rollback = await withClient(process.env.DATABASE_URL, countSummary);
    assert(JSON.stringify(after) === JSON.stringify(rollback), "Injected failure changed persisted financial state.");

    return { before, after, rollback };
  } finally {
    await closePostgresPool();
    process.env.DATABASE_URL = previousDatabaseUrl;
  }
}

async function validateConstraints() {
  return withClient(databaseUrlFor(SOURCE_DB), async (client) => {
    let duplicateInvoiceRejected = false;
    let duplicatePaymentIdempotencyRejected = false;
    let journalLineDebitCreditRejected = false;
    try {
      await client.query("insert into eazinvoice_invoices (id, business_id, invoice_number, record) values ('dup-inv', 'biz-a', 'INV-0001', '{}'::jsonb)");
    } catch {
      duplicateInvoiceRejected = true;
    }
    try {
      await client.query("insert into eazinvoice_payments (id, business_id, idempotency_key, amount, record) values ('dup-pay', 'biz-a', 'payment-pay-a', 1, '{}'::jsonb)");
    } catch {
      duplicatePaymentIdempotencyRejected = true;
    }
    try {
      await client.query("insert into eazinvoice_journal_lines (id, journal_id, owner_user_id, account_id, debit, credit, record) values ('bad-line', 'jour-inv-a', 'user-a', 'acct-ar', 1, 1, '{}'::jsonb)");
    } catch {
      journalLineDebitCreditRejected = true;
    }
    assert(duplicateInvoiceRejected, "Duplicate invoice number was not rejected.");
    assert(duplicatePaymentIdempotencyRejected, "Duplicate payment idempotency was not rejected.");
    assert(journalLineDebitCreditRejected, "Invalid debit/credit journal line was not rejected.");
    return { duplicateInvoiceRejected, duplicatePaymentIdempotencyRejected, journalLineDebitCreditRejected };
  });
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required.");
  const p21bOutput = runNodeScript(path.join("scripts", "postgres-p21b-validate.mjs"), "P2-1B base validator");
  const migration = await withClient(databaseUrlFor(SOURCE_DB), async (client) => {
    const result = await client.query("select migration_name from eazinvoice_migrations where migration_name = $1", [REQUIRED_SCHEMA]);
    return result.rows[0]?.migration_name || "";
  });
  assert(migration === REQUIRED_SCHEMA, `Required migration ${REQUIRED_SCHEMA} was not applied.`);
  const authority = await validateTransactionalAuthority();
  const constraints = await validateConstraints();
  console.log(JSON.stringify({
    baseValidator: "PASS",
    baseValidatorTail: p21bOutput.trim().split(/\r?\n/).slice(-1)[0],
    requiredSchema: migration,
    sourceDatabase: SOURCE_DB,
    restoreDatabase: RESTORE_DB,
    transactionalAuthority: authority,
    constraints,
  }, null, 2));
}

main().catch(async (error) => {
  await closePostgresPool().catch(() => undefined);
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
