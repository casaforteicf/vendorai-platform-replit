-- Sincronização varejo_grades → produtos_catalogo — cada grade
-- (tamanho/cor) vira um produto próprio no catálogo genérico, com o
-- mesmo grupoVarianteId (= id do varejo_produto pai), pra aparecer no
-- Praça.ai e ser visto pelo Revenue Scout (ex: "grade_incompleta").

ALTER TABLE varejo_grades ADD COLUMN IF NOT EXISTS produto_catalogo_id text;
CREATE INDEX IF NOT EXISTS idx_varejo_grades_produto_catalogo ON varejo_grades(produto_catalogo_id);
