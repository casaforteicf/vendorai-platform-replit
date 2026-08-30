-- Garante que o seed de demonstração respeite a regra de catálogo:
-- todo produto ativo precisa estar vinculado a uma categoria.
-- A proteção é restrita a tenants de demonstração e não relaxa a
-- validação dos produtos reais.

CREATE OR REPLACE FUNCTION public.ensure_demo_product_category()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  demo_tenant boolean;
  demo_category_id text;
BEGIN
  IF NEW.tenant_id IS NOT NULL
     AND NEW.categoria_id IS NULL
     AND COALESCE(NEW.ativo, true) = true THEN
    SELECT is_demo
      INTO demo_tenant
      FROM public.tenants
     WHERE id = NEW.tenant_id;

    IF COALESCE(demo_tenant, false) THEN
      SELECT id
        INTO demo_category_id
        FROM public.categorias_produto
       WHERE tenant_id = NEW.tenant_id
         AND slug = 'demo'
       ORDER BY created_at
       LIMIT 1;

      IF demo_category_id IS NULL THEN
        INSERT INTO public.categorias_produto
          (tenant_id, nome, slug, nivel, oficial, ativo)
        VALUES
          (NEW.tenant_id, 'Demonstração', 'demo', 'categoria', false, true)
        RETURNING id INTO demo_category_id;
      END IF;

      NEW.categoria_id := demo_category_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS produtos_catalogo_demo_category
  ON public.produtos_catalogo;

CREATE TRIGGER produtos_catalogo_demo_category
BEFORE INSERT OR UPDATE OF categoria_id, ativo
ON public.produtos_catalogo
FOR EACH ROW
EXECUTE FUNCTION public.ensure_demo_product_category();
