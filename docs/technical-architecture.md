# EazInvoice Technical Architecture

Status date: 2026-08-22

This document describes the architecture observed in the current source tree at `C:\Users\Jess\Documents\eazinvoice`. It is intentionally factual: implemented components are separated from partial transition work, planned work, deferred risks, and release blockers.

## Executive Summary

EazInvoice is a multi-surface SaaS product for MSME invoicing, purchases, accounting, compliance readiness, subscriptions, and Business-tier collaboration. The implementation is centered on a Node.js HTTP API in `apps/api`, with browser web screens in `apps/web`, a Capacitor Android client in `apps/mobile` plus `android`, and a freemium WordPress plugin in `plugins/eazinvoice-billing-workspace-msmes`.

The API owns financial calculations, entitlement checks, workspace authorization, accounting postings, compliance interpretation, bank reconciliation, period controls, year-end close, email delivery, and Razorpay subscription/payment processing. Web, Android, and WordPress should collect user intent and display backend results; they should not become alternate sources of financial truth.

Production storage is intended to be PostgreSQL with required migration `023_transactional_financial_persistence`. JSON persistence remains available for local development and tests. During the transition, the app still maintains a state-document compatibility snapshot, but P2-1C writes the compatibility state, indexed records, normalized core rows, normalized financial rows, divergence checks, and audit events in one PostgreSQL transaction.

## Repository Map

| Path | Responsibility | Current status |
| --- | --- | --- |
| `apps/api/src/server.js` | Native Node HTTP server, static hosting, auth routes, domain API routes, Razorpay, schedulers, admin operations | Implemented and large; currently the main integration point |
| `apps/api/src/index.js` | Application facade around the store: entitlements, workspace access, reports, AI commands, business features | Implemented |
| `apps/api/src/store.js` | In-memory domain state and business rules; persisted through adapter | Implemented but high-volume paths still use full-state persistence |
| `apps/api/src/persistence.js` | JSON file persistence for development/local mode | Implemented |
| `apps/api/src/postgres*.js` | PostgreSQL connection, state document, normalized core/financial sync, reporting, entitlements, accounting | Implemented transition/production path |
| `apps/web` | Browser SaaS UI, dashboard, invoicing, auth, subscription, privacy, admin | Implemented with P2-2 accounting UX expansion |
| `apps/mobile` | Capacitor web bundle used by Android | Implemented as mobile SaaS client with simplified accounting/governance surfaces |
| `android` | Native Android wrapper and release build config | Build-ready, Play upload blocked by signing/key continuity |
| `plugins/eazinvoice-billing-workspace-msmes` | WordPress.org-style freemium plugin | Implemented free plugin with API validation and paid-tier messaging |
| `database/migrations` | PostgreSQL schema migrations 001-023 | Implemented through P2-1C |
| `scripts` | Migration, validation, release, web, mobile, and subscription audit scripts | Implemented |
| `docs` | Runbooks, matrices, release notes, roadmaps | Partially complete; this file is the canonical architecture overview |

## Runtime Topology

```text
Web browser
Android Capacitor app
WordPress plugin/admin
        |
        | HTTPS JSON API, bearer token or API key
        v
Node.js EazInvoice API
        |
        | Business services and entitlement checks
        v
Store facade and domain services
        |
        | Production: PostgreSQL transaction
        | Dev/test: JSON or memory
        v
PostgreSQL normalized tables + compatibility state document
```

Static browser assets are served by the same Node process in local/self-hosted mode. Production deployment is expected to run behind HTTPS with explicit CORS allowlisting and PostgreSQL storage.

## Backend API

The backend is a plain Node.js HTTP server rather than Express. `apps/api/src/server.js` parses requests, validates sessions, dispatches route blocks, sends JSON responses, and serves static files.

Major route groups implemented:

