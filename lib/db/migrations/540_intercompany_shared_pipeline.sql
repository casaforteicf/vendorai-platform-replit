-- Fluxo interempresa: o mesmo negócio mantém uma posição por tenant participante.
-- O SLA continua vindo da etapa de destino; este campo guarda apenas o prazo calculado
-- para a participação atual, sem criar uma segunda configuração de SLA.

ALTER TABLE deal_tenant_participations
  ADD COLUMN IF NOT EXISTS function_id text,
  ADD COLUMN IF NOT EXISTS pipeline text NOT NULL DEFAULT 'comercial',
  ADD COLUMN IF NOT EXISTS stage text,
  ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz,
  ADD COLUMN IF NOT EXISTS stage_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_handoff_from_tenant_id text,
  ADD COLUMN IF NOT EXISTS last_handoff_at timestamptz;

DO $$ BEGIN
  ALTER TABLE deal_tenant_participations
    ADD CONSTRAINT deal_tenant_participations_function_id_fk
    FOREIGN KEY (function_id) REFERENCES tenant_user_functions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE deal_tenant_participations
    ADD CONSTRAINT deal_tenant_participations_last_handoff_from_tenant_id_fk
    FOREIGN KEY (last_handoff_from_tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS deal_tenant_participation_pipeline_stage_idx
  ON deal_tenant_participations (partner_tenant_id, pipeline, stage, status);


-- Novos vínculos interempresa podem consultar o andamento compartilhado e
-- abrir suporte pelo formulário padrão. Mantém as demais permissões intactas.
UPDATE tenant_commercial_partnerships
SET default_permissions = (
  SELECT jsonb_agg(DISTINCT permission)
  FROM jsonb_array_elements_text(
    COALESCE(default_permissions, '[]'::jsonb) || '["view_partner_progress","open_support"]'::jsonb
  ) AS permission
)
WHERE status = 'active';

UPDATE deal_tenant_participations
SET permissions = (
  SELECT jsonb_agg(DISTINCT permission)
  FROM jsonb_array_elements_text(
    COALESCE(permissions, '[]'::jsonb) || '["view_partner_progress","open_support"]'::jsonb
  ) AS permission
)
WHERE status = 'active';


-- Equipes/empresas externas comerciais usam as mesmas regras de distribuição
-- de leads dos usuários internos. Campos nulos preservam compatibilidade.
ALTER TABLE tenant_user_functions
  ADD COLUMN IF NOT EXISTS last_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS lead_assignment_enabled boolean,
  ADD COLUMN IF NOT EXISTS lead_assignment_cities jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lead_assignment_regions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lead_assignment_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lead_assignment_lat double precision,
  ADD COLUMN IF NOT EXISTS lead_assignment_lng double precision,
  ADD COLUMN IF NOT EXISTS lead_assignment_raio_km double precision;
