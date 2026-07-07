import { loadLocalEnv } from "./postgres-env.mjs";
import { closePostgresPool, maskDatabaseUrl, withPostgresClient } from "../apps/api/src/postgres.js";
import { loadPersistedState } from "../apps/api/src/persistence.js";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function idSet(records) {
  return new Set(toArray(records).map((record) => String(record?.id || "")).filter(Boolean));
}

function difference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort();
}

loadLocalEnv();

try {
  const state = loadPersistedState();
  console.log(`database: ${maskDatabaseUrl()}`);
  await withPostgresClient(async (client) => {
    const tables = [
      ["users", "eazinvoice_users", state.users],
      ["businessProfiles", "eazinvoice_business_profiles", state.companies],
      ["customers", "eazinvoice_customers", state.customers],
      ["invoices", "eazinvoice_invoices", state.invoices],
      ["purchaseOrders", "eazinvoice_purchase_orders", state.purchaseOrders],
      ["payments", "eazinvoice_payments", state.payments],
      ["subscriptions", "eazinvoice_subscriptions", state.subscriptions],
      ["businessSettings", "eazinvoice_business_settings", state.businessSettings],
      ["teamMembers", "eazinvoice_team_members", state.teamMembers],
      ["approvalRequests", "eazinvoice_approval_requests", state.approvalRequests],
      ["apiKeys", "eazinvoice_api_keys", state.apiKeys],
    ];
    for (const [label, table, records] of tables) {
      const sourceIds = idSet(records);
      const result = await client.query(`select id from ${table} order by id`);
      const mirrorIds = idSet(result.rows);
      console.log(`${label}: source=${sourceIds.size} mirror=${mirrorIds.size}`);
      const onlySource = difference(sourceIds, mirrorIds);
      const onlyMirror = difference(mirrorIds, sourceIds);
      if (onlySource.length) console.log(`  only in source: ${onlySource.join(", ")}`);
      if (onlyMirror.length) console.log(`  only in mirror: ${onlyMirror.join(", ")}`);
    }
  });
} finally {
  await closePostgresPool();
}
