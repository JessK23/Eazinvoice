# Azure Blob Production Activation Runbook (Phase 2E)

This runbook activates Azure Blob Storage as the document binary provider without changing core persistence authority.

## Authority Boundaries

- `EAZINVOICE_STORAGE=postgres` controls core application persistence.
- `EAZINVOICE_DOCUMENT_STORAGE_PROVIDER` controls DocumentService binary object storage (`local` or `azure`).
- PostgreSQL `eazinvoice_documents` remains metadata authority (`document_id`, business ownership, classification, lifecycle, checksums).

## Preconditions

1. Render deployment commands remain:
   - Build: `npm ci`
   - Pre-Deploy: `npm run deploy:render-predeploy`
   - Start: `npm start`
2. PostgreSQL migration gate is passing.
3. No secrets are committed in repository files.

## Existing Document Safety Check (Required)

Before switching provider, inventory existing records by `storage_provider` in production.

- If any production records still reference `storage_provider=local`, switching global provider to `azure` will not make those historical local objects readable automatically.
- Historical local objects must be handled before activation through a controlled migration strategy.

## Required Azure Resource Settings

### Required for correctness/security

- Storage account: General-purpose v2.
- Secure transfer required: enabled.
- Minimum TLS: 1.2 or later.
- Public blob access: disabled.
- Network access: must allow Render outbound connectivity.
- Container: private access (no anonymous access), lowercase Azure-valid name.

### Optional hardening

- Blob soft delete.
- Versioning.
- Container/object immutability policies aligned with legal requirements.
- Stricter network restrictions once Render egress model is confirmed.

## Activation Steps

1. Keep `EAZINVOICE_DOCUMENT_STORAGE_PROVIDER=local`.
2. Add Azure config secrets in Render:
   - `EAZINVOICE_AZURE_STORAGE_CONTAINER=<private-container-name>`
   - `EAZINVOICE_AZURE_STORAGE_CONNECTION_STRING=<secret>`
3. Run deliberate probe (not on every startup):
   - `npm run document-storage:azure-check`
4. Confirm probe success and no secret leakage in logs.
5. Confirm historical-document plan for any `storage_provider=local` records.
6. Set `EAZINVOICE_DOCUMENT_STORAGE_PROVIDER=azure`.
7. Redeploy.
8. Execute controlled acceptance:
   - KYC upload + Admin retrieval
   - finalized Invoice archival + retrieval
   - finalized PO/WO archival + retrieval
   - unauthorized/cross-business retrieval rejection
9. Inspect `eazinvoice_documents` for expected `storage_provider='azure'` on newly created records.

## Rollback Steps

Rollback is not automatically safe if documents were already written under `storage_provider=azure`.

1. If activation failed before successful azure-backed document writes, reverting provider to `local` may be safe.
2. If activation created azure-backed records, do not immediately flip provider without evaluating split-storage consequences.
3. Keep PostgreSQL authority unchanged; do not run destructive down-migrations.
4. Reconcile document accessibility by provider provenance before any provider flip.
5. Never bulk-delete Azure blobs as part of rollback.

## Split-Storage Warning

Mixed historical providers require explicit handling. A global provider switch alone does not migrate existing binary objects.
