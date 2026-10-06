-- Configuração de campos adicionais por modelo de ordem de serviço.
CREATE TABLE IF NOT EXISTS servicos_modelos_os (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  modelo_execucao varchar(40) NOT NULL,
  campos_personalizados jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS servicos_modelos_os_tenant_modelo_uidx
  ON servicos_modelos_os (tenant_id, modelo_execucao);
