-- Modelos configuráveis de Ordem de Serviço por tenant.
CREATE TABLE IF NOT EXISTS servicos_os_modelos (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome varchar(120) NOT NULL,
  descricao text,
  tipo varchar(40) NOT NULL DEFAULT 'assistencia',
  ativo boolean NOT NULL DEFAULT true,
  padrao boolean NOT NULL DEFAULT false,
  campos jsonb NOT NULL DEFAULT '[]'::jsonb,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  cliente_acompanha_default boolean NOT NULL DEFAULT true,
  compartilhar_status_cliente_default boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE servicos_ordens
  ADD COLUMN IF NOT EXISTS modelo_os_id text REFERENCES servicos_os_modelos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_servicos_os_modelos_tenant_tipo
  ON servicos_os_modelos (tenant_id, tipo, ativo);

CREATE UNIQUE INDEX IF NOT EXISTS idx_servicos_os_modelos_padrao_tipo
  ON servicos_os_modelos (tenant_id, tipo)
  WHERE padrao = true AND ativo = true;

CREATE INDEX IF NOT EXISTS idx_servicos_ordens_modelo_os
  ON servicos_ordens (tenant_id, modelo_os_id)
  WHERE modelo_os_id IS NOT NULL;
