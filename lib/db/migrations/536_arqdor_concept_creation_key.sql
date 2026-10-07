ON arch_concept_projects (
  tenant_id,
  owner_user_id,
  ((configuration ->> 'creationKey'))
)
WHERE configuration ? 'creationKey'
  AND COALESCE(configuration ->> 'creationKey', '') <> '';
-- PKG-07 / ARQ-PRE
-- Garante idempotência na criação de pré-projetos mesmo quando autosave/clique/abas
-- disparam POSTs concorrentes para o mesmo rascunho.
CREATE UNIQUE INDEX IF NOT EXISTS arch_concept_projects_creation_key_uq
ON arch_concept_projects (
  tenant_id,
  owner_user_id,
  ((configuration ->> 'creationKey'))
)
WHERE configuration ? 'creationKey'
  AND COALESCE(configuration ->> 'creationKey', '') <> '';
