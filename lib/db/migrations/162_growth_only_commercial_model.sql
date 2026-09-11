-- VendorAI commercial model consolidation — 2026-09-11
--
-- One active SaaS plan: Growth.
-- Growth has no commercial user limit or extra-user fee and receives every
-- currently plan-gated module. Legacy plan rows remain for history/FKs only.
--
-- Access by period: 5 free days per calendar month + additional 5-day passes
-- for R$399.00. Continuous subscription pricing is handled by the commercial
-- lifecycle: 5 initial free days, R$497 first 30 paid days, R$990/month for
-- the next 5 months, then the regular Growth catalog price (R$1,490/month).

-- ── Single active plan ───────────────────────────────────────────────────────
UPDATE plans
SET is_active = false,
    updated_at = now()
WHERE slug <> 'growth';

UPDATE plans
SET name = 'Growth',
    implantation_price_cents = 0,
    monthly_price_cents = 149000,
    monthly_price_annual_cents = NULL,
    ai_quota_usd = COALESCE(ai_quota_usd, 50),
    max_users = NULL,
    extra_user_price_cents = NULL,
    is_active = true,
    updated_at = now()
WHERE slug = 'growth';

-- Growth must not inherit the old reduced module list.
WITH growth AS (
  SELECT id FROM plans WHERE slug = 'growth' LIMIT 1
), desired(module_key) AS (
  VALUES
    ('agent_sdr'),
    ('agent_closer'),
    ('agent_followup'),
    ('agent_reactivation'),
    ('agent_scheduler'),
    ('agent_service'),
    ('agent_onboarding'),
    ('customer_intelligence'),
    ('intelligence_full'),
    ('prospector_alpha'),
    ('google_calendar'),
    ('google_sheets'),
    ('knowledge_base'),
    ('byok'),
    ('partner_portal'),
    ('executive_report')
)
INSERT INTO plan_modules (id, plan_id, module_key, created_at)
SELECT gen_random_uuid()::text, growth.id, desired.module_key, now()
FROM growth CROSS JOIN desired
WHERE NOT EXISTS (
  SELECT 1
  FROM plan_modules pm
  WHERE pm.plan_id = growth.id
    AND pm.module_key = desired.module_key
);

-- Existing tenant assignments move to Growth so retired plans cannot keep
-- partial module gating. Tenants intentionally without a plan remain null.
WITH growth AS (
  SELECT id FROM plans WHERE slug = 'growth' LIMIT 1
)
UPDATE tenants t
SET plan_id = growth.id,
    billing_cycle = 'monthly',
    updated_at = now()
FROM growth
WHERE t.plan_id IS NOT NULL
  AND t.plan_id <> growth.id;

-- ── 5-day pass fixed price ──────────────────────────────────────────────────
ALTER TABLE access_pass_purchases
  DROP CONSTRAINT IF EXISTS access_pass_purchases_amount_check;

ALTER TABLE access_pass_purchases
  ALTER COLUMN amount SET DEFAULT 399.00;

ALTER TABLE access_pass_purchases
  ADD CONSTRAINT access_pass_purchases_amount_check CHECK (amount = 399.00);

-- ── Commercial master catalog ───────────────────────────────────────────────
-- produtos_internos is the existing commercial/marketing catalog used by the
-- Super Admin. It remains separate from tenant_nav_modules and from customer
-- physical-product catalogs.

UPDATE produtos_internos
SET nome = 'VendorAI Growth',
    descricao_uso = 'Plano completo VendorAI, sem limite de usuários. Duas formas de uso: 5 dias grátis por mês com blocos adicionais de 5 dias por R$ 399,00; ou assinatura contínua por R$ 497 nos primeiros 30 dias pagos, R$ 990/mês nos 5 meses seguintes e R$ 1.490/mês depois. Implantação padrão autoguiada pelo agente. Implantação assistida opcional por R$ 1.890.',
    tipo = 'oferta',
    ordem = 100,
    ativo = true,
    updated_at = now()
WHERE categoria = 'Produtos Comerciais VendorAI'
  AND nome IN ('VendorAI PME Completo', 'VendorAI Growth');

