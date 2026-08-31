-- Corrige o valor do passe de acesso pré-pago: R$399,00 -> R$399,99.
-- A trava (CHECK) e o default antigos exigiam exatamente 399.00; agora
-- exigem exatamente 399.99, mesmo padrão de segurança (valor fixo, sem
-- lançamento arbitrário), só com o novo valor combinado.
ALTER TABLE access_pass_purchases
  DROP CONSTRAINT IF EXISTS access_pass_purchases_amount_check;

ALTER TABLE access_pass_purchases
  ALTER COLUMN amount SET DEFAULT 399.99;

ALTER TABLE access_pass_purchases
  ADD CONSTRAINT access_pass_purchases_amount_check CHECK (amount = 399.99);
