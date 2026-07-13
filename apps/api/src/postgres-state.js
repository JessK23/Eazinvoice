import { withPostgresClient } from "./postgres.js";

export const STATE_COLLECTIONS = [
  "users",
  "companies",
  "customers",
  "vendors",
  "invoices",
  "purchaseOrders",
  "payments",
  "subscriptions",
  "billingOrders",
  "monetization",
  "reports",
  "aiUsageLogs",
  "teamMembers",
  "approvalRequests",
  "apiKeys",
  "businessSettings",
];

export const STATE_KEY = "primary";

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function ownerUserIdForRecord(recordType, record) {
  if (!record || typeof record !== "object") return null;
  if (record.ownerUserId) return record.ownerUserId;
  if (record.userId) return record.userId;
  if (record.adminUserId) return record.adminUserId;
  if (recordType === "users") return record.id || null;
  return null;
}

export function companyIdForRecord(record) {
  if (!record || typeof record !== "object") return null;
  return record.companyId || record.businessId || null;
}

export function statusForRecord(record) {
  if (!record || typeof record !== "object") return "active";
  return String(record.status || record.paymentStatus || "active");
}

export function idForRecord(recordType, record, index) {
  if (record && typeof record === "object" && record.id) return String(record.id);
  return `${recordType}_${String(index + 1).padStart(4, "0")}`;
}

const COUNTER_COLLECTIONS = {
  user: "users",
  company: "companies",
  customer: "customers",
  vendor: "vendors",
  invoice: "invoices",
  purchaseOrder: "purchaseOrders",
  payment: "payments",
  subscription: "subscriptions",
  billingOrder: "billingOrders",
  monetization: "monetization",
  report: "reports",
  aiUsageLog: "aiUsageLogs",
  teamMember: "teamMembers",
  approvalRequest: "approvalRequests",
  apiKey: "apiKeys",
  businessSetting: "businessSettings",
};

const COUNTER_PREFIXES = {
  user: "usr",
  company: "cmp",
  customer: "cus",
  vendor: "ven",
  invoice: "inv",
  purchaseOrder: "po",
  payment: "pay",
  subscription: "sub",
  billingOrder: "bill",
  monetization: "mon",
  report: "rep",
  aiUsageLog: "ai",
  teamMember: "tm",
  approvalRequest: "apr",
  apiKey: "key",
  businessSetting: "bs",
};

export function deriveCounters(state) {
  const counters = {};
  Object.entries(COUNTER_COLLECTIONS).forEach(([counterName, collectionName]) => {
    const prefix = COUNTER_PREFIXES[counterName];
    let max = 0;
    toArray(state[collectionName]).forEach((record) => {
      const match = String(record?.id || "").match(new RegExp(`^${prefix}_(\\d+)$`));
      if (match) max = Math.max(max, Number(match[1]));
    });
    counters[counterName] = max;
  });
  return counters;
}

export function normalizeStateDocument(state) {
  const normalized = clone(state);
  STATE_COLLECTIONS.forEach((collection) => {
    normalized[collection] = toArray(normalized[collection]);
  });
  normalized.counters = {
    ...deriveCounters(normalized),
    ...(normalized.counters && typeof normalized.counters === "object" ? normalized.counters : {}),
  };
  return normalized;
}

async function replaceIndexedRecords(client, state) {
  await client.query("delete from eazinvoice_records");
  for (const collection of STATE_COLLECTIONS) {
    const records = toArray(state[collection]);
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      await client.query(
        `insert into eazinvoice_records
          (id, record_type, owner_user_id, company_id, status, record, updated_at)
         values ($1, $2, $3, $4, $5, $6::jsonb, now())`,
        [
          idForRecord(collection, record, index),
          collection,
          ownerUserIdForRecord(collection, record),
          companyIdForRecord(record),
          statusForRecord(record),
          JSON.stringify(record),
        ],
      );
    }
  }
}

export async function saveStateToPostgres(state, options = {}) {
  const normalized = normalizeStateDocument(state);
  const metadata = {
    source: options.source || "unknown",
    sourcePath: options.sourcePath || "",
    counts: Object.fromEntries(STATE_COLLECTIONS.map((collection) => [collection, normalized[collection].length])),
  };

  await withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `insert into eazinvoice_state_documents (state_key, state, source, source_path, updated_at)
         values ($1, $2::jsonb, $3, $4, now())
         on conflict (state_key) do update set
          state = excluded.state,
          source = excluded.source,
          source_path = excluded.source_path,
          version = eazinvoice_state_documents.version + 1,
          updated_at = now()`,
        [STATE_KEY, JSON.stringify(normalized), metadata.source, metadata.sourcePath],
      );
      await replaceIndexedRecords(client, normalized);
      await client.query(
        `insert into eazinvoice_audit_events (event_type, entity_type, metadata)
         values ($1, $2, $3::jsonb)`,
        ["postgres_state_saved", "system", JSON.stringify(metadata)],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  return metadata;
}

export async function loadStateFromPostgres() {
  return withPostgresClient(async (client) => {
    const document = await client.query(
      "select state from eazinvoice_state_documents where state_key = $1",
      [STATE_KEY],
    );
    if (document.rows[0]?.state) {
      return normalizeStateDocument(document.rows[0].state);
    }

    const records = await client.query(
      "select record_type, record from eazinvoice_records order by record_type, id",
    );
    const state = {};
    STATE_COLLECTIONS.forEach((collection) => {
      state[collection] = [];
    });
    records.rows.forEach((row) => {
      if (!STATE_COLLECTIONS.includes(row.record_type)) return;
      state[row.record_type].push(row.record);
    });
    state.counters = deriveCounters(state);
    return normalizeStateDocument(state);
  });
}

export async function describePostgresState() {
  return withPostgresClient(async (client) => {
    const document = await client.query(
      `select state_key, source, source_path, version, updated_at
       from eazinvoice_state_documents
       where state_key = $1`,
      [STATE_KEY],
    );
    const counts = await client.query(
      "select record_type, count(*)::int as count from eazinvoice_records group by record_type order by record_type",
    );
    return {
      hasStateDocument: Boolean(document.rows[0]),
      stateDocument: document.rows[0] || null,
      recordCounts: counts.rows,
    };
  });
}
