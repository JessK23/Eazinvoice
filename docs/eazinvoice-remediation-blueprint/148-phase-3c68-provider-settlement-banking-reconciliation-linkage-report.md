# Phase 3C.68 — Provider Settlement Banking Reconciliation Linkage

## Verdict

**READY FOR INDEPENDENT ACCEPTANCE**

PAY-SETTLE-BANK-01 is implemented narrowly. It exposes an already-posted provider-settlement actual-bank journal line to the existing Banking reconciliation projection and does not create or modify accounting entries.

## Baseline and safety

Expected baseline was verified:

```text
branch       main
HEAD         4bdc24b5eaf8658da139ecf98d98f3cd0ad57446
origin/main  4bdc24b5eaf8658da139ecf98d98f3cd0ad57446
```

The staging index remained empty. No commit, push, deployment, Render configuration, Android file, authentication file, accounting journal, historical report, or unrelated artifact was changed.

## Changed files

- `apps/api/src/bank-reconciliation-service.js`
- `tests/provider-settlement-banking.test.js`
- `docs/eazinvoice-remediation-blueprint/148-phase-3c68-provider-settlement-banking-reconciliation-linkage-report.md`

## Source authority and projection

The Banking projection now accepts `provider_settlement` only when the underlying accounting journal is posted and its journal line belongs to the requested bank account ledger. The source record is resolved by the journal's authoritative settlement ID and remains business-scoped.

The projection preserves:

- business and bank-account identity;
- provider-settlement source and settlement ID;
- posted journal and journal-line identity;
- provider payout/settlement reference;
- settlement date;
- currency; and
- actual posted bank-line amount.

The projection uses the bank journal line's debit/credit amount. It does not use gross settlement, fee, GST, or clearing amounts. A provider settlement therefore produces exactly one Banking candidate for the actual net payout; the fee, Input GST, and `1110` lines are not separately projected.

The stable identity is the existing deterministic journal-line lineage (`sourceType`, `sourceId`, `journalId`, and `journalLineId`). No random Banking transaction record or second financial receipt was introduced.

## Match and unmatch authority

The existing explicit Banking match/unmatch mechanisms are reused. They continue to enforce business, bank-account, currency, direction, exact amount, one-to-one compatibility, and duplicate-match checks.

Matching and unmatching change only `bankReconciliationMatches` and statement-line reconciliation state. They do not change:

- provider settlement accounting status;
- posted accounting journals or lines;
- `1110` clearing;
- provider fee `5300`;
- Input GST consumption;
- Payment or Allocation; or
- Customer Advance/A/R state.

## Persistence and reconstruction

The projection is derived from persisted posted journals and provider-settlement records. Rebuilding it from the same state produces the same journal-line identity and does not append a duplicate transaction. Existing reconciliation match records remain the persistence authority for match/unmatch state.

Focused tests exercise repeated projection and match/unmatch behavior. Live PostgreSQL persistence/reload verification could not run in this environment because the configured local PostgreSQL endpoint (`localhost:5432`) returned Windows `EACCES`; this is recorded as an environment limitation, not treated as a functional pass.

## Compatibility and exclusions

The implementation preserves zero-tax and GST-bearing settlement accounting because both produce the same single actual-bank projection. It does not enable or infer:

- provider tax corrections or settlement reversals;
- TDS/withholding;
- nonzero adjustments;
- FX or multi-currency matching;
- automatic reconciliation; or
- partial/many-to-many matching beyond the existing Banking contract.

## Verification

Focused and relevant tests:

```text
46 passed, 0 failed, 0 skipped
```

This includes:

- zero-tax provider settlement projection;
- GST settlement projection;
- net payout amount and currency;
- stable repeated projection;
- unposted settlement exclusion;
- exclusion of fee/GST/clearing lines;
- explicit same-tenant match and unmatch;
- accounting immutability after match/unmatch;
- existing settlement accounting regressions;
- provider tax-document regressions; and
- existing Banking Web exposure tests.

Lint and build syntax checks passed. `git diff --check` passed for the implementation diff.

PostgreSQL state/report verification was attempted but blocked by local connection permissions:

```text
connect EACCES ::1:5432
connect EACCES 127.0.0.1:5432
```

Live multi-process PostgreSQL concurrency and live provider verification remain outstanding.

## Independent acceptance handoff

The implementation is ready for the planned 3C.69 independent Banking reconciliation acceptance. That gate should adversarially verify net-versus-gross matching, cross-business and cross-bank rejection, duplicate protection, reload/reconstruction, and journal immutability after match and unmatch.

No staging, commit, push, or deployment was performed.
