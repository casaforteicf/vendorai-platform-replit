-- leads: maturidade_ia + data_resposta_pesquisa (SDR survey columns)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS maturidade_ia INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS data_resposta_pesquisa TIMESTAMPTZ;
