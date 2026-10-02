import assert from "node:assert/strict";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { createStore } from "../apps/api/src/store.js";

function harness() {
  let saved = {};
  let rejectSave = false;
  let rejectReload = false;
  const adapter = {
    load: () => structuredClone(saved),
    save: (state) => {
      if (rejectSave) return Promise.reject(new Error("Postgres authoritative state changed before this write could commit."));
      saved = structuredClone(state);
      return Promise.resolve();
    },
    reload: () => rejectReload
      ? Promise.reject(new Error("Postgres authoritative reload unavailable."))
      : Promise.resolve(structuredClone(saved)),
  };
  const store = createStore({}, { persistenceAdapter: adapter });
  const api = createApi({ store });
  return {
    api,
    store,
    reject() { rejectSave = true; },
    rejectReload() { rejectReload = true; },
  };
}

async function ownerFixture(h) {
  const user = await h.api.createUser({ name: "AUTH-01B Owner", email: `auth-01b-${Date.now()}-${Math.random()}@example.com` });
  const businessId = h.api.listBusinessWorkspaces(user)[0].businessId;
  return { user, businessId };
}

test("Invoice mutation awaits persistence and rejects without an unhandled rejection", async () => {
  const h = harness();
  const { user, businessId } = await ownerFixture(h);
  h.reject();
  let unhandled = 0;
  const onUnhandled = () => { unhandled += 1; };
  process.on("unhandledRejection", onUnhandled);
  try {
    await assert.rejects(() => h.api.createInvoice({
      ownerUserId: user.id,
      businessId,
      status: "created",
      items: [{ description: "Awaited Invoice", quantity: 1, rate: 1000 }],
    }), /authoritative state changed/i);
    assert.equal(h.store.exportState().invoices.length, 0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(unhandled, 0);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("Vendor Bill, Banking, Accounting, and Credit mutations await ordinary persistence", async () => {
  const h = harness();
  const { user, businessId } = await ownerFixture(h);
  const vendor = await h.api.createVendor({ name: "Awaited Vendor", businessId }, { user, businessId });
  const account = await h.api.createBankAccount(user, { businessId, accountType: "clearing", displayName: "Awaited Clearing" }, { businessId });
  const invoice = await h.api.createInvoice({
    ownerUserId: user.id,
    businessId,
    status: "created",
    items: [{ description: "Credit source", quantity: 1, rate: 1000 }],
  });
  const ledger = h.api.listAccountingEventLedger(user, { businessId }).accounts.find((entry) => entry.accountCode === "1100");
  h.reject();

  await assert.rejects(() => h.api.createVendorBill({
    ownerUserId: user.id,
    businessId,
    vendorId: vendor.id,
    status: "draft",
    vendorBillNumber: "AUTH-01B-VB",
    items: [{ description: "Awaited Bill", quantity: 1, rate: 1000 }],
  }, { user, businessId }), /authoritative state changed/i);

  await assert.rejects(() => h.api.importBankStatement(user, {
    businessId,
    bankAccountId: account.id,
    lines: [{ transactionDate: "2026-10-02", description: "Awaited bank line", credit: 1000 }],
  }, { businessId }), /authoritative state changed/i);

  await assert.rejects(() => h.api.createManualAccountingJournal(user, {
    businessId,
    lines: [{ accountId: ledger.id, debit: 100 }, { accountCode: "4100", credit: 100 }],
  }), /authoritative state changed/i);

  await assert.rejects(() => h.api.createSalesCreditNote({
    businessId,
    sourceInvoiceId: invoice.id,
    status: "draft",
    creditNoteDate: "2026-10-02",
    items: [{ description: "Awaited credit", quantity: 1, rate: 100 }],
  }, { user, businessId }), /authoritative state changed/i);
});

test("save plus reload failure enters an unhealthy authoritative state", async () => {
  const h = harness();
  const { user, businessId } = await ownerFixture(h);
  h.rejectReload();
  h.reject();

  await assert.rejects(() => h.api.createInvoice({
    ownerUserId: user.id,
    businessId,
    status: "created",
    items: [{ description: "Reload Failure", quantity: 1, rate: 1000 }],
  }), /authoritative state changed/i);
  assert.equal(h.store.getPersistenceHealth().healthy, false);
  await assert.rejects(() => h.api.createInvoice({
    ownerUserId: user.id,
    businessId,
    status: "created",
    items: [{ description: "Blocked After Reload Failure", quantity: 1, rate: 1000 }],
  }), /authoritative persistence is unhealthy/i);
});

test("in-memory mode remains synchronous", () => {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "Synchronous Owner", email: `sync-${Date.now()}@example.com` });
  assert.equal(typeof user.then, "undefined");
});
