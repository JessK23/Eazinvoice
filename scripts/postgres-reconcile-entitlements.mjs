import { createApi } from "../apps/api/src/index.js";
import { createStore } from "../apps/api/src/store.js";
import { closePostgresPool, maskDatabaseUrl, withPostgresClient } from "../apps/api/src/postgres.js";
import { syncSubscriptions } from "../apps/api/src/postgres-core-sync.js";
import { STATE_KEY } from "../apps/api/src/postgres-state.js";
import { loadLocalEnv } from "./postgres-env.mjs";

loadLocalEnv();

const shouldApply = process.argv.includes("--apply");
const sourceLabel = "runtime-json";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Add it to .env before reconciling entitlements.");
}

function normalize(value) {
  return String(value || "").trim();
}

function normalizePlan(value) {
  return normalize(value || "free").toLowerCase();
}

function normalizeStatus(value) {
  return normalize(value || "active").toLowerCase();
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
}

function subscriptionComparable(subscription = {}) {
  return {
    id: normalize(subscription.id),
    userId: normalize(subscription.userId || subscription.user_id || subscription.adminUserId),
    plan: normalizePlan(subscription.plan),
    status: normalizeStatus(subscription.status),
    amount: money(subscription.amount),
    monthlyAmount: money(subscription.monthlyAmount || subscription.monthly_amount),
    annualAmount: money(subscription.annualAmount || subscription.annual_amount || subscription.amount),
    billingCycle: normalize(subscription.billingCycle || subscription.billing_cycle || "yearly").toLowerCase(),
    gateway: normalize(subscription.gateway).toLowerCase(),
    gatewayOrderId: normalize(subscription.gatewayOrderId || subscription.gateway_order_id),
    gatewayPaymentId: normalize(subscription.gatewayPaymentId || subscription.gateway_payment_id),
  };
}

function byId(records) {
  return new Map(records.map((record) => [normalize(record.id), record]));
}

function describeSubscription(subscription, usersById) {
  const comparable = subscriptionComparable(subscription);
  const user = usersById.get(comparable.userId);
  return {
    id: comparable.id,
    userId: comparable.userId,
    email: user?.email || "",
    plan: comparable.plan,
    status: comparable.status,
    amount: comparable.amount,
    gatewayOrderId: comparable.gatewayOrderId,
    gatewayPaymentId: comparable.gatewayPaymentId,
  };
}

function findDiffs(sourceSubscriptions, postgresSubscriptions, usersById) {
  const sourceById = byId(sourceSubscriptions);
  const postgresById = byId(postgresSubscriptions);
  const diffs = [];

  for (const [id, source] of sourceById.entries()) {
    const mirror = postgresById.get(id);
    if (!mirror) {
      diffs.push({
        type: "missing_in_postgres",
        source: describeSubscription(source, usersById),
        postgres: null,
      });
      continue;
    }

    const left = subscriptionComparable(source);
    const right = subscriptionComparable(mirror);
    const changedFields = Object.keys(left).filter((field) => left[field] !== right[field]);
    if (changedFields.length) {
      diffs.push({
        type: "field_mismatch",
        id,
        changedFields,
        source: describeSubscription(source, usersById),
        postgres: describeSubscription(mirror, usersById),
      });
    }
  }

  for (const [id, mirror] of postgresById.entries()) {
    if (!sourceById.has(id)) {
      diffs.push({
        type: "stale_in_postgres",
        source: null,
        postgres: describeSubscription(mirror, usersById),
      });
    }
  }

  return diffs;
}

async function loadPostgresSubscriptions(client) {
  const result = await client.query(
    `select
      id,
      user_id as "userId",
      plan,
      status,
      amount,
      monthly_amount as "monthlyAmount",
      annual_amount as "annualAmount",
      billing_cycle as "billingCycle",
      gateway,
      gateway_order_id as "gatewayOrderId",
      gateway_payment_id as "gatewayPaymentId",
      record,
      created_at as "createdAt",
      updated_at as "updatedAt"
     from eazinvoice_subscriptions
     order by id`,
  );
  return result.rows;
}