- Health and readiness: `/health`, `/readyz`.
- Authentication: email OTP request, signup, login, Google auth start/callback, admin auth, current user profile.
- WordPress connection: `/wordpress/connection`.
- Admin operations: money dashboard, subscription audit, persistence status, gateway status, users, KYC review, recurring scheduler, business notification scheduler, AI usage.
- Plans and subscriptions: `/plans`, `/plan/free`, `/subscriptions`, `/subscriptions/me`, expiry/cancel/renew/downgrade support in client facade, Razorpay order and verification routes.
- Core records: companies, customers, vendors, invoices, purchase orders, payments.
- Financial workflows: vendor bills, credit notes, vendor credits, payment reversals, vendor payment reversals, customer refunds, vendor refunds.
- Accounting: summary, accounts, journals, books, account ledger, GST summary.
- Reports: summary plus typed financial report endpoints.
- Banking: bank/cash accounts, statement imports, statement lines, match suggestions, match/unmatch, reconciliation summary.
- Compliance and tax: business tax profile, tax registrations, rule sets, obligations, GST/TDS registers and reconciliation through service APIs.
- Period/year-end: accounting periods, readiness, status changes, opening balances, financial years, year-end preview/close/reopen.
- Business workspace: team members, workspaces, settings, SMTP validation, compliance dashboard/tasks/reminders, approvals, API keys, audit events, notifications/retry.
- AI: `/ai/command`, `/ai-agent/command`, AI usage endpoints.

The backend exposes `createServerAsync()` for production-like startup. When `EAZINVOICE_STORAGE=postgres`, startup validates PostgreSQL connectivity and schema compatibility before serving.

## Domain Services

Financial and compliance logic is split into focused service modules:

- `financial-service.js`: financial document totals, item normalization, payment state, payment validation, idempotency helpers.
- `accounting-service.js`: ledger account defaults, financial event posting, customer/vendor payments, reversals, refunds, credit notes, vendor credits, manual journals, journal balance validation, reconciliation checks.
- `financial-reporting-service.js`: receivables, payables, P&L, trial balance, general ledger, GST summaries, payment summaries, registers.
- `bank-reconciliation-service.js`: bank/cash account normalization, statement-line normalization, internal transaction evidence, match suggestions, reconciliation summary.
- `india-compliance-service.js`: GST/PAN/TAN structure checks, GST/TDS classification, registers, reconciliation, compliance readiness.
- `accounting-period-service.js`: financial-year and accounting-period resolution, date validation, close/reopen controls.
- `balance-sheet-service.js`: balance-sheet construction from ledger/posting data.
- `year-end-close-service.js`: readiness, preview, retained-earnings roll-forward, close/reopen reporting.
- `ai-assistant.js`, `ai-agent.js`, `ai-llm.js`: deterministic AI command parsing, guided agent response wrapping, optional LLM refinement.

Architecture rule: these services and the API own financially material results. Client-side calculations may preview input, but authoritative totals, postings, balances, entitlements, and compliance status must come from the API.

## Persistence Architecture

### Implemented Storage Modes

| Mode | Configuration | Intended use |
| --- | --- | --- |
| Memory | Tests with `persist: false` | Unit tests and isolated fixtures |
| JSON | `EAZINVOICE_STORAGE=json` or unset in development | Local development and fallback development data |
| PostgreSQL | `EAZINVOICE_STORAGE=postgres` with `DATABASE_URL` | Production and production-like staging |

JSON writes use `data/eazinvoice-data.json` with a backup file and optional background dual-write to Postgres. This is not production-safe for public launch.

### PostgreSQL Authority

Required production migration: `023_transactional_financial_persistence`.

Production Postgres writes are routed through `postgres-state.js` and `withPostgresTransaction()`. The transaction writes:

1. `eazinvoice_state_documents` compatibility snapshot.
2. `eazinvoice_records` indexed JSON records.
3. Normalized core rows through `postgres-core-sync.js`.
4. Normalized financial rows through `postgres-financial-sync.js`.
5. Divergence checks against expected state counts.
6. Audit event metadata.

If any step fails, the transaction rolls back. The compatibility state document remains useful during migration, but normalized relational financial tables are the intended production authority for financially material records.

### Normalized Domains

The migration set covers:

- Foundation, state document, indexed records, and audit events.
- Core users, businesses, companies, customers, vendors, invoices, purchase orders, payments, subscriptions, reports.
- Business workspaces, team members, settings, approvals, API keys, audit events, compliance tasks.
- API key HMAC hash hardening and identity/membership tenant hardening.
- Accounting foundation, journals, books, ledger accounts, ledger transactions, financial events.
- Vendor bills, purchase accounting, credit notes, vendor credits, reversals, refunds, settlements.
- Bank/cash accounts, bank statement imports, statement lines, reconciliation matches.
- India GST/TDS registrations, compliance rule sets, transaction compliance snapshots, obligations, TDS transactions.
- Accounting periods, opening balances, Balance Sheet readiness, financial years, year-end closes/history.
- Production RLS hardening and P2-1C transactional financial persistence.

### RLS and Tenant Isolation

Migration `022_production_data_integrity_rls` enables and forces RLS on tenant tables. Policies use transaction-local settings:

- `app.business_id`
- `app.actor_user_id`
- `app.rls_bypass`

Application-level authorization still remains mandatory. RLS is the second barrier, not a substitute for API permission checks.

## Authentication And Authorization

Implemented auth mechanisms:

- Email/password signup and login.
- Email OTP request and login support.
- Google auth route support.
- Admin auth with configured admin access.
- Bearer-token sessions stored by `session-store.js`.
- WordPress/API keys for connected plugin scenarios.

Web stores tokens in session/local storage and a SameSite cookie for browser continuity. Android uses the mobile shell storage abstraction and clears state on logout or 401. API keys are HMAC-hashed at rest using `API_KEY_HASH_SECRET`; rotating that secret invalidates existing API keys until a versioned secret strategy is added.

Business-tier authorization is based on workspace ownership, team membership, role permissions, and feature gates. Owner/admin can manage settings; accountant/viewer roles are permission-restricted. This needs a final production role-access audit before launch.

## Subscription And Entitlement Architecture

The plan catalog is implemented in `apps/api/src/plans.js`.

| Plan | Yearly billing amount | Implemented posture |
| --- | ---: | --- |
| Free | INR 0 | Active |
| Standard | INR 2,388 | Mostly active |
| Pro | INR 5,988 | Mostly active |
| Business | INR 11,988 | Active, hardening in progress |

Plan gates are enforced server-side with `requireFeature()`, usage limits, active subscription resolution, and optional admin preview headers for testing. PostgreSQL entitlement reads can be enabled with `EAZINVOICE_ENTITLEMENTS_SOURCE=postgres`, but subscription creation and payment activation still need careful consistency verification against the runtime store.

Razorpay subscription/payment support includes order creation, payment signature verification, webhook handling at `/webhooks/razorpay`, billing orders, and subscription activation. Live verification is still required for Standard, Pro, and Business yearly amounts, webhook receipt, runtime entitlement update, and Postgres entitlement consistency.

## Web Client Architecture

The web app is a browser client under `apps/web`. It imports the shared `apiClient` from `apps/api/src/client.js` and uses server endpoints for all authoritative data.

Implemented surfaces include:

- Auth, profile, onboarding, access/API key pages.
- Dashboard with business context, global business/workspace switching, plan summary, reports, subscription history.
- Invoice and purchase-order workflows.
- Customers, vendors, payments, document email actions, Razorpay payment-link actions.
- Accounting views for accounts, journals, books, ledger drill-down, GST summary, reports, Balance Sheet and Cash Flow summaries.
- Advanced financial workflows for credit notes, vendor credits, reversals, refunds, banking, periods, year-end, GST/TDS.
- Business workspace: team, SMTP settings, Razorpay gateway settings, compliance dashboard, approvals, API keys, notifications, audit trail.
- Admin operations and plan preview.
- AI Assistant and guided AI Agent command endpoints.

P2-2 closed the major web parity gap for supported backend workflows. Remaining work is mainly UX refinement, role-specific polish, export/report depth, and visual redesign after stabilization.

## Android Architecture

Android is implemented as a Capacitor shell:

