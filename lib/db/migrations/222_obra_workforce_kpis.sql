-- ARQDOR / VendorAI — equipe da obra, metas e apontamentos de produção.
-- Permite vincular usuários internos ou executores externos por obra, com perfil de acesso próprio.

CREATE TABLE IF NOT EXISTS obra_executores (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  tipo text NOT NULL DEFAULT 'pessoa',
  nome text NOT NULL,
  funcao text NOT NULL DEFAULT 'outro',
  especialidade text,
  empresa text,
  telefone text,
  email text,
  responsavel_direto text,
  data_inicio date,
  data_fim date,
  tipo_contratacao text NOT NULL DEFAULT 'hora',
  valor_contratado numeric(14,2) NOT NULL DEFAULT 0,
  jornada text,
  centro_custo text,
  acesso_sistema boolean NOT NULL DEFAULT false,
  perfil_acesso text NOT NULL DEFAULT 'campo',
  permissoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'ativo',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT obra_executores_tipo_check
    CHECK (tipo IN ('pessoa','empresa','equipe')),
  CONSTRAINT obra_executores_status_check
    CHECK (status IN ('convidado','ativo','bloqueado','finalizado')),
  CONSTRAINT obra_executores_permissoes_array_check
    CHECK (jsonb_typeof(permissoes) = 'array'),
  CONSTRAINT obra_executores_valor_check
    CHECK (valor_contratado >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS obra_executores_obra_user_uidx
  ON obra_executores (obra_id, user_id)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS obra_executores_tenant_obra_idx
  ON obra_executores (tenant_id, obra_id, status);
CREATE INDEX IF NOT EXISTS obra_executores_funcao_idx
  ON obra_executores (tenant_id, obra_id, funcao);

CREATE TABLE IF NOT EXISTS obra_metas (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  executor_id text REFERENCES obra_executores(id) ON DELETE CASCADE,
  etapa_id text REFERENCES obra_etapas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'quantidade',
  valor_meta numeric(14,3) NOT NULL DEFAULT 0,
  unidade text,
  periodo text NOT NULL DEFAULT 'diaria',
  data_inicio date,
  data_fim date,
  peso numeric(7,3) NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'ativa',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT obra_metas_tipo_check
    CHECK (tipo IN ('quantidade','prazo','custo','qualidade','produtividade')),
  CONSTRAINT obra_metas_periodo_check
    CHECK (periodo IN ('diaria','semanal','mensal','etapa','obra')),
  CONSTRAINT obra_metas_status_check
    CHECK (status IN ('ativa','atingida','pausada','encerrada')),
  CONSTRAINT obra_metas_valor_check
    CHECK (valor_meta >= 0),
  CONSTRAINT obra_metas_peso_check
    CHECK (peso > 0)
);

CREATE INDEX IF NOT EXISTS obra_metas_tenant_obra_idx
  ON obra_metas (tenant_id, obra_id, status);
CREATE INDEX IF NOT EXISTS obra_metas_executor_idx
  ON obra_metas (executor_id, status);
CREATE INDEX IF NOT EXISTS obra_metas_etapa_idx
  ON obra_metas (etapa_id, status);

CREATE TABLE IF NOT EXISTS obra_apontamentos_producao (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  executor_id text REFERENCES obra_executores(id) ON DELETE SET NULL,
  etapa_id text REFERENCES obra_etapas(id) ON DELETE SET NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  quantidade numeric(14,3) NOT NULL DEFAULT 0,
  unidade text,
  horas numeric(8,2) NOT NULL DEFAULT 0,
  custo_mao_obra numeric(14,2) NOT NULL DEFAULT 0,
  retrabalho_quantidade numeric(14,3) NOT NULL DEFAULT 0,
  qualidade_nota numeric(5,2),
  bloqueio text,
  observacao text,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT obra_apontamentos_quantidade_check CHECK (quantidade >= 0),
  CONSTRAINT obra_apontamentos_horas_check CHECK (horas >= 0 AND horas <= 24),
  CONSTRAINT obra_apontamentos_custo_check CHECK (custo_mao_obra >= 0),
  CONSTRAINT obra_apontamentos_retrabalho_check CHECK (retrabalho_quantidade >= 0),
  CONSTRAINT obra_apontamentos_qualidade_check CHECK (qualidade_nota IS NULL OR (qualidade_nota >= 0 AND qualidade_nota <= 10))
);

CREATE INDEX IF NOT EXISTS obra_apontamentos_tenant_obra_data_idx
  ON obra_apontamentos_producao (tenant_id, obra_id, data DESC);
CREATE INDEX IF NOT EXISTS obra_apontamentos_executor_data_idx
  ON obra_apontamentos_producao (executor_id, data DESC);
CREATE INDEX IF NOT EXISTS obra_apontamentos_etapa_data_idx
  ON obra_apontamentos_producao (etapa_id, data DESC);

ALTER TABLE obra_executores ENABLE ROW LEVEL SECURITY;
ALTER TABLE obra_metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE obra_apontamentos_producao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendorai_tenant_access ON obra_executores;
DROP POLICY IF EXISTS vendorai_tenant_guard ON obra_executores;
CREATE POLICY vendorai_tenant_access ON obra_executores
  AS PERMISSIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());
CREATE POLICY vendorai_tenant_guard ON obra_executores
  AS RESTRICTIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());

DROP POLICY IF EXISTS vendorai_tenant_access ON obra_metas;
DROP POLICY IF EXISTS vendorai_tenant_guard ON obra_metas;
CREATE POLICY vendorai_tenant_access ON obra_metas
  AS PERMISSIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());
CREATE POLICY vendorai_tenant_guard ON obra_metas
  AS RESTRICTIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());

DROP POLICY IF EXISTS vendorai_tenant_access ON obra_apontamentos_producao;
DROP POLICY IF EXISTS vendorai_tenant_guard ON obra_apontamentos_producao;
CREATE POLICY vendorai_tenant_access ON obra_apontamentos_producao
  AS PERMISSIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());
CREATE POLICY vendorai_tenant_guard ON obra_apontamentos_producao
  AS RESTRICTIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE
  ON obra_executores, obra_metas, obra_apontamentos_producao
  TO vendorai_app;

COMMENT ON TABLE obra_executores IS 'Equipe e executores vinculados a uma obra, com perfil e permissões específicos por obra.';
COMMENT ON TABLE obra_metas IS 'Metas operacionais por obra, etapa e/ou executor.';
COMMENT ON TABLE obra_apontamentos_producao IS 'Produção diária, horas, custo, qualidade, retrabalho e bloqueios informados no canteiro.';
