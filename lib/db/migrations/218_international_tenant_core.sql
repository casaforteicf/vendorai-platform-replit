-- Núcleo de internacionalização por tenant.
-- Mantém compatibilidade total com a base atual: todos os tenants existentes
-- continuam Brasil / pt-BR / BRL / America/Sao_Paulo até configuração explícita.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS country_code varchar(2) NOT NULL DEFAULT 'BR',
  ADD COLUMN IF NOT EXISTS default_locale varchar(12) NOT NULL DEFAULT 'pt-BR',
  ADD COLUMN IF NOT EXISTS timezone varchar(64) NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS default_currency varchar(3) NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS supported_currencies json NOT NULL DEFAULT '["BRL"]'::json,
  ADD COLUMN IF NOT EXISTS tax_identifier_type varchar(32),
  ADD COLUMN IF NOT EXISTS tax_identifier varchar(64);

ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_country_code_check,
  ADD CONSTRAINT tenants_country_code_check
    CHECK (country_code IN ('BR', 'PY', 'AR', 'UY', 'CL')),
  DROP CONSTRAINT IF EXISTS tenants_default_locale_check,
  ADD CONSTRAINT tenants_default_locale_check
    CHECK (default_locale IN ('pt-BR', 'es-PY', 'es-AR', 'es-UY', 'es-CL')),
  DROP CONSTRAINT IF EXISTS tenants_default_currency_check,
  ADD CONSTRAINT tenants_default_currency_check
    CHECK (default_currency IN ('BRL', 'USD', 'PYG', 'ARS', 'UYU', 'CLP'));

COMMENT ON COLUMN tenants.country_code IS 'ISO 3166-1 alpha-2 do mercado principal do tenant';
COMMENT ON COLUMN tenants.default_locale IS 'Locale padrão da interface/automação do tenant; usuário poderá sobrescrever';
COMMENT ON COLUMN tenants.timezone IS 'Timezone IANA usado para horários comerciais, agenda e automações';
COMMENT ON COLUMN tenants.default_currency IS 'Moeda ISO 4217 padrão do tenant';
COMMENT ON COLUMN tenants.supported_currencies IS 'Moedas ISO 4217 habilitadas para o tenant';
COMMENT ON COLUMN tenants.tax_identifier_type IS 'Tipo genérico de documento fiscal: CPF, CNPJ, RUC, CUIT, CUIL, RUT, CI etc.';
COMMENT ON COLUMN tenants.tax_identifier IS 'Documento fiscal do tenant sem semântica específica de país no schema';
