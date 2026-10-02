import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { createStore } from "../apps/api/src/store.js";

function rejectingHarness() {
  let saved = {};
  let rejectSave = false;
  const adapter = {
    load: () => structuredClone(saved),
    save: (state) => rejectSave
      ? Promise.reject(new Error("Postgres authoritative state changed before this write could commit."))
      : Promise.resolve().then(() => { saved = structuredClone(state); }),
    reload: () => Promise.resolve(structuredClone(saved)),
  };
  const store = createStore({}, { persistenceAdapter: adapter });
  const api = createApi({ store });
  return { api, reject: () => { rejectSave = true; } };
}

test("residual authoritative API mutations reject before callers can consume a result", async () => {
  const h = rejectingHarness();
  const user = await h.api.createUser({ name: "Residual Caller", email: `residual-${Date.now()}@example.com` });
  h.reject();

  await assert.rejects(() => h.api.setUserPermissions(user.id, ["admin"]), /authoritative state changed/i);
  await assert.rejects(() => h.api.setUserRestriction(user.id, { accountStatus: "restricted" }), /authoritative state changed/i);
});

test("AUTH-01E production callers await residual mutation results before dependent work", () => {
  const source = fs.readFileSync(new URL("../apps/api/src/server.js", import.meta.url), "utf8");
  assert.match(source, /const recorded = await api\.recordGatewayPayment\(/);
  assert.match(source, /subscription = await subscription;/);
  assert.match(source, /const updated = await api\.setUserPermissions\(/);
  assert.match(source, /const updated = await api\.setUserRestriction\(/);
  assert.match(source, /const task = await api\.updateComplianceTask\(/);
  assert.match(source, /const updatedTask = await api\.recordComplianceReminderDelivery\(/);
  assert.doesNotMatch(source, /const recorded = api\.recordGatewayPayment\(/);
  assert.doesNotMatch(source, /const task = api\.updateComplianceTask\(/);
});

test("AUTH-01E authoritative email-delivery writes are awaited", () => {
  const source = fs.readFileSync(new URL("../apps/api/src/server.js", import.meta.url), "utf8");
  const calls = [...source.matchAll(/api\.recordBusinessEmailDelivery\(/g)];
  assert.ok(calls.length >= 10);
  for (const call of calls) {
    const prefix = source.slice(Math.max(0, call.index - 20), call.index);
    assert.match(prefix, /await\s+$/);
  }
});
