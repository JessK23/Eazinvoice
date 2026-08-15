import {
  buildFinancialReconciliation,
  buildGeneralLedger,
  buildProfitLoss,
  buildTrialBalance,
  buildReceivablesReport,
  buildVendorPayablesReport,
} from "./financial-reporting-service.js";
import { buildBalanceSheet } from "./balance-sheet-service.js";
import { calculateBankReconciliationSummary } from "./bank-reconciliation-service.js";
import { buildGstReconciliation, buildTdsReconciliation } from "./india-compliance-service.js";
import { financialYearForAccountingDate, validateAccountingDate } from "./accounting-period-service.js";

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toMinor(value) {
  return Math.round(toNumber(value) * 100);
}

function money(minor) {
  return Math.round(toNumber(minor)) / 100;
}

function dateOnly(value = "") {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function addMonths(dateValue, count) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + count);
  return date.toISOString().slice(0, 10);
}

function previousDate(dateValue) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function normalizeFinancialYear(input = {}, business = {}) {
  const startMonth = business.financialYearStartMonth || business.taxProfile?.taxYearStartMonth || input.financialYearStartMonth || 4;
  if (input.financialYear) {
    const match = String(input.financialYear).match(/^(\d{4})-(?:\d{2}|\d{4})$/);
    if (!match) throw new Error("financialYear must look like 2026-27.");
    const startYear = Number(match[1]);
    return financialYearForAccountingDate(`${startYear}-${String(startMonth).padStart(2, "0")}-01`, startMonth);
  }
  return financialYearForAccountingDate(input.closeDate || input.asOf || new Date().toISOString().slice(0, 10), startMonth);
}

export function monthlyPeriodKeysForFinancialYear(financialYear = {}) {
  return Array.from({ length: 12 }, (_, index) => {
    const date = addMonths(financialYear.startDate, index);
    return date.slice(0, 7);
  });
}

function accountRole(account = {}) {
  return String(account.accountRole || account.statementCategory || "").trim();
}

function isNominalAccount(account = {}) {
  const type = String(account.accountType || "").toLowerCase();
  return type === "income" || type === "expense";
}

function signedBalanceMinor(account = {}, debitMinor = 0, creditMinor = 0) {
  return String(account.normalBalance || "").toLowerCase() === "credit"
    ? creditMinor - debitMinor
    : debitMinor - creditMinor;
}

function postedJournalsInRange(state = {}, businessId = "", from = "", to = "", options = {}) {
  const excluded = new Set(options.excludeSourceTypes || []);
  return (state.accountingJournals || []).filter((journal) => {
    const journalDate = dateOnly(journal.journalDate || journal.createdAt);
    return journal.businessId === businessId
      && journal.status === "posted"
      && journalDate >= from
      && journalDate <= to
      && !excluded.has(String(journal.sourceType || ""));
  });
}

export function retainedEarningsAccount(accounts = []) {
  return accounts.find((account) => account.accountRole === "retained_earnings")
    || accounts.find((account) => account.accountCode === "3200");
}

