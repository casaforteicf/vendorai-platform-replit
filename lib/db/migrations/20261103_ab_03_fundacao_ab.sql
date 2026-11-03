-- AB-03: fundação de dados do módulo A&B — fichas, sobras, estoque preditivo e compras.
--
-- Escopo: SÓ DDL. Nenhum endpoint, nenhuma tela, nenhum dado semeado.
--
-- Convenções seguidas (ver 20261030_hotel_01_stock_locations.sql e
-- 20261031_ab_01_operations_base.sql):
--   * isolamento por tenant em duas camadas: RLS por `app.tenant_id` (policy
--     `<tabela>_tenant_isolation`) e FK composta `(tenant_id, x_id)` apontando
--     para `(tenant_id, id)` — assim uma referência cruzada entre hotéis não é
--     representável no banco, nem por engano.
--   * id `text` gerado pela aplicação (crypto.randomUUID()), como ab_cargos.
--   * quantidades em numeric(15,4); peso em kg numeric(12,3).
--
-- RELAÇÕES COM O QUE JÁ EXISTE (decisão registrada, não duplicação silenciosa):
--
--   1. hotel_recipe_cards / hotel_recipe_ingredients (HOTEL-02) já guardam
--      ficha técnica amarrADA a produtos_catalogo. As tabelas ab_fichas_tecnicas
--      / ab_ficha_insumos nascem para o fluxo de A&B, onde o insumo pode existir
--      sem produto de catálogo (a tela de FichaTecnica aceita nome livre). Elas
--      NÃO substituem as HOTEL-02 e nada as sincroniza automaticamente. A
--      convergência (uma única ficha por prato) é decisão pendente e está
--      registrada em docs/entregas/AB-03-20261103.md. Para tornar a convergência
--      barata, ab_ficha_insumos.insumo_id aponta para `insumos` (catálogo
--      central) quando o insumo estiver catalogado, e guarda o nome em snapshot.
--
--   2. hotel_stock_location_balances continua sendo a fonte transacional do
--      saldo FÍSICO por local. ab_estoque_saldos é a visão gerencial do motor
--      preditivo (saldo consolidado + política de reposição) e deve ser
--      atualizada por UMA rotina, nunca digitada à mão — senão viram duas
--      verdades para "quanto tem".
--
--   3. hotel_purchase_suggestions (HOTEL-03) é sugestão por previsão de refeição
--      e por local. ab_ordens_compra é a ordem de compra do motor preditivo por
--      período de cobertura. Fluxos distintos; não se substituem.
--
-- Aplicação: `pnpm --filter @workspace/db run migrate` (roda em transação; um
-- erro no meio reverte tudo e nada é registrado no ledger).

-- ─────────────────────────────────────────────────────────────────────────────
-- Índices de apoio para as FKs compostas
-- ─────────────────────────────────────────────────────────────────────────────

-- `insumos` é o catálogo central (tenant_id, nome, unidade, preço, perda padrão).
-- Faltava o índice único que permite a FK composta por tenant.
CREATE UNIQUE INDEX IF NOT EXISTS ab_insumos_tenant_id_uidx
  ON insumos(tenant_id, id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Fichas técnicas de A&B
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ab_fichas_tecnicas (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (length(btrim(nome)) > 0),
  -- Rendimento em porções (o que a tela de FichaTecnica pede). Fichas que
  -- rendem kg/l ficam para um lote seguinte, com unidade explícita.
  rendimento_porcoes numeric(12,3) NOT NULL CHECK (rendimento_porcoes > 0),
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ab_fichas_tecnicas_tenant_id_uq UNIQUE (tenant_id, id),
  -- Dois pratos com o mesmo nome no mesmo hotel são quase sempre duplicidade.
  CONSTRAINT ab_fichas_tecnicas_tenant_nome_uq UNIQUE (tenant_id, nome)
);

CREATE TABLE IF NOT EXISTS ab_ficha_insumos (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ficha_id text NOT NULL,
  -- Vínculo opcional ao catálogo central. Nulo = insumo ainda não catalogado,
  -- que é o estado normal enquanto a ficha é montada na cozinha.
  insumo_id text,
  -- Snapshot do nome: a ficha precisa continuar legível mesmo se o item do
  -- catálogo for renomeado ou removido.
  insumo_nome text NOT NULL CHECK (length(btrim(insumo_nome)) > 0),
  unidade_base text NOT NULL CHECK (unidade_base IN ('g', 'ml', 'un')),
  quantidade_por_porcao numeric(15,4) NOT NULL CHECK (quantidade_por_porcao >= 0),
  -- Fator de correção (perda/limpeza). 1 = sem perda. Zero ou negativo é
  -- digitação errada e inflaria a compra para baixo em silêncio.
  fator_correcao numeric(8,4) NOT NULL DEFAULT 1 CHECK (fator_correcao > 0),
  ordem integer NOT NULL DEFAULT 0 CHECK (ordem >= 0),
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, ficha_id)
    REFERENCES ab_fichas_tecnicas(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, insumo_id)
    REFERENCES insumos(tenant_id, id)
);

