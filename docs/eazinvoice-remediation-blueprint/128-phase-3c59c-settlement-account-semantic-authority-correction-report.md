# Phase 3C.59C â€” Settlement Account Semantic Authority Correction

**PHASE:** 3C.59C / PAY-SETTLE-01B account-semantic correction
**BASELINE:** `b173acb395af4fffd9840beedc53768408013b15`

## Report 127 blockers

**REPORT 127 BLOCKER 1:** Provider Clearing 1110 now requires the unique
tenant-owned active account to have canonical `bank_clearing` semantics,
Asset type, and Debit normal balance.

**REPORT 127 BLOCKER 2:** The destination Bank mapping now requires an active
tenant bank record linked to an existing active Asset/Debit ledger account with
persisted bank semantic `bank`, and rejects system, clearing, fee, A/R,
Customer Advance, and incompatible accounts.

## Authority validation

- **1110 CANONICAL AUTHORITY:** Existing unique tenant account; no creation,
  replacement, or fallback.
- **1110 TYPE:** Asset.
- **1110 NORMAL BALANCE:** Debit.
- **1110 LIFECYCLE:** Active and non-deleted.
- **DESTINATION BANK AUTHORITY:** Existing Banking record plus its
  `ledgerAccountId` relationship.
- **BANK LEDGER TYPE:** Asset.
- **BANK LEDGER NORMAL BALANCE:** Debit.
- **BANK MAPPING:** Must be an active bank-backed ledger mapping, not merely an
  account name or arbitrary Asset/Debit account.

Both endpoints are revalidated inside the authoritative settlement mutation.
Any semantic incompatibility remains ledger-inert.

## Preserved controls

Migration 025 and chart fingerprint validation, effective clearing availability,
refund/reversal lineage deduplication, prior settlement consumption,
idempotency ordering, closed-period validation, provider-fee authority,
unsupported-class inertness, tenant isolation, and Banking inertness remain
unchanged.

## Verification

- Focused settlement accounting tests: **12 passed, 0 failed**.
- Relevant accounting, migration, Payment, PAY-ATOMIC, Allocation, Customer
  Advance, recovery, Banking, and reporting regressions: **94 passed, 0 failed**.
- Semantic negative coverage includes incompatible 1110 type/role/status and
  incompatible destination-bank type/category/status cases.
- `npm run lint`: **PASS**.
- `npm run build`: **PASS**.
- `npm run db:verify-state`: **PASS**.
- `npm run db:verify-reports`: **PASS**.
- `git diff --check`: **PASS**, expected LF/CRLF warnings only.

**LIVE POSTGRESQL VERIFICATION OUTSTANDING**
**LIVE POSTGRESQL CONCURRENCY VERIFICATION OUTSTANDING**
**LIVE RAZORPAY VERIFICATION OUTSTANDING**

## Scope leakage

No settlement economics, Migration 025, refund/reversal architecture,
PAY-ATOMIC, GST, TDS, FX, adjustments, Banking reconciliation, UI, Android,
or provider integration was changed.

## Files changed

- `apps/api/src/accounting-service.js`
- `apps/api/src/store.js`
- `tests/provider-settlement-accounting.test.js`
- this Report 128

Nothing was staged, committed, or pushed. Reports 121â€“127 were not modified.

## Final verdict

**PHASE 3C.59C â€” CORRECTION IMPLEMENTED â€” READY FOR COMBINED FINAL ACCEPTANCE**
