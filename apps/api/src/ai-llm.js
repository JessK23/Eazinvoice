import { buildAiCommandFromStructured } from "./ai-assistant.js";

function getOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const content = payload?.output?.flatMap((entry) => entry.content || []) || [];
  const text = content.find((entry) => typeof entry.text === "string")?.text;
  return text || "";
}

function parseJsonObject(text) {
  const clean = String(text || "")
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("AI response did not include JSON.");
  return JSON.parse(clean.slice(start, end + 1));
}

function summarizeContext(context = {}) {
  return {
    user: {
      name: context.user?.name || "",
      subscriberType: context.user?.subscriberType || "individual",
    },
    companies: (context.companies || []).slice(0, 10).map((company) => ({
      id: company.id,
      name: company.name,
      state: company.state,
      gstRegistered: Boolean(company.gstRegistered),
    })),
    customers: (context.customers || []).slice(0, 25).map((customer) => ({
      id: customer.id,
      name: customer.name,
      businessName: customer.businessName,
      customerCode: customer.customerCode,
      state: customer.state,
    })),
    invoices: (context.invoices || []).slice(-20).map((invoice) => ({
      invoiceNumber: invoice.invoiceNumber,
      billToName: invoice.billToName,
      total: invoice.total,
      paidAmount: invoice.paidAmount,
      balanceAmount: invoice.balanceAmount,
      status: invoice.status,
      paymentStatus: invoice.paymentStatus,
      currency: invoice.currency,
    })),
    purchaseOrders: (context.purchaseOrders || []).slice(-20).map((entry) => ({
      poNumber: entry.poNumber,
      documentType: entry.documentType,
      billToName: entry.billToName,
      total: entry.total,
      status: entry.status,
      currency: entry.currency,
    })),
  };
}

export async function tryBuildAiCommandWithLlm({
  command,
  context = {},
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL || "gpt-4.1-mini",
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey) return { used: false, reason: "OPENAI_API_KEY is not configured." };
  if (typeof fetchImpl !== "function") return { used: false, reason: "fetch is not available." };

  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      instructions: [
        "You convert EazInvoice user commands into strict JSON only.",
        "Allowed intent values: invoice, purchase_order, work_order, report, clarification.",
        "If amount, customer/vendor, or item details are too unclear, return intent clarification with missingFields and question.",
        "Use INR and 18 taxRate for Indian GST unless the command clearly asks for another currency or tax.",
      ].join(" "),
      input: JSON.stringify({
        command,
        context: summarizeContext(context),
        schema: {
          intent: "invoice | purchase_order | work_order | report | clarification",
          confidence: "number between 0 and 1",
          missingFields: ["field names when clarification is needed"],
          question: "one short question when clarification is needed",
          customerName: "invoice customer name",
          vendorName: "PO or WO vendor name",
          description: "goods or service description",
          amount: "line total or rate number",
          quantity: "number",
          currency: "INR | USD | AUD | EUR | GBP",
          taxRate: "number",
          dueDays: "number",
          documentType: "po | wo",
          reportFocus: "revenue | invoices | expenses | po | profit-loss",
        },
      }),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI AI command refinement failed.");
  }
  const structured = parseJsonObject(getOutputText(payload));
  return {
    used: true,
    provider: "openai",
    structured,
    result: buildAiCommandFromStructured(structured, context, command),
  };
}
