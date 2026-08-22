import { Pool } from "pg";

let pool;
export const REQUIRED_SCHEMA_MIGRATION = "023_transactional_financial_persistence";

export function getDatabaseUrl() {
  return process.env.DATABASE_URL || "";
}

export function hasPostgresConfig() {
  return Boolean(getDatabaseUrl());
}

export function maskDatabaseUrl(value = getDatabaseUrl()) {
  return String(value || "").replace(/postgres:\/\/([^:]+):([^@]+)@/, "postgres://$1:***@");
}

function boolEnv(name) {
  return ["1", "true", "yes", "on"].includes(String(process.env[name] || "").trim().toLowerCase());
}

function sslConfig() {
  if (!boolEnv("EAZINVOICE_POSTGRES_SSL_REQUIRED") && !boolEnv("POSTGRES_SSL")) return undefined;
  return {
    rejectUnauthorized: !["0", "false", "no", "off"].includes(String(process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED || "true").trim().toLowerCase()),
  };
}

export function getPostgresPool() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing. Add it before using Postgres storage tools.");
  }
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      max: Number(process.env.POSTGRES_POOL_SIZE || 5),
      idleTimeoutMillis: Number(process.env.POSTGRES_IDLE_TIMEOUT_MS || 30000),
      connectionTimeoutMillis: Number(process.env.POSTGRES_CONNECTION_TIMEOUT_MS || 10000),
      statement_timeout: Number(process.env.POSTGRES_STATEMENT_TIMEOUT_MS || 15000),
      query_timeout: Number(process.env.POSTGRES_QUERY_TIMEOUT_MS || 20000),
      ssl: sslConfig(),
    });
    pool.on("error", (error) => {
      console.error("Postgres pool error:", String(error.message || error).replace(/postgres:\/\/([^:]+):([^@]+)@/gi, "postgres://$1:***@"));
    });
  }
  return pool;
}

export async function withPostgresClient(callback) {
  const client = await getPostgresPool().connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export async function withPostgresTransaction(callback, options = {}) {
  return withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      if (options.businessId) {
        await client.query("select set_config('app.business_id', $1, true)", [String(options.businessId)]);
      }
      if (options.actorUserId) {
        await client.query("select set_config('app.actor_user_id', $1, true)", [String(options.actorUserId)]);
      }
      if (options.rlsBypass) {
        await client.query("select set_config('app.rls_bypass', 'true', true)");
      }
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function validatePostgresConnection() {
  return withPostgresClient(async (client) => {
    const result = await client.query("select current_database() as database_name, current_user as user_name, now() as checked_at");
    return {
      reachable: true,
      database: result.rows[0]?.database_name || "",
      user: result.rows[0]?.user_name || "",
      checkedAt: result.rows[0]?.checked_at || new Date().toISOString(),
    };
  });
}

export async function getAppliedMigrationNames() {
  return withPostgresClient(async (client) => {
    const result = await client.query("select migration_name from eazinvoice_migrations order by migration_name");
    return result.rows.map((row) => row.migration_name);
  });
}

export async function validatePostgresSchema(requiredMigration = REQUIRED_SCHEMA_MIGRATION) {
  const migrations = await getAppliedMigrationNames();
  const current = migrations.at(-1) || "";
  return {
    compatible: migrations.includes(requiredMigration),
    requiredMigration,
    currentMigration: current,
    appliedCount: migrations.length,
  };
}

export async function closePostgresPool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}
