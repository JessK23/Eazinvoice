import { hasPostgresConfig, withPostgresClient, withPostgresTransaction } from "./postgres.js";
import { CANONICAL_SYSTEM_ACCOUNTS, LEGACY_COMPATIBILITY_ACCOUNTS, ACCOUNTING_AUTHORITY_MIGRATION, chartFingerprint, classifyLegacyAccount } from "./accounting-chart.js";

const DEFAULT_ACCOUNTS = [...CANONICAL_SYSTEM_ACCOUNTS, ...LEGACY_COMPATIBILITY_ACCOUNTS];

const ACCOUNT_TYPES = new Set(["asset", "liability", "equity", "income", "expense"]);
const NORMAL_BALANCES = new Set(["debit", "credit"]);

function text(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const trimmed = String(value).trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function num(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : fallback;
}

function jsonObject(value) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}

function taxPostingLines(accountIds, tax, record, currency, direction = "output") {
  const source = jsonObject(record);
  const cgst = num(source.cgstAmount ?? source.cgst, 0);
  const sgst = num(source.sgstAmount ?? source.sgst, 0);
  const igst = num(source.igstAmount ?? source.igst, 0);
  const splitTotal = num(cgst + sgst + igst);
  if (tax > 0 && Math.abs(splitTotal - tax) <= 0.01) {
    const codes = direction === "input"
      ? [["2211", cgst], ["2212", sgst], ["2213", igst]]
      : [["2201", cgst], ["2202", sgst], ["2203", igst]];
    return codes.filter(([, amount]) => amount > 0).map(([code, amount]) => ({ accountId: accountIds.get(code), [direction === "input" ? "debit" : "credit"]: amount, currency }));
  }
  const legacyCode = direction === "input" ? "2210" : "2200";
  return tax > 0 ? [{ accountId: accountIds.get(legacyCode), [direction === "input" ? "debit" : "credit"]: tax, currency, record: { compatibility: "legacy_generic_gst" } }] : [];
}