export function buildYearEndClosePreview(state = {}, business = {}, input = {}) {
  const fy = normalizeFinancialYear(input, business);
  const closeDate = validateAccountingDate(input.closeDate || fy.endDate, "closeDate");
  if (closeDate < fy.startDate || closeDate > fy.endDate) throw new Error("Year-end close date must fall inside the selected financial year.");
  const accounts = (state.ledgerAccounts || []).filter((account) => account.businessId === business.id && account.status !== "deleted");
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const retainedAccount = retainedEarningsAccount(accounts);
  if (!retainedAccount) throw new Error("Retained earnings account is required for year-end close.");
  const journals = postedJournalsInRange(state, business.id, fy.startDate, closeDate, {
    excludeSourceTypes: ["year_end_close", "year_end_close_reversal"],
  });
  const journalIds = new Set(journals.map((journal) => journal.id));
  const nominalTotals = new Map();
  const retainedTotals = { debitMinor: 0, creditMinor: 0 };
  (state.accountingJournalLines || [])
    .filter((line) => line.businessId === business.id && journalIds.has(line.journalId))
    .forEach((line) => {
      const account = accountById.get(line.accountId);
      if (!account) return;
      if (account.id === retainedAccount.id) {
        retainedTotals.debitMinor += toMinor(line.debit);
        retainedTotals.creditMinor += toMinor(line.credit);
      }
      if (!isNominalAccount(account)) return;
      const current = nominalTotals.get(account.id) || { account, debitMinor: 0, creditMinor: 0 };
      current.debitMinor += toMinor(line.debit);
      current.creditMinor += toMinor(line.credit);
      nominalTotals.set(account.id, current);
    });
  const lines = [];
  for (const totals of nominalTotals.values()) {
    const rawDebitMinusCredit = totals.debitMinor - totals.creditMinor;
    if (rawDebitMinusCredit === 0) continue;
    const amountMinor = Math.abs(rawDebitMinusCredit);
    lines.push({
      account: totals.account,
      accountCode: totals.account.accountCode,
      accountName: totals.account.accountName,
      description: `Close ${totals.account.accountName} for FY ${fy.label}`,
      debit: rawDebitMinusCredit < 0 ? money(amountMinor) : 0,
      credit: rawDebitMinusCredit > 0 ? money(amountMinor) : 0,
    });
  }
  const closingDebitMinor = lines.reduce((sum, line) => sum + toMinor(line.debit), 0);
  const closingCreditMinor = lines.reduce((sum, line) => sum + toMinor(line.credit), 0);
  const retainedAdjustmentMinor = closingDebitMinor - closingCreditMinor;
  if (retainedAdjustmentMinor !== 0) {
    lines.push({
      account: retainedAccount,
      accountCode: retainedAccount.accountCode,
      accountName: retainedAccount.accountName,
      description: `Transfer FY ${fy.label} profit/loss to retained earnings`,
      debit: retainedAdjustmentMinor < 0 ? money(Math.abs(retainedAdjustmentMinor)) : 0,
      credit: retainedAdjustmentMinor > 0 ? money(retainedAdjustmentMinor) : 0,
    });
  }
  const retainedBeforeMinor = signedBalanceMinor(retainedAccount, retainedTotals.debitMinor, retainedTotals.creditMinor);
  const retainedAfterMinor = retainedBeforeMinor + retainedAdjustmentMinor;
  const profitLoss = buildProfitLoss(state, business.id, { from: fy.startDate, to: closeDate });
  return {
    businessId: business.id,
    financialYear: fy.label,
    startDate: fy.startDate,
    endDate: fy.endDate,
    closeDate,
    method: "direct_close_to_retained_earnings",
    retainedEarningsAccountId: retainedAccount.id,
    retainedEarningsAccountCode: retainedAccount.accountCode,
    totals: {
      revenue: profitLoss.revenue,
      expenses: profitLoss.expenses,
      netProfitLoss: profitLoss.profit,
      retainedEarningsBefore: money(retainedBeforeMinor),
      retainedEarningsAdjustment: money(retainedAdjustmentMinor),
      retainedEarningsAfter: money(retainedAfterMinor),
    },
    lines: lines.map((line, index) => ({
      lineIndex: index + 1,
      accountId: line.account.id,
      accountCode: line.accountCode,
      accountName: line.accountName,
      description: line.description,
      debit: line.debit,
      credit: line.credit,
    })),
    integrity: {
      closingJournalBalanced: lines.reduce((sum, line) => sum + toMinor(line.debit) - toMinor(line.credit), 0) === 0,
      profitLossMatchesRetainedEarningsAdjustment: toMinor(profitLoss.profit) === retainedAdjustmentMinor,
    },
  };
}

