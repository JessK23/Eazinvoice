import {
  getActivePlanDefinition,
  getActiveSubscription,
  getPlanDefinition,
  listPlans,
  resolvePlanUsageStatus,
} from "./plans.js";
import { hasPostgresConfig, withPostgresClient } from "./postgres.js";

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isoDate(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toISOString();
}

function recordValue(record, ...keys) {
  if (!record || typeof record !== "object") return undefined;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") return record[key];
  }
  return undefined;
}

function normalizeSubscription(row) {
  const record = row.record && typeof row.record === "object" ? row.record : {};
  return {
    ...record,
    id: row.id,
    userId: row.user_id,
    companyId: recordValue(record, "companyId", "company_id") || null,
    subscriberType: recordValue(record, "subscriberType", "subscriber_type") || "individual",
    subscriberName: recordValue(record, "subscriberName", "subscriber_name") || "",
    plan: row.plan || "free",
    amount: numberValue(row.amount),
    monthlyAmount: numberValue(row.monthly_amount),
    annualAmount: numberValue(row.annual_amount),
    currency: recordValue(record, "currency") || "INR",
    billingCycle: row.billing_cycle || "yearly",
    status: row.status || "active",
    gateway: row.gateway || "",
    gatewayOrderId: row.gateway_order_id || "",
    gatewayPaymentId: row.gateway_payment_id || "",
    startedAt: isoDate(row.starts_at || recordValue(record, "startedAt") || row.created_at),
    expiresAt: isoDate(row.expires_at || recordValue(record, "expiresAt")),
    renewsAt: isoDate(recordValue(record, "renewsAt") || row.expires_at),
    createdAt: isoDate(row.created_at),
    updatedAt: isoDate(row.updated_at),
  };
}

export function usePostgresEntitlements(options = {}) {
  const requested = options.entitlementsSource || process.env.EAZINVOICE_ENTITLEMENTS_SOURCE || "";
  return String(requested).trim().toLowerCase() === "postgres";
}

export async function listPostgresSubscriptionsForUser(userId) {
  if (!hasPostgresConfig()) {
    return {
      available: false,
      subscriptions: [],
    };
  }
  return withPostgresClient(async (client) => {
    const result = await client.query(
      `select *
       from eazinvoice_subscriptions
       where user_id = $1
       order by coalesce(starts_at, created_at) asc, created_at asc`,
      [userId],
    );
    return {
      available: true,
      subscriptions: result.rows.map(normalizeSubscription),
    };
  });
}

async function countPostgresUsage(client, user) {
  if (!user) {
    const totals = await client.query(
      `select
        (select count(*)::int from eazinvoice_business_profiles where lower(coalesce(status, '')) <> 'deleted') as companies,
        (select count(*)::int from eazinvoice_customers where lower(coalesce(status, '')) <> 'deleted') as customers,
        (select count(*)::int from eazinvoice_invoices where lower(coalesce(status, '')) <> 'deleted') as invoices_per_month,
        (select coalesce(max(item_count), 0)::int from (
          select count(*) as item_count
          from eazinvoice_invoice_items
          group by invoice_id
        ) item_counts) as invoice_items_per_invoice`,
    );
    const row = totals.rows[0] || {};
    return {
      companies: numberValue(row.companies),
      customers: numberValue(row.customers),
      invoicesPerMonth: numberValue(row.invoices_per_month),
      invoiceItemsPerInvoice: numberValue(row.invoice_items_per_invoice),
      templates: 1,
      aiCommandsPerMonth: 0,
    };
  }

  const result = await client.query(
    `with user_companies as (
       select id
       from eazinvoice_business_profiles
       where owner_user_id = $1
     ),
     user_invoices as (
       select id
       from eazinvoice_invoices
       where lower(coalesce(status, '')) <> 'deleted'
        and (owner_user_id = $1 or company_id in (select id from user_companies))
     )
     select
      (select count(*)::int from user_companies) as companies,
      (select count(*)::int
       from eazinvoice_customers
       where lower(coalesce(status, '')) <> 'deleted'
        and (owner_user_id = $1 or company_id in (select id from user_companies))) as customers,
      (select count(*)::int from user_invoices) as invoices_per_month,
      (select coalesce(max(item_count), 0)::int from (
        select count(*) as item_count
        from eazinvoice_invoice_items
        where invoice_id in (select id from user_invoices)
        group by invoice_id
      ) item_counts) as invoice_items_per_invoice`,
    [user.id],
  );
  const row = result.rows[0] || {};
  return {
    companies: numberValue(row.companies),
    customers: numberValue(row.customers),
    invoicesPerMonth: numberValue(row.invoices_per_month),
    invoiceItemsPerInvoice: numberValue(row.invoice_items_per_invoice),
    templates: 1,
    aiCommandsPerMonth: 0,
  };
}

export async function summarizePostgresEntitlements(user, options = {}) {
  if (!hasPostgresConfig()) {
    return {
      available: false,
      reason: "DATABASE_URL is not configured.",
    };
  }
  return withPostgresClient(async (client) => {
    const subscriptionsResult = user
      ? await client.query(
        `select *
         from eazinvoice_subscriptions
         where user_id = $1
         order by coalesce(starts_at, created_at) asc, created_at asc`,
        [user.id],
      )
      : { rows: [] };
    const subscriptions = subscriptionsResult.rows.map(normalizeSubscription);
    const usage = await countPostgresUsage(client, user);
    const activeSubscription = getActiveSubscription(subscriptions);
    const previewPlan = options.previewPlan ? getPlanDefinition(options.previewPlan) : null;
    const activePlan = previewPlan || getActivePlanDefinition(subscriptions);
    return {
      available: true,
      source: "postgres",
      plan: activePlan.plan,
      label: activePlan.label,
      limits: activePlan.limits,
      features: activePlan.features,
      highlights: activePlan.highlights,
      subscription: activeSubscription,
      preview: previewPlan
        ? {
          enabled: true,
          plan: activePlan.plan,
          label: activePlan.label,
        }
        : {
          enabled: false,
        },
      catalog: listPlans(),
      usage,
      status: resolvePlanUsageStatus(usage, activePlan.limits),
    };
  });
}
