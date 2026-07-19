-- no-transaction
-- deal_etapa enum: add conferencia_estoque value (requires no-transaction in some PG versions)
ALTER TYPE deal_etapa ADD VALUE IF NOT EXISTS 'conferencia_estoque';
