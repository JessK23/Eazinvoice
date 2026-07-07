import { loadStateFromPostgres, saveStateToPostgres } from "./postgres-state.js";
import { loadPersistedState, savePersistedState } from "./persistence.js";
import { syncCoreTablesFromState } from "./postgres-core-sync.js";

export function wantsPostgresStorage(options = {}) {
  const requested = options.storage || process.env.EAZINVOICE_STORAGE || "";
  return String(requested).trim().toLowerCase() === "postgres";
}

export function isCoreTableSyncEnabled(options = {}) {
  const requested = options.coreTableSync ?? process.env.EAZINVOICE_CORE_TABLE_SYNC ?? "";
  return ["1", "true", "yes", "on"].includes(String(requested).trim().toLowerCase());
}

let queuedCoreState = null;
let coreSyncRunning = false;

function cloneState(state) {
  return JSON.parse(JSON.stringify(state ?? {}));
}

function scheduleCoreTableSync(state, options = {}) {
  if (!isCoreTableSyncEnabled(options)) return;
  queuedCoreState = cloneState(state);
  if (coreSyncRunning) return;

  coreSyncRunning = true;
  Promise.resolve()
    .then(async () => {
      while (queuedCoreState) {
        const nextState = queuedCoreState;
        queuedCoreState = null;
        await syncCoreTablesFromState(nextState, {
          auditEvent: "core_tables_runtime_synced",
          pruneChildRows: true,
          source: options.source || "runtime",
        });
      }
    })
    .catch((error) => {
      console.error("Postgres core table sync failed:", error.message);
    })
    .finally(() => {
      coreSyncRunning = false;
      if (queuedCoreState) scheduleCoreTableSync(queuedCoreState, options);
    });
}

export function createCoreTableSyncPersistenceAdapter(options = {}) {
  const baseAdapter = options.baseAdapter || {
    load: loadPersistedState,
    save: savePersistedState,
  };
  return {
    load() {
      return baseAdapter.load();
    },
    save(state) {
      baseAdapter.save(state);
      scheduleCoreTableSync(state, {
        ...options,
        source: options.source || "runtime-json",
      });
    },
  };
}

export async function createPostgresPersistenceAdapter(options = {}) {
  const initialState = await loadStateFromPostgres();
  return {
    load() {
      return initialState;
    },
    save(state) {
      saveStateToPostgres(state, {
        source: options.source || "runtime-postgres",
        sourcePath: "postgres",
      })
        .then(() => {
          scheduleCoreTableSync(state, {
            ...options,
            source: options.source || "runtime-postgres",
          });
        })
        .catch((error) => {
          console.error("Postgres persistence save failed:", error.message);
        });
    },
  };
}
