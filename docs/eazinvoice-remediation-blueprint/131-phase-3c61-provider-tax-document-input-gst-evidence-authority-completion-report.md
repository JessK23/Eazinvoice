# PHASE: 3.61 — ACCT-PROVIDER-TAX-01

## BASELINE

Implementation began against `HEAD == origin/main == e13174f323bc01dc1da9008b87b4a59b271a85ea`.

## FILES CHANGED

- `apps/api/src/store.js`
- `apps/api/src/index.js`
- `apps/api/src/postgres-state.js`
- `tests/provider-tax-document.test.js`
- this completion report

## TAX-DOCUMENT MODEL

Added a separate tenant-scoped `providerTaxDocuments` evidence collection rather than overloading ProviderSettlement. This supports independent lifecycle/versioning and tax documents spanning one or more settlements without duplicating settlement economics.

## IMMUTABLE IDENTITY

Identity is business + provider + merchant account + provider tax-document ID + document version. A replay with the same identity and fingerprint is idempotent; changed economics or linkage under that identity fails closed. Mutable display names are not used.

## PROVENANCE

The record preserves source type, source reference/record ID, payload fingerprint, and received timestamp. Raw payload fields are not exposed through the view. Missing authoritative provenance produces manual review.

## GST COMPONENT AUTHORITY

Only explicit taxable-fee, CGST, SGST, IGST, total-tax, document-total, and currency evidence is accepted. Minor-unit arithmetic validates component totals and document totals. Aggregate tax, inferred splits, mixed jurisdiction components, missing provider tax identity, and fee coverage beyond linked settlements remain blocked/manual-review.

## JURISDICTION AUTHORITY

Country, state/place of supply, and source reference are preserved from trusted evidence. Tax-bearing evidence without authoritative jurisdiction is manual-review. No geography is inferred from business or provider addresses.

## PROVIDER TAX IDENTITY

Provider tax identity/GSTIN is preserved generically. Tax-bearing trusted evidence requires it; the implementation does not hard-code Razorpay tax contracts.

## SETTLEMENT/FEE LINKAGE

Evidence links to one or more same-business, same-provider, same-merchant, same-currency ProviderSettlements with explicit fee amounts bounded by each settlement’s provider fee. Invalid, duplicate, cross-tenant, cross-merchant, or mismatched-currency links fail closed.

## DUPLICATE PREVENTION

Immutable document identity and fingerprint provide replay safety. The evidence record also preserves component and settlement linkage identity for the future accounting action; this package creates no journal or posting identity.

## CORRECTION/CREDIT-NOTE LINEAGE

Replacement/correction evidence uses `supersedesId` and `correctionType`. Prior evidence remains immutable; a replacement is a new record. Invalid, cross-tenant, cross-provider, or cross-merchant lineage fails closed. GST reversal journals are deferred.

## DATE/PERIOD EVIDENCE

Document date, tax period, currency, and received timestamp are preserved. This package does not select the Input GST recognition period.

## LIFECYCLE

Trusted complete evidence is `verified`; incomplete evidence is `manual_review`; complete authenticated user submission remains `pending` because user input cannot establish provider authenticity. Every record remains `accountingReadiness: blocked` and `accountingStatus: not_posted`.

## MANUAL REVIEW

Missing identity, provenance, explicit components, jurisdiction, provider tax identity, settlement linkage, fee coverage, or consistent arithmetic is retained as a manual-review reason rather than inferred or posted.

## PERSISTENCE

`providerTaxDocuments` participates in the existing state document, counters, generic indexed PostgreSQL record authority, reconstruction, and persistence adapter path. No parallel persistence authority or normalized ledger table was introduced.

## TENANT ISOLATION

Business, provider, merchant, settlement, and correction-lineage checks are enforced at creation and query boundaries. User-facing APIs derive business scope from workspace access.

## SECURITY/TRUST BOUNDARY

Authenticated user submission is submission-only and cannot force `verified`, `accounting_ready`, `posted`, tax authority, account IDs, or recognition period. Verified evidence is available only through the server/system trusted-evidence path, which requires an explicit trusted-evidence flag and still performs all validation.

## LEGACY COMPATIBILITY

Existing ProviderSettlement records are unchanged. No tax document is manufactured for legacy settlements, and existing aggregate fee tax is not converted into explicit components. Legacy GST-bearing settlements remain blocked by the existing settlement authority.

## ACCOUNTING INERTNESS

Focused tests prove creation produces no new journal, financial event, Input GST balance, 1110/5300 movement, bank movement, A/R movement, Customer Advance movement, or settlement accounting-status promotion.

## BANKING INERTNESS

No statement, statement line, reconciliation match, or Banking status is created or changed.

## PAY-SETTLE-01B COMPATIBILITY

Accepted zero-tax settlement posting remains unchanged. Tax evidence does not authorize settlement posting or alter the simple settlement journal. GST-bearing settlement accounting remains a future package.

## PURCHASE GST REUSE

The implementation reuses repository semantics rather than purchase records: canonical 2211/2212/2213 remain the future account targets, while purchase-side tax snapshots, place-of-supply classification, registers, and credit-note reporting remain separate authorities.

## TESTS

Focused provider-tax suite: **12 passed, 0 failed**. Coverage includes explicit CGST/SGST, IGST, zero tax, replay/conflict, aggregate-only rejection, component mismatch, missing provider identity/fee coverage, trust-boundary forgery, cross-tenant linkage, correction lineage, provider/merchant linkage, reconstruction, and legacy compatibility.

## REGRESSIONS

Relevant accounting, settlement, payment, allocation, PAY-ATOMIC, recovery, Banking, migration, reporting, and API regressions: **288 passed, 0 failed**.

## LINT

PASS — `npm run lint`.

## BUILD

PASS — `npm run build`.

## POSTGRESQL STATE VERIFICATION

PASS — `npm run db:verify-state`; `providerTaxDocuments` is present in the reconstructed state collection set.

## POSTGRESQL REPORT VERIFICATION

PASS — `npm run db:verify-reports`.

## DIFF CHECK

PASS — `git diff --check`; only expected Windows line-ending warnings were emitted for existing modified JavaScript/Android files.

## LIVE POSTGRESQL

LIVE POSTGRESQL VERIFICATION OUTSTANDING

## LIVE POSTGRESQL CONCURRENCY

LIVE POSTGRESQL CONCURRENCY VERIFICATION OUTSTANDING

## LIVE PROVIDER

LIVE RAZORPAY/PROVIDER VERIFICATION OUTSTANDING

## SCOPE LEAKAGE

No production scope leakage into settlement GST journals, Banking reconciliation, TDS, FX, adjustments, PAY-ATOMIC, Payment, Allocation, UI, Android, or provider HTTP mutations. Reports 121–130 and unrelated workspace artifacts were not modified.

## REMAINING BLOCKERS

The evidence foundation is intentionally blocked from accounting until a later package defines atomic Input GST recognition. Live PostgreSQL/concurrency and live provider verification remain operationally outstanding. Banking settlement linkage remains a later package.

## REPORT

Report 131 — Provider Tax-Document / Input GST Evidence Authority Completion Report.

## STAGING / COMMIT / PUSH

Not performed. The implementation remains unstaged, uncommitted, and unpushed pending independent 3C.62 final acceptance.

## FINAL VERDICT

**3C.61 IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT 3C.62 FINAL ACCEPTANCE**
