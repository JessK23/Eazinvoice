# EazInvoice — Web Target Architecture & Remediation Plan

## 1. Executive Summary

This document defines the approved target Web architecture and a dependency-ordered remediation plan based on the completed benchmark audit (`docs/web-workflow-information-architecture-audit.md`, score **2.53/5**, verdict **NOT READY**). This is **architecture only** and contains **no implementation**.

Core decision: make the Workspace Dashboard the single operational authority and re-scope `access.html` into a lean My Account surface. Preserve all financial/lifecycle backend authority, business isolation, and accounting controls while consolidating navigation and profile architecture.

## 2. Current Baseline — 2.53/5

- Baseline commit: `f02f4a8e08f75d1181040c7b94358a0dbe20aaf4`
- Prior benchmark score: **2.53/5**
- Prior benchmark verdict: **NOT READY**
- Largest usability defect: duplicated operational surfaces (`access.html` vs `dashboard.html`)
- Highest-risk architectural defect: split operational authority between Access and Workspace

## 3. Design Principles

1. **One authoritative operational Workspace** (Dashboard-first)
2. **Strict Account / Business / Workspace separation**
3. **Backend-authoritative financial truth** (never frontend accounting authority)
4. **Lifecycle integrity over UI convenience**
5. **Business isolation and workspace scoping everywhere**
6. **Entity-aware profile modeling** (not generic profile labels)
7. **Progressive migration with redirects and compatibility gates**
8. **Web + Mobile share one backend profile-completeness contract**

## 4. Target EazInvoice Architecture

### Top-level information architecture

- **Workspace**
  - Dashboard
  - AI Agent
  - Sales
  - Purchases
  - Accounting
  - Banking
  - Compliance
  - Reports
- **My Account**
  - Contextual Business / Entity Profile
  - Account Settings
  - Plan & Subscription
  - Team & Access (where role allows)
  - Go to Workspace

### Canonical intent

- Login → Workspace Dashboard → productive action
- Login → AI Agent → productive action
- Signup → account creation → profile completion gate (backend-authoritative) → Workspace Dashboard

## 5. Target User Journey

### Returning user

1. Auth success
2. Route to canonical Workspace Dashboard
3. Quick actions available immediately (invoice, PO/WO, AI, receivables/payables, reports)

### New/incomplete user

1. Signup complete
2. Session established
3. Backend returns profile completeness state
4. If incomplete: completion prompt + direct action
5. Workspace still accessible by policy, but reminders continue until required profile state complete

### Paid-plan readiness dependency

- Paid activation may require KYC readiness as a **separate** state from baseline profile completeness
- Subscription may reference readiness, but not own business profile truth

## 6. Account / Business / Workspace Separation

### Account (human user)

- name, email, mobile
- password/security/auth settings
- account-level preferences

### Business / Entity Profile (legal/operating entity)

- legal name, display name
- entity type
- country/state/address
- tax IDs (jurisdictional)
- logo
- compliance/KYC metadata
- future base/accounting currency authority (when currency foundation phase lands)

### Workspace (operations)

- all productive financial workflows
- all reports, AI operational surfaces, accounting and compliance operations

## 7. Target Navigation Structure

### Global primary nav (authenticated)

- Dashboard
- AI Agent
- Sales
- Purchases
- Accounting
- Banking
- Compliance
- Reports
- My Account

### Dashboard quick actions

- Create Invoice
- Create Quotation (if enabled by backend capability)
- Create PO/WO
- Record Payment
- Ask EazInvoice AI

### My Account quick actions

- Open Entity Profile
- Open Account Settings
- Open Subscription
- Open Team & Access (if permitted)
- Go to Workspace

## 8. Canonical Dashboard Decision

- **Recommended canonical Dashboard route:** `/apps/web/dashboard.html`
- **Route policy:** every Dashboard action/link must resolve to `/apps/web/dashboard.html` (Workspace home), while Reports remains a separate navigation state.
- **No alternate Dashboard authority** under `access.html`

## 9. `access.html` Disposition

**Decision:** keep route but re-scope to **My Account shell only**.

### Disposition by current access function

