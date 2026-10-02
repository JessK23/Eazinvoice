import assert from "node:assert/strict";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { createStore } from "../apps/api/src/store.js";

function harness() {
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
  return { api, fail() { rejectSave = true; } };
}

test("AUTH-01D authentication and subscription mutations reject before downstream use", async () => {
  const h = harness();
  const user = await h.api.createUser({ name: "AUTH-01D User", email: `auth-01d-${Date.now()}@example.com` });
  h.fail();

  await assert.rejects(
    () => h.api.updateUserAuthDetails(user.id, { emailVerified: true }),
    /authoritative state changed/i,
  );
  await assert.rejects(
    () => h.api.createSubscription({ userId: user.id, subscriberName: user.name, plan: "standard", amount: 999, status: "active" }),
    /authoritative state changed/i,
  );
});

test("AUTH-01D workspace, team, approval, and API-key callers consume resolved results", async () => {
  const h = harness();
  const user = await h.api.createUser({ name: "AUTH-01D Business", email: `business-01d-${Date.now()}@example.com` });
  await h.api.createSubscription({ userId: user.id, subscriberName: user.name, plan: "business", amount: 9999, status: "active" });

  const settings = await h.api.updateBusinessSettings(user, { companyName: "Resolved Settings" });
  assert.ok(settings.id);
  const member = await h.api.createTeamMember(user, { name: "Resolved Member", email: `resolved-member-${Math.random()}@example.com`, role: "viewer" });
  assert.equal(member.role, "viewer");
  const key = await h.api.createApiKey(user, { label: "Resolved key" });
  assert.ok(key.id);
});
