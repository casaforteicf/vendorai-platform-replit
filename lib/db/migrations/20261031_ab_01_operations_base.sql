-- AB-01: base operacional de A&B — cargos por hotel.
--
-- Decisão de arquitetura (2026-10-31): NÃO existe segunda tabela de locais de
-- estoque. A fonte única de verdade continua sendo hotel_stock_locations
-- (HOTEL-01); esta migration apenas acrescenta os tipos de A&B ao CHECK de
-- `kind`. A coluna é text + CHECK (não é um ENUM do Postgres), então "adicionar
-- valores ao enum" = recriar a constraint com a lista estendida.

CREATE TABLE IF NOT EXISTS ab_cargos (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome text NOT NULL,
  setor text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Dois cargos com o mesmo nome no mesmo hotel são quase sempre duplicidade.
CREATE UNIQUE INDEX IF NOT EXISTS ab_cargos_tenant_nome_uidx
  ON ab_cargos(tenant_id, nome);
CREATE INDEX IF NOT EXISTS ab_cargos_tenant_setor_idx
  ON ab_cargos(tenant_id, setor);

ALTER TABLE ab_cargos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ab_cargos_tenant_isolation ON ab_cargos;
CREATE POLICY ab_cargos_tenant_isolation ON ab_cargos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Locais de estoque: reusa hotel_stock_locations, apenas amplia os tipos.
-- (tabela estava vazia — 0 linhas — então não há dado a migrar)
ALTER TABLE hotel_stock_locations
  DROP CONSTRAINT IF EXISTS hotel_stock_locations_kind_check;
ALTER TABLE hotel_stock_locations
  ADD CONSTRAINT hotel_stock_locations_kind_check
  CHECK (kind IN (
    'central',
    'kitchen',
    'restaurant',
    'bar',
    'other',
    'camara_fria',
    'freezer',
    'seco'
  ));
