const DEFAULT_ACCOUNT_DEFINITIONS = [
  ["1100", "Accounts Receivable", "asset", "debit", "accounts_receivable"],
  ["1110", "Bank / Payment Clearing", "asset", "debit", "bank_clearing"],
  ["2201", "Output CGST Payable", "liability", "credit", "output_cgst"],
  ["2202", "Output SGST Payable", "liability", "credit", "output_sgst"],
  ["2203", "Output IGST Payable", "liability", "credit", "output_igst"],
  ["2100", "Accounts Payable", "liability", "credit", "accounts_payable"],
  ["2211", "Input CGST Credit", "asset", "debit", "input_cgst"],
  ["2212", "Input SGST Credit", "asset", "debit", "input_sgst"],
  ["2213", "Input IGST Credit", "asset", "debit", "input_igst"],
  ["2220", "TDS Payable", "liability", "credit", "tds_payable"],
  ["1300", "TDS Receivable / Tax Credit", "asset", "debit", "tds_receivable"],
  ["4100", "Sales Revenue", "income", "credit", "sales_revenue"],
  ["4200", "Sales Returns / Adjustments", "income", "debit", "sales_returns"],
  ["5100", "Operating Expense", "expense", "debit", "operating_expense"],
  ["5200", "Purchase / Expense Adjustments", "expense", "credit", "purchase_adjustments"],
];

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

function nextId(prefix, counter) {
  return `${prefix}_${String(counter).padStart(4, "0")}`;
}

function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function eventKey(businessId, eventType, sourceId) {
  return [businessId, eventType, sourceId].map((part) => String(part || "").trim()).join(":");
}

export function validateBalancedJournal(lines = []) {
  const totalDebitMinor = lines.reduce((sum, line) => sum + toMinor(line.debit), 0);
  const totalCreditMinor = lines.reduce((sum, line) => sum + toMinor(line.credit), 0);
  if (totalDebitMinor <= 0 || totalCreditMinor <= 0 || totalDebitMinor !== totalCreditMinor) {
    throw new Error("Journal debit and credit totals must match.");
  }
  return {
    totalDebit: fromMinor(totalDebitMinor),
    totalCredit: fromMinor(totalCreditMinor),
  };
}

