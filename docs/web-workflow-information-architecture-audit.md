# EazInvoice Web Workflow & Information Architecture Audit

## 1) Executive verdict

- **Verdict:** **NOT READY** for the target production benchmark.
- **Current overall score:** **2.53 / 5.00** (17-category average).
- The web app has strong backend-authoritative accounting and lifecycle intent in the Workspace (`dashboard.html` + API-backed actions), but information architecture is split between an older multi-surface `access.html` shell and the actual operational Workspace.
- The largest UX gap is route/label duplication (multiple “Dashboard”, invoice/PO/reports/AI entry points across different pages).
- The highest architectural risk is keeping two operational surfaces alive (Access + Workspace) while enforcing financial lifecycle authority mostly in Workspace paths.

## 2) Current architecture

- **Public entry:** `index.html` (marketing + entry CTAs).
- **Auth entry:** `auth.html` + `auth.js` (OTP/password signup/login/reset).
- **Post-auth landing:** `auth.js` routes normal users to `access.html`.
- **Operational workspace:** `dashboard.html` + `dashboard.js` hosts Sales, Purchases, Accounting, Compliance, Business Workspace, Subscription, AI Agent, and reports.
- **Document execution:** `invoice.html` has invoice + PO/WO creation/finalization/issuance, draft handling, payment, and email actions.
- **Account/subscription page:** `subscription.html` mixes plan/billing controls with KYC/business identity capture.
- **Onboarding:** `onboarding.html` exists, but is not the mandatory post-signup route.
- **Secondary shell:** `access.html` duplicates AI/Invoice/PO/Dashboard/Reports and includes profile + company + mobile center.

## 3) Current user journey

### Login path (today)

- `auth.html?tab=login` → successful login → redirect to `access.html`.
- From `access.html`, user can open:
  - invoice flow (`invoice.html`)
  - PO flow (`invoice.html?type=po`)
  - AI (`dashboard.html#ai-agent`)
  - dashboard reports (`dashboard.html`)

### Signup path (today)

- `auth.html` signup collects subscriber type and optional company registrant details.
- Successful signup also redirects to `access.html` (not onboarding-first dashboard).
- Optional onboarding is discoverable later via `dashboard.html` first-run panel and direct onboarding links.

### Observed architecture pattern

- `access.html` acts like a mixed account + pseudo-workspace launcher.
- `dashboard.html` is the actual dense operational workspace where backend-authoritative accounting/report/workspace controls live.

## 4) Benchmark architecture

- **Single authoritative operational dashboard:** `dashboard.html` (or equivalent) only.
- **My Account / Access page scope only:** profile/settings/subscription/team + “Go to Workspace”.
- **Business profile and compliance profile:** maintained in business/workspace profile areas, not mixed into subscription identity onboarding.
- **Subscription page scope only:** plan, billing, usage, history, renew/cancel/downgrade.
- **Invoice/PO/AI/Reports:** operational features launched from Workspace, not duplicated in account shell.

## 5) Route/navigation inventory

| Route / Surface | Current purpose | Operational authority | Notes |
|---|---|---|---|
| `/apps/web/index.html` | Marketing + entry CTAs | No | Also promotes mobile app center links. |
| `/apps/web/auth.html` | Signup/login/reset | Auth only | Redirects to `access.html` post auth. |
| `/apps/web/access.html` | Mixed account + operational shortcuts | Partial/duplicated | Contains AI/Invoice/PO/Dashboard/Reports tabs plus profile/company panes. |
| `/apps/web/dashboard.html#reports` | Main dashboard landing section | Yes | Actual workspace shell with multi-domain nav. |
| `/apps/web/dashboard.html#ai-agent` | AI workspace | Yes | Gated by plan/access checks. |
| `/apps/web/dashboard.html#invoices` | Invoice workspace summary | Yes | Links to `invoice.html`. |
| `/apps/web/dashboard.html#purchase-orders` | PO/WO workspace summary | Yes | Links to `invoice.html?type=po`. |
| `/apps/web/dashboard.html#accounting` | Accounting-ledger pages | Yes | Backend-authoritative summaries and journals. |
| `/apps/web/dashboard.html#business-workspace` | Compliance/profile/team/API/settings | Yes | Includes business switching and governance controls. |
| `/apps/web/dashboard.html#subscription` | Subscription section in workspace | Yes | Duplicates dedicated subscription page conceptually. |
| `/apps/web/subscription.html` | Plan + KYC/profile docs + billing actions | Mixed | Blends plan/billing with identity/business profile capture. |
| `/apps/web/onboarding.html` | Business profile first-run wizard | Partial | Not enforced as post-signup mandatory flow. |
| `/apps/web/invoice.html` | Invoice + PO/WO drafting/finalize/issue | Yes | Handles record lifecycle actions through API. |
| `/apps/web/mobile-app.html` | Android download center | No (support) | Intended support/download destination. |
| `/apps/web/admin.html` | Admin controls | Admin only | Separate, with links from other surfaces. |

