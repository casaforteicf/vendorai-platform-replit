-- Classifica cada item do catálogo interno como Serviço, Produto ou
-- Oferta -- categoria/nome já agrupa "o que é", esse campo classifica
-- "que tipo de coisa é" (ex: Agente SDR = serviço contínuo; Pipeline de
-- Negócios = produto/ferramenta; passe pré-pago de 5 dias = oferta).
ALTER TABLE produtos_internos
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'produto';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'produtos_internos_tipo_check'
      AND conrelid = 'produtos_internos'::regclass
  ) THEN
    ALTER TABLE produtos_internos
      ADD CONSTRAINT produtos_internos_tipo_check
      CHECK (tipo IN ('servico', 'produto', 'oferta'));
  END IF;
END
$$;