function printDiffs(diffs) {
  if (!diffs.length) {
    console.log("No entitlement subscription mismatches found.");
    return;
  }
  console.log(`Found ${diffs.length} entitlement mismatch(es):`);
  console.table(diffs.map((diff) => ({
    type: diff.type,
    id: diff.id || diff.source?.id || diff.postgres?.id,
    email: diff.source?.email || diff.postgres?.email || "",
    sourcePlan: diff.source?.plan || "",
    postgresPlan: diff.postgres?.plan || "",
    sourceStatus: diff.source?.status || "",
    postgresStatus: diff.postgres?.status || "",
    fields: diff.changedFields?.join(", ") || "",
    gatewayOrderId: diff.source?.gatewayOrderId || diff.postgres?.gatewayOrderId || "",
    gatewayPaymentId: diff.source?.gatewayPaymentId || diff.postgres?.gatewayPaymentId || "",
  })));
}

async function replacePostgresEntitlementMirrors(client, sourceSubscriptions, snapshot) {
  await client.query(
    "insert into eazinvoice_legacy_snapshots (source, source_path, snapshot) values ($1, $2, $3::jsonb)",
    [
      "entitlement-reconcile-backup",
      "postgres:eazinvoice_subscriptions",
      JSON.stringify(snapshot),
    ],
  );

  await client.query("delete from eazinvoice_subscriptions");
  await syncSubscriptions(client, sourceSubscriptions);

  const sourceJson = JSON.stringify(sourceSubscriptions);
  await client.query(
    `update eazinvoice_state_documents
     set state = jsonb_set(state, '{subscriptions}', $1::jsonb, true),
      version = version + 1,
      updated_at = now()
     where state_key = $2`,
    [sourceJson, STATE_KEY],
  );

  await client.query("delete from eazinvoice_records where record_type = 'subscriptions'");
  for (let index = 0; index < sourceSubscriptions.length; index += 1) {
    const subscription = sourceSubscriptions[index];
    await client.query(
      `insert into eazinvoice_records
        (id, record_type, owner_user_id, company_id, status, record, updated_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, now())`,
      [
        normalize(subscription.id) || `subscriptions_${String(index + 1).padStart(4, "0")}`,
        "subscriptions",
        normalize(subscription.userId || subscription.adminUserId) || null,
        normalize(subscription.companyId) || null,
        normalizeStatus(subscription.status),
        JSON.stringify(subscription),
      ],
    );
  }

  await client.query(
    `insert into eazinvoice_audit_events (event_type, entity_type, metadata)
     values ($1, $2, $3::jsonb)`,
    [
      "entitlement_mirrors_reconciled",
      "subscription",
      JSON.stringify({
        source: sourceLabel,
        subscriptions: sourceSubscriptions.length,
        backup: "eazinvoice_legacy_snapshots",
      }),
    ],
  );
}

try {
  const store = createStore();
  const api = createApi({ store });
  const sourceSubscriptions = api.listSubscriptions();
  const usersById = new Map(api.listUsers().map((user) => [normalize(user.id), user]));

  console.log(`database: ${maskDatabaseUrl()}`);
  console.log(`source: ${sourceLabel}`);

  await withPostgresClient(async (client) => {
    const postgresSubscriptions = await loadPostgresSubscriptions(client);
    const diffs = findDiffs(sourceSubscriptions, postgresSubscriptions, usersById);
    printDiffs(diffs);

    if (!shouldApply) {
      if (diffs.length) {
        console.log("Dry run only. Re-run with --apply to back up and align Postgres entitlement mirrors.");
      }
      return;
    }

    if (!diffs.length) {
      console.log("Nothing to apply.");
      return;
    }

    await client.query("BEGIN");
    try {
      await replacePostgresEntitlementMirrors(client, sourceSubscriptions, {
        source: sourceLabel,
        before: postgresSubscriptions,
        after: sourceSubscriptions,
        diffs,
      });
      await client.query("COMMIT");
      console.log("Postgres entitlement mirrors reconciled from the current runtime JSON source.");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
} finally {
  await closePostgresPool();
}
