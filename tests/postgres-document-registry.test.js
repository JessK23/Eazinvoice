import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { withPostgresClient } from "../apps/api/src/postgres.js";

const HAS_DATABASE = Boolean(String(process.env.DATABASE_URL || "").trim());

(HAS_DATABASE ? test : test.skip)("postgres document registry persists authoritative metadata", async () => {
  const documentId = `doc_${crypto.randomUUID()}`;
  const businessId = `biz_${crypto.randomUUID()}`;
  const ownerUserId = `usr_${crypto.randomUUID()}`;
  const idempotencyKey = `idem-${crypto.randomUUID()}`;

  await withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `insert into eazinvoice_documents
          (id, owner_user_id, business_id, classification, related_entity_type, related_entity_id,
           storage_provider, storage_key, original_filename, mime_type, size_bytes, checksum_sha256,
           status, retention_class, security_class, created_by_user_id, idempotency_key, record)
         values
          ($1, $2, $3, 'kyc', 'company', 'cmp_pg', 'local', $4, 'pan.pdf', 'application/pdf',
           18, $5, 'available', 'kyc', 'restricted', $2, $6, $7::jsonb)`,
        [
          documentId,
          ownerUserId,
          businessId,
          `business/${businessId}/kyc/${documentId}.pdf`,
          crypto.createHash("sha256").update("postgres-document").digest("hex"),
          idempotencyKey,
          JSON.stringify({ phase: "phase1" }),
        ],
      );

      const persisted = await client.query(
        `select id, business_id, classification, related_entity_type, related_entity_id,
                storage_provider, storage_key, size_bytes, checksum_sha256, status, idempotency_key
           from eazinvoice_documents
          where id = $1`,
        [documentId],
      );
      assert.equal(persisted.rowCount, 1);
      assert.equal(persisted.rows[0].id, documentId);
      assert.equal(persisted.rows[0].business_id, businessId);
      assert.equal(persisted.rows[0].classification, "kyc");
      assert.equal(persisted.rows[0].status, "available");
      assert.equal(persisted.rows[0].idempotency_key, idempotencyKey);

      await assert.rejects(
        client.query(
          `insert into eazinvoice_documents
            (id, owner_user_id, business_id, classification, storage_provider, storage_key, status, idempotency_key)
           values
            ($1, $2, $3, 'kyc', 'local', $4, 'available', $5)`,
          [
            `doc_${crypto.randomUUID()}`,
            ownerUserId,
            businessId,
            `business/${businessId}/kyc/${crypto.randomUUID()}.pdf`,
            idempotencyKey,
          ],
        ),
      );

      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
});
