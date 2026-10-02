ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS nao_lead_classificacoes json NOT NULL DEFAULT
'[
  {"id":"colaborador","label":"Colaborador","active":true},
  {"id":"fornecedor","label":"Fornecedor","active":true},
  {"id":"parceiro","label":"Parceiro","active":true},
  {"id":"familiar","label":"Familiar","active":true},
  {"id":"amigo","label":"Amigo","active":true},
  {"id":"outro","label":"Outro","active":true}
]'::json;