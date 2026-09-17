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

-- Segurança multi-tenant no próprio banco. A tela de criação do Arqdor já exige
-- selecionar um lead existente e copia nome/e-mail/telefone para o projeto.
-- Para manter compatibilidade sem duplicar cadastro, o banco recupera o lead
-- canônico automaticamente quando o cliente ainda não enviou lead_id.
CREATE OR REPLACE FUNCTION enforce_arch_projeto_vendor_links()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  linked_tenant text;
  proposal_lead text;
  proposal_deal text;
BEGIN
  IF NEW.lead_id IS NULL THEN
    SELECT l.id
      INTO NEW.lead_id
      FROM leads l
      WHERE l.tenant_id = NEW.tenant_id
        AND l.excluido_em IS NULL
        AND (
          (NEW.cliente_email IS NOT NULL AND l.email IS NOT NULL AND lower(trim(l.email)) = lower(trim(NEW.cliente_email)))
          OR
          (NEW.cliente_telefone IS NOT NULL AND l.telefone IS NOT NULL AND regexp_replace(l.telefone, '\D', '', 'g') = regexp_replace(NEW.cliente_telefone, '\D', '', 'g'))
        )
      ORDER BY
        CASE WHEN NEW.cliente_email IS NOT NULL AND l.email IS NOT NULL AND lower(trim(l.email)) = lower(trim(NEW.cliente_email)) THEN 0 ELSE 1 END,
        l.created_at DESC
      LIMIT 1;
  END IF;

  IF NEW.proposta_id IS NOT NULL THEN
    SELECT tenant_id, lead_id, deal_id
      INTO linked_tenant, proposal_lead, proposal_deal
      FROM propostas
      WHERE id = NEW.proposta_id;
    IF linked_tenant IS NULL OR linked_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'Proposta não pertence ao tenant do projeto';
    END IF;
    NEW.lead_id := proposal_lead;
    IF proposal_deal IS NOT NULL THEN
      NEW.deal_id := proposal_deal;
    END IF;
  END IF;

  IF NEW.deal_id IS NOT NULL THEN
    SELECT tenant_id, lead_id
      INTO linked_tenant, proposal_lead
      FROM deals
      WHERE id = NEW.deal_id;
    IF linked_tenant IS NULL OR linked_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'Negócio não pertence ao tenant do projeto';
    END IF;
    IF NEW.lead_id IS NULL AND proposal_lead IS NOT NULL THEN
      NEW.lead_id := proposal_lead;
    END IF;
  END IF;

  IF NEW.lead_id IS NOT NULL THEN
    SELECT tenant_id INTO linked_tenant FROM leads WHERE id = NEW.lead_id;
    IF linked_tenant IS NULL OR linked_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'Lead não pertence ao tenant do projeto';
    END IF;
  END IF;

  IF NEW.obra_id IS NOT NULL THEN
    SELECT tenant_id INTO linked_tenant FROM obras WHERE id = NEW.obra_id;
    IF linked_tenant IS NULL OR linked_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'Obra não pertence ao tenant do projeto';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_arch_projeto_vendor_links ON arch_projetos;
CREATE TRIGGER trg_arch_projeto_vendor_links
BEFORE INSERT OR UPDATE OF lead_id, deal_id, proposta_id, obra_id, tenant_id, cliente_email, cliente_telefone
ON arch_projetos
FOR EACH ROW
EXECUTE FUNCTION enforce_arch_projeto_vendor_links();

-- Visão única da jornada para relatórios/portal/integrações sem duplicar dados.
CREATE OR REPLACE VIEW arqdor_vendor_journey AS
SELECT
  p.id AS projeto_id,
  p.tenant_id,
  p.titulo AS projeto_titulo,
  p.status AS projeto_status,
  p.lead_id,
  l.nome AS cliente_nome,
  l.email AS cliente_email,
  l.telefone AS cliente_telefone,
  p.deal_id,
  d.titulo AS negocio_titulo,
  d.etapa AS negocio_etapa,
  d.valor AS negocio_valor,
  p.proposta_id,
  pr.titulo AS proposta_titulo,
  pr.status AS proposta_status,
  pr.valor_total AS proposta_valor,
  p.obra_id,
  o.nome AS obra_nome,
  o.status AS obra_status,
  o.orcamento_total AS obra_orcamento_total,
  o.custo_realizado AS obra_custo_realizado
FROM arch_projetos p
LEFT JOIN leads l ON l.id = p.lead_id AND l.tenant_id = p.tenant_id
LEFT JOIN deals d ON d.id = p.deal_id AND d.tenant_id = p.tenant_id
LEFT JOIN propostas pr ON pr.id = p.proposta_id AND pr.tenant_id = p.tenant_id
LEFT JOIN obras o ON o.id = p.obra_id AND o.tenant_id = p.tenant_id;