- App ID: `com.eazinvoice.app`.
- Web directory: `apps/mobile`.
- Native project: `android`.
- Current candidate version: `versionCode 3`, `versionName 1.2.0`.
- Manifest permission: `INTERNET` only.
- FileProvider exists for sharing.
- Cleartext traffic is not broadly enabled.

The mobile app is scoped as a SaaS client:

```text
Android -> Auth -> Business Context -> EazInvoice API -> Authoritative Backend -> Mobile Presentation
```

Implemented mobile surfaces cover auth, session expiry/logout, business switch, dashboard, customers, vendors, invoices, customer payments, credit notes, refunds/reversals, purchase orders, vendor bills, vendor payments, vendor credits/recoveries, receivables, payables, P&L, Balance Sheet, simplified Trial Balance, simplified GST/TDS, simplified banking, period/year-end review, team/settings posture, API endpoint control, offline banner, and no silent offline financial write queue.

Deferred mobile hardening:

- Android Keystore-backed secure storage if Capacitor Preferences is not available in the final runtime.
- Deep links for authenticated invoice/payment/dashboard navigation.
- Push notifications.
- Server-authenticated canonical PDF download/share.
- Physical-device and signed-release smoke testing.

Current Play readiness blocker: no release/upload keystore continuity is present locally. `bundleRelease` can produce an AAB, but it is unsigned until `android/key.properties` points to the correct upload keystore.

## WordPress Plugin Architecture

The WordPress plugin is a freemium WordPress.org-style plugin:

- Plugin folder: `plugins/eazinvoice-billing-workspace-msmes`.
- Main plugin file: `eazinvoice-billing-workspace-msmes.php`.
- Header name: `EazInvoice Billing Workspace for MSMEs`.
- Version/stable tag: `1.0.7`.
- Text domain: `eazinvoice-billing-workspace-msmes`.

Implemented plugin features:

- Admin menu, dashboard, settings, subscription, API access, payment gateway readiness, feature search, help/SOP, privacy/data-use pages.
- Embedded invoice and PO/WO creation screens.
- Local free-tier document records stored in WordPress options.
- Print/browser Save as PDF and email-action gating.
- Public floating CTA and `[eazinvoice_button]` shortcode.
- API connection validation against EazInvoice.
- Paid-tier messaging for Standard, Pro, and Business.
- Sanitization, escaping, nonces, and privacy policy helper content.

Architectural boundary: the free plugin may store local plugin records, but paid and financially authoritative workflows should delegate to the EazInvoice backend. Razorpay secrets must remain in EazInvoice, not WordPress.

Package/name consistency has been aligned on the canonical WordPress slug `eazinvoice-billing-workspace-msmes`. Historical zip archives with the old slug remain in `plugins` only as prior build artifacts; current release packaging should use `eazinvoice-billing-workspace-msmes-{version}.zip`.

## AI Architecture

Current AI implementation:

- `ai-assistant.js` parses deterministic commands into invoice drafts, PO/WO drafts, and report summaries.
- `ai-llm.js` can refine commands through an LLM when `OPENAI_API_KEY` is configured.
- `ai-agent.js` wraps assistant results in a guided response with checks, a plan, warnings, and next actions.
- AI quota is plan-gated: Pro and Business plans support AI command usage; usage logs are recorded.

Current agent posture is draft-first and confirmation-oriented at the response layer, but the full tool-based AI Agent remains planned. The customer-service chatbot is explicitly separate and deferred.

Planned AI Agent phases:

1. Chat-style agent shell over the current assistant engine.
2. Internal tool layer for invoice, PO/WO, report, customer, vendor, and compliance actions.
3. Structured LLM outputs after deterministic validation.
4. Business-tier automation suggestions.
5. Separate customer-service AI assistant for support and product questions.

Safety invariants:

- Never auto-create final financial records without explicit confirmation.
- Never bypass plan entitlements or workspace permissions.
- Never expose secrets or another tenant's data.
- Log explainable AI actions.

## External Integrations

