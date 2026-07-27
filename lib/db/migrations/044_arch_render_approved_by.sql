-- Auditoria Render Studio: approvedBy vinha do corpo da requisição, não
-- verificado contra o usuário autenticado, e nem persistia no banco (só ia
-- pro log). Corrigido: agora vem do JWT e é gravado de verdade.
ALTER TABLE arch_ai_renders
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approved_at timestamp;
