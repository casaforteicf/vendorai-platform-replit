-- Deduplicate open MEP host reviews per architecture revision and cause.
-- Applied only after migrations 565-567 are independently validated.
DELETE FROM arqdor_mep_host_reviews a USING arqdor_mep_host_reviews b
WHERE a.tenant_id=b.tenant_id AND a.project_id=b.project_id
AND a.node_id=b.node_id AND a.host_element_id=b.host_element_id
AND a.reason=b.reason AND a.architecture_updated_at=b.architecture_updated_at
AND a.status='requires_review' AND b.status='requires_review'
AND (a.created_at,a.id)>(b.created_at,b.id);
CREATE UNIQUE INDEX IF NOT EXISTS arqdor_mep_host_review_open_unique_idx
 ON arqdor_mep_host_reviews(tenant_id,project_id,node_id,host_element_id,reason,architecture_updated_at)
 WHERE status='requires_review';