| Integration | Current implementation |
| --- | --- |
| Razorpay | SaaS subscription order/verify, webhook route, invoice payment-link flow, Business gateway settings |
| SMTP | Auth email fallback plus Business SMTP settings, validation, delivery history, approval/compliance/gateway notices |
| Google OAuth | Backend auth routes and configuration placeholders |
| Supabase | Config placeholders for OTP/auth support; not the authoritative app database |
| WordPress | Freemium plugin with API key validation and local free-tier records |
| OpenAI | Optional LLM command refinement when API key is configured |
| Android/Capacitor | Native wrapper around mobile SaaS web bundle |

## Configuration

Important environment variables:

- Runtime: `NODE_ENV`, `EAZINVOICE_ENV`, `PORT`, `PUBLIC_APP_URL`, `APP_BASE_URL`, `EAZINVOICE_PUBLIC_URL`.
- Storage: `EAZINVOICE_STORAGE`, `DATABASE_URL`, `EAZINVOICE_DATA_DIR`, `DATA_DIR`.
- Postgres safety: `EAZINVOICE_POSTGRES_SSL_REQUIRED`, `POSTGRES_SSL`, pool/timeout settings.
- Transition flags: `EAZINVOICE_POSTGRES_DUAL_WRITE`, `EAZINVOICE_CORE_TABLE_SYNC`, `EAZINVOICE_REPORTS_SOURCE`, `EAZINVOICE_ENTITLEMENTS_SOURCE`.
- Security: `ADMIN_ACCESS_KEY`, `ADMIN_EMAIL`, `ADMIN_EMAILS`, `API_KEY_HASH_SECRET`, `CORS_ALLOWED_ORIGINS`.
- OTP/auth email: `OTP_CHANNEL`, `EMAIL_OTP_EXPIRES_SECONDS`, `EMAIL_SMTP_*`, optional Supabase settings.
- Razorpay: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
- Schedulers: `RECURRING_SCHEDULER_ENABLED`, `BUSINESS_NOTIFICATION_SCHEDULER_ENABLED`, interval/digest settings.
- AI: `OPENAI_API_KEY` and model/provider settings if present.

Production minimum:

- `NODE_ENV=production`
- `EAZINVOICE_ENV=production`
- `EAZINVOICE_STORAGE=postgres`
- `DATABASE_URL` configured outside Git
- `EAZINVOICE_POSTGRES_SSL_REQUIRED=true`
- Strong `ADMIN_ACCESS_KEY`
- Strong stable `API_KEY_HASH_SECRET`
- Explicit `CORS_ALLOWED_ORIGINS` without localhost
- Required migration `023_transactional_financial_persistence` applied

## Release And Verification

Implemented scripts include:

- `npm run build`
- `npm test`
- `npm run db:check`
- `npm run db:migrate`
- `npm run db:verify-schema`
- `npm run db:validate-p21b`
- `npm run db:validate-p21c`
- `npm run db:verify-core`
- `npm run db:verify-entitlements`
- `npm run db:verify-reports`
- `npm run db:verify-state`
- `npm run audit:subscriptions`
- `npm run web:p22-check`
- `npm run web:e2e`
- `npm run web:e2e:live`
- `npm run mobile:check`
- `npm run mobile:sync`
- `npm run release:check`
- `npm run audit:deps`

P2-3B recorded previous verification success on 2026-08-16 for build, tests, web checks, mobile checks, audit, Playwright, Gradle wrapper, debug build, unsigned release AAB build, and emulator debug launch. Those results should be rerun from the moved source tree before launch.

## Implemented Architecture

- Node API owns financial workflows, plan gates, workspace permissions, and domain logic.
- Web client has broad parity for supported backend workflows, including accounting, reports, banking, compliance, Business workspace, and AI.
- Android mobile client is API-driven and blocks silent offline financial writes.
- WordPress plugin is WordPress.org-ready in structure and free-tier behavior, with API validation and paid messaging.
- PostgreSQL migration set reaches P2-1C and defines production financial persistence requirements.
- P2-1C transactional persistence removes the crash window between state-document writes and normalized financial table sync.
- Business tier exists with team members, roles, approvals, API keys, SMTP/gateway settings, compliance dashboard, audit events, and notification history.
- Razorpay yearly paid tiers are represented in the plan catalog and checkout/verification flow.
- Release/readiness scripts exist for database, web, mobile, subscriptions, and production checks.

