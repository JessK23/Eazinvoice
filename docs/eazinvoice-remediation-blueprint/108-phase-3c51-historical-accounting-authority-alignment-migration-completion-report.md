# Phase 3C.51 â€” AUTH-ACCOUNTING-MIGRATE-01A
## Historical Accounting Authority Alignment and Migration Completion Report

**Mode:** Implementation complete; awaiting independent final acceptance
**Baseline:** `e82dd9230c511ab8c6667446ab0ff201781e2c16`
**Scope:** Accounting authority alignment and migration safety only. Settlement posting remains unimplemented.

## FINAL DECISION

**IMPLEMENTATION COMPLETE â€” READY FOR INDEPENDENT FINAL ACCEPTANCE**

The implementation establishes a shared chart authority, PostgreSQL migration metadata, deterministic legacy-account classification, fail-closed ambiguity handling, and compatibility treatment for historical generic GST accounts. It does not rewrite historical journals, move opening balances, alter PAY-ATOMIC economics, or post settlement entries.

Live application of migration `025_accounting_authority_alignment` was not verified from this environment because the repository migration runner could not find `psql`. Structural checks and the focused executable tests pass; deployment-time PostgreSQL migration remains an acceptance item.

## BASELINE

- `HEAD == origin/main == e82dd9230c511ab8c6667446ab0ff201781e2c16`
- Branch: `main`
- Staging index was empty before implementation
- Reports 105, 106, and 107 were not modified
- Existing Android modification and unrelated/untracked artifacts were untouched

## FILES CHANGED

1. `apps/api/src/accounting-chart.js`
2. `apps/api/src/accounting-service.js`
3. `apps/api/src/postgres-accounting.js`
4. `apps/api/src/postgres.js`
5. `database/migrations/025_accounting_authority_alignment.sql`
6. `tests/accounting-authority-migration.test.js`
7. `docs/eazinvoice-remediation-blueprint/108-phase-3c51-historical-accounting-authority-alignment-migration-completion-report.md`

No settlement, Banking, payment, invoice, allocation, Android, or UI files were changed.

## SHARED CHART AUTHORITY

`apps/api/src/accounting-chart.js` is now the shared canonical definition for A/R, payment clearing, Customer Advances, split GST, TDS, equity, revenue, and expense roles. Runtime accounting consumes the definitions instead of maintaining a second literal chart.

Legacy `1120`, `2200`, and `2210` definitions are explicitly marked compatibility accounts rather than canonical future-posting roles.

## 1110 AUTHORITY

`1110` is now defined consistently as **Bank / Payment Clearing** with role `bank_clearing`. The PostgreSQL default chart no longer defines it as an actual bank account. Existing account identity and historical journal references are preserved.

## ACTUAL BANK PRESERVATION

Business bank/cash accounts continue to use explicit ledger accounts and existing `ledgerAccountId` mappings. The migration does not rewrite bank accounts, statement lines, reconciliation matches, opening balances, or historical journals.

Legacy `1110` records with bank/reconciliation evidence are classified as compatibility/manual-review cases rather than silently reinterpreted.

## 2110 AUTHORITY

`2110` Customer Advances is part of the canonical chart. Missing accounts can be created deterministically by the aligned bootstrap; compatible existing accounts are reused; incompatible or duplicate accounts fail closed. No balances are moved.

## 1100 AUTHORITY

`1100` remains Accounts Receivable. Existing identity is preserved and incompatible/duplicate authority is classified for manual review.

## GST AUTHORITY

Future split GST authority is defined as:

- `2201`/`2202`/`2203` output CGST/SGST/IGST;
- `2211`/`2212`/`2213` input CGST/SGST/IGST.

PostgreSQL invoice/purchase synchronization uses split GST when persisted records contain a balanced split. Historical records without a trustworthy split remain on explicit generic compatibility accounts `2200`/`2210`; they are not retroactively rewritten. PostgreSQL GST reporting includes both canonical and legacy-compatible families without changing historical totals.

## MIGRATION MARKER

Migration `025_accounting_authority_alignment.sql` adds durable, tenant-scoped:

- `eazinvoice_accounting_authority_migrations` for status, version, fingerprint, attempts, classification, and reason codes;
- `eazinvoice_accounting_authority_mappings` for explicit legacy-to-canonical mappings.

The schema includes uniqueness and tenant RLS policies.

## MIGRATION AUDIT

The PostgreSQL migration path records business identity, migration version, classification, reason codes, fingerprint, attempt metadata, and completion/manual-review state. Account IDs and historical journal payloads are not duplicated or rewritten.

## CLASSIFICATION / MANUAL REVIEW

The shared classifier covers:

