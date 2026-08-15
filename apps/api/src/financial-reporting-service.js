const ISSUED_INVOICE_STATUSES = new Set(["created", "issued", "finalized", "sent", "paid", "partial", "part-paid", "overdue", "unpaid"]);
const EXCLUDED_INVOICE_STATUSES = new Set(["draft", "deleted", "cancelled", "void"]);
const CAPTURED_PAYMENT_STATUSES = new Set(["captured", "paid", "success", "succeeded"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toMinor(value) {
  return Math.round(toNumber(value) * 100);
}

function fromMinor(value) {
  return Math.round(toNumber(value)) / 100;
}

function addMinor(...values) {
  return values.reduce((sum, value) => sum + toMinor(value), 0);
}

function money(minor) {
  return fromMinor(minor);
}

function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function isIssuedInvoice(invoice = {}) {
  const status = normalizeStatus(invoice.status || "draft");
  if (EXCLUDED_INVOICE_STATUSES.has(status)) return false;
  return ISSUED_INVOICE_STATUSES.has(status) || status !== "draft";
}

function isCapturedPayment(payment = {}) {
  return CAPTURED_PAYMENT_STATUSES.has(normalizeStatus(payment.status || "captured"));
}

function dateOnly(value) {
  if (!value) return "";
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function validateDate(value, label) {
  if (value === undefined || value === null || value === "") return "";
  const normalized = dateOnly(value);
  if (!normalized) throw new Error(`${label} must be a YYYY-MM-DD date.`);
  return normalized;
}

function normalizePeriod(options = {}) {
  const from = validateDate(options.from, "from");
  const to = validateDate(options.to, "to");
  if (from && to && from > to) throw new Error("from date must be on or before to date.");
  return { from, to };
}

function inPeriod(date, period) {
  const normalized = dateOnly(date);
  if (!normalized) return true;
  if (period.from && normalized < period.from) return false;
  if (period.to && normalized > period.to) return false;
  return true;
}

function daysPastDue(dueDate, asOf) {
  const due = dateOnly(dueDate);
  const target = dateOnly(asOf) || new Date().toISOString().slice(0, 10);
  if (!due) return 0;
  const dueTime = new Date(`${due}T00:00:00.000Z`).getTime();
  const targetTime = new Date(`${target}T00:00:00.000Z`).getTime();
  if (Number.isNaN(dueTime) || Number.isNaN(targetTime)) return 0;
  return Math.floor((targetTime - dueTime) / 86400000);
}

function bucketFor(days) {
  if (days <= 0) return "current";
  if (days <= 30) return "days_1_30";
  if (days <= 60) return "days_31_60";
  if (days <= 90) return "days_61_90";
  return "days_90_plus";
}

function emptyBucketTotals() {
  return {
    current: 0,
    days_1_30: 0,
    days_31_60: 0,
    days_61_90: 0,
    days_90_plus: 0,
  };
}

function accountSign(account = {}) {
  return String(account.normalBalance || "").toLowerCase() === "credit" ? -1 : 1;
}

function accountNetMinor(account = {}, debitMinor = 0, creditMinor = 0) {
  return accountSign(account) === 1 ? debitMinor - creditMinor : creditMinor - debitMinor;
}

function reportBase(businessId, source, period, dateBasis, coverage = {}) {
  return {
    businessId,
    source,
    dateBasis,
    period,
    coverage: {
      salesPostingComplete: true,
      paymentPostingComplete: true,
      expensesPostingComplete: true,
      purchasePostingComplete: true,
      purchaseExpensePostingComplete: true,
      salesCreditCorrectionsComplete: true,
      purchaseCreditCorrectionsComplete: true,
      customerPaymentPostingComplete: true,
      vendorPaymentPostingComplete: true,
      paymentReversalComplete: true,
      customerRefundSettlementComplete: true,
      vendorRefundSettlementComplete: true,
      cashRefundWorkflowComplete: true,
      bankStatementReconciliationComplete: false,
      gatewaySettlementReconciliationComplete: false,
      inventoryReturnAccountingComplete: false,
      TDSComplete: false,
      inventoryAccountingComplete: false,
      fixedAssetAccountingComplete: false,
      creditNoteAccountingComplete: false,
      balanceSheetReady: false,
      gstFilingReady: false,
      scope: "sales_payments_purchase_expense_payables",
      ...coverage,
    },
  };
}

function journalDate(journal = {}) {
  return journal.journalDate || String(journal.createdAt || "").slice(0, 10);
}

function scopedState(inputState = {}, businessId) {
  const state = inputState || {};
  const accounts = (state.ledgerAccounts || []).filter((account) => account.businessId === businessId && account.status !== "deleted");
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const journals = (state.accountingJournals || []).filter((journal) => journal.businessId === businessId && journal.status === "posted");
  const journalById = new Map(journals.map((journal) => [journal.id, journal]));
  const lines = (state.accountingJournalLines || [])
    .filter((line) => line.businessId === businessId && journalById.has(line.journalId))
    .map((line) => ({ ...line, account: accountById.get(line.accountId) || null, journal: journalById.get(line.journalId) || null }));
  const invoices = (state.invoices || []).filter((invoice) => invoice.businessId === businessId);
  const vendorBills = (state.vendorBills || []).filter((bill) => bill.businessId === businessId);
  const creditNotes = (state.creditNotes || []).filter((note) => note.businessId === businessId);
  const vendorCredits = (state.vendorCredits || []).filter((credit) => credit.businessId === businessId);
  const paymentReversals = (state.paymentReversals || []).filter((reversal) => reversal.businessId === businessId);
  const customerRefunds = (state.customerRefunds || []).filter((refund) => refund.businessId === businessId);
  const vendorPaymentReversals = (state.vendorPaymentReversals || []).filter((reversal) => reversal.businessId === businessId);
  const vendorRefunds = (state.vendorRefunds || []).filter((refund) => refund.businessId === businessId);
  const payments = (state.payments || []).filter((payment) => payment.businessId === businessId);
  const events = (state.financialEvents || []).filter((event) => event.businessId === businessId);
  const customers = (state.customers || []).filter((customer) => customer.businessId === businessId || invoices.some((invoice) => invoice.customerId === customer.id));
  const vendors = (state.vendors || []).filter((vendor) => vendor.businessId === businessId || vendorBills.some((bill) => bill.vendorId === vendor.id));
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  return { accounts, accountById, journals, journalById, lines, invoices, vendorBills, creditNotes, vendorCredits, paymentReversals, customerRefunds, vendorPaymentReversals, vendorRefunds, payments, events, customerById, vendorById };
}

function sourceJournal(scoped, sourceType, sourceId) {
  return scoped.journals.find((journal) => journal.sourceType === sourceType && journal.sourceId === sourceId);
}

function sumJournalLines(scoped, predicate) {
  return scoped.lines.filter(predicate).reduce((totals, line) => {
    totals.debitMinor += toMinor(line.debit);
    totals.creditMinor += toMinor(line.credit);
    return totals;
  }, { debitMinor: 0, creditMinor: 0 });
}

function accountRole(account = {}) {
  const code = String(account.accountCode || "");
  if (code === "1100") return "accounts_receivable";
  if (code === "1110") return "bank_clearing";
  if (code === "2201") return "output_cgst";
  if (code === "2202") return "output_sgst";
  if (code === "2203") return "output_igst";
  if (code === "2100") return "accounts_payable";
  if (code === "2211") return "input_cgst";
  if (code === "2212") return "input_sgst";
  if (code === "2213") return "input_igst";
  if (code === "4100") return "sales_revenue";
  if (code === "4200") return "sales_returns";
  if (code === "5200") return "purchase_adjustments";
  if (String(account.accountType || "").toLowerCase() === "expense") return "expense";
  return "";
}

function issuedInvoices(scoped, period, dateField = "invoiceDate") {
  return scoped.invoices.filter((invoice) => isIssuedInvoice(invoice) && inPeriod(invoice[dateField] || invoice.createdAt, period));
}

function capturedPayments(scoped, period) {
  return scoped.payments.filter((payment) => isCapturedPayment(payment) && !payment.vendorBillId && inPeriod(payment.paymentDate || payment.createdAt, period));
}

function postedVendorBills(scoped, period, dateField = "billDate") {
  return scoped.vendorBills.filter((bill) => (
    ["posted", "recognized", "approved"].includes(normalizeStatus(bill.status))
    && inPeriod(bill[dateField] || bill.createdAt, period)
  ));
}

function postedSalesCreditNotes(scoped, period, dateField = "creditNoteDate") {
  return scoped.creditNotes.filter((note) => normalizeStatus(note.status || "draft") !== "draft" && inPeriod(note[dateField] || note.createdAt, period));
}

function postedVendorCredits(scoped, period, dateField = "vendorCreditDate") {
  return scoped.vendorCredits.filter((credit) => normalizeStatus(credit.status || "draft") !== "draft" && inPeriod(credit[dateField] || credit.createdAt, period));
}

function postedPaymentReversals(scoped, period) {
  return scoped.paymentReversals.filter((reversal) => normalizeStatus(reversal.status || "posted") === "posted" && inPeriod(reversal.reversalDate || reversal.createdAt, period));
}

function postedCustomerRefunds(scoped, period) {
  return scoped.customerRefunds.filter((refund) => normalizeStatus(refund.status || "processed") === "processed" && inPeriod(refund.refundDate || refund.createdAt, period));
}

function postedVendorPaymentReversals(scoped, period) {
  return scoped.vendorPaymentReversals.filter((reversal) => normalizeStatus(reversal.status || "posted") === "posted" && inPeriod(reversal.reversalDate || reversal.createdAt, period));
}

function postedVendorRefunds(scoped, period) {
  return scoped.vendorRefunds.filter((refund) => normalizeStatus(refund.status || "received") === "received" && inPeriod(refund.receivedDate || refund.refundDate || refund.createdAt, period));
}

function capturedVendorPayments(scoped, period) {
  return scoped.payments.filter((payment) => isCapturedPayment(payment) && payment.vendorBillId && inPeriod(payment.paymentDate || payment.createdAt, period));
}

export function buildTrialBalance(state, businessId, options = {}) {
  const period = normalizePeriod(options);
  const scoped = scopedState(state, businessId);
  const rows = scoped.accounts.map((account) => {
    const totals = sumJournalLines(scoped, (line) => line.accountId === account.id && inPeriod(journalDate(line.journal), period));
    const netMinor = accountNetMinor(account, totals.debitMinor, totals.creditMinor);
    return {
      accountId: account.id,
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountType: account.accountType,
      normalBalance: account.normalBalance,
      debit: money(totals.debitMinor),
      credit: money(totals.creditMinor),
      netBalance: money(Math.abs(netMinor)),
      balanceSide: netMinor >= 0 ? account.normalBalance : (account.normalBalance === "credit" ? "debit" : "credit"),
    };
  }).filter((row) => toMinor(row.debit) !== 0 || toMinor(row.credit) !== 0);
  const totalDebitMinor = addMinor(...rows.map((row) => row.debit));
  const totalCreditMinor = addMinor(...rows.map((row) => row.credit));
  const differenceMinor = totalDebitMinor - totalCreditMinor;
  return {
    ...reportBase(businessId, "general_ledger", period, "journal_date"),
    rows,
    totals: {
      debit: money(totalDebitMinor),
      credit: money(totalCreditMinor),
      difference: money(differenceMinor),
    },
    integrity: {
      status: differenceMinor === 0 ? "reconciled" : "failed",
      message: differenceMinor === 0 ? "Trial balance debits equal credits." : "Trial balance is not balanced.",
    },
  };
}

export function buildGeneralLedger(state, businessId, options = {}) {
  const period = normalizePeriod(options);
  const scoped = scopedState(state, businessId);
  const accountId = String(options.accountId || "").trim();
  const accountCode = String(options.accountCode || "").trim();
  let entries = scoped.lines.filter((line) => inPeriod(journalDate(line.journal), period));
  if (accountId) entries = entries.filter((line) => line.accountId === accountId);
  if (accountCode) entries = entries.filter((line) => line.accountCode === accountCode);
  entries = entries.sort((a, b) => String(journalDate(a.journal)).localeCompare(String(journalDate(b.journal))) || String(a.journalId).localeCompare(String(b.journalId)) || a.lineIndex - b.lineIndex);
  const runningByAccount = new Map();
  const rows = entries.map((line) => {
    const account = line.account || {};
    const currentMinor = runningByAccount.get(line.accountId) || 0;
    const deltaMinor = accountSign(account) === 1 ? toMinor(line.debit) - toMinor(line.credit) : toMinor(line.credit) - toMinor(line.debit);
    const runningMinor = currentMinor + deltaMinor;
    runningByAccount.set(line.accountId, runningMinor);
    return {
      date: journalDate(line.journal),
      journalId: line.journalId,
      journalNumber: line.journal?.journalNumber || "",
      financialEventId: line.journal?.financialEventId || "",
      sourceType: line.journal?.sourceType || "",
      sourceId: line.journal?.sourceId || "",
      accountId: line.accountId,
      accountCode: line.accountCode,
      accountName: line.accountName,
      description: line.description,
      debit: money(toMinor(line.debit)),
      credit: money(toMinor(line.credit)),
      runningBalance: money(runningMinor),
      runningBalanceSide: runningMinor >= 0 ? account.normalBalance || "debit" : (account.normalBalance === "credit" ? "debit" : "credit"),
    };
  });
  return {
    ...reportBase(businessId, "general_ledger", period, "journal_date"),
    filters: { accountId, accountCode },
    rows,
  };
}

export function buildProfitLoss(state, businessId, options = {}) {
  const period = normalizePeriod(options);
  const scoped = scopedState(state, businessId);
  const revenueLines = scoped.lines.filter((line) => line.account?.accountType === "income" && inPeriod(journalDate(line.journal), period));
  const expenseLines = scoped.lines.filter((line) => line.account?.accountType === "expense" && inPeriod(journalDate(line.journal), period));
  const revenueMinor = revenueLines.reduce((sum, line) => sum + toMinor(line.credit) - toMinor(line.debit), 0);
  const expenseMinor = expenseLines.reduce((sum, line) => sum + toMinor(line.debit) - toMinor(line.credit), 0);
  return {
    ...reportBase(businessId, "general_ledger", period, "journal_date"),
    revenue: money(revenueMinor),
    expenses: money(expenseMinor),
    profit: money(revenueMinor - expenseMinor),
    rows: [
      { section: "revenue", amount: money(revenueMinor), sourceLineCount: revenueLines.length },
      { section: "expenses", amount: money(expenseMinor), sourceLineCount: expenseLines.length },
    ],
  };
}

export function buildReceivablesReport(state, businessId, options = {}) {
  const period = normalizePeriod(options);
  const scoped = scopedState(state, businessId);
  const rows = issuedInvoices(scoped, period, "invoiceDate").map((invoice) => {
    const grossPaidMinor = scoped.payments
      .filter((payment) => payment.invoiceId === invoice.id && isCapturedPayment(payment))
      .reduce((sum, payment) => sum + toMinor(payment.amount), 0);
    const reversedMinor = scoped.paymentReversals
      .filter((reversal) => reversal.invoiceId === invoice.id && normalizeStatus(reversal.status || "posted") === "posted")
      .reduce((sum, reversal) => sum + toMinor(reversal.amount), 0);
    const paidMinor = Math.max(0, grossPaidMinor - reversedMinor);
    const totalMinor = toMinor(invoice.total);
    const invoiceCreditNotes = scoped.creditNotes
      .filter((note) => note.sourceInvoiceId === invoice.id && normalizeStatus(note.status || "draft") !== "draft" && inPeriod(note.creditNoteDate || note.createdAt, period))
    const creditMinor = invoiceCreditNotes.reduce((sum, note) => sum + toMinor(note.total), 0);
    const creditNoteIds = new Set(invoiceCreditNotes.map((note) => note.id));
    const refundedMinor = scoped.customerRefunds
      .filter((refund) => creditNoteIds.has(refund.sourceCreditNoteId) && normalizeStatus(refund.status || "processed") === "processed" && inPeriod(refund.refundDate || refund.createdAt, period))
      .reduce((sum, refund) => sum + toMinor(refund.amount), 0);
    const netPositionMinor = totalMinor - paidMinor - creditMinor + refundedMinor;
    const outstandingMinor = Math.max(0, netPositionMinor);
    const customerCreditMinor = Math.max(0, -netPositionMinor);
    const customer = scoped.customerById.get(invoice.customerId) || {};
    return {
      customerId: invoice.customerId || "",
      customerName: customer.name || invoice.billToName || "",
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate || "",
      invoiceTotal: money(totalMinor),
      creditAdjustments: money(creditMinor),
      paidAmount: money(paidMinor),
      grossPaidAmount: money(grossPaidMinor),
      paymentReversals: money(reversedMinor),
      refundsSettled: money(refundedMinor),
      outstanding: money(outstandingMinor),
      customerCreditBalance: money(customerCreditMinor),
      netPosition: money(netPositionMinor),
      paymentStatus: invoice.paymentStatus || "",
      status: invoice.status || "",
    };
  }).filter((row) => toMinor(row.outstanding) > 0 || toMinor(row.customerCreditBalance) > 0 || options.includeSettled);
  const totalOutstandingMinor = addMinor(...rows.map((row) => row.outstanding));
  const customerCreditMinor = addMinor(...rows.map((row) => row.customerCreditBalance));
  return {
    ...reportBase(businessId, "transaction_subledger", period, "invoice_date"),
    rows,
    totalOutstanding: money(totalOutstandingMinor),
    customerCreditBalance: money(customerCreditMinor),
    netReceivableControlBalance: money(totalOutstandingMinor - customerCreditMinor),
  };
}

export function buildAgeingReport(state, businessId, options = {}) {
  const asOf = validateDate(options.asOf || new Date().toISOString().slice(0, 10), "asOf");
  const receivables = buildReceivablesReport(state, businessId, options);
  const bucketMinor = emptyBucketTotals();
  const rows = receivables.rows
    .filter((row) => toMinor(row.outstanding) > 0)
    .map((row) => {
      const days = daysPastDue(row.dueDate || row.invoiceDate, asOf);
      const bucket = bucketFor(days);
      bucketMinor[bucket] += toMinor(row.outstanding);
      return { ...row, asOf, daysPastDue: Math.max(0, days), bucket };
    });
  const buckets = Object.fromEntries(Object.entries(bucketMinor).map(([key, value]) => [key, money(value)]));
  return {
    ...reportBase(businessId, "transaction_subledger", normalizePeriod(options), "due_date"),
    asOf,
    buckets,
    totalOutstanding: money(addMinor(...Object.values(buckets))),
    customerCreditBalance: receivables.customerCreditBalance,
    rows,
  };
}

export function buildSalesReport(state, businessId, options = {}) {
  const period = normalizePeriod(options);
  const scoped = scopedState(state, businessId);
  const invoices = issuedInvoices(scoped, period, "invoiceDate");
  const invoiceRows = invoices.map((invoice) => {
    const taxMinor = addMinor(invoice.cgstAmount, invoice.sgstAmount, invoice.igstAmount);
    const taxableMinor = toMinor(invoice.total) - taxMinor;
    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      customerId: invoice.customerId || "",
      taxableValue: money(taxableMinor),
      cgst: money(toMinor(invoice.cgstAmount)),
      sgst: money(toMinor(invoice.sgstAmount)),
      igst: money(toMinor(invoice.igstAmount)),
      outputTax: money(taxMinor),
      grossInvoiceValue: money(toMinor(invoice.total)),
      gstMode: invoice.gstMode || "",
      documentType: "invoice",
    };
  });
  const creditRows = postedSalesCreditNotes(scoped, period, "creditNoteDate").map((note) => {
    const taxMinor = addMinor(note.cgstAmount, note.sgstAmount, note.igstAmount);
    const taxableMinor = toMinor(note.total) - taxMinor;
    return {
      creditNoteId: note.id,
      creditNoteNumber: note.creditNoteNumber,
      sourceInvoiceId: note.sourceInvoiceId,
      invoiceDate: note.creditNoteDate,
      customerId: note.customerId || "",
      taxableValue: money(taxableMinor),
      cgst: money(toMinor(note.cgstAmount)),
      sgst: money(toMinor(note.sgstAmount)),
      igst: money(toMinor(note.igstAmount)),
      outputTax: money(taxMinor),
      grossInvoiceValue: money(toMinor(note.total)),
      gstMode: note.gstMode || "",
      documentType: "sales_credit_note",
      reason: note.reason || "",
    };
  });
  const rows = invoiceRows.concat(creditRows);
  const grossTotals = invoiceRows.reduce((acc, row) => {
    acc.taxableValueMinor += toMinor(row.taxableValue);
    acc.cgstMinor += toMinor(row.cgst);
    acc.sgstMinor += toMinor(row.sgst);
    acc.igstMinor += toMinor(row.igst);
    acc.outputTaxMinor += toMinor(row.outputTax);
    acc.grossInvoiceValueMinor += toMinor(row.grossInvoiceValue);
    return acc;
  }, { taxableValueMinor: 0, cgstMinor: 0, sgstMinor: 0, igstMinor: 0, outputTaxMinor: 0, grossInvoiceValueMinor: 0 });
  const creditTotals = creditRows.reduce((acc, row) => {
    acc.taxableValueMinor += toMinor(row.taxableValue);
    acc.cgstMinor += toMinor(row.cgst);
    acc.sgstMinor += toMinor(row.sgst);
    acc.igstMinor += toMinor(row.igst);
    acc.outputTaxMinor += toMinor(row.outputTax);
    acc.grossInvoiceValueMinor += toMinor(row.grossInvoiceValue);
    return acc;
  }, { taxableValueMinor: 0, cgstMinor: 0, sgstMinor: 0, igstMinor: 0, outputTaxMinor: 0, grossInvoiceValueMinor: 0 });
  return {
    ...reportBase(businessId, "transaction_subledger", period, "invoice_date"),
    rows,
    totals: {
      taxableValue: money(grossTotals.taxableValueMinor),
      nonTaxableSales: money(invoiceRows.filter((row) => toMinor(row.outputTax) === 0).reduce((sum, row) => sum + toMinor(row.taxableValue), 0)),
      creditAdjustments: money(creditTotals.taxableValueMinor),
      netTaxableValue: money(grossTotals.taxableValueMinor - creditTotals.taxableValueMinor),
      cgst: money(grossTotals.cgstMinor),
      sgst: money(grossTotals.sgstMinor),
      igst: money(grossTotals.igstMinor),
      outputTax: money(grossTotals.outputTaxMinor),
      outputTaxAdjustments: money(creditTotals.outputTaxMinor),
      netOutputTax: money(grossTotals.outputTaxMinor - creditTotals.outputTaxMinor),
      grossInvoiceValue: money(grossTotals.grossInvoiceValueMinor),
      creditGrossValue: money(creditTotals.grossInvoiceValueMinor),
      netInvoiceValue: money(grossTotals.grossInvoiceValueMinor - creditTotals.grossInvoiceValueMinor),
    },
  };
}

export function buildGstSummary(state, businessId, options = {}) {
  const sales = buildSalesReport(state, businessId, options);
  const purchases = buildPurchaseRegister(state, businessId, options);
  return {
    ...reportBase(businessId, "transaction_tax_detail", sales.period, "invoice_date", {
      gstFilingReady: false,
      gstModeBasis: "supplied_transaction_gstMode",
    }),
    rows: sales.rows.map((row) => ({
      transactionType: "sale",
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoiceNumber,
      invoiceDate: row.invoiceDate,
      customerId: row.customerId,
      taxableValue: row.taxableValue,
      gstRate: null,
      cgst: row.cgst,
      sgst: row.sgst,
      igst: row.igst,
      placeOfSupply: "",
      gstMode: row.gstMode,
    })).concat(purchases.rows.map((row) => ({
      transactionType: "purchase",
      vendorBillId: row.vendorBillId,
      vendorBillNumber: row.vendorBillNumber,
      billDate: row.billDate,
      vendorId: row.vendorId,
      taxableValue: row.taxableValue,
      gstRate: null,
      inputCgst: row.inputCgst,
      inputSgst: row.inputSgst,
      inputIgst: row.inputIgst,
      placeOfSupply: "",
      gstMode: row.gstMode,
    }))),
    totals: {
      taxableValue: sales.totals.taxableValue,
      outputCgst: sales.totals.cgst,
      outputSgst: sales.totals.sgst,
      outputIgst: sales.totals.igst,
      outputTax: sales.totals.outputTax,
      outputTaxAdjustments: sales.totals.outputTaxAdjustments,
      netOutputTax: sales.totals.netOutputTax,
      inputTaxableValue: purchases.totals.taxableValue,
      inputCgst: purchases.totals.inputCgst,
      inputSgst: purchases.totals.inputSgst,
      inputIgst: purchases.totals.inputIgst,
      inputTax: purchases.totals.inputTax,
      inputTaxAdjustments: purchases.totals.inputTaxAdjustments,
      netInputCgst: purchases.totals.netInputCgst,
      netInputSgst: purchases.totals.netInputSgst,
      netInputIgst: purchases.totals.netInputIgst,
      netInputTax: purchases.totals.netInputTax,
      netOutputLessInput: money(toMinor(sales.totals.netOutputTax) - toMinor(purchases.totals.netInputTax)),
      cgst: sales.totals.cgst,
      sgst: sales.totals.sgst,
      igst: sales.totals.igst,
    },
    limitation: "GST summary is transaction-derived and reconciled to supported output GST ledgers; it is not filing-grade GSTR output.",
  };
}

export function buildPaymentSummary(state, businessId, options = {}) {
  const period = normalizePeriod(options);
  const scoped = scopedState(state, businessId);
  const payments = capturedPayments(scoped, period);
  const rows = payments.map((payment) => ({
    documentType: "customer_payment",
    paymentId: payment.id,
    invoiceId: payment.invoiceId || "",
    customerId: payment.customerId || "",
    paymentDate: payment.paymentDate || String(payment.createdAt || "").slice(0, 10),
    amount: money(toMinor(payment.amount)),
    reversedAmount: money(postedPaymentReversals(scoped, period).filter((reversal) => reversal.originalPaymentId === payment.id).reduce((sum, reversal) => sum + toMinor(reversal.amount), 0)),
    netEffectiveAmount: money(toMinor(payment.amount) - postedPaymentReversals(scoped, period).filter((reversal) => reversal.originalPaymentId === payment.id).reduce((sum, reversal) => sum + toMinor(reversal.amount), 0)),
    method: payment.method || payment.mode || payment.modeOfPayment || payment.gateway || "manual",
    reference: payment.reference || payment.gatewayPaymentId || "",
    status: payment.status || "captured",
    economicStatus: payment.economicStatus || "captured",
    direction: "money_in",
    journalId: sourceJournal(scoped, "payment", payment.id)?.id || "",
  }));
  const reversalRows = postedPaymentReversals(scoped, period).map((reversal) => ({
    documentType: "customer_payment_reversal",
    reversalId: reversal.id,
    originalPaymentId: reversal.originalPaymentId,
    invoiceId: reversal.invoiceId || "",
    customerId: "",
    paymentDate: reversal.reversalDate || String(reversal.createdAt || "").slice(0, 10),
    amount: money(toMinor(reversal.amount)),
    method: reversal.method || "manual",
    reference: reversal.reference || reversal.providerReference || "",
    status: reversal.status || "posted",
    direction: "reverses_money_in",
    journalId: sourceJournal(scoped, "customer_payment_reversal", reversal.id)?.id || "",
  }));
  const byMethod = rows.reduce((acc, row) => {
    acc[row.method] = money(toMinor(acc[row.method]) + toMinor(row.amount));
    return acc;
  }, {});
  return {
    ...reportBase(businessId, "payment_subledger", period, "payment_date"),
    rows: rows.concat(reversalRows),
    byMethod,
    totalCaptured: money(addMinor(...rows.map((row) => row.amount))),
    totalReversed: money(addMinor(...reversalRows.map((row) => row.amount))),
    netEffectivePayments: money(addMinor(...rows.map((row) => row.amount)) - addMinor(...reversalRows.map((row) => row.amount))),
  };
}

export function buildPurchaseRegister(state, businessId, options = {}) {
  const period = normalizePeriod(options);
  const scoped = scopedState(state, businessId);
  const billRows = postedVendorBills(scoped, period, "billDate").map((bill) => {
    const taxMinor = addMinor(bill.cgstAmount, bill.sgstAmount, bill.igstAmount);
    const taxableMinor = toMinor(bill.total) - taxMinor;
    const vendor = scoped.vendorById.get(bill.vendorId) || {};
    return {
      vendorId: bill.vendorId || "",
      vendorName: vendor.name || "",
      vendorBillId: bill.id,
      vendorBillNumber: bill.vendorBillNumber || "",
      internalBillNumber: bill.internalBillNumber || "",
      billDate: bill.billDate,
      dueDate: bill.dueDate || "",
      expenseCategory: bill.expenseCategory || "",
      expenseAccountCode: bill.expenseAccountCode || "",
      taxableValue: money(taxableMinor),
      inputCgst: money(toMinor(bill.cgstAmount)),
      inputSgst: money(toMinor(bill.sgstAmount)),
      inputIgst: money(toMinor(bill.igstAmount)),
      inputTax: money(taxMinor),
      grossBillValue: money(toMinor(bill.total)),
      paidAmount: money(toMinor(bill.paidAmount)),
      outstanding: money(Math.max(0, toMinor(bill.total) - toMinor(bill.paidAmount))),
      paymentStatus: bill.paymentStatus || "",
      gstMode: bill.gstMode || "",
      documentType: "vendor_bill",
    };
  });
  const creditRows = postedVendorCredits(scoped, period, "vendorCreditDate").map((credit) => {
    const taxMinor = addMinor(credit.cgstAmount, credit.sgstAmount, credit.igstAmount);
    const taxableMinor = toMinor(credit.total) - taxMinor;
    const vendor = scoped.vendorById.get(credit.vendorId) || {};
    return {
      vendorId: credit.vendorId || "",
      vendorName: vendor.name || "",
      vendorCreditId: credit.id,
      vendorCreditNumber: credit.vendorCreditNumber || "",
      sourceVendorBillId: credit.sourceVendorBillId,
      billDate: credit.vendorCreditDate,
      expenseCategory: credit.reason || "Supplier credit",
      expenseAccountCode: "",
      taxableValue: money(taxableMinor),
      inputCgst: money(toMinor(credit.cgstAmount)),
      inputSgst: money(toMinor(credit.sgstAmount)),
      inputIgst: money(toMinor(credit.igstAmount)),
      inputTax: money(taxMinor),
      grossBillValue: money(toMinor(credit.total)),
      paidAmount: 0,
      outstanding: 0,
      paymentStatus: "",
      gstMode: credit.gstMode || "",
      documentType: "vendor_credit",
      reason: credit.reason || "",
    };
  });
  const rows = billRows.concat(creditRows);
  const grossTotals = billRows.reduce((acc, row) => {
    acc.taxableValueMinor += toMinor(row.taxableValue);
    acc.inputCgstMinor += toMinor(row.inputCgst);
    acc.inputSgstMinor += toMinor(row.inputSgst);
    acc.inputIgstMinor += toMinor(row.inputIgst);
    acc.inputTaxMinor += toMinor(row.inputTax);
    acc.grossBillValueMinor += toMinor(row.grossBillValue);
    return acc;
  }, { taxableValueMinor: 0, inputCgstMinor: 0, inputSgstMinor: 0, inputIgstMinor: 0, inputTaxMinor: 0, grossBillValueMinor: 0 });
  const creditTotals = creditRows.reduce((acc, row) => {
    acc.taxableValueMinor += toMinor(row.taxableValue);
    acc.inputCgstMinor += toMinor(row.inputCgst);
    acc.inputSgstMinor += toMinor(row.inputSgst);
    acc.inputIgstMinor += toMinor(row.inputIgst);
    acc.inputTaxMinor += toMinor(row.inputTax);
    acc.grossBillValueMinor += toMinor(row.grossBillValue);
    return acc;
  }, { taxableValueMinor: 0, inputCgstMinor: 0, inputSgstMinor: 0, inputIgstMinor: 0, inputTaxMinor: 0, grossBillValueMinor: 0 });
  return {
    ...reportBase(businessId, "purchase_subledger", period, "bill_date"),
    rows,
    totals: {
      taxableValue: money(grossTotals.taxableValueMinor),
      creditAdjustments: money(creditTotals.taxableValueMinor),
      netTaxableValue: money(grossTotals.taxableValueMinor - creditTotals.taxableValueMinor),
      inputCgst: money(grossTotals.inputCgstMinor),
      inputSgst: money(grossTotals.inputSgstMinor),
      inputIgst: money(grossTotals.inputIgstMinor),
      inputTax: money(grossTotals.inputTaxMinor),
      inputTaxAdjustments: money(creditTotals.inputTaxMinor),
      netInputCgst: money(grossTotals.inputCgstMinor - creditTotals.inputCgstMinor),
      netInputSgst: money(grossTotals.inputSgstMinor - creditTotals.inputSgstMinor),
      netInputIgst: money(grossTotals.inputIgstMinor - creditTotals.inputIgstMinor),
      netInputTax: money(grossTotals.inputTaxMinor - creditTotals.inputTaxMinor),
      grossBillValue: money(grossTotals.grossBillValueMinor),
      creditGrossValue: money(creditTotals.grossBillValueMinor),
      netBillValue: money(grossTotals.grossBillValueMinor - creditTotals.grossBillValueMinor),
    },
  };
}

export function buildExpenseSummary(state, businessId, options = {}) {
  const purchaseRegister = buildPurchaseRegister(state, businessId, options);
  const rowsByAccount = purchaseRegister.rows.reduce((groups, row) => {
    const key = row.expenseAccountCode || "5100";
    groups[key] = groups[key] || {
      expenseAccountCode: key,
      expenseCategory: row.expenseCategory || "Operating Expense",
      taxableValue: 0,
      creditAdjustments: 0,
      billCount: 0,
    };
    if (row.documentType === "vendor_credit") groups[key].creditAdjustments = money(toMinor(groups[key].creditAdjustments) + toMinor(row.taxableValue));
    else groups[key].taxableValue = money(toMinor(groups[key].taxableValue) + toMinor(row.taxableValue));
    groups[key].billCount += 1;
    return groups;
  }, {});
  const rows = Object.values(rowsByAccount);
  rows.forEach((row) => {
    row.netExpense = money(toMinor(row.taxableValue) - toMinor(row.creditAdjustments));
  });
  return {
    ...reportBase(businessId, "purchase_subledger", purchaseRegister.period, "bill_date"),
    rows,
    totalExpenses: money(addMinor(...rows.map((row) => row.taxableValue))),
    creditAdjustments: money(addMinor(...rows.map((row) => row.creditAdjustments))),
    netExpenses: money(addMinor(...rows.map((row) => row.netExpense))),
  };
}

export function buildVendorPayablesReport(state, businessId, options = {}) {
  const period = normalizePeriod(options);
  const scoped = scopedState(state, businessId);
  const rows = postedVendorBills(scoped, period, "billDate").map((bill) => {
    const totalMinor = toMinor(bill.total);
    const grossPaidMinor = scoped.payments
      .filter((payment) => payment.vendorBillId === bill.id && isCapturedPayment(payment))
      .reduce((sum, payment) => sum + toMinor(payment.amount), 0);
    const reversedMinor = scoped.vendorPaymentReversals
      .filter((reversal) => reversal.vendorBillId === bill.id && normalizeStatus(reversal.status || "posted") === "posted")
      .reduce((sum, reversal) => sum + toMinor(reversal.amount), 0);
    const paidMinor = Math.max(0, grossPaidMinor - reversedMinor);
    const billVendorCredits = scoped.vendorCredits
      .filter((credit) => credit.sourceVendorBillId === bill.id && normalizeStatus(credit.status || "draft") !== "draft" && inPeriod(credit.vendorCreditDate || credit.createdAt, period))
    const creditMinor = billVendorCredits.reduce((sum, credit) => sum + toMinor(credit.total), 0);
    const vendorCreditIds = new Set(billVendorCredits.map((credit) => credit.id));
    const recoveredMinor = scoped.vendorRefunds
      .filter((refund) => vendorCreditIds.has(refund.sourceVendorCreditId) && normalizeStatus(refund.status || "received") === "received" && inPeriod(refund.receivedDate || refund.refundDate || refund.createdAt, period))
      .reduce((sum, refund) => sum + toMinor(refund.amount), 0);
    const netPositionMinor = totalMinor - paidMinor - creditMinor + recoveredMinor;
    const outstandingMinor = Math.max(0, netPositionMinor);
    const vendorCreditMinor = Math.max(0, -netPositionMinor);
    const vendor = scoped.vendorById.get(bill.vendorId) || {};
    return {
      vendorId: bill.vendorId || "",
      vendorName: vendor.name || "",
      vendorBillId: bill.id,
      vendorBillNumber: bill.vendorBillNumber || "",
      internalBillNumber: bill.internalBillNumber || "",
      billDate: bill.billDate,
      dueDate: bill.dueDate || "",
      billTotal: money(totalMinor),
      creditAdjustments: money(creditMinor),
      paidAmount: money(paidMinor),
      grossPaidAmount: money(grossPaidMinor),
      paymentReversals: money(reversedMinor),
      refundsRecovered: money(recoveredMinor),
      outstanding: money(outstandingMinor),
      vendorCreditBalance: money(vendorCreditMinor),
      netPosition: money(netPositionMinor),
      paymentStatus: bill.paymentStatus || "",
      status: bill.status || "",
    };
  }).filter((row) => toMinor(row.outstanding) > 0 || toMinor(row.vendorCreditBalance) > 0 || options.includeSettled);
  const totalOutstandingMinor = addMinor(...rows.map((row) => row.outstanding));
  const vendorCreditMinor = addMinor(...rows.map((row) => row.vendorCreditBalance));
  return {
    ...reportBase(businessId, "vendor_payables_subledger", period, "bill_date"),
    rows,
    totalOutstanding: money(totalOutstandingMinor),
    vendorCreditBalance: money(vendorCreditMinor),
    netPayableControlBalance: money(totalOutstandingMinor - vendorCreditMinor),
  };
}

export function buildPayablesAgeingReport(state, businessId, options = {}) {
  const asOf = validateDate(options.asOf || new Date().toISOString().slice(0, 10), "asOf");
  const payables = buildVendorPayablesReport(state, businessId, options);
  const bucketMinor = emptyBucketTotals();
  const rows = payables.rows
    .filter((row) => toMinor(row.outstanding) > 0)
    .map((row) => {
      const days = daysPastDue(row.dueDate || row.billDate, asOf);
      const bucket = bucketFor(days);
      bucketMinor[bucket] += toMinor(row.outstanding);
      return { ...row, asOf, daysPastDue: Math.max(0, days), bucket };
    });
  const buckets = Object.fromEntries(Object.entries(bucketMinor).map(([key, value]) => [key, money(value)]));
  return {
    ...reportBase(businessId, "vendor_payables_subledger", normalizePeriod(options), "due_date"),
    asOf,
    buckets,
    totalOutstanding: money(addMinor(...Object.values(buckets))),
    vendorCreditBalance: payables.vendorCreditBalance,
    rows,
  };
}

export function buildVendorPaymentSummary(state, businessId, options = {}) {
  const period = normalizePeriod(options);
  const scoped = scopedState(state, businessId);
  const payments = capturedVendorPayments(scoped, period);
  const rows = payments.map((payment) => ({
    documentType: "vendor_payment",
    paymentId: payment.id,
    vendorBillId: payment.vendorBillId || "",
    vendorId: payment.vendorId || "",
    paymentDate: payment.paymentDate || String(payment.createdAt || "").slice(0, 10),
    amount: money(toMinor(payment.amount)),
    reversedAmount: money(postedVendorPaymentReversals(scoped, period).filter((reversal) => reversal.originalPaymentId === payment.id).reduce((sum, reversal) => sum + toMinor(reversal.amount), 0)),
    netEffectiveAmount: money(toMinor(payment.amount) - postedVendorPaymentReversals(scoped, period).filter((reversal) => reversal.originalPaymentId === payment.id).reduce((sum, reversal) => sum + toMinor(reversal.amount), 0)),
    method: payment.method || payment.mode || payment.modeOfPayment || payment.gateway || "manual",
    reference: payment.reference || payment.gatewayPaymentId || "",
    status: payment.status || "captured",
    economicStatus: payment.economicStatus || "captured",
    direction: "money_out",
    journalId: sourceJournal(scoped, "vendor_payment", payment.id)?.id || "",
  }));
  const reversalRows = postedVendorPaymentReversals(scoped, period).map((reversal) => ({
    documentType: "vendor_payment_reversal",
    reversalId: reversal.id,
    originalPaymentId: reversal.originalPaymentId,
    vendorBillId: reversal.vendorBillId || "",
    vendorId: reversal.vendorId || "",
    paymentDate: reversal.reversalDate || String(reversal.createdAt || "").slice(0, 10),
    amount: money(toMinor(reversal.amount)),
    method: reversal.method || "manual",
    reference: reversal.reference || reversal.providerReference || "",
    status: reversal.status || "posted",
    direction: "reverses_money_out",
    journalId: sourceJournal(scoped, "vendor_payment_reversal", reversal.id)?.id || "",
  }));
  return {
    ...reportBase(businessId, "vendor_payment_subledger", period, "payment_date"),
    rows: rows.concat(reversalRows),
    totalCaptured: money(addMinor(...rows.map((row) => row.amount))),
    totalReversed: money(addMinor(...reversalRows.map((row) => row.amount))),
    netEffectivePayments: money(addMinor(...rows.map((row) => row.amount)) - addMinor(...reversalRows.map((row) => row.amount))),
  };
}

export function buildCustomerRefundRegister(state, businessId, options = {}) {
  const period = normalizePeriod(options);
  const scoped = scopedState(state, businessId);
  const rows = postedCustomerRefunds(scoped, period).map((refund) => ({
    refundId: refund.id,
    customerId: refund.customerId || "",
    sourceCreditNoteId: refund.sourceCreditNoteId || "",
    sourceInvoiceId: refund.sourceInvoiceId || "",
    refundDate: refund.refundDate || String(refund.createdAt || "").slice(0, 10),
    amount: money(toMinor(refund.amount)),
    method: refund.method || "manual",
    reference: refund.reference || refund.providerReference || "",
    status: refund.status || "processed",
    direction: "money_out",
    journalId: sourceJournal(scoped, "customer_refund", refund.id)?.id || "",
    financialEventId: sourceJournal(scoped, "customer_refund", refund.id)?.financialEventId || "",
  }));
  return {
    ...reportBase(businessId, "customer_refund_register", period, "refund_date"),
    rows,
    totalRefunded: money(addMinor(...rows.map((row) => row.amount))),
  };
}

export function buildVendorRefundRegister(state, businessId, options = {}) {
  const period = normalizePeriod(options);
  const scoped = scopedState(state, businessId);
  const rows = postedVendorRefunds(scoped, period).map((refund) => ({
    vendorRefundId: refund.id,
    vendorId: refund.vendorId || "",
    sourceVendorCreditId: refund.sourceVendorCreditId || "",
    sourceVendorBillId: refund.sourceVendorBillId || "",
    receivedDate: refund.receivedDate || refund.refundDate || String(refund.createdAt || "").slice(0, 10),
    amount: money(toMinor(refund.amount)),
    method: refund.method || "manual",
    reference: refund.reference || refund.providerReference || "",
    status: refund.status || "received",
    direction: "money_in",
    journalId: sourceJournal(scoped, "vendor_refund", refund.id)?.id || "",
    financialEventId: sourceJournal(scoped, "vendor_refund", refund.id)?.financialEventId || "",
  }));
  return {
    ...reportBase(businessId, "vendor_refund_register", period, "received_date"),
    rows,
    totalRecovered: money(addMinor(...rows.map((row) => row.amount))),
  };
}

export function buildCreditNoteRegister(state, businessId, options = {}) {
  const period = normalizePeriod(options);
  const scoped = scopedState(state, businessId);
  const rows = postedSalesCreditNotes(scoped, period, "creditNoteDate").map((note) => {
    const taxMinor = addMinor(note.cgstAmount, note.sgstAmount, note.igstAmount);
    return {
      creditNoteId: note.id,
      creditNoteNumber: note.creditNoteNumber,
      sourceInvoiceId: note.sourceInvoiceId,
      customerId: note.customerId || "",
      creditNoteDate: note.creditNoteDate,
      reason: note.reason || "",
      taxableValue: money(toMinor(note.total) - taxMinor),
      cgst: money(toMinor(note.cgstAmount)),
      sgst: money(toMinor(note.sgstAmount)),
      igst: money(toMinor(note.igstAmount)),
      grossCredit: money(toMinor(note.total)),
      reversesFinancialEventId: note.reversesFinancialEventId || "",
      reversesJournalId: note.reversesJournalId || "",
      fullReversal: Boolean(note.fullReversal),
    };
  });
  return {
    ...reportBase(businessId, "correction_register", period, "credit_note_date"),
    rows,
    totals: {
      taxableValue: money(addMinor(...rows.map((row) => row.taxableValue))),
      grossCredit: money(addMinor(...rows.map((row) => row.grossCredit))),
      cgst: money(addMinor(...rows.map((row) => row.cgst))),
      sgst: money(addMinor(...rows.map((row) => row.sgst))),
      igst: money(addMinor(...rows.map((row) => row.igst))),
    },
  };
}

export function buildVendorCreditRegister(state, businessId, options = {}) {
  const period = normalizePeriod(options);
  const scoped = scopedState(state, businessId);
  const rows = postedVendorCredits(scoped, period, "vendorCreditDate").map((credit) => {
    const taxMinor = addMinor(credit.cgstAmount, credit.sgstAmount, credit.igstAmount);
    return {
      vendorCreditId: credit.id,
      vendorCreditNumber: credit.vendorCreditNumber,
      sourceVendorBillId: credit.sourceVendorBillId,
      vendorId: credit.vendorId || "",
      vendorCreditDate: credit.vendorCreditDate,
      reason: credit.reason || "",
      taxableValue: money(toMinor(credit.total) - taxMinor),
      inputCgst: money(toMinor(credit.cgstAmount)),
      inputSgst: money(toMinor(credit.sgstAmount)),
      inputIgst: money(toMinor(credit.igstAmount)),
      grossCredit: money(toMinor(credit.total)),
      reversesFinancialEventId: credit.reversesFinancialEventId || "",
      reversesJournalId: credit.reversesJournalId || "",
      fullReversal: Boolean(credit.fullReversal),
    };
  });
  return {
    ...reportBase(businessId, "correction_register", period, "vendor_credit_date"),
    rows,
    totals: {
      taxableValue: money(addMinor(...rows.map((row) => row.taxableValue))),
      grossCredit: money(addMinor(...rows.map((row) => row.grossCredit))),
      inputCgst: money(addMinor(...rows.map((row) => row.inputCgst))),
      inputSgst: money(addMinor(...rows.map((row) => row.inputSgst))),
      inputIgst: money(addMinor(...rows.map((row) => row.inputIgst))),
    },
  };
}

function buildCheck(id, expectedMinor, actualMinor, details = {}) {
  const differenceMinor = actualMinor - expectedMinor;
  return {
    id,
    status: differenceMinor === 0 ? "reconciled" : "failed",
    expected: money(expectedMinor),
    actual: money(actualMinor),
    difference: money(differenceMinor),
    ...details,
  };
}

export function buildFinancialReconciliation(state, businessId, options = {}) {
  const period = normalizePeriod(options);
  const scoped = scopedState(state, businessId);
  const sales = buildSalesReport(state, businessId, options);
  const receivables = buildReceivablesReport(state, businessId, options);
  const payments = buildPaymentSummary(state, businessId, options);
  const customerRefunds = buildCustomerRefundRegister(state, businessId, options);
  const purchases = buildPurchaseRegister(state, businessId, options);
  const payables = buildVendorPayablesReport(state, businessId, options);
  const vendorPayments = buildVendorPaymentSummary(state, businessId, options);
  const vendorRefunds = buildVendorRefundRegister(state, businessId, options);
  const gst = buildGstSummary(state, businessId, options);
  const trialBalance = buildTrialBalance(state, businessId, options);
  const issued = issuedInvoices(scoped, period, "invoiceDate");
  const captured = capturedPayments(scoped, period);
  const postedBills = postedVendorBills(scoped, period, "billDate");
  const postedCredits = postedSalesCreditNotes(scoped, period, "creditNoteDate");
  const postedVendorCreditRecords = postedVendorCredits(scoped, period, "vendorCreditDate");
  const postedCustomerPaymentReversalRecords = postedPaymentReversals(scoped, period);
  const postedCustomerRefundRecords = postedCustomerRefunds(scoped, period);
  const postedVendorPaymentReversalRecords = postedVendorPaymentReversals(scoped, period);
  const postedVendorRefundRecords = postedVendorRefunds(scoped, period);
  const capturedVendorPaymentRecords = capturedVendorPayments(scoped, period);
  const postedEventsBySource = new Map(scoped.events.filter((event) => event.postingStatus === "posted").map((event) => [`${event.eventType}:${event.sourceId}`, event]));
  const failedEvents = scoped.events.filter((event) => event.postingStatus === "failed");
  const missingInvoiceEvents = issued.filter((invoice) => !postedEventsBySource.has(`invoice_issued:${invoice.id}`));
  const missingInvoiceJournals = issued.filter((invoice) => !sourceJournal(scoped, "invoice", invoice.id));
  const missingPaymentEvents = captured.filter((payment) => !postedEventsBySource.has(`payment_captured:${payment.id}`));
  const missingPaymentJournals = captured.filter((payment) => !sourceJournal(scoped, "payment", payment.id));
  const missingVendorBillEvents = postedBills.filter((bill) => !postedEventsBySource.has(`vendor_bill_posted:${bill.id}`));
  const missingVendorBillJournals = postedBills.filter((bill) => !sourceJournal(scoped, "vendor_bill", bill.id));
  const missingVendorPaymentEvents = capturedVendorPaymentRecords.filter((payment) => !postedEventsBySource.has(`vendor_payment_captured:${payment.id}`));
  const missingVendorPaymentJournals = capturedVendorPaymentRecords.filter((payment) => !sourceJournal(scoped, "vendor_payment", payment.id));
  const missingCreditNoteEvents = postedCredits.filter((note) => !postedEventsBySource.has(`sales_credit_note_posted:${note.id}`));
  const missingCreditNoteJournals = postedCredits.filter((note) => !sourceJournal(scoped, "sales_credit_note", note.id));
  const missingVendorCreditEvents = postedVendorCreditRecords.filter((credit) => !postedEventsBySource.has(`vendor_credit_posted:${credit.id}`));
  const missingVendorCreditJournals = postedVendorCreditRecords.filter((credit) => !sourceJournal(scoped, "vendor_credit", credit.id));
  const missingCustomerPaymentReversalEvents = postedCustomerPaymentReversalRecords.filter((reversal) => !postedEventsBySource.has(`customer_payment_reversed:${reversal.id}`));
  const missingCustomerPaymentReversalJournals = postedCustomerPaymentReversalRecords.filter((reversal) => !sourceJournal(scoped, "customer_payment_reversal", reversal.id));
  const missingCustomerRefundEvents = postedCustomerRefundRecords.filter((refund) => !postedEventsBySource.has(`customer_refund_processed:${refund.id}`));
  const missingCustomerRefundJournals = postedCustomerRefundRecords.filter((refund) => !sourceJournal(scoped, "customer_refund", refund.id));
  const missingVendorPaymentReversalEvents = postedVendorPaymentReversalRecords.filter((reversal) => !postedEventsBySource.has(`vendor_payment_reversed:${reversal.id}`));
  const missingVendorPaymentReversalJournals = postedVendorPaymentReversalRecords.filter((reversal) => !sourceJournal(scoped, "vendor_payment_reversal", reversal.id));
  const missingVendorRefundEvents = postedVendorRefundRecords.filter((refund) => !postedEventsBySource.has(`vendor_refund_received:${refund.id}`));
  const missingVendorRefundJournals = postedVendorRefundRecords.filter((refund) => !sourceJournal(scoped, "vendor_refund", refund.id));
  const duplicateSourceJournals = Object.values(scoped.journals.filter((journal) => journal.automatic).reduce((groups, journal) => {
    const key = `${journal.sourceType}:${journal.sourceId}`;
    groups[key] = groups[key] || [];
    groups[key].push(journal.id);
    return groups;
  }, {})).filter((ids) => ids.length > 1);

  const arLedger = sumJournalLines(scoped, (line) => accountRole(line.account) === "accounts_receivable" && inPeriod(journalDate(line.journal), period));
  const arNetMinor = arLedger.debitMinor - arLedger.creditMinor;
  const bankLedger = sumJournalLines(scoped, (line) => accountRole(line.account) === "bank_clearing" && line.journal?.sourceType === "payment" && inPeriod(journalDate(line.journal), period));
  const customerPaymentReversalBankLedger = sumJournalLines(scoped, (line) => accountRole(line.account) === "bank_clearing" && line.journal?.sourceType === "customer_payment_reversal" && inPeriod(journalDate(line.journal), period));
  const customerRefundBankLedger = sumJournalLines(scoped, (line) => accountRole(line.account) === "bank_clearing" && line.journal?.sourceType === "customer_refund" && inPeriod(journalDate(line.journal), period));
  const salesLedger = sumJournalLines(scoped, (line) => ["sales_revenue", "sales_returns"].includes(accountRole(line.account)) && ["invoice", "sales_credit_note"].includes(line.journal?.sourceType) && inPeriod(journalDate(line.journal), period));
  const cgstLedger = sumJournalLines(scoped, (line) => accountRole(line.account) === "output_cgst" && ["invoice", "sales_credit_note"].includes(line.journal?.sourceType) && inPeriod(journalDate(line.journal), period));
  const sgstLedger = sumJournalLines(scoped, (line) => accountRole(line.account) === "output_sgst" && ["invoice", "sales_credit_note"].includes(line.journal?.sourceType) && inPeriod(journalDate(line.journal), period));
  const igstLedger = sumJournalLines(scoped, (line) => accountRole(line.account) === "output_igst" && ["invoice", "sales_credit_note"].includes(line.journal?.sourceType) && inPeriod(journalDate(line.journal), period));
  const apLedger = sumJournalLines(scoped, (line) => accountRole(line.account) === "accounts_payable" && inPeriod(journalDate(line.journal), period));
  const apNetMinor = apLedger.creditMinor - apLedger.debitMinor;
  const expenseLedger = sumJournalLines(scoped, (line) => ["expense", "purchase_adjustments"].includes(accountRole(line.account)) && ["vendor_bill", "vendor_credit"].includes(line.journal?.sourceType) && inPeriod(journalDate(line.journal), period));
  const inputCgstLedger = sumJournalLines(scoped, (line) => accountRole(line.account) === "input_cgst" && ["vendor_bill", "vendor_credit"].includes(line.journal?.sourceType) && inPeriod(journalDate(line.journal), period));
  const inputSgstLedger = sumJournalLines(scoped, (line) => accountRole(line.account) === "input_sgst" && ["vendor_bill", "vendor_credit"].includes(line.journal?.sourceType) && inPeriod(journalDate(line.journal), period));
  const inputIgstLedger = sumJournalLines(scoped, (line) => accountRole(line.account) === "input_igst" && ["vendor_bill", "vendor_credit"].includes(line.journal?.sourceType) && inPeriod(journalDate(line.journal), period));
  const vendorPaymentBankLedger = sumJournalLines(scoped, (line) => accountRole(line.account) === "bank_clearing" && line.journal?.sourceType === "vendor_payment" && inPeriod(journalDate(line.journal), period));
  const vendorPaymentReversalBankLedger = sumJournalLines(scoped, (line) => accountRole(line.account) === "bank_clearing" && line.journal?.sourceType === "vendor_payment_reversal" && inPeriod(journalDate(line.journal), period));
  const vendorRefundBankLedger = sumJournalLines(scoped, (line) => accountRole(line.account) === "bank_clearing" && line.journal?.sourceType === "vendor_refund" && inPeriod(journalDate(line.journal), period));

  const journalAmountMismatches = issued.map((invoice) => {
    const journal = sourceJournal(scoped, "invoice", invoice.id);
    const expectedMinor = toMinor(invoice.total);
    const actualMinor = journal
      ? scoped.lines.filter((line) => line.journalId === journal.id).reduce((sum, line) => Math.max(sum, toMinor(line.debit), toMinor(line.credit)), 0)
      : 0;
    return buildCheck(`invoice_journal:${invoice.id}`, expectedMinor, actualMinor, { sourceType: "invoice", sourceId: invoice.id });
  }).filter((check) => check.status !== "reconciled");
  const paymentAmountMismatches = captured.map((payment) => {
    const journal = sourceJournal(scoped, "payment", payment.id);
    const expectedMinor = toMinor(payment.amount);
    const actualMinor = journal
      ? scoped.lines.filter((line) => line.journalId === journal.id && accountRole(line.account) === "bank_clearing").reduce((sum, line) => sum + toMinor(line.debit), 0)
      : 0;
    return buildCheck(`payment_journal:${payment.id}`, expectedMinor, actualMinor, { sourceType: "payment", sourceId: payment.id });
  }).filter((check) => check.status !== "reconciled");
  const vendorBillAmountMismatches = postedBills.map((bill) => {
    const journal = sourceJournal(scoped, "vendor_bill", bill.id);
    const expectedMinor = toMinor(bill.total);
    const actualMinor = journal
      ? scoped.lines.filter((line) => line.journalId === journal.id).reduce((sum, line) => Math.max(sum, toMinor(line.debit), toMinor(line.credit)), 0)
      : 0;
    return buildCheck(`vendor_bill_journal:${bill.id}`, expectedMinor, actualMinor, { sourceType: "vendor_bill", sourceId: bill.id });
  }).filter((check) => check.status !== "reconciled");
  const vendorPaymentAmountMismatches = capturedVendorPaymentRecords.map((payment) => {
    const journal = sourceJournal(scoped, "vendor_payment", payment.id);
    const expectedMinor = toMinor(payment.amount);
    const actualMinor = journal
      ? scoped.lines.filter((line) => line.journalId === journal.id && accountRole(line.account) === "accounts_payable").reduce((sum, line) => sum + toMinor(line.debit), 0)
      : 0;
    return buildCheck(`vendor_payment_journal:${payment.id}`, expectedMinor, actualMinor, { sourceType: "vendor_payment", sourceId: payment.id });
  }).filter((check) => check.status !== "reconciled");
  const customerPaymentReversalAmountMismatches = postedCustomerPaymentReversalRecords.map((reversal) => {
    const journal = sourceJournal(scoped, "customer_payment_reversal", reversal.id);
    const expectedMinor = toMinor(reversal.amount);
    const actualMinor = journal
      ? scoped.lines.filter((line) => line.journalId === journal.id && accountRole(line.account) === "accounts_receivable").reduce((sum, line) => sum + toMinor(line.debit), 0)
      : 0;
    return buildCheck(`customer_payment_reversal_journal:${reversal.id}`, expectedMinor, actualMinor, { sourceType: "customer_payment_reversal", sourceId: reversal.id });
  }).filter((check) => check.status !== "reconciled");
  const customerRefundAmountMismatches = postedCustomerRefundRecords.map((refund) => {
    const journal = sourceJournal(scoped, "customer_refund", refund.id);
    const expectedMinor = toMinor(refund.amount);
    const actualMinor = journal
      ? scoped.lines.filter((line) => line.journalId === journal.id && accountRole(line.account) === "accounts_receivable").reduce((sum, line) => sum + toMinor(line.debit), 0)
      : 0;
    return buildCheck(`customer_refund_journal:${refund.id}`, expectedMinor, actualMinor, { sourceType: "customer_refund", sourceId: refund.id });
  }).filter((check) => check.status !== "reconciled");
  const vendorPaymentReversalAmountMismatches = postedVendorPaymentReversalRecords.map((reversal) => {
    const journal = sourceJournal(scoped, "vendor_payment_reversal", reversal.id);
    const expectedMinor = toMinor(reversal.amount);
    const actualMinor = journal
      ? scoped.lines.filter((line) => line.journalId === journal.id && accountRole(line.account) === "accounts_payable").reduce((sum, line) => sum + toMinor(line.credit), 0)
      : 0;
    return buildCheck(`vendor_payment_reversal_journal:${reversal.id}`, expectedMinor, actualMinor, { sourceType: "vendor_payment_reversal", sourceId: reversal.id });
  }).filter((check) => check.status !== "reconciled");
  const vendorRefundAmountMismatches = postedVendorRefundRecords.map((refund) => {
    const journal = sourceJournal(scoped, "vendor_refund", refund.id);
    const expectedMinor = toMinor(refund.amount);
    const actualMinor = journal
      ? scoped.lines.filter((line) => line.journalId === journal.id && accountRole(line.account) === "accounts_payable").reduce((sum, line) => sum + toMinor(line.credit), 0)
      : 0;
    return buildCheck(`vendor_refund_journal:${refund.id}`, expectedMinor, actualMinor, { sourceType: "vendor_refund", sourceId: refund.id });
  }).filter((check) => check.status !== "reconciled");

  const checks = [
    buildCheck("ar_subledger_vs_control", toMinor(receivables.netReceivableControlBalance), arNetMinor, { expectedSource: "receivables_subledger", actualSource: "accounts_receivable_ledger" }),
    buildCheck("sales_transactions_vs_ledger", toMinor(sales.totals.netTaxableValue), salesLedger.creditMinor - salesLedger.debitMinor, { expectedSource: "issued_invoice_taxable_sales_less_credits", actualSource: "sales_revenue_ledger" }),
    buildCheck("cgst_transactions_vs_ledger", toMinor(gst.totals.outputCgst) - postedCredits.reduce((sum, note) => sum + toMinor(note.cgstAmount), 0), cgstLedger.creditMinor - cgstLedger.debitMinor),
    buildCheck("sgst_transactions_vs_ledger", toMinor(gst.totals.outputSgst) - postedCredits.reduce((sum, note) => sum + toMinor(note.sgstAmount), 0), sgstLedger.creditMinor - sgstLedger.debitMinor),
    buildCheck("igst_transactions_vs_ledger", toMinor(gst.totals.outputIgst) - postedCredits.reduce((sum, note) => sum + toMinor(note.igstAmount), 0), igstLedger.creditMinor - igstLedger.debitMinor),
    buildCheck("captured_payments_vs_bank_clearing", toMinor(payments.totalCaptured), bankLedger.debitMinor - bankLedger.creditMinor),
    buildCheck("customer_payment_reversals_vs_bank_clearing", toMinor(payments.totalReversed), customerPaymentReversalBankLedger.creditMinor - customerPaymentReversalBankLedger.debitMinor),
    buildCheck("customer_refunds_vs_bank_clearing", toMinor(customerRefunds.totalRefunded), customerRefundBankLedger.creditMinor - customerRefundBankLedger.debitMinor),
    buildCheck("ap_subledger_vs_control", toMinor(payables.netPayableControlBalance), apNetMinor, { expectedSource: "vendor_payables_subledger", actualSource: "accounts_payable_ledger" }),
    buildCheck("expense_transactions_vs_ledger", toMinor(purchases.totals.netTaxableValue), expenseLedger.debitMinor - expenseLedger.creditMinor, { expectedSource: "posted_vendor_bill_expenses_less_credits", actualSource: "expense_ledger" }),
    buildCheck("input_cgst_transactions_vs_ledger", toMinor(gst.totals.netInputCgst), inputCgstLedger.debitMinor - inputCgstLedger.creditMinor),
    buildCheck("input_sgst_transactions_vs_ledger", toMinor(gst.totals.netInputSgst), inputSgstLedger.debitMinor - inputSgstLedger.creditMinor),
    buildCheck("input_igst_transactions_vs_ledger", toMinor(gst.totals.netInputIgst), inputIgstLedger.debitMinor - inputIgstLedger.creditMinor),
    buildCheck("vendor_payments_vs_bank_clearing", toMinor(vendorPayments.totalCaptured), vendorPaymentBankLedger.creditMinor - vendorPaymentBankLedger.debitMinor),
    buildCheck("vendor_payment_reversals_vs_bank_clearing", toMinor(vendorPayments.totalReversed), vendorPaymentReversalBankLedger.debitMinor - vendorPaymentReversalBankLedger.creditMinor),
    buildCheck("vendor_refunds_vs_bank_clearing", toMinor(vendorRefunds.totalRecovered), vendorRefundBankLedger.debitMinor - vendorRefundBankLedger.creditMinor),
    buildCheck("trial_balance", 0, toMinor(trialBalance.totals.difference)),
  ];
  const structuralIssues = [
    ...missingInvoiceEvents.map((invoice) => ({ type: "missing_invoice_event", sourceType: "invoice", sourceId: invoice.id })),
    ...missingInvoiceJournals.map((invoice) => ({ type: "missing_invoice_journal", sourceType: "invoice", sourceId: invoice.id })),
    ...missingPaymentEvents.map((payment) => ({ type: "missing_payment_event", sourceType: "payment", sourceId: payment.id })),
    ...missingPaymentJournals.map((payment) => ({ type: "missing_payment_journal", sourceType: "payment", sourceId: payment.id })),
    ...missingVendorBillEvents.map((bill) => ({ type: "missing_vendor_bill_event", sourceType: "vendor_bill", sourceId: bill.id })),
    ...missingVendorBillJournals.map((bill) => ({ type: "missing_vendor_bill_journal", sourceType: "vendor_bill", sourceId: bill.id })),
    ...missingVendorPaymentEvents.map((payment) => ({ type: "missing_vendor_payment_event", sourceType: "vendor_payment", sourceId: payment.id })),
    ...missingVendorPaymentJournals.map((payment) => ({ type: "missing_vendor_payment_journal", sourceType: "vendor_payment", sourceId: payment.id })),
    ...missingCreditNoteEvents.map((note) => ({ type: "missing_credit_note_event", sourceType: "sales_credit_note", sourceId: note.id })),
    ...missingCreditNoteJournals.map((note) => ({ type: "missing_credit_note_journal", sourceType: "sales_credit_note", sourceId: note.id })),
    ...missingVendorCreditEvents.map((credit) => ({ type: "missing_vendor_credit_event", sourceType: "vendor_credit", sourceId: credit.id })),
    ...missingVendorCreditJournals.map((credit) => ({ type: "missing_vendor_credit_journal", sourceType: "vendor_credit", sourceId: credit.id })),
    ...missingCustomerPaymentReversalEvents.map((reversal) => ({ type: "missing_customer_payment_reversal_event", sourceType: "customer_payment_reversal", sourceId: reversal.id })),
    ...missingCustomerPaymentReversalJournals.map((reversal) => ({ type: "missing_customer_payment_reversal_journal", sourceType: "customer_payment_reversal", sourceId: reversal.id })),
    ...missingCustomerRefundEvents.map((refund) => ({ type: "missing_customer_refund_event", sourceType: "customer_refund", sourceId: refund.id })),
    ...missingCustomerRefundJournals.map((refund) => ({ type: "missing_customer_refund_journal", sourceType: "customer_refund", sourceId: refund.id })),
    ...missingVendorPaymentReversalEvents.map((reversal) => ({ type: "missing_vendor_payment_reversal_event", sourceType: "vendor_payment_reversal", sourceId: reversal.id })),
    ...missingVendorPaymentReversalJournals.map((reversal) => ({ type: "missing_vendor_payment_reversal_journal", sourceType: "vendor_payment_reversal", sourceId: reversal.id })),
    ...missingVendorRefundEvents.map((refund) => ({ type: "missing_vendor_refund_event", sourceType: "vendor_refund", sourceId: refund.id })),
    ...missingVendorRefundJournals.map((refund) => ({ type: "missing_vendor_refund_journal", sourceType: "vendor_refund", sourceId: refund.id })),
    ...failedEvents.map((event) => ({ type: "failed_financial_event", sourceType: event.sourceType, sourceId: event.sourceId, eventId: event.id, reason: event.failureReason })),
    ...duplicateSourceJournals.map((journalIds) => ({ type: "duplicate_source_journals", journalIds })),
    ...journalAmountMismatches.map((check) => ({ type: "invoice_journal_amount_mismatch", ...check })),
    ...paymentAmountMismatches.map((check) => ({ type: "payment_journal_amount_mismatch", ...check })),
    ...vendorBillAmountMismatches.map((check) => ({ type: "vendor_bill_journal_amount_mismatch", ...check })),
    ...vendorPaymentAmountMismatches.map((check) => ({ type: "vendor_payment_journal_amount_mismatch", ...check })),
    ...customerPaymentReversalAmountMismatches.map((check) => ({ type: "customer_payment_reversal_journal_amount_mismatch", ...check })),
    ...customerRefundAmountMismatches.map((check) => ({ type: "customer_refund_journal_amount_mismatch", ...check })),
    ...vendorPaymentReversalAmountMismatches.map((check) => ({ type: "vendor_payment_reversal_journal_amount_mismatch", ...check })),
    ...vendorRefundAmountMismatches.map((check) => ({ type: "vendor_refund_journal_amount_mismatch", ...check })),
  ];
  const failedChecks = checks.filter((check) => check.status !== "reconciled");
  const status = failedChecks.length || structuralIssues.length ? "failed" : "reconciled";
  return {
    ...reportBase(businessId, "reconciliation", period, "mixed"),
    status,
    checks,
    structuralIssues,
    summary: {
      failedChecks: failedChecks.length,
      structuralIssueCount: structuralIssues.length,
      missingInvoiceEvents: missingInvoiceEvents.length,
      missingInvoiceJournals: missingInvoiceJournals.length,
      missingPaymentEvents: missingPaymentEvents.length,
      missingPaymentJournals: missingPaymentJournals.length,
      missingVendorBillEvents: missingVendorBillEvents.length,
      missingVendorBillJournals: missingVendorBillJournals.length,
      missingVendorPaymentEvents: missingVendorPaymentEvents.length,
      missingVendorPaymentJournals: missingVendorPaymentJournals.length,
      missingCreditNoteEvents: missingCreditNoteEvents.length,
      missingCreditNoteJournals: missingCreditNoteJournals.length,
      missingVendorCreditEvents: missingVendorCreditEvents.length,
      missingVendorCreditJournals: missingVendorCreditJournals.length,
      missingCustomerPaymentReversalEvents: missingCustomerPaymentReversalEvents.length,
      missingCustomerPaymentReversalJournals: missingCustomerPaymentReversalJournals.length,
      missingCustomerRefundEvents: missingCustomerRefundEvents.length,
      missingCustomerRefundJournals: missingCustomerRefundJournals.length,
      missingVendorPaymentReversalEvents: missingVendorPaymentReversalEvents.length,
      missingVendorPaymentReversalJournals: missingVendorPaymentReversalJournals.length,
      missingVendorRefundEvents: missingVendorRefundEvents.length,
      missingVendorRefundJournals: missingVendorRefundJournals.length,
      failedEvents: failedEvents.length,
      duplicateSourceJournalGroups: duplicateSourceJournals.length,
    },
  };
}

export function buildFinancialReportBundle(state, businessId, options = {}) {
  return {
    profitLoss: buildProfitLoss(state, businessId, options),
    trialBalance: buildTrialBalance(state, businessId, options),
    generalLedger: buildGeneralLedger(state, businessId, options),
    receivables: buildReceivablesReport(state, businessId, options),
    ageing: buildAgeingReport(state, businessId, options),
    sales: buildSalesReport(state, businessId, options),
    gst: buildGstSummary(state, businessId, options),
    payments: buildPaymentSummary(state, businessId, options),
    purchaseRegister: buildPurchaseRegister(state, businessId, options),
    expenseSummary: buildExpenseSummary(state, businessId, options),
    vendorPayables: buildVendorPayablesReport(state, businessId, options),
    payablesAgeing: buildPayablesAgeingReport(state, businessId, options),
    vendorPayments: buildVendorPaymentSummary(state, businessId, options),
    creditNotes: buildCreditNoteRegister(state, businessId, options),
    vendorCredits: buildVendorCreditRegister(state, businessId, options),
    customerRefunds: buildCustomerRefundRegister(state, businessId, options),
    vendorRefunds: buildVendorRefundRegister(state, businessId, options),
    reconciliation: buildFinancialReconciliation(state, businessId, options),
  };
}

export function publicReport(value) {
  return clone(value);
}
