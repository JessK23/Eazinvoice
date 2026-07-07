import { loadLocalEnv } from "./postgres-env.mjs";
import { closePostgresPool, maskDatabaseUrl, withPostgresClient } from "../apps/api/src/postgres.js";
import { countCoreState, syncCoreTables } from "../apps/api/src/postgres-core-sync.js";
import { loadPersistedState } from "../apps/api/src/persistence.js";
import { loadStateFromPostgres, STATE_COLLECTIONS } from "../apps/api/src/postgres-state.js";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasStateRecords(state) {
  return STATE_COLLECTIONS.some((collection) => toArray(state?.[collection]).length > 0);
}

async function loadSafeState() {
  try {
    const postgresState = await loadStateFromPostgres();
    if (hasStateRecords(postgresState)) return postgresState;
  } catch (error) {
    console.warn(`Postgres state document unavailable, falling back to JSON: ${error.message}`);
  }
  return loadPersistedState();
}

loadLocalEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Add it to .env before syncing core Postgres tables.");
}

try {
  const state = await loadSafeState();
  const syncCounts = countCoreState(state);
  console.log(`database: ${maskDatabaseUrl()}`);

  await withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      await syncCoreTables(client, state, {
        auditEvent: "core_tables_synced",
        pruneChildRows: true,
        source: "script",
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  console.log("Core Postgres tables synced without changing source application records.");
  console.table(syncCounts);
} finally {
  await closePostgresPool();
}
