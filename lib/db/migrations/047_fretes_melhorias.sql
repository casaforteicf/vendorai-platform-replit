-- Melhoria do módulo Fretes: solicitação agora pede TIPO de veículo (o
-- freteiro atribui o veículo real depois), mais informações importantes
-- (contatos no local, valor declarado, instruções especiais) e fotos de
-- prova (coleta e entrega separadas). Também marca a origem do pedido —
-- lojista (B2B direto) ou cliente final (vindo do Praça.ai) — pra o mesmo
-- parceiro freteiro atender os dois fluxos dentro do Vendor.ai.

CREATE TYPE fretes_origem AS ENUM ('direto', 'lojista', 'cliente_final');

ALTER TABLE fretes_cargas
  ADD COLUMN IF NOT EXISTS tipo_veiculo_desejado fretes_veiculo_tipo,
  ADD COLUMN IF NOT EXISTS origem fretes_origem NOT NULL DEFAULT 'direto',
  ADD COLUMN IF NOT EXISTS contato_coleta_nome text,
  ADD COLUMN IF NOT EXISTS contato_coleta_telefone text,
  ADD COLUMN IF NOT EXISTS contato_entrega_nome text,
  ADD COLUMN IF NOT EXISTS contato_entrega_telefone text,
  ADD COLUMN IF NOT EXISTS valor_declarado numeric(12,2),
  ADD COLUMN IF NOT EXISTS instrucoes_especiais text,
  ADD COLUMN IF NOT EXISTS fotos_coleta_urls jsonb,
  ADD COLUMN IF NOT EXISTS fotos_entrega_urls jsonb;

ALTER TABLE fretes_veiculos
  ADD COLUMN IF NOT EXISTS foto_url text;
