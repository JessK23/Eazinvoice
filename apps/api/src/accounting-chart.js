// Canonical accounting semantics shared by runtime and PostgreSQL consumers.
// Account IDs and historical journal lines remain authoritative; these definitions
// govern new resolution and compatibility classification only.
export const CANONICAL_SYSTEM_ACCOUNTS = Object.freeze([
  { code: "1100", name: "Accounts Receivable", type: "asset", normalBalance: "debit", role: "accounts_receivable", balanceSheetCategory: "current_assets" },
  { code: "1110", name: "Bank / Payment Clearing", type: "asset", normalBalance: "debit", role: "bank_clearing", balanceSheetCategory: "current_assets" },
  { code: "1300", name: "TDS Receivable / Tax Credit", type: "asset", normalBalance: "debit", role: "tds_receivable", balanceSheetCategory: "current_assets" },
  { code: "2100", name: "Accounts Payable", type: "liability", normalBalance: "credit", role: "accounts_payable", balanceSheetCategory: "current_liabilities" },
  { code: "2110", name: "Customer Advances / Unapplied Customer Receipts", type: "liability", normalBalance: "credit", role: "customer_advances", balanceSheetCategory: "current_liabilities" },
  { code: "2201", name: "Output CGST Payable", type: "liability", normalBalance: "credit", role: "output_cgst", balanceSheetCategory: "current_liabilities" },
  { code: "2202", name: "Output SGST Payable", type: "liability", normalBalance: "credit", role: "output_sgst", balanceSheetCategory: "current_liabilities" },
  { code: "2203", name: "Output IGST Payable", type: "liability", normalBalance: "credit", role: "output_igst", balanceSheetCategory: "current_liabilities" },
  { code: "2211", name: "Input CGST Credit", type: "asset", normalBalance: "debit", role: "input_cgst", balanceSheetCategory: "current_assets" },
  { code: "2212", name: "Input SGST Credit", type: "asset", normalBalance: "debit", role: "input_sgst", balanceSheetCategory: "current_assets" },
  { code: "2213", name: "Input IGST Credit", type: "asset", normalBalance: "debit", role: "input_igst", balanceSheetCategory: "current_assets" },
  { code: "2220", name: "TDS Payable", type: "liability", normalBalance: "credit", role: "tds_payable", balanceSheetCategory: "current_liabilities" },
  { code: "3100", name: "Capital Account", type: "equity", normalBalance: "credit", role: "capital", balanceSheetCategory: "equity" },
  { code: "3200", name: "Retained Earnings / Accumulated Profit", type: "equity", normalBalance: "credit", role: "retained_earnings", balanceSheetCategory: "equity" },
  { code: "3300", name: "Opening Balance Equity", type: "equity", normalBalance: "credit", role: "opening_balance_equity", balanceSheetCategory: "equity" },
  { code: "4100", name: "Sales Revenue", type: "income", normalBalance: "credit", role: "sales_revenue", balanceSheetCategory: "" },
  { code: "4200", name: "Sales Returns / Adjustments", type: "income", normalBalance: "debit", role: "sales_returns", balanceSheetCategory: "" },
  { code: "5100", name: "Operating Expense", type: "expense", normalBalance: "debit", role: "operating_expense", balanceSheetCategory: "" },
  { code: "5200", name: "Purchase / Expense Adjustments", type: "expense", normalBalance: "credit", role: "purchase_adjustments", balanceSheetCategory: "" },
]);

export const LEGACY_COMPATIBILITY_ACCOUNTS = Object.freeze([
  { code: "1120", name: "Cash in Hand", type: "asset", normalBalance: "debit", role: "legacy_cash_compatibility", balanceSheetCategory: "current_assets" },
  { code: "2200", name: "Output GST / Tax Payable", type: "liability", normalBalance: "credit", role: "legacy_output_gst_compatibility", balanceSheetCategory: "current_liabilities" },
  { code: "2210", name: "Input GST / Tax Credit", type: "asset", normalBalance: "debit", role: "legacy_input_gst_compatibility", balanceSheetCategory: "current_assets" },
]);

export const ACCOUNTING_AUTHORITY_MIGRATION = "AUTH-ACCOUNTING-MIGRATE-01A";

export function canonicalAccountByCode(code) {
  return CANONICAL_SYSTEM_ACCOUNTS.find((account) => account.code === String(code || "").trim()) || null;
}

export function classifyLegacyAccount(input = {}) {
  const account = input.account || {};
  const code = String(account.accountCode || account.account_code || "").trim();
  const hasBankMapping = Boolean(input.hasBankMapping);
  const hasReconciliation = Boolean(input.hasReconciliation);
  const hasOpeningBalance = Boolean(input.hasOpeningBalance);
  const hasClearingUsage = Boolean(input.hasClearingUsage);
  const hasOtherJournalUsage = Boolean(input.hasOtherJournalUsage);
  const duplicate = Boolean(input.duplicate);
  if (duplicate) return { status: "manual_review", reasonCode: "duplicate_account_code", code };
  if (code === "1110") {
    if (hasBankMapping && hasClearingUsage) return { status: "manual_review", reasonCode: "mixed_clearing_and_bank_use", code };
    if (hasReconciliation || hasBankMapping) return { status: "compatibility_map", reasonCode: "genuine_bank_or_reconciled_use", code };
    if (hasOpeningBalance && !hasClearingUsage) return { status: "manual_review", reasonCode: "opening_balance_without_decisive_lineage", code };
    if (hasOtherJournalUsage && !hasClearingUsage) return { status: "manual_review", reasonCode: "non_clearing_journal_use", code };
    if (hasClearingUsage) return { status: "auto_migrate", reasonCode: "historical_clearing_authority", code };
    return { status: "auto_migrate", reasonCode: "unused_clearing_default", code };
  }
  if (code === "2110") {
    const compatible = String(account.accountType || account.account_type || "").toLowerCase() === "liability"
      && String(account.normalBalance || account.normal_balance || "").toLowerCase() === "credit";
    return compatible
      ? { status: "no_op", reasonCode: "compatible_customer_advance", code }
      : { status: "manual_review", reasonCode: "incompatible_customer_advance", code };
  }
  if (code === "1100") {
    const compatible = String(account.accountType || account.account_type || "").toLowerCase() === "asset"
      && String(account.normalBalance || account.normal_balance || "").toLowerCase() === "debit";
    return compatible
      ? { status: "no_op", reasonCode: "compatible_accounts_receivable", code }
      : { status: "manual_review", reasonCode: "incompatible_accounts_receivable", code };
  }
  return { status: "no_op", reasonCode: "non_system_account", code };
}

export function chartFingerprint() {
  return CANONICAL_SYSTEM_ACCOUNTS.map(({ code, role, type, normalBalance }) => `${code}:${role}:${type}:${normalBalance}`).join("|");
}