WITH commercial(nome, descricao_uso, tipo, nichos_relacionados, ordem) AS (
  VALUES
    ('VendorAI Growth', 'Plano completo VendorAI, sem limite de usuários. Duas formas de uso: 5 dias grátis por mês com blocos adicionais de 5 dias por R$ 399,00; ou assinatura contínua por R$ 497 nos primeiros 30 dias pagos, R$ 990/mês nos 5 meses seguintes e R$ 1.490/mês depois. Implantação padrão autoguiada pelo agente. Implantação assistida opcional por R$ 1.890.', 'oferta', '[]'::jsonb, 100),
    ('Vendor CRM', 'CRM comercial para gestão de leads, contatos, pipeline, oportunidades, tarefas, tags, filtros e histórico. Preço: R$ 49,90/mês.', 'produto', '[]'::jsonb, 101),
    ('Vendor Prospector', 'Prospecção automática, descoberta e qualificação de empresas e leads, sinais comerciais, filas e envio ao CRM. Preço: R$ 399,00/mês.', 'produto', '[]'::jsonb, 102),
    ('Vendor Omnichannel', 'Central de atendimento e conversas conectando canais como WhatsApp e Instagram ao contexto do CRM. Preço: R$ 199,00/mês.', 'produto', '[]'::jsonb, 103),
    ('Vendor Agenda', 'Agenda online, disponibilidade, agendamentos, reagendamentos, lembretes e vínculo com cliente. Preço: R$ 19,90/mês.', 'produto', '[]'::jsonb, 104),
    ('Vendor AI Team — 10 agentes', 'Pacote com até 10 agentes de IA especializados, como SDR, Closer, Follow-up, Financeiro, Cobrança, Suporte, Agendamento e Pós-venda. Preço: R$ 499,00/mês.', 'produto', '[]'::jsonb, 105),
    ('Vendor Revenue Scout', 'Motor de inteligência de receita que varre a base, encontra oportunidades, sinais de recompra, risco, reativação e próxima melhor ação. Consolida Revenue Scout e Customer Intelligence em uma oferta comercial.', 'produto', '[]'::jsonb, 106),
    ('Vendor Content Planner', 'Planejamento estratégico, calendário, temas, canais, frequência, campanhas e pauta de conteúdo. Preço: R$ 199,00/mês.', 'produto', '[]'::jsonb, 107),
    ('Vendor Content Studio', 'Geração operacional de textos, legendas, copies, roteiros, carrosséis, posts e conteúdos para campanhas. Preço: R$ 399,00/mês.', 'produto', '[]'::jsonb, 108),
    ('Vendor Creative Studio', 'Ferramentas generativas para imagens, vídeos com IA, voz, dublagem, mockups, apresentação de produtos e mídia criativa. Preço: R$ 139,00/mês, sujeito a franquia/créditos de uso.', 'produto', '[]'::jsonb, 109),
    ('Vendor Sites & Autopilot', 'Sites, landing pages, SEO, conteúdo, analytics e Content Autopilot em uma oferta integrada. Preço: R$ 499,00/mês.', 'produto', '[]'::jsonb, 110),
    ('Vendor Ads', 'Planejamento e geração de anúncios/campanhas para diferentes canais, com estratégia, orçamento, públicos, textos e criativos. Preço: R$ 199,00/mês.', 'produto', '[]'::jsonb, 111),
    ('Vendor JARVIS', 'Assistente executivo e camada de inteligência central para análise do negócio, prioridades, alertas, oportunidades, riscos, decisões e automações. Preço: R$ 149,00/mês.', 'produto', '[]'::jsonb, 112),
    ('Vendor Propostas & Catálogo', 'Propostas comerciais, aprovação por link, catálogo inteligente, contratos, confirmação de venda e cálculo de comissão em uma única solução.', 'produto', '[]'::jsonb, 113),
    ('Vendor Gestão', 'Gestão operacional com ERP, financeiro, contas a pagar e receber, lançamento por foto, documentos fiscais, estoque, compras, fornecedores e controles administrativos.', 'produto', '[]'::jsonb, 114),
    ('arqdor.ai', 'Produto especializado para arquitetura e interiores: projetos, render por IA, orçamento técnico, especificação de itens, biblioteca, portal do cliente e marketplace do ecossistema de projeto.', 'produto', '["Arquitetura & Design"]'::jsonb, 115),
    ('Praça.ai', 'Marketplace integrado ao ecossistema VendorAI com vitrine, pedidos, pagamentos, avaliações, reputação, entregas, rastreio, matching logístico, disputas e painel executivo.', 'produto', '[]'::jsonb, 116),
    ('App Personalizado VendorAI', 'Aplicativo personalizado para o cliente com marca, nome, identidade, ícone, splash e configuração do tenant. Preço: R$ 4.990,00 à vista ou 12x de R$ 499,00.', 'produto', '[]'::jsonb, 117),
    ('Implantação VendorAI', 'Implantação assistida opcional para clientes que preferirem apoio humano além do onboarding autoguiado pelo agente: configuração inicial, parametrização, integrações, usuários e treinamento. Preço: R$ 1.890,00.', 'servico', '[]'::jsonb, 118)
)
INSERT INTO produtos_internos (
  id, categoria, nome, descricao_uso, tipo, nichos_relacionados,
  ordem, ativo, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  'Produtos Comerciais VendorAI',
  c.nome,
  c.descricao_uso,
  c.tipo,
  c.nichos_relacionados,
  c.ordem,
  true,
  now(),
  now()
FROM commercial c
WHERE NOT EXISTS (
  SELECT 1
  FROM produtos_internos p
  WHERE p.categoria = 'Produtos Comerciais VendorAI'
    AND lower(p.nome) = lower(c.nome)
);

-- Keep ordering and Growth/implantation copy canonical for records that were
-- already present before this migration.
UPDATE produtos_internos SET ordem=101, ativo=true, updated_at=now() WHERE categoria='Produtos Comerciais VendorAI' AND nome='Vendor CRM';
UPDATE produtos_internos SET ordem=102, ativo=true, updated_at=now() WHERE categoria='Produtos Comerciais VendorAI' AND nome='Vendor Prospector';
UPDATE produtos_internos SET ordem=103, ativo=true, updated_at=now() WHERE categoria='Produtos Comerciais VendorAI' AND nome='Vendor Omnichannel';
UPDATE produtos_internos SET ordem=104, ativo=true, updated_at=now() WHERE categoria='Produtos Comerciais VendorAI' AND nome='Vendor Agenda';
UPDATE produtos_internos SET ordem=105, ativo=true, updated_at=now() WHERE categoria='Produtos Comerciais VendorAI' AND nome='Vendor AI Team — 10 agentes';
UPDATE produtos_internos SET ordem=106, ativo=true, updated_at=now() WHERE categoria='Produtos Comerciais VendorAI' AND nome='Vendor Revenue Scout';
UPDATE produtos_internos SET ordem=107, ativo=true, updated_at=now() WHERE categoria='Produtos Comerciais VendorAI' AND nome='Vendor Content Planner';
UPDATE produtos_internos SET ordem=108, ativo=true, updated_at=now() WHERE categoria='Produtos Comerciais VendorAI' AND nome='Vendor Content Studio';
UPDATE produtos_internos SET ordem=109, ativo=true, updated_at=now() WHERE categoria='Produtos Comerciais VendorAI' AND nome='Vendor Creative Studio';
UPDATE produtos_internos SET ordem=110, ativo=true, updated_at=now() WHERE categoria='Produtos Comerciais VendorAI' AND nome='Vendor Sites & Autopilot';
UPDATE produtos_internos SET ordem=111, ativo=true, updated_at=now() WHERE categoria='Produtos Comerciais VendorAI' AND nome='Vendor Ads';
UPDATE produtos_internos SET ordem=112, ativo=true, updated_at=now() WHERE categoria='Produtos Comerciais VendorAI' AND nome='Vendor JARVIS';
UPDATE produtos_internos SET ordem=113, ativo=true, updated_at=now() WHERE categoria='Produtos Comerciais VendorAI' AND nome='Vendor Propostas & Catálogo';
UPDATE produtos_internos SET ordem=114, ativo=true, updated_at=now() WHERE categoria='Produtos Comerciais VendorAI' AND nome='Vendor Gestão';
UPDATE produtos_internos SET ordem=115, ativo=true, updated_at=now() WHERE categoria='Produtos Comerciais VendorAI' AND lower(nome)='arqdor.ai';
UPDATE produtos_internos SET ordem=116, ativo=true, updated_at=now() WHERE categoria='Produtos Comerciais VendorAI' AND lower(nome)='praça.ai';
UPDATE produtos_internos SET ordem=117, ativo=true, updated_at=now() WHERE categoria='Produtos Comerciais VendorAI' AND nome='App Personalizado VendorAI';
UPDATE produtos_internos
SET descricao_uso='Implantação assistida opcional para clientes que preferirem apoio humano além do onboarding autoguiado pelo agente: configuração inicial, parametrização, integrações, usuários e treinamento. Preço: R$ 1.890,00.',
    tipo='servico', ordem=118, ativo=true, updated_at=now()
WHERE categoria='Produtos Comerciais VendorAI' AND nome='Implantação VendorAI';