## 6) KEEP / MOVE / MERGE / RENAME / REMOVE / REDIRECT table

| Item | Decision | Rationale |
|---|---|---|
| `dashboard.html` as operational center | **KEEP** | Already holds canonical Sales/Purchase/Accounting/Compliance/AI/Workspace flows. |
| `invoice.html` for invoice + PO/WO execution | **KEEP** | Contains draft/finalize/issue/payment/email lifecycle actions. |
| `access.html` profile/account settings pane | **KEEP (as Account shell only)** | Useful for user-level profile and password changes. |
| `access.html` company profile pane | **MOVE** | Company/business profile should live in Workspace business profile/compliance scope. |
| `access.html` AI tab | **REMOVE + REDIRECT** | Duplicate of `dashboard.html#ai-agent`. |
| `access.html` Generate Invoice tab | **REMOVE + REDIRECT** | Duplicate launcher; operational source should be Workspace. |
| `access.html` Generate PO tab | **REMOVE + REDIRECT** | Duplicate launcher; operational source should be Workspace. |
| `access.html` Dashboard/Reports tabs | **REMOVE + REDIRECT** | Causes “Dashboard means Access vs Workspace” ambiguity. |
| `access.html` topnav Dashboard link (`?tab=dashboard`) | **RENAME + REDIRECT** | Rename to “Workspace”; send to `dashboard.html#reports`. |
| `subscription.html` KYC/business identity capture | **MOVE** | Business/KYC identity should belong to business profile/compliance onboarding, not subscription core. |
| `subscription.html` plan/billing/history actions | **KEEP** | Correct subscription concerns. |
| Dashboard nav label “Dashboard” → `#reports` | **RENAME** | Prefer “Workspace Dashboard” or “Reports Dashboard” for clarity. |
| `dashboard.html#subscription` + `/subscription.html` dual subscription surfaces | **MERGE** | Keep one canonical subscription destination; make other a redirect/embedded summary. |
| `mobile-app.html` | **KEEP** | Valid support/download center route. |
| Mobile Download block inside Access status pane | **MOVE** | Keep in help/manual/download context; remove from operational/account core panes. |

## 7) Duplicate/dead-end surfaces

- **Invoice duplication:** `access.html?tab=invoice`, `dashboard.html#invoices`, `invoice.html`.
- **PO duplication:** `access.html?tab=po`, `dashboard.html#purchase-orders`, `invoice.html?type=po`.
- **Dashboard duplication:** `access.html?tab=dashboard` (teaser) vs `dashboard.html#reports` (actual workspace dashboard).
- **Reports duplication:** `access.html?tab=reports` static cards vs `dashboard.html#reports` + `#report-*` detail.
- **AI duplication:** `access.html?tab=ai` launcher vs `dashboard.html#ai-agent` real AI workspace.
- **Account settings ambiguity:** dashboard profile menu maps “Account Settings” to `/subscription.html`.

## 8) Account vs Business Profile analysis

### What belongs in My Account

- User identity (name/email/phone)
- Password change
- Session/security basics
- Plan summary and billing link
- Team/access shortcuts (if role-based)

### What is currently mixed

- `access.html` includes both personal profile and full company profile authoring.
- `subscription.html` collects entity type, PAN/GST/tax IDs, address proof, and document uploads.
- `dashboard.html#business-workspace` includes compliance profile and governance settings.

### Audit conclusion

- Business identity is fragmented across **three** surfaces (`access`, `subscription`, `dashboard business-workspace`).
- This violates the target model where “My Account” and “Business Profile” are clearly separated.

## 9) Subscription separation

- **Positive:** plan list, active state, history, cancel/renew/downgrade, Razorpay integration exist.
- **Gap:** subscription page is overloaded with business/KYC profile creation and document capture.
- **Risk:** users may treat subscription identity form as canonical business profile, while workspace/compliance profile exists elsewhere.
- **Target:** subscription should focus on plan/billing/usage/history only.

## 10) Dashboard analysis

- `dashboard.html` is the only surface with full cross-domain authority:
  - Sales, purchases, accounting, compliance, business workspace, admin ops (role-gated), AI, subscriptions.
- Hash routing in `dashboard.js` (`showDashboardPage`) supports canonical sections and report-detail behavior.
- Core issue is **entry-point dilution** from Access-level duplicates.

## 11) Sales workflow

