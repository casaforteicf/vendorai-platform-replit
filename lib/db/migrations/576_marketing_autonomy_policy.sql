-- Marketing IA: política granular de autonomia por tenant.
-- Mantém compatibilidade com automation_mode e autonomy_enabled_at,
-- mas separa publicação de otimização de orçamento.
ALTER TABLE content_autopilot_config
  ADD COLUMN IF NOT EXISTS marketing_autonomy_policy jsonb NOT NULL
  DEFAULT '{"level":0,"maxTransferFractionPerCycle":0.20}'::jsonb;
