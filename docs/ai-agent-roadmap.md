# EazInvoice AI Agent Roadmap

## Current State

EazInvoice has an AI Assistant compatibility path that parses structured user commands and can draft invoices, PO/WO records, and report summaries. It also has an optional LLM wrapper when `OPENAI_API_KEY` is configured.

P2-4A implements the first real tool-based EazInvoice AI Agent at `/ai-agent/command`. The Agent is domain-constrained to authorized EazInvoice accounting, tax, compliance, business-performance, and safe draft data. It plans against a registered internal tool matrix, separates facts from calculations and recommendations, and keeps Pro/Business gates intact.

Commercially safe current claim: "EazInvoice AI Agent for business reviews, receivables, GST/TDS readiness, cash-flow review, custom reports, and safe invoice/PO/WO draft preparation for Pro and Business plans."

Claims to avoid until later phases are complete:

- Fully autonomous accounting.
- Automatic tax filing.
- Legal, tax, or CA-certified advice.
- Unsupplied customer/vendor data completion without review.
- Finalization, payment, filing, journal posting, deletion, or background financial record creation without user confirmation.

## Target State

The AI Agent should become a guided business operator, not just a command parser. It should:

- Understand account context, customer records, vendors, invoices, PO/WO records, payments, subscription limits, and reports.
- Ask clarifying questions before creating or changing financial records.
- Create drafts first, then require user confirmation before final creation.
- Respect tier limits and show remaining usage.
- Produce explainable actions and audit logs.
- Avoid exposing one user's data to another user.

## Implemented Foundation

P2-4A includes:

- Registered read tools for business summary, P&L, balance sheet, trial balance, receivables, payables, GST, TDS, cash/bank, customers, vendors, custom reports, and compliance readiness.
- Safe draft tools for invoice, PO, and WO drafts only.
- Server-authorized business scope, workspace permission checks, plan gates, and AI quota logging.
- Bounded execution with a maximum of 8 tool steps per request.
- Rejection of arbitrary SQL, secret access, cross-business access, and non-finance chatbot requests.

Excluded tools remain unavailable: `finalize_invoice`, `make_payment`, `post_journal`, `file_return`, statutory filing, and deletion.

## Recommended Build Phases

### Phase 1: Agent Shell - Complete

- Add chat-style UI. Current dashboard UI has a chat-style Agent workspace; continue polishing it rather than starting again.
- Keep current AI Assistant as the execution engine.
- Add safe responses for missing customer/vendor/account data.
- Add clear confirm/cancel actions before creating drafts.

### Phase 2: Tool-Based Actions - Foundation Complete

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

The P2-4A Agent can remain in the controlled launch story for paid plans after subscription verification is complete. Keep commercial wording narrow: reviews, reports, recommendations, and safe drafts. Do not market autonomous accounting, filing, payment, journal posting, or irreversible automation until later approval-controlled phases are built and audited.
