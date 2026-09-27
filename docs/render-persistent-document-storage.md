# Render Persistent Document Storage (Phase 2F)

This phase activates durable production document binaries using Render Persistent Disk while keeping Azure Blob support dormant for future scaling.

## Production Provider Model

- Core persistence authority: `EAZINVOICE_STORAGE=postgres`
- Document binary provider: `EAZINVOICE_DOCUMENT_STORAGE_PROVIDER=local`
- Local document root: `EAZINVOICE_UPLOADS_DIR=<render-disk-mount-path>`

`storage_provider=local` in `eazinvoice_documents` remains valid.

## Required Render Configuration

Build Command:
`npm ci`

Pre-Deploy Command:
`npm run deploy:render-predeploy`

Start Command:
`npm start`

Environment:
- `EAZINVOICE_STORAGE=postgres`
- `EAZINVOICE_DOCUMENT_STORAGE_PROVIDER=local`
- `EAZINVOICE_UPLOADS_DIR=<exact persistent disk mount path>`
- `DATABASE_URL=<Render secret>`

Azure variables are not required while provider is `local`.

## Persistent Disk Setup (Operator)

1. Create a Render Persistent Disk (example name: `eazinvoice-documents`).
2. Choose a mount path (example: `/var/data/eazinvoice-documents`).
3. Set `EAZINVOICE_UPLOADS_DIR` to that exact mount path.
4. Redeploy.

The mount path and `EAZINVOICE_UPLOADS_DIR` must match.

## Production Fail-Closed Guard

When `EAZINVOICE_ENV`/`NODE_ENV` is `production` and provider is `local`:

- app requires explicit `EAZINVOICE_UPLOADS_DIR` (or equivalent explicit local root option)
- app validates storage root readability/writability at startup
- app fails closed if root is missing/invalid
- app does not silently fall back to repository-relative ephemeral storage

## Local Storage Probe

Run in Render Shell after disk mount:

`npm run document-storage:local-check`

Probe behavior:
- creates isolated `_system/probes/local-storage/<nonce>/...` object
- verifies put/head/exists/get/archive/remove
- cleans probe keys
- exits non-zero on failure

## Historical Document Inventory

Before changing provider settings in production, inventory registry provenance:

```sql
SELECT storage_provider, COUNT(*)
FROM eazinvoice_documents
GROUP BY storage_provider;
```

Recommended additional inventory:

```sql
SELECT storage_provider, classification, status, COUNT(*)
FROM eazinvoice_documents
GROUP BY storage_provider, classification, status
ORDER BY storage_provider, classification, status;
```

Registry compatibility does not automatically migrate historical binary files.

## Backup / Recovery Model

PostgreSQL registry and disk binaries are separate assets.

- Restoring DB only does not restore PDF/image bytes.
- Restoring disk only does not restore metadata/authorization state.
- Operational backup/recovery must cover both assets.

Render snapshot/retention policy is an infrastructure responsibility external to repository code.

## Future Azure Path

Azure adapter remains available for future migration:
- `apps/api/src/azure-blob-document-storage.js`
- `npm run document-storage:azure-check`

Future provider migration should preserve DocumentService, registry authority, and business workflows.