- AI Agent tab → **REDIRECT** to `dashboard.html#ai-agent`
- Generate Invoice tab → **REDIRECT** to `dashboard.html#invoices`
- Generate PO tab → **REDIRECT** to `dashboard.html#purchase-orders`
- Dashboard tab → **RENAME + REDIRECT** to Workspace Dashboard
- Reports tab → **REDIRECT** to `dashboard.html#reports`
- Update Profile pane (account fields) → **KEEP** under Account Settings
- Company profile pane → **MOVE** to Business Profile authority area
- Tier features summary → **MERGE** into Subscription summary
- Admin pane → **KEEP** only if role-based, else expose through admin route links
- Repeated Mobile Download Center block → **MOVE** to Help/Downloads context

## 10. Entity-Aware Profile Architecture

### Labeling contract

Profile title should be derived from authoritative `entityType` from backend business profile model:

- `individual` → Individual Profile
- `freelancer` → Freelancer Profile
- `proprietorship` → Proprietorship Profile
- `company` → Company Profile
- `llp` → LLP Profile
- `partnership` → Partnership Profile
- other supported values → `<EntityType> Profile` with backend-controlled display map

### Authority

- Backend defines supported entity types and canonical mapping
- Web and Mobile consume same profile metadata and completion requirements

## 11. Account Settings Architecture

### Keep in Account Settings

- user name
- login email
- mobile
- password change
- security/session settings (current/future)

### Must not live here

- legal business registration identity fields
- GST/PAN/tax registration for business entity
- compliance/KYC document management

## 12. Subscription Architecture

### Canonical subscription scope

- current plan
- billing cycle and renewal
- usage/limits
- upgrade/downgrade/cancel/renew
- subscription history and payment references

### Relationship with profile/KYC

- subscription can **reference** readiness state (e.g., “Business Profile complete”, “KYC submitted”, “KYC approved”)
- subscription should not be the authoritative editor/store for business identity

### Current restructuring decisions

- Plan cards and history → **KEEP**
- KYC/business identity form in subscription → **MOVE** to Business Profile/Compliance profile flow
- Subscription section duplicated in dashboard and dedicated route → **MERGE** by selecting one canonical subscription page and using summary cards elsewhere

## 13. Signup & Profile Completion Architecture

### Required backend states

Define separate backend-authoritative states:

1. `profileCompleteness` (required business/entity profile fields)
2. `kycCompleteness` (document set submitted as required)
3. `kycVerification` (review status: pending/approved/rejected)

### Policy

- Signup completion does not imply business profile completeness
- Profile completion reminder/popup appears on Web until required profile fields complete
- Mobile V6 uses the same backend state and prompts
- KYC verification should not automatically block baseline product use unless policy explicitly requires it

## 14. Workspace Architecture

### Operational modules under Workspace

- Dashboard (`/apps/web/dashboard.html` Workspace home state)
- AI Agent (`#ai-agent`)
- Sales (`#invoices`, customers, credits)
- Purchases (`#purchase-orders`, vendors, payables)
- Accounting (`#accounting`, journals, periods, close)
- Compliance (`#report-compliance`, workspace compliance profile)
- Reports (`#report-*` detail and summary)

### UX intent

- eliminate dead-end pseudo-operational screens
- bias to direct action from Dashboard and left nav

## 15. Sales Architecture

### Canonical operations

- Customers
- Quotations (existing/future gated)
- Invoices
- Payments
- Credits/Credit Notes

### Canonical routes

- dashboard sales entry → `dashboard.html#invoices`, `#customers`, `#report-invoices`
- document execution → `invoice.html`

### Access duplicates

- All invoice/report launchers in Access → redirect to Workspace targets

## 16. Purchase Architecture

### Canonical operations

- Vendors
- PO/WO
- Bills/expenses
- Vendor payments
- Vendor credits

### Canonical routes

- dashboard purchase entry → `dashboard.html#purchase-orders`, `#vendors`, `#report-expenses`
- document execution → `invoice.html?type=po`

### Duplication resolution

- Access PO tab and pseudo summaries → redirect/remove after compatibility window

## 17. AI Agent Architecture

### Placement

- One-click access from Workspace nav and Dashboard quick action
- Canonical route: `dashboard.html#ai-agent`

### Authority model

