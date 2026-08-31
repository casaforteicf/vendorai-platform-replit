-- Relaciona cada produto interno (Admin -> Produtos) aos nichos/segmentos
-- em que ele faz mais sentido como oferta de marketing (ex: "Controle de
-- Licença de Acesso" não é relevante pra Farmácia, mas "Controle de
-- Receita Médica com Validade" sim). Array de texto livre (nomes de
-- segmento, iguais aos já usados em segment_templates) -- sem enum fixo
-- pra não precisar de migration toda vez que um nicho novo entrar.
ALTER TABLE produtos_internos
  ADD COLUMN IF NOT EXISTS nichos_relacionados jsonb NOT NULL DEFAULT '[]'::jsonb;
