-- Grade de variantes (tamanho/cor) no catálogo — pra detectar "cliente
-- comprou essa peça, mas não os outros tamanhos/cores que existem".

ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS grupo_variante_id text;
ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS tamanho text;
ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS cor text;
CREATE INDEX IF NOT EXISTS idx_produtos_catalogo_grupo_variante ON produtos_catalogo(grupo_variante_id) WHERE grupo_variante_id IS NOT NULL;
