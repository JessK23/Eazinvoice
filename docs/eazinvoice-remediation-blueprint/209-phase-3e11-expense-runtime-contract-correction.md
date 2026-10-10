# Phase 3E.11A — Expense PostgreSQL Runtime Contract Correction

## Baseline and scope

- Baseline: `851946010ea3e5ba89bd934c31899124d88b8294`
- Mode: surgical runtime correction; no staging, commit, push, deployment, or production database changes.
- Isolated verification database: `eazinvoice_test`.
- PostgreSQL runtime: 17.11.

## Defect found

The first isolated Expense creation attempt reached the PostgreSQL authoritative mutation path but failed with:

`TypeError: transactionStore.createExpenseLocal is not a function`

The call originated in `apps/api/src/store.js:createExpense()`. The transaction callback constructs a non-persisting transaction store and invokes its local Expense mutation. The local functions existed in the store implementation, but were not exposed through the `storeApi` returned by `createStore()`. The analogous reversal callback had the same contract gap.

The failed attempt persisted no Expense record; the pre-correction state check reported zero Expense records.

## Surgical correction

`apps/api/src/store.js` now exposes the existing `createExpenseLocal` and `reverseExpenseLocal` methods on the transaction store API. No accounting rules, persistence path, journal logic, locking behavior, or Web code were changed.

`tests/expense-accounting.test.js` now exercises the persistence-adapter mutation path for both Expense creation and reversal. This regression would fail before the export correction.

## Verification

### Source and regression checks

- Focused Expense/accounting/Web regressions: 31 passed, 0 failed.
- Syntax checks: passed.
- Lint: passed.
- Build: passed.
- `git diff --check`: passed.

### Isolated PostgreSQL smoke verification

Against `eazinvoice_test`, using the approved elevated localhost execution path:

- Valid cash-funded Expense: passed.
- Insufficient cash rejection before persistence: passed.
- Valid bank-funded Expense: passed.
- Missing payee rejection: passed.
- Same-key idempotent replay: passed.
- Controlled reversal with reason: passed.
- Fresh adapter reload of the reversed Expense: passed.

No production database or Render service was used or changed.

## Changed-file boundary

- `apps/api/src/store.js`
- `tests/expense-accounting.test.js`
- This report (untracked; not approved for staging).

The working tree also contains pre-existing unrelated Android and untracked artifact changes, which were preserved.

## Remaining limitations

This correction smoke does not replace the full Phase 3E.11 runtime gate. Live PostgreSQL multi-process cash-spend concurrency, broader persistence/reload matrix, browser verification, and production deployment remain outstanding. The correction is not production-ready by itself.

## Verdict

**READY FOR INDEPENDENT RUNTIME CORRECTION ACCEPTANCE**
