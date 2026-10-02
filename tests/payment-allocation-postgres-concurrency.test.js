import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const stateSource = fs.readFileSync(new URL("../apps/api/src/postgres-state.js", import.meta.url), "utf8");
const adapterSource = fs.readFileSync(new URL("../apps/api/src/postgres-persistence-adapter.js", import.meta.url), "utf8");
const storeSource = fs.readFileSync(new URL("../apps/api/src/store.js", import.meta.url), "utf8");
const integrationEnabled = process.env.EAZINVOICE_POSTGRES_CONCURRENCY_INTEGRATION === "true";

test("PAY-BASE-03 production boundary is PostgreSQL transaction-scoped, not process-local", () => {
  assert.match(stateSource, /withAuthoritativeStateMutation/);
  assert.match(stateSource, /for update/);
  assert.match(stateSource, /expectedVersion/);
  assert.match(adapterSource, /mutateState/);
  assert.match(storeSource, /persistenceAdapter\.mutateState/);
  assert.doesNotMatch(storeSource, /payment allocation.*mutex/i);
});

test("PAY-BASE-03 live PostgreSQL concurrency suite", { skip: !integrationEnabled }, async () => {
  assert.fail(
    "Live PostgreSQL integration is intentionally not enabled by default; run with EAZINVOICE_POSTGRES_CONCURRENCY_INTEGRATION=true against an isolated database and complete the fixture setup before claiming multi-connection PASS.",
  );
});