export function buildYearEndReadiness(state = {}, business = {}, input = {}) {
  const fy = normalizeFinancialYear(input, business);
  const closeDate = validateAccountingDate(input.closeDate || fy.endDate, "closeDate");
  const periodKeys = monthlyPeriodKeysForFinancialYear(fy);
  const periods = (state.accountingPeriods || []).filter((period) => period.businessId === business.id && period.financialYear === fy.label);
  const periodByKey = new Map(periods.map((period) => [period.periodKey, period]));
  const missingPeriods = periodKeys.filter((key) => !periodByKey.has(key));
  const notClosedPeriods = periods.filter((period) => periodKeys.includes(period.periodKey) && String(period.status || "open") !== "closed");
  const blockers = [];
  const warnings = [];
  const informational = [];
  if (missingPeriods.length) warnings.push({ code: "financial_year_periods_missing", severity: "warning", count: missingPeriods.length, periodKeys: missingPeriods });
  if (notClosedPeriods.length) warnings.push({ code: "financial_year_periods_not_all_closed", severity: "warning", count: notClosedPeriods.length, periodKeys: notClosedPeriods.map((period) => period.periodKey) });
  const trialBalance = buildTrialBalance(state, business.id, { to: closeDate });
  if (toMinor(trialBalance.totals?.difference) !== 0) blockers.push({ code: "trial_balance_imbalance", severity: "blocker", difference: trialBalance.totals?.difference || 0 });
  const reconciliation = buildFinancialReconciliation(state, business.id, { from: fy.startDate, to: closeDate });
  (reconciliation.issues || []).filter((issue) => issue.type === "failed_financial_event").forEach((issue) => blockers.push({ code: "failed_financial_event", severity: "blocker", ...issue }));
  (reconciliation.issues || []).filter((issue) => String(issue.type || "").includes("missing")).forEach((issue) => blockers.push({ code: issue.type, severity: "blocker", ...issue }));
  if ((reconciliation.summary?.duplicateSourceJournalGroups || 0) > 0) blockers.push({ code: "duplicate_source_journals", severity: "blocker", count: reconciliation.summary.duplicateSourceJournalGroups });
  const balanceSheet = buildBalanceSheet(state, business.id, { asOf: closeDate, includeClosingEntries: true });
  if (toMinor(balanceSheet.totals?.difference) !== 0) blockers.push({ code: "balance_sheet_equation_failed", severity: "blocker", difference: balanceSheet.totals?.difference || 0 });
  (balanceSheet.integrity?.checks || [])
    .filter((check) => ["accounts_receivable_control_to_subledger", "accounts_payable_control_to_subledger"].includes(check.id) && check.status !== "reconciled")
    .forEach((check) => blockers.push({ code: check.id, severity: "blocker", difference: check.difference }));
  const openingEquity = (balanceSheet.equity?.accounts || []).find((account) => account.role === "opening_balance_equity");
  if (openingEquity && toMinor(openingEquity.amount) !== 0) warnings.push({ code: "opening_balance_equity_unresolved", severity: "warning", amount: openingEquity.amount });
  const bankSummaries = (state.bankAccounts || [])
    .filter((account) => account.businessId === business.id && String(account.status || "active") !== "deleted")
    .map((account) => calculateBankReconciliationSummary(state, account, { to: closeDate }));
  const bankExceptions = bankSummaries.filter((summary) => !["reconciled", "not_started"].includes(summary.status));
  if (bankExceptions.length) {
    warnings.push({ code: "bank_reconciliation_exception", severity: "warning", count: bankExceptions.length });
  }
  const gst = buildGstReconciliation(state, business, { from: fy.startDate, to: closeDate });
  if (gst.status && gst.status !== "reconciled") warnings.push({ code: "gst_reconciliation_review_required", severity: "warning", status: gst.status });
  const tds = buildTdsReconciliation(state, business, { from: fy.startDate, to: closeDate });
  (tds.checks || []).filter((check) => check.status !== "reconciled").forEach((check) => warnings.push({ code: `tds_${check.id}`, severity: "warning", status: check.status }));
  const preview = buildYearEndClosePreview(state, business, { ...input, closeDate });
  if (!preview.integrity.closingJournalBalanced) blockers.push({ code: "closing_journal_preview_imbalance", severity: "blocker" });
  if (!preview.integrity.profitLossMatchesRetainedEarningsAdjustment) blockers.push({ code: "current_year_earnings_mismatch", severity: "blocker" });
  const activeClose = (state.yearEndCloses || []).find((close) => close.businessId === business.id && close.financialYear === fy.label && close.status === "closed");
  if (activeClose) blockers.push({ code: "year_end_close_already_exists", severity: "blocker", closeId: activeClose.id, journalId: activeClose.closingJournalId });
  informational.push({ code: "annual_roll_forward_uses_continuous_ledger", severity: "informational" });
  return {
    businessId: business.id,
    financialYear: fy.label,
    startDate: fy.startDate,
    endDate: fy.endDate,
    closeDate,
    status: blockers.length ? "blocked" : warnings.length ? "ready_with_warnings" : "ready",
    blockers,
    warnings,
    informational,
    checks: {
      trialBalanceStatus: trialBalance.integrity?.status || "",
      balanceSheetStatus: balanceSheet.integrity?.status || "",
      currentYearEarnings: balanceSheet.equity?.currentYearEarnings || 0,
      profitLoss: preview.totals.netProfitLoss,
    },
    preview,
  };
}

