ALTER TABLE "arch_concept_projects"
  ADD COLUMN IF NOT EXISTS "facade_preferences" jsonb NOT NULL DEFAULT '{
    "style":"contemporaneo",
    "roof":"platibanda",
    "primaryMaterial":"pintura",
    "accentMaterial":"madeira",
    "facadeTone":"claro",
    "frameTone":"preto",
    "landscaping":"medio"
  }'::jsonb;