- AI uses backend-authoritative APIs only
- AI may draft, query, summarize, and suggest based on existing authority
- AI cannot bypass lifecycle/finalization/business isolation/accounting rules

### Access impact

- Access AI surface becomes redirect/launch shortcut only during migration; then removed from account shell

## 18. Reports Architecture

### Canonical reporting model

- reports summary route is `/apps/web/dashboard.html#reports` (separate from Dashboard home)
- detailed report views in `#report-*` under one routing contract

### Cleanup

- remove static report mirrors from Access
- keep all analytical truth API-backed

## 19. Mobile Download Center Disposition

### Recommended placement

- Dedicated `mobile-app.html` route
- Link from Help/Manuals and optionally footer

### De-emphasis

- Remove repetitive mobile download blocks from account/operational panes (Profile, Invoice, PO, AI, Reports contexts)

## 20. Active Business / Business Switching Architecture

### Authority

- Active business/workspace selector backed by `workspaceOwnerUserId`/workspace identity
- Selector state must consistently scope all modules:
  - profile
  - customers/vendors
  - invoices/quotations/purchases
  - accounting/banking/compliance
  - reports
  - AI context

### Placement

- Global workspace switcher in authenticated header/Workspace shell
- Optional contextual mirrors in Workspace sections, but same underlying state

### Isolation

- No cross-business leakage in reads, writes, AI context, or reports

## 21. Multi-Currency / Business Profile Dependencies

Based on `docs/multi-currency-business-profile-readiness-audit.md`:

- Current state is partial and INR-leaning across reporting/accounting semantics
- Remediation in this plan must not block currency foundation

### Required architecture alignment

- Business profile should eventually provide authoritative jurisdiction + base currency anchors
- Keep document-currency UI separate from future accounting-grade multi-currency ledger model
- Do not encode frontend-only currency truth in route cleanup phases

## 22. Financial Authority Protected Boundaries

Must remain backend-authoritative:

- document numbering
- finalization/issuance state transitions
- posting/accounting events
- balances and payment effects
- tax and compliance calculations
- reversals/credits/adjustments
- reporting truth
- accounting periods and close controls
- workspace/business authorization boundaries

## 23. Document Lifecycle Protected Boundaries

Preserve lifecycle contract:

- Draft
- Finalize / Issue
- Authoritative financial document
- no material editing post-finalization
- controlled Void / Cancel / Credit / Reversal only

### Migration safeguard

Any UX cleanup that changes document routes must preserve API usage paths for finalize/issue/payment/reversal semantics exactly.

## 24. Current → Target Route Migration Matrix

| Current Route | Current Purpose | Target Purpose | Target Canonical Route | Disposition | Dependencies | Risk | Regression Tests | Redirect Needed |
|---|---|---|---|---|---|---|---|---|
| `/apps/web/auth.html` post-login to `access.html` | auth success landing | workspace-first landing | `/apps/web/dashboard.html` (or onboarding gate) | MOVE | profile completeness contract | medium | auth redirect flow, role flow | yes |
| `/apps/web/access.html?tab=dashboard` | pseudo dashboard | workspace dashboard home | `/apps/web/dashboard.html` | REDIRECT | nav cleanup | low | dashboard link audit | yes |
| `/apps/web/access.html?tab=reports` | static report pane | canonical reports | `/apps/web/dashboard.html#reports` | REDIRECT | route mapping | low | report navigation smoke | yes |
| `/apps/web/access.html?tab=ai` | ai launcher | canonical AI | `/apps/web/dashboard.html#ai-agent` | REDIRECT | ai nav cleanup | low | ai open path smoke | yes |
| `/apps/web/access.html?tab=invoice` | invoice launcher | sales dashboard | `/apps/web/dashboard.html#invoices` | REDIRECT | sales nav cleanup | low | invoice entry path | yes |
| `/apps/web/access.html?tab=po` | po launcher | purchases dashboard | `/apps/web/dashboard.html#purchase-orders` | REDIRECT | purchase nav cleanup | low | po entry path | yes |
| `/apps/web/access.html?tab=company` | company profile editor | business profile authority | `/apps/web/dashboard.html#business-profiles` or `#business-workspace` group | MOVE | profile contract | medium | profile edit/save + completeness state | transitional |
| `/apps/web/subscription.html` kyc form area | mixed kyc + subscription | subscription only | `/apps/web/subscription.html` | KEEP+MOVE | profile/kyc split | medium | subscription actions + readiness badges | no |
| `/apps/web/dashboard.html#subscription` | in-workspace subscription section | summary or redirect to canonical subscription page | `/apps/web/subscription.html` (recommended canonical) | MERGE | nav consistency | low | subscription navigation | maybe |

