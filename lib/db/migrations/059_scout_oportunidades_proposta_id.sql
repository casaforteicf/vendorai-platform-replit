-- Vincula oportunidades do Revenue Scout a um orçamento específico — usado
-- pelo novo tipo de regra "orcamento_parado" (recuperação de orçamentos
-- parados no funil, sem avançar nem serem recusados há X dias).

ALTER TABLE scout_oportunidades ADD COLUMN IF NOT EXISTS proposta_id text;
