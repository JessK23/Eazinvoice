# PHASE

3C.61B — ACCT-PROVIDER-TAX-01B Provider Tax Multi-Settlement Allocation Conservation Correction

# BASELINE

`e13174f323bc01dc1da9008b87b4a59b271a85ea` (`HEAD == origin/main` before this uncommitted package).

# ROOT CAUSE

Provider tax evidence accepted multi-settlement links without proving that each tax component's per-settlement allocations summed exactly to the authoritative component total. Aggregate tax could therefore appear correct while CGST, SGST, or IGST was under- or over-allocated.

# FILES CHANGED

- `apps/api/src/store.js`
- `tests/provider-tax-document.test.js`
- This report

# CONSERVATION AUTHORITY

Conservation is enforced server-side while deriving provider-tax component claims. Caller-supplied status or verification fields cannot authorize an allocation.

# MINOR-UNIT ARITHMETIC

Component amounts are normalized and compared in minor units using the repository's existing two-decimal convention. There is no tolerance: the allocated minor-unit total must equal the document component total exactly.

# CGST CONSERVATION

For multi-settlement evidence, explicit per-link CGST allocations are required and their sum must equal the document CGST total. Under- and over-allocation become non-authoritative manual review.

# SGST CONSERVATION

SGST is independently accumulated and compared with its own document total. Matching aggregate tax cannot compensate for an SGST mismatch.

# IGST CONSERVATION

IGST is independently accumulated and compared with its own document total. Exact multi-settlement IGST conservation is covered by focused tests.

# UNDER-ALLOCATION

An allocation total below the authoritative component total produces `component_allocation_total_mismatch` and cannot become an authoritative claim.

# OVER-ALLOCATION

An allocation total above the authoritative component total produces the same fail-closed mismatch and cannot become an authoritative claim.

# CROSS-COMPONENT CONSISTENCY

CGST, SGST, and IGST are validated independently. Aggregate tax equality cannot hide a component-level mismatch.

# ZERO/ABSENT COMPONENTS

Positive allocation to a zero or absent component produces `allocation_for_absent_component`. Absent components cannot receive silently inferred value.

# DUPLICATE SETTLEMENT ALLOCATION

Existing settlement-link normalization continues to reject duplicate settlement identifiers before claim derivation.

# SETTLEMENT IDENTITY

Existing business, provider, merchant, and currency settlement-link identity validation remains in force.

# MULTI-SETTLEMENT AUTHORITY

Every nonzero multi-settlement component requires explicit `componentAmounts`. Single-settlement legacy evidence retains its established document-total behavior.

# COMPONENT ECONOMIC IDENTITY

The 3C.61A economic component-claim identity remains unchanged. It is independent of document ID and provenance, so this correction does not weaken duplicate-economic-claim protection.

# CORRECTION LINEAGE

The single-authoritative-successor correction-lineage rule remains unchanged. Multiple successors remain non-authoritative/manual review.

# CREDIT-NOTE SAFETY

Correction and credit-note evidence remains subject to the same component conservation and lineage checks. This package adds no reversal or journal behavior.

# TRUST BOUNDARY

The result is derived from persisted provider-tax evidence and validated links. Callers cannot force `verified`, authoritative, or accounting-ready outcomes by supplying status fields.

# PERSISTENCE/RECONSTRUCTION

The normalized component-allocation fields are retained in the existing `providerTaxDocuments` authority and remain covered by the existing persistence/reconstruction path. No second persistence authority was introduced.

# CONCURRENCY

The correction uses the existing authoritative state-mutation boundary. Live cross-process PostgreSQL concurrency remains an environmental verification item, not a claim of completion in this report.

# ACCOUNTING INERTNESS

No journal, ledger, Payment, Allocation, or settlement-accounting effect is introduced. `evidence_verified` remains distinct from accounting permission.

# BANKING INERTNESS

No Banking or reconciliation mutation is introduced.

# PAY-SETTLE-01B COMPATIBILITY

The narrow zero-tax settlement class remains unchanged. Tax evidence remains a prerequisite for any future tax-bearing settlement extension.

# FOCUSED TESTS

`tests/provider-tax-document.test.js`: **17 passed, 0 failed**.

Coverage includes exact CGST/SGST/IGST conservation, under-allocation, over-allocation, aggregate/component mismatch, absent components, and duplicate settlement rows.

# REGRESSIONS

Relevant serial regression suite: **293 passed, 0 failed**.

# LINT

`npm run lint`: **PASS**.

# BUILD

`npm run build`: **PASS**.

# POSTGRESQL STATE VERIFICATION

`npm run db:verify-state`: **PASS**.

# POSTGRESQL REPORT VERIFICATION

`npm run db:verify-reports`: **PASS**.

# DIFF CHECK

`git diff --check`: **PASS**. Existing Windows line-ending warnings were non-fatal and unrelated to the approved implementation boundary.

# LIVE POSTGRESQL

**LIVE POSTGRESQL VERIFICATION OUTSTANDING**.

# LIVE POSTGRESQL CONCURRENCY

**LIVE POSTGRESQL CONCURRENCY VERIFICATION OUTSTANDING**.

# LIVE PROVIDER

**LIVE RAZORPAY/PROVIDER VERIFICATION OUTSTANDING**.

# REPORT 134 BLOCKER

**CLOSED STRUCTURALLY.** Authoritative claim derivation now requires exact per-component conservation for multi-settlement evidence and fails closed on mismatch.

# SCOPE LEAKAGE

No settlement journal, Input GST posting, Banking reconciliation, PaymentRequest, PAY-ATOMIC, or provider integration work was added.

# REPORT

This is Report 135 for 3C.61B. Reports 130–134 were not modified.

# STAGING / COMMIT / PUSH

No staging, commit, or push was performed. The package remains available for the planned combined independent acceptance of 3C.61 + 3C.61A + 3C.61B.

# FINAL VERDICT

**3C.61B IMPLEMENTATION COMPLETE — READY FOR COMBINED INDEPENDENT ACCEPTANCE OF 3C.61 + 3C.61A + 3C.61B**
