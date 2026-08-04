-- Programa de marca (white-label), independente da vertical do tenant.
-- Ex: "arqdor" — marca oficial pra escritórios de arquitetura E seus
-- fornecedores/parceiros na Rede de Parceiros, independente da vertical
-- própria de cada um.

CREATE TABLE IF NOT EXISTS brand_programs (
  id text PRIMARY KEY,
  nome_exibicao text NOT NULL,
  logo_url text,
  cor_primaria text,
  descricao text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS programa_marca text;
CREATE INDEX IF NOT EXISTS idx_tenants_programa_marca ON tenants(programa_marca);

INSERT INTO brand_programs (id, nome_exibicao, cor_primaria, descricao)
VALUES ('arqdor', 'Arqdor.ai', '#F4171F', 'Marca-branca do Vendor.ai pra escritórios de arquitetura e design e seus fornecedores/parceiros')
ON CONFLICT (id) DO NOTHING;
