-- Preserve separate review proposals made from one architectural revision.
-- Migration 568 deduplicated existing pending records; this migration expands identity
-- to a normalized candidate-wall fingerprint, preserving legacy records.
ALTER TABLE arqdor_mep_host_reviews
 ADD COLUMN IF NOT EXISTS proposal_hash text NOT NULL DEFAULT 'legacy';
ALTER TABLE arqdor_mep_host_reviews
 ADD COLUMN IF NOT EXISTS operation_id text;
DROP INDEX IF EXISTS arqdor_mep_host_review_open_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS arqdor_mep_host_review_proposal_unique_idx
 ON arqdor_mep_host_reviews
 (tenant_id,project_id,node_id,host_element_id,reason,architecture_updated_at,proposal_hash)
 WHERE status='requires_review';
CREATE INDEX IF NOT EXISTS arqdor_mep_host_review_operation_idx
 ON arqdor_mep_host_reviews(tenant_id,project_id,operation_id);