## 25. Current → Target Click-Path Analysis

| Task | Current Path | Current Clicks | Target Path | Target Clicks |
|---|---|---:|---|---:|
| Open Dashboard | login→access→dashboard reports link | 2 | login→dashboard direct | 1 |
| Open AI Agent | access ai tab → open ai workspace | 2 | dashboard sidebar/quick action | 1 |
| Create Invoice | access invoice tab → create invoice | 2 | dashboard quick action / sales nav | 1–2 |
| Create PO/WO | access po tab → create po | 2 | dashboard quick action / purchase nav | 1–2 |
| Create Quotation | not consistently surfaced | varies | dashboard sales quick action (if feature enabled) | 1–2 |
| Update Business Profile | access company tab | 2+ | my account business profile / workspace business profile | <=2 |
| Account Settings | access profile tab | 2+ | my account account settings | <=2 |
| Subscription/Plan | topnav subscription | 1 | my account/subscription direct | <=2 |

## 26. KEEP / MOVE / MERGE / RENAME / REMOVE / REDIRECT Matrix

| Surface / Function | Decision |
|---|---|
| `dashboard.html` operational shell | KEEP |
| `invoice.html` execution flow | KEEP |
| Access account profile/password | KEEP |
| Access company/business profile editing | MOVE |
| Access AI/Invoice/PO/Dashboard/Reports operational tabs | REDIRECT then REMOVE from account shell |
| Access “Dashboard” terminology | RENAME to Workspace / Go to Workspace |
| Subscription billing/actions/history | KEEP |
| Subscription business identity/KYC authoring | MOVE |
| Dashboard subscription module vs dedicated subscription page | MERGE |
| Repeated mobile download blocks in operational/account panes | MOVE/REMOVE |
| Legacy route aliases | REDIRECT |

## 27. Phased Implementation Plan

### Phase 1 — Navigation Authority

- **Objective:** establish canonical Workspace Dashboard routing and remove dashboard ambiguity.
- **Likely touchpoints:** auth post-login routing, topnav/links, access route redirects.
- **Dependencies:** none blocking financial modules.
- **Non-goals:** profile model changes, subscription data model changes.
- **Acceptance:** all Dashboard links resolve to canonical workspace dashboard; no financial behavior changes.
- **Tests:** auth redirect tests, nav route tests, back-button/legacy link tests.
- **Rollback:** route mapping toggles and redirect fallback.
- **Backend required:** no.
- **Mobile dependency:** low (benefits shared route semantics).

### Phase 2 — My Account Separation

- **Objective:** reshape Access into My Account-only IA.
- **Likely touchpoints:** access tabs, account settings view, account menu labels.
- **Dependencies:** Phase 1 route canonicalization.
- **Non-goals:** document lifecycle changes.
- **Acceptance:** no operational duplicate tabs remain in My Account.
- **Tests:** account field updates, password updates, navigation tests.
- **Rollback:** keep temporary redirects active.
- **Backend required:** no major new backend, only consumed contracts.
- **Mobile dependency:** medium (shared conceptual model).

### Phase 3 — Business Profile Authority & Onboarding

- **Objective:** define backend-authoritative completeness contracts and Web prompt behavior.
- **Likely touchpoints:** profile endpoints/contracts, onboarding gates, reminder UI.
- **Dependencies:** Phase 2 separation.
- **Non-goals:** multi-currency accounting implementation.
- **Acceptance:** required profile fields consistently drive completion prompts and route gating behavior.
- **Tests:** completeness state transitions, signup→completion path, fallback behavior.
- **Rollback:** feature-flag profile-completion prompts.
- **Backend required:** yes (explicit completeness contract).
- **Mobile dependency:** high (Mobile V6 should consume same contract).

