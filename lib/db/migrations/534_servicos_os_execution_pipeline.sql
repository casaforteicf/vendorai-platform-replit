-- OS executável: vínculo com negócio, modelo, checklist auditável, timeline e portal do cliente.
ALTER TABLE servicos_ordens
  ADD COLUMN IF NOT EXISTS negocio_id text REFERENCES deals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modelo_execucao varchar(40) NOT NULL DEFAULT 'geral',
  ADD COLUMN IF NOT EXISTS checklist_execucao jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS historico_execucao jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cliente_acompanha boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

ALTER TABLE servicos_ordens
  ALTER COLUMN status TYPE varchar(30);

CREATE INDEX IF NOT EXISTS idx_servicos_ordens_negocio
  ON servicos_ordens (tenant_id, negocio_id)
  WHERE negocio_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_servicos_ordens_modelo_status
  ON servicos_ordens (tenant_id, modelo_execucao, status);
