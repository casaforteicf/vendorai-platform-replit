-- Pacote genérico (qualquer mistura de itens do catálogo, com preço
-- único) — diferente de varejo_combos, que só combina produto físico do
-- Varejo. Pedido do usuário: quarto+spa+jantar de hotel, mas serve pra
-- qualquer vertical (cesta de filhote, kit gripe etc).

CREATE TABLE IF NOT EXISTS pacotes (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  preco_pacote numeric(12,2) NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  produto_catalogo_id text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pacote_itens (
  id text PRIMARY KEY,
  pacote_id text NOT NULL REFERENCES pacotes(id) ON DELETE CASCADE,
  produto_id text NOT NULL REFERENCES produtos_catalogo(id) ON DELETE CASCADE,
  quantidade integer NOT NULL DEFAULT 1,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pacotes_tenant ON pacotes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pacote_itens_pacote ON pacote_itens(pacote_id);