### Phase 4 — Operational Surface Consolidation

- **Objective:** remove duplicated operational surfaces from Access; ensure Workspace is sole operational entry.
- **Likely touchpoints:** access operational panes, redirects, dashboard links.
- **Dependencies:** Phase 1–3.
- **Non-goals:** core accounting logic changes.
- **Acceptance:** invoice/PO/reports/AI launched through canonical Workspace routes.
- **Tests:** end-to-end route traversal and legacy URL redirects.
- **Rollback:** route aliases retained.
- **Backend required:** no (except contract consumption).
- **Mobile dependency:** medium.

### Phase 5 — Workspace UX Optimization

- **Objective:** reduce time-to-action and standardize quick actions and global business selector behavior.
- **Likely touchpoints:** dashboard quick actions, workspace nav, selector placement.
- **Dependencies:** Phase 4.
- **Non-goals:** financial engine modifications.
- **Acceptance:** click-budget targets achieved for core tasks.
- **Tests:** click-path tests, workspace switching scope tests.
- **Rollback:** retain previous nav map under feature flag.
- **Backend required:** no major, but may require minor endpoint harmonization.
- **Mobile dependency:** medium-high for shared selector semantics.

### Phase 6 — Base Currency Foundation Dependency (handoff phase)

- **Objective:** define handoff to separate currency implementation milestone.
- **Likely touchpoints:** profile data contracts and reporting assumptions only.
- **Dependencies:** Phase 3 profile authority.
- **Non-goals:** implementing accounting-grade multi-currency here.
- **Acceptance:** documented contracts do not block future currency foundation.
- **Tests:** contract compatibility checks.
- **Rollback:** not applicable (planning handoff).
- **Backend required:** future phase, not this one.
- **Mobile dependency:** high for future parity.

### Phase 7 — Web Regression / Benchmark Re-Test

- **Objective:** rerun benchmark and verify production threshold.
- **Dependencies:** completion of Phases 1–5.
- **Acceptance:** no category <3, average >=4.0 plus hard-block controls pass.
- **Tests:** full benchmark suite + financial/lifecycle guard tests.
- **Rollback:** phase-wise fallback to previous release candidate.

## 28. Phase Acceptance Criteria

- **Phase 1:** single dashboard route authority established.
- **Phase 2:** My Account free of operational duplicates.
- **Phase 3:** backend completeness contract live and consumed.
- **Phase 4:** legacy operational access routes redirect safely.
- **Phase 5:** click budget targets met.
- **Phase 6:** currency dependency handoff documented and approved.
- **Phase 7:** benchmark pass + hard-block controls pass.

## 29. Regression Test Strategy

### Route and nav

- post-auth routing
- dashboard canonical routing
- legacy access tab redirects

### Profile and onboarding

- required/optional field completeness transitions
- prompt behavior across session states

### Financial lifecycle safety

- draft/finalize/issue state transitions
- read-only protections post-finalization
- payment/credit/reversal constraints

### Workspace/business isolation

- workspace switching changes all scoped modules
- no cross-business data leakage

### Subscription

- upgrade/downgrade/cancel/renew actions
- readiness status display without profile-authority leakage

## 30. Mobile V6 Handoff

Mobile V6 should inherit (not reinvent):

- backend profile completeness contract
- business identity authority model
- active-business context contract
- document lifecycle semantics
- financial authority APIs
- AI authority boundaries

### Mobile start condition

Mobile V6 implementation should begin **after prerequisite gates**:

- Phase 3 completion contract available
- Phase 1 route authority finalized
- core profile/account/subscription semantics stabilized (Phase 2/3)

## 31. WordPress Deferred Handoff

### Current dependency classes

- auth/session and plan APIs
- invoice/customer/business record contracts
- subscription gating semantics

### Why defer

- Web IA and profile authority cleanup will stabilize contracts and semantics first
- plugin should align after Web + Mobile/backend authority contracts settle to avoid rework

### Scope now

- no plugin redesign in this task
- only document dependency awareness

## 32. Release Quality Gate

Release requires both:

1. **Numeric benchmark threshold**
   - no category below 3
   - overall average >= 4.0/5.0
