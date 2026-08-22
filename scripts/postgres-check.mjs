import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadLocalEnv } from "./postgres-env.mjs";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "database", "migrations");

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
  const appliedOutput = runPsql(psql, [
    databaseUrl,
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-c",
    "create table if not exists eazinvoice_migrations (id bigserial primary key, migration_name text not null unique, applied_at timestamptz not null default now()); select migration_name from eazinvoice_migrations order by migration_name;",
  ], "Migration metadata check");
  const applied = new Set(appliedOutput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));

  for (const migrationFile of migrationFiles) {
    const migrationName = migrationNameFromFile(migrationFile);
    if (applied.has(migrationName)) {
      console.log(`Skipping applied migration: ${migrationName}`);
      continue;
    }
    console.log(`Applying migration: ${migrationName}`);
    runPsql(psql, [
      databaseUrl,
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      migrationFile,
    ], `Migration ${migrationName}`);
  }

  console.log("Postgres migrations completed.");
}

if (process.argv.includes("--verify-schema")) {
  const required = process.env.EAZINVOICE_REQUIRED_SCHEMA_MIGRATION || "023_transactional_financial_persistence";
  const output = runPsql(psql, [
    databaseUrl,
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-c",
    "select migration_name from eazinvoice_migrations where migration_name = current_setting('app.required_migration', true);",
  ], "Schema version check");
  if (!output.trim()) {
    const direct = runPsql(psql, [
      databaseUrl,
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-c",
      `select migration_name from eazinvoice_migrations where migration_name = '${required.replace(/'/g, "''")}';`,
    ], "Schema version check");
    if (!direct.trim()) throw new Error(`Required migration ${required} has not been applied.`);
  }
  console.log(`Schema version verified: ${required}`);
}
