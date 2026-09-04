import { buildAiCommand } from "./ai-assistant.js";

const MAX_AGENT_TOOL_STEPS = 8;
const SAFE_ROW_LIMIT = 10;
const DANGEROUS_TOOL_NAMES = new Set([
  "finalize_invoice",
  "make_payment",
  "post_journal",
  "file_return",
  "submit_gst_return",
  "submit_tds_return",
  "submit_itr",
  "delete_record",
]);

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function money(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function text(value) {
  return String(value || "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthPeriod() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, now.getUTCMonth() + 1, 0)).getUTCDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
    label: `${year}-${month}`,
  };
}

function previousMonthPeriod(period = currentMonthPeriod()) {
  const base = new Date(`${period.from || today()}T00:00:00.000Z`);
  base.setUTCMonth(base.getUTCMonth() - 1);
  const year = base.getUTCFullYear();
  const monthIndex = base.getUTCMonth();
  const month = String(monthIndex + 1).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
    label: `${year}-${month}`,
  };
}

function normalizePeriod(input = {}) {
  const command = lower(input.command);
  if (input.from || input.to) {
    return {
      from: input.from || "",
      to: input.to || "",
      label: input.label || "Custom period",
    };
  }
  if (/\bthis month|current month|month\b/.test(command)) return currentMonthPeriod();
  if (/\btoday\b/.test(command)) return { from: today(), to: today(), label: "Today" };
  return currentMonthPeriod();
}

function maskName(value) {
  const clean = text(value);
  if (!clean) return "";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].length <= 2 ? parts[0] : `${parts[0][0]}${"*".repeat(Math.min(5, parts[0].length - 1))}`;
  return `${parts[0]} ${parts.slice(1).map((part) => `${part[0]}.`).join(" ")}`;
}

function safeRows(rows = [], mapper = (row) => row) {
  return rows.slice(0, SAFE_ROW_LIMIT).map(mapper);
}

function reportSummary(report = {}) {
  return report.summary || report.totals || report.metrics || {
    source: report.reportType || report.source || "report",
    rowCount: Array.isArray(report.rows) ? report.rows.length : 0,
  };
}

function normalizeToolResult(tool, businessId, result, extra = {}) {
  const rows = Array.isArray(result?.rows) ? result.rows : Array.isArray(result?.items) ? result.items : [];
  return {
    tool,
    businessId,
    summary: reportSummary(result),
    rows: safeRows(rows, extra.rowMapper),
    metadata: {
      generatedAt: new Date().toISOString(),
      source: extra.source || result?.source || result?.reportType || "eazinvoice",
      rowCount: rows.length,
      truncated: rows.length > SAFE_ROW_LIMIT,
    },
  };
}

function summarizeBusinessContext(api, user, options) {
  const context = api.getAiCommandContext(user, options);
  const invoices = context.invoices || [];
  const purchaseOrders = context.purchaseOrders || [];
  const payments = context.payments || [];
  const finalized = invoices.filter((invoice) => !["draft", "deleted"].includes(lower(invoice.status)));
  const overdue = finalized.filter((invoice) => money(invoice.balanceAmount || 0) > 0 && text(invoice.dueDate) && invoice.dueDate < today());
  return {
    user: {
      id: context.user?.id || "",
      name: context.user?.name || "",
    },
    companyCount: context.companies?.length || 0,
    customerCount: context.customers?.length || 0,
    invoiceCount: finalized.length,
    draftInvoiceCount: invoices.filter((invoice) => lower(invoice.status) === "draft").length,
    purchaseOrderCount: purchaseOrders.filter((po) => !["draft", "deleted"].includes(lower(po.status))).length,
    paymentCount: payments.length,
    revenue: money(finalized.reduce((sum, invoice) => sum + toNumber(invoice.total), 0)),
    receivables: money(finalized.reduce((sum, invoice) => sum + toNumber(invoice.balanceAmount), 0)),
    overdueReceivables: money(overdue.reduce((sum, invoice) => sum + toNumber(invoice.balanceAmount), 0)),
  };
}

