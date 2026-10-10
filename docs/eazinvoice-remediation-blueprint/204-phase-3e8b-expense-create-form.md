# Phase 3E.8B — Expense Web Creation Form

## Baseline

The repository remained on `main` at `9a8c5ec440b4eb949d4cf943e09da47aca02b198`, matching `origin/main`. Existing Phase 3E.8A changes were preserved and no staging, commit, push or deployment was performed.

## Implementation summary

Added a Purchases-owned Create Expense route and form using the existing `POST /expenses` client authority. The form supports the accepted direct-paid, zero-tax MVP fields: expense date, mandatory payee, description/purpose, amount, business currency, eligible expense account and eligible bank/cash funding account.

## Authority and safety

- Expense accounts come from the existing accounting account authority and are accepted only when active, Expense-type and Debit-normal.
- Funding accounts come from the existing bank-account authority and are limited to active bank/cash accounts; clearing account `1110` is excluded.
- The UI never calculates cash sufficiency, accounting periods, authorization, currency eligibility or journal effects.
- Unauthorized workspace roles do not receive a posting action.
- The existing workspace snapshot is sent with the request and checked again before presenting success.
- A secure UUID idempotency key is stable for retries of the same payload and changes for a changed payload.
- Backend errors remain visible through the existing safe error presentation; failures do not show success or navigate away.
- No detail or reversal route was added.

## Verification

Phase-specific and Purchases regressions: **41 passed, 0 failed**. This includes the Expense backend contract tests, Expense Web list/create tests, Vendor Bill/Purchases regressions and accounting ownership checks.

Lint: **passed**. Build and syntax checks: **passed**. `git diff --check`: **passed**.

The full suite is **500 passed, 66 failed, 2 skipped**. The 66 failures are unchanged from the 3E.8A baseline of 496 passed, 66 failed, 2 skipped; the four added 3E.8B tests passed. The failures are in pre-existing P2 readiness/PDF, authentication/KYC/subscription/admin, workspace/security, and provider/payment runtime areas. None are Expense/Purchases failures, so no Phase 3E.8B regression was identified. Their underlying environment/runtime causes remain separately unresolved rather than being claimed as fixed.

Classification:

- **A — scope-isolated/evidenced:** all 66 failures are outside the changed Expense/Purchases behavior and the affected Purchases regression set is green.
- **B — environment-restricted:** not separately proven for this run.
- **C/D — potential/new Expense or Purchases regression:** none identified.
- **E — unresolved root cause:** the external failures still need their own domain/runtime triage.

PostgreSQL persistence/concurrency, browser/responsive behavior and production deployment remain open runtime gates.

## File inventory

Phase 3E.8A files preserved:

- `apps/web/dashboard.html`
- `apps/web/dashboard.js`
- `tests/accounting-ownership.test.js`
- `tests/vendor-bill-web-exposure.test.js`
- `tests/expense-web-list.test.js`
- `docs/eazinvoice-remediation-blueprint/203-phase-3e8a-expense-web-list-navigation.md`

Phase 3E.8B additions:

- `tests/expense-web-create.test.js`
- `docs/eazinvoice-remediation-blueprint/204-phase-3e8b-expense-create-form.md`

The two dashboard files are cumulative implementation files; the Phase 3E.8A regression files were updated only to reflect the now-authorized Expense Purchases surface and preserve Vendor Bill section isolation. Existing unrelated worktree files remain untouched.

## Verdict

READY FOR EXPENSE DETAIL AND REVERSAL IMPLEMENTATION
