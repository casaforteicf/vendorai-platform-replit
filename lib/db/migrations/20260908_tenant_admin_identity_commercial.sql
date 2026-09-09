-- Super Admin / Tenants: identidade pública imutável + gestão comercial e financeira.
-- Mantém tenants demo na mesma entidade e permite conversão sem trocar a identidade.

CREATE SEQUENCE IF NOT EXISTS tenant_public_code_seq START WITH 1 INCREMENT BY 1;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tenant_code varchar(16),
  ADD COLUMN IF NOT EXISTS demo_started_at timestamp,
  ADD COLUMN IF NOT EXISTS demo_converted_at timestamp,
  ADD COLUMN IF NOT EXISTS mensalidade_tabela_valor numeric(10,2),
  ADD COLUMN IF NOT EXISTS taxa_implantacao_valor numeric(10,2),
  ADD COLUMN IF NOT EXISTS desconto_percentual numeric(5,2),
  ADD COLUMN IF NOT EXISTS forma_pagamento varchar(32),
  ADD COLUMN IF NOT EXISTS status_pagamento varchar(24),
  ADD COLUMN IF NOT EXISTS dia_vencimento integer,
  ADD COLUMN IF NOT EXISTS ultimo_pagamento_em timestamp,
  ADD COLUMN IF NOT EXISTS proximo_pagamento_em timestamp,
  ADD COLUMN IF NOT EXISTS contrato_inicio_em timestamp,
  ADD COLUMN IF NOT EXISTS contrato_fim_em timestamp,
  ADD COLUMN IF NOT EXISTS renovacao_automatica boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS origem_cliente varchar(80),
  ADD COLUMN IF NOT EXISTS responsavel_comercial varchar(160),
  ADD COLUMN IF NOT EXISTS observacoes_comerciais text,
  ADD COLUMN IF NOT EXISTS motivo_desconto text,
  ADD COLUMN IF NOT EXISTS cancelamento_solicitado_em timestamp,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamp,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text;

-- Gera um número amigável para todos os tenants já existentes.
UPDATE tenants
SET tenant_code = 'VAI-' || lpad(nextval('tenant_public_code_seq')::text, 6, '0')
WHERE tenant_code IS NULL;

ALTER TABLE tenants
  ALTER COLUMN tenant_code SET DEFAULT ('VAI-' || lpad(nextval('tenant_public_code_seq')::text, 6, '0')),
  ALTER COLUMN tenant_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_tenant_code_unique
  ON tenants (tenant_code);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_dia_vencimento_check'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_dia_vencimento_check
      CHECK (dia_vencimento IS NULL OR dia_vencimento BETWEEN 1 AND 31);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_desconto_percentual_check'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_desconto_percentual_check
      CHECK (desconto_percentual IS NULL OR (desconto_percentual >= 0 AND desconto_percentual <= 100));
  END IF;
END $$;
