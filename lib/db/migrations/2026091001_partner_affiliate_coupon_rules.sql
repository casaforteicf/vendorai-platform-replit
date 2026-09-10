ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS tipo_parceiro text NOT NULL DEFAULT 'revendedor',
  ADD COLUMN IF NOT EXISTS comissao_percentual numeric(5,2),
  ADD COLUMN IF NOT EXISTS comissao_recorrente_percentual numeric(5,2),
  ADD COLUMN IF NOT EXISTS cupom_codigo text,
  ADD COLUMN IF NOT EXISTS desconto_cupom_percentual numeric(5,2),
  ADD COLUMN IF NOT EXISTS cupom_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cupom_valido_ate timestamp,
  ADD COLUMN IF NOT EXISTS cupom_aplicacao text NOT NULL DEFAULT 'geral';

CREATE UNIQUE INDEX IF NOT EXISTS partners_cupom_codigo_unique
  ON partners (cupom_codigo)
  WHERE cupom_codigo IS NOT NULL;

ALTER TABLE partners
  DROP CONSTRAINT IF EXISTS partners_comissao_percentual_check,
  ADD CONSTRAINT partners_comissao_percentual_check
    CHECK (comissao_percentual IS NULL OR (comissao_percentual >= 0 AND comissao_percentual <= 100)),
  DROP CONSTRAINT IF EXISTS partners_comissao_recorrente_percentual_check,
  ADD CONSTRAINT partners_comissao_recorrente_percentual_check
    CHECK (comissao_recorrente_percentual IS NULL OR (comissao_recorrente_percentual >= 0 AND comissao_recorrente_percentual <= 100)),
  DROP CONSTRAINT IF EXISTS partners_desconto_cupom_percentual_check,
  ADD CONSTRAINT partners_desconto_cupom_percentual_check
    CHECK (desconto_cupom_percentual IS NULL OR (desconto_cupom_percentual >= 0 AND desconto_cupom_percentual <= 100));
