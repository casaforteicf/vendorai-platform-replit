-- Catálogo interno de "produtos" (funcionalidades) do Vendor.ai -- visível
-- só pra super_admin, uso de marketing/vendas interno. Não controla acesso
-- de tenant (isso continua sendo tenant_nav_modules) -- é só um catálogo de
-- referência do que existe na plataforma, com nome comercial e descrição
-- pronta pra reaproveitar em site/proposta/deck.
CREATE TABLE IF NOT EXISTS produtos_internos (
  id text PRIMARY KEY,
  categoria text NOT NULL,
  nome text NOT NULL,
  descricao_uso text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_produtos_internos_categoria ON produtos_internos (categoria, ordem);