export function buildOpeningRollForwardSummary(state = {}, business = {}, input = {}) {
  const fy = normalizeFinancialYear(input, business);
  const nextStartDate = addMonths(fy.startDate, 12);
  const previousCloseDate = previousDate(nextStartDate);
  const closingBalanceSheet = buildBalanceSheet(state, business.id, { asOf: previousCloseDate, includeClosingEntries: true });
  const openingBalanceSheet = buildBalanceSheet(state, business.id, { asOf: previousCloseDate, includeClosingEntries: true });
  return {
    businessId: business.id,
    fromFinancialYear: fy.label,
    closingDate: previousCloseDate,
    nextFinancialYear: financialYearForAccountingDate(nextStartDate, business.financialYearStartMonth || business.taxProfile?.taxYearStartMonth || 4).label,
    openingDate: nextStartDate,
    method: "continuous_ledger_roll_forward_no_new_opening_journal",
    permanentAccountCarryForward: {
      closingAssets: closingBalanceSheet.assets.totalAssets,
      closingLiabilities: closingBalanceSheet.liabilities.totalLiabilities,
      closingEquity: closingBalanceSheet.equity.totalEquity,
      openingAssets: openingBalanceSheet.assets.totalAssets,
      openingLiabilities: openingBalanceSheet.liabilities.totalLiabilities,
      openingEquity: openingBalanceSheet.equity.totalEquity,
    },
    continuity: {
      assetsMatch: toMinor(closingBalanceSheet.assets.totalAssets) === toMinor(openingBalanceSheet.assets.totalAssets),
      liabilitiesMatch: toMinor(closingBalanceSheet.liabilities.totalLiabilities) === toMinor(openingBalanceSheet.liabilities.totalLiabilities),
      equityMatch: toMinor(closingBalanceSheet.equity.totalEquity) === toMinor(openingBalanceSheet.equity.totalEquity),
    },
  };
}

export function buildYearEndReportBundle(state = {}, business = {}, input = {}) {
  const fy = normalizeFinancialYear(input, business);
  const closeDate = validateAccountingDate(input.closeDate || fy.endDate, "closeDate");
  return {
    businessId: business.id,
    financialYear: fy.label,
    period: { from: fy.startDate, to: closeDate },
    readiness: buildYearEndReadiness(state, business, { ...input, closeDate }),
    profitLoss: buildProfitLoss(state, business.id, { from: fy.startDate, to: closeDate }),
    balanceSheet: buildBalanceSheet(state, business.id, { asOf: closeDate, includeClosingEntries: true }),
    trialBalance: buildTrialBalance(state, business.id, { to: closeDate }),
    generalLedger: buildGeneralLedger(state, business.id, { from: fy.startDate, to: closeDate }),
    receivables: buildReceivablesReport(state, business.id, { to: closeDate, includeSettled: true }),
    payables: buildVendorPayablesReport(state, business.id, { to: closeDate, includeSettled: true }),
    bankReconciliation: (state.bankAccounts || [])
      .filter((account) => account.businessId === business.id && String(account.status || "active") !== "deleted")
      .map((account) => calculateBankReconciliationSummary(state, account, { to: closeDate })),
    gstReconciliation: buildGstReconciliation(state, business, { from: fy.startDate, to: closeDate }),
    tdsReconciliation: buildTdsReconciliation(state, business, { from: fy.startDate, to: closeDate }),
    rollForward: buildOpeningRollForwardSummary(state, business, { financialYear: fy.label }),
    closingJournalSummary: (state.yearEndCloses || []).filter((close) => close.businessId === business.id && close.financialYear === fy.label),
  };
}

export function buildComparativeFinancialYears(state = {}, business = {}, input = {}) {
  const current = normalizeFinancialYear(input, business);
  const previous = financialYearForAccountingDate(previousDate(current.startDate), business.financialYearStartMonth || business.taxProfile?.taxYearStartMonth || 4);
  const rowFor = (fy) => {
    const profitLoss = buildProfitLoss(state, business.id, { from: fy.startDate, to: fy.endDate });
    const balanceSheet = buildBalanceSheet(state, business.id, { asOf: fy.endDate, includeClosingEntries: true });
    return {
      financialYear: fy.label,
      from: fy.startDate,
      to: fy.endDate,
      revenue: profitLoss.revenue,
      expenses: profitLoss.expenses,
      profit: profitLoss.profit,
      assets: balanceSheet.assets.totalAssets,
      liabilities: balanceSheet.liabilities.totalLiabilities,
      equity: balanceSheet.equity.totalEquity,
    };
  };
  return {
    businessId: business.id,
    current: rowFor(current),
    previous: rowFor(previous),
  };
}
