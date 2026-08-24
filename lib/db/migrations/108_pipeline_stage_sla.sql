-- SLA de tempo por etapa do pipeline + etapas customizáveis por tenant.
--
-- 1) deals.etapa vira TEXT (era enum fixo dealEtapaEnum). Os valores em
-- si NÃO mudam ("ganho" continua "ganho") — só o tipo da coluna, pra
-- permitir que tenants criem etapas novas sem precisar de ALTER TYPE.
-- Os ~29 arquivos do backend que comparam etapa contra strings literais
-- ("ganho", "perdido" etc. — automação de contrato/cobrança/reativação)
-- continuam funcionando sem nenhuma mudança neles.
ALTER TABLE deals ALTER COLUMN etapa DROP DEFAULT;
ALTER TABLE deals ALTER COLUMN etapa TYPE text USING etapa::text;
ALTER TABLE deals ALTER COLUMN etapa SET DEFAULT 'novo';

-- 2) Quando a etapa mudou pela última vez — precisa saber há quanto
-- tempo o card está parado ali pra calcular se estourou o SLA. Trigger
-- em vez de tocar nos ~29 pontos que já fazem UPDATE em deals.etapa —
-- cobre TODOS eles automaticamente, incluindo os que ainda não existem.
ALTER TABLE deals ADD COLUMN IF NOT EXISTS etapa_alterada_em TIMESTAMP NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION set_deal_etapa_alterada_em()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.etapa IS DISTINCT FROM OLD.etapa THEN
    NEW.etapa_alterada_em := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deal_etapa_alterada_em ON deals;
CREATE TRIGGER trg_deal_etapa_alterada_em
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION set_deal_etapa_alterada_em();

-- 3) Etapas do pipeline, configuráveis por tenant. As 11 etapas que já
-- existiam (antigo enum) ficam marcadas is_system=true — protegidas
-- contra exclusão ou troca de "key" (automação depende do valor exato),
-- mas label/cor/SLA são editáveis. Etapas novas (is_system=false) são
-- puramente organizacionais, sem nenhuma automação amarrada — o admin
-- pode criar quantas quiser. Semeadura das 11 padrão é feita sob
-- demanda pelo backend (primeira leitura por tenant), não aqui —
-- 8 fluxos diferentes criam tenant, semear direto na migration não
-- cobriria tenants criados depois.
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT,
  bg TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT false,
  sla_minutos INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, key)
);

CREATE INDEX IF NOT EXISTS pipeline_stages_tenant_idx ON pipeline_stages (tenant_id);
