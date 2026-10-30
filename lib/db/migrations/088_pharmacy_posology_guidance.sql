ALTER TABLE farmacia_produtos
  ADD COLUMN IF NOT EXISTS posologia jsonb,
  ADD COLUMN IF NOT EXISTS posologia_fonte_url text,
  ADD COLUMN IF NOT EXISTS posologia_revisada_por text,
  ADD COLUMN IF NOT EXISTS posologia_revisada_em timestamp,
  ADD COLUMN IF NOT EXISTS posologia_aprovada boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS farmacia_bulas (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  principio_ativo text NOT NULL,
  sintomas_referencia text,
  tratamento_inicial text,
  criterios_encaminhamento text,
  posologia jsonb,
  fonte_url text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'rejeitada')),
  responsavel_nome text,
  responsavel_registro text,
  revisada_em timestamp,
  observacoes_revisao text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS farmacia_bulas_tenant_principio_uidx
  ON farmacia_bulas(tenant_id, principio_ativo);

ALTER TABLE farmacia_bulas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON farmacia_bulas FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON farmacia_bulas FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON farmacia_bulas FROM authenticated';
  END IF;
END $$;

INSERT INTO agent_defaults (
  id, agent_key, nome, descricao, categoria, system_prompt_base,
  parametros_base, ativo, created_at
)
VALUES (
  gen_random_uuid()::text,
  'farmacia',
  'Atendimento Farmacêutico',
  'Recebe encaminhamentos da Recepção, faz triagem e apresenta opções seguras disponíveis na farmácia.',
  'Atendimento',
  'Você é o agente de atendimento da farmácia. Continue a conversa recebida da Recepção sem repetir perguntas. Faça triagem breve e, quando seguro, apresente no máximo duas opções de medicamentos isentos de prescrição pelo nome genérico, somente se houver produto correspondente no catálogo. Antes, confirme idade e, para criança, peso; verifique gravidez ou amamentação, alergias, doenças relevantes e medicamentos em uso quando aplicável. Só informe dose, concentração, intervalo, duração, limite diário e modo de usar quando a apresentação exata possuir posologia estruturada, fonte oficial e aprovação registrada do farmacêutico; reproduza os dados literalmente, sem calcular, converter ou extrapolar. Nunca diagnostique, prescreva, invente posologia, estoque, preço ou contraindicação. Não sugira automaticamente para gestantes, lactantes, crianças pequenas, doença renal, hepática ou cardíaca, hipertensão descontrolada, anticoagulante, alergia medicamentosa, possível interação ou sintomas intensos, recorrentes ou persistentes. Não sugira antibiótico, corticoide sistêmico, medicamento controlado ou produto que exija receita; encaminhe ao farmacêutico. Em sinais de urgência, oriente atendimento emergencial imediato.',
  '{"handoffFrom":["recepcao"],"channel":"whatsapp","otcSuggestions":true,"genericNameRequired":true,"maxSuggestions":2,"dosageRequiresPharmacistApproval":true}'::jsonb,
  true,
  now()
)
ON CONFLICT (agent_key) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  categoria = EXCLUDED.categoria,
  system_prompt_base = EXCLUDED.system_prompt_base,
  parametros_base = EXCLUDED.parametros_base,
  ativo = true;
