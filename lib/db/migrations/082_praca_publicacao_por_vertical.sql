-- Bootstrap the restaurant menu on fresh PostgreSQL installations.
-- Existing installations retain their rows and category type.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'restaurante_categoria_cardapio') THEN
    CREATE TYPE public.restaurante_categoria_cardapio AS ENUM (
      'entrada', 'prato_principal', 'sobremesa', 'bebida', 'combo', 'outros'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.restaurante_cardapio (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  categoria public.restaurante_categoria_cardapio,
  preco numeric(10,2) NOT NULL,
  tempo_preparo_minutos integer DEFAULT 20,
  disponivel_almoco boolean NOT NULL DEFAULT true,
  disponivel_jantar boolean NOT NULL DEFAULT true,
  imagem_url text,
  ativo boolean NOT NULL DEFAULT true,
  vende_no_praca_ai boolean NOT NULL DEFAULT false,
  destaque_whatsapp boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE public.restaurante_cardapio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendorai_tenant_access ON public.restaurante_cardapio;
CREATE POLICY vendorai_tenant_access ON public.restaurante_cardapio
  FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());
REVOKE ALL ON TABLE public.restaurante_cardapio FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurante_cardapio TO vendorai_app;

-- O Vendor.ai e a fonte unica dos anuncios publicados no Praca.ai.
-- Cada registro especializado precisa de opt-in proprio, alem da permissao
-- geral do tenant, para evitar publicar estoque/cardapio/cadastro interno.

ALTER TABLE imoveis_propriedades
  ADD COLUMN IF NOT EXISTS vende_no_praca_ai boolean NOT NULL DEFAULT false;

ALTER TABLE veiculos_estoque
  ADD COLUMN IF NOT EXISTS vende_no_praca_ai boolean NOT NULL DEFAULT false;

ALTER TABLE farmacia_produtos
  ADD COLUMN IF NOT EXISTS vende_no_praca_ai boolean NOT NULL DEFAULT false;

ALTER TABLE restaurante_cardapio
  ADD COLUMN IF NOT EXISTS vende_no_praca_ai boolean NOT NULL DEFAULT false;

ALTER TABLE servicos_tipos
  ADD COLUMN IF NOT EXISTS vende_no_praca_ai boolean NOT NULL DEFAULT false;

ALTER TABLE beauty_servicos
  ADD COLUMN IF NOT EXISTS vende_no_praca_ai boolean NOT NULL DEFAULT false;

ALTER TABLE fretes_veiculos
  ADD COLUMN IF NOT EXISTS vende_no_praca_ai boolean NOT NULL DEFAULT false;

-- Preserva os anuncios que ja estavam publicos antes do controle individual.
-- Novos registros continuam privados ate o lojista optar por publica-los.
UPDATE imoveis_propriedades SET vende_no_praca_ai = true WHERE status = 'disponivel';
UPDATE veiculos_estoque SET vende_no_praca_ai = true WHERE status = 'disponivel' AND vistoria_realizada = true;
UPDATE farmacia_produtos SET vende_no_praca_ai = true WHERE ativo = true;
UPDATE restaurante_cardapio SET vende_no_praca_ai = true WHERE ativo = true;
UPDATE servicos_tipos SET vende_no_praca_ai = true WHERE ativo = true;
UPDATE beauty_servicos SET vende_no_praca_ai = true WHERE ativo = true;
UPDATE fretes_veiculos SET vende_no_praca_ai = true WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_imoveis_praca_publicados
  ON imoveis_propriedades (tenant_id, status, vende_no_praca_ai);
CREATE INDEX IF NOT EXISTS idx_veiculos_praca_publicados
  ON veiculos_estoque (tenant_id, status, vende_no_praca_ai);
CREATE INDEX IF NOT EXISTS idx_farmacia_praca_publicados
  ON farmacia_produtos (tenant_id, ativo, vende_no_praca_ai);
CREATE INDEX IF NOT EXISTS idx_restaurante_praca_publicados
  ON restaurante_cardapio (tenant_id, ativo, vende_no_praca_ai);
CREATE INDEX IF NOT EXISTS idx_servicos_praca_publicados
  ON servicos_tipos (tenant_id, ativo, vende_no_praca_ai);
CREATE INDEX IF NOT EXISTS idx_beauty_praca_publicados
  ON beauty_servicos (tenant_id, ativo, vende_no_praca_ai);
CREATE INDEX IF NOT EXISTS idx_fretes_praca_publicados
  ON fretes_veiculos (tenant_id, ativo, vende_no_praca_ai);