2. **Hard-block integrity gate**
   - financial authority intact
   - lifecycle integrity intact
   - business isolation intact
   - auth/security boundaries intact
   - profile authority contract intact

Any hard-block failure blocks release regardless of score average.

## 33. Architectural Decision Records

### ADR-01: Canonical Dashboard

- **Decision:** use `/apps/web/dashboard.html` as canonical dashboard route.
- **Why:** Dashboard must mean Workspace home; Reports is a separate destination under the Workspace route model.
- **Evidence:** dashboard sections and route handling in `dashboard.html` / `dashboard.js`.
- **Alternative:** keep Access dashboard as lightweight default.
- **Rejected because:** duplicates authority and prolongs ambiguity.
- **Dependency:** Phase 1 route authority.
- **Risk if not addressed:** continued split navigation and user confusion.

### ADR-02: Fate of `access.html`

- **Decision:** keep as My Account shell only; remove operational duplication.
- **Why:** preserves account utility while eliminating split workspace authority.
- **Evidence:** access tabs duplicate AI/invoice/PO/reports/dashboard launchers.
- **Alternative:** delete access route entirely.
- **Rejected because:** abrupt removal could break account/profile continuity and links.
- **Dependency:** Phase 2 + redirects.
- **Risk if not addressed:** persistent dual-surface behavior.

### ADR-03: My Account architecture

- **Decision:** account-only concerns in Access/My Account; no operational modules.
- **Why:** clean concept boundary and faster intent resolution.
- **Evidence:** current mixed fields and routes across access/subscription/workspace.
- **Alternative:** keep mixed model with better labels.
- **Rejected because:** labels alone do not solve authority split.
- **Dependency:** Phase 2.
- **Risk if not addressed:** continued profile/ops confusion.

### ADR-04: Business Profile architecture

- **Decision:** business/entity profile authority under dedicated profile/compliance domain, not subscription.
- **Why:** legal entity truth should be independent from billing workflow.
- **Evidence:** current subscription KYC form overlaps with business profile/workspace compliance data.
- **Alternative:** keep profile in subscription because paid plans depend on KYC.
- **Rejected because:** coupling creates ownership ambiguity; readiness reference is sufficient.
- **Dependency:** Phase 3.
- **Risk if not addressed:** contradictory profile states.

### ADR-05: Subscription separation

- **Decision:** subscription page owns billing/plan/usage/history; references readiness states.
- **Why:** aligns with user expectations and reduces data model confusion.
- **Evidence:** existing rich subscription mechanics + mixed KYC form overload.
- **Alternative:** keep all KYC/profile in subscription.
- **Rejected because:** breaks account/business separation.
- **Dependency:** Phase 2/3.
- **Risk if not addressed:** billing/profile coupling risks.

### ADR-06: Profile completeness authority

- **Decision:** single backend contract for profile completeness, KYC completeness, KYC verification.
- **Why:** Web and Mobile must not diverge.
- **Evidence:** requirement explicitly mandates shared authority; current flows are fragmented.
- **Alternative:** separate Web and Mobile heuristics.
- **Rejected because:** inconsistent gating and user confusion.
- **Dependency:** Phase 3.
- **Risk if not addressed:** cross-platform mismatch.

### ADR-07: Operational consolidation (Invoice/PO/Reports)

- **Decision:** keep operational authority in Workspace + document routes; Access routes redirect.
- **Why:** operational truth already there and lifecycle integration is stronger.
- **Evidence:** dashboard/invoice scripts and lifecycle endpoints.
- **Alternative:** duplicate operational mini-views in Access.
- **Rejected because:** high drift and maintenance risk.
- **Dependency:** Phase 4.
- **Risk if not addressed:** regression-prone dual behavior.

### ADR-08: AI placement

- **Decision:** canonical AI route in Workspace (`#ai-agent`) with one-click entry.
- **Why:** AI is operational and should live with governed workflows.
- **Evidence:** AI controls and plan gating already integrated in dashboard workspace.
- **Alternative:** standalone AI in Access.
- **Rejected because:** duplicates operational surface.
- **Dependency:** Phase 4/5.
- **Risk if not addressed:** AI discoverability vs authority inconsistency.

### ADR-09: Mobile Download Center placement

