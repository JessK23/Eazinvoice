import assert from "node:assert/strict";
import { loadLocalEnv } from "./postgres-env.mjs";
import { closePostgresPool, maskDatabaseUrl, withPostgresClient } from "../apps/api/src/postgres.js";
import { summarizePostgresReports } from "../apps/api/src/postgres-reporting.js";

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

loadLocalEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Add it to .env before verifying Postgres reports.");
}

try {
  const adminUser = { id: "admin-report-verification", role: "admin", isAdmin: true };
  const summary = await summarizePostgresReports(adminUser);
  assert.equal(summary.available, true);
  assert.equal(summary.source, "postgres");

  const expected = await withPostgresClient(async (client) => {
    const invoiceResult = await client.query(
      `SELECT
        count(*) FILTER (WHERE lower(coalesce(status, '')) <> 'deleted')::int AS visible_invoices,
        count(*) FILTER (WHERE lower(coalesce(status, '')) = 'draft')::int AS draft_invoices,
        count(*) FILTER (WHERE lower(coalesce(status, '')) NOT IN ('draft', 'deleted'))::int AS created_invoices,
        coalesce(sum(total) FILTER (WHERE lower(coalesce(status, '')) NOT IN ('draft', 'deleted')), 0)::numeric AS revenue,
        coalesce(sum(paid_amount) FILTER (WHERE lower(coalesce(status, '')) NOT IN ('draft', 'deleted')), 0)::numeric AS paid_amount,
        coalesce(sum(balance_amount) FILTER (
          WHERE lower(coalesce(status, '')) NOT IN ('draft', 'deleted')
            AND lower(coalesce(payment_status, 'unpaid')) <> 'paid'
        ), 0)::numeric AS unpaid_amount,
        count(*) FILTER (
          WHERE lower(coalesce(status, '')) NOT IN ('draft', 'deleted')
            AND lower(coalesce(payment_status, 'unpaid')) <> 'paid'
            AND due_date IS NOT NULL
            AND due_date < current_date
        )::int AS overdue_invoices,
        count(*) FILTER (
          WHERE lower(coalesce(status, '')) NOT IN ('draft', 'deleted')
            AND lower(coalesce(payment_status, 'unpaid')) <> 'paid'
        )::int AS pending_payments
       FROM eazinvoice_invoices`,
    );
    const paymentResult = await client.query(
      `SELECT
        count(p.id)::int AS payments,
        coalesce(sum(p.amount), 0)::numeric AS payment_total
       FROM eazinvoice_payments p
       LEFT JOIN eazinvoice_invoices i ON i.id = p.invoice_id
       WHERE lower(coalesce(i.status, '')) <> 'deleted'`,
    );
    const purchaseOrderResult = await client.query(
      `SELECT
        count(*) FILTER (WHERE lower(coalesce(status, '')) <> 'deleted')::int AS visible_purchase_orders,
        count(*) FILTER (WHERE lower(coalesce(status, '')) = 'draft')::int AS draft_purchase_orders,
        count(*) FILTER (WHERE lower(coalesce(status, '')) NOT IN ('draft', 'deleted'))::int AS created_purchase_orders,
        coalesce(sum(total) FILTER (WHERE lower(coalesce(status, '')) NOT IN ('draft', 'deleted')), 0)::numeric AS expenses
       FROM eazinvoice_purchase_orders`,
    );
    const invoiceRow = invoiceResult.rows[0] || {};
    const paymentRow = paymentResult.rows[0] || {};
    const purchaseOrderRow = purchaseOrderResult.rows[0] || {};
    return {
      visibleInvoices: numberValue(invoiceRow.visible_invoices),
      draftInvoices: numberValue(invoiceRow.draft_invoices),
      createdInvoices: numberValue(invoiceRow.created_invoices),
      revenue: numberValue(invoiceRow.revenue),
      paidAmount: numberValue(invoiceRow.paid_amount),
      unpaidAmount: numberValue(invoiceRow.unpaid_amount),
      overdueInvoices: numberValue(invoiceRow.overdue_invoices),
      pendingPayments: numberValue(invoiceRow.pending_payments),
      payments: numberValue(paymentRow.payments),
      paymentTotal: numberValue(paymentRow.payment_total),
      visiblePurchaseOrders: numberValue(purchaseOrderRow.visible_purchase_orders),
      draftPurchaseOrders: numberValue(purchaseOrderRow.draft_purchase_orders),
      createdPurchaseOrders: numberValue(purchaseOrderRow.created_purchase_orders),
      expenses: numberValue(purchaseOrderRow.expenses),
    };
  });

  assert.equal(summary.totals.totalInvoices, expected.visibleInvoices);
  assert.equal(summary.totals.draftInvoices, expected.draftInvoices);
  assert.equal(summary.totals.createdInvoices, expected.createdInvoices);
  assert.equal(summary.totals.revenue, expected.revenue);
  assert.equal(summary.totals.paidAmount, expected.paidAmount);
  assert.equal(summary.totals.unpaidAmount, expected.unpaidAmount);
  assert.equal(summary.totals.overdueInvoices, expected.overdueInvoices);
  assert.equal(summary.totals.pendingPayments, expected.pendingPayments);
  assert.equal(summary.totals.payments, expected.payments);
  assert.equal(summary.totals.paymentTotal, expected.paymentTotal);
  assert.equal(summary.totals.purchaseOrders, expected.visiblePurchaseOrders);
  assert.equal(summary.totals.draftPurchaseOrders, expected.draftPurchaseOrders);
  assert.equal(summary.totals.createdPurchaseOrders, expected.createdPurchaseOrders);
  assert.equal(summary.totals.expenses, expected.expenses);
  assert.equal(summary.totals.profit, expected.revenue - expected.expenses);
  assert.equal(
    summary.invoices.some((invoice) => String(invoice.status || "").toLowerCase() === "deleted"),
    false,
  );
  assert.equal(
    summary.purchaseOrders.some((purchaseOrder) => String(purchaseOrder.status || "").toLowerCase() === "deleted"),
    false,
  );

  console.log(`database: ${maskDatabaseUrl()}`);
  console.log("Postgres report totals match normalized invoices, payments, PO/WO, and profit tables.");
} finally {
  await closePostgresPool();
}
