-- Auditoria de toda troca de responsável por um lead — automática (motor de
-- round-robin) ou manual (admin reatribuindo). responsavel_anterior_id null
-- = primeira atribuição do lead (não existia responsável antes).
-- alterado_por_id null = mudança feita pelo sistema sem usuário autenticado
-- (ex: lead capturado no site institucional público).
CREATE TABLE IF NOT EXISTS lead_responsavel_historico (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  responsavel_anterior_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  responsavel_novo_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alterado_por_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  motivo TEXT NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_responsavel_historico_lead_idx ON lead_responsavel_historico(lead_id);
