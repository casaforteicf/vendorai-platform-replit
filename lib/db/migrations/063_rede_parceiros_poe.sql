-- Rede de Parceiros entre tenants (Opportunity Engine) — opt-in por
-- categoria, cotação endereçada especificamente a um tenant parceiro real,
-- nunca visibilidade aberta entre tenants.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS parceiro_rede_ativo boolean NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS parceiro_categorias json DEFAULT '[]';

ALTER TABLE poe_quotation_requests ADD COLUMN IF NOT EXISTS partner_tenant_id text;
CREATE INDEX IF NOT EXISTS idx_poe_quot_req_partner_tenant ON poe_quotation_requests(partner_tenant_id);
