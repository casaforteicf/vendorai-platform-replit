-- SDR Templates table + global seeds (idempotent)
CREATE TABLE IF NOT EXISTS sdr_templates (
  id          TEXT PRIMARY KEY NOT NULL,
  tenant_id   TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  cenario     TEXT NOT NULL,
  ordem       INTEGER DEFAULT 1 NOT NULL,
  delay_horas INTEGER DEFAULT 0 NOT NULL,
  template    TEXT NOT NULL,
  ativo       BOOLEAN DEFAULT true NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Seed: frio_teste (INSERT only if absent)
INSERT INTO sdr_templates (id, tenant_id, cenario, ordem, delay_horas, template, ativo)
SELECT gen_random_uuid()::text, NULL, 'frio_teste', 1, 0,
  'Oi {dono_nome}! Rapidinho — uma pergunta sobre a {empresa_lead}: hoje, como vocês lidam com o atendimento de clientes pelo WhatsApp?

1️⃣ Respondo tudo manualmente, sem sistema
2️⃣ Uso algum sistema, mas sem IA
3️⃣ Já uso IA ou automação de alguma forma

Só me manda o número, já ajuda demais 🙂',
  true
WHERE NOT EXISTS (SELECT 1 FROM sdr_templates WHERE tenant_id IS NULL AND cenario = 'frio_teste' AND ordem = 1);

-- Update frio_teste template text if it's missing the emoji format
UPDATE sdr_templates
SET    template    = 'Oi {dono_nome}! Rapidinho — uma pergunta sobre a {empresa_lead}: hoje, como vocês lidam com o atendimento de clientes pelo WhatsApp?

1️⃣ Respondo tudo manualmente, sem sistema
2️⃣ Uso algum sistema, mas sem IA
3️⃣ Já uso IA ou automação de alguma forma

Só me manda o número, já ajuda demais 🙂',
       updated_at  = NOW()
WHERE  tenant_id IS NULL
  AND  cenario     = 'frio_teste'
  AND  ordem       = 1
  AND  template NOT LIKE '%1️⃣%';

-- Seed: frio_revelacao
INSERT INTO sdr_templates (id, tenant_id, cenario, ordem, delay_horas, template, ativo)
SELECT gen_random_uuid()::text, NULL, 'frio_revelacao', 1, 20,
  'Oi {dono_nome}, tudo bem? {status_resposta} sobre a mensagem anterior — sem problema, sei que a rotina é corrida. Só reforçando: a ideia é simples, {empresa_lead} passa a responder cliente na hora pelo WhatsApp, sem precisar contratar mais gente pro atendimento.

Se quiser, consigo te mostrar rapidinho essa semana. Algum horário funciona melhor?',
  true
WHERE NOT EXISTS (SELECT 1 FROM sdr_templates WHERE tenant_id IS NULL AND cenario = 'frio_revelacao' AND ordem = 1);

-- Seed: pos_visita
INSERT INTO sdr_templates (id, tenant_id, cenario, ordem, delay_horas, template, ativo)
SELECT gen_random_uuid()::text, NULL, 'pos_visita', 1, 0,
  'Oi {dono_nome}! Passei aí em {empresa_lead} e conversei com {nome_gatekeeper} sobre como a IA pode ajudar vocês a atender mais rápido pelo WhatsApp. Fiquei pensando no que você comentou sobre {principal_reclamacao} — é exatamente o tipo de coisa que resolvemos.

Topa uma conversa rápida pra eu te mostrar como funcionaria na prática? {dia_sugestao_1} ou {dia_sugestao_2}?',
  true
WHERE NOT EXISTS (SELECT 1 FROM sdr_templates WHERE tenant_id IS NULL AND cenario = 'pos_visita' AND ordem = 1);

-- Seed: direto_dono
INSERT INTO sdr_templates (id, tenant_id, cenario, ordem, delay_horas, template, ativo)
SELECT gen_random_uuid()::text, NULL, 'direto_dono', 1, 0,
  '{dono_nome}, tudo bem? Sou {vendedor_nome}, trabalho ajudando empresas de {segmento} a vender mais organizando o atendimento pelo WhatsApp com IA. Antes de qualquer coisa: faz sentido pra {empresa_lead} hoje, ou vocês já têm isso resolvido?

Se fizer sentido, te mostro em 10 minutos como funciona.',
  true
WHERE NOT EXISTS (SELECT 1 FROM sdr_templates WHERE tenant_id IS NULL AND cenario = 'direto_dono' AND ordem = 1);

-- Seed: inbound_site
INSERT INTO sdr_templates (id, tenant_id, cenario, ordem, delay_horas, template, ativo)
SELECT gen_random_uuid()::text, NULL, 'inbound_site', 1, 0,
  'Oi {dono_nome}! Aqui é da appvendor.ai — recebi sua mensagem pelo site e quero entender melhor o que você precisa 🙂

Me conta: qual é o maior gargalo no atendimento do seu negócio hoje? Com isso consigo te mostrar algo realmente útil.',
  true
WHERE NOT EXISTS (SELECT 1 FROM sdr_templates WHERE tenant_id IS NULL AND cenario = 'inbound_site' AND ordem = 1);

-- Update inbound_site if it still has old brand name
UPDATE sdr_templates
SET    template    = 'Oi {dono_nome}! Aqui é da appvendor.ai — recebi sua mensagem pelo site e quero entender melhor o que você precisa 🙂

Me conta: qual é o maior gargalo no atendimento do seu negócio hoje? Com isso consigo te mostrar algo realmente útil.',
       updated_at  = NOW()
WHERE  tenant_id IS NULL
  AND  cenario     = 'inbound_site'
  AND  ordem       = 1
  AND  template LIKE '%VendorAI%';
