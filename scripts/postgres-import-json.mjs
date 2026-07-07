import { loadLocalEnv } from "./postgres-env.mjs";
import { closePostgresPool, maskDatabaseUrl, withPostgresClient } from "../apps/api/src/postgres.js";
import { saveStateToPostgres, STATE_COLLECTIONS } from "../apps/api/src/postgres-state.js";
import { describePersistence, loadPersistedState } from "../apps/api/src/persistence.js";

async function importJsonState() {
  loadLocalEnv();

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Add it to .env before importing JSON data.");
  }

  const persistence = describePersistence();
  const state = loadPersistedState();
  const counts = Object.fromEntries(
    STATE_COLLECTIONS.map((collection) => [collection, Array.isArray(state[collection]) ? state[collection].length : 0]),
  );

  console.log(`database: ${maskDatabaseUrl()}`);
  console.log(`json_source: ${persistence.dataFile}`);

  await withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        "insert into eazinvoice_legacy_snapshots (source, source_path, snapshot) values ($1, $2, $3::jsonb)",
        ["json-import", persistence.dataFile, JSON.stringify(state)],
      );

      await client.query(
        `insert into eazinvoice_audit_events (event_type, entity_type, metadata)
         values ($1, $2, $3::jsonb)`,
        ["json_import_completed", "system", JSON.stringify({ sourcePath: persistence.dataFile, counts })],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  await saveStateToPostgres(state, {
    source: "json-import",
    sourcePath: persistence.dataFile,
  });

  console.log("Postgres JSON import completed.");
  console.table(counts);
}

try {
  await importJsonState();
} finally {
  await closePostgresPool();
}
