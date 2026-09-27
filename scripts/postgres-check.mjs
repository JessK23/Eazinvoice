import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { loadLocalEnv } from "./postgres-env.mjs";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "database", "migrations");
const REQUIRED_SCHEMA_MIGRATION_DEFAULT = "024_document_registry_foundation";
const MIGRATION_LOCK_KEY = "852004021";

function maskDatabaseUrl(value) {
  return String(value || "").replace(/postgres:\/\/([^:]+):([^@]+)@/, "postgres://$1:***@");
}

function candidatePsqlPaths() {
  return [
    process.env.PSQL_PATH,
    "psql",
    "C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe",
    "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe",
  ].filter(Boolean);
}

function findPsql() {
  for (const candidate of candidatePsqlPaths()) {
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
  throw new Error("Could not find psql. Set PSQL_PATH to your psql.exe path.");
}

function runPsql(psql, args, label) {
  const result = spawnSync(psql.command, args, {
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

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => path.join(MIGRATIONS_DIR, file));
}

function migrationNameFromFile(filePath) {
  return path.basename(filePath, ".sql");
}

function migrationSequence(name = "") {
  const match = String(name || "").match(/^(\d+)_/);
  if (!match) return 0;
  return Number(match[1]) || 0;
}

function verifyDocumentRegistryStructure(psql, databaseUrl) {
  const tableExists = runPsql(psql, [
    databaseUrl,
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-c",
    "select (to_regclass('public.eazinvoice_documents') is not null)::text;",
  ], "Schema structure check (document table)");
  if (tableExists.trim() !== "true" && tableExists.trim() !== "t") {
    throw new Error("Required table public.eazinvoice_documents is missing.");
  }

  const columnRows = runPsql(psql, [
    databaseUrl,
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-c",
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'eazinvoice_documents';",
  ], "Schema structure check (document columns)");
  const columns = new Set(columnRows.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const requiredColumns = [
    "id",
    "business_id",
    "owner_user_id",
    "classification",
    "related_entity_type",
    "related_entity_id",
    "storage_provider",
    "storage_key",
    "original_filename",
    "mime_type",
    "size_bytes",
    "checksum_sha256",
    "status",
    "idempotency_key",
  ];
  const missingColumns = requiredColumns.filter((column) => !columns.has(column));
  if (missingColumns.length) {
    throw new Error(`eazinvoice_documents missing required columns: ${missingColumns.join(", ")}`);
  }

  const constraintRows = runPsql(psql, [
    databaseUrl,
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-c",
    `select conname
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'eazinvoice_documents';`,
  ], "Schema structure check (document constraints)");
  const constraints = new Set(constraintRows.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const requiredConstraints = [
    "eazinvoice_documents_pkey",
    "eazinvoice_documents_size_non_negative",
    "eazinvoice_documents_status_valid",
  ];
  const missingConstraints = requiredConstraints.filter((name) => !constraints.has(name));
  if (missingConstraints.length) {
    throw new Error(`eazinvoice_documents missing required constraints: ${missingConstraints.join(", ")}`);
  }

  const indexRows = runPsql(psql, [
    databaseUrl,
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-c",
    "select indexname from pg_indexes where schemaname = 'public' and tablename = 'eazinvoice_documents';",
  ], "Schema structure check (document indexes)");
  const indexes = new Set(indexRows.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const requiredIndexes = [
    "eazinvoice_documents_business_idx",
    "eazinvoice_documents_owner_idx",
    "eazinvoice_documents_related_idx",
    "eazinvoice_documents_storage_idx",
    "eazinvoice_documents_business_idempotency_idx",
  ];
  const missingIndexes = requiredIndexes.filter((name) => !indexes.has(name));
  if (missingIndexes.length) {
    throw new Error(`eazinvoice_documents missing required indexes: ${missingIndexes.join(", ")}`);
  }
}

function toPsqlPath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function writeMigrationPlanFile(migrationFiles) {
  const lines = [
    "\\set ON_ERROR_STOP on",
    "select case when pg_try_advisory_lock(" + MIGRATION_LOCK_KEY + ") then 'on' else 'off' end as migration_lock_acquired \\gset",
    "\\if :migration_lock_acquired",
    "\\echo Migration lock acquired.",
    "create table if not exists eazinvoice_migrations (id bigserial primary key, migration_name text not null unique, applied_at timestamptz not null default now());",
  ];

  for (const migrationFile of migrationFiles) {
    const migrationName = migrationNameFromFile(migrationFile);
    const escapedName = migrationName.replace(/'/g, "''");
    lines.push(`select case when exists (select 1 from eazinvoice_migrations where migration_name = '${escapedName}') then 1 else 0 end as migration_applied \\gset`);
    lines.push("\\if :migration_applied");
    lines.push(`\\echo Skipping applied migration: ${migrationName}`);
    lines.push("\\else");
    lines.push(`\\echo Applying migration: ${migrationName}`);
    lines.push(`\\i ${toPsqlPath(migrationFile)}`);
    lines.push("\\endif");
  }

  lines.push("select pg_advisory_unlock(" + MIGRATION_LOCK_KEY + ");");
  lines.push("\\echo Postgres migrations completed.");
  lines.push("\\else");
  lines.push("\\echo Migration lock is already held by another runner. Failing closed.");
  lines.push("select 1 / 0;");
  lines.push("\\endif");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "eazinvoice-migrate-"));
  const planPath = path.join(tempDir, "migration-plan.sql");
  fs.writeFileSync(planPath, lines.join("\n") + "\n", "utf8");
  return {
    planPath,
    cleanup() {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
      }
    },
  };
}

loadLocalEnv(ROOT);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing. Add it to .env before running the Postgres check.");
}

const psql = findPsql();
console.log(`psql: ${psql.version}`);
console.log(`database: ${maskDatabaseUrl(databaseUrl)}`);

const checkOutput = runPsql(psql, [
  databaseUrl,
  "-v",
  "ON_ERROR_STOP=1",
  "-c",
  "select current_database() as database_name, current_user as connected_user;",
], "Postgres connection check");

console.log(checkOutput);

if (process.argv.includes("--migrate")) {
  const migrationFiles = listMigrationFiles();
  if (!migrationFiles.length) {
    console.log("No migrations found.");
    process.exit(0);
  }
  const plan = writeMigrationPlanFile(migrationFiles);
  try {
    const output = runPsql(psql, [
      databaseUrl,
      "-f",
      plan.planPath,
    ], "Postgres migration run");
    if (output) console.log(output);
  } finally {
    plan.cleanup();
  }
}

if (process.argv.includes("--verify-schema")) {
  const required = process.env.EAZINVOICE_REQUIRED_SCHEMA_MIGRATION || REQUIRED_SCHEMA_MIGRATION_DEFAULT;
  const direct = runPsql(psql, [
    databaseUrl,
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-c",
    `select migration_name from eazinvoice_migrations where migration_name = '${required.replace(/'/g, "''")}';`,
  ], "Schema version check");
  if (!direct.trim()) throw new Error(`Required migration ${required} has not been applied.`);

  if (migrationSequence(required) >= 24) {
    verifyDocumentRegistryStructure(psql, databaseUrl);
  }

  console.log(`Schema version verified: ${required}`);
}
