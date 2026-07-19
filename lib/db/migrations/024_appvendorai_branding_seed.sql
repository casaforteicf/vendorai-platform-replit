-- Seed: correct brand name for appvendor.ai tenant
-- Idempotent: only updates if the name differs from target value
UPDATE business_profiles
SET    nome_fantasia = 'appvendor.ai', updated_at = NOW()
WHERE  tenant_id = '1d4ea673-58d0-413a-a554-c9aca72a3121'
  AND  (nome_fantasia IS DISTINCT FROM 'appvendor.ai');

UPDATE tenants
SET    name = 'appvendor.ai', updated_at = NOW()
WHERE  id = '1d4ea673-58d0-413a-a554-c9aca72a3121'
  AND  (name IS DISTINCT FROM 'appvendor.ai');
