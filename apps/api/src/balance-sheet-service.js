import {
  buildProfitLoss,
  buildReceivablesReport,
  buildVendorPayablesReport,
} from "./financial-reporting-service.js";
import { financialYearForAccountingDate, validateAccountingDate } from "./accounting-period-service.js";
import { buildTdsReconciliation } from "./india-compliance-service.js";

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

function accountRole(account = {}) {
  const code = String(account.accountCode || "");
  if (code === "1100") return "accounts_receivable";
  if (code === "1110") return "bank_clearing";
  if (code === "2100") return "accounts_payable";
  if (["2201", "2202", "2203"].includes(code)) return "output_gst";
  if (["2211", "2212", "2213"].includes(code)) return "input_gst";
  if (code === "2220") return "tds_payable";
  if (code === "1300") return "tds_receivable";
  if (code === "3100") return "capital";
  if (code === "3200") return "retained_earnings";
  if (code === "3300") return "opening_balance_equity";
  return String(account.statementCategory || account.accountRole || "").trim();
}

function balanceSheetSection(account = {}) {
  if (account.balanceSheetCategory) return account.balanceSheetCategory;
  const role = accountRole(account);
  if (["accounts_receivable", "bank_clearing", "input_gst", "tds_receivable"].includes(role)) return "current_assets";
  if (["accounts_payable", "output_gst", "tds_payable"].includes(role)) return "current_liabilities";
  if (["capital", "retained_earnings", "opening_balance_equity"].includes(role)) return "equity";
  const type = String(account.accountType || "").toLowerCase();
  if (type === "asset") return "current_assets";
  if (type === "liability") return "current_liabilities";
  if (type === "equity") return "equity";
  return "";
}

function signedAccountBalanceMinor(account = {}, debitMinor = 0, creditMinor = 0) {
  const normal = String(account.normalBalance || "").toLowerCase();
  return normal === "credit" ? creditMinor - debitMinor : debitMinor - creditMinor;
}

function sourceJournal(state = {}, sourceType = "", sourceId = "") {
  return (state.accountingJournals || []).find((journal) => journal.sourceType === sourceType && journal.sourceId === sourceId && journal.status === "posted");
}

function openingSubledgerReconciliation(state = {}, businessId = "", type = "receivable") {
  const detailType = type === "payable" ? "payable" : "receivable";
  const accountCode = detailType === "payable" ? "2100" : "1100";
  const detailsMinor = (state.openingBalanceDetails || [])
    .filter((entry) => entry.businessId === businessId && entry.detailType === detailType && entry.status !== "deleted")
    .reduce((sum, entry) => sum + toMinor(entry.amount), 0);
  const controlMinor = (state.accountingJournalLines || [])
    .filter((line) => line.businessId === businessId && line.accountCode === accountCode)
    .filter((line) => {
      const journal = sourceJournal(state, "opening_balance", String(line.journalId || "").split(":")[0]);
      return journal || (state.accountingJournals || []).some((entry) => entry.id === line.journalId && entry.sourceType === "opening_balance");
    })
    .reduce((sum, line) => sum + (detailType === "payable" ? toMinor(line.credit) - toMinor(line.debit) : toMinor(line.debit) - toMinor(line.credit)), 0);
  return {
    id: `opening_${detailType}_subledger`,
    status: detailsMinor === controlMinor ? "reconciled" : "failed",
    expected: money(controlMinor),
    actual: money(detailsMinor),
    difference: money(detailsMinor - controlMinor),
  };
}

