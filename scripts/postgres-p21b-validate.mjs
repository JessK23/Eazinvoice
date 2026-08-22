import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { createServerAsync } from "../apps/api/src/server.js";
import { closePostgresPool, withPostgresTransaction } from "../apps/api/src/postgres.js";
import { loadLocalEnv } from "./postgres-env.mjs";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "database", "migrations");
const SOURCE_DB = process.env.P21B_SOURCE_DB || "eazinvoice_p21b_test";
const RESTORE_DB = process.env.P21B_RESTORE_DB || "eazinvoice_p21b_restore";
const RUNTIME_ROLE = process.env.P21B_RUNTIME_ROLE || "eazinvoice_p21b_runtime";
const BACKUP_FILE = path.join(ROOT, ".tmp", `${SOURCE_DB}.dump`);
const REQUIRED_SCHEMA = "023_transactional_financial_persistence";
const { Client } = pg;
let currentPhase = "startup";

loadLocalEnv(ROOT);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function quoteIdent(value) {
  assert(/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value), `Unsafe identifier: ${value}`);
  return `"${value.replace(/"/g, '""')}"`;
}

function databaseUrlFor(databaseName) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function adminUrl(databaseName = "postgres") {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function candidateToolPaths(tool) {
  return [
    process.env[`${tool.toUpperCase()}_PATH`],
    tool,
    `C:\\Program Files\\PostgreSQL\\18\\bin\\${tool}.exe`,
    `C:\\Program Files\\PostgreSQL\\17\\bin\\${tool}.exe`,
  ].filter(Boolean);
}

function findTool(tool) {
  for (const candidate of candidateToolPaths(tool)) {
    const result = spawnSync(candidate, ["--version"], {
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
    if (result.status === 0) {
      return {
        command: candidate,
        version: String(result.stdout || result.stderr || "").trim(),
      };
    }
  }
  throw new Error(`Could not find ${tool}. Set ${tool.toUpperCase()}_PATH if needed.`);
}

function runTool(tool, args, label) {
  const result = spawnSync(tool.command, args, {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${String(result.stderr || result.stdout || "").trim()}`);
  }
  return String(result.stdout || "").trim();
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

function migrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => path.join(MIGRATIONS_DIR, file));
}

function expectedMigrationNames() {
  return migrationFiles().map((file) => path.basename(file, ".sql"));
}

async function recreateDatabase(admin, databaseName) {
  const db = quoteIdent(databaseName);
  await admin.query(`
    select pg_terminate_backend(pid)
    from pg_stat_activity
    where datname = $1 and pid <> pg_backend_pid()
  `, [databaseName]);
  await admin.query(`drop database if exists ${db}`);
  await admin.query(`create database ${db}`);
}

async function applyMigrations(connectionString) {
  return withClient(connectionString, async (client) => {
    for (const file of migrationFiles()) {
      const sql = fs.readFileSync(file, "utf8");
      try {
        await client.query(sql);
      } catch (error) {
        throw new Error(`Migration ${path.basename(file)} failed: ${error.message}`);
      }
    }
    const result = await client.query("select migration_name from eazinvoice_migrations order by migration_name");
    return result.rows.map((row) => row.migration_name);
  });
}

async function ensureRuntimeRole(admin) {
  const exists = await admin.query("select 1 from pg_roles where rolname = $1", [RUNTIME_ROLE]);
  if (!exists.rowCount) await admin.query(`create role ${quoteIdent(RUNTIME_ROLE)} login password 'p21b_local_runtime_only'`);
  await admin.query(`alter role ${quoteIdent(RUNTIME_ROLE)} nosuperuser nocreatedb nocreaterole noinherit nobypassrls`);
}

async function grantRuntimeAccess(admin, databaseName) {
  const role = quoteIdent(RUNTIME_ROLE);
  await admin.query(`grant connect on database ${quoteIdent(databaseName)} to ${role}`);
  await withClient(databaseUrlFor(databaseName), async (client) => {
    await client.query(`grant usage on schema public to ${role}`);
    await client.query(`grant select, insert, update, delete on all tables in schema public to ${role}`);
    await client.query(`grant usage, select on all sequences in schema public to ${role}`);
  });
}

async function runtimeClient(databaseName) {
  const url = new URL(databaseUrlFor(databaseName));
  url.username = RUNTIME_ROLE;
  url.password = "p21b_local_runtime_only";
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  return client;
}

async function schemaInventory(connectionString) {
  return withClient(connectionString, async (client) => {
    const tables = await client.query(`
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_name like 'eazinvoice_%'
      order by table_name
    `);
    const rls = await client.query(`
      select relname, relrowsecurity, relforcerowsecurity
      from pg_class
      where relnamespace = 'public'::regnamespace
        and relkind = 'r'
        and relname like 'eazinvoice_%'
      order by relname
    `);
    return { tableCount: tables.rowCount, rls: rls.rows };
  });
}

async function seedTenantRows(connectionString) {
  await withClient(connectionString, async (client) => {
    await client.query("select set_config('app.rls_bypass', 'true', false)");
    await client.query(`
      insert into eazinvoice_businesses (id, owner_user_id, name, record)
      values
        ('biz-a', 'user-a', 'Business A', '{}'::jsonb),
        ('biz-b', 'user-b', 'Business B', '{}'::jsonb)
      on conflict (id) do nothing
    `);
    await client.query(`
      insert into eazinvoice_customers (id, owner_user_id, business_id, company_id, name, record)
      values
        ('cust-a', 'user-a', 'biz-a', 'biz-a', 'Customer A', '{}'::jsonb),
        ('cust-b', 'user-b', 'biz-b', 'biz-b', 'Customer B', '{}'::jsonb)
      on conflict (id) do nothing
    `);
    await client.query(`
      insert into eazinvoice_invoices (id, owner_user_id, business_id, company_id, customer_id, invoice_number, total, balance_amount, record)
      values
        ('inv-a', 'user-a', 'biz-a', 'biz-a', 'cust-a', 'A-001', 100, 100, '{}'::jsonb),
        ('inv-b', 'user-b', 'biz-b', 'biz-b', 'cust-b', 'B-001', 200, 200, '{}'::jsonb)
      on conflict (id) do nothing
    `);
    await client.query(`
      insert into eazinvoice_financial_events (id, business_id, event_type, source_type, source_id, event_timestamp, posting_status, idempotency_key, metadata)
      values
        ('fe-a', 'biz-a', 'invoice_issued', 'invoice', 'inv-a', '2026-04-01', 'posted', 'fe-a', '{"amount":100,"currency":"INR"}'::jsonb),
        ('fe-b', 'biz-b', 'invoice_issued', 'invoice', 'inv-b', '2026-04-01', 'posted', 'fe-b', '{"amount":200,"currency":"INR"}'::jsonb)
      on conflict (id) do nothing
    `);
    await client.query(`
      insert into eazinvoice_ledger_accounts (id, owner_user_id, business_id, company_id, account_code, account_name, account_type, normal_balance, record)
      values
        ('acct-a-ar', 'user-a', 'biz-a', 'biz-a', '1100', 'Accounts Receivable', 'asset', 'debit', '{}'::jsonb),
        ('acct-a-rev', 'user-a', 'biz-a', 'biz-a', '4000', 'Revenue', 'income', 'credit', '{}'::jsonb),
        ('acct-b-ar', 'user-b', 'biz-b', 'biz-b', '1100', 'Accounts Receivable', 'asset', 'debit', '{}'::jsonb),
        ('acct-b-rev', 'user-b', 'biz-b', 'biz-b', '4000', 'Revenue', 'income', 'credit', '{}'::jsonb)
      on conflict (id) do nothing
    `);
    await client.query(`
      insert into eazinvoice_journal_entries (id, business_id, journal_number, journal_date, status, financial_event_id, record)
      values
        ('je-a', 'biz-a', 'JE-A', '2026-04-01', 'posted', 'fe-a', '{}'::jsonb),
        ('je-b', 'biz-b', 'JE-B', '2026-04-01', 'posted', 'fe-b', '{}'::jsonb)
      on conflict (id) do nothing
    `);
    await client.query(`
      insert into eazinvoice_journal_lines (id, business_id, journal_id, owner_user_id, company_id, account_id, line_index, debit, credit, record)
      values
        ('jl-a-dr', 'biz-a', 'je-a', 'user-a', 'biz-a', 'acct-a-ar', 1, 100, 0, '{}'::jsonb),
        ('jl-a-cr', 'biz-a', 'je-a', 'user-a', 'biz-a', 'acct-a-rev', 2, 0, 100, '{}'::jsonb),
        ('jl-b-dr', 'biz-b', 'je-b', 'user-b', 'biz-b', 'acct-b-ar', 1, 200, 0, '{}'::jsonb),
        ('jl-b-cr', 'biz-b', 'je-b', 'user-b', 'biz-b', 'acct-b-rev', 2, 0, 200, '{}'::jsonb)
      on conflict (id) do nothing
    `);
  });
}

async function rlsChecks(databaseName) {
  const client = await runtimeClient(databaseName);
  try {
    await client.query("begin");
    await client.query("select set_config('app.business_id', 'biz-a', true)");
    const aCustomers = await client.query("select id from eazinvoice_customers order by id");
    const aInvoices = await client.query("select id from eazinvoice_invoices order by id");
    const aJournals = await client.query("select id from eazinvoice_journal_entries order by id");
    await client.query("commit");

    await client.query("begin");
    await client.query("select set_config('app.business_id', 'biz-a', true)");
    let rejectedCrossTenantInsert = false;
    try {
      await client.query("insert into eazinvoice_customers (id, business_id, owner_user_id, name, record) values ('bad-cross-tenant', 'biz-b', 'user-a', 'Bad', '{}'::jsonb)");
    } catch {
      rejectedCrossTenantInsert = true;
    }
    await client.query("rollback");

    await client.query("begin");
    await client.query("select set_config('app.business_id', 'biz-b', true)");
    const bCustomers = await client.query("select id from eazinvoice_customers order by id");
    await client.query("commit");

    const noContext = await client.query("select id from eazinvoice_customers order by id");
    return {
      businessACustomers: aCustomers.rows.map((row) => row.id),
      businessAInvoices: aInvoices.rows.map((row) => row.id),
      businessAJournals: aJournals.rows.map((row) => row.id),
      businessBCustomers: bCustomers.rows.map((row) => row.id),
      noContextCustomers: noContext.rows.map((row) => row.id),
      rejectedCrossTenantInsert,
    };
  } finally {
    await client.end();
  }
}

async function transactionAtomicitySmoke() {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrlFor(SOURCE_DB);
  await closePostgresPool();
  try {
    await withPostgresTransaction(async (client) => {
      await client.query("insert into eazinvoice_records (id, record_type, business_id, record) values ('atomic-before-failure', 'invoice', 'biz-a', '{}'::jsonb)");
      throw new Error("intentional rollback");
    }, { businessId: "biz-a", rlsBypass: true }).catch(() => undefined);
    return withClient(databaseUrlFor(SOURCE_DB), async (client) => {
      const result = await client.query("select count(*)::int as count from eazinvoice_records where id = 'atomic-before-failure'");
      return result.rows[0].count === 0;
    });
  } finally {
    await closePostgresPool();
    process.env.DATABASE_URL = previousDatabaseUrl;
  }
}

async function roleCheck(admin) {
  const result = await admin.query(`
    select rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
    from pg_roles
    where rolname = $1
  `, [RUNTIME_ROLE]);
  return result.rows[0];
}

async function productionStartupAndReadyz() {
  const previous = { ...process.env };
  process.env.DATABASE_URL = databaseUrlFor(SOURCE_DB);
  process.env.NODE_ENV = "production";
  process.env.EAZINVOICE_ENV = "production";
  process.env.EAZINVOICE_STORAGE = "postgres";
  process.env.EAZINVOICE_POSTGRES_SSL_REQUIRED = "true";
  process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED = "false";
  process.env.API_KEY_HASH_SECRET = "p21b_api_key_hash_secret_that_is_long_enough";
  process.env.ADMIN_ACCESS_KEY = "p21b_admin_access_key_strong";
  process.env.CORS_ALLOWED_ORIGINS = "https://staging.eazinvoice.local";
  let healthy;
  let wrongStorageRejected = false;
  try {
    await closePostgresPool();
    const server = await createServerAsync({ port: 0 });
    healthy = await server.eazinvoiceApi.readinessCheck();
    await new Promise((resolve) => server.close(resolve));
    process.env.EAZINVOICE_STORAGE = "json";
    try {
      await createServerAsync({ port: 0 });
    } catch {
      wrongStorageRejected = true;
    }
  } finally {
    Object.keys(process.env).forEach((key) => {
      if (!(key in previous)) delete process.env[key];
    });
    Object.assign(process.env, previous);
    await closePostgresPool();
  }
  return { healthy, wrongStorageRejected };
}

async function backupRestore(psql, pgDump, pgRestore) {
  fs.mkdirSync(path.dirname(BACKUP_FILE), { recursive: true });
  runTool(pgDump, ["-Fc", "-f", BACKUP_FILE, databaseUrlFor(SOURCE_DB)], "pg_dump");
  runTool(pgRestore, ["--clean", "--if-exists", "--no-owner", "--dbname", databaseUrlFor(RESTORE_DB), BACKUP_FILE], "pg_restore");
  const source = await withClient(databaseUrlFor(SOURCE_DB), financialSummary);
  const restored = await withClient(databaseUrlFor(RESTORE_DB), financialSummary);
  return { backupFile: BACKUP_FILE, source, restored, matches: JSON.stringify(source) === JSON.stringify(restored) };
}

async function financialSummary(client) {
  const tables = [
    "eazinvoice_businesses",
    "eazinvoice_customers",
    "eazinvoice_invoices",
    "eazinvoice_financial_events",
    "eazinvoice_journal_entries",
    "eazinvoice_journal_lines",
  ];
  const summary = {};
  for (const table of tables) {
    const result = await client.query(`select count(*)::int as count from ${quoteIdent(table)}`);
    summary[table] = result.rows[0].count;
  }
  const ledger = await client.query("select coalesce(sum(debit),0)::text as debit, coalesce(sum(credit),0)::text as credit from eazinvoice_journal_lines");
  summary.ledger = ledger.rows[0];
  return summary;
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required.");
  const psql = findTool("psql");
  const pgDump = findTool("pg_dump");
  const pgRestore = findTool("pg_restore");
  const report = {
    tools: { psql: psql.version, pgDump: pgDump.version, pgRestore: pgRestore.version },
    sourceDatabase: SOURCE_DB,
    restoreDatabase: RESTORE_DB,
  };

  report.phase = "database setup";
  currentPhase = report.phase;
  await withClient(adminUrl(), async (admin) => {
    const version = await admin.query("select version() as version");
    report.postgresVersion = version.rows[0].version;
    await recreateDatabase(admin, SOURCE_DB);
    await recreateDatabase(admin, RESTORE_DB);
    await ensureRuntimeRole(admin);
    await grantRuntimeAccess(admin, SOURCE_DB);
    await grantRuntimeAccess(admin, RESTORE_DB);
    report.runtimeRole = await roleCheck(admin);
  });

  report.phase = "clean migrations";
  currentPhase = report.phase;
  report.migrations = await applyMigrations(databaseUrlFor(SOURCE_DB));
  assert(report.migrations.includes(REQUIRED_SCHEMA), `Required schema ${REQUIRED_SCHEMA} was not applied.`);
  const missingMigrationMarkers = expectedMigrationNames().filter((name) => !report.migrations.includes(name));
  assert(!missingMigrationMarkers.length, `Migration tracking missing markers: ${missingMigrationMarkers.join(", ")}`);
  report.phase = "runtime grants";
  currentPhase = report.phase;
  await withClient(adminUrl(), async (admin) => {
    await grantRuntimeAccess(admin, SOURCE_DB);
  });
  report.phase = "schema inventory";
  currentPhase = report.phase;
  report.schema = await schemaInventory(databaseUrlFor(SOURCE_DB));
  report.phase = "seed tenant rows";
  currentPhase = report.phase;
  await seedTenantRows(databaseUrlFor(SOURCE_DB));
  report.phase = "rls checks";
  currentPhase = report.phase;
  report.rls = await rlsChecks(SOURCE_DB);
  assert(JSON.stringify(report.rls.businessACustomers) === JSON.stringify(["cust-a"]), "Business A RLS did not isolate customers.");
  assert(JSON.stringify(report.rls.businessBCustomers) === JSON.stringify(["cust-b"]), "Business B RLS did not isolate customers.");
  assert(report.rls.noContextCustomers.length === 0, "Tenant context leaked into no-context request.");
  assert(report.rls.rejectedCrossTenantInsert, "Cross-tenant insert was not rejected.");
  report.phase = "transaction atomicity smoke";
  currentPhase = report.phase;
  report.atomicityRollback = await transactionAtomicitySmoke();
  assert(report.atomicityRollback, "Transaction rollback smoke test left a partial write.");
  report.phase = "production startup";
  currentPhase = report.phase;
  report.production = await productionStartupAndReadyz();
  assert(report.production.healthy?.ok, "Production readiness did not report healthy.");
  assert(report.production.wrongStorageRejected, "Production JSON storage was not rejected.");
  report.phase = "backup restore";
  currentPhase = report.phase;
  report.backupRestore = await backupRestore(psql, pgDump, pgRestore);
  assert(report.backupRestore.matches, "Restored financial summary differs from source.");

  console.log(JSON.stringify(report, null, 2));
}

main().catch(async (error) => {
  await closePostgresPool().catch(() => undefined);
  console.error(`P2-1B phase failed: ${currentPhase}`);
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
