import assert from "node:assert/strict";
import { loadLocalEnv } from "./postgres-env.mjs";
import { closePostgresPool, maskDatabaseUrl, withPostgresClient } from "../apps/api/src/postgres.js";
import { loadPersistedState } from "../apps/api/src/persistence.js";
import { loadStateFromPostgres, STATE_COLLECTIONS } from "../apps/api/src/postgres-state.js";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasStateRecords(state) {
  return STATE_COLLECTIONS.some((collection) => toArray(state?.[collection]).length > 0);
}

async function loadSafeState() {
  try {
    const postgresState = await loadStateFromPostgres();
    if (hasStateRecords(postgresState)) return postgresState;
  } catch (error) {
    console.warn(`Postgres state document unavailable, falling back to JSON: ${error.message}`);
  }
  return loadPersistedState();
}

function expectedCounts(state) {
  return {
    eazinvoice_users: toArray(state.users).length,
    eazinvoice_business_profiles: toArray(state.companies).length,
    eazinvoice_customers: toArray(state.customers).length,
    eazinvoice_invoices: toArray(state.invoices).length,
    eazinvoice_invoice_items: toArray(state.invoices).reduce((total, invoice) => total + toArray(invoice.items).length, 0),
    eazinvoice_purchase_orders: toArray(state.purchaseOrders).length,
    eazinvoice_purchase_order_items: toArray(state.purchaseOrders).reduce((total, purchaseOrder) => total + toArray(purchaseOrder.items).length, 0),
    eazinvoice_payments: toArray(state.payments).length,
    eazinvoice_subscriptions: toArray(state.subscriptions).length,
    eazinvoice_business_settings: toArray(state.businessSettings).length,
    eazinvoice_team_members: toArray(state.teamMembers).length,
    eazinvoice_approval_requests: toArray(state.approvalRequests).length,
    eazinvoice_api_keys: toArray(state.apiKeys).length,
    eazinvoice_business_audit_events: toArray(state.businessAuditEvents).length,
  };
}

async function tableCounts(client, tables) {
  const counts = {};
  for (const table of tables) {
    const result = await client.query(`select count(*)::int as count from ${table}`);
    counts[table] = result.rows[0].count;
  }
  return counts;
}

function printCounts(expected, actual) {
  console.table(Object.keys(expected).map((table) => ({
    table,
    expected: expected[table],
    actual: actual[table],
  })));
}

loadLocalEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Add it to .env before verifying core Postgres tables.");
}

try {
  const state = await loadSafeState();
  const expected = expectedCounts(state);
  const actual = await withPostgresClient((client) => tableCounts(client, Object.keys(expected)));
  console.log(`database: ${maskDatabaseUrl()}`);
  printCounts(expected, actual);
  assert.deepEqual(actual, expected);
  console.log("Core Postgres table counts match the current state.");
} finally {
  await closePostgresPool();
}
