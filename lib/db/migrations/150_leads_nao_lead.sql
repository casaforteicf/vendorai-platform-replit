-- D-003/D-003A: classificar um lead como "não-lead" (colaborador,
-- fornecedor, parceiro, familiar, amigo, outro) -- diferente de
-- exclusão lógica (excluido_em/motivo_exclusao, migration anterior):
-- exclusão é "contato errado/indesejado"; não-lead é "contato válido,
-- só que não é prospect de venda". Sai da pipeline/análise de churn,
-- mas o registro continua acessível numa aba separada.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS nao_lead_tipo text,
  ADD COLUMN IF NOT EXISTS nao_lead_notas text,
  ADD COLUMN IF NOT EXISTS nao_lead_classificado_em timestamp;

ALTER TABLE leads
  ADD CONSTRAINT chk_leads_nao_lead_tipo
  CHECK (nao_lead_tipo IS NULL OR nao_lead_tipo IN ('colaborador', 'fornecedor', 'parceiro', 'familiar', 'amigo', 'outro'));

CREATE INDEX IF NOT EXISTS idx_leads_nao_lead_tipo
  ON leads (tenant_id)
  WHERE nao_lead_tipo IS NOT NULL;
