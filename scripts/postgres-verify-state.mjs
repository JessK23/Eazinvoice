import assert from "node:assert/strict";
import { loadLocalEnv } from "./postgres-env.mjs";
import { closePostgresPool, maskDatabaseUrl } from "../apps/api/src/postgres.js";
import { loadStateFromPostgres, normalizeStateDocument, saveStateToPostgres, STATE_COLLECTIONS } from "../apps/api/src/postgres-state.js";
import { describePersistence, loadPersistedState } from "../apps/api/src/persistence.js";

function countState(state) {
  return Object.fromEntries(
    STATE_COLLECTIONS.map((collection) => [collection, Array.isArray(state[collection]) ? state[collection].length : 0]),
  );
}

function pickComparableState(state) {
  const normalized = normalizeStateDocument(state || {});
  return {
    ...Object.fromEntries(STATE_COLLECTIONS.map((collection) => [collection, normalized[collection] || []])),
    counters: normalized.counters || {},
  };
}

loadLocalEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Add it to .env before verifying Postgres state.");
}

try {
  const persistence = describePersistence();
  const jsonState = loadPersistedState();
  console.log(`database: ${maskDatabaseUrl()}`);
  console.log(`json_source: ${persistence.dataFile}`);

  await saveStateToPostgres(jsonState, {
    source: "verify-json-roundtrip",
    sourcePath: persistence.dataFile,
  });

  const postgresState = await loadStateFromPostgres();
  assert.deepEqual(pickComparableState(postgresState), pickComparableState(jsonState));

  console.log("Postgres state round-trip verified.");
  console.table(countState(postgresState));
} finally {
  await closePostgresPool();
}
