import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  ACCOUNTING_AUTHORITY_MIGRATION,
  CANONICAL_SYSTEM_ACCOUNTS,
  chartFingerprint,
  classifyLegacyAccount,
} from "../apps/api/src/accounting-chart.js";

test("canonical chart contains clearing, Customer Advance, A/R, and split GST roles", () => {
  const byCode = new Map(CANONICAL_SYSTEM_ACCOUNTS.map((account) => [account.code, account]));
  assert.equal(byCode.get("1100").role, "accounts_receivable");
  assert.equal(byCode.get("1110").role, "bank_clearing");
  assert.equal(byCode.get("2110").role, "customer_advances");
  assert.equal(byCode.get("2201").role, "output_cgst");
  assert.equal(byCode.get("2211").role, "input_cgst");
  assert.ok(chartFingerprint().includes("1110:bank_clearing"));
  assert.equal(typeof ACCOUNTING_AUTHORITY_MIGRATION, "string");
});

test("legacy 1110 classification is deterministic and fail-closed for mixed evidence", () => {
  assert.equal(classifyLegacyAccount({ account: { accountCode: "1110" }, hasClearingUsage: true }).status, "auto_migrate");
  assert.equal(classifyLegacyAccount({ account: { accountCode: "1110" }, hasBankMapping: true }).status, "compatibility_map");
  assert.equal(classifyLegacyAccount({ account: { accountCode: "1110" }, hasBankMapping: true, hasClearingUsage: true }).status, "manual_review");
  assert.equal(classifyLegacyAccount({ account: { accountCode: "1110" }, duplicate: true }).status, "manual_review");
});

test("Customer Advance and A/R collisions fail closed", () => {
  assert.equal(classifyLegacyAccount({ account: { accountCode: "2110", accountType: "liability", normalBalance: "credit" } }).status, "no_op");
  assert.equal(classifyLegacyAccount({ account: { accountCode: "2110", accountType: "asset", normalBalance: "debit" } }).status, "manual_review");
  assert.equal(classifyLegacyAccount({ account: { accountCode: "1100", accountType: "asset", normalBalance: "debit" } }).status, "no_op");
  assert.equal(classifyLegacyAccount({ account: { accountCode: "1100", accountType: "liability", normalBalance: "credit" } }).status, "manual_review");
});

test("migration authority persists durable review/mapping surfaces and guards accounting callers", () => {
  const postgres = readFileSync(new URL("../apps/api/src/postgres-accounting.js", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../database/migrations/025_accounting_authority_alignment.sql", import.meta.url), "utf8");
  assert.match(postgres, /runAccountingAuthorityMigration/);
  assert.match(postgres, /eazinvoice_accounting_authority_mappings/);
  assert.match(postgres, /status = 'manual_review'/);
  assert.match(migration, /unique \(business_id, migration_version\)/i);
  assert.match(migration, /unique \(business_id, legacy_account_id, canonical_role\)/i);
});
