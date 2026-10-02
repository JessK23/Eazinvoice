import assert from "node:assert/strict";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { createStore } from "../apps/api/src/store.js";

function asyncHarness() {
  let saved = {};
  let rejectSave = false;
  const adapter = {
    load: () => structuredClone(saved),
    save: (state) => new Promise((resolve, reject) => setImmediate(() => {
      if (rejectSave) reject(new Error("Postgres authoritative state changed before this write could commit."));
      else {
        saved = structuredClone(state);
        resolve();
      }
    })),
    reload: () => Promise.resolve(structuredClone(saved)),
  };
  const store = createStore({}, { persistenceAdapter: adapter });
  const api = createApi({ store });
  return { api, rejectSave: () => { rejectSave = true; } };
}

async function paidOwner(api, plan = "pro") {
  const user = await api.createUser({ name: "Caller Closure Owner", email: `caller-closure-${Date.now()}-${Math.random()}@example.com` });
  await api.createSubscription({ userId: user.id, subscriberName: user.name, plan, amount: 999, status: "active" });
  return user;
}

test("AI draft/finalization callers await authoritative Invoice and PO mutations and usage logs", async () => {
  const { api } = asyncHarness();
  const user = await paidOwner(api);

  const approvedInvoice = api.createApprovedAiDraft(user, {
    command: "approved invoice",
    approvedDraft: { intent: "invoice", payload: { billToName: "Approved customer", items: [{ description: "Work", quantity: 1, rate: 1000 }] } },
  });
  assert.equal(typeof approvedInvoice.then, "function");
  assert.equal((await approvedInvoice).createdRecord.status, "draft");

  const approvedPo = api.createApprovedAiDraft(user, {
    command: "approved purchase order",
    approvedDraft: { intent: "purchase_order", payload: { vendorName: "Approved vendor", items: [{ description: "Supplies", quantity: 1, rate: 500 }] } },
  });
  assert.equal(typeof approvedPo.then, "function");
  assert.equal((await approvedPo).createdRecord.status, "draft");

  const finalizedInvoice = api.runAiCommand(user, { command: "Create invoice for Rahul INR 1000" });
  assert.equal(typeof finalizedInvoice.then, "function");
  assert.equal((await finalizedInvoice).createdRecord.status, "draft");

  const finalizedPo = api.runAiCommand(user, { command: "Generate purchase order for Dell laptops INR 500" });
  assert.equal(typeof finalizedPo.then, "function");
  assert.equal((await finalizedPo).createdRecord.documentType, "po");

  assert.equal(api.exportDataSnapshot().aiUsageLogs.length, 4);
});

test("scheduler and invoice payment-link callers await persistence and surface failures", async () => {
  const h = asyncHarness();
  const user = await paidOwner(h.api, "standard");
  const source = await h.api.createInvoice({
    ownerUserId: user.id,
    status: "created",
    invoiceDate: "2026-05-15",
    dueDate: "2026-05-22",
    items: [{ description: "Retainer", quantity: 1, rate: 1000 }],
    recurringEnabled: true,
    recurringFrequency: "monthly",
    recurringNextDate: "2026-06-15",
  });
  const scheduled = h.api.runRecurringInvoiceSchedulerForAllUsers({ targetDate: "2026-06-20" });
  assert.equal(typeof scheduled.then, "function");
  assert.equal((await scheduled).createdCount, 1);
  assert.ok(source.id);

  const invoice = await h.api.createInvoice({
    ownerUserId: user.id,
    status: "created",
    items: [{ description: "Collection", quantity: 1, rate: 2000 }],
  });
  h.rejectSave();
  await assert.rejects(
    () => h.api.createInvoicePaymentLink(invoice.id, { gateway: "razorpay" }),
    /authoritative state changed/i,
  );
  await assert.rejects(
    () => h.api.runRecurringInvoiceSchedulerForAllUsers({ targetDate: "2026-07-20" }),
    /authoritative state changed/i,
  );
});
