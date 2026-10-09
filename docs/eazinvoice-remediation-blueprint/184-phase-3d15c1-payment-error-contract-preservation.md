# Phase 3D.15C-1 — Payment Error Contract Preservation

## Baseline

- Branch: `main`
- `HEAD == origin/main == 13acdbb3a418f76fb79c6a5ef1bf5b6d06dcb514`
- No staging, commit, push, or deployment performed.

## Scope

Preserve the existing HTTP error metadata at the shared Web API client boundary so a later, separately authorized Vendor Bill payment contract can classify outcomes safely. This phase does not change backend payment processing, accounting, or database behavior.

## Findings

The Vendor Bill endpoint currently returns only `{ error: message }` and maps exceptions through the generic `knownRequestErrorStatus()` helper. The client previously converted every non-2xx response into a plain `Error`, losing the HTTP status and response payload.

That contract is not sufficient to release a payment-attempt idempotency key safely:

- A network failure has no server response and remains ambiguous.
- A 5xx response can occur after a payment mutation or persistence failure and remains ambiguous.
- A 4xx response is not, by itself, proof that no payment was recorded.
- The current Vendor Bill response does not provide an authoritative machine-readable `not_recorded` or equivalent outcome.

## Changes

`apps/api/src/client.js` now exports `ApiRequestError`, preserving the original message together with:

- `status`
- `payload`
- `path`

Existing callers remain compatible with `Error` semantics. The Vendor Bill page was intentionally not changed to classify current responses as definitive rejection because the backend does not yet provide that authority.

`tests/vendor-bill-detail-web.test.js` verifies that preserved metadata does not imply a payment outcome.

## Verification

- Focused Vendor Bill tests: **8 passed, 0 failed**
- `node --check apps/api/src/client.js`: **passed**
- `git diff --check`: **passed** for the candidate changes
- No staging, commit, push, or deployment performed.

## Remaining dependency

The backend needs a separately approved, authoritative response contract for this endpoint that distinguishes a confirmed non-recording rejection from an ambiguous server/persistence outcome. The contract should be explicit and machine-readable; HTTP status alone must not be used for this purpose.

## Verdict

**BLOCKED — BACKEND ERROR CONTRACT INSUFFICIENT**
