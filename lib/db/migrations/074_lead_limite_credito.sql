-- Limite de crédito B2B — genérico (distribuidora/atacado em geral),
-- pedido #14 do documento de Distribuidora de Alimentos. Direto no lead,
-- não calculado de erp_titulos (sem vínculo confiável — só campo texto
-- solto "pessoa").

ALTER TABLE leads ADD COLUMN IF NOT EXISTS limite_credito numeric(14,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS credito_utilizado numeric(14,2);
