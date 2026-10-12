-- Enforce stable client photo IDs for Arqdor Measure uploads.
-- Apply only through reviewed staging migration; never directly in production.
CREATE UNIQUE INDEX IF NOT EXISTS media_assets_measure_upload_id_unique
ON media_assets (tenant_id, (metadata->>'uploadId'))
WHERE metadata->>'origin' = 'arqdor_measure'
  AND metadata ? 'uploadId'
  AND NULLIF(metadata->>'uploadId','') IS NOT NULL;
