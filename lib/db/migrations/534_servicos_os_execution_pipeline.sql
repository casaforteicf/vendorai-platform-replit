-- OS executável: vínculo com negócio, modelo, checklist auditável, timeline e portal do cliente.
ALTER TABLE servicos_ordens
  ADD COLUMN IF NOT EXISTS negocio_id text REFERENCES deals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modelo_execucao varchar(40) NOT NULL DEFAULT 'geral',
  ADD COLUMN IF NOT EXISTS checklist_execucao jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS historico_execucao jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cliente_acompanha boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS compartilhar_status_cliente boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS portal_token text,
  ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

ALTER TABLE servicos_ordens
  ALTER COLUMN status TYPE varchar(30);

-- Ordens já existentes recebem o checklist geral para não ficarem sem fluxo
-- após a publicação desta migration.
UPDATE servicos_ordens
SET checklist_execucao = '[
  {"id":"contexto","titulo":"Conferir informações do negócio e da OS","obrigatorio":true,"evidencia":"confirmation","visibilidade":"interno","concluido":false,"observacao":null,"fotos":[],"concluidoPorId":null,"concluidoPorNome":null,"concluidoEm":null},
  {"id":"execucao","titulo":"Registrar o que foi executado","obrigatorio":true,"evidencia":"text_or_photo","visibilidade":"interno","concluido":false,"observacao":null,"fotos":[],"concluidoPorId":null,"concluidoPorNome":null,"concluidoEm":null},
  {"id":"resultado","titulo":"Comprovar resultado final","obrigatorio":true,"evidencia":"text_and_photo","visibilidade":"interno","concluido":false,"observacao":null,"fotos":[],"concluidoPorId":null,"concluidoPorNome":null,"concluidoEm":null},
  {"id":"aceite","titulo":"Validar conclusão com o cliente/responsável","obrigatorio":true,"evidencia":"text_or_photo","visibilidade":"interno","concluido":false,"observacao":null,"fotos":[],"concluidoPorId":null,"concluidoPorNome":null,"concluidoEm":null}
]'::jsonb
WHERE checklist_execucao = '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_servicos_ordens_negocio
  ON servicos_ordens (tenant_id, negocio_id)
  WHERE negocio_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_servicos_ordens_modelo_status
  ON servicos_ordens (tenant_id, modelo_execucao, status);


-- Link público imprevisível para acompanhamento seletivo pelo cliente.
UPDATE servicos_ordens
SET portal_token = gen_random_uuid()::text
WHERE cliente_acompanha = true AND portal_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_servicos_ordens_portal_token
  ON servicos_ordens (portal_token)
  WHERE portal_token IS NOT NULL;