-- O mesmo insumo não entra duas vezes na mesma ficha — nem pelo catálogo...
CREATE UNIQUE INDEX IF NOT EXISTS ab_ficha_insumos_catalogo_uidx
  ON ab_ficha_insumos(tenant_id, ficha_id, insumo_id)
  WHERE insumo_id IS NOT NULL;

-- ...nem por nome livre (comparação sem caixa e sem espaços nas pontas).
CREATE UNIQUE INDEX IF NOT EXISTS ab_ficha_insumos_nome_uidx
  ON ab_ficha_insumos(tenant_id, ficha_id, lower(btrim(insumo_nome)))
  WHERE insumo_id IS NULL;

CREATE INDEX IF NOT EXISTS ab_fichas_tecnicas_tenant_ativo_idx
  ON ab_fichas_tecnicas(tenant_id, ativo);
CREATE INDEX IF NOT EXISTS ab_ficha_insumos_ficha_idx
  ON ab_ficha_insumos(tenant_id, ficha_id, ordem);
CREATE INDEX IF NOT EXISTS ab_ficha_insumos_insumo_idx
  ON ab_ficha_insumos(tenant_id, insumo_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Sobras e desperdício
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ab_sobras (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Sem DEFAULT: o dia é o do hotel, não o do fuso do servidor. A aplicação
  -- envia a data já no fuso local (ver lib/ab/datas.ts no frontend).
  data date NOT NULL,
  insumo_id text,
  insumo_nome text NOT NULL CHECK (length(btrim(insumo_nome)) > 0),
  peso_kg numeric(12,3) NOT NULL CHECK (peso_kg > 0),
  motivo text NOT NULL CHECK (motivo IN (
    'erro_producao',
    'sobra_buffet',
    'validade_vencida'
  )),
  -- URL do objeto no storage (R2) — sem backend, a tela ainda não envia.
  foto_url text,
  observacao text,
  registrado_por text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, insumo_id) REFERENCES insumos(tenant_id, id),
  FOREIGN KEY (tenant_id, registrado_por) REFERENCES users(tenant_id, id)
);

-- Não há UNIQUE por (data, insumo): dois serviços no mesmo dia podem gerar
-- duas sobras legítimas do mesmo item (almoço e jantar).
CREATE INDEX IF NOT EXISTS ab_sobras_tenant_data_idx
  ON ab_sobras(tenant_id, data DESC);
CREATE INDEX IF NOT EXISTS ab_sobras_tenant_insumo_data_idx
  ON ab_sobras(tenant_id, insumo_id, data DESC);
CREATE INDEX IF NOT EXISTS ab_sobras_tenant_motivo_idx
  ON ab_sobras(tenant_id, motivo, data DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Saldos e política de reposição (motor preditivo)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ab_estoque_saldos (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  insumo_id text NOT NULL,
  -- Visão gerencial consolidada do hotel. A fonte transacional continua sendo
  -- hotel_stock_location_balances + hotel_stock_transfer_ledger; este campo é
  -- derivado e tem um único escritor (rotina de consolidação).
  saldo_atual numeric(15,4) NOT NULL DEFAULT 0 CHECK (saldo_atual >= 0),
  unidade text NOT NULL CHECK (unidade IN ('g', 'ml', 'un')),
  estoque_minimo numeric(15,4) NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0),
  -- Dispara a sugestão de compra. Por definição é >= mínimo: pedir depois de
  -- furar o mínimo é justamente o que o motor preditivo existe para evitar.
  ponto_pedido numeric(15,4) NOT NULL DEFAULT 0 CHECK (ponto_pedido >= 0),
  lead_time_dias integer NOT NULL DEFAULT 0 CHECK (lead_time_dias BETWEEN 0 AND 365),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ab_estoque_saldos_tenant_insumo_uq UNIQUE (tenant_id, insumo_id),
  CONSTRAINT ab_estoque_saldos_ponto_maior_igual_minimo
    CHECK (ponto_pedido >= estoque_minimo),
  FOREIGN KEY (tenant_id, insumo_id)
    REFERENCES insumos(tenant_id, id) ON DELETE CASCADE
);

