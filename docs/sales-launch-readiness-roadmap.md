# EazInvoice Sales Launch Readiness Roadmap

Status date: 2026-08-22

Purpose: track the remaining work required before EazInvoice is safe to sell to real users and promote through ads. This roadmap should be updated after each release-readiness pass.

## Current Position

EazInvoice has a strong functional foundation across the web SaaS, Android app, paid tiers, PostgreSQL hardening, accounting workflows, and AI-assisted drafting. The WordPress plugin is a separate plugin product that can integrate with and lead users into EazInvoice, but it should be tracked and marketed separately from the web/Android application. The web/Android product should not be advertised broadly until the external production blockers below are closed.

## Step 1: Stabilize Current Moved Repo

Status: complete for current pass.

Evidence:

- Active project path is `C:\Users\Jess\Documents\eazinvoice`.
- Git repository is active.
- Working tree contains substantial P2 work and is the current source of truth.
- Do not rebuild from `origin/main` without first preserving the current working tree.

Remaining action:

- Commit the recovered P2 work in logical groups before risky release changes.

## Step 2: Technical Architecture

Status: complete for current pass.

Evidence:

- Created `docs/technical-architecture.md`.
- Updated `docs/architecture.md` to point to the new source-of-truth architecture document.

Remaining action:

- Keep `docs/technical-architecture.md` updated whenever architecture decisions change.

## Step 3: Local Build And Verification Baseline

Status: mostly pass; database tooling blocked by sandboxed Node process execution.

Passed on 2026-08-22:

- `npm run build`: PASS.
- `node tests\api.test.js`: PASS, 138/138 tests.
- `node tests\mobile-document-actions.test.js`: PASS, 3/3 tests.
- `npm run web:p22-check`: PASS, 32/32.
- `npm run mobile:check`: PASS, 8/8.
- `npm run release:check`: PASS.
- `npm audit`: PASS, 0 vulnerabilities.

Environment-blocked:

- `npm test` invokes Node's test runner orchestration and fails with `spawn EPERM` in this sandbox, but both test files pass when run directly.
- `npm run db:verify-schema` and `npm run db:validate-p21c` are blocked because Node `spawnSync` cannot execute `psql.exe` in this sandbox, even though PowerShell can run `C:\Program Files\PostgreSQL\17\bin\psql.exe --version`.

Remaining action:

- Re-run database checks in a normal terminal or CI where Node can spawn PostgreSQL tools:
  - `npm run db:verify-schema`
  - `npm run db:validate-p21c`

## Step 4: Android Play Readiness

Status: blocked by release signing and Play Console confirmation.

Already strong:

- Android package id is `com.eazinvoice.app`.
- Target SDK, Gradle wrapper, and Android Gradle Plugin are configured.
- Debug APK exists and has launched successfully.
- Mobile parity check passes.
- Release default API points to production.
- No test-only auth shortcut is bundled in Android release logic.
- Gradle signing report runs when `JAVA_HOME` is set to Android Studio JBR and `GRADLE_USER_HOME` is redirected to `.tmp/gradle-home`.

Blockers:

- Confirm highest `versionCode` already uploaded to Play Console.
- Locate existing upload/release keystore or confirm upload-key reset/new-listing path.
- Configure `android/key.properties` outside Git.
- Build signed release AAB.
- Verify signed AAB with `jarsigner`.
- Run native authenticated smoke against the intended QA/production-like API.
- Finalize account-deletion URL, Data Safety answers, financial-services declaration, screenshots, support URL, and listing copy.

Latest local signing report on 2026-08-22:

- Release variant still reports `Config: null`, `Store: null`, and `Alias: null`.
- This confirms that Play upload readiness is blocked by missing local release signing configuration, not by package id or Gradle configuration.

## Step 5: Razorpay Live Subscription Audit

Status: local logic pass; live external verification pending.

Passed locally on 2026-08-22:

- `SKIP_POSTGRES_ENTITLEMENT_VERIFY=true npm run audit:subscriptions`: PASS.
- Plan catalog monthly/yearly pricing matches expected values.
- Razorpay subscription order amounts match expected paise amounts.
- Verified payment activates the correct plan.
- Duplicate payment verification is idempotent.
- Subscription cancel, renewal, downgrade, and expiry routes are covered.
- Paid feature unlocks and lower-tier inheritance are covered.
- Free plan upgrade indicators remain locked.
- Admin preview remains admin-only.

Must verify:

- Standard yearly checkout: INR 2,388 / 238800 paise.
- Pro yearly checkout: INR 5,988 / 598800 paise.
- Business yearly checkout: INR 11,988 / 1198800 paise.
- Live Razorpay key mode is correct.
- Webhook signature verification works.
- Successful payment updates runtime subscription state.
- PostgreSQL entitlement mirror matches runtime state.
- Paid features unlock and free restrictions remain visible for free users.

Environment note:

- The local `.env` database credentials currently fail authentication for the optional Postgres entitlement verifier. Use a valid staging/disposable `DATABASE_URL` for the full audit.
- To run the local-only audit without Postgres verification, set `SKIP_POSTGRES_ENTITLEMENT_VERIFY=true`.