export function ensureDefaultAccountingAccounts(state, business = {}, ownerUserId = null) {
  state.ledgerAccounts = Array.isArray(state.ledgerAccounts) ? state.ledgerAccounts : [];
  const businessId = business.id || business.businessId;
  if (!businessId) throw new Error("Business is required for accounting accounts.");
  const accounts = {};
  DEFAULT_ACCOUNT_DEFINITIONS.forEach(([code, name, type, normalBalance, key]) => {
    let account = state.ledgerAccounts.find((entry) => entry.businessId === businessId && entry.accountCode === code);
    if (!account) {
      account = {
        id: nextId("acct", ++state.counters.ledgerAccount),
        businessId,
        ownerUserId: business.ownerUserId || ownerUserId || null,
        accountCode: code,
        accountName: name,
        accountType: type,
        normalBalance,
        systemAccount: true,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.ledgerAccounts.push(account);
    }
    accounts[key] = account;
  });
  return accounts;
}

function ensureAccountBusiness(account, businessId) {
  if (!account || account.businessId !== businessId) {
    throw new Error("Ledger account does not belong to this business.");
  }
}

function createFinancialEvent(state, input = {}) {
  state.financialEvents = Array.isArray(state.financialEvents) ? state.financialEvents : [];
  const idempotencyKey = input.idempotencyKey || eventKey(input.businessId, input.eventType, input.sourceId);
  const existing = state.financialEvents.find((event) => (
    event.businessId === input.businessId
    && event.idempotencyKey === idempotencyKey
  ));
  if (existing) return { event: existing, replay: true };
  const event = {
    id: nextId("fev", ++state.counters.financialEvent),
    businessId: input.businessId,
    eventType: input.eventType,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceStatus: input.sourceStatus || "",
    eventTimestamp: input.eventTimestamp || new Date().toISOString(),
    postingStatus: "pending",
    idempotencyKey,
    metadata: input.metadata || {},
    createdAt: new Date().toISOString(),
    postedAt: null,
    failedAt: null,
    failureReason: "",
    journalId: "",
  };
  state.financialEvents.push(event);
  return { event, replay: false };
}

function persistJournal(state, event, input = {}) {
  state.accountingJournals = Array.isArray(state.accountingJournals) ? state.accountingJournals : [];
  state.accountingJournalLines = Array.isArray(state.accountingJournalLines) ? state.accountingJournalLines : [];
  const existing = state.accountingJournals.find((journal) => journal.financialEventId === event.id);
  if (existing) {
    event.postingStatus = "posted";
    event.journalId = existing.id;
    return existing;
  }

  const totals = validateBalancedJournal(input.lines);
  input.lines.forEach((line) => ensureAccountBusiness(line.account, event.businessId));
  const journal = {
    id: nextId("ajrnl", ++state.counters.accountingJournal),
    businessId: event.businessId,
    ownerUserId: input.ownerUserId || null,
    journalNumber: input.journalNumber || `AUTO-${String(state.counters.accountingJournal).padStart(4, "0")}`,
    journalDate: input.journalDate || new Date().toISOString().slice(0, 10),
    narration: input.narration || "",
    status: "posted",
    sourceType: event.sourceType,
    sourceId: event.sourceId,
    financialEventId: event.id,
    postingRule: input.postingRule,
    postingRuleVersion: input.postingRuleVersion || "1",
    automatic: true,
    immutable: true,
    currency: input.currency || "INR",
    totalDebit: totals.totalDebit,
    totalCredit: totals.totalCredit,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.accountingJournals.push(journal);
  input.lines.forEach((line, index) => {
    state.accountingJournalLines.push({
      id: `${journal.id}:line:${index + 1}`,
      journalId: journal.id,
      businessId: event.businessId,
      ownerUserId: journal.ownerUserId,
      accountId: line.account.id,
      accountCode: line.account.accountCode,
      accountName: line.account.accountName,
      lineIndex: index + 1,
      description: line.description || journal.narration,
      debit: fromMinor(toMinor(line.debit)),
      credit: fromMinor(toMinor(line.credit)),
      currency: journal.currency,
      createdAt: journal.createdAt,
    });
  });
  event.postingStatus = "posted";
  event.journalId = journal.id;
  event.postedAt = new Date().toISOString();
  return journal;
}

function failEvent(event, error) {
  event.postingStatus = "failed";
  event.failedAt = new Date().toISOString();
  event.failureReason = String(error?.message || error || "Posting failed").slice(0, 500);
}

export function postInvoiceIssued(state, invoice = {}, business = {}, options = {}) {
  if (!invoice?.id) throw new Error("Invoice is required for posting.");
  const status = normalizeStatus(invoice.status);
  if (!business?.id || invoice.businessId !== business.id) throw new Error("Invoice business does not match posting business.");
  if (status === "draft" || status === "deleted" || status === "cancelled" || status === "void") {
    return { posted: false, reason: "invoice_not_issued" };
  }
  const { event, replay } = createFinancialEvent(state, {
    businessId: business.id,
    eventType: "invoice_issued",
    sourceType: "invoice",
    sourceId: invoice.id,
    sourceStatus: invoice.status,
    eventTimestamp: invoice.createdAt,
    metadata: { invoiceNumber: invoice.invoiceNumber },
  });
  if (event.postingStatus === "posted") return { posted: true, event: clone(event), replay: true };

  try {
    const accounts = {
      ...ensureDefaultAccountingAccounts(state, business, invoice.ownerUserId),
      ...(options.accounts || {}),
    };
    const taxTotal = toNumber(invoice.cgstAmount) + toNumber(invoice.sgstAmount) + toNumber(invoice.igstAmount);
    const taxable = toNumber(invoice.total) - taxTotal;
    const lines = [
      { account: accounts.accounts_receivable, debit: invoice.total, description: `Invoice ${invoice.invoiceNumber || invoice.id}` },
      { account: accounts.sales_revenue, credit: taxable, description: "Sales revenue" },
    ];
    if (toMinor(invoice.cgstAmount) > 0) lines.push({ account: accounts.output_cgst, credit: invoice.cgstAmount, description: "Output CGST" });
    if (toMinor(invoice.sgstAmount) > 0) lines.push({ account: accounts.output_sgst, credit: invoice.sgstAmount, description: "Output SGST" });
    if (toMinor(invoice.igstAmount) > 0) lines.push({ account: accounts.output_igst, credit: invoice.igstAmount, description: "Output IGST" });
    const journal = persistJournal(state, event, {
      ownerUserId: invoice.ownerUserId,
      journalDate: invoice.invoiceDate || invoice.createdAt?.slice(0, 10),
      narration: `Invoice issued ${invoice.invoiceNumber || invoice.id}`,
      sourceType: "invoice",
      currency: invoice.currency || "INR",
      postingRule: "sales_invoice_issued",
      lines,
    });
    return { posted: true, event: clone(event), journal: clone(journal), replay };
  } catch (error) {
    failEvent(event, error);
    return { posted: false, event: clone(event), error: event.failureReason };
  }
}

export function postPaymentCaptured(state, payment = {}, invoice = {}, business = {}, options = {}) {
  if (!payment?.id || !invoice?.id) throw new Error("Payment and invoice are required for posting.");
  if (!business?.id || payment.businessId !== business.id || invoice.businessId !== business.id) {
    throw new Error("Payment business does not match invoice business.");
  }
  if (normalizeStatus(payment.status || "captured") !== "captured") return { posted: false, reason: "payment_not_captured" };
  const { event, replay } = createFinancialEvent(state, {
    businessId: business.id,
    eventType: "payment_captured",
    sourceType: "payment",
    sourceId: payment.id,
    sourceStatus: payment.status || "captured",
    eventTimestamp: payment.createdAt,
    idempotencyKey: eventKey(business.id, "payment_captured", payment.id),
    metadata: { invoiceId: invoice.id, reference: payment.reference || payment.gatewayPaymentId || "" },
  });
  if (event.postingStatus === "posted") return { posted: true, event: clone(event), replay: true };

  try {
    const accounts = {
      ...ensureDefaultAccountingAccounts(state, business, payment.ownerUserId),
      ...(options.accounts || {}),
    };
    const journal = persistJournal(state, event, {
      ownerUserId: payment.ownerUserId,
      journalDate: payment.paymentDate || payment.createdAt?.slice(0, 10),
      narration: `Payment captured for invoice ${invoice.invoiceNumber || invoice.id}`,
      sourceType: "payment",
      currency: payment.currency || invoice.currency || "INR",
      postingRule: "invoice_payment_captured",
      lines: [
        { account: accounts.bank_clearing, debit: payment.amount, description: "Bank / payment clearing" },
        { account: accounts.accounts_receivable, credit: payment.amount, description: "Accounts receivable settled" },
      ],
    });
    return { posted: true, event: clone(event), journal: clone(journal), replay };
  } catch (error) {
    failEvent(event, error);
    return { posted: false, event: clone(event), error: event.failureReason };
  }
}

export function postVendorBillPosted(state, bill = {}, business = {}, options = {}) {
  if (!bill?.id) throw new Error("Vendor bill is required for posting.");
  const status = normalizeStatus(bill.status);
  if (!business?.id || bill.businessId !== business.id) throw new Error("Vendor bill business does not match posting business.");
  if (status === "draft" || status === "deleted" || status === "cancelled" || status === "void") {
    return { posted: false, reason: "vendor_bill_not_posted" };
  }
  const { event, replay } = createFinancialEvent(state, {
    businessId: business.id,
    eventType: "vendor_bill_posted",
    sourceType: "vendor_bill",
    sourceId: bill.id,
    sourceStatus: bill.status,
    eventTimestamp: bill.createdAt,
    metadata: { vendorBillNumber: bill.vendorBillNumber || "", internalBillNumber: bill.internalBillNumber || "" },
  });
  if (event.postingStatus === "posted") return { posted: true, event: clone(event), replay: true };

  try {
    const accounts = {
      ...ensureDefaultAccountingAccounts(state, business, bill.ownerUserId),
      ...(options.accounts || {}),
    };
    const taxTotal = toNumber(bill.cgstAmount) + toNumber(bill.sgstAmount) + toNumber(bill.igstAmount);
    const expenseAmount = toNumber(bill.total) - taxTotal;
    const lines = [
      { account: options.expenseAccount || accounts.operating_expense, debit: expenseAmount, description: bill.expenseCategory || "Operating expense" },
    ];
    if (toMinor(bill.cgstAmount) > 0) lines.push({ account: accounts.input_cgst, debit: bill.cgstAmount, description: "Input CGST" });
    if (toMinor(bill.sgstAmount) > 0) lines.push({ account: accounts.input_sgst, debit: bill.sgstAmount, description: "Input SGST" });
    if (toMinor(bill.igstAmount) > 0) lines.push({ account: accounts.input_igst, debit: bill.igstAmount, description: "Input IGST" });
    const tdsAmount = toNumber(bill.tdsSnapshot?.amount || bill.tdsAmount);
    const netPayable = Math.max(0, toNumber(bill.total) - tdsAmount);
    lines.push({ account: accounts.accounts_payable, credit: netPayable, description: `Vendor bill ${bill.vendorBillNumber || bill.internalBillNumber || bill.id}` });
    if (toMinor(tdsAmount) > 0) lines.push({ account: accounts.tds_payable, credit: tdsAmount, description: "TDS payable withheld from vendor bill" });
    const journal = persistJournal(state, event, {
      ownerUserId: bill.ownerUserId,
      journalDate: bill.billDate || bill.createdAt?.slice(0, 10),
      narration: `Vendor bill posted ${bill.vendorBillNumber || bill.internalBillNumber || bill.id}`,
      currency: bill.currency || "INR",
      postingRule: "vendor_bill_posted",
      lines,
    });
    return { posted: true, event: clone(event), journal: clone(journal), replay };
  } catch (error) {
    failEvent(event, error);
    return { posted: false, event: clone(event), error: event.failureReason };
  }
}

export function postVendorPaymentCaptured(state, payment = {}, bill = {}, business = {}, options = {}) {
  if (!payment?.id || !bill?.id) throw new Error("Vendor payment and bill are required for posting.");
  if (!business?.id || payment.businessId !== business.id || bill.businessId !== business.id) {
    throw new Error("Vendor payment business does not match bill business.");
  }
  if (normalizeStatus(payment.status || "captured") !== "captured") return { posted: false, reason: "vendor_payment_not_captured" };
  const { event, replay } = createFinancialEvent(state, {
    businessId: business.id,
    eventType: "vendor_payment_captured",
    sourceType: "vendor_payment",
    sourceId: payment.id,
    sourceStatus: payment.status || "captured",
    eventTimestamp: payment.createdAt,
    idempotencyKey: eventKey(business.id, "vendor_payment_captured", payment.id),
    metadata: { vendorBillId: bill.id, reference: payment.reference || payment.gatewayPaymentId || "" },
  });
  if (event.postingStatus === "posted") return { posted: true, event: clone(event), replay: true };

  try {
    const accounts = {
      ...ensureDefaultAccountingAccounts(state, business, payment.ownerUserId),
      ...(options.accounts || {}),
    };
    const journal = persistJournal(state, event, {
      ownerUserId: payment.ownerUserId,
      journalDate: payment.paymentDate || payment.createdAt?.slice(0, 10),
      narration: `Vendor payment captured for bill ${bill.vendorBillNumber || bill.internalBillNumber || bill.id}`,
      currency: payment.currency || bill.currency || "INR",
      postingRule: "vendor_payment_captured",
      lines: [
        { account: accounts.accounts_payable, debit: payment.amount, description: "Accounts payable settled" },
        { account: accounts.bank_clearing, credit: payment.amount, description: "Bank / payment clearing" },
      ],
    });
    return { posted: true, event: clone(event), journal: clone(journal), replay };
  } catch (error) {
    failEvent(event, error);
    return { posted: false, event: clone(event), error: event.failureReason };
  }
}

export function postCustomerPaymentReversed(state, reversal = {}, payment = {}, invoice = {}, business = {}, options = {}) {
  if (!reversal?.id || !payment?.id || !invoice?.id) throw new Error("Payment reversal, payment and invoice are required for posting.");
  if (!business?.id || reversal.businessId !== business.id || payment.businessId !== business.id || invoice.businessId !== business.id) {
    throw new Error("Customer payment reversal business does not match source payment business.");
  }
  if (normalizeStatus(reversal.status || "posted") !== "posted") return { posted: false, reason: "payment_reversal_not_posted" };
  const { journal: originalJournal, event: originalEvent } = options.lineage || {};
  const { event, replay } = createFinancialEvent(state, {
    businessId: business.id,
    eventType: "customer_payment_reversed",
    sourceType: "customer_payment_reversal",
    sourceId: reversal.id,
    sourceStatus: reversal.status || "posted",
    eventTimestamp: reversal.reversalDate || reversal.createdAt,
    idempotencyKey: eventKey(business.id, "customer_payment_reversed", reversal.id),
    metadata: {
      originalPaymentId: payment.id,
      invoiceId: invoice.id,
      reason: reversal.reason || "",
      reference: reversal.reference || "",
      reversesFinancialEventId: originalEvent?.id || reversal.reversesFinancialEventId || "",
      reversesJournalId: originalJournal?.id || reversal.reversesJournalId || "",
    },
  });
  if (event.postingStatus === "posted") return { posted: true, event: clone(event), replay: true };

  try {
    const accounts = {
      ...ensureDefaultAccountingAccounts(state, business, reversal.ownerUserId || payment.ownerUserId),
      ...(options.accounts || {}),
    };
    const journal = persistJournal(state, event, {
      ownerUserId: reversal.ownerUserId || payment.ownerUserId,
      journalDate: reversal.reversalDate || reversal.createdAt?.slice(0, 10),
      narration: `Customer payment reversal for ${payment.id}`,
      currency: reversal.currency || payment.currency || invoice.currency || "INR",
      postingRule: "customer_payment_reversed",
      lines: [
        { account: accounts.accounts_receivable, debit: reversal.amount, description: `A/R restored for payment ${payment.id}` },
        { account: accounts.bank_clearing, credit: reversal.amount, description: "Bank / payment clearing reversed" },
      ],
    });
    journal.correctsDocumentId = payment.id;
    journal.reversesJournalId = originalJournal?.id || reversal.reversesJournalId || "";
    event.reversesFinancialEventId = originalEvent?.id || reversal.reversesFinancialEventId || "";
    event.reversesJournalId = originalJournal?.id || reversal.reversesJournalId || "";
    return { posted: true, event: clone(event), journal: clone(journal), replay };
  } catch (error) {
    failEvent(event, error);
    return { posted: false, event: clone(event), error: event.failureReason };
  }
}

export function postVendorPaymentReversed(state, reversal = {}, payment = {}, bill = {}, business = {}, options = {}) {
  if (!reversal?.id || !payment?.id || !bill?.id) throw new Error("Vendor payment reversal, payment and bill are required for posting.");
  if (!business?.id || reversal.businessId !== business.id || payment.businessId !== business.id || bill.businessId !== business.id) {
    throw new Error("Vendor payment reversal business does not match source payment business.");
  }
  if (normalizeStatus(reversal.status || "posted") !== "posted") return { posted: false, reason: "vendor_payment_reversal_not_posted" };
  const { journal: originalJournal, event: originalEvent } = options.lineage || {};
  const { event, replay } = createFinancialEvent(state, {
    businessId: business.id,
    eventType: "vendor_payment_reversed",
    sourceType: "vendor_payment_reversal",
    sourceId: reversal.id,
    sourceStatus: reversal.status || "posted",
    eventTimestamp: reversal.reversalDate || reversal.createdAt,
    idempotencyKey: eventKey(business.id, "vendor_payment_reversed", reversal.id),
    metadata: {
      originalPaymentId: payment.id,
      vendorBillId: bill.id,
      reason: reversal.reason || "",
      reference: reversal.reference || "",
      reversesFinancialEventId: originalEvent?.id || reversal.reversesFinancialEventId || "",
      reversesJournalId: originalJournal?.id || reversal.reversesJournalId || "",
    },
  });
  if (event.postingStatus === "posted") return { posted: true, event: clone(event), replay: true };

  try {
    const accounts = {
      ...ensureDefaultAccountingAccounts(state, business, reversal.ownerUserId || payment.ownerUserId),
      ...(options.accounts || {}),
    };
    const journal = persistJournal(state, event, {
      ownerUserId: reversal.ownerUserId || payment.ownerUserId,
      journalDate: reversal.reversalDate || reversal.createdAt?.slice(0, 10),
      narration: `Vendor payment reversal for ${payment.id}`,
      currency: reversal.currency || payment.currency || bill.currency || "INR",
      postingRule: "vendor_payment_reversed",
      lines: [
        { account: accounts.bank_clearing, debit: reversal.amount, description: "Bank / payment clearing restored" },
        { account: accounts.accounts_payable, credit: reversal.amount, description: `A/P restored for payment ${payment.id}` },
      ],
    });
    journal.correctsDocumentId = payment.id;
    journal.reversesJournalId = originalJournal?.id || reversal.reversesJournalId || "";
    event.reversesFinancialEventId = originalEvent?.id || reversal.reversesFinancialEventId || "";
    event.reversesJournalId = originalJournal?.id || reversal.reversesJournalId || "";
    return { posted: true, event: clone(event), journal: clone(journal), replay };
  } catch (error) {
    failEvent(event, error);
    return { posted: false, event: clone(event), error: event.failureReason };
  }
}

export function postCustomerRefundProcessed(state, refund = {}, creditNote = {}, business = {}, options = {}) {
  if (!refund?.id || !creditNote?.id) throw new Error("Customer refund and source credit note are required for posting.");
  if (!business?.id || refund.businessId !== business.id || creditNote.businessId !== business.id) {
    throw new Error("Customer refund business does not match source credit note business.");
  }
  if (normalizeStatus(refund.status || "processed") !== "processed") return { posted: false, reason: "customer_refund_not_processed" };
  const { journal: sourceJournalEntry, event: sourceEvent } = options.lineage || {};
  const { event, replay } = createFinancialEvent(state, {
    businessId: business.id,
    eventType: "customer_refund_processed",
    sourceType: "customer_refund",
    sourceId: refund.id,
    sourceStatus: refund.status || "processed",
    eventTimestamp: refund.refundDate || refund.createdAt,
    idempotencyKey: eventKey(business.id, "customer_refund_processed", refund.id),
    metadata: {
      customerId: refund.customerId || "",
      sourceCreditNoteId: creditNote.id,
      reference: refund.reference || refund.providerReference || "",
      settlesFinancialEventId: sourceEvent?.id || "",
      settlesJournalId: sourceJournalEntry?.id || "",
    },
  });
  if (event.postingStatus === "posted") return { posted: true, event: clone(event), replay: true };

  try {
    const accounts = {
      ...ensureDefaultAccountingAccounts(state, business, refund.ownerUserId || creditNote.ownerUserId),
      ...(options.accounts || {}),
    };
    const journal = persistJournal(state, event, {
      ownerUserId: refund.ownerUserId || creditNote.ownerUserId,
      journalDate: refund.refundDate || refund.createdAt?.slice(0, 10),
      narration: `Customer refund for credit note ${creditNote.creditNoteNumber || creditNote.id}`,
      currency: refund.currency || creditNote.currency || "INR",
      postingRule: "customer_refund_processed",
      lines: [
        { account: accounts.accounts_receivable, debit: refund.amount, description: `Customer credit settled ${creditNote.creditNoteNumber || creditNote.id}` },
        { account: accounts.bank_clearing, credit: refund.amount, description: "Refund paid through bank / clearing" },
      ],
    });
    journal.correctsDocumentId = creditNote.id;
    journal.reversesJournalId = "";
    return { posted: true, event: clone(event), journal: clone(journal), replay };
  } catch (error) {
    failEvent(event, error);
    return { posted: false, event: clone(event), error: event.failureReason };
  }
}

export function postVendorRefundReceived(state, refund = {}, vendorCredit = {}, business = {}, options = {}) {
  if (!refund?.id || !vendorCredit?.id) throw new Error("Vendor refund and source vendor credit are required for posting.");
  if (!business?.id || refund.businessId !== business.id || vendorCredit.businessId !== business.id) {
    throw new Error("Vendor refund business does not match source vendor credit business.");
  }
  if (normalizeStatus(refund.status || "received") !== "received") return { posted: false, reason: "vendor_refund_not_received" };
  const { journal: sourceJournalEntry, event: sourceEvent } = options.lineage || {};
  const { event, replay } = createFinancialEvent(state, {
    businessId: business.id,
    eventType: "vendor_refund_received",
    sourceType: "vendor_refund",
    sourceId: refund.id,
    sourceStatus: refund.status || "received",
    eventTimestamp: refund.receivedDate || refund.refundDate || refund.createdAt,
    idempotencyKey: eventKey(business.id, "vendor_refund_received", refund.id),
    metadata: {
      vendorId: refund.vendorId || "",
      sourceVendorCreditId: vendorCredit.id,
      reference: refund.reference || refund.providerReference || "",
      settlesFinancialEventId: sourceEvent?.id || "",
      settlesJournalId: sourceJournalEntry?.id || "",
    },
  });
  if (event.postingStatus === "posted") return { posted: true, event: clone(event), replay: true };

  try {
    const accounts = {
      ...ensureDefaultAccountingAccounts(state, business, refund.ownerUserId || vendorCredit.ownerUserId),
      ...(options.accounts || {}),
    };
    const journal = persistJournal(state, event, {
      ownerUserId: refund.ownerUserId || vendorCredit.ownerUserId,
      journalDate: refund.receivedDate || refund.refundDate || refund.createdAt?.slice(0, 10),
      narration: `Vendor refund for credit ${vendorCredit.vendorCreditNumber || vendorCredit.id}`,
      currency: refund.currency || vendorCredit.currency || "INR",
      postingRule: "vendor_refund_received",
      lines: [
        { account: accounts.bank_clearing, debit: refund.amount, description: "Vendor refund received through bank / clearing" },
        { account: accounts.accounts_payable, credit: refund.amount, description: `Supplier credit settled ${vendorCredit.vendorCreditNumber || vendorCredit.id}` },
      ],
    });
    journal.correctsDocumentId = vendorCredit.id;
    journal.reversesJournalId = "";
    return { posted: true, event: clone(event), journal: clone(journal), replay };
  } catch (error) {
    failEvent(event, error);
    return { posted: false, event: clone(event), error: event.failureReason };
  }
}

export function postSalesCreditNotePosted(state, creditNote = {}, invoice = {}, business = {}, options = {}) {
  if (!creditNote?.id || !invoice?.id) throw new Error("Sales credit note and source invoice are required for posting.");
  if (!business?.id || creditNote.businessId !== business.id || invoice.businessId !== business.id) {
    throw new Error("Sales credit note business does not match source invoice business.");
  }
  if (normalizeStatus(creditNote.status || "draft") === "draft") return { posted: false, reason: "credit_note_not_posted" };
  const { event, replay } = createFinancialEvent(state, {
    businessId: business.id,
    eventType: "sales_credit_note_posted",
    sourceType: "sales_credit_note",
    sourceId: creditNote.id,
    sourceStatus: creditNote.status,
    eventTimestamp: creditNote.creditNoteDate || creditNote.createdAt,
    idempotencyKey: eventKey(business.id, "sales_credit_note_posted", creditNote.id),
    metadata: {
      sourceInvoiceId: invoice.id,
      creditNoteNumber: creditNote.creditNoteNumber || "",
      reversesFinancialEventId: creditNote.reversesFinancialEventId || "",
      reversesJournalId: creditNote.reversesJournalId || "",
      reason: creditNote.reason || "",
    },
  });
  if (event.postingStatus === "posted") return { posted: true, event: clone(event), replay: true };

  try {
    const accounts = {
      ...ensureDefaultAccountingAccounts(state, business, creditNote.ownerUserId),
      ...(options.accounts || {}),
    };
    const taxTotal = toNumber(creditNote.cgstAmount) + toNumber(creditNote.sgstAmount) + toNumber(creditNote.igstAmount);
    const taxable = toNumber(creditNote.total) - taxTotal;
    const lines = [
      { account: accounts.sales_returns, debit: taxable, description: `Sales credit ${creditNote.creditNoteNumber || creditNote.id}` },
    ];
    if (toMinor(creditNote.cgstAmount) > 0) lines.push({ account: accounts.output_cgst, debit: creditNote.cgstAmount, description: "Output CGST adjustment" });
    if (toMinor(creditNote.sgstAmount) > 0) lines.push({ account: accounts.output_sgst, debit: creditNote.sgstAmount, description: "Output SGST adjustment" });
    if (toMinor(creditNote.igstAmount) > 0) lines.push({ account: accounts.output_igst, debit: creditNote.igstAmount, description: "Output IGST adjustment" });
    lines.push({ account: accounts.accounts_receivable, credit: creditNote.total, description: `A/R reduced for invoice ${invoice.invoiceNumber || invoice.id}` });
    const journal = persistJournal(state, event, {
      ownerUserId: creditNote.ownerUserId,
      journalDate: creditNote.creditNoteDate || creditNote.createdAt?.slice(0, 10),
      narration: `Sales credit note ${creditNote.creditNoteNumber || creditNote.id}`,
      currency: creditNote.currency || invoice.currency || "INR",
      postingRule: creditNote.fullReversal ? "sales_invoice_full_reversal" : "sales_credit_note_posted",
      lines,
    });
    journal.correctsDocumentId = invoice.id;
    journal.reversesJournalId = creditNote.reversesJournalId || "";
    event.reversesFinancialEventId = creditNote.reversesFinancialEventId || "";
    event.reversesJournalId = creditNote.reversesJournalId || "";
    return { posted: true, event: clone(event), journal: clone(journal), replay };
  } catch (error) {
    failEvent(event, error);
    return { posted: false, event: clone(event), error: event.failureReason };
  }
}

export function postVendorCreditPosted(state, vendorCredit = {}, bill = {}, business = {}, options = {}) {
  if (!vendorCredit?.id || !bill?.id) throw new Error("Vendor credit and source bill are required for posting.");
  if (!business?.id || vendorCredit.businessId !== business.id || bill.businessId !== business.id) {
    throw new Error("Vendor credit business does not match source bill business.");
  }
  if (normalizeStatus(vendorCredit.status || "draft") === "draft") return { posted: false, reason: "vendor_credit_not_posted" };
  const { event, replay } = createFinancialEvent(state, {
    businessId: business.id,
    eventType: "vendor_credit_posted",
    sourceType: "vendor_credit",
    sourceId: vendorCredit.id,
    sourceStatus: vendorCredit.status,
    eventTimestamp: vendorCredit.vendorCreditDate || vendorCredit.createdAt,
    idempotencyKey: eventKey(business.id, "vendor_credit_posted", vendorCredit.id),
    metadata: {
      sourceVendorBillId: bill.id,
      vendorCreditNumber: vendorCredit.vendorCreditNumber || "",
      reversesFinancialEventId: vendorCredit.reversesFinancialEventId || "",
      reversesJournalId: vendorCredit.reversesJournalId || "",
      reason: vendorCredit.reason || "",
    },
  });
  if (event.postingStatus === "posted") return { posted: true, event: clone(event), replay: true };

  try {
    const accounts = {
      ...ensureDefaultAccountingAccounts(state, business, vendorCredit.ownerUserId),
      ...(options.accounts || {}),
    };
    const taxTotal = toNumber(vendorCredit.cgstAmount) + toNumber(vendorCredit.sgstAmount) + toNumber(vendorCredit.igstAmount);
    const taxable = toNumber(vendorCredit.total) - taxTotal;
    const lines = [
      { account: accounts.accounts_payable, debit: vendorCredit.total, description: `A/P reduced for bill ${bill.vendorBillNumber || bill.id}` },
      { account: accounts.purchase_adjustments, credit: taxable, description: `Vendor credit ${vendorCredit.vendorCreditNumber || vendorCredit.id}` },
    ];
    if (toMinor(vendorCredit.cgstAmount) > 0) lines.push({ account: accounts.input_cgst, credit: vendorCredit.cgstAmount, description: "Input CGST adjustment" });
    if (toMinor(vendorCredit.sgstAmount) > 0) lines.push({ account: accounts.input_sgst, credit: vendorCredit.sgstAmount, description: "Input SGST adjustment" });
    if (toMinor(vendorCredit.igstAmount) > 0) lines.push({ account: accounts.input_igst, credit: vendorCredit.igstAmount, description: "Input IGST adjustment" });
    const journal = persistJournal(state, event, {
      ownerUserId: vendorCredit.ownerUserId,
      journalDate: vendorCredit.vendorCreditDate || vendorCredit.createdAt?.slice(0, 10),
      narration: `Vendor credit ${vendorCredit.vendorCreditNumber || vendorCredit.id}`,
      currency: vendorCredit.currency || bill.currency || "INR",
      postingRule: vendorCredit.fullReversal ? "vendor_bill_full_reversal" : "vendor_credit_posted",
      lines,
    });
    journal.correctsDocumentId = bill.id;
    journal.reversesJournalId = vendorCredit.reversesJournalId || "";
    event.reversesFinancialEventId = vendorCredit.reversesFinancialEventId || "";
    event.reversesJournalId = vendorCredit.reversesJournalId || "";
    return { posted: true, event: clone(event), journal: clone(journal), replay };
  } catch (error) {
    failEvent(event, error);
    return { posted: false, event: clone(event), error: event.failureReason };
  }
}

export function reconcileAccountingPostings(state, businessId = "") {
  const businessFilter = (record) => !businessId || record.businessId === businessId;
  const postedEventSources = new Set((state.financialEvents || [])
    .filter((event) => businessFilter(event) && event.postingStatus === "posted")
    .map((event) => `${event.eventType}:${event.sourceId}`));
  const failedEvents = (state.financialEvents || []).filter((event) => businessFilter(event) && event.postingStatus === "failed");
  const missingInvoicePostings = (state.invoices || []).filter((invoice) => (
    businessFilter(invoice)
    && !["draft", "deleted", "cancelled", "void"].includes(normalizeStatus(invoice.status))
    && !postedEventSources.has(`invoice_issued:${invoice.id}`)
  ));
  const missingPaymentPostings = (state.payments || []).filter((payment) => (
    businessFilter(payment)
    && normalizeStatus(payment.status || "captured") === "captured"
    && !postedEventSources.has(`payment_captured:${payment.id}`)
  ));
  const duplicateJournalSources = Object.values((state.accountingJournals || [])
    .filter((journal) => businessFilter(journal) && journal.automatic)
    .reduce((groups, journal) => {
      const key = `${journal.sourceType}:${journal.sourceId}`;
      groups[key] = groups[key] || [];
      groups[key].push(journal);
      return groups;
    }, {}))
    .filter((group) => group.length > 1);
  return {
    missingInvoicePostings: clone(missingInvoicePostings),
    missingPaymentPostings: clone(missingPaymentPostings),
    failedEvents: clone(failedEvents),
    duplicateJournalSources: clone(duplicateJournalSources),
  };
}

export function publicJournalWithLines(state, journal) {
  return {
    ...clone(journal),
    lines: clone((state.accountingJournalLines || []).filter((line) => line.journalId === journal.id)),
  };
}
