-- Aditiva; solicitar aprovação antes da aplicação em homologação/produção.
ALTER TABLE public.intercompany_commission_payments
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS intercompany_commission_payments_idempotency_uidx
  ON public.intercompany_commission_payments (commission_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
