function recordLabel(result = {}) {
  if (result.intent === "purchase_order") return "PO / WO";
  if (result.intent === "invoice") return "invoice";
  if (result.intent === "report") return "report";
  return "request";
}

function hasPositiveTotal(result = {}) {
  const record = result.proposedRecord || result.createdRecord || {};
  return Number(record.total || 0) > 0;
}

function buildChecks(result = {}) {
  const checks = [];
  const intent = result.intent || "clarification";
  const label = recordLabel(result);

  if (intent === "clarification") {
    checks.push({
      label: "More input needed",
      status: "blocked",
      detail: result.question || "The command is missing required details.",
    });
    return checks;
  }

  checks.push({
    label: "Request understood",
    status: ["invoice", "purchase_order", "report"].includes(intent) ? "passed" : "warning",
    detail: `Detected this as a ${label} command.`,
  });

  if (intent === "report") {
    checks.push({
      label: "No record will be changed",
      status: "passed",
      detail: "This command only summarizes saved records.",
    });
    return checks;
  }

  if (result.customerMatch?.status === "missing" || result.vendorMatch?.status === "missing") {
    checks.push({
      label: "Saved party not found",
      status: "warning",
      detail: `${result.customerMatch?.name || result.vendorMatch?.name || "The party"} is not saved yet. The draft can still be prepared, but saved PAN/GST/address details will not auto-fill.`,
    });
  } else {
    checks.push({
      label: "Saved party check",
      status: "passed",
      detail: "No blocking party issue was detected.",
    });
  }

  checks.push({
    label: "Amount and tax check",
    status: hasPositiveTotal(result) ? "passed" : "blocked",
    detail: hasPositiveTotal(result)
      ? "Amount, tax, and total could be calculated."
      : "A valid amount is required before a draft can be created.",
  });

  checks.push({
    label: "Safe creation rule",
    status: "passed",
    detail: "The agent will prepare a draft only. Final invoice or PO creation still needs user review.",
  });

  return checks;
}

function buildPlan(result = {}) {
  if (result.intent === "report") {
    return [
      "Read saved invoice, PO/WO, payment, and expense records.",
      "Summarize revenue, unpaid amount, expenses, and profit/loss.",
      "Keep source records unchanged.",
    ];
  }
  if (result.intent === "clarification") {
    return [
      "Ask for the missing fields.",
      "Wait for a clearer command before preparing a draft.",
    ];
  }
  const isPo = result.intent === "purchase_order";
  return [
    `Prepare a ${isPo ? "PO/WO" : "invoice"} draft from the command.`,
    `Check ${isPo ? "vendor" : "customer"}, currency, tax, item, and total.`,
    "Show warnings before saving.",
    "Save as draft only after the user confirms.",
  ];
}

function buildNextActions(result = {}, checks = []) {
  if (result.intent === "report") {
    return [{ id: "open_reports", label: "Open reports", type: "navigation", target: "/apps/web/dashboard.html#reports" }];
  }
  if (result.intent === "clarification" || checks.some((check) => check.status === "blocked")) {
    return [{ id: "answer_clarification", label: "Add missing details", type: "input" }];
  }
  return [
    { id: "create_draft", label: "Create draft", type: "draft" },
    { id: "discard", label: "Discard proposal", type: "safe_cancel" },
  ];
}

function buildReply(result = {}, checks = []) {
  if (result.intent === "report") {
    return result.summary || "I prepared a report summary from your saved records.";
  }
  if (result.intent === "clarification") {
    return result.question || "I need a few more details before I can prepare this safely.";
  }
  const label = recordLabel(result);
  const blocked = checks.some((check) => check.status === "blocked");
  const warning = checks.find((check) => check.status === "warning");
  if (blocked) return `I cannot prepare the ${label} yet because a required amount or detail is missing.`;
  if (warning) return `I can prepare the ${label} draft, but please review this warning first: ${warning.detail}`;
  return `I can prepare this ${label} as a draft. Review the proposal before saving it.`;
}

export function buildAiAgentResponse({ command = "", assistantResult = {} } = {}) {
  const result = assistantResult || {};
  const checks = buildChecks(result);
  return {
    agent: true,
    agentVersion: "1.0",
    mode: "guided_agent",
    command,
    intent: result.intent || "clarification",
    provider: result.provider || "local",
    reply: buildReply(result, checks),
    plan: buildPlan(result),
    checks,
    nextActions: buildNextActions(result, checks),
    safety: {
      createsFinalRecordsAutomatically: false,
      requiresUserConfirmationForDraft: true,
      usesExistingTierLimits: true,
    },
    quota: result.quota,
    result,
  };
}
