-- Padroniza definitivamente a taxonomia de produtos do Vendor.ai.
-- Caminho canônico:
-- Categoria > Subcategoria > Nicho > Linha > Aplicação > Sublinha >
-- Utilidade > Família > Produto.
-- Os níveis intermediários são opcionais; categoria é obrigatória.

ALTER TABLE categorias_produto
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS parent_id text,
  ADD COLUMN IF NOT EXISTS nivel text NOT NULL DEFAULT 'categoria',
  ADD COLUMN IF NOT EXISTS oficial boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0;

UPDATE categorias_produto
SET slug = trim(both '-' from regexp_replace(
  translate(lower(nome),
    'áàâãäéèêëíìîïóòôõöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn'),
  '[^a-z0-9]+', '-', 'g'
))
WHERE slug IS NULL OR slug = '';

UPDATE categorias_produto
SET oficial = true,
    nivel = 'categoria',
    parent_id = NULL
WHERE nome = ANY (ARRAY[
  'Acessórios para Veículos','Agro','Alimentos e Bebidas','Pet Shop',
  'Antiguidades e Coleções','Arte, Papelaria e Armarinho','Bebês',
  'Beleza e Cuidado Pessoal','Brinquedos e Hobbies',
  'Calçados, Roupas e Bolsas','Câmeras e Acessórios',
  'Carros, Motos e Outros','Casa, Móveis e Decoração',
  'Celulares e Telefones','Construção','Eletrodomésticos',
  'Eletrônicos, Áudio e Vídeo','Esportes e Fitness','Ferramentas',
  'Festas e Lembrancinhas','Games','Imóveis','Indústria e Comércio',
  'Informática','Ingressos','Instrumentos Musicais','Joias e Relógios',
  'Livros, Revistas e Comics','Música, Filmes e Seriados','Saúde','Serviços'
]);

DO $$ BEGIN
  ALTER TABLE categorias_produto
    ADD CONSTRAINT categorias_produto_parent_fk
    FOREIGN KEY (parent_id) REFERENCES categorias_produto(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE categorias_produto
    ADD CONSTRAINT categorias_produto_nivel_check
    CHECK (nivel IN (
      'categoria','subcategoria','nicho','linha','aplicacao',
      'sublinha','utilidade','familia'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS categorias_produto_raiz_slug_uidx
  ON categorias_produto (tenant_id, slug)
  WHERE parent_id IS NULL AND ativo = true;

CREATE UNIQUE INDEX IF NOT EXISTS categorias_produto_filho_slug_uidx
  ON categorias_produto (tenant_id, parent_id, slug)
  WHERE parent_id IS NOT NULL AND ativo = true;

CREATE INDEX IF NOT EXISTS categorias_produto_parent_idx
  ON categorias_produto (tenant_id, parent_id, ordem, nome);

CREATE OR REPLACE FUNCTION validar_hierarquia_categoria_produto()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  pai_tenant text;
  pai_nivel text;
  nivel_pai_pos integer;
  nivel_filho_pos integer;
  niveis text[] := ARRAY[
    'categoria','subcategoria','nicho','linha','aplicacao',
    'sublinha','utilidade','familia'
  ];
BEGIN
  IF NEW.nivel = 'categoria' THEN
    IF NEW.parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'Categoria principal não pode possuir categoria pai';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.parent_id IS NULL THEN
    RAISE EXCEPTION 'O nível % precisa estar ligado a uma categoria superior', NEW.nivel;
  END IF;

  SELECT tenant_id, nivel INTO pai_tenant, pai_nivel
  FROM categorias_produto WHERE id = NEW.parent_id;

  IF pai_tenant IS NULL THEN
    RAISE EXCEPTION 'Categoria pai não encontrada';
  END IF;
  IF pai_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Categoria pai pertence a outro tenant';
  END IF;

  nivel_pai_pos := array_position(niveis, pai_nivel);
  nivel_filho_pos := array_position(niveis, NEW.nivel);
  IF nivel_filho_pos <= nivel_pai_pos THEN
    RAISE EXCEPTION 'Nível % deve vir depois de %', NEW.nivel, pai_nivel;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validar_hierarquia_categoria_produto ON categorias_produto;
CREATE TRIGGER trg_validar_hierarquia_categoria_produto
BEFORE INSERT OR UPDATE OF parent_id, nivel, tenant_id
ON categorias_produto
FOR EACH ROW EXECUTE FUNCTION validar_hierarquia_categoria_produto();

-- Mantém produtos antigos para revisão, mas todo novo produto ativo ou
-- produto atualizado como ativo precisa possuir categoria.
DO $$ BEGIN
  ALTER TABLE produtos_catalogo
    ADD CONSTRAINT produtos_catalogo_categoria_ativa_check
    CHECK (ativo = false OR categoria_id IS NOT NULL) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
