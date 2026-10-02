# EAZINVOICE PHASE 3C.4 — BASE-03 COMPLETION REPORT

## Baseline

Branch `main`; HEAD and `origin/main` were both `4d1dbabf2c8595bbf7dda6c932bd9c44d2f49b8c`. AUTH-01, AUTH-02 and AUTH-03 were present. The pre-existing `android/app/build.gradle` modification and unrelated untracked artifacts were preserved.

## Package

`3C-BASE-03 — Shared action/idempotency contracts` establishes a UI-neutral semantic action catalog around existing authorities. It does not reorganize Web/Mobile, build Expense/Quotation/Vendor Bill, redesign accounting, or create a workflow engine.

## Architecture Reviewed

The action contract follows:

```text
user action -> semantic action -> business intent -> authority
-> existing service/API -> result -> success/failure
-> terminal state or explicit handoff
```

Semantic destinations are used instead of Web URLs or Mobile routes.

## Current Action Inventory

Production entry points include vendor/customer creation, invoice draft/update/finalize/archive/restore, purchase order/work order draft/issue, invoice payments, KYC document upload, subscription/payment actions, accounting and banking operations. Existing authorities remain in `server.js`, `index.js`, `store.js`, accounting services, payment services, DocumentService and KYC services.

Expense and Quotation remain planned/unavailable because no dedicated executable workflow is represented. Vendor Bill is different: the existing backend capability is represented as implemented through `POST /vendor-bills`, while the dedicated target surface/workflow remediation remains future work. No missing workflow was implemented.

## Conflicts Discovered

The repository already has action implementations and several idempotency mechanisms, but no shared UI-neutral contract stating intent, authority, terminal state, return destination and handoff behavior. That ambiguity is what later surface packages must eliminate. BASE-03 records the contract without changing current routing.

## Implementation

Added `apps/api/src/action-contract.js`, a deterministic catalog and lookup API. It has no database, filesystem, network, environment mutation, routing, or business-operation side effects.

## Shared Action Contract

Each governed entry records action ID, status, action type, domain, intent, authority, input class, entry point, side-effect class, lifecycle transition, success/failure outcome, semantic destinations, terminal status, retry policy, idempotency policy, handoff policy and business-scope requirement.

## Action Families

The catalog covers master-data creation, drafts, draft updates, finalization, issue, archive/restore, payment and KYC upload. Expense and Quotation remain explicitly planned/unavailable. Vendor Bill represents the existing backend capability and separately marks its dedicated target surface as pending.

## Vendor Create Contract

`vendor.create` means vendor master-data creation only. It is terminal after success, returns to `vendor.list-or-detail`, requires business scope, has no automatic handoff, and does not create an invoice, purchase order or expense.

## Customer Create Contract

`customer.create` means customer master-data creation only. It is terminal after success, returns to `customer.list-or-detail`, and has no automatic invoice handoff.

## Invoice Lifecycle Contract

Invoice create draft, update draft, finalize, archive and restore are separate semantic actions. Current finalization is `draft -> issued` and assigns the authoritative number. Archive and restore are status-preserving archive-metadata operations, not invoice-status transitions. No invoice route or lifecycle implementation was changed.

## Purchase Lifecycle Contract

Purchase order/work order draft creation and issue are separate actions. Issue remains a purchase lifecycle operation and does not implicitly create an invoice, expense or vendor bill.

## Idempotency Contract

The catalog documents existing mechanisms rather than creating a second store: resource keys for invoice/PO lifecycle actions and existing DocumentService/resource protections for KYC upload. The current manual invoice-payment route does not propagate a request key, provider key, or gateway payment identity into the payment store, so it is not described as request/provider-key idempotent. Vendor/customer creation is classified as non-idempotent because the current implementation does not provide a creation key; BASE-03 does not invent one.

## Retry Contract

Reads are outside this mutation catalog. State-guarded repeated lifecycle operations are distinguished from request-key idempotency. Invoice payment is unsafe to retry through the current manual route because no request/provider identity is propagated. Vendor/customer creation is also marked unsafe-retry. No automatic retry loops were added.

## Success / Failure Contract

Success identifies the affected business resource and semantic destination. Failure remains in the originating action context and is classified with existing validation, authorization, entitlement, conflict, business-rule, storage, persistence or unavailable categories where applicable.

## Terminal / Handoff Contract

Vendor and Customer creation are terminal. Handoffs are not automatic. Future quotation conversion, vendor bill payment, expense payment and invoice payment remain explicit user actions. No missing handoff workflow was implemented.

## Return Destination Contract

Destinations are UI-neutral values such as `vendor.list-or-detail`, `customer.list-or-detail`, `invoice.detail` and `purchaseOrder.detail`. No Web URL or Mobile route was introduced.

## Current vs Planned Actions