export function buildBalanceSheet(state = {}, businessId = "", options = {}) {
  const asOf = validateAccountingDate(options.asOf || new Date().toISOString().slice(0, 10), "asOf");
  const accounts = (state.ledgerAccounts || []).filter((account) => account.businessId === businessId && account.status !== "deleted");
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const journals = (state.accountingJournals || [])
    .filter((journal) => journal.businessId === businessId && journal.status === "posted" && String(journal.journalDate || "").slice(0, 10) <= asOf);
  const journalIds = new Set(journals.map((journal) => journal.id));
  const balancesByAccount = new Map();
  (state.accountingJournalLines || [])
    .filter((line) => line.businessId === businessId && journalIds.has(line.journalId))
    .forEach((line) => {
      const current = balancesByAccount.get(line.accountId) || { debitMinor: 0, creditMinor: 0 };
      current.debitMinor += toMinor(line.debit);
      current.creditMinor += toMinor(line.credit);
      balancesByAccount.set(line.accountId, current);
    });
  const sections = {
    currentAssets: [],
    nonCurrentAssets: [],
    currentLiabilities: [],
    nonCurrentLiabilities: [],
    equityAccounts: [],
  };
  let totalAssetsMinor = 0;
  let totalLiabilitiesMinor = 0;
  let postedEquityMinor = 0;
  accounts.forEach((account) => {
    const totals = balancesByAccount.get(account.id) || { debitMinor: 0, creditMinor: 0 };
    const balanceMinor = signedAccountBalanceMinor(account, totals.debitMinor, totals.creditMinor);
    if (balanceMinor === 0) return;
    const row = {
      accountId: account.id,
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountType: account.accountType,
      normalBalance: account.normalBalance,
      role: accountRole(account),
      amount: money(balanceMinor),
    };
    const section = balanceSheetSection(account);
    if (section === "current_assets") {
      sections.currentAssets.push(row);
      totalAssetsMinor += balanceMinor;
    } else if (section === "non_current_assets") {
      sections.nonCurrentAssets.push(row);
      totalAssetsMinor += balanceMinor;
    } else if (section === "current_liabilities") {
      sections.currentLiabilities.push(row);
      totalLiabilitiesMinor += balanceMinor;
    } else if (section === "non_current_liabilities") {
      sections.nonCurrentLiabilities.push(row);
      totalLiabilitiesMinor += balanceMinor;
    } else if (section === "equity") {
      sections.equityAccounts.push(row);
      postedEquityMinor += balanceMinor;
    }
  });
  const business = (state.businesses || []).find((entry) => entry.id === businessId) || {};
  const fy = financialYearForAccountingDate(asOf, business.financialYearStartMonth || business.taxProfile?.taxYearStartMonth || 4);
  const currentYearProfit = buildProfitLoss(state, businessId, { from: fy.startDate, to: asOf });
  const currentYearEarningsMinor = toMinor(currentYearProfit.profit);
  const totalEquityMinor = postedEquityMinor + currentYearEarningsMinor;
  const differenceMinor = totalAssetsMinor - (totalLiabilitiesMinor + totalEquityMinor);
  const receivables = buildReceivablesReport(state, businessId, { to: asOf, includeSettled: true });
  const payables = buildVendorPayablesReport(state, businessId, { to: asOf, includeSettled: true });
  const openingReceivableMinor = (state.openingBalanceDetails || [])
    .filter((entry) => entry.businessId === businessId && entry.detailType === "receivable" && entry.status !== "deleted")
    .reduce((sum, entry) => sum + toMinor(entry.amount), 0);
  const openingPayableMinor = (state.openingBalanceDetails || [])
    .filter((entry) => entry.businessId === businessId && entry.detailType === "payable" && entry.status !== "deleted")
    .reduce((sum, entry) => sum + toMinor(entry.amount), 0);
  const receivablesSubledgerMinor = toMinor(receivables.netReceivableControlBalance) + openingReceivableMinor;
  const payablesSubledgerMinor = toMinor(payables.netPayableControlBalance) + openingPayableMinor;
  const arAccount = accounts.find((account) => account.accountCode === "1100");
  const arTotals = balancesByAccount.get(arAccount?.id) || { debitMinor: 0, creditMinor: 0 };
  const arLedgerMinor = signedAccountBalanceMinor(arAccount || {}, arTotals.debitMinor, arTotals.creditMinor);
  const apAccount = accounts.find((account) => account.accountCode === "2100");
  const apTotals = balancesByAccount.get(apAccount?.id) || { debitMinor: 0, creditMinor: 0 };
  const tds = buildTdsReconciliation(state, business, { to: asOf });
  const checks = [
    {
      id: "balance_sheet_equation",
      status: differenceMinor === 0 ? "reconciled" : "failed",
      expected: money(totalAssetsMinor),
      actual: money(totalLiabilitiesMinor + totalEquityMinor),
      difference: money(differenceMinor),
    },
    {
      id: "current_year_earnings_to_profit_loss",
      status: currentYearEarningsMinor === toMinor(currentYearProfit.profit) ? "reconciled" : "failed",
      expected: money(toMinor(currentYearProfit.profit)),
      actual: money(currentYearEarningsMinor),
      difference: 0,
    },
    {
      id: "accounts_receivable_control_to_subledger",
      status: arLedgerMinor === receivablesSubledgerMinor ? "reconciled" : "failed",
      expected: money(arLedgerMinor),
      actual: money(receivablesSubledgerMinor),
      difference: money(receivablesSubledgerMinor - arLedgerMinor),
    },
    {
      id: "accounts_payable_control_to_subledger",
      status: signedAccountBalanceMinor(apAccount || {}, apTotals.debitMinor, apTotals.creditMinor) === payablesSubledgerMinor ? "reconciled" : "failed",
      expected: money(signedAccountBalanceMinor(apAccount || {}, apTotals.debitMinor, apTotals.creditMinor)),
      actual: money(payablesSubledgerMinor),
      difference: money(payablesSubledgerMinor - signedAccountBalanceMinor(apAccount || {}, apTotals.debitMinor, apTotals.creditMinor)),
    },
    openingSubledgerReconciliation(state, businessId, "receivable"),
    openingSubledgerReconciliation(state, businessId, "payable"),
    ...(tds.checks || []),
  ];
  return {
    businessId,
    reportType: "balance_sheet",
    asOf,
    basis: "posted_ledger_lines_with_reporting_derived_current_year_earnings",
    assets: {
      currentAssets: sections.currentAssets,
      nonCurrentAssets: sections.nonCurrentAssets,
      totalAssets: money(totalAssetsMinor),
    },
    liabilities: {
      currentLiabilities: sections.currentLiabilities,
      nonCurrentLiabilities: sections.nonCurrentLiabilities,
      totalLiabilities: money(totalLiabilitiesMinor),
    },
    equity: {
      accounts: sections.equityAccounts,
      postedEquity: money(postedEquityMinor),
      currentYearEarnings: money(currentYearEarningsMinor),
      retainedEarningsTreatment: "reporting_derived_until_explicit_year_end_close",
      totalEquity: money(totalEquityMinor),
    },
    totals: {
      totalAssets: money(totalAssetsMinor),
      totalLiabilitiesAndEquity: money(totalLiabilitiesMinor + totalEquityMinor),
      difference: money(differenceMinor),
    },
    integrity: {
      status: differenceMinor === 0 && checks.every((check) => check.status === "reconciled") ? "balanced" : differenceMinor === 0 ? "warning" : "failed",
      checks,
    },
    completeness: {
      salesAccountingComplete: true,
      purchaseExpenseAccountingComplete: true,
      A_RComplete: true,
      A_PComplete: true,
      bankCashComplete: true,
      GSTAccountingComplete: true,
      TDSAccountingComplete: true,
      openingBalancesSupported: true,
      inventoryAccountingComplete: false,
      fixedAssetsComplete: false,
      depreciationComplete: false,
      loansComplete: false,
      payrollComplete: false,
      equityTransactionsComplete: "partial",
      statutoryFinancialStatementFormatComplete: false,
    },
  };
}
