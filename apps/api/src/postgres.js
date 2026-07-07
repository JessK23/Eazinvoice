import { Pool } from "pg";

let pool;

export function getDatabaseUrl() {
  return process.env.DATABASE_URL || "";
}

export function hasPostgresConfig() {
  return Boolean(getDatabaseUrl());
}

export function maskDatabaseUrl(value = getDatabaseUrl()) {
  return String(value || "").replace(/postgres:\/\/([^:]+):([^@]+)@/, "postgres://$1:***@");
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
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
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

export async function closePostgresPool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}