Do not advertise paid subscriptions broadly until this is verified.

## Step 6: Business Tier Hardening

Status: code/test audit complete; staging provider validation pending.

Audit artifact:

- `docs/business-tier-hardening-audit.md`

Passed locally on 2026-08-22:

- Direct API test run passed 138/138 tests.
- Role escalation to owner/admin is blocked for sub-users.
- Accountant and Viewer permissions are covered by route-level tests.
- API keys are hashed at rest and plaintext is displayed only once.
- SMTP and gateway secrets are hidden after save.
- Audit metadata redacts sensitive fields.
- Cross-tenant workspace and direct-id access attempts are blocked by tests.

Must verify:

- Sub-users cannot be owner/admin.
- Accountant and Viewer permissions are correct across records, reports, compliance, API keys, settings, notifications, and approvals.
- Invite links remain disabled; sub-users log in by assigned email.
- API key metadata is safe.
- SMTP passwords, Razorpay secrets, webhook secrets, and admin settings never appear in UI, logs, audit metadata, API responses, or plugin output.
- Business SMTP/gateway failure and retry states are visible without leaking secrets.

Remaining staging/prod validation:

- Run full Postgres/RLS validation with valid credentials.
- Test real SMTP validation and delivery logging.
- Test real Razorpay Business gateway configuration behavior.
- Review production/staging logs for secret leakage.

## Step 7: Separate WordPress Plugin Product Parity And Packaging

Status: local package alignment complete; WordPress.org upload validation pending.

Already present:

- Separate plugin product source exists at `plugins/eazinvoice-billing-workspace-msmes`.
- Plugin version checks pass for header/readme/constant.
- WordPress SOP exists.
- WordPress connection validation is covered by API tests.
- Canonical folder name, text domain, readme instructions, release script, test fixture path, and package naming now use `eazinvoice-billing-workspace-msmes`.

Must verify:

- Free plugin remains WordPress.org compliant.
- Paid-tier messaging is clear and entitlement-backed without implying the plugin is the same product as the EazInvoice web/Android app.
- Plugin delegates financial authority to the EazInvoice API.
- Inputs are sanitized, output is escaped, nonces are used, and API secrets are not exposed publicly.
- Run WordPress Plugin Check and WordPress.org SVN upload validation outside this local repo.

## Step 8: UI/UX Redesign Audit

Status: audit complete; Phase 1 public-entry first pass complete; Phase 2 first-run/dashboard action pass implemented and committed.

Audit artifact:

- `docs/ui-ux-product-audit.md`

Implementation requirement:

- Sales-safe public entry first pass completed in `apps/web/index.html`, `apps/web/home.js`, `apps/web/styles.css`, and `apps/web/landing-phase1.css`.
- First-run onboarding and dashboard daily-action improvements are implemented in `apps/web/onboarding.html`, `apps/web/onboarding.js`, `apps/web/dashboard.html`, `apps/web/dashboard.js`, and `apps/web/styles.css`.
- Preserve backend financial authority.
- Do not change accounting, GST, reports, auth, entitlements, or database behavior for visual convenience.
- Keep Android, WordPress, payment, tax, and AI claims aligned to verified release status.

Commercial goal:

- Make EazInvoice feel like a reliable business finance and statutory-compliance product for Indian MSMEs, not a generic admin dashboard.

## Step 9: AI Agent Upgrade

Status: current safe boundary documented; full tool-based upgrade remains post-stabilization.

Current position:

- AI Assistant can parse structured commands and draft invoices, PO/WO records, and report summaries.
- AI Agent wrapper provides safe plan/check/action framing.
- Current tests cover no auto-save behavior and Pro/Business gates.
- Safe launch claim is limited to assisted drafting and report summaries for Pro/Business plans.

Do later:

- Build chat-style Agent Shell.
- Convert actions into safe internal tools.
- Add permission checks and audit logs per tool.
- Use structured LLM output only after deterministic validation.
- Require confirmation before financial record creation or mutation.
- Keep customer-service chatbot separate from account-writing AI Agent.

## Step 10: Ads And Selling Readiness

Status: controlled-launch checklist complete; broad ads still blocked by external verification.

Launch checklist:

- `docs/ads-and-selling-launch-checklist.md`

Before ads:

- Production deployment must pass build, tests, database validation, release checks, and smoke tests.
- Payment activation must be verified with Razorpay live flow.
- Privacy policy and account-deletion process must be public and final enough for app/store review.
- Android release path must be signed and testable, or ads must avoid Android availability claims.
- WordPress plugin package must be consistent if advertised.
- Marketing claims must match verified features only.

Safe early positioning after blockers close:

- Business invoicing, purchase orders/work orders, customers/vendors, payment tracking, reports, GST/TDS readiness, finance cockpit, business workspace controls, and mobile/web access.

Claims to avoid until fully implemented and legally supported:

- Government filing.
- CA-certified accounting.
- Legal/tax advice.
- Banking/lending/investment features.
- Fully autonomous AI accounting.
- Android availability before Play readiness is closed.