## Partially Implemented Or Transitional Architecture

- Store mutation paths still operate primarily through in-memory/full-state replacement before persistence. This is acceptable for current transition scale but should be replaced by per-workflow repository writes with row-level locks before high-volume multi-instance production.
- The compatibility state document is still central during migration, even though normalized financial tables are the intended production authority.
- Postgres report and entitlement bridge flags exist; they must be verified before enabling in production.
- Business role permissions are implemented, but the final role-by-route production audit is still required.
- Razorpay live behavior is implemented structurally, but live amount/webhook/entitlement consistency still needs final audit.
- Mobile secure storage depends on runtime availability of native storage support; Keystore-backed hardening remains deferred.
- WordPress plugin has local free-tier records and connection validation, but paid backend-delegated workflows need final parity validation.
- The guided AI Agent wrapper exists, but the full tool-based agent is not yet complete.

## Planned Architecture

- Direct Postgres repositories for financially material write paths.
- Stronger database-level idempotency, locking, and partial-update workflows.
- Final UI/UX redesign of web/dashboard/accounting/GST/reports/billing/AI/mobile after stabilization.
- Tool-based AI Agent with explicit confirmation and audit logging.
- Separate customer-service AI assistant for public/support use.
- Better mobile PDF retrieval/share and deep links.
- WordPress paid feature parity tied to backend entitlement verification.
- Formal API documentation for Business API customers.
- Production observability, alerting, and restore drills.

## Deferred Risks

- Full-state persistence can become a scaling and concurrency risk under multi-instance traffic.
- RLS depends on correct transaction-local context; pooled connection misuse must be avoided.
- API key hash secret rotation is not yet versioned.
- Account deletion and financial-record retention need final product/legal workflow.
- Data safety declarations must match actual production analytics, support, diagnostics, and payment tooling.
- WordPress local free-tier records are separate from SaaS authority and must be messaged clearly.
- Android release testing is not complete without a signed release AAB and production-like endpoint.
- Live Razorpay payment flows can only be considered launch-ready after a controlled live payment and webhook audit.

## Current Release Blockers

1. Android Play upload is blocked by missing release/upload keystore continuity or a confirmed Play Console upload-key reset/new-listing path.
2. Signed AAB evidence is missing; current release AAB is unsigned until `android/key.properties` is configured.
3. Play Console highest `versionCode` must be checked before using versionCode `3`.
4. Razorpay live subscription audit is still required for Standard, Pro, and Business yearly amounts and webhook entitlement updates.
5. Production verification must be rerun from `C:\Users\Jess\Documents\eazinvoice`.
6. Business-tier role, SMTP/gateway secret, audit-log, API-key, notification-history, and role-specific UI hardening remains before public rollout.
7. WordPress plugin package/name consistency and backend delegation parity must be checked before WordPress.org or paid-plugin release.
8. Production environment must prove `EAZINVOICE_STORAGE=postgres`, schema migration `023`, explicit CORS, SSL-required Postgres, strong secrets, backup/restore discipline, and passing `/readyz`.

## No-Go Rules

Do not publicly launch if any of the following are true:

- Production can silently fall back to JSON or memory storage.
- PostgreSQL schema validation or P2-1C validation fails.
- Login, OTP, subscription activation, invoice creation, PO/WO creation, reports, or logout fails in smoke testing.
- Standard, Pro, or Business subscription amounts are wrong.
- Webhook success does not update runtime and Postgres entitlements consistently.
- Role-restricted users can access owner/admin actions.
- API keys, SMTP passwords, Razorpay secrets, OTPs, or signing secrets appear in Git, UI, logs, plugin output, or API responses.
- Android AAB is unsigned or uses an unconfirmed upload key/versionCode.
- Account deletion and financial-record retention messaging is absent from store/listing/privacy surfaces.
