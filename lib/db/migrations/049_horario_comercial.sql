-- Horário comercial do tenant, usado pra travar disparo ESPONTÂNEO de
-- mensagem (Revenue Scout, follow-up SDR, campanhas de reativação/churn) —
-- resposta a cliente que chamou nunca é bloqueada por isso, só o disparo
-- que o próprio sistema inicia sozinho.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS horario_comercial_inicio integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS horario_comercial_fim integer NOT NULL DEFAULT 18;
