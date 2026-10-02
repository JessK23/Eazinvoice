import assert from "node:assert/strict";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { createStore } from "../apps/api/src/store.js";

test("authoritative Payment mutation surfaces persistence/CAS failure and restores local state", async () => {
  let savedState = {};
  let rejectNextSave = false;
  const persistenceAdapter = {
    load: () => structuredClone(savedState),
    save: (state) => {
      if (rejectNextSave) return Promise.reject(new Error("Postgres authoritative state changed before this write could commit."));
      savedState = structuredClone(state);
      return Promise.resolve();
    },
    reload: () => Promise.resolve(structuredClone(savedState)),
  };
  const store = createStore({}, { persistenceAdapter });
  const api = createApi({ store });
  const user = await api.createUser({ name: "Persistence Owner", email: `persist-${Date.now()}@example.com` });
  const businessId = api.listBusinessWorkspaces(user)[0].businessId;
  const invoice = await api.createInvoice({ ownerUserId: user.id, businessId, status: "created", items: [{ description: "Persistence", quantity: 1, rate: 10000 }] });
  rejectNextSave = true;

  await assert.rejects(
    () => api.recordInvoicePayment(invoice.id, { businessId, amount: 1000, idempotencyKey: "stale-payment" }, { user, businessId }),
    /authoritative state changed/i,
  );
  assert.equal(store.exportState().payments.length, 0);
  assert.equal(store.exportState().counters.payment, 0);
});
