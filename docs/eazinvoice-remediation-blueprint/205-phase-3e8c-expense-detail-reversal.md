# Phase 3E.8C — Expense Detail and Controlled Reversal

## Baseline

`main` remains at `9a8c5ec440b4eb949d4cf943e09da47aca02b198`, matching `origin/main`. Existing uncommitted Phase 3E.8A and 3E.8B changes were preserved. No staging, commit, push or deployment was performed.

## Implementation summary

Added a dedicated read-only Expense detail page and controlled reversal interaction. Expense list rows now navigate to the detail route. The detail page uses the existing `GET /expenses/:id` and `POST /expenses/:id/reverse` authorities only.

## Safety boundaries

- Posted Expenses have no edit or delete action.
- Reversal is offered only for a workspace with write permission and an unreversed Expense.
- A meaningful reason is required before submission.
- Reversal uses a stable secure idempotency key for one reason/workspace intent and prevents double-click submission.
- Workspace identity is checked before and after the request; stale responses and cross-business records fail closed.
- Reconciliation, accounting-period, authorization, duplicate and other financial validation remain backend-authoritative.
- The page creates no local journal, payment, balance or reversal state.

## Audit visibility limitation

The successful reversal response exposes reversal reason, date, actor and journal fields, so those are displayed immediately. A later `GET /expenses/:id` response exposes `reversedById` and the updated Expense but does not include the persisted reversal record. The page therefore does not fabricate reversal reason, timestamp or actor after a fresh reload; this backend projection gap remains documented for future authority work.

## Verification

- Focused cumulative Expense/Purchases/accounting regressions: **45 passed, 0 failed, 0 skipped**.
- Web-labeled regression set: **119 passed, 0 failed, 0 skipped**.
- Syntax checks for the new Expense detail module and cumulative dashboard module: **passed**.
- Lint: **passed**.
- Build: **passed**.
- `git diff --check`: **passed**.
- Full suite: **572 tests; 504 passed, 66 failed, 2 skipped**.

The 66 full-suite failures are unchanged outside the Expense/Purchases scope and occur in previously known readiness, PDF, authentication/KYC, subscription/admin, workspace/security, provider/payment and runtime areas. No new Expense, Purchases or Vendor Bill regression was observed in the focused or Web regression sets. The full suite is therefore not represented as fully passing.

Live PostgreSQL persistence/concurrency, browser/responsive behavior and production deployment remain open runtime gates.

## Cumulative Web inventory

3E.8A list/navigation: `apps/web/dashboard.html`, `apps/web/dashboard.js`, `tests/expense-web-list.test.js`, related ownership regressions and Report 203.

3E.8B creation: the same cumulative dashboard files, `tests/expense-web-create.test.js` and Report 204.

3E.8C detail/reversal: `apps/web/expense.html`, `apps/web/expense.js`, `tests/expense-detail-web.test.js`, plus the cumulative dashboard/list change and Report 205.

## Verdict

READY FOR INDEPENDENT EXPENSE WEB ACCEPTANCE