- Create/edit records through `invoice.html`.
- Draft saved first; finalize via `/invoices/{id}/finalize`.
- Dashboard invoice summaries and payment tracking are API-backed.
- Lifecycle posture is strong in workspace and invoice flows.

## 12) Purchase workflow

- PO/WO creation via `invoice.html?type=po`.
- Issuance via `/purchase-orders/{id}/issue`.
- Dashboard purchase section summarizes payables and vendor flow.

## 13) AI workflow

- Canonical AI workspace is `dashboard.html#ai-agent`.
- Access page has a second AI pane that only launches workspace AI.
- Plan/usage gating exists in workspace and subscription contexts.
- Recommendation: keep only Workspace AI route as authoritative.

## 14) Reports workflow

- `dashboard.html#reports` is main summary dashboard.
- Detail routes (`#report-invoices`, `#report-expenses`, etc.) are handled through `report-detail` logic.
- Access reports pane is non-authoritative and should be removed/redirected.

## 15) Mobile Download Center analysis

- Exists as dedicated page (`mobile-app.html`) and is also promoted in `index.html` and `access.html`.
- Repetition across marketing + account shell introduces noise.
- Benchmark fit: keep one clear support/download center route, linked from help/manual context.

## 16) Signup/profile-completion workflow

- Signup currently routes to `access.html`, not mandatory onboarding.
- Onboarding exists and captures business profile, but is optional/discoverable.
- Dashboard first-run checklist references onboarding and business readiness.
- Target mismatch: desired flow is Signup → Entity type → required profile completion → Workspace Dashboard.

## 17) Business switching

- Dashboard and invoice flows support workspace owner selection via `workspaceOwnerUserId`.
- Write permissions are role-gated (`workspaceCanWriteRecords`) with explicit lock messages.
- Good multi-business/team foundation exists.

## 18) Financial authority / lifecycle safety

- Evidence supports backend-authoritative controls for:
  - invoice finalize
  - PO issue
  - payment posting with balance validation
  - accounting summaries/journals/period controls/year-end close APIs
  - credit/reversal endpoints in client surface
- Dashboard first-run + finance cockpit messaging explicitly state backend authority intent.
- Net: lifecycle/accounting authority is stronger than IA/navigation quality.

## 19) Current → Target route map

| Current | Target canonical route | Action |
|---|---|---|
| `/apps/web/auth.html` success → `/apps/web/access.html` | `/apps/web/dashboard.html#reports` (or onboarding gate before dashboard) | Change post-auth route policy. |
| `/apps/web/access.html?tab=dashboard` | `/apps/web/dashboard.html#reports` | Redirect + rename to Workspace. |
| `/apps/web/access.html?tab=reports` | `/apps/web/dashboard.html#reports` | Redirect. |
| `/apps/web/access.html?tab=ai` | `/apps/web/dashboard.html#ai-agent` | Redirect. |
| `/apps/web/access.html?tab=invoice` | `/apps/web/dashboard.html#invoices` | Redirect. |
| `/apps/web/access.html?tab=po` | `/apps/web/dashboard.html#purchase-orders` | Redirect. |
| `/apps/web/access.html?tab=company` | `/apps/web/dashboard.html#business-profiles` / `#business-workspace` | Move functionality. |
| `/apps/web/subscription.html` (KYC + billing) | Subscription-only concerns | Move KYC/business identity out. |

## 20) Click-count / time-to-action analysis

Assumes logged-in user lands on current default `access.html`.

| Task | Current shortest path | Clicks | Notes |
|---|---|---:|---|
| Create Invoice | Access tab Invoice → Create Invoice | 2 | Could be 1 from Workspace quick actions. |
| Create PO/WO | Access tab PO → Create PO | 2 | Could be 1 from Workspace quick actions. |
| Open AI Agent | Access tab AI → Open AI Workspace | 2 | Direct hash route exists but is not primary landing. |
| Open operational Dashboard | Access tab Dashboard → Open Reports | 2 | “Dashboard” currently points to Access shell label first. |
| Update business profile | Access tab Company → Save Company Profile | 2+ | Competes with onboarding and workspace profile flows. |
| Change password | Access tab Profile → save | 2+ | Acceptable account behavior. |
| View subscription | Access topnav Subscription | 1 | Fast, but page has mixed concerns. |

### Time-to-action verdict

- Raw click counts are moderate.
- Main delay is **decision friction** from multiple valid-looking paths for the same job.

## 21) 0–5 scorecard

