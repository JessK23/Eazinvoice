import { hasPostgresConfig, withPostgresClient } from "./postgres.js";

const DEFAULT_ACCOUNTS = [
  ["1100", "Accounts Receivable", "asset", "debit"],
  ["1110", "Bank Account", "asset", "debit"],
  ["1120", "Cash in Hand", "asset", "debit"],
  ["2100", "Accounts Payable", "liability", "credit"],
  ["2200", "Output GST / Tax Payable", "liability", "credit"],
  ["2210", "Input GST / Tax Credit", "asset", "debit"],
  ["4100", "Sales Revenue", "income", "credit"],
  ["5100", "Purchase / Operating Expense", "expense", "debit"],
];

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
  for (const [code, name, type, normalBalance] of DEFAULT_ACCOUNTS) {
    const id = accountId(ownerUserId, companyId, code);
    const result = await client.query(
      `insert into eazinvoice_ledger_accounts
        (id, owner_user_id, company_id, account_code, account_name, account_type, normal_balance, system_account, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, true, now())
       on conflict (id) do update set
        account_name = excluded.account_name,
        account_type = excluded.account_type,
        normal_balance = excluded.normal_balance,
        system_account = true,
        updated_at = now()
       returning id, account_code, account_name, account_type, normal_balance, system_account, status`,
      [id, ownerUserId, companyId, code, name, type, normalBalance],
    );
    accounts.push(result.rows[0]);
  }
  return accounts;
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
      { accountId: map.get("2200"), credit: tax, currency: row.currency },
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
      { accountId: map.get("2210"), debit: tax, currency: row.currency },
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
    "a.account_code in ('2200', '2210')",
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
  const outputRow = byCode.get("2200") || {};
  const inputRow = byCode.get("2210") || {};
  const outputGst = num(num(outputRow.credit) - num(outputRow.debit));
  const inputGst = num(num(inputRow.debit) - num(inputRow.credit));
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
      balance: row.account_code === "2200" ? num(num(row.credit) - num(row.debit)) : num(num(row.debit) - num(row.credit)),
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
  return withPostgresClient(async (client) => {
    const companyId = options.companyId || null;
    const accounts = await ensureDefaultAccounts(client, ownerUser.id, companyId);
    const invoicesSynced = await syncInvoices(client, ownerUser, companyId, accounts);
    const purchaseOrdersSynced = await syncPurchaseOrders(client, ownerUser, companyId, accounts);
    const allAccounts = await listAccounts(client, ownerUser.id, companyId);
    const rows = await trialBalance(client, ownerUser, companyId);
    return {
      enabled: true,
      companyId,
      accounts: allAccounts.map(publicAccount),
      invoicesSynced,
      purchaseOrdersSynced,
      trialBalance: rows,
      summary: summarizeRows(rows),
    };
  });
}

export async function getAccountingSummary(user, options = {}) {
  return syncAccountingFoundation(user, options);
}

export async function getLedgerAccounts(user, options = {}) {
  if (!hasPostgresConfig()) return { enabled: false, reason: "DATABASE_URL is not configured.", accounts: [] };
  if (!user?.id) throw new Error("Authentication required");
  const ownerUserId = accountingOwnerId(user, options);
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
  return withPostgresClient(async (client) => ({
    enabled: true,
    journals: await listJournals(client, ownerUserId, options.companyId || null),
  }));
}

export async function getBookEntries(user, options = {}) {
  if (!hasPostgresConfig()) return { enabled: false, reason: "DATABASE_URL is not configured.", entries: [] };
  if (!user?.id) throw new Error("Authentication required");
  const ownerUserId = accountingOwnerId(user, options);
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
  return withPostgresClient(async (client) => ({
    enabled: true,
    entries: await accountLedger(client, ownerUserId, accountIdValue, options.companyId || null),
  }));
}