- **Decision:** centralize in dedicated downloads/help context; remove repetitive blocks from operations/account panes.
- **Why:** reduce UI noise in critical workflows.
- **Evidence:** repeated mobile blocks in marketing/account contexts.
- **Alternative:** keep repeated blocks for promotion.
- **Rejected because:** workflow distraction.
- **Dependency:** Phase 2/4.
- **Risk if not addressed:** action friction and clutter.

### ADR-10: Active-business selector

- **Decision:** one authoritative workspace selector state applied globally.
- **Why:** prevents cross-business drift and ensures consistency.
- **Evidence:** existing `workspaceOwnerUserId` scoping across dashboard/invoice.
- **Alternative:** per-module selectors.
- **Rejected because:** divergence and leakage risk.
- **Dependency:** Phase 5.
- **Risk if not addressed:** wrong-business actions and reporting mismatch.

### ADR-11: Legacy route redirects

- **Decision:** retain compatibility through redirect map during migration.
- **Why:** protect bookmarked/embedded links and reduce release risk.
- **Evidence:** many current links point to access tab routes.
- **Alternative:** hard removal.
- **Rejected because:** high breakage risk.
- **Dependency:** Phase 1/4.
- **Risk if not addressed:** broken navigation and support load spike.

## 34. What Must Not Change

- accounting authority location (backend)
- document numbering authority
- posting/event ledger semantics
- finalization semantics and immutability expectations
- controlled reversal/credit/void/cancel rules
- GST/compliance data integrity
- RLS/business isolation controls
- transactional persistence guarantees
- accounting period and year-end controls
- financial reporting source-of-truth boundaries
- authentication/session/security boundaries

## 35. Risks / Dependencies

### Key dependencies

- backend completeness contract design and exposure
- route redirect map and compatibility handling
- UI copy and naming harmonization across nav surfaces
- subscription/profile split without data-loss regression

### Key risks

- accidental lifecycle regression during route consolidation
- hidden dependencies on `access.html` tabs in docs/manual links
- temporary user confusion during label transitions
- incomplete redirect matrix causing dead links

### Contradiction tracking

- `invoice.html` contains a large inline script implementing lifecycle behavior while `invoice.js` also exists with overlapping concerns. Migration planning must respect current runtime source-of-truth to avoid accidental behavior drift.

## 36. Recommended First Implementation Task

### Smallest safe first milestone

**Milestone:** Phase 1 slice — canonical dashboard authority + safe redirects for Access dashboard/report/AI launch routes.

### Why this first

- materially reduces architecture ambiguity immediately
- low blast-radius (mostly route/nav behavior)
- avoids financial-engine modifications
- preserves backward compatibility via redirects
- independently testable and reviewable

### Scope outline (for later approval)

- set post-login non-admin route to canonical workspace dashboard
- standardize all “Dashboard” nav links to canonical route
- add redirect handling for:
  - `access.html?tab=dashboard`
  - `access.html?tab=reports`
  - `access.html?tab=ai`
- keep Access account/profile surfaces unchanged in this first milestone
- do not modify invoice/PO/accounting APIs

### Acceptance tests

- auth success lands on canonical dashboard
- all dashboard links converge to canonical route
- legacy access tab links still work via redirect
- no regressions in finalize/issue/payment/lifecycle flows

## 37. Evidence Appendix

Primary evidence source:

- `docs/web-workflow-information-architecture-audit.md`

Dependency evidence:

- `docs/multi-currency-business-profile-readiness-audit.md`

Repository verification surfaces consulted:

- `apps/web/auth.html`, `apps/web/auth.js`
- `apps/web/access.html`, `apps/web/access.js`
- `apps/web/dashboard.html`, `apps/web/dashboard.js`
- `apps/web/invoice.html`, `apps/web/invoice.js`
- `apps/web/onboarding.html`, `apps/web/onboarding.js`
- `apps/web/subscription.html`, `apps/web/subscription.js`
- `apps/web/common.js`
- `apps/api/src/client.js`

No contradiction was found that invalidates the prior audit conclusions; one implementation-structure caveat was documented (inline vs module overlap in invoice surface runtime behavior).

---

### Final architecture verdict

**TARGET ARCHITECTURE READY FOR REVIEW**

