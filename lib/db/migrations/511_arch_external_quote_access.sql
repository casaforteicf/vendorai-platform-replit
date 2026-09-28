ALTER TABLE arch_solicitacoes
  ADD COLUMN IF NOT EXISTS external_access_token text;

CREATE UNIQUE INDEX IF NOT EXISTS arch_solicitacoes_external_access_token_uidx
  ON arch_solicitacoes (external_access_token)
  WHERE external_access_token IS NOT NULL;
