import { hasPostgresConfig, withPostgresClient } from "./postgres.js";

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function textValue(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function dateOnly(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function addMonths(date, months) {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  return next;
}

function monthEnd(year, month) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function resolveReportPeriod(filters = {}, now = new Date()) {
  const startDate = dateOnly(filters.startDate);
  const endDate = dateOnly(filters.endDate);
  if (startDate || endDate) {
    return {
      mode: "custom",
      startDate: startDate || null,
      endDate: endDate || null,
    };
  }

  const financialYearText = textValue(filters.financialYear);
  if (financialYearText && financialYearText.toLowerCase() !== "all") {
    const match = financialYearText.match(/\d{4}/);
    if (match) {
      const startYear = Number(match[0]);
      return {
        mode: "financial-year",
        financialYear: `${startYear}-${startYear + 1}`,
        startDate: `${startYear}-04-01`,
        endDate: `${startYear + 1}-03-31`,
      };
    }
  }

  const yearText = textValue(filters.year);
  const year = /^\d{4}$/.test(yearText) ? Number(yearText) : null;
  const monthText = textValue(filters.month);
  const month = /^\d{1,2}$/.test(monthText) ? Number(monthText) : null;
  if (year && month >= 1 && month <= 12) {
    return {
      mode: "month",
      year,
      month,
      startDate: `${year}-${String(month).padStart(2, "0")}-01`,
      endDate: monthEnd(year, month),
    };
  }

  if (year) {
    return {
      mode: "year",
      year,
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
    };
  }

  return {
    mode: "all",
    startDate: null,
    endDate: now.toISOString().slice(0, 10),
  };
}

function pushDateFilters(where, params, column, period) {
  if (period.startDate) {
    params.push(period.startDate);
    where.push(`${column} >= $${params.length}::date`);
  }
  if (period.endDate) {
    params.push(period.endDate);
    where.push(`${column} <= $${params.length}::date`);
  }
}

function pushInvoiceVisibility(where, params, user, companyIds, tableAlias = "i") {
  if (!user || user.role === "admin" || user.isAdmin) return;
  const prefix = tableAlias ? `${tableAlias}.` : "";
  params.push(user.id);
  const ownerParam = `$${params.length}`;
  if (companyIds.length) {
    params.push(companyIds);
    where.push(`(${prefix}owner_user_id = ${ownerParam} OR ${prefix}company_id = ANY($${params.length}::text[]))`);
  } else {
    where.push(`${prefix}owner_user_id = ${ownerParam}`);
  }
}

function toWhereClause(where) {
  return where.length ? `WHERE ${where.join(" AND ")}` : "";
}

function activeCreatedStatus(alias) {
  return `lower(coalesce(${alias}.status, '')) NOT IN ('draft', 'deleted')`;
}

function visibleStatus(alias) {
  return `lower(coalesce(${alias}.status, '')) <> 'deleted'`;
}

async function listVisibleCompanyIds(client, user) {
  if (!user || user.role === "admin" || user.isAdmin) return [];
  const result = await client.query(
    "SELECT id FROM eazinvoice_business_profiles WHERE owner_user_id = $1 AND lower(coalesce(status, 'active')) <> 'deleted'",
    [user.id],
  );
  return result.rows.map((row) => row.id);
}

async function getInvoiceStats(client, user, companyIds, period) {
  const params = [];
  const where = [];
  where.push(visibleStatus("i"));
  pushInvoiceVisibility(where, params, user, companyIds, "i");
  pushDateFilters(where, params, "coalesce(i.invoice_date, i.created_at::date)", period);
  const result = await client.query(
    `SELECT
      count(*)::int AS total_invoices,
      count(*) FILTER (WHERE lower(coalesce(i.status, '')) = 'draft')::int AS draft_invoices,
      count(*) FILTER (WHERE ${activeCreatedStatus("i")})::int AS created_invoices,
      coalesce(sum(i.total) FILTER (WHERE ${activeCreatedStatus("i")}), 0)::numeric AS revenue,
      coalesce(sum(i.paid_amount) FILTER (WHERE ${activeCreatedStatus("i")}), 0)::numeric AS paid_amount,
      coalesce(sum(balance_amount) FILTER (
        WHERE ${activeCreatedStatus("i")}
          AND lower(coalesce(i.payment_status, 'unpaid')) <> 'paid'
      ), 0)::numeric AS unpaid_amount,
      count(*) FILTER (
        WHERE ${activeCreatedStatus("i")}
          AND lower(coalesce(i.payment_status, 'unpaid')) <> 'paid'
          AND i.due_date IS NOT NULL
          AND i.due_date < current_date
      )::int AS overdue_invoices,
      count(*) FILTER (
        WHERE ${activeCreatedStatus("i")}
          AND lower(coalesce(i.payment_status, 'unpaid')) <> 'paid'
      )::int AS pending_payments
     FROM eazinvoice_invoices i
     ${toWhereClause(where)}`,
    params,
  );
  const row = result.rows[0] || {};
  return {
    totalInvoices: numberValue(row.total_invoices),
    draftInvoices: numberValue(row.draft_invoices),
    createdInvoices: numberValue(row.created_invoices),
    revenue: numberValue(row.revenue),
    paidAmount: numberValue(row.paid_amount),
    unpaidAmount: numberValue(row.unpaid_amount),
    overdueInvoices: numberValue(row.overdue_invoices),
    pendingPayments: numberValue(row.pending_payments),
  };
}

async function getPurchaseOrderStats(client, user, companyIds, period) {
  const params = [];
  const where = [];
  where.push(visibleStatus("p"));
  pushInvoiceVisibility(where, params, user, companyIds, "p");
  pushDateFilters(where, params, "coalesce(p.po_date, p.created_at::date)", period);
  const result = await client.query(
    `SELECT
      count(*)::int AS total_purchase_orders,
      count(*) FILTER (WHERE lower(coalesce(p.status, '')) = 'draft')::int AS draft_purchase_orders,
      count(*) FILTER (WHERE ${activeCreatedStatus("p")})::int AS created_purchase_orders,
      coalesce(sum(p.total) FILTER (WHERE ${activeCreatedStatus("p")}), 0)::numeric AS expenses,
      coalesce(sum(p.paid_amount) FILTER (WHERE ${activeCreatedStatus("p")}), 0)::numeric AS expenses_paid,
      coalesce(sum(p.balance_amount) FILTER (
        WHERE ${activeCreatedStatus("p")}
          AND lower(coalesce(p.payment_status, 'unpaid')) <> 'paid'
      ), 0)::numeric AS payables
     FROM eazinvoice_purchase_orders p
     ${toWhereClause(where)}`,
    params,
  );
  const row = result.rows[0] || {};
  return {
    purchaseOrders: numberValue(row.total_purchase_orders),
    draftPurchaseOrders: numberValue(row.draft_purchase_orders),
    createdPurchaseOrders: numberValue(row.created_purchase_orders),
    expenses: numberValue(row.expenses),
    expensesPaid: numberValue(row.expenses_paid),
    payables: numberValue(row.payables),
  };
}

async function getPaymentStats(client, user, companyIds, period) {
  const params = [];
  const where = [];
  where.push(visibleStatus("i"));
  if (user && user.role !== "admin" && !user.isAdmin) {
    params.push(user.id);
    const ownerParam = `$${params.length}`;
    if (companyIds.length) {
      params.push(companyIds);
      where.push(`(p.owner_user_id = ${ownerParam} OR i.owner_user_id = ${ownerParam} OR i.company_id = ANY($${params.length}::text[]))`);
    } else {
      where.push(`(p.owner_user_id = ${ownerParam} OR i.owner_user_id = ${ownerParam})`);
    }
  }
  pushDateFilters(where, params, "coalesce(p.payment_date, p.created_at::date)", period);
  const result = await client.query(
    `SELECT
      count(p.id)::int AS payment_count,
      coalesce(sum(p.amount), 0)::numeric AS payment_total
     FROM eazinvoice_payments p
     LEFT JOIN eazinvoice_invoices i ON i.id = p.invoice_id
     ${toWhereClause(where)}`,
    params,
  );
  const row = result.rows[0] || {};
  return {
    payments: numberValue(row.payment_count),
    paymentTotal: numberValue(row.payment_total),
  };
}

async function getRecentInvoices(client, user, companyIds, period) {
  const params = [];
  const where = [];
  where.push(visibleStatus("i"));
  pushInvoiceVisibility(where, params, user, companyIds, "i");
  pushDateFilters(where, params, "coalesce(i.invoice_date, i.created_at::date)", period);
  const result = await client.query(
    `SELECT id, invoice_number, invoice_date, due_date, currency, status, payment_status, total, paid_amount, balance_amount
     FROM eazinvoice_invoices i
     ${toWhereClause(where)}
     ORDER BY coalesce(i.invoice_date, i.created_at::date) DESC, i.updated_at DESC
     LIMIT 10`,
    params,
  );
  return result.rows.map((row) => ({
    id: row.id,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    currency: row.currency || "INR",
    status: row.status,
    paymentStatus: row.payment_status,
    total: numberValue(row.total),
    paidAmount: numberValue(row.paid_amount),
    balanceAmount: numberValue(row.balance_amount),
  }));
}

async function getReportInvoices(client, user, companyIds, period) {
  const params = [];
  const where = [];
  where.push(visibleStatus("i"));
  pushInvoiceVisibility(where, params, user, companyIds, "i");
  pushDateFilters(where, params, "coalesce(i.invoice_date, i.created_at::date)", period);
  const result = await client.query(
    `SELECT i.id, i.customer_id, i.invoice_number, i.invoice_date, i.due_date, i.currency, i.status, i.payment_status,
      i.subtotal, i.discount, i.tax_amount, i.total, i.paid_amount, i.balance_amount,
      coalesce(i.record->>'billToName', i.record->>'customerName', c.name, c.business_name, 'Customer') AS bill_to_name
     FROM eazinvoice_invoices i
     LEFT JOIN eazinvoice_customers c ON c.id = i.customer_id
     ${toWhereClause(where)}
     ORDER BY coalesce(i.invoice_date, i.created_at::date) DESC, i.updated_at DESC`,
    params,
  );
  return result.rows.map((row) => ({
    id: row.id,
    customerId: row.customer_id,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    currency: row.currency || "INR",
    status: row.status,
    paymentStatus: row.payment_status,
    subtotal: numberValue(row.subtotal),
    discount: numberValue(row.discount),
    taxAmount: numberValue(row.tax_amount),
    total: numberValue(row.total),
    paidAmount: numberValue(row.paid_amount),
    balanceAmount: numberValue(row.balance_amount),
    billToName: row.bill_to_name || "Customer",
  }));
}

async function getReportPurchaseOrders(client, user, companyIds, period) {
  const params = [];
  const where = [];
  where.push(visibleStatus("p"));
  pushInvoiceVisibility(where, params, user, companyIds, "p");
  pushDateFilters(where, params, "coalesce(p.po_date, p.created_at::date)", period);
  const result = await client.query(
    `SELECT p.id, p.vendor_id, p.document_type, p.po_number, p.po_date, p.due_date, p.currency, p.status, p.payment_status,
      p.subtotal, p.discount, p.tax_amount, p.total, p.paid_amount, p.balance_amount,
      coalesce(p.record->>'vendorName', p.record->>'billToName', p.record->>'supplierName', 'Vendor') AS bill_to_name
     FROM eazinvoice_purchase_orders p
     ${toWhereClause(where)}
     ORDER BY coalesce(p.po_date, p.created_at::date) DESC, p.updated_at DESC`,
    params,
  );
  return result.rows.map((row) => ({
    id: row.id,
    vendorId: row.vendor_id,
    documentType: row.document_type || "po",
    poNumber: row.po_number,
    poDate: row.po_date,
    dueDate: row.due_date,
    currency: row.currency || "INR",
    status: row.status,
    paymentStatus: row.payment_status,
    subtotal: numberValue(row.subtotal),
    discount: numberValue(row.discount),
    taxAmount: numberValue(row.tax_amount),
    total: numberValue(row.total),
    paidAmount: numberValue(row.paid_amount),
    balanceAmount: numberValue(row.balance_amount),
    billToName: row.bill_to_name || "Vendor",
  }));
}

async function getMonthlyTrend(client, user, companyIds, period) {
  const end = period.endDate ? new Date(`${period.endDate}T00:00:00.000Z`) : new Date();
  const start = period.startDate ? new Date(`${period.startDate}T00:00:00.000Z`) : addMonths(end, -11);
  const monthKeys = [];
  for (let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); cursor <= end; cursor = addMonths(cursor, 1)) {
    monthKeys.push(cursor.toISOString().slice(0, 7));
  }

  const invoiceParams = [];
  const invoiceWhere = [activeCreatedStatus("i")];
  pushInvoiceVisibility(invoiceWhere, invoiceParams, user, companyIds, "i");
  pushDateFilters(invoiceWhere, invoiceParams, "coalesce(i.invoice_date, i.created_at::date)", {
    startDate: monthKeys[0] ? `${monthKeys[0]}-01` : period.startDate,
    endDate: period.endDate,
  });
  const invoiceRows = await client.query(
    `SELECT to_char(date_trunc('month', coalesce(i.invoice_date, i.created_at::date)), 'YYYY-MM') AS month_key,
      coalesce(sum(total), 0)::numeric AS income
     FROM eazinvoice_invoices i
     ${toWhereClause(invoiceWhere)}
     GROUP BY month_key`,
    invoiceParams,
  );

  const poParams = [];
  const poWhere = [activeCreatedStatus("p")];
  pushInvoiceVisibility(poWhere, poParams, user, companyIds, "p");
  pushDateFilters(poWhere, poParams, "coalesce(p.po_date, p.created_at::date)", {
    startDate: monthKeys[0] ? `${monthKeys[0]}-01` : period.startDate,
    endDate: period.endDate,
  });
  const poRows = await client.query(
    `SELECT to_char(date_trunc('month', coalesce(p.po_date, p.created_at::date)), 'YYYY-MM') AS month_key,
      coalesce(sum(total), 0)::numeric AS expenses,
      coalesce(sum(paid_amount), 0)::numeric AS expenses_paid,
      coalesce(sum(balance_amount) FILTER (WHERE lower(coalesce(payment_status, 'unpaid')) <> 'paid'), 0)::numeric AS payables
     FROM eazinvoice_purchase_orders p
     ${toWhereClause(poWhere)}
     GROUP BY month_key`,
    poParams,
  );

  const incomeByMonth = new Map(invoiceRows.rows.map((row) => [row.month_key, numberValue(row.income)]));
  const expenseByMonth = new Map(poRows.rows.map((row) => [row.month_key, numberValue(row.expenses)]));
  const expensePaidByMonth = new Map(poRows.rows.map((row) => [row.month_key, numberValue(row.expenses_paid)]));
  const payableByMonth = new Map(poRows.rows.map((row) => [row.month_key, numberValue(row.payables)]));
  return monthKeys.map((month) => {
    const income = incomeByMonth.get(month) || 0;
    const expenses = expenseByMonth.get(month) || 0;
    const expensesPaid = expensePaidByMonth.get(month) || 0;
    const payables = payableByMonth.get(month) || 0;
    return {
      month,
      income,
      expenses,
      expensesPaid,
      payables,
      profit: income - expenses,
    };
  });
}

export async function summarizePostgresReports(user, filters = {}) {
  if (!hasPostgresConfig()) {
    return {
      available: false,
      reason: "DATABASE_URL is not configured.",
    };
  }
  const period = resolveReportPeriod(filters);
  return withPostgresClient(async (client) => {
    const companyIds = await listVisibleCompanyIds(client, user);
    const invoiceStats = await getInvoiceStats(client, user, companyIds, period);
    const purchaseOrderStats = await getPurchaseOrderStats(client, user, companyIds, period);
    const paymentStats = await getPaymentStats(client, user, companyIds, period);
    const recentInvoices = await getRecentInvoices(client, user, companyIds, period);
    const invoices = await getReportInvoices(client, user, companyIds, period);
    const purchaseOrders = await getReportPurchaseOrders(client, user, companyIds, period);
    const monthlyTrend = await getMonthlyTrend(client, user, companyIds, period);
    const revenue = invoiceStats.revenue;
    const expenses = purchaseOrderStats.expenses;
    return {
      available: true,
      source: "postgres",
      generatedAt: new Date().toISOString(),
      period,
      scope: user?.role === "admin" || user?.isAdmin ? "admin" : "user",
      currency: "INR",
      totals: {
        ...invoiceStats,
        ...purchaseOrderStats,
        ...paymentStats,
        revenue,
        expenses,
        profit: revenue - expenses,
      },
      recentInvoices,
      invoices,
      purchaseOrders,
      monthlyTrend,
    };
  });
}
