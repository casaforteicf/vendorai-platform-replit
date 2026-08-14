ALTER TABLE servicos_tipos ADD COLUMN IF NOT EXISTS categoria varchar(80) NOT NULL DEFAULT 'Outros';
ALTER TABLE servicos_tipos ALTER COLUMN especialidade TYPE varchar(80);
ALTER TABLE servicos_prestadores ALTER COLUMN especialidade TYPE varchar(80);
CREATE INDEX IF NOT EXISTS idx_servicos_tipos_categoria ON servicos_tipos (tenant_id, categoria, ativo, vende_no_praca_ai);
