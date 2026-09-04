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
  const jsonState = loadPersistedState();
  const jsonHasRecords = hasStateRecords(jsonState);
  try {
    const postgresState = await loadStateFromPostgres();
    if (!jsonHasRecords && hasStateRecords(postgresState)) return postgresState;
    if (jsonHasRecords && hasStateRecords(postgresState)) {
      const jsonCounts = countCoreState(jsonState);
      const postgresCounts = countCoreState(postgresState);
      const jsonTotal = Object.values(jsonCounts).reduce((total, count) => total + count, 0);
      const postgresTotal = Object.values(postgresCounts).reduce((total, count) => total + count, 0);
      return jsonTotal >= postgresTotal ? jsonState : postgresState;
    }
  } catch (error) {
    console.warn(`Postgres state document unavailable, falling back to JSON: ${error.message}`);
  }
  return jsonState;
}

loadLocalEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Add it to .env before syncing core Postgres tables.");
}

try {
  const state = await loadSafeState();
  const syncCounts = countCoreState(state);
  console.log(`database: ${maskDatabaseUrl()}`);
  console.log("sync_source_counts:");
  console.table(syncCounts);

  await withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("select set_config('app.rls_bypass', 'true', true)");
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
