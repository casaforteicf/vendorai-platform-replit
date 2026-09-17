-- Arqdor passa a referenciar os registros canônicos do Vendor.ai em vez de
-- duplicar cliente, negócio, proposta e obra. Todos os vínculos são opcionais
-- para manter compatibilidade com projetos existentes.

ALTER TABLE arch_projetos ADD COLUMN IF NOT EXISTS lead_id text;
ALTER TABLE arch_projetos ADD COLUMN IF NOT EXISTS deal_id text;
ALTER TABLE arch_projetos ADD COLUMN IF NOT EXISTS proposta_id text;
ALTER TABLE arch_projetos ADD COLUMN IF NOT EXISTS obra_id text;

DO $$
BEGIN
  ALTER TABLE arch_projetos
    ADD CONSTRAINT arch_projetos_lead_id_fkey
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE arch_projetos
    ADD CONSTRAINT arch_projetos_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE arch_projetos
    ADD CONSTRAINT arch_projetos_proposta_id_fkey
    FOREIGN KEY (proposta_id) REFERENCES propostas(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE arch_projetos
    ADD CONSTRAINT arch_projetos_obra_id_fkey
    FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS arch_projetos_lead_id_idx ON arch_projetos(lead_id);
CREATE INDEX IF NOT EXISTS arch_projetos_deal_id_idx ON arch_projetos(deal_id);
CREATE INDEX IF NOT EXISTS arch_projetos_proposta_id_idx ON arch_projetos(proposta_id);
CREATE INDEX IF NOT EXISTS arch_projetos_obra_id_idx ON arch_projetos(obra_id);
