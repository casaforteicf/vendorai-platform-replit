-- campaigns.image_url + produtos_catalogo dual-price columns (implantacao + mensalidade)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS preco_implantacao NUMERIC(12,2);
ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS preco_mensalidade NUMERIC(12,2);
ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS exige_agendamento BOOLEAN NOT NULL DEFAULT false;
