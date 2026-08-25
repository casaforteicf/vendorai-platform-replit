-- Botão "nunca ativar agente" — pedido real do Marcos: alguns contatos
-- no WhatsApp são pessoais (não são leads de negócio de verdade), e o
-- agente de IA não deve nunca interagir com eles. Diferente do lock
-- temporário (active_agent_lock, liberado quando o atendente reativa),
-- essa é uma decisão permanente por lead, marcada manualmente.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS agente_desativado BOOLEAN NOT NULL DEFAULT false;
