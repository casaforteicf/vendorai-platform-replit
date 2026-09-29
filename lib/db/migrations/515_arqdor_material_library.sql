-- Arqdor material library engineering.
-- Separates materials/textures from product catalog, supports multiple source images,
-- global deduplication, tenant access, sharing scope and product->material compatibility.

CREATE TABLE IF NOT EXISTS arch_materials (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  owner_tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  master_key text NOT NULL,
  nome varchar(255) NOT NULL,
  fabricante varchar(255) NOT NULL,
  linha varchar(255) NOT NULL,
  referencia varchar(255),
  categoria varchar(80) NOT NULL,
  subcategoria varchar(80),
  cor varchar(120),
  acabamento varchar(120),
  aplicacao varchar(255),
  escala_largura_mm numeric(12,2),
  escala_altura_mm numeric(12,2),
  compartilhamento varchar(20) NOT NULL DEFAULT 'privado',
  status varchar(30) NOT NULL DEFAULT 'cadastrado',
  primary_image_id text,
  especificacoes jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS arch_materials_master_key_uidx
  ON arch_materials(master_key);

CREATE INDEX IF NOT EXISTS arch_materials_categoria_idx
  ON arch_materials(categoria);

CREATE INDEX IF NOT EXISTS arch_materials_fabricante_linha_idx
  ON arch_materials(fabricante, linha);

CREATE TABLE IF NOT EXISTS arch_material_images (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  material_id text NOT NULL REFERENCES arch_materials(id) ON DELETE CASCADE,
  contributor_tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  storage_url text NOT NULL,
  original_filename text,
  mime_type varchar(100),
  width integer,
  height integer,
  file_size integer,
  quality_score numeric(5,2),
  status varchar(20) NOT NULL DEFAULT 'ativa',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arch_material_images_material_idx
  ON arch_material_images(material_id, created_at DESC);

CREATE TABLE IF NOT EXISTS arch_material_tenant_access (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  material_id text NOT NULL REFERENCES arch_materials(id) ON DELETE CASCADE,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role varchar(20) NOT NULL DEFAULT 'linked',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS arch_material_tenant_access_uidx
  ON arch_material_tenant_access(material_id, tenant_id);

CREATE TABLE IF NOT EXISTS arch_catalog_product_materials (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES arch_catalogo(id) ON DELETE CASCADE,
  material_id text NOT NULL REFERENCES arch_materials(id) ON DELETE CASCADE,
  surface_key varchar(120),
  grupo varchar(120),
  is_default boolean NOT NULL DEFAULT false,
  preco_adicional numeric(10,2),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS arch_catalog_product_materials_uidx
  ON arch_catalog_product_materials(
    tenant_id,
    product_id,
    material_id,
    COALESCE(surface_key, '')
  );

CREATE INDEX IF NOT EXISTS arch_catalog_product_materials_product_idx
  ON arch_catalog_product_materials(product_id, ativo);

COMMENT ON TABLE arch_materials IS
  'Master library of Arqdor materials/textures. One physical/commercial material is stored once globally.';
COMMENT ON TABLE arch_material_images IS
  'Multiple reference texture images for one material; primary image can evolve without duplicating the material.';
COMMENT ON TABLE arch_catalog_product_materials IS
  'Allowed material/finish options for a catalog product and optional 3D surface key.';
