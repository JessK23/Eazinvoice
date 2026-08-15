function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function toMinor(value) {
  return Math.round(toNumber(value) * 100);
}

export function moneyFromMinor(value) {
  return Math.round(toNumber(value)) / 100;
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeKeyText(value) {
  return normalizeText(value).toLowerCase();
}

export function validateDateOnly(value, label = "date") {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T00:00:00Z`).getTime())) {
    throw new Error(`Enter a valid ${label}.`);
  }
  return text;
}

function daysBetween(left, right) {
  const leftDate = new Date(`${left}T00:00:00Z`);
  const rightDate = new Date(`${right}T00:00:00Z`);
  return Math.abs(Math.round((leftDate.getTime() - rightDate.getTime()) / 86400000));
}

export function normalizeBankAccountType(value) {
  const type = String(value || "bank").trim().toLowerCase();
  if (!["bank", "cash", "clearing"].includes(type)) throw new Error("Bank account type must be bank, cash, or clearing.");
  return type;
}

export function maskAccountReference(value = "") {
  const text = normalizeText(value);
  if (!text) return "";
  const last4 = text.replace(/\D/g, "").slice(-4) || text.slice(-4);
  return `****${last4}`;
}

export function statementFingerprint(input = {}) {
  return [
    input.businessId,
    input.bankAccountId,
    input.transactionDate,
    input.valueDate || "",
    toMinor(input.debit),
    toMinor(input.credit),
    normalizeKeyText(input.reference || input.externalReference),
    normalizeKeyText(input.description || input.narration),
  ].join("|");
}

export function normalizeStatementLine(input = {}, context = {}) {
  const transactionDate = validateDateOnly(input.transactionDate || input.date, "transaction date");
  const valueDate = input.valueDate ? validateDateOnly(input.valueDate, "value date") : "";
  let debitMinor = toMinor(input.debit);
  let creditMinor = toMinor(input.credit);
  if (!debitMinor && !creditMinor && input.amount !== undefined) {
    const amountMinor = toMinor(input.amount);
    if (amountMinor < 0) debitMinor = Math.abs(amountMinor);
    if (amountMinor > 0) creditMinor = amountMinor;
  }
  if ((debitMinor <= 0 && creditMinor <= 0) || (debitMinor > 0 && creditMinor > 0)) {
    throw new Error("Statement line must contain either a debit or a credit amount.");
  }
  const line = {
    businessId: context.businessId,
    bankAccountId: context.bankAccountId,
    importBatchId: context.importBatchId || "",
    transactionDate,
    valueDate,
    description: normalizeText(input.description || input.narration),
    externalReference: normalizeText(input.externalReference || input.reference),
    debit: moneyFromMinor(debitMinor),
    credit: moneyFromMinor(creditMinor),
    amount: moneyFromMinor(creditMinor - debitMinor),
    direction: creditMinor > 0 ? "money_in" : "money_out",
    currency: normalizeText(input.currency || context.currency || "INR") || "INR",
    source: normalizeText(input.source || context.source || "manual"),
    reconciliationStatus: "unmatched",
    matchedAmount: 0,
    unmatchedAmount: moneyFromMinor(Math.max(debitMinor, creditMinor)),
  };
  return {
    ...line,
    fingerprint: normalizeText(input.fingerprint) || statementFingerprint(line),
  };
}

function inPeriod(date, options = {}) {
  const value = String(date || "").slice(0, 10);
  if (options.from && value < options.from) return false;
  if (options.to && value > options.to) return false;
  return true;
}

function sourceRecord(state, journal = {}) {
  const sourceType = String(journal.sourceType || "");
  const sourceId = journal.sourceId;
  if (sourceType === "payment" || sourceType === "vendor_payment") return (state.payments || []).find((entry) => entry.id === sourceId) || {};
  if (sourceType === "customer_payment_reversal") return (state.paymentReversals || []).find((entry) => entry.id === sourceId) || {};
  if (sourceType === "vendor_payment_reversal") return (state.vendorPaymentReversals || []).find((entry) => entry.id === sourceId) || {};
  if (sourceType === "customer_refund") return (state.customerRefunds || []).find((entry) => entry.id === sourceId) || {};
  if (sourceType === "vendor_refund") return (state.vendorRefunds || []).find((entry) => entry.id === sourceId) || {};
  return {};
}

function sourceDate(journal = {}, record = {}) {
  return record.paymentDate || record.reversalDate || record.refundDate || record.receivedDate || journal.journalDate || String(journal.createdAt || "").slice(0, 10);
}

function sourceReference(record = {}) {
  return normalizeText(record.reference || record.providerReference || record.gatewayPaymentId || record.gatewayOrderId || record.idempotencyKey || "");
}

export function buildInternalBankTransactions(state = {}, bankAccount = {}, options = {}) {
  const businessId = bankAccount.businessId;
  const accountId = bankAccount.ledgerAccountId;
  const allowedSources = new Set(["payment", "vendor_payment", "customer_payment_reversal", "vendor_payment_reversal", "customer_refund", "vendor_refund", "manual"]);
  const journalsById = new Map((state.accountingJournals || [])
    .filter((journal) => journal.businessId === businessId && journal.status === "posted" && allowedSources.has(String(journal.sourceType || "")))
    .map((journal) => [journal.id, journal]));
  return (state.accountingJournalLines || [])
    .filter((line) => line.businessId === businessId && line.accountId === accountId && journalsById.has(line.journalId))
    .map((line) => {
      const journal = journalsById.get(line.journalId);
      const record = sourceRecord(state, journal);
      const debitMinor = toMinor(line.debit);
      const creditMinor = toMinor(line.credit);
      const amountMinor = Math.abs(debitMinor - creditMinor);
      const date = sourceDate(journal, record);
      return {
        businessId,
        bankAccountId: bankAccount.id,
        ledgerAccountId: accountId,
        sourceType: journal.sourceType,
        sourceId: journal.sourceId || journal.id,
        journalId: journal.id,
        journalLineId: line.id,
        transactionDate: date,
        direction: debitMinor >= creditMinor ? "money_in" : "money_out",
        amount: moneyFromMinor(amountMinor),
        amountMinor,
        currency: line.currency || journal.currency || bankAccount.currency || "INR",
        reference: sourceReference(record),
        narration: journal.narration || line.description || "",
      };
    })
    .filter((candidate) => candidate.amountMinor > 0 && inPeriod(candidate.transactionDate, options));
}

function matchedMinorForStatement(matches = [], statementLineId) {
  return matches
    .filter((match) => match.statementLineId === statementLineId && String(match.status || "matched") === "matched")
    .reduce((sum, match) => sum + toMinor(match.matchedAmount), 0);
}

function matchedMinorForInternal(matches = [], candidate) {
  return matches
    .filter((match) => match.sourceType === candidate.sourceType && match.sourceId === candidate.sourceId && String(match.status || "matched") === "matched")
    .reduce((sum, match) => sum + toMinor(match.matchedAmount), 0);
}

export function suggestMatchesForLine(state = {}, bankAccount = {}, statementLine = {}, options = {}) {
  const toleranceDays = Number.isFinite(Number(options.toleranceDays)) ? Number(options.toleranceDays) : 2;
  const matches = state.bankReconciliationMatches || [];
  const lineAmountMinor = Math.max(toMinor(statementLine.debit), toMinor(statementLine.credit));
  const remainingLineMinor = Math.max(0, lineAmountMinor - matchedMinorForStatement(matches, statementLine.id));
  if (remainingLineMinor <= 0) return { status: "matched", candidates: [] };
  const reference = normalizeKeyText(statementLine.externalReference);
  const candidates = buildInternalBankTransactions(state, bankAccount, {
    from: options.from,
    to: options.to,
  }).map((candidate) => {
    const remainingCandidateMinor = Math.max(0, candidate.amountMinor - matchedMinorForInternal(matches, candidate));
    const referenceMatches = Boolean(reference && normalizeKeyText(candidate.reference) === reference);
    const dateDelta = daysBetween(statementLine.transactionDate, candidate.transactionDate);
    const compatible = (
      candidate.direction === statementLine.direction
      && candidate.currency === statementLine.currency
      && remainingCandidateMinor > 0
      && remainingCandidateMinor === remainingLineMinor
      && dateDelta <= toleranceDays
    );
    const confidence = !compatible ? "none" : referenceMatches && dateDelta === 0 ? "exact" : referenceMatches ? "high" : "medium";
    return {
      ...candidate,
      remainingAmount: moneyFromMinor(remainingCandidateMinor),
      dateDelta,
      referenceMatches,
      confidence,
      compatible,
    };
  }).filter((candidate) => candidate.compatible);
  const exact = candidates.filter((candidate) => candidate.confidence === "exact" || candidate.confidence === "high");
  const status = candidates.length === 0 ? "unmatched" : candidates.length === 1 && exact.length === 1 ? "suggested" : "ambiguous";
  return { status, candidates };
}

export function calculateBankReconciliationSummary(state = {}, bankAccount = {}, options = {}) {
  const lines = (state.bankStatementLines || []).filter((line) => (
    line.businessId === bankAccount.businessId
    && line.bankAccountId === bankAccount.id
    && inPeriod(line.transactionDate, options)
    && String(line.status || "active") !== "deleted"
  ));
  const matches = (state.bankReconciliationMatches || []).filter((match) => (
    match.businessId === bankAccount.businessId
    && match.bankAccountId === bankAccount.id
    && String(match.status || "matched") === "matched"
  ));
  const internal = buildInternalBankTransactions(state, bankAccount, options);
  const bookBalanceMinor = internal.reduce((sum, candidate) => (
    sum + (candidate.direction === "money_in" ? candidate.amountMinor : -candidate.amountMinor)
  ), 0);
  const statementCreditMinor = lines.reduce((sum, line) => sum + toMinor(line.credit), 0);
  const statementDebitMinor = lines.reduce((sum, line) => sum + toMinor(line.debit), 0);
  const matchedStatementMinor = matches.reduce((sum, match) => sum + toMinor(match.matchedAmount), 0);
  const unmatchedStatementCreditsMinor = lines.reduce((sum, line) => {
    const unmatched = Math.max(0, toMinor(line.credit) - matchedMinorForStatement(matches, line.id));
    return sum + unmatched;
  }, 0);
  const unmatchedStatementDebitsMinor = lines.reduce((sum, line) => {
    const unmatched = Math.max(0, toMinor(line.debit) - matchedMinorForStatement(matches, line.id));
    return sum + unmatched;
  }, 0);
  const unmatchedInternal = internal.filter((candidate) => matchedMinorForInternal(matches, candidate) < candidate.amountMinor);
  const unmatchedInternalInMinor = unmatchedInternal.filter((candidate) => candidate.direction === "money_in").reduce((sum, candidate) => sum + candidate.amountMinor - matchedMinorForInternal(matches, candidate), 0);
  const unmatchedInternalOutMinor = unmatchedInternal.filter((candidate) => candidate.direction === "money_out").reduce((sum, candidate) => sum + candidate.amountMinor - matchedMinorForInternal(matches, candidate), 0);
  const reconciliationDifferenceMinor = unmatchedStatementCreditsMinor - unmatchedStatementDebitsMinor - unmatchedInternalInMinor + unmatchedInternalOutMinor;
  const statementIntegrity = options.openingBalance !== undefined && options.closingBalance !== undefined
    ? moneyFromMinor(toMinor(options.openingBalance) + statementCreditMinor - statementDebitMinor - toMinor(options.closingBalance))
    : null;
  const status = lines.length === 0 && internal.length === 0
    ? "not_started"
    : reconciliationDifferenceMinor === 0 && unmatchedInternal.length === 0 && unmatchedStatementCreditsMinor === 0 && unmatchedStatementDebitsMinor === 0 && (!statementIntegrity || toMinor(statementIntegrity) === 0)
      ? "reconciled"
      : matches.length > 0 ? "exception" : "in_progress";
  return {
    businessId: bankAccount.businessId,
    bankAccountId: bankAccount.id,
    period: { from: options.from || "", to: options.to || "" },
    status,
    ledgerBookBalance: moneyFromMinor(bookBalanceMinor),
    totalImportedCredits: moneyFromMinor(statementCreditMinor),
    totalImportedDebits: moneyFromMinor(statementDebitMinor),
    matchedStatementAmount: moneyFromMinor(matchedStatementMinor),
    unmatchedStatementCredits: moneyFromMinor(unmatchedStatementCreditsMinor),
    unmatchedStatementDebits: moneyFromMinor(unmatchedStatementDebitsMinor),
    unmatchedInternalCredits: moneyFromMinor(unmatchedInternalInMinor),
    unmatchedInternalDebits: moneyFromMinor(unmatchedInternalOutMinor),
    unmatchedInternalTransactions: unmatchedInternal,
    reconciliationDifference: moneyFromMinor(reconciliationDifferenceMinor),
    statementIntegrityDifference: statementIntegrity,
    clearingOutstanding: bankAccount.accountType === "clearing" ? moneyFromMinor(bookBalanceMinor) : 0,
  };
}
