# PHASE

3C.64 — ACCT-PROVIDER-TAX-02 / PAY-SETTLE-01C Verified Provider Input GST Settlement Accounting Authority

# BASELINE

`HEAD == origin/main == 8452820c2c6417ff91420a2bb09d2d5d0a269f79` at implementation start.

# CHANGED FILES

Production:

- `apps/api/src/store.js`
- `apps/api/src/accounting-service.js`

Tests:

- `tests/provider-settlement-accounting.test.js`
- `tests/provider-tax-document.test.js`

Documentation:

- `docs/eazinvoice-remediation-blueprint/140-phase-3c64-corrected-provider-input-gst-settlement-accounting-completion-report.md`

No migration, provider HTTP integration, UI, Android, Banking, or unrelated file was changed.

# FEE BASIS

The implementation uses the corrected Report 139 contract:

```text
netAmount = grossAmount - feeAmount - feeTaxAmount + adjustmentAmount
```

`feeAmount` remains the tax-exclusive provider-fee expense. `feeTaxAmount` remains the separate verified GST deduction. GST is not derived from or subtracted twice from `feeAmount`.

The initial GST-bearing class permits only `adjustmentAmount = 0`, with withholding and unsupported adjustments still blocked.

# TAXABLE-FEE AUTHORITY

Provider tax settlement links now preserve an explicit `taxableFeeAmount` when supplied. Single-settlement documents retain compatibility by using the authoritative document taxable-fee amount for the single linked settlement. Multi-settlement documents require an explicit taxable-fee allocation on every link and exact minor-unit conservation to the document taxable fee.

The posting authority requires the linked taxable fee to equal the settlement's `feeAmount`. It does not infer taxable fee from GST, apply proportional allocation, or accept aggregate-only evidence.

# ACCOUNTING ELIGIBILITY

`evidence_verified` is not sufficient to post. `resolveProviderSettlementTaxEligibility` is server-derived and requires:

- exactly one verified, tenant/provider/merchant/currency-matched tax document linked to the settlement;
- final correction lineage without an unresolved successor;
- exact taxable-fee equality to settlement `feeAmount`;
- exact component equality to settlement `feeTaxAmount`;
- conserved document tax totals;
- valid, unique component-economic identities.

Client-supplied `accounting_eligible`, `accountingStatus`, or tax-document claims are not trusted by the posting path.

# GST COMPONENT RECONCILIATION

Only explicit CGST, SGST, and IGST components are consumed. The implementation requires:

```text
CGST + SGST + IGST = ProviderSettlement.feeTaxAmount
document component total = ProviderSettlement.feeTaxAmount
```

Mixed CGST/SGST/IGST jurisdiction, missing tax evidence, duplicate identities, taxable-fee mismatch, and conflicting lineage fail closed.

# JOURNAL ECONOMICS

For a verified tax-exclusive settlement, the existing settlement transaction now posts one balanced journal:

```text
Dr Actual Bank                 netAmount
Dr 5300 Provider Fee Expense   feeAmount
Dr 2211 Input CGST             cgstAmount
Dr 2212 Input SGST             sgstAmount
Dr 2213 Input IGST             igstAmount
    Cr 1110 Provider Clearing          grossAmount
```

Zero-valued tax component lines are omitted. The canonical account roles and tenant-owned actual bank mapping are resolved by the existing accounting authority; no generic `5100` expense account or invented account ID is used.

# ZERO-TAX COMPATIBILITY

The accepted PAY-SETTLE-01B path remains unchanged:

```text
Dr Actual Bank                 netAmount
Dr 5300 Provider Fee Expense   feeAmount
    Cr 1110 Provider Clearing          grossAmount
```

Zero-tax settlements do not require a provider tax document. Existing zero-tax idempotency, clearing coverage, refund/reversal reduction, Migration 025, and account-semantic checks remain active.

# SETTLEMENT COVERAGE

Tax-bearing posting continues through the existing settlement coverage boundary. It still verifies captured Payment linkage, provider Payment identity, merchant and tenant scope, currency, prior posted settlement consumption, refund/reversal reductions, and clearing availability. Tax evidence cannot bypass those controls.

# ACCOUNTING CHART

The implementation requires the existing completed Migration 025 and current chart fingerprint. It uses:

- `1110` active Provider Clearing;
- `5300` active canonical provider-fee expense;
- `2211` active Input CGST when CGST is nonzero;
- `2212` active Input SGST when SGST is nonzero;
- `2213` active Input IGST when IGST is nonzero;
- an active tenant-owned actual bank ledger destination.

Missing, duplicate, stale, inactive, or semantically incompatible authority remains ledger-inert.

# IDEMPOTENCY

Tax-bearing settlement posting uses the existing durable financial-event mechanism with a distinct action identity:

`provider_settlement_posted_with_input_gst:v1`

Retries converge to the existing journal. The settlement records the accounting tax-document identity and consumed component-economic identities after the journal succeeds. Zero-tax action identity remains unchanged.

# ATOMICITY

The tax eligibility check, journal creation, financial-event identity, settlement accounting status, and tax-consumption metadata execute inside the existing authoritative settlement mutation boundary. A failed eligibility, account, journal, or persistence operation does not leave a posted settlement state. No second GST journal is created for the same settlement action.

# POSTGRESQL CONCURRENCY

The implementation composes with the existing `persistenceAdapter.mutateState` transaction path and does not introduce process-local locking or a second persistence authority. Structural transaction behavior and state round-trip were verified. Live multi-process contention for the new GST-bearing path remains an operational verification item.

# CORRECTIONS

Posted journals remain immutable. General GST corrections, credit-note reversals, historical reclassification, TDS, withholding, FX, and nonzero settlement adjustments remain outside this package and fail closed rather than mutating an existing journal.

# BANKING INERTNESS

No bank statement import, matching, reconciliation state, or Banking journal was added. The actual-bank debit is part of Accounting's provider-settlement journal only.

# REPORTING

The journal economics preserve the intended reporting effects:

- Provider Clearing `1110` is reduced by gross settlement;
- Actual Bank increases by net payout;
- Provider-fee expense `5300` receives only the taxable fee;
- Input GST accounts receive only explicit verified components;
- Trial Balance remains balanced;
- A/R, Invoice, Payment, Allocation, Customer Advance, and PAY-ATOMIC economics are untouched.

The PostgreSQL report verification also passed against the normalized repository data.

# FOCUSED TESTS

Focused command:

```text
node --test --test-isolation=none --test-concurrency=1 \
  tests/provider-settlement-accounting.test.js \
  tests/provider-tax-document.test.js
```

Result: **33 passed, 0 failed**.

New/covered behavior includes valid CGST/SGST posting, valid IGST posting, tax-exclusive fee reconciliation, missing evidence blocking, taxable-fee mismatch blocking, GST account authority, and preservation of zero-tax behavior.

# REGRESSIONS

The full relevant regression command covering settlement, tax evidence, accounting authority, payment allocation/atomicity, recovery, Banking exposure, and reporting completed:

**127 passed, 0 failed**.

# LINT

`npm run lint` — **PASS**.

# BUILD

`npm run build` — **PASS**.

# POSTGRESQL VERIFICATION

- `npm run db:verify-state` — **PASS**; PostgreSQL state round-trip verified.
- `npm run db:verify-reports` — **PASS**; PostgreSQL report totals match normalized data.

# DIFF CHECK

Targeted `git diff --check` completed with no content errors. Git emitted only expected LF→CRLF working-copy warnings for existing JavaScript files.

# LIVE VERIFICATION OUTSTANDING

- Live Razorpay confirmation that provider tax documents always supply separate taxable fee and GST values.
- Live multi-process PostgreSQL contention/retry verification for tax-bearing settlement posting.
- Legal/tax-policy confirmation of Input GST eligibility and correction-period treatment.

These remain verification items; the implementation does not infer provider tax or legal ITC authority.

# BLOCKERS

No implementation blocker remains within the corrected 3C.64 boundary. The implementation deliberately blocks unsupported fee basis, incomplete taxable-fee allocation, mismatched tax components, stale accounting authority, unsupported adjustments, and unresolved correction lineage.

# REPORT

Report 140 — Corrected 3C.64 Provider Input GST Settlement Accounting Completion Report.

# STAGING / COMMIT / PUSH

No staging, commit, or push was performed. The pre-existing `android/app/build.gradle` modification and unrelated untracked workspace artifacts remain untouched.

# FINAL VERDICT

**READY FOR INDEPENDENT ACCEPTANCE**
