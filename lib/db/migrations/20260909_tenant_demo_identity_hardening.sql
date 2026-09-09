-- Hardening complementar para identidade pública e ciclo Demo -> Cliente.
-- Seguro para reexecução após 20260908_tenant_admin_identity_commercial.sql.

-- Tenants demo antigos podem não ter data de início registrada. Usa a data de criação
-- como referência histórica sem alterar a validade já configurada.
UPDATE tenants
SET demo_started_at = COALESCE(demo_started_at, created_at)
WHERE is_demo = true
  AND demo_started_at IS NULL;

-- Todo Demo administrável deve ter validade. Para registros antigos sem validade,
-- aplica 5 dias a partir do início/criação, mantendo datas já existentes intactas.
UPDATE tenants
SET demo_expires_at = COALESCE(demo_expires_at, COALESCE(demo_started_at, created_at) + INTERVAL '5 days')
WHERE is_demo = true
  AND demo_expires_at IS NULL;

-- Sincroniza a sequence com o maior VAI já existente. Isso evita colisão caso o banco
-- já possua códigos atribuídos manualmente ou por uma execução parcial anterior.
SELECT setval(
  'tenant_public_code_seq',
  GREATEST(
    COALESCE((
      SELECT MAX(NULLIF(regexp_replace(tenant_code, '[^0-9]', '', 'g'), '')::bigint)
      FROM tenants
      WHERE tenant_code ~ '^VAI-[0-9]+$'
    ), 0),
    1
  ),
  true
);

-- A identidade pública é imutável depois de criada, mesmo fora da API.
CREATE OR REPLACE FUNCTION prevent_tenant_code_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.tenant_code IS DISTINCT FROM NEW.tenant_code THEN
    RAISE EXCEPTION 'tenant_code is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_tenant_code_immutable ON tenants;
CREATE TRIGGER tenants_tenant_code_immutable
BEFORE UPDATE OF tenant_code ON tenants
FOR EACH ROW
EXECUTE FUNCTION prevent_tenant_code_change();

-- Coerência mínima do período de Demo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_demo_period_check'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_demo_period_check
      CHECK (
        demo_expires_at IS NULL
        OR demo_started_at IS NULL
        OR demo_expires_at >= demo_started_at
      );
  END IF;
END $$;