- unused, clearing-used, bank-mapped, reconciled, opening-balance, mixed-use, and duplicate `1110`;
- compatible, incompatible, missing, and duplicate `2110`;
- compatible/conflicting `1100`.

Bank/reconciliation evidence and mixed clearing/bank use are not auto-promoted to clearing. Ambiguous states become manual review and block successful migration completion.

## TRANSACTION / CONCURRENCY

PostgreSQL accounting synchronization runs inside `withPostgresTransaction`. The authority migration obtains a transaction-scoped advisory lock keyed by business and migration version, locks scoped ledger accounts, persists marker state, and uses database uniqueness/RLS. No process-local mutex is used as financial authority.

## RESTART / IDEMPOTENCY

The marker and fingerprint make completed compatible migrations safe no-ops. Account bootstrap uses deterministic scoped IDs and fills missing semantic metadata without overwriting existing historical meaning. Repeated account resolution does not create journals, payments, allocations, or bank transactions.

## HISTORICAL JOURNAL IMMUTABILITY

The implementation does not update journal IDs, journal-line IDs, account IDs referenced by posted lines, dates, debit/credit values, currencies, posting states, periods, opening balances, or reconciliation evidence. Ambiguous historical states fail before semantic completion.

## REPORTING INVARIANTS

Existing runtime and focused accounting tests preserve receipt, allocation, reversal, refund, A/R, and settlement evidence behavior. PostgreSQL state and report verification remain green. Full before/after production migration equality is still a final-acceptance/deployment item because migration 025 could not be applied locally without `psql`.

## BANKING PRESERVATION

Banking continues to resolve account identity through `ledgerAccountId`. No reconciliation or payout matching behavior changed. Provider settlement remains evidence-only and does not move value from `1110`.

## PAY-ATOMIC REGRESSION

Focused tests pass for:

```text
Captured Payment â†’ Dr 1110 â†’ Cr 2110
Allocation       â†’ Dr 2110 â†’ Cr 1100
```

Payment amount, allocation, overpayment, Customer Advance, and Invoice outstanding authorities were not redesigned.

## REFUND / REVERSAL REGRESSION

Existing Customer Advance allocation reversal, receipt reversal, refund, overpayment, and PAY-ATOMIC tests pass. No historical refund/reversal journal was rewritten.

## SETTLEMENT INERTNESS

Provider settlement tests pass with `accountingStatus: "not_posted"`. No settlement journal, fee entry, GST-on-fee entry, payout-to-bank journal, or Banking mutation was added.

## CALLER / AUTHORITY SWEEP

The active contradictory PostgreSQL default `1110 = Bank Account` was removed. Remaining `Bank Account` strings are dynamic display defaults for explicit business bank records, not system-account semantics. Generic `2200`/`2210` references are explicitly legacy compatibility paths; canonical split accounts are used when reliable split evidence exists.

## FOCUSED TESTS

- `tests/accounting-authority-migration.test.js`: **3/3 passed**
- Accounting/payment/settlement focused suite: **40/40 passed**
- Included Customer Advance, allocation, PAY-ATOMIC, refund/reversal, Credit Note, overpayment, and provider-settlement inertness regressions.

## REGRESSIONS

The focused financial regression suite passed without changing Payment, Allocation, Invoice, A/R, Customer Advance, or settlement behavior.

## LINT

`npm run lint`: PASS

## BUILD

`npm run build`: PASS

## POSTGRESQL STATE VERIFICATION

`npm run db:verify-state`: PASS; existing PostgreSQL state round-trip verified.

## POSTGRESQL REPORT VERIFICATION

`npm run db:verify-reports`: PASS; normalized report totals verified.

## LIVE POSTGRESQL

Existing local PostgreSQL verification passed against the pre-existing schema. Applying the new migration failed because `psql.exe` is unavailable to `scripts/postgres-check.mjs`; migration 025 was therefore not live-applied from this process. This is an environmental verification limitation, not evidence that migration SQL failed.

## ENVIRONMENTAL LIMITATIONS

- Default aggregate Node test isolation on Windows produces `spawn EPERM`; the established `--test-isolation=none --test-concurrency=1` runner executed the focused tests successfully.
- `npm run db:migrate` could not run because `psql` was not found.
- No production code was altered to accommodate either limitation.

## BLOCKERS

No implementation-scope blocker remains. Independent acceptance must still verify:

1. migration 025 applies successfully in the target PostgreSQL environment;
2. live migration classification preserves account/journal/report invariants;
3. concurrent and ambiguous legacy states fail closed;
4. no unintended settlement or Banking effect exists.

## READINESS FOR INDEPENDENT ACCEPTANCE

The package is ready for the independent 3C.51 final acceptance gate. It is not ready for settlement accounting until that gate and deployment migration verification pass.

## STAGING / COMMIT / PUSH

Nothing was staged, committed, or pushed.
