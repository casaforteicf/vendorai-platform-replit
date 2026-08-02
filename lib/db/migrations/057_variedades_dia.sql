-- Variedades do dia — conteúdo real gerado por parceiros (não mais os 4
-- textos fixos que giravam por dia da semana). Cada categoria (viagens,
-- receitas, variedades — extensível sem migration nova, é texto livre)
-- tem só 1 vaga por dia, por ordem de chegada (índice único parcial abaixo
-- garante isso a nível de banco). Expira sozinho em 24h, igual os stories.
-- Promoção é opcional e pode ser: produto real do catálogo com desconto,
-- OU texto livre (anúncio sem produto vinculado) — nunca os dois.
CREATE TABLE IF NOT EXISTS variedades_dia (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  categoria text NOT NULL,
  titulo text NOT NULL,
  conteudo_texto text,
  video_url text,
  imagem_url text,
  promocao_tipo text CHECK (promocao_tipo IN ('produto', 'texto_livre')),
  promocao_produto_id text REFERENCES produtos_catalogo(id) ON DELETE SET NULL,
  promocao_desconto_percentual numeric(5,2),
  promocao_texto text,
  data_referencia date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  expires_at timestamp NOT NULL DEFAULT (now() + interval '24 hours')
);

-- 1 vaga por categoria por dia — só entre os ativos, então se alguém
-- remover o post antes de expirar a vaga libera de novo no mesmo dia.
CREATE UNIQUE INDEX IF NOT EXISTS variedades_dia_slot_idx
  ON variedades_dia (categoria, data_referencia)
  WHERE ativo = true;

CREATE INDEX IF NOT EXISTS variedades_dia_tenant_idx ON variedades_dia (tenant_id, created_at DESC);
