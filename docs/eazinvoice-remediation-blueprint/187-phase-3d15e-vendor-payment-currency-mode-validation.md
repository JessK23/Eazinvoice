# Phase 3D.15E — Vendor Payment Currency and Mode Validation Correction

## Baseline

- Branch: `main`
- `HEAD == origin/main == 13acdbb3a418f76fb79c6a5ef1bf5b6d06dcb514`
- No staging, commit, push, or deployment performed.

## Report 186 finding and root cause

The Vendor Bill payment authority copied submitted `currency` and `mode` values without validating them. An INR bill therefore accepted `currency: "USD"` and `mode: "bogus"`, allowing an unauthorized payment representation to reach persistence and posting.

## Currency authority

The persisted Vendor Bill currency is authoritative. This phase does not add FX or conversion. A supplied currency is normalized to uppercase and must be a three-letter code matching the persisted bill currency. Missing/null currency retains the established default-to-bill-currency behavior; malformed, unsupported, or mismatched values are rejected before payment insertion.

## Payment-mode authority

Existing clients establish the supported Vendor Bill mode contract. The accepted canonical values/aliases are `bank`, `bank_transfer`, `upi`, `cash`, `card`, `cheque`, `other`, and `manual`. Whitespace/case and existing space/hyphen aliases are normalized; unknown values, non-string values, and unsupported modes are rejected. Missing or blank mode retains the established `manual` default.

## Validation and outcome contract

Currency and mode validation occur before payment construction is inserted into state or accounting posting is attempted. Proven failures use the existing `paymentOutcome: "not_recorded"` contract. Persistence failures continue to remain ambiguous and use `unknown`; no idempotency or transaction redesign was introduced.

## Verification

- Focused Vendor Bill/payment/allocation tests: **34 passed, 0 failed**
- Full elevated suite: **551 total, 549 passed, 0 failed, 2 skipped**
- Original USD/mode-bypass cases: **rejected with no Payment and no vendor-payment journal**
- Valid INR payment and established mode alias: **accepted**
- `npm run lint`: **passed**
- `npm run build`: **passed**
- Syntax checks: **passed**
- `git diff --check`: **passed**

## Changed files

- `apps/api/src/store.js`
- `tests/vendor-bill-payment-outcome.test.js`
- this report

The existing 3D.15C-2 candidate and unrelated worktree changes remain uncommitted and unstaged.

## Open runtime gates

- PostgreSQL persistence/reload and multi-process concurrency: outstanding
- Browser/responsive validation: outstanding
- Render deployment/production verification: not performed

## Verdict

**READY FOR INDEPENDENT RE-ACCEPTANCE**
