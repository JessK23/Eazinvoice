function toNumber(value, fallback = 0) {
  const normalized = String(value ?? "").replace(/,/g, "").trim();
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue || todayDate()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeIntent(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (["po", "purchase", "purchase_order", "work_order", "wo"].includes(normalized)) return "purchase_order";
  if (["profit", "profit_loss", "profit-loss", "expenses", "revenue", "invoices", "report"].includes(normalized)) return "report";
  if (normalized === "clarification" || normalized === "needs_clarification") return "clarification";
  return "invoice";
}

function findMentionedRecord(records, command, fields) {
  const lower = command.toLowerCase();
  return records.find((record) => fields.some((field) => {
    const value = String(record[field] || "").trim().toLowerCase();
    return value && lower.includes(value);
  })) || null;
}

function detectCurrency(command) {
  if (/\b(?:usd|us dollar|dollars?|\$)\b/i.test(command)) return "USD";
  if (/\b(?:aud|australian dollar)\b/i.test(command)) return "AUD";
  if (/\b(?:eur|euro)\b/i.test(command)) return "EUR";
  if (/\b(?:gbp|pound)\b/i.test(command)) return "GBP";
  return "INR";
}

function extractAmount(command) {
  const patterns = [
    /(?:₹|rs\.?|inr|usd|aud|eur|gbp|\$)\s*([\d,]+(?:\.\d+)?)/i,
    /([\d,]+(?:\.\d+)?)\s*(?:rupees|dollars?|usd|inr|aud|eur|gbp)\b/i,
    /\b(?:amount|rate|for)\s+([\d,]+(?:\.\d+)?)\b/i,
  ];
  for (const pattern of patterns) {
    const match = command.match(pattern);
    if (match) return Math.max(0, toNumber(match[1]));
  }
  return 0;
}

function extractPercentage(command, fallback) {
  const match = command.match(/(\d+(?:\.\d+)?)\s*%\s*(?:gst|tax)?/i);
  return match ? toNumber(match[1], fallback) : fallback;
}

function extractQuantity(command) {
  const match = command.match(/\b(?:qty|quantity|x)\s*[:\-]?\s*(\d+(?:\.\d+)?)\b/i);
  return Math.max(1, toNumber(match?.[1], 1));
}

function extractDueDays(command, fallback = 7) {
  const match = command.match(/\bdue\s+(?:in\s+)?(\d+)\s+days?\b/i);
  return Math.max(0, toNumber(match?.[1], fallback));
}

function extractName(command, fallback) {
  const match = command.match(/\b(?:for|to|from|vendor|supplier)\s+([A-Za-z][A-Za-z0-9 .&'-]{1,60}?)(?=\s+(?:for|of|qty|quantity|rs|inr|usd|aud|eur|gbp|₹|\$|\d|plus|with|due|on)\b|$)/i);
  return normalizeText(match?.[1] || fallback || "New Customer");
}

function extractEntityName(command, fallback) {
  const match = command.match(/\b(?:for|to|from|vendor|supplier)\s+([A-Za-z][A-Za-z0-9 .&'-]{1,60}?)(?=,|\s+(?:for|of|qty|quantity|amount|rate|rs|inr|usd|aud|eur|gbp|\$|\d|plus|with|due|on)\b|$)/i);
  return normalizeText(match?.[1] || fallback || "New Customer").replace(/[,.]+$/g, "").trim();
}

function cleanDescription(command, detectedName, fallback) {
  let description = command
    .replace(/\b(?:create|generate|make|draft|prepare|invoice|tax invoice|po|purchase order|work order|wo|for|to|from|vendor|supplier)\b/gi, " ")
    .replace(new RegExp(detectedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ")
    .replace(/(?:₹|rs\.?|inr|usd|aud|eur|gbp|\$)\s*[\d,]+(?:\.\d+)?/gi, " ")
    .replace(/[\d,]+(?:\.\d+)?\s*(?:rupees|dollars?|usd|inr|aud|eur|gbp)\b/gi, " ")
    .replace(/\b(?:qty|quantity|x)\s*[:\-]?\s*\d+(?:\.\d+)?\b/gi, " ")
    .replace(/\bplus\b|\bwith\b|\bdue\s+(?:in\s+)?\d+\s+days?\b/gi, " ")
    .replace(/\d+(?:\.\d+)?\s*%\s*(?:gst|tax)?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (description.length > 80) description = description.slice(0, 80).trim();
  return description || fallback;
}

function summarizeInvoices(invoices) {
  const created = invoices.filter((invoice) => invoice.status !== "draft");
  const paidAmount = created.reduce((sum, invoice) => sum + toNumber(invoice.paidAmount), 0);
  const totalAmount = created.reduce((sum, invoice) => sum + toNumber(invoice.total), 0);
  const unpaidAmount = created.reduce((sum, invoice) => sum + toNumber(invoice.balanceAmount, invoice.total), 0);
  return {
    totalInvoices: created.length,
    paidAmount,
    totalAmount,
    unpaidAmount,
    pendingPayments: created.filter((invoice) => toNumber(invoice.balanceAmount, invoice.total) > 0).length,
  };
}

function summarizePurchaseOrders(purchaseOrders) {
  const created = purchaseOrders.filter((entry) => entry.status !== "draft");
  return {
    totalPurchaseOrders: created.length,
    expenseAmount: created.reduce((sum, entry) => sum + toNumber(entry.total), 0),
  };
}

function calculatePreview(items, taxRate) {
  const subtotal = items.reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.rate), 0);
  const discount = items.reduce((sum, item) => sum + Math.min(toNumber(item.quantity) * toNumber(item.rate), toNumber(item.discount)), 0);
  const taxAmount = items.reduce((sum, item) => {
    const lineTotal = toNumber(item.quantity) * toNumber(item.rate);
    const taxable = Math.max(0, lineTotal - toNumber(item.discount));
    return sum + (taxable * toNumber(item.gstRate, taxRate)) / 100;
  }, 0);
  return {
    subtotal,
    discount,
    taxAmount,
    total: Math.max(0, subtotal - discount) + taxAmount,
  };
}

function buildReport(command, context) {
  const invoiceSummary = summarizeInvoices(context.invoices || []);
  const poSummary = summarizePurchaseOrders(context.purchaseOrders || []);
  const profit = invoiceSummary.totalAmount - poSummary.expenseAmount;
  const focus = /\bprofit|loss\b/i.test(command)
    ? "profit-loss"
    : /\bexpense|po|purchase|work order|wo\b/i.test(command)
      ? "expenses"
      : /\binvoice\b/i.test(command)
        ? "invoices"
        : "revenue";
  return {
    intent: "report",
    focus,
    title: focus === "profit-loss" ? "Profit and Loss Summary" : focus === "expenses" ? "Expense Summary" : focus === "invoices" ? "Invoice Summary" : "Revenue Summary",
    summary: `Based on current EazInvoice records: ${invoiceSummary.totalInvoices} created invoices, INR ${invoiceSummary.paidAmount.toFixed(2)} paid, INR ${invoiceSummary.unpaidAmount.toFixed(2)} unpaid, INR ${poSummary.expenseAmount.toFixed(2)} expenses, and INR ${profit.toFixed(2)} estimated profit.`,
    metrics: {
      ...invoiceSummary,
      ...poSummary,
      profit,
    },
  };
}

function buildInvoiceDraft(command, context) {
  const companies = context.companies || [];
  const customers = context.customers || [];
  const company = companies[0] || null;
  const matchedCustomer = findMentionedRecord(customers, command, ["name", "businessName", "email", "customerCode"]);
  const billToName = matchedCustomer?.businessName || matchedCustomer?.name || extractEntityName(command, "");
  const currency = detectCurrency(command);
  const quantity = extractQuantity(command);
  const amount = extractAmount(command);
  const taxRate = extractPercentage(command, currency === "INR" ? 18 : 0);
  const dueDays = extractDueDays(command, 7);
  const description = cleanDescription(command, billToName, "Professional services");
  const invoiceDate = todayDate();
  const items = [{
    description,
    hsnSac: currency === "INR" ? "" : "SERVICE",
    quantity,
    rate: quantity > 0 ? amount / quantity : amount,
    discount: 0,
    gstRate: taxRate,
  }];
  return {
    intent: "invoice",
    confidence: amount > 0 && matchedCustomer ? "high" : "needs-review",
    warnings: [
      !matchedCustomer && billToName
        ? `${billToName} is not saved in your customer list yet. Add this customer first, or create the draft as a one-time invoice and complete the customer profile later.`
        : "",
      !amount ? "No invoice amount was detected. Add the amount before creating the draft." : "",
    ].filter(Boolean),
    customerMatch: matchedCustomer
      ? {
        status: "matched",
        customerId: matchedCustomer.id,
        name: matchedCustomer.businessName || matchedCustomer.name,
      }
      : {
        status: "missing",
        name: billToName || "New Customer",
        suggestedCustomer: {
          name: billToName || "New Customer",
          businessName: "",
          phone: "",
          email: "",
          billingAddress: "",
        },
      },
    preview: calculatePreview(items, taxRate),
    payload: {
      ownerUserId: context.user?.id,
      companyId: company?.id || null,
      customerId: matchedCustomer?.id || null,
      billToName,
      billToAddress: matchedCustomer?.billingAddress || "",
      invoiceDate,
      dueDate: addDays(invoiceDate, dueDays),
      currency,
      paymentTerms: `Due in ${dueDays} days`,
      placeOfSupply: company?.state || "",
      taxRate,
      gstMode: "intra",
      status: "draft",
      paymentStatus: "draft",
      items,
    },
    message: "AI assistant created an invoice draft. Review customer, item, tax, and payment details before creating the final invoice.",
  };
}

function buildPurchaseOrderDraft(command, context) {
  const companies = context.companies || [];
  const company = companies[0] || null;
  const currency = detectCurrency(command);
  const quantity = extractQuantity(command);
  const amount = extractAmount(command);
  const taxRate = extractPercentage(command, currency === "INR" ? 18 : 0);
  const vendorName = extractEntityName(command, "Vendor");
  const description = cleanDescription(command, vendorName, "Goods or services");
  const isWorkOrder = /\b(?:work order|wo)\b/i.test(command);
  const poDate = todayDate();
  const items = [{
    description,
    hsnSac: currency === "INR" ? "" : "SERVICE",
    quantity,
    rate: quantity > 0 ? amount / quantity : amount,
    discount: 0,
    gstRate: taxRate,
  }];
  return {
    intent: "purchase_order",
    confidence: amount > 0 ? "high" : "needs-review",
    preview: calculatePreview(items, taxRate),
    payload: {
      ownerUserId: context.user?.id,
      companyId: company?.id || null,
      documentType: isWorkOrder ? "wo" : "po",
      billToName: vendorName,
      billToAddress: "",
      poDate,
      dueDate: "",
      currency,
      paymentTerms: "",
      placeOfSupply: company?.state || "",
      taxRate,
      gstMode: "intra",
      status: "draft",
      items,
    },
    message: `AI assistant created a ${isWorkOrder ? "work order" : "purchase order"} draft. Review vendor, item, tax, and terms before creating it.`,
  };
}

function buildClarification(structured) {
  const missingFields = Array.isArray(structured.missingFields)
    ? structured.missingFields.map((field) => normalizeText(field)).filter(Boolean)
    : [];
  return {
    intent: "clarification",
    confidence: "needs-info",
    missingFields,
    question: normalizeText(structured.question) || "Please add the missing customer/vendor, amount, item, or due date details before I prepare this draft.",
    message: "AI assistant needs more information before it can prepare a safe draft.",
  };
}

export function buildAiCommandFromStructured(structured = {}, context = {}, originalCommand = "") {
  const intent = normalizeIntent(structured.intent);
  if (intent === "clarification" || (Array.isArray(structured.missingFields) && structured.missingFields.length)) {
    return buildClarification(structured);
  }

  const currency = normalizeText(structured.currency) || detectCurrency(originalCommand);
  const amount = Math.max(0, toNumber(structured.amount ?? structured.rate ?? extractAmount(originalCommand)));
  const quantity = Math.max(1, toNumber(structured.quantity ?? extractQuantity(originalCommand), 1));
  const taxRate = Math.max(0, toNumber(structured.taxRate ?? structured.gstRate ?? extractPercentage(originalCommand, currency === "INR" ? 18 : 0)));
  const dueDays = Math.max(0, toNumber(structured.dueDays ?? extractDueDays(originalCommand, 7), 7));
  const itemDescription = normalizeText(structured.description || structured.itemDescription || structured.serviceName);
  const syntheticCommandParts = [
    intent === "purchase_order" ? (structured.documentType === "wo" ? "generate work order" : "generate purchase order") : "create invoice",
    structured.customerName ? `for ${structured.customerName}` : "",
    structured.vendorName ? `vendor ${structured.vendorName}` : "",
    itemDescription ? `for ${itemDescription}` : "",
    `${currency} ${amount}`,
    `quantity ${quantity}`,
    `${taxRate}% GST`,
    `due in ${dueDays} days`,
  ].filter(Boolean);
  const syntheticCommand = syntheticCommandParts.join(" ");

  if (intent === "report") {
    const focus = normalizeText(structured.reportFocus || structured.focus);
    const reportCommand = focus ? `${focus} report summary` : originalCommand || "report summary";
    return buildReport(reportCommand, context);
  }
  if (intent === "purchase_order") return buildPurchaseOrderDraft(syntheticCommand, context);
  return buildInvoiceDraft(syntheticCommand, context);
}

export function buildAiCommand(command, context = {}) {
  const cleanCommand = normalizeText(command);
  if (!cleanCommand) throw new Error("Enter a command for the AI assistant.");
  if (/\b(report|revenue|profit|loss|expense|expenses|summary|analytics)\b/i.test(cleanCommand)
    && !/\b(create|generate|make|draft|prepare)\b/i.test(cleanCommand)) {
    return buildReport(cleanCommand, context);
  }
  if (/\b(?:po|purchase order|work order|wo|vendor|supplier)\b/i.test(cleanCommand)) {
    return buildPurchaseOrderDraft(cleanCommand, context);
  }
  return buildInvoiceDraft(cleanCommand, context);
}
