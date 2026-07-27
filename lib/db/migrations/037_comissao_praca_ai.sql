-- Comissão da Praça.ai por tenant (distinta de comissao_padrao_percentual,
-- que é do módulo de rede de parceiros/revenda).
-- Nota: as colunas deals.scout_oportunidade_id, deals.grupo_id e
-- deals.origem_pedido_praca_id já existiam no banco antes desta migration
-- (criadas via SQL direto em sessão anterior) — só o schema Drizzle estava
-- desatualizado, corrigido junto nesta mudança.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS comissao_praca_ai_percentual numeric(5,2) DEFAULT 8.00;