function dateOnly(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function accountId(ownerUserId, companyId, code) {
  return [ownerUserId || "global", companyId || "default", code].join(":");
}

function accountMap(accounts) {
  return new Map(accounts.map((account) => [account.account_code, account.id]));
}

function publicAccount(row) {
  return {
    id: row.id,
    accountCode: row.account_code,
    accountName: row.account_name,
    accountType: row.account_type,
    normalBalance: row.normal_balance,
    systemAccount: Boolean(row.system_account),
    status: row.status || "active",
  };
}

function publicJournal(row, lines = []) {
  return {
    id: row.id,
    journalNumber: row.journal_number,
    journalDate: dateOnly(row.journal_date),
    narration: row.narration || "",
    status: row.status || "posted",
    currency: row.currency || "INR",
    totalDebit: num(row.total_debit),
    totalCredit: num(row.total_credit),
    lines,
  };
}

function transactionId(prefix) {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function accountingOwnerId(user, options = {}) {
  return options.workspaceOwnerUserId || options.ownerUserId || user?.id || "";
}

function accountingOwnerUser(user, options = {}) {
  return { ...user, id: accountingOwnerId(user, options) };
}

function dateRange(options = {}) {
  const params = [];
  const where = [];
  const from = text(options.from, options.startDate);
  const to = text(options.to, options.endDate);
  if (from) {
    params.push(dateOnly(from));
    where.push(`t.transaction_date >= $${params.length}`);
  }
  if (to) {
    params.push(dateOnly(to));
    where.push(`t.transaction_date <= $${params.length}`);
  }
  return { params, where };
}

function createdStatus(alias) {
  return `lower(coalesce(${alias}.status, '')) not in ('draft', 'deleted', 'cancelled')`;
}

async function ensureDefaultAccounts(client, ownerUserId, companyId = null) {
  const accounts = [];
  for (const definition of DEFAULT_ACCOUNTS) {
    const code = definition.code;
    const name = definition.name;
    const type = definition.type;
    const normalBalance = definition.normalBalance;
    const accountRole = definition.role;
    const balanceSheetCategory = definition.balanceSheetCategory;
    const id = accountId(ownerUserId, companyId, code);
    const result = await client.query(
      `insert into eazinvoice_ledger_accounts
        (id, owner_user_id, company_id, account_code, account_name, account_type, normal_balance, system_account, account_role, balance_sheet_category, record, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10::jsonb, now())
       on conflict (id) do update set
        account_role = coalesce(eazinvoice_ledger_accounts.account_role, excluded.account_role),
        balance_sheet_category = coalesce(eazinvoice_ledger_accounts.balance_sheet_category, excluded.balance_sheet_category),
        record = eazinvoice_ledger_accounts.record || excluded.record,
        system_account = true,
        updated_at = now()
       returning id, account_code, account_name, account_type, normal_balance, system_account, status`,
      [id, ownerUserId, companyId, code, name, type, normalBalance, accountRole, balanceSheetCategory, JSON.stringify({ authority: ACCOUNTING_AUTHORITY_MIGRATION, chartFingerprint: chartFingerprint(), canonicalRole: accountRole })],
    );
    accounts.push(result.rows[0]);
  }
  return accounts;
}

async function classifyPostgresAccount(client, account, ownerUserId, companyId) {
  const bankMapping = await client.query(
    `select count(*)::int as count from eazinvoice_bank_accounts
     where owner_user_id = $1 and ledger_account_id = $2 and status <> 'deleted'`,
    [ownerUserId, account.id],
  );
  const reconciliation = await client.query(
    `select count(*)::int as count
     from eazinvoice_bank_reconciliation_matches m
     join eazinvoice_bank_accounts b on b.id = m.bank_account_id
     where b.owner_user_id = $1 and b.ledger_account_id = $2 and m.status = 'matched'`,
    [ownerUserId, account.id],
  );
  const journalUsage = await client.query(
    `select count(*)::int as count,
      count(*) filter (where lower(coalesce(t.source_type, '')) in ('payment', 'customer_payment', 'customer_payment_reversal', 'customer_refund', 'provider_payment'))::int as clearing_count
     from eazinvoice_ledger_entries e
     join eazinvoice_ledger_transactions t on t.id = e.transaction_id
     where e.owner_user_id = $1 and e.account_id = $2 and ($3::text is null or e.company_id = $3)`,
    [ownerUserId, account.id, companyId || null],
  );
  const openingBalance = await client.query(
    `select count(*)::int as count from eazinvoice_opening_balance_sets
     where business_id = $1 and status <> 'cancelled'`,
    [companyId || ownerUserId],
  );
  return classifyLegacyAccount({
    account,
    hasBankMapping: Number(bankMapping.rows[0]?.count || 0) > 0,
    hasReconciliation: Number(reconciliation.rows[0]?.count || 0) > 0,
    hasClearingUsage: Number(journalUsage.rows[0]?.clearing_count || 0) > 0,
    hasOtherJournalUsage: Number(journalUsage.rows[0]?.count || 0) > Number(journalUsage.rows[0]?.clearing_count || 0),
    hasOpeningBalance: Number(openingBalance.rows[0]?.count || 0) > 0,
  });
}

async function migrateAccountingAuthority(client, ownerUserId, companyId = null) {
  const businessId = companyId || ownerUserId;
  const migrationId = `${businessId}:${ACCOUNTING_AUTHORITY_MIGRATION}`;
  await client.query("select pg_advisory_xact_lock(hashtext($1))", [migrationId]);
  const existing = await client.query(
    `select id, status, fingerprint from eazinvoice_accounting_authority_migrations
     where business_id = $1 and migration_version = $2 for update`,
    [businessId, ACCOUNTING_AUTHORITY_MIGRATION],
  );
  if (existing.rows[0]?.status === "completed" && existing.rows[0].fingerprint === chartFingerprint()) {
    return { status: "completed", replay: true, migrationId };
  }
  if (existing.rows[0]?.status === "manual_review") {
    return { status: "manual_review", replay: true, migrationId };
  }
  await client.query(
    `insert into eazinvoice_accounting_authority_migrations
      (id, business_id, migration_version, status, fingerprint, attempt_count, started_at, updated_at)
     values ($1, $2, $3, 'processing', $4, 1, now(), now())
     on conflict (business_id, migration_version) do update set
      status = 'processing', fingerprint = excluded.fingerprint,
      attempt_count = eazinvoice_accounting_authority_migrations.attempt_count + 1,
      started_at = now(), updated_at = now()
     returning id`,
    [migrationId, businessId, ACCOUNTING_AUTHORITY_MIGRATION, chartFingerprint()],
  );
  const accounts = await client.query(
    `select id, account_code as "accountCode", account_name as "accountName", account_type as "accountType",
      normal_balance as "normalBalance", account_role as "accountRole"
     from eazinvoice_ledger_accounts
     where owner_user_id = $1 and ($2::text is null or company_id = $2) and status <> 'deleted'
     for update`,
    [ownerUserId, companyId || null],
  );
  const byCode = new Map(accounts.rows.map((account) => [account.accountCode, account]));
  const classifications = [];
  const roleCounts = new Map(accounts.rows.map((account) => [account.accountRole, (accounts.rows.filter((candidate) => candidate.accountRole === account.accountRole).length)]));
  if (["accounts_receivable", "bank_clearing", "customer_advances"].some((role) => (roleCounts.get(role) || 0) > 1)) {
    classifications.push({ status: "manual_review", reasonCode: "duplicate_canonical_role" });
  }
  for (const code of ["1100", "1110", "2110"]) {
    const account = byCode.get(code);
    if (!account) continue;
    const classification = await classifyPostgresAccount(client, account, ownerUserId, companyId);
    classifications.push({ accountId: account.id, code, ...classification });
  }
  for (const code of ["2200", "2210"]) {
    const account = byCode.get(code);
    if (!account) continue;
    const classification = await classifyPostgresAccount(client, account, ownerUserId, companyId);
    classifications.push({ accountId: account.id, code, ...classification, compatibility: true });
  }
  const manualReasons = classifications
    .filter((item) => item.status === "manual_review" || (item.code === "1110" && item.status === "compatibility_map"))
    .map((item) => item.reasonCode || "ambiguous_account_authority");
  if (manualReasons.length) {
    await client.query(
      `update eazinvoice_accounting_authority_migrations
       set status = 'manual_review', classification = $2::jsonb, reason_codes = $3::jsonb, completed_at = null, updated_at = now()
       where id = $1`,
      [migrationId, JSON.stringify(classifications), JSON.stringify([...new Set(manualReasons)])],
    );
    return { status: "manual_review", migrationId, classifications, reasonCodes: [...new Set(manualReasons)] };
  }
  for (const definition of CANONICAL_SYSTEM_ACCOUNTS) {
    const id = accountId(ownerUserId, companyId, definition.code);
    await client.query(
      `insert into eazinvoice_ledger_accounts
        (id, owner_user_id, company_id, account_code, account_name, account_type, normal_balance, system_account, account_role, balance_sheet_category, record, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10::jsonb, now())
       on conflict (id) do update set
        account_role = coalesce(eazinvoice_ledger_accounts.account_role, excluded.account_role),
        balance_sheet_category = coalesce(eazinvoice_ledger_accounts.balance_sheet_category, excluded.balance_sheet_category),
        record = coalesce(eazinvoice_ledger_accounts.record, '{}'::jsonb) || excluded.record,
        updated_at = now()`,
      [id, ownerUserId, companyId, definition.code, definition.name, definition.type, definition.normalBalance, definition.role, definition.balanceSheetCategory, JSON.stringify({ authority: ACCOUNTING_AUTHORITY_MIGRATION, canonicalRole: definition.role, chartFingerprint: chartFingerprint() })],
    );
  }
  const mappingRows = classifications.filter((item) => item.accountId && item.status !== "manual_review");
  for (const item of mappingRows) {
    const role = item.code === "2200" ? "legacy_output_gst_compatibility" : item.code === "2210" ? "legacy_input_gst_compatibility" : CANONICAL_SYSTEM_ACCOUNTS.find((definition) => definition.code === item.code)?.role;
    if (!role) continue;
    await client.query(
      `insert into eazinvoice_accounting_authority_mappings
        (id, business_id, migration_id, legacy_account_id, canonical_role, mapping_status, reason_code)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (business_id, legacy_account_id, canonical_role) do update set
        migration_id = excluded.migration_id, mapping_status = excluded.mapping_status, reason_code = excluded.reason_code`,
      [`${businessId}:${item.accountId}:${role}`, businessId, migrationId, item.accountId, role, item.compatibility ? "historical_compatibility" : "canonical_identity", item.reasonCode || "deterministic_authority"],
    );
  }
  for (const definition of CANONICAL_SYSTEM_ACCOUNTS) {
    const account = byCode.get(definition.code);
    if (account && account.accountRole && account.accountRole !== definition.role) {
      await client.query(
        `update eazinvoice_ledger_accounts
         set account_role = $3, balance_sheet_category = $4,
             record = coalesce(record, '{}'::jsonb) || $5::jsonb, updated_at = now()
         where id = $1 and owner_user_id = $2`,
        [account.id, ownerUserId, definition.role, definition.balanceSheetCategory, JSON.stringify({ authority: ACCOUNTING_AUTHORITY_MIGRATION, canonicalRole: definition.role })],
      );
    }
  }
  await client.query(
    `update eazinvoice_accounting_authority_migrations
     set status = 'completed', classification = $2::jsonb, reason_codes = '[]'::jsonb, completed_at = now(), updated_at = now()
     where id = $1`,
    [migrationId, JSON.stringify(classifications)],
  );
  return { status: "completed", replay: false, migrationId, classifications };
}

async function runAccountingAuthorityMigration(ownerUserId, companyId = null) {
  return withPostgresTransaction((client) => migrateAccountingAuthority(client, ownerUserId, companyId), {
    businessId: companyId || undefined,
    actorUserId: ownerUserId,
  });
}

async function requireAccountingAuthority(ownerUserId, companyId = null) {
  const result = await runAccountingAuthorityMigration(ownerUserId, companyId);
  if (result.status === "manual_review") {
    throw new Error(`Accounting authority migration requires manual review: ${(result.reasonCodes || []).join(", ")}`);
  }
  return result;
}

export async function requireCompletedAccountingAuthority(client, businessId) {
  if (!client || typeof client.query !== "function" || !businessId) {
    throw new Error("Durable accounting authority validation is required before settlement posting.");
  }
  const result = await client.query(
    `select business_id, migration_version, status, fingerprint
     from eazinvoice_accounting_authority_migrations
     where business_id = $1 and migration_version = $2
     for update`,
    [businessId, ACCOUNTING_AUTHORITY_MIGRATION],
  );
  const row = result.rows[0];
  if (!row || row.business_id !== businessId || row.migration_version !== ACCOUNTING_AUTHORITY_MIGRATION) {
    throw new Error("Accounting authority migration is missing.");
  }
  if (row.status !== "completed") throw new Error(`Accounting authority migration is ${row.status || "invalid"}.`);
  if (!row.fingerprint || row.fingerprint !== chartFingerprint()) {
    throw new Error("Accounting authority migration chart fingerprint is stale or invalid.");
  }
  return row;
}

async function listAccounts(client, ownerUserId, companyId = null) {
  await ensureDefaultAccounts(client, ownerUserId, companyId);
  const params = [ownerUserId];
  const where = ["owner_user_id = $1", "status <> 'deleted'"];
  if (companyId) {
    params.push(companyId);
    where.push(`company_id = $${params.length}`);
  } else {
    where.push("company_id is null");
  }
  const result = await client.query(
    `select id, account_code, account_name, account_type, normal_balance, system_account, status
     from eazinvoice_ledger_accounts
     where ${where.join(" and ")}
     order by account_code`,
    params,
  );
  return result.rows;
}

async function requireAccount(client, ownerUserId, accountIdValue, companyId = null) {
  const params = [ownerUserId, accountIdValue];
  const where = ["owner_user_id = $1", "id = $2", "status <> 'deleted'"];
  if (companyId) {
    params.push(companyId);
    where.push(`company_id = $${params.length}`);
  }
  const result = await client.query(
    `select id, account_code, account_name, account_type, normal_balance
     from eazinvoice_ledger_accounts
     where ${where.join(" and ")}
     limit 1`,
    params,
  );
  if (!result.rows[0]) throw new Error("Ledger account not found");
  return result.rows[0];
}

async function replaceDerivedTransaction(client, transaction, entries) {
  await client.query("delete from eazinvoice_ledger_entries where transaction_id = $1", [transaction.id]);
  await client.query(
    `insert into eazinvoice_ledger_transactions
      (id, owner_user_id, company_id, transaction_date, source_type, source_id, reference_number, narration, status, record, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'posted', $9::jsonb, now())
     on conflict (id) do update set
      transaction_date = excluded.transaction_date,
      reference_number = excluded.reference_number,
      narration = excluded.narration,
      status = excluded.status,
      record = excluded.record,
      updated_at = now()`,
    [
      transaction.id,
      transaction.ownerUserId,
      transaction.companyId || null,
      transaction.transactionDate,
      transaction.sourceType,
      transaction.sourceId,
      transaction.referenceNumber,
      transaction.narration,
      JSON.stringify(transaction.record || {}),
    ],
  );

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (num(entry.debit) === 0 && num(entry.credit) === 0) continue;
    await client.query(
      `insert into eazinvoice_ledger_entries
        (id, transaction_id, owner_user_id, company_id, account_id, debit, credit, currency, record, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now())
       on conflict (id) do update set
        debit = excluded.debit,
        credit = excluded.credit,
        currency = excluded.currency,
        record = excluded.record,
        updated_at = now()`,
      [
        `${transaction.id}:line:${index + 1}`,
        transaction.id,
        transaction.ownerUserId,
        transaction.companyId || null,
        entry.accountId,
        num(entry.debit),
        num(entry.credit),
        text(entry.currency, "INR"),
        JSON.stringify(entry.record || {}),
      ],
    );
  }
}

async function syncInvoices(client, user, companyId, accounts) {
  const map = accountMap(accounts);
  const params = [user.id];
  const where = [`i.owner_user_id = $1`, createdStatus("i")];
  if (companyId) {
    params.push(companyId);
    where.push(`i.company_id = $${params.length}`);
  }
  const result = await client.query(
    `select id, owner_user_id, company_id, invoice_number, invoice_date, currency, subtotal, discount, tax_amount, total, paid_amount, record
     from eazinvoice_invoices i
     where ${where.join(" and ")}`,
    params,
  );

  for (const row of result.rows) {
    const subtotal = num(row.subtotal) - num(row.discount);
    const tax = num(row.tax_amount);
    const total = num(row.total);
    const taxLines = taxPostingLines(map, tax, row.record, row.currency, "output");
    await replaceDerivedTransaction(client, {
      id: `invoice:${row.id}`,
      ownerUserId: row.owner_user_id,
      companyId: row.company_id,
      transactionDate: dateOnly(row.invoice_date),
      sourceType: "invoice",
      sourceId: row.id,
      referenceNumber: row.invoice_number,
      narration: `Invoice ${row.invoice_number || row.id}`,
      record: { derived: true },
    }, [
      { accountId: map.get("1100"), debit: total, currency: row.currency },
      { accountId: map.get("4100"), credit: subtotal, currency: row.currency },
      ...taxLines,
    ]);

    const paid = num(row.paid_amount);
    if (paid > 0) {
      await replaceDerivedTransaction(client, {
        id: `invoice-payment:${row.id}`,
        ownerUserId: row.owner_user_id,
        companyId: row.company_id,
        transactionDate: dateOnly(row.invoice_date),
        sourceType: "invoice_payment",
        sourceId: row.id,
        referenceNumber: row.invoice_number,
        narration: `Payment received for invoice ${row.invoice_number || row.id}`,
        record: { derived: true, aggregate: true },
      }, [
        { accountId: map.get("1110"), debit: paid, currency: row.currency },
        { accountId: map.get("1100"), credit: paid, currency: row.currency },
      ]);
    }
  }
  return result.rows.length;
}

async function syncPurchaseOrders(client, user, companyId, accounts) {
  const map = accountMap(accounts);
  const params = [user.id];
  const where = [`p.owner_user_id = $1`, createdStatus("p")];
  if (companyId) {
    params.push(companyId);
    where.push(`p.company_id = $${params.length}`);
  }
  const result = await client.query(
    `select id, owner_user_id, company_id, po_number, po_date, currency, subtotal, discount, tax_amount, total, paid_amount, record
     from eazinvoice_purchase_orders p
     where ${where.join(" and ")}`,
    params,
  );

  for (const row of result.rows) {
    const subtotal = num(row.subtotal) - num(row.discount);
    const tax = num(row.tax_amount);
    const total = num(row.total);
    const taxLines = taxPostingLines(map, tax, row.record, row.currency, "input");
    await replaceDerivedTransaction(client, {
      id: `purchase-order:${row.id}`,
      ownerUserId: row.owner_user_id,
      companyId: row.company_id,
      transactionDate: dateOnly(row.po_date),
      sourceType: "purchase_order",
      sourceId: row.id,
      referenceNumber: row.po_number,
      narration: `PO/WO ${row.po_number || row.id}`,
      record: { derived: true },
    }, [
      { accountId: map.get("5100"), debit: subtotal, currency: row.currency },
      ...taxLines,
      { accountId: map.get("2100"), credit: total, currency: row.currency },
    ]);

    const paid = num(row.paid_amount);
    if (paid > 0) {
      await replaceDerivedTransaction(client, {
        id: `purchase-order-payment:${row.id}`,
        ownerUserId: row.owner_user_id,
        companyId: row.company_id,
        transactionDate: dateOnly(row.po_date),
        sourceType: "purchase_order_payment",
        sourceId: row.id,
        referenceNumber: row.po_number,
        narration: `Payment made for PO/WO ${row.po_number || row.id}`,
        record: { derived: true, aggregate: true },
      }, [
        { accountId: map.get("2100"), debit: paid, currency: row.currency },
        { accountId: map.get("1110"), credit: paid, currency: row.currency },
      ]);
    }
  }
  return result.rows.length;
}

async function trialBalance(client, user, companyId) {
  const params = [user.id];
  const where = [`a.owner_user_id = $1`, `a.status <> 'deleted'`];
  if (companyId) {
    params.push(companyId);
    where.push(`a.company_id = $${params.length}`);
  }
  const result = await client.query(
    `select a.id, a.account_code, a.account_name, a.account_type, a.normal_balance,
      coalesce(sum(e.debit), 0)::numeric as debit,
      coalesce(sum(e.credit), 0)::numeric as credit
     from eazinvoice_ledger_accounts a
     left join eazinvoice_ledger_entries e on e.account_id = a.id
     where ${where.join(" and ")}
     group by a.id, a.account_code, a.account_name, a.account_type, a.normal_balance
     order by a.account_code`,
    params,
  );
  return result.rows.map((row) => ({
    id: row.id,
    accountCode: row.account_code,
    accountName: row.account_name,
    accountType: row.account_type,
    normalBalance: row.normal_balance,
    debit: num(row.debit),
    credit: num(row.credit),
    balance: row.normal_balance === "debit" ? num(row.debit) - num(row.credit) : num(row.credit) - num(row.debit),
  }));
}

function summarizeRows(rows) {
  const byType = rows.reduce((summary, row) => {
    summary[row.accountType] = num((summary[row.accountType] || 0) + row.balance);
    return summary;
  }, {});
  return {
    assets: byType.asset || 0,
    liabilities: byType.liability || 0,
    income: byType.income || 0,
    expenses: byType.expense || 0,
    equity: byType.equity || 0,
    profit: num((byType.income || 0) - (byType.expense || 0)),
  };
}

function statementLines(rows, accountType) {
  return rows
    .filter((row) => row.accountType === accountType && Math.abs(num(row.balance)) > 0.009)
    .map((row) => ({
      accountCode: row.accountCode,
      accountName: row.accountName,
      balance: num(row.balance),
    }));
}

function statementBalance(rows, accountCode) {
  return num(rows.find((row) => row.accountCode === accountCode)?.balance || 0);
}

function statementBalances(rows, accountCodes) {
  return num(accountCodes.reduce((sum, code) => sum + statementBalance(rows, code), 0));
}

function buildAccountingStatements(rows) {
  const summary = summarizeRows(rows);
  const cashAndBank = num(statementBalance(rows, "1110") + statementBalance(rows, "1120"));
  const receivables = statementBalance(rows, "1100");
  const payables = statementBalance(rows, "2100");
  const gstPayable = statementBalances(rows, ["2200", "2201", "2202", "2203"]);
  const inputGstCredit = statementBalances(rows, ["2210", "2211", "2212", "2213"]);
  const totalLiabilitiesAndEquity = num(summary.liabilities + summary.equity + summary.profit);
  return {
    balanceSheet: {
      assets: summary.assets,
      liabilities: summary.liabilities,
      equity: summary.equity,
      retainedEarnings: summary.profit,
      totalLiabilitiesAndEquity,
      difference: num(summary.assets - totalLiabilitiesAndEquity),
      assetLines: statementLines(rows, "asset"),
      liabilityLines: statementLines(rows, "liability"),
      equityLines: statementLines(rows, "equity"),
    },
    cashFlow: {
      operatingCashFlow: summary.profit,
      cashAndBank,
      receivables,
      payables,
      gstPayable,
      inputGstCredit,
      netWorkingCapital: num(receivables - payables),
      note: "Derived from posted invoices, PO/WO records, payments, and manual journal entries.",
    },
  };
}

async function listJournals(client, ownerUserId, companyId = null) {
  const params = [ownerUserId];
  const where = ["owner_user_id = $1"];
  if (companyId) {
    params.push(companyId);
    where.push(`company_id = $${params.length}`);
  } else {
    where.push("company_id is null");
  }
  const result = await client.query(
    `select id, journal_number, journal_date, narration, status, currency, total_debit, total_credit
     from eazinvoice_journal_entries
     where ${where.join(" and ")}
     order by journal_date desc, created_at desc
     limit 50`,
    params,
  );
  return result.rows.map((row) => publicJournal(row));
}

async function accountLedger(client, ownerUserId, ledgerAccountId, companyId = null) {
  await requireAccount(client, ownerUserId, ledgerAccountId, companyId);
  const params = [ownerUserId, ledgerAccountId];
  const where = ["e.owner_user_id = $1", "e.account_id = $2", "t.status = 'posted'"];
  if (companyId) {
    params.push(companyId);
    where.push(`e.company_id = $${params.length}`);
  }
  const result = await client.query(
    `select t.transaction_date, t.reference_number, t.narration, t.source_type, e.debit, e.credit, e.currency
     from eazinvoice_ledger_entries e
     join eazinvoice_ledger_transactions t on t.id = e.transaction_id
     where ${where.join(" and ")}
     order by t.transaction_date desc, t.updated_at desc
     limit 100`,
    params,
  );
  return result.rows.map((row) => ({
    transactionDate: dateOnly(row.transaction_date),
    referenceNumber: row.reference_number || "",
    narration: row.narration || "",
    sourceType: row.source_type || "",
    debit: num(row.debit),
    credit: num(row.credit),
    currency: row.currency || "INR",
  }));
}

async function bookRows(client, ownerUserId, accountCode, companyId = null) {
  return accountLedger(client, ownerUserId, accountId(ownerUserId, companyId, accountCode), companyId);
}

async function gstLedgerSummary(client, ownerUserId, options = {}) {
  const companyId = options.companyId || null;
  await ensureDefaultAccounts(client, ownerUserId, companyId);
  const range = dateRange(options);
  const params = [ownerUserId, ...range.params];
  const where = [
    "e.owner_user_id = $1",
    "t.status = 'posted'",
    "a.account_code in ('2200', '2201', '2202', '2203', '2210', '2211', '2212', '2213')",
    ...range.where.map((condition, index) => condition.replace(/\$(\d+)/g, `$${Number(index) + 2}`)),
  ];
  if (companyId) {
    params.push(companyId);
    where.push(`e.company_id = $${params.length}`);
  } else {
    where.push("e.company_id is null");
  }
  const totalsResult = await client.query(
    `select a.account_code, a.account_name,
      coalesce(sum(e.debit), 0)::numeric as debit,
      coalesce(sum(e.credit), 0)::numeric as credit
     from eazinvoice_ledger_entries e
     join eazinvoice_ledger_accounts a on a.id = e.account_id
     join eazinvoice_ledger_transactions t on t.id = e.transaction_id
     where ${where.join(" and ")}
     group by a.account_code, a.account_name
     order by a.account_code`,
    params,
  );
  const entriesResult = await client.query(
    `select t.transaction_date, t.reference_number, t.narration, t.source_type,
      a.account_code, a.account_name, e.debit, e.credit, e.currency
     from eazinvoice_ledger_entries e
     join eazinvoice_ledger_accounts a on a.id = e.account_id
     join eazinvoice_ledger_transactions t on t.id = e.transaction_id
     where ${where.join(" and ")}
     order by t.transaction_date desc, t.updated_at desc
     limit 100`,
    params,
  );
  const byCode = new Map(totalsResult.rows.map((row) => [row.account_code, row]));
  const outputGst = num(["2200", "2201", "2202", "2203"].reduce((sum, code) => {
    const row = byCode.get(code) || {};
    return sum + num(row.credit) - num(row.debit);
  }, 0));
  const inputGst = num(["2210", "2211", "2212", "2213"].reduce((sum, code) => {
    const row = byCode.get(code) || {};
    return sum + num(row.debit) - num(row.credit);
  }, 0));
  const netGstPayable = num(outputGst - inputGst);
  return {
    outputGst,
    inputGst,
    netGstPayable,
    gstCreditAvailable: netGstPayable < 0 ? Math.abs(netGstPayable) : 0,
    accounts: totalsResult.rows.map((row) => ({
      accountCode: row.account_code,
      accountName: row.account_name,
      debit: num(row.debit),
      credit: num(row.credit),
      balance: ["2200", "2201", "2202", "2203"].includes(row.account_code)
        ? num(num(row.credit) - num(row.debit))
        : num(num(row.debit) - num(row.credit)),
    })),
    entries: entriesResult.rows.map((row) => ({
      transactionDate: dateOnly(row.transaction_date),
      referenceNumber: row.reference_number || "",
      narration: row.narration || "",
      sourceType: row.source_type || "",
      accountCode: row.account_code,
      accountName: row.account_name,
      debit: num(row.debit),
      credit: num(row.credit),
      currency: row.currency || "INR",
    })),
  };
}

export async function syncAccountingFoundation(user, options = {}) {
  if (!hasPostgresConfig()) {
    return { enabled: false, reason: "DATABASE_URL is not configured." };
  }
  if (!user?.id) throw new Error("Authentication required");
  const ownerUser = accountingOwnerUser(user, options);
  const companyId = options.companyId || null;
  await requireAccountingAuthority(ownerUser.id, companyId);
  return withPostgresTransaction(async (client) => {
    const accounts = await ensureDefaultAccounts(client, ownerUser.id, companyId);
    const invoicesSynced = await syncInvoices(client, ownerUser, companyId, accounts);
    const purchaseOrdersSynced = await syncPurchaseOrders(client, ownerUser, companyId, accounts);
    const allAccounts = await listAccounts(client, ownerUser.id, companyId);
    const rows = await trialBalance(client, ownerUser, companyId);
    const summary = summarizeRows(rows);
    const statements = buildAccountingStatements(rows);
    return {
      enabled: true,
      companyId,
      accounts: allAccounts.map(publicAccount),
      invoicesSynced,
      purchaseOrdersSynced,
      trialBalance: rows,
      summary,
      statements,
      balanceSheet: statements.balanceSheet,
      cashFlow: statements.cashFlow,
    };
  }, { businessId: options.companyId || undefined, actorUserId: ownerUser.id });
}

export async function getAccountingSummary(user, options = {}) {
  return syncAccountingFoundation(user, options);
}

export async function getLedgerAccounts(user, options = {}) {
  if (!hasPostgresConfig()) return { enabled: false, reason: "DATABASE_URL is not configured.", accounts: [] };
  if (!user?.id) throw new Error("Authentication required");
  const ownerUserId = accountingOwnerId(user, options);
  await requireAccountingAuthority(ownerUserId, options.companyId || null);
  return withPostgresClient(async (client) => ({
    enabled: true,
    accounts: (await listAccounts(client, ownerUserId, options.companyId || null)).map(publicAccount),
  }));
}

export async function createLedgerAccount(user, input = {}, options = {}) {
  if (!hasPostgresConfig()) throw new Error("DATABASE_URL is not configured.");
  if (!user?.id) throw new Error("Authentication required");
  const ownerUserId = accountingOwnerId(user, options);
  const companyId = options.companyId || input.companyId || null;
  await requireAccountingAuthority(ownerUserId, companyId);
  const accountCode = text(input.accountCode, input.account_code).toUpperCase();
  const accountName = text(input.accountName, input.account_name);
  const accountType = text(input.accountType, input.account_type, "expense").toLowerCase();
  const defaultBalance = accountType === "liability" || accountType === "equity" || accountType === "income" ? "credit" : "debit";
  const normalBalance = text(input.normalBalance, input.normal_balance, defaultBalance).toLowerCase();
  if (!/^[A-Z0-9-]{3,12}$/.test(accountCode)) throw new Error("Use a 3 to 12 character account code.");
  if (!accountName) throw new Error("Enter an account name.");
  if (!ACCOUNT_TYPES.has(accountType)) throw new Error("Choose a valid account type.");
  if (!NORMAL_BALANCES.has(normalBalance)) throw new Error("Choose debit or credit as normal balance.");
  return withPostgresClient(async (client) => {
    await ensureDefaultAccounts(client, ownerUserId, companyId);
    const id = accountId(ownerUserId, companyId, accountCode);
    const result = await client.query(
      `insert into eazinvoice_ledger_accounts
        (id, owner_user_id, company_id, account_code, account_name, account_type, normal_balance, system_account, status, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, false, 'active', now())
       on conflict (id) do update set
        account_name = excluded.account_name,
        account_type = excluded.account_type,
        normal_balance = excluded.normal_balance,
        status = 'active',
        updated_at = now()
       returning id, account_code, account_name, account_type, normal_balance, system_account, status`,
      [id, ownerUserId, companyId, accountCode, accountName, accountType, normalBalance],
    );
    return publicAccount(result.rows[0]);
  });
}

export async function createJournalEntry(user, input = {}, options = {}) {
  if (!hasPostgresConfig()) throw new Error("DATABASE_URL is not configured.");
  if (!user?.id) throw new Error("Authentication required");
  const ownerUserId = accountingOwnerId(user, options);
  const companyId = options.companyId || input.companyId || null;
  const currency = text(input.currency, "INR").toUpperCase();
  const journalDate = dateOnly(input.journalDate || input.date);
  const narration = text(input.narration, input.description, "Manual journal entry");
  const lines = (Array.isArray(input.lines) ? input.lines : [])
    .map((line) => ({
      accountId: text(line.accountId, line.account_id),
      description: text(line.description, narration),
      debit: num(line.debit),
      credit: num(line.credit),
    }))
    .filter((line) => line.accountId && (line.debit > 0 || line.credit > 0));
  if (lines.length < 2) throw new Error("Add at least one debit and one credit line.");
  const totalDebit = num(lines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = num(lines.reduce((sum, line) => sum + line.credit, 0));
  if (totalDebit <= 0 || totalCredit <= 0 || Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error("Journal debit and credit totals must match.");
  }
  await requireAccountingAuthority(ownerUserId, companyId);
  return withPostgresClient(async (client) => {
    await ensureDefaultAccounts(client, ownerUserId, companyId);
    for (const line of lines) {
      await requireAccount(client, ownerUserId, line.accountId, companyId);
    }
    const journalId = transactionId("journal");
    const journalNumber = text(input.journalNumber, `JV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`);
    await client.query(
      `insert into eazinvoice_journal_entries
        (id, owner_user_id, company_id, journal_number, journal_date, narration, status, currency, total_debit, total_credit, record, updated_at)
       values ($1, $2, $3, $4, $5, $6, 'posted', $7, $8, $9, $10::jsonb, now())`,
      [journalId, ownerUserId, companyId, journalNumber, journalDate, narration, currency, totalDebit, totalCredit, JSON.stringify({ manual: true })],
    );
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      await client.query(
        `insert into eazinvoice_journal_lines
          (id, journal_id, owner_user_id, company_id, account_id, line_index, description, debit, credit, currency, record, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, now())`,
        [`${journalId}:line:${index + 1}`, journalId, ownerUserId, companyId, line.accountId, index + 1, line.description, line.debit, line.credit, currency, JSON.stringify({ manual: true })],
      );
    }
    await replaceDerivedTransaction(client, {
      id: `journal:${journalId}`,
      ownerUserId,
      companyId,
      transactionDate: journalDate,
      sourceType: "journal_entry",
      sourceId: journalId,
      referenceNumber: journalNumber,
      narration,
      record: { manual: true },
    }, lines.map((line) => ({
      accountId: line.accountId,
      debit: line.debit,
      credit: line.credit,
      currency,
      record: { description: line.description },
    })));
    return publicJournal({
      id: journalId,
      journal_number: journalNumber,
      journal_date: journalDate,
      narration,
      status: "posted",
      currency,
      total_debit: totalDebit,
      total_credit: totalCredit,
    }, lines);
  });
}

export async function getJournalEntries(user, options = {}) {
  if (!hasPostgresConfig()) return { enabled: false, reason: "DATABASE_URL is not configured.", journals: [] };
  if (!user?.id) throw new Error("Authentication required");
  const ownerUserId = accountingOwnerId(user, options);
  await requireAccountingAuthority(ownerUserId, options.companyId || null);
  return withPostgresClient(async (client) => ({
    enabled: true,
    journals: await listJournals(client, ownerUserId, options.companyId || null),
  }));
}

export async function getBookEntries(user, options = {}) {
  if (!hasPostgresConfig()) return { enabled: false, reason: "DATABASE_URL is not configured.", entries: [] };
  if (!user?.id) throw new Error("Authentication required");
  const ownerUserId = accountingOwnerId(user, options);
  await requireAccountingAuthority(ownerUserId, options.companyId || null);
  return withPostgresClient(async (client) => {
    await ensureDefaultAccounts(client, ownerUserId, options.companyId || null);
    const book = text(options.book, "bank").toLowerCase() === "cash" ? "cash" : "bank";
    const accountCode = book === "cash" ? "1120" : "1110";
    return {
      enabled: true,
      book,
      entries: await bookRows(client, ownerUserId, accountCode, options.companyId || null),
    };
  });
}

export async function getGstComplianceSummary(user, options = {}) {
  if (!hasPostgresConfig()) {
    return { enabled: false, reason: "DATABASE_URL is not configured.", outputGst: 0, inputGst: 0, netGstPayable: 0, accounts: [], entries: [] };
  }
  if (!user?.id) throw new Error("Authentication required");
  const ownerUserId = accountingOwnerId(user, options);
  await requireAccountingAuthority(ownerUserId, options.companyId || null);
  return withPostgresClient(async (client) => ({
    enabled: true,
    ...(await gstLedgerSummary(client, ownerUserId, options)),
  }));
}

export async function getLedgerAccountEntries(user, accountIdValue, options = {}) {
  if (!hasPostgresConfig()) return { enabled: false, reason: "DATABASE_URL is not configured.", entries: [] };
  if (!user?.id) throw new Error("Authentication required");
  if (!accountIdValue) throw new Error("Ledger account is required.");
  const ownerUserId = accountingOwnerId(user, options);
  await requireAccountingAuthority(ownerUserId, options.companyId || null);
  return withPostgresClient(async (client) => ({
    enabled: true,
    entries: await accountLedger(client, ownerUserId, accountIdValue, options.companyId || null),
  }));
}
