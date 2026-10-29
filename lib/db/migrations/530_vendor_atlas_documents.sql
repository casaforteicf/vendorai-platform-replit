-- Atlas empresarial institucional: somente administradores através da API autenticada.
CREATE TABLE IF NOT EXISTS vendor_atlas_documents (
  document_key text PRIMARY KEY,
  content jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS vendor_atlas_document_history (
  id bigserial PRIMARY KEY,
  document_key text NOT NULL,
  revision integer NOT NULL,
  content jsonb NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_key, revision)
);