function bankCashPosition(api, user, options) {
  const accounts = api.listBankAccounts(user, options);
  const total = accounts.reduce((sum, account) => sum + toNumber(account.bookBalance || account.balance), 0);
  return {
    summary: {
      accountCount: accounts.length,
      totalBookBalance: money(total),
      note: "Cash/bank review is based on bank and cash accounts recorded in EazInvoice.",
    },
    rows: safeRows(accounts, (account) => ({
      id: account.id,
      displayName: account.displayName || account.accountName || "Bank/Cash Account",
      type: account.bankAccountType || "bank",
      currency: account.currency || "INR",
      bookBalance: money(account.bookBalance || account.balance),
      reconciliationStatus: account.reconciliationStatus || "review",
    })),
  };
}

function summarizeTop(records, nameSelector, valueSelector) {
  const grouped = new Map();
  records.forEach((record) => {
    const name = nameSelector(record) || "Unspecified";
    grouped.set(name, (grouped.get(name) || 0) + toNumber(valueSelector(record)));
  });
  return [...grouped.entries()]
    .map(([name, amount]) => ({ name: maskName(name), amount: money(amount) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, SAFE_ROW_LIMIT);
}

function customReport(api, user, options, params = {}) {
  const command = lower(params.command);
  if (/\b(select|insert|update|delete|drop|alter|truncate|database_url|secret|password|api key)\b/.test(command)) {
    throw new Error("Custom reports use approved EazInvoice report fields only. Arbitrary SQL or secret access is not supported.");
  }
  if (/\boverdue\b/.test(command) || /\breceivable|customer/.test(command)) {
    const ageing = api.getFinancialReport(user, "ageing", options);
    return normalizeToolResult("build_custom_report", options.businessId, ageing, { source: "receivables_ageing" });
  }
  if (/\bvendor|payable/.test(command)) {
    const payables = api.getFinancialReport(user, "payables-ageing", options);
    return normalizeToolResult("build_custom_report", options.businessId, payables, { source: "payables_ageing" });
  }
  if (/\bexpense|spend/.test(command)) {
    const expenses = api.getFinancialReport(user, "expense-summary", options);
    return normalizeToolResult("build_custom_report", options.businessId, expenses, { source: "expense_summary" });
  }
  const sales = api.getFinancialReport(user, "sales", options);
  return normalizeToolResult("build_custom_report", options.businessId, sales, { source: "sales_summary" });
}

function draftFromAssistant(api, user, options, command, expectedIntent, createDraft) {
  const assistantResult = buildAiCommand(command, api.getAiCommandContext(user, options));
  if (assistantResult.intent !== expectedIntent) {
    throw new Error(`The request was not recognized as a ${expectedIntent === "invoice" ? "invoice" : "PO/WO"} draft.`);
  }
  const toolName = expectedIntent === "invoice"
    ? "create_invoice_draft"
    : lower(command).includes("work order") || /\bwo\b/i.test(command)
      ? "create_wo_draft"
      : "create_po_draft";
  if (!createDraft) {
    return {
      ...assistantResult,
      tool: toolName,
      businessId: options.businessId,
      summary: {
        mode: "proposal",
        message: "Draft proposal prepared. It has not been saved yet.",
      },
      proposedRecord: {
        ...assistantResult.payload,
        ...(assistantResult.preview || {}),
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        source: "ai_assistant_parser",
        accountingImpact: "none",
      },
    };
  }
  const created = expectedIntent === "invoice"
    ? api.createInvoice({
      ...assistantResult.payload,
      status: "draft",
      paymentStatus: "draft",
      businessId: options.businessId,
      workspaceOwnerUserId: options.workspaceOwnerUserId,
    }, { ...options, user })
    : api.createPurchaseOrder({
      ...assistantResult.payload,
      status: "draft",
      businessId: options.businessId,
      workspaceOwnerUserId: options.workspaceOwnerUserId,
    }, { ...options, user });
  return {
    ...assistantResult,
    tool: toolName,
    businessId: options.businessId,
    summary: {
      mode: "created",
      message: expectedIntent === "invoice" ? "Invoice draft created. It is not finalized." : "PO/WO draft created. It is not issued.",
      status: created.status,
      number: created.draftNumber || created.invoiceNumber || created.poNumber || "",
    },
    createdRecord: created,
    metadata: {
      generatedAt: new Date().toISOString(),
      source: "document_draft_lifecycle",
      accountingImpact: "none",
    },
  };
}

function tool(name, description, execute, overrides = {}) {
  return {
    name,
    description,
    permission: overrides.permission || "read",
    classification: overrides.classification || "read",
    requiredParameters: overrides.requiredParameters || [],
    resultSchema: overrides.resultSchema || "normalized_agent_tool_result",
    businessScoped: true,
    entitlement: overrides.entitlement || "aiAgent",
    confirmationNeeded: Boolean(overrides.confirmationNeeded),
    accountingImpact: overrides.accountingImpact || "none",
    enabled: overrides.enabled !== false,
    execute,
  };
}

export const AI_AGENT_TOOL_REGISTRY = Object.freeze({
  get_business_summary: tool("get_business_summary", "Summarize authorized business activity and record counts.", (ctx) => ({
    tool: "get_business_summary",
    businessId: ctx.options.businessId,
    summary: summarizeBusinessContext(ctx.api, ctx.user, ctx.options),
    rows: [],
    metadata: { generatedAt: new Date().toISOString(), source: "business_context", rowCount: 0 },
  })),
  get_profit_and_loss: tool("get_profit_and_loss", "Read the profit and loss report.", (ctx) => normalizeToolResult("get_profit_and_loss", ctx.options.businessId, ctx.api.getFinancialReport(ctx.user, "profit-loss", ctx.options))),
  get_balance_sheet: tool("get_balance_sheet", "Read the balance sheet report.", (ctx) => normalizeToolResult("get_balance_sheet", ctx.options.businessId, ctx.api.getFinancialReport(ctx.user, "balance-sheet", ctx.options))),
  get_trial_balance: tool("get_trial_balance", "Read the trial balance report.", (ctx) => normalizeToolResult("get_trial_balance", ctx.options.businessId, ctx.api.getFinancialReport(ctx.user, "trial-balance", ctx.options))),
  get_general_ledger_summary: tool("get_general_ledger_summary", "Read summarized general ledger rows.", (ctx) => normalizeToolResult("get_general_ledger_summary", ctx.options.businessId, ctx.api.getFinancialReport(ctx.user, "general-ledger", ctx.options))),
  get_receivables_ageing: tool("get_receivables_ageing", "Read receivables ageing.", (ctx) => normalizeToolResult("get_receivables_ageing", ctx.options.businessId, ctx.api.getFinancialReport(ctx.user, "ageing", ctx.options))),
  get_payables_ageing: tool("get_payables_ageing", "Read payables ageing.", (ctx) => normalizeToolResult("get_payables_ageing", ctx.options.businessId, ctx.api.getFinancialReport(ctx.user, "payables-ageing", ctx.options))),
  get_overdue_invoices: tool("get_overdue_invoices", "List overdue authorized invoices.", (ctx) => {
    const invoices = ctx.api.listInvoices(ctx.user, ctx.options).filter((invoice) => !["draft", "deleted"].includes(lower(invoice.status)) && toNumber(invoice.balanceAmount) > 0 && text(invoice.dueDate) && invoice.dueDate < today());
    return {
      tool: "get_overdue_invoices",
      businessId: ctx.options.businessId,
      summary: {
        count: invoices.length,
        amount: money(invoices.reduce((sum, invoice) => sum + toNumber(invoice.balanceAmount), 0)),
      },
      rows: safeRows(invoices, (invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customer: maskName(invoice.billToName),
        dueDate: invoice.dueDate,
        balanceAmount: money(invoice.balanceAmount),
      })),
      metadata: { generatedAt: new Date().toISOString(), source: "invoices", rowCount: invoices.length, truncated: invoices.length > SAFE_ROW_LIMIT },
    };
  }),
  get_overdue_vendor_bills: tool("get_overdue_vendor_bills", "Read overdue vendor payable summary.", (ctx) => normalizeToolResult("get_overdue_vendor_bills", ctx.options.businessId, ctx.api.getFinancialReport(ctx.user, "payables-ageing", ctx.options))),
  get_gst_summary: tool("get_gst_summary", "Read GST summary from EazInvoice records.", (ctx) => normalizeToolResult("get_gst_summary", ctx.options.businessId, ctx.api.getFinancialReport(ctx.user, "gst-summary", ctx.options))),
  get_tds_summary: tool("get_tds_summary", "Read TDS summary from EazInvoice records.", (ctx) => normalizeToolResult("get_tds_summary", ctx.options.businessId, ctx.api.getFinancialReport(ctx.user, "tds-register", ctx.options))),
  get_bank_cash_position: tool("get_bank_cash_position", "Read bank and cash position.", (ctx) => bankCashPosition(ctx.api, ctx.user, ctx.options)),
  get_sales_summary: tool("get_sales_summary", "Read sales summary.", (ctx) => normalizeToolResult("get_sales_summary", ctx.options.businessId, ctx.api.getFinancialReport(ctx.user, "sales", ctx.options))),
  get_expense_breakdown: tool("get_expense_breakdown", "Read expense summary.", (ctx) => normalizeToolResult("get_expense_breakdown", ctx.options.businessId, ctx.api.getFinancialReport(ctx.user, "expense-summary", ctx.options))),
  get_top_customers: tool("get_top_customers", "Summarize top customers by sales.", (ctx) => {
    const invoices = ctx.api.listInvoices(ctx.user, ctx.options).filter((invoice) => !["draft", "deleted"].includes(lower(invoice.status)));
    const rows = summarizeTop(invoices, (invoice) => invoice.billToName, (invoice) => invoice.total);
    return { tool: "get_top_customers", businessId: ctx.options.businessId, summary: { count: rows.length }, rows, metadata: { generatedAt: new Date().toISOString(), source: "invoices", rowCount: rows.length } };
  }),
  get_top_vendors: tool("get_top_vendors", "Summarize top vendors by spend intent records.", (ctx) => {
    const purchaseOrders = ctx.api.listPurchaseOrders(ctx.user, ctx.options).filter((po) => !["draft", "deleted"].includes(lower(po.status)));
    const rows = summarizeTop(purchaseOrders, (po) => po.billToName, (po) => po.total);
    return { tool: "get_top_vendors", businessId: ctx.options.businessId, summary: { count: rows.length, note: "PO/WO records are intent documents and not payable postings." }, rows, metadata: { generatedAt: new Date().toISOString(), source: "purchase_orders", rowCount: rows.length } };
  }),
  compare_periods: tool("compare_periods", "Compare current and prior period P&L.", (ctx) => {
    const current = ctx.period;
    const previous = previousMonthPeriod(current);
    const currentReport = ctx.api.getFinancialReport(ctx.user, "profit-loss", { ...ctx.options, ...current });
    const previousReport = ctx.api.getFinancialReport(ctx.user, "profit-loss", { ...ctx.options, ...previous });
    return {
      tool: "compare_periods",
      businessId: ctx.options.businessId,
      summary: {
        current: reportSummary(currentReport),
        previous: reportSummary(previousReport),
      },
      rows: [],
      metadata: { generatedAt: new Date().toISOString(), source: "profit_loss", rowCount: 0 },
    };
  }),
  get_invoice_status_summary: tool("get_invoice_status_summary", "Summarize invoice status and payment state.", (ctx) => {
    const invoices = ctx.api.listInvoices(ctx.user, { ...ctx.options, archived: "all" });
    const summary = invoices.reduce((acc, invoice) => {
      const status = lower(invoice.archivedAt ? "archived" : invoice.status || "created");
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    return { tool: "get_invoice_status_summary", businessId: ctx.options.businessId, summary, rows: [], metadata: { generatedAt: new Date().toISOString(), source: "invoices", rowCount: invoices.length } };
  }),
  get_compliance_readiness: tool("get_compliance_readiness", "Read compliance readiness.", (ctx) => normalizeToolResult("get_compliance_readiness", ctx.options.businessId, ctx.api.getFinancialReport(ctx.user, "compliance-readiness", ctx.options))),
  get_accounting_period_status: tool("get_accounting_period_status", "Read accounting period readiness.", (ctx) => normalizeToolResult("get_accounting_period_status", ctx.options.businessId, ctx.api.getFinancialReport(ctx.user, "year-end-readiness", ctx.options))),
  get_tax_year_summary: tool("get_tax_year_summary", "Prepare a tax-year summary from EazInvoice accounting records.", (ctx) => normalizeToolResult("get_tax_year_summary", ctx.options.businessId, ctx.api.getFinancialReport(ctx.user, "year-end-report-bundle", ctx.options))),
  get_itc_review_summary: tool("get_itc_review_summary", "Review ITC/input GST information from internal records.", (ctx) => normalizeToolResult("get_itc_review_summary", ctx.options.businessId, ctx.api.getFinancialReport(ctx.user, "gst-purchase-register", ctx.options))),
  get_customer_summary: tool("get_customer_summary", "Summarize customer records without unnecessary PII.", (ctx) => {
    const customers = ctx.api.listCustomers(ctx.user, ctx.options);
    return { tool: "get_customer_summary", businessId: ctx.options.businessId, summary: { count: customers.length }, rows: safeRows(customers, (customer) => ({ id: customer.id, name: maskName(customer.name || customer.businessName), hasGstin: Boolean(customer.gstin || customer.gstNumber) })), metadata: { generatedAt: new Date().toISOString(), source: "customers", rowCount: customers.length, truncated: customers.length > SAFE_ROW_LIMIT } };
  }),
  get_vendor_summary: tool("get_vendor_summary", "Summarize vendor records without unnecessary PII.", (ctx) => {
    const vendors = ctx.api.listVendors ? ctx.api.listVendors(ctx.user, ctx.options) : [];
    return { tool: "get_vendor_summary", businessId: ctx.options.businessId, summary: { count: vendors.length }, rows: safeRows(vendors, (vendor) => ({ id: vendor.id, name: maskName(vendor.name || vendor.businessName), hasGstin: Boolean(vendor.gstin || vendor.gstNumber) })), metadata: { generatedAt: new Date().toISOString(), source: "vendors", rowCount: vendors.length, truncated: vendors.length > SAFE_ROW_LIMIT } };
  }),
  build_custom_report: tool("build_custom_report", "Build a constrained report from approved report dimensions.", (ctx) => customReport(ctx.api, ctx.user, ctx.options, ctx.params)),
  create_invoice_draft: tool("create_invoice_draft", "Prepare or create an invoice draft only.", (ctx) => draftFromAssistant(ctx.api, ctx.user, ctx.options, ctx.params.command, "invoice", ctx.params.createDraft === true), { permission: "writeRecords", classification: "safe_draft_write", confirmationNeeded: true }),
  create_po_draft: tool("create_po_draft", "Prepare or create a purchase order draft only.", (ctx) => draftFromAssistant(ctx.api, ctx.user, ctx.options, ctx.params.command, "purchase_order", ctx.params.createDraft === true), { permission: "writeRecords", classification: "safe_draft_write", confirmationNeeded: true }),
  create_wo_draft: tool("create_wo_draft", "Prepare or create a work order draft only.", (ctx) => draftFromAssistant(ctx.api, ctx.user, ctx.options, ctx.params.command.includes("work order") ? ctx.params.command : `work order ${ctx.params.command}`, "purchase_order", ctx.params.createDraft === true), { permission: "writeRecords", classification: "safe_draft_write", confirmationNeeded: true }),
});

export function getAiAgentToolMatrix() {
  return Object.values(AI_AGENT_TOOL_REGISTRY).map((entry) => ({
    tool: entry.name,
    readWrite: entry.classification === "read" ? "read" : "safe_draft_write",
    businessScope: entry.businessScoped ? "required" : "none",
    plan: "Pro / Business",
    confirmationNeeded: entry.confirmationNeeded,
    accountingImpact: entry.accountingImpact,
    status: entry.enabled ? "enabled" : "disabled",
  }));
}

export function getAiAgentToolDefinition(name) {
  return AI_AGENT_TOOL_REGISTRY[name] || null;
}

function ensureDomainScoped(command) {
  if (/\b(poem|song|joke|recipe|movie|sports|weather|dating|medical diagnosis|legal case)\b/i.test(command)) {
    throw new Error("The EazInvoice AI Agent is designed for business finance, accounting, tax, compliance, reports, and safe document drafts only.");
  }
  if (/\b(ignore|bypass|override).*\b(rule|business|permission|security|rls)\b/i.test(command)
    || /\b(database_url|api key|secret|password|another business|other company|hidden admin)\b/i.test(command)) {
    throw new Error("I cannot bypass EazInvoice business access, reveal secrets, or use another business context.");
  }
}

function classifyWorkflow(command) {
  const normalized = lower(command);
  if (/\b(invoice|bill)\b/.test(normalized) && /\b(create|draft|prepare)\b/.test(normalized)) return "invoice_draft";
  if (/\b(work order|wo)\b/.test(normalized) && /\b(create|draft|prepare|generate)\b/.test(normalized)) return "wo_draft";
  if (/\b(po|purchase order)\b/.test(normalized) && /\b(create|draft|prepare|generate)\b/.test(normalized)) return "po_draft";
  if (/\breceivable|overdue|collection|customer/.test(normalized)) return "receivables_review";
  if (/\bgst|tds|itc|compliance|tax/.test(normalized)) return "gst_tds_review";
  if (/\bcash|bank|liquidity|runway/.test(normalized)) return "cash_flow_review";
  if (/\bcustom|show|list|sorted|filter|above|over 60|top/.test(normalized)) return "custom_report";
  return "business_review";
}

function planTools(workflow, command) {
  if (workflow === "invoice_draft") return ["create_invoice_draft"];
  if (workflow === "po_draft") return ["create_po_draft"];
  if (workflow === "wo_draft") return ["create_wo_draft"];
  if (workflow === "receivables_review") return ["get_receivables_ageing", "get_overdue_invoices", "get_top_customers"];
  if (workflow === "gst_tds_review") return ["get_gst_summary", "get_tds_summary", "get_itc_review_summary", "get_compliance_readiness"];
  if (workflow === "cash_flow_review") return ["get_bank_cash_position", "get_receivables_ageing", "get_payables_ageing", "get_profit_and_loss"];
  if (workflow === "custom_report") return ["build_custom_report"];
  const tools = ["get_business_summary", "get_profit_and_loss", "get_balance_sheet", "get_receivables_ageing", "get_payables_ageing", "get_gst_summary", "get_tds_summary", "get_bank_cash_position"];
  if (/\bcompare|versus|vs|previous|last month\b/.test(lower(command))) tools.push("compare_periods");
  return tools.slice(0, MAX_AGENT_TOOL_STEPS);
}

function validateToolCall(name, params = {}) {
  if (DANGEROUS_TOOL_NAMES.has(name)) throw new Error(`AI Agent tool '${name}' is not available in P2-4A.`);
  const toolDef = AI_AGENT_TOOL_REGISTRY[name];
  if (!toolDef || !toolDef.enabled) throw new Error(`Unknown or disabled AI Agent tool: ${name}`);
  if (params.sql || /\bselect\b/i.test(String(params.query || ""))) {
    throw new Error("AI Agent tools do not accept arbitrary SQL.");
  }
  return toolDef;
}

function synthesizeSections(workflow, toolResults = []) {
  const facts = [];
  const calculations = [];
  const recommendations = [];
  const byTool = new Map(toolResults.map((result) => [result.tool, result]));
  const business = byTool.get("get_business_summary")?.summary;
  if (business) {
    facts.push(`Revenue recorded in authorized EazInvoice invoices: INR ${money(business.revenue).toFixed(2)}.`);
    facts.push(`Open receivables recorded: INR ${money(business.receivables).toFixed(2)}.`);
    if (business.overdueReceivables > 0) recommendations.push("Prioritize collection follow-up for overdue receivables before adding new credit exposure.");
  }
  const overdue = byTool.get("get_overdue_invoices")?.summary;
  if (overdue) {
    facts.push(`Overdue invoices found: ${overdue.count}, total balance INR ${money(overdue.amount).toFixed(2)}.`);
    if (overdue.count > 0) recommendations.push("Review the largest overdue invoices and record follow-up notes outside the Agent before customer contact.");
  }
  const bank = byTool.get("get_bank_cash_position")?.summary;
  if (bank) {
    facts.push(`Bank/cash accounts recorded: ${bank.accountCount}, total book balance INR ${money(bank.totalBookBalance).toFixed(2)}.`);
    calculations.push("Cash-flow observations are estimated from recorded bank/cash, receivables, payables, and profit data only.");
  }
  if (workflow === "gst_tds_review") {
    recommendations.push("Use this as an internal GST/TDS readiness review, not proof of statutory filing.");
  }
  if (workflow === "business_review") {
    recommendations.push("Use the Receivables Review, GST/TDS Review, or Cash Flow Review workflows for drill-down.");
  }
  if (!facts.length) facts.push("No matching EazInvoice records were available for this request.");
  if (!calculations.length) calculations.push("Derived figures are calculated from the retrieved EazInvoice tool results.");
  if (!recommendations.length) recommendations.push("No urgent recommendation was generated from the available records.");
  return [
    { title: "Facts From EazInvoice", kind: "facts", items: facts },
    { title: "Calculations", kind: "calculations", items: calculations },
    { title: "Recommendations", kind: "recommendations", items: recommendations },
  ];
}

function checksForToolResults(toolResults = []) {
  const checks = [{
    label: "Business access",
    status: "passed",
    detail: "The Agent used the server-authorized business workspace.",
  }, {
    label: "Read-first boundary",
    status: "passed",
    detail: "No final posting, payment, filing, deletion, or finalization tool is available in P2-4A.",
  }];
  toolResults.forEach((result) => {
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    warnings.forEach((warning) => {
      checks.push({
        label: "Draft data review",
        status: "warning",
        detail: warning,
      });
    });
  });
  return checks;
}

function nextActionsForResult(draftResult) {
  if (!draftResult) return [{ id: "drill_down", label: "Ask a follow-up", type: "input" }];
  if (draftResult.createdRecord) return [{ id: "open_draft", label: "Open draft", type: "navigation" }];
  return [
    { id: "create_draft", label: "Create draft", type: "safe_draft_write" },
    { id: "discard", label: "Discard", type: "input" },
  ];
}

function titleForWorkflow(workflow) {
  return {
    business_review: "Business Review",
    receivables_review: "Receivables Review",
    gst_tds_review: "GST / TDS Review",
    cash_flow_review: "Cash / Bank Review",
    custom_report: "Custom Report",
    invoice_draft: "Invoice Draft Agent Action",
    po_draft: "PO Draft Agent Action",
    wo_draft: "Work Order Draft Agent Action",
  }[workflow] || "Business Finance Review";
}

export async function runEazInvoiceAiAgent({ api, user, input = {}, options = {} } = {}) {
  if (!api || !user?.id) throw new Error("Authentication required");
  const command = text(input.command);
  if (!command) throw new Error("Enter a command for the AI Agent.");
  ensureDomainScoped(command);

  const workflow = classifyWorkflow(command);
  const workspace = api.resolveRecordsWorkspaceAccess(user, options, workflow.endsWith("_draft") ? "writeRecords" : "read");
  const featureOptions = {
    ...options,
    workspaceOwnerUserId: workspace.ownerUserId,
    businessId: workspace.businessId,
  };
  const featureUser = workspace.owner;
  if (!api.userCanUseFeature(featureUser, "aiInvoiceAssist", featureOptions)
    && !api.userCanUseFeature(featureUser, "aiPoAssist", featureOptions)
    && !api.userCanUseFeature(featureUser, "advancedReports", featureOptions)) {
    throw new Error("AI Agent is available on Pro and Business plans.");
  }

  const period = normalizePeriod({ ...input, command });
  const selectedTools = planTools(workflow, command).slice(0, MAX_AGENT_TOOL_STEPS);
  const context = {
    api,
    user,
    options: featureOptions,
    period,
    params: {
      ...input,
      command,
      createDraft: input.createDraft === true,
    },
  };
  const toolResults = [];
  for (const name of selectedTools) {
    const toolDef = validateToolCall(name, context.params);
    const result = await toolDef.execute(context);
    toolResults.push(result);
  }

  const draftResult = toolResults.find((result) => result.createdRecord || result.proposedRecord);
  const responseIntent = draftResult?.intent || (workflow === "custom_report" ? "report" : workflow);
  const sourceTools = toolResults.map((result) => result.tool);
  const sections = draftResult
    ? [
      { title: "Facts From EazInvoice", kind: "facts", items: [draftResult.summary?.message || "Draft proposal prepared from authorized EazInvoice context."] },
      { title: "Calculations", kind: "calculations", items: [`Estimated total: INR ${money(draftResult.createdRecord?.total ?? draftResult.proposedRecord?.total ?? 0).toFixed(2)}.`] },
      { title: "Recommendations", kind: "recommendations", items: ["Review the draft details before using normal EazInvoice document workflows to finalize or issue it."] },
    ]
      : synthesizeSections(workflow, toolResults);
  const nextActions = nextActionsForResult(draftResult);

  return {
    agent: true,
    agentVersion: "2.0",
    type: draftResult?.createdRecord ? "draft_action" : "analysis",
    mode: "domain_constrained_business_finance_agent",
    command,
    workflow,
    intent: responseIntent,
    title: titleForWorkflow(workflow),
    summary: `${titleForWorkflow(workflow)} prepared from authorized EazInvoice data.`,
    reply: `${titleForWorkflow(workflow)} is ready. I used registered EazInvoice tools and separated facts, calculations, and recommendations.`,
    period,
    maxToolSteps: MAX_AGENT_TOOL_STEPS,
    toolSteps: toolResults.length,
    sourceTools,
    sections,
    plan: sourceTools.map((name) => `Use registered EazInvoice tool: ${name}`),
    checks: checksForToolResults(toolResults),
    nextActions,
    suggestedActions: nextActions,
    toolResults,
    toolMatrix: getAiAgentToolMatrix(),
    needsConfirmation: Boolean(draftResult?.proposedRecord && !draftResult.createdRecord),
    safety: {
      domainConstrained: true,
      readFirst: true,
      createsFinalRecordsAutomatically: false,
      dangerousToolsAvailable: false,
      noArbitrarySql: true,
      businessIdSource: "server_authorized_workspace",
      chainOfThoughtStored: false,
    },
    result: draftResult || {
      intent: "report",
      title: titleForWorkflow(workflow),
      summary: `${titleForWorkflow(workflow)} prepared from EazInvoice records.`,
      metrics: toolResults[0]?.summary || {},
    },
  };
}