Implemented actions have production entry points. Expense and Quotation remain `planned` and unavailable. Vendor Bill has an existing backend capability and is represented as implemented at `POST /vendor-bills`; its dedicated target surface/workflow exposure remains pending. This distinguishes current backend capability from future surface remediation.

## Authority Preservation

Existing vendor/customer, invoice, purchase, payment, accounting, KYC, DocumentService, reporting, banking, entitlement and storage authorities remain authoritative. The catalog is not an API router, persistence router, reporting router, accounting router, entitlement engine or workflow engine.

## Tenant / Business Isolation

Mutation contracts require business scope. Existing server workspace and business authorization remains responsible for enforcement. No client-controlled bypass or cross-business lookup was introduced.

## Compatibility

Current API routes and service behavior remain unchanged. The catalog is additive planning/runtime metadata for later surface packages.

## Focused Tests

`tests/action-contract.test.js` proves action uniqueness, Vendor/Customer terminal semantics, current invoice `draft -> issued` finalization, status-preserving archive/restore metadata semantics, manual payment non-idempotency claims, the distinction between state-guarded retry and request-key idempotency, existing Vendor Bill backend capability with pending target surface, planned Expense/Quotation availability, semantic destinations, business scope and side-effect/secret safety. These are contract-level checks; production evidence for route-specific behavior is recorded above and was independently rechecked during surgical correction.

## Authority Regression

AUTH-01, AUTH-02 and AUTH-03 tests remain required regression gates. BASE-03 does not alter those authority modules.

## Business Regression

Applicable API/accounting, invoice, purchase, payment, KYC, document, banking and tenant-isolation tests were run. Existing external/runtime limitations are recorded separately.

## Build / Lint / Mobile

Build: PASS. Lint: PASS. Mobile check: PASS (8/8). Mobile behavior was not changed.

## Environmental Limitations

The standard `npm test` command attempted all 23 test files but each worker failed before assertions with Windows Node test-worker `spawn EPERM`. PostgreSQL schema verification is unavailable because `psql.exe` is not installed. These do not change BASE-03 behavior or justify production workarounds.

## Files Changed

- `apps/api/src/action-contract.js`
- `tests/action-contract.test.js`
- `docs/eazinvoice-remediation-blueprint/36-phase-3c4-completion-report.md`

No other file was changed by BASE-03.

## Git State

No files were staged, committed or pushed. `git diff --check` passed. `android/app/build.gradle` remains outside BASE-03.

## Validation Results

- Focused BASE-03/AUTH-01/AUTH-02/AUTH-03 suite: 31/31 passed.
- API/accounting/business regression: 170/170 passed.
- `npm run build`: PASS.
- `npm run lint`: PASS.
- `npm run mobile:check`: PASS (8/8).
- `npm run db:verify-reports`: PASS.
- `npm run db:verify-schema`: UNAVAILABLE — `psql.exe` missing.
- `npm test`: UNAVAILABLE — Windows `spawn EPERM` before assertions.
- `git diff --check`: PASS.

## Future Packages Unblocked

BASE-03 provides the shared semantic foundation for Web navigation ownership, Customer/Vendor termination, Sales/Purchases surface correction, Vendor Bills, Expense, Quotation, Banking, Mobile parity and Eazy parity. Those packages were not implemented.

## Acceptance Checklist

1. YES — BASE-03 is the only implementation package.
2. YES — one deterministic semantic action model exists.
3. YES — importing the module is side-effect-free.
4. YES — Vendor Create is terminal and has no automatic financial handoff.
5. YES — Customer Create is terminal and has no automatic invoice handoff.
6. YES — draft, finalize and issue remain distinct.
7. YES — existing idempotency mechanisms are described without a second store.
8. YES — Expense and Quotation remain planned/unavailable; Vendor Bill backend capability is represented as implemented with its dedicated target surface pending.
9. YES — business scope is required for governed mutations.
10. YES — existing accounting, KYC, document, payment, reporting and storage authorities are preserved.
11. YES — no Web, Mobile, Eazy, migration, dependency or Android changes were made.
12. YES — focused BASE-03 and authority regressions pass where executable.
13. YES — the proposed boundary is atomic.

## Proposed Commit Boundary

- `apps/api/src/action-contract.js`
- `tests/action-contract.test.js`
- `docs/eazinvoice-remediation-blueprint/36-phase-3c4-completion-report.md`

Recommended commit message:

```text
feat(actions): define shared action and idempotency contracts
```

## Final Verdict

The independent acceptance gate identified descriptive mismatches without identifying a production-code defect. This surgical correction updates only the contract, focused tests and completion report; server/store/business behavior remains unchanged.

**PHASE 3C.4 SURGICAL CORRECTION — READY FOR FINAL ACCEPTANCE**
