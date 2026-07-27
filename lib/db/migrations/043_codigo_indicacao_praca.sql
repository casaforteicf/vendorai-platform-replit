-- Programa de Embaixadores do Praça.ai — captura do código de indicação de
-- lojista no cadastro do tenant, pra rastreabilidade.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS codigo_indicacao_praca text;
