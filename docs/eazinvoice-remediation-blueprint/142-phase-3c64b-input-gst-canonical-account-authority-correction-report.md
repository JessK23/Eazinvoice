# PHASE 3C.64B — Input GST Canonical Account Authority Correction

## MODE

Surgical implementation only. No staging, commit, push, deployment, reset, clean, stash, restore, or deletion was performed.

## BASELINE

`HEAD == origin/main == 9d1e42df597b883fd8e6319435a0e0072a8c515d`.

The pre-existing uncommitted 3C.64 implementation remained present. Authentication files were not modified. The Android modification and unrelated untracked artifacts were preserved.

## DEFECT CORRECTED

The GST-bearing settlement journal previously resolved account `2211`, `2212`, and `2213` independently with first-match lookup and only checked active status, allowing duplicate or semantically incompatible accounts to be selected.

## IMPLEMENTATION

`apps/api/src/accounting-service.js` now exposes a single `resolveProviderInputGstAccounts` authority for the GST settlement path. It resolves all three canonical codes by tenant and rejects closed candidates before journal construction when any required account is:

- missing;
- duplicated or ambiguous;
- inactive or deleted;
- assigned the wrong canonical role;
- not an asset account;
- not debit-normal;
- not a system canonical account.

The resolver returns cloned canonical account records only after all three definitions pass. Zero-tax settlements retain the existing compatibility path and do not require GST evidence or GST account consumption.

The existing settlement mutation still validates completed current `AUTH-ACCOUNTING-MIGRATE-01A` and its chart fingerprint before the journal is posted. Thus the account semantics are evaluated under the same current chart authority rather than creating a second migration authority.

## ATOMIC FAILURE BEHAVIOR

`tests/provider-settlement-accounting.test.js` adds adversarial coverage for duplicate, missing, inactive, wrong-role, wrong-type, wrong-normal-balance, and wrong-tenant GST account states. Each case asserts:

- no additional journal;
- settlement remains `not_posted`;
- no partial GST consumption or settlement transition.

The test also verifies that a stale Migration 025/chart fingerprint blocks a GST-bearing settlement before posting.

Previously accepted valid CGST/SGST and IGST journal tests remain passing, as does zero-tax settlement compatibility.

## TESTS

Focused command:

```text
node --test --test-isolation=none --test-concurrency=1 tests/provider-settlement-accounting.test.js tests/provider-tax-document.test.js
```

Result: **35 passed, 0 failed, 0 skipped**.

Relevant cumulative accounting/payment/settlement/recovery/Banking/reporting suite:

- **163 passed**
- **1 skipped** — the explicitly skipped live PostgreSQL concurrency test
- **0 failed**

Additional verification:

- `npm run lint` — PASS
- `npm run build` — PASS
- `npm run db:verify-state` — PASS
- `npm run db:verify-reports` — PASS
- `git diff --check` — no content errors; only expected Windows LF→CRLF warnings

## CHANGED FILES FOR THIS CORRECTION

- `apps/api/src/accounting-service.js`
- `tests/provider-settlement-accounting.test.js`
- `docs/eazinvoice-remediation-blueprint/142-phase-3c64b-input-gst-canonical-account-authority-correction-report.md`

The broader uncommitted 3C.64 candidate also contains the previously approved-by-implementation, not-yet-accepted changes in `apps/api/src/store.js` and `tests/provider-tax-document.test.js`; those remain uncommitted and are not claimed as independently accepted by this correction report.

## LIMITATIONS

Live multi-process PostgreSQL contention, live Razorpay tax-document evidence, legal Input GST eligibility, and the manual Company registration smoke test remain operational verification items. No production deployment or configuration change was attempted.

## FINAL VERDICT

**READY FOR COMBINED INDEPENDENT ACCEPTANCE**

The next gate should independently accept the complete 3C.64 + 3C.64B candidate, including the original GST settlement implementation and this canonical account-authority correction.
