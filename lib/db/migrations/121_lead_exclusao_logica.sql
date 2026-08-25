-- Exclusão passa a ser lógica, não física: lead excluído não some do
-- banco, só sai das listagens padrão e vira visível numa aba
-- "Excluídos" com o motivo registrado. Pedido real: perder o histórico
-- de por que um lead foi excluído (e o lead em si) sem chance de
-- reverter era arriscado demais pra uma decisão de 1 clique.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS excluido_em TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS motivo_exclusao TEXT;
CREATE INDEX IF NOT EXISTS leads_excluido_em_idx ON leads (tenant_id, excluido_em);
