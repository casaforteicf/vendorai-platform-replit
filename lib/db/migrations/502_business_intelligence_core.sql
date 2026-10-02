-- Núcleo de Inteligência do Negócio
-- Adiciona inteligência comercial estruturada ao produto mestre existente.
-- Alteração aditiva: tenants existentes mantêm JSON vazio até o enriquecimento.

ALTER TABLE produtos_catalogo
  ADD COLUMN IF NOT EXISTS inteligencia_comercial jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS produtos_catalogo_inteligencia_comercial_gin_idx
  ON produtos_catalogo USING gin (inteligencia_comercial);

COMMENT ON COLUMN produtos_catalogo.inteligencia_comercial IS
  'Conhecimento comercial estruturado e aprovado: características, diferenciais, benefícios, dores, objeções, provas, personas, afirmações permitidas/proibidas e produtos complementares.';


-- Alinha os tipos permitidos da Biblioteca de Informações com a interface atual.
ALTER TABLE media_context_entries
  DROP CONSTRAINT IF EXISTS media_context_entries_kind_check;

ALTER TABLE media_context_entries
  ADD CONSTRAINT media_context_entries_kind_check CHECK (kind IN (
    'assunto', 'empresa', 'marca', 'produto', 'servico', 'obra', 'projeto',
    'case', 'equipe', 'campanha', 'conteudo', 'ferramenta', 'processo',
    'diferencial', 'promocao', 'prova', 'documento', 'referencia'
  ));
