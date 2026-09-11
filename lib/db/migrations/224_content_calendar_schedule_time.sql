-- Horário específico por item do calendário de conteúdo.
-- Mantemos data_agendada separada por compatibilidade com o calendário existente
-- e adicionamos horário opcional para campanhas curtas (horas) e slots individuais.
ALTER TABLE content_calendar_items
  ADD COLUMN IF NOT EXISTS horario_agendado text;

-- HH:mm; NULL continua significando "usar o horário padrão do plano".
ALTER TABLE content_calendar_items
  DROP CONSTRAINT IF EXISTS content_calendar_items_horario_agendado_check;

ALTER TABLE content_calendar_items
  ADD CONSTRAINT content_calendar_items_horario_agendado_check
  CHECK (horario_agendado IS NULL OR horario_agendado ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
