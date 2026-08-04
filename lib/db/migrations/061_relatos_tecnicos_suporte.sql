-- Todo chat com o agente de Suporte interno agora fica registrado em
-- relatos_tecnicos (não só quando um bug é formalmente aberto). Novos
-- campos: título curto e usuário que estava conversando.

ALTER TABLE relatos_tecnicos ADD COLUMN IF NOT EXISTS titulo text;
ALTER TABLE relatos_tecnicos ADD COLUMN IF NOT EXISTS usuario_id text;
