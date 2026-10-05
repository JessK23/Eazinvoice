# Phase 3C.51A â€” AUTH-ACCOUNTING-MIGRATE-01A-CORR
## Historical Accounting Authority Migration Correction Completion Report

**Mode:** Correction implementation complete; ready for combined final acceptance
**Baseline:** `e82dd9230c511ab8c6667446ab0ff201781e2c16`
**Scope:** Migration safety only. Settlement, Payment, PAY-ATOMIC, Banking, and historical financial evidence remain unchanged.

## ORIGINAL ACCEPTANCE DEFECTS

Report 109 identified five defects:

1. `manual_review` was written and then rolled back with the failed transaction.
2. PostgreSQL classification did not gather all required historical evidence.
3. Compatibility mapping tables were created but not populated.
4. Several PostgreSQL accounting entry points could bypass migration authority.
5. Historical immutability, tenant isolation, and economic equality needed stronger executable/structural verification.

## CORRECTIONS

### Durable manual review

Migration classification now returns a durable `manual_review` result instead of throwing inside the transaction that records it. The marker transaction commits diagnostic status, classification, reason codes, fingerprint, tenant identity, and attempt metadata. The caller then fails closed after the marker is durable. No financial mutation occurs.

Completed/manual-review states are replay-safe; manual review is not silently converted to completed.

### Historical classification expansion

The PostgreSQL classifier now inspects:

- account metadata and semantic roles;
- journal/ledger source usage;
- bank-account mappings;
- reconciled-bank evidence;
- opening-balance presence;
- duplicate canonical roles;
- generic GST compatibility identities;
- tenant/company scope.

Bank-mapped, reconciled, mixed-use, opening-balance-ambiguous, duplicate, and non-clearing states fail closed or remain compatibility/manual-review outcomes.

### Compatibility mappings

Deterministic classifications now persist tenant-scoped, migration-scoped mappings with unique identity, status, reason code, and restart-safe upsert behavior. Historical account IDs and journal references are not rewritten.

### PostgreSQL caller closure

The central accounting-authority readiness guard now runs before PostgreSQL accounting entry points for:

- accounting foundation synchronization;
- ledger-account listing and creation;
- manual journal creation/listing;
- book entries;
- GST summaries;
- ledger-account entries.

Unresolved manual-review authority fails closed; completed authority proceeds; safe not-yet-run authority is migrated transactionally.

### Verification coverage

Focused tests now verify the shared chart, fail-closed classification, durable migration/mapping surfaces, and caller-guard contract. Existing payment/accounting/settlement regressions remain green.

## DURABLE MANUAL_REVIEW DESIGN

The migration uses two phases:

1. A PostgreSQL transaction claims/classifies the tenant and commits either deterministic completion or durable `manual_review` metadata.
2. The accounting caller receives the result and rejects unresolved authority without issuing any financial mutation.

This closes the prior rollback hole.

## MIGRATION LIFECYCLE

Migration 025 retains durable `processing`, `completed`, and `manual_review` states with business/version uniqueness, fingerprints, attempts, timestamps, classification, and reason codes. Compatibility mappings use business/account/role uniqueness and migration linkage.

## HISTORICAL JOURNAL IMMUTABILITY

No migration path updates or deletes journal entries, journal lines, account IDs referenced by posted lines, dates, currencies, debit/credit values, posting states, periods, opening balances, or reconciliation evidence. Ambiguous classification returns before account alignment is completed.

## ECONOMIC EQUALITY

No journal or balance movement was introduced. Existing state/report verification and accounting/payment regressions pass. Full live before/after migration equality remains a deployment acceptance item because migration 025 could not be applied in this environment.

## TENANT ISOLATION

Migration identity, marker, mappings, account selection, bank evidence, and RLS policies remain tenant/business scoped. The readiness guard passes the current owner/company scope into the migration transaction; no cross-business account reuse was introduced.

## BANK / RECONCILIATION PRESERVATION

Genuine/reconciled bank evidence is not normalized into clearing. Existing bank account IDs, `ledgerAccountId`, statements, matches, and opening balances remain untouched. Ambiguous cases fail closed.

## PAY-ATOMIC / REFUND / REVERSAL

No Payment, Allocation, Customer Advance, Invoice, PAY-ATOMIC, refund, or reversal logic changed. Existing receipt-first economics and refund/reversal regressions pass.

## SETTLEMENT INERTNESS

Provider settlement remains `accountingStatus: "not_posted"`. No settlement journal, payout-to-bank posting, gateway fee, GST-on-fee, or Banking reconciliation effect was added.

## TEST RESULTS

- Migration-focused suite: **4/4 passed**
- Full serial isolation-safe suite: **46/46 files passed**
- `npm run lint`: PASS
- `npm run build`: PASS
- `npm run db:verify-state`: PASS against existing local database
- `npm run db:verify-reports`: PASS against existing local database
- `git diff --check`: PASS; only existing Android/source CRLF warnings

## LIVE POSTGRESQL LIMITATION

**LIVE POSTGRESQL MIGRATION 025 â€” UNVERIFIED â€” ENVIRONMENTAL.** The migration runner could not execute because `psql.exe` is unavailable. No production code was changed to accommodate this limitation.

## EXACT CANDIDATE FILES

The combined implementation candidate consists of:

- `apps/api/src/accounting-chart.js`
- `apps/api/src/accounting-service.js`
- `apps/api/src/postgres-accounting.js`
- `apps/api/src/postgres.js`
- `database/migrations/025_accounting_authority_alignment.sql`
- `tests/accounting-authority-migration.test.js`
- Report 108
- Report 110

Report 109 remains failed-acceptance history and is excluded from the implementation commit.

## READINESS FOR COMBINED FINAL ACCEPTANCE

The 3C.51A correction is complete and ready for one combined independent final acceptance of 3C.51 + 3C.51A. It must still verify the durable marker and live migration boundary where tooling permits.

## STAGING / COMMIT / PUSH

Nothing was staged, committed, or pushed.