-- Consulta do motor: "quais insumos já estão no ponto de pedido?".
CREATE INDEX IF NOT EXISTS ab_estoque_saldos_reposicao_idx
  ON ab_estoque_saldos(tenant_id)
  WHERE saldo_atual <= ponto_pedido;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Histórico de consumo (base da média diária)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ab_historico_consumo (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  insumo_id text NOT NULL,
  data date NOT NULL,
  quantidade numeric(15,4) NOT NULL CHECK (quantidade >= 0),
  unidade text NOT NULL CHECK (unidade IN ('g', 'ml', 'un')),
  -- 'producao' = consumo real da produção; 'ajuste' = correção de inventário;
  -- 'manual' = lançamento do gerente.
  --
  -- Sobra NÃO entra aqui: o insumo já foi contabilizado como consumo quando
  -- saiu para a produção. Somar a sobra junto contaria duas vezes e inflaria a
  -- média diária — a sobra é indicador de qualidade (ab_sobras), não consumo.
  origem text NOT NULL DEFAULT 'producao'
    CHECK (origem IN ('producao', 'ajuste', 'manual')),
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Agregado diário idempotente: recalcular o dia substitui, não duplica.
  CONSTRAINT ab_historico_consumo_chave_uq UNIQUE (tenant_id, insumo_id, data, origem),
  FOREIGN KEY (tenant_id, insumo_id)
    REFERENCES insumos(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ab_historico_consumo_insumo_data_idx
  ON ab_historico_consumo(tenant_id, insumo_id, data DESC);
CREATE INDEX IF NOT EXISTS ab_historico_consumo_data_idx
  ON ab_historico_consumo(tenant_id, data DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Ordens de compra geradas pelo motor
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ab_ordens_compra (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Período que a compra precisa cobrir (ex.: próxima semana).
  cobertura_inicio date NOT NULL,
  cobertura_fim date NOT NULL,
  status text NOT NULL DEFAULT 'sugerida' CHECK (status IN (
    'sugerida',
    'aprovada',
    'enviada',
    'recebida',
    'cancelada'
  )),
  observacao text,
  aprovada_por text,
  aprovada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ab_ordens_compra_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT ab_ordens_compra_periodo_valido
    CHECK (cobertura_fim >= cobertura_inicio),
  FOREIGN KEY (tenant_id, aprovada_por) REFERENCES users(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS ab_ordem_compra_itens (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ordem_id text NOT NULL,
  insumo_id text NOT NULL,
  -- Snapshot do nome: a ordem emitida não pode mudar porque o catálogo mudou.
  insumo_nome text NOT NULL CHECK (length(btrim(insumo_nome)) > 0),
  quantidade numeric(15,4) NOT NULL CHECK (quantidade > 0),
  unidade text NOT NULL CHECK (unidade IN ('g', 'ml', 'un')),
  -- Custo é estimativa (preço do catálogo na geração), não compromisso fiscal.
  custo_estimado numeric(15,4) CHECK (custo_estimado >= 0),
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ab_ordem_compra_itens_chave_uq UNIQUE (tenant_id, ordem_id, insumo_id),
  FOREIGN KEY (tenant_id, ordem_id)
    REFERENCES ab_ordens_compra(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, insumo_id)
    REFERENCES insumos(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS ab_ordens_compra_tenant_status_idx
  ON ab_ordens_compra(tenant_id, status, cobertura_inicio DESC);
CREATE INDEX IF NOT EXISTS ab_ordem_compra_itens_ordem_idx
  ON ab_ordem_compra_itens(tenant_id, ordem_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Isolamento por tenant (RLS) — uma policy por tabela, padrão do AB-01
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ab_fichas_tecnicas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ab_fichas_tecnicas_tenant_isolation ON ab_fichas_tecnicas;
CREATE POLICY ab_fichas_tecnicas_tenant_isolation ON ab_fichas_tecnicas
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE ab_ficha_insumos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ab_ficha_insumos_tenant_isolation ON ab_ficha_insumos;
CREATE POLICY ab_ficha_insumos_tenant_isolation ON ab_ficha_insumos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE ab_sobras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ab_sobras_tenant_isolation ON ab_sobras;
CREATE POLICY ab_sobras_tenant_isolation ON ab_sobras
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE ab_estoque_saldos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ab_estoque_saldos_tenant_isolation ON ab_estoque_saldos;
CREATE POLICY ab_estoque_saldos_tenant_isolation ON ab_estoque_saldos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE ab_historico_consumo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ab_historico_consumo_tenant_isolation ON ab_historico_consumo;
CREATE POLICY ab_historico_consumo_tenant_isolation ON ab_historico_consumo
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE ab_ordens_compra ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ab_ordens_compra_tenant_isolation ON ab_ordens_compra;
CREATE POLICY ab_ordens_compra_tenant_isolation ON ab_ordens_compra
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE ab_ordem_compra_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ab_ordem_compra_itens_tenant_isolation ON ab_ordem_compra_itens;
CREATE POLICY ab_ordem_compra_itens_tenant_isolation ON ab_ordem_compra_itens
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- Pendências registradas (ver docs/entregas/AB-03-20261103.md)
-- ─────────────────────────────────────────────────────────────────────────────
--   * Convergência ab_fichas_tecnicas ↔ hotel_recipe_cards (uma ficha por prato).
--   * Rotina única que recalcula ab_estoque_saldos.saldo_atual a partir de
--     hotel_stock_location_balances — até existir, o campo é gerido pela aplicação.
--   * Conversão de unidades (compra em kg/saco vs. consumo em g) antes de somar
--     saldo com sugestão de compra.
--   * Grants: herdam as default privileges de vendorai_app_login, como no AB-01.
