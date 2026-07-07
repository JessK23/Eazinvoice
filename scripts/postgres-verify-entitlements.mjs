import assert from "node:assert/strict";
import { createApi } from "../apps/api/src/index.js";
import { createStore } from "../apps/api/src/store.js";
import { closePostgresPool, maskDatabaseUrl, withPostgresClient } from "../apps/api/src/postgres.js";
import {
  listPostgresSubscriptionsForUser,
  summarizePostgresEntitlements,
} from "../apps/api/src/postgres-entitlements.js";
import { loadLocalEnv } from "./postgres-env.mjs";

loadLocalEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Add it to .env before verifying Postgres entitlements.");
}

function normalizePlan(value) {
  return String(value || "free").trim().toLowerCase();
}

function activeSubscriptionKey(subscription) {
  if (!subscription) return "";
  return [
    normalizePlan(subscription.plan),
    String(subscription.status || "").toLowerCase(),
    String(subscription.gatewayOrderId || ""),
    String(subscription.gatewayPaymentId || ""),
  ].join("|");
}

try {
  const store = createStore();
  const api = createApi({ store });
  const users = api.listUsers();
  const jsonSubscriptions = api.listSubscriptions();
  const dbSubscriptionCount = await withPostgresClient(async (client) => {
    const result = await client.query("select count(*)::int as count from eazinvoice_subscriptions");
    return Number(result.rows[0]?.count || 0);
  });

  assert.equal(
    dbSubscriptionCount,
    jsonSubscriptions.length,
    "Postgres subscription rows must match the current runtime subscription count.",
  );

  for (const user of users) {
    const jsonSummary = api.getFreePlanSummary(user);
    const postgresSummary = await summarizePostgresEntitlements(user);
    assert.equal(postgresSummary.available, true);
    assert.equal(
      normalizePlan(postgresSummary.plan),
      normalizePlan(jsonSummary.plan),
      `Plan mismatch for ${user.email || user.id}`,
    );
    assert.equal(
      activeSubscriptionKey(postgresSummary.subscription),
      activeSubscriptionKey(jsonSummary.subscription),
      `Active subscription mismatch for ${user.email || user.id}`,
    );

    const postgresSubscriptions = await listPostgresSubscriptionsForUser(user.id);
    const jsonUserSubscriptions = api.listSubscriptionsForUser(user);
    assert.equal(postgresSubscriptions.available, true);
    assert.equal(
      postgresSubscriptions.subscriptions.length,
      jsonUserSubscriptions.length,
      `Subscription list count mismatch for ${user.email || user.id}`,
    );
  }

  console.log(`database: ${maskDatabaseUrl()}`);
  console.log(`Verified entitlement plans for ${users.length} users and ${jsonSubscriptions.length} subscriptions.`);
  console.log("Postgres entitlement reads match the current runtime store.");
} finally {
  await closePostgresPool();
}