| Category | Score (0–5) | Reason |
|---|---:|---|
| Signup/onboarding | 3 | OTP/signup is solid; onboarding sequence not enforced to target. |
| Business profile | 2 | Business identity split across multiple surfaces. |
| Account settings | 3 | Profile/password flows exist and work. |
| Subscription separation | 1 | Billing and business/KYC identity are mixed. |
| Dashboard clarity | 2 | Multiple “dashboard/report” meanings across Access and Workspace. |
| Sales navigation | 3 | Sales route exists and lifecycle is clear in invoice flow. |
| Purchase navigation | 3 | PO/WO flow exists and is explicit. |
| AI accessibility | 3 | Reachable, but duplicated surfaces reduce clarity. |
| Reports accessibility | 2 | Reports exist, but duplicated by Access pseudo-reports. |
| Mobile download placement | 2 | Download center repeated in non-support surfaces. |
| Route consistency | 2 | Multiple tabs/routes for same intent create drift. |
| Naming consistency | 2 | “Dashboard”, “Reports”, “Account Settings” map inconsistently. |
| Duplicate surfaces | 1 | High duplication between Access and Workspace operations. |
| Business switching | 3 | Workspace owner context + role locks are present. |
| Financial authority | 4 | Strong backend-authoritative accounting/lifecycle APIs and checks. |
| Document lifecycle | 4 | Draft→Finalize/Issue + payment constraints are explicit. |
| Overall time-to-action | 2 | Navigation ambiguity slows completion despite moderate clicks. |

- **Average:** **2.53 / 5.00**
- **Benchmark check:** fails (`no score below 3`, `average >= 4.0`).

## 22) Prioritized FUTURE remediation sequence (audit-only)

1. Declare Workspace dashboard as single operational authority and post-auth destination.
2. Reduce `access.html` to account-only shell (profile/settings/subscription/team/go-to-workspace).
3. Remove/redirect Access operational tabs (AI, Invoice, PO, Dashboard, Reports).
4. Separate subscription concerns: keep billing/plan usage, move identity/KYC/business profile out.
5. Consolidate business profile authority into onboarding + workspace profile/compliance.
6. Standardize labels and route names (“Workspace Dashboard”, “Reports”, “Account Settings”).
7. Preserve lifecycle/financial authority while cleaning IA.
8. Re-measure click counts and scorecard after IA cleanup.

## 23) What must NOT change

- Backend-authoritative lifecycle enforcement (invoice finalize, PO issue, controlled payments).
- Accounting/period/ledger/journal/year-end authority model.
- Role-based workspace write restrictions and business workspace scoping.
- Idempotent/controlled financial actions and reconciliation safety intent.
- Existing unrelated Android/mobile/release worktree changes.

## 24) Evidence appendix

### Recovery baseline

- `git rev-parse HEAD` observed: `f02f4a8e08f75d1181040c7b94358a0dbe20aaf4`
- This continuation created only:
  - `docs/web-workflow-information-architecture-audit.md`

### Route and flow evidence

- Post-auth destination to Access: `apps/web/auth.js` (postAuthDestination + redirect).
- Access duplicates AI/Invoice/PO/Dashboard/Reports tabs: `apps/web/access.html`.
- Access tab router and data loading: `apps/web/access.js`.
- Workspace canonical multi-domain nav and sections: `apps/web/dashboard.html`.
- Workspace hash routing and report-detail normalization: `apps/web/dashboard.js`.
- Onboarding exists but not default post-auth: `apps/web/onboarding.html`, `apps/web/onboarding.js`.
- Subscription page mixing billing + KYC/business identity: `apps/web/subscription.html`, `apps/web/subscription.js`.
- Invoice/PO lifecycle actions (`finalize` / `issue`) and read-only lock after issuance/finalization: `apps/web/invoice.html`, `apps/web/invoice.js`, `apps/api/src/client.js`.
- Business switching and `workspaceOwnerUserId` propagation: `apps/web/dashboard.js`, `apps/web/invoice.js`, `apps/api/src/client.js`.

### Lifecycle / financial safety evidence highlights

- Invoice finalize endpoint: `/invoices/{id}/finalize`.
- Purchase order issue endpoint: `/purchase-orders/{id}/issue`.
- Payment recording constraints and balance checks in dashboard/invoice payment handlers.
- Accounting authority APIs (summary/accounts/journals/periods/year-end close) exposed in client API layer.

---

## Completion metadata

- **Current commit:** `f02f4a8e08f75d1181040c7b94358a0dbe20aaf4`
- **Exact file changed:** `docs/web-workflow-information-architecture-audit.md`
- **Source code changed:** No
- **Database migrations changed:** No
- **Largest usability defect:** Duplicate operational surfaces (`access.html` vs Workspace) causing dashboard/route ambiguity.
- **Highest-risk architectural defect:** Split operational authority undermining one-canonical-dashboard behavior.
- **Final verdict:** **NOT READY**
