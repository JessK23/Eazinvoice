# EazInvoice AI Agent Roadmap

## Current State

EazInvoice currently has an AI Assistant that parses structured user commands and can draft invoices, PO/WO records, and report summaries. It also has an optional LLM wrapper when `OPENAI_API_KEY` is configured.

The guided AI Agent wrapper is implemented at `/ai-agent/command`. It wraps assistant output with checks, a plan, warnings, and next actions. Current tests confirm the Agent does not auto-save financial records and keeps Pro/Business gates intact.

Commercially safe current claim: "AI-assisted invoice, PO/WO, and report drafting for Pro and Business plans."

Claims to avoid until later phases are complete:

- Fully autonomous accounting.
- Automatic tax filing.
- Legal, tax, or CA-certified advice.
- Unsupplied customer/vendor data completion without review.
- Background financial record creation without user confirmation.

## Target State

The AI Agent should become a guided business operator, not just a command parser. It should:

- Understand account context, customer records, vendors, invoices, PO/WO records, payments, subscription limits, and reports.
- Ask clarifying questions before creating or changing financial records.
- Create drafts first, then require user confirmation before final creation.
- Respect tier limits and show remaining usage.
- Produce explainable actions and audit logs.
- Avoid exposing one user's data to another user.

## Recommended Build Phases

### Phase 1: Agent Shell

- Add chat-style UI. Current dashboard UI has a chat-style Agent workspace; continue polishing it rather than starting again.
- Keep current AI Assistant as the execution engine.
- Add safe responses for missing customer/vendor/account data.
- Add clear confirm/cancel actions before creating drafts.

### Phase 2: Tool-Based Actions

- Convert invoice, PO/WO, report, customer, vendor, and compliance actions into safe internal tools.
- Add permission checks for each tool.
- Log every agent action.

### Phase 3: LLM Integration

- Use the configured OpenAI model only after deterministic checks.
- Force structured JSON outputs.
- Validate all generated amounts, dates, taxes, and customer/vendor references.

### Phase 4: Business Tier Automation

- Compliance reminders.
- Payment follow-up suggestions.
- Customer aging summaries.
- Vendor spend summaries.
- Approval workflow suggestions.

### Phase 5: Customer Service AI Assistant

- Add a separate public/support chatbot.
- Keep it separate from account-writing actions.
- Allow it to explain plans, features, setup, WordPress plugin usage, and Android app usage.

## Safety Rules

- Never auto-create final invoices or PO/WO records without confirmation.
- Never bypass tier entitlements.
- Never expose hidden API keys, SMTP passwords, Razorpay secrets, or another user's records.
- Keep generated actions reversible while in draft state.

## Launch Readiness Position

The current AI feature can remain in the sales story as an assisted drafting feature for paid plans after subscription verification is complete. The full tool-based AI Agent should stay after stabilization, because subscriptions, permissions, audit logging, and production persistence must remain the authority before the AI layer gains more actions.
