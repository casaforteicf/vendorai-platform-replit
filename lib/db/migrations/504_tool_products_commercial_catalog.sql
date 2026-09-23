-- VendorAI tool-by-tool commercial catalog.
-- Each platform tool is sellable as an independent product with its own SKU,
-- description, generated outcome and reference commercial value.
-- Idempotent: existing SKU rows are updated, missing rows are inserted.
-- Customer-facing AI consumption remains quota/token based; these prices represent
-- software access/reference value, not model-provider cost.

WITH vendor_catalog_tenant AS (
  SELECT tenant_id, categoria_id
  FROM produtos_catalogo
  WHERE tenant_id IS NOT NULL
    AND sku IN ('vendor-crm-monthly','vendor-growth-monthly','vendor-prospector-monthly')
  ORDER BY CASE WHEN sku = 'vendor-crm-monthly' THEN 0 ELSE 1 END, created_at DESC
  LIMIT 1
),
tool_products(categoria, nome, sku, descricao, resultado_gerado, valor, product_type, recorrencia) AS (
  VALUES
    ('Vendas & CRM','VendorAI CRM','VAI-CRM-001','Centraliza leads, clientes, histórico e oportunidades.','Gera uma visão única da carteira comercial, atividades e relacionamento.',299::numeric,'saas_addon','mensal'),
    ('Vendas & CRM','VendorAI Pipeline','VAI-PIPE-001','Funil visual para gestão das oportunidades.','Gera etapas, responsáveis, valores, previsões e movimentações do funil.',199::numeric,'saas_addon','mensal'),
    ('Vendas & CRM','VendorAI Prospector','VAI-PROSP-001','Pesquisa e identifica potenciais clientes e sinais comerciais.','Gera listas qualificadas de prospects, contexto e oportunidades de abordagem.',499::numeric,'saas_addon','mensal'),
    ('Vendas & CRM','VendorAI SDR','VAI-SDR-001','Executa primeiro atendimento e qualificação comercial.','Gera qualificação, contexto do lead e encaminhamento para a próxima etapa.',399::numeric,'saas_addon','mensal'),
    ('Vendas & CRM','VendorAI Closer','VAI-CLOSER-001','Apoia negociação e fechamento.','Gera respostas a objeções, argumentos, próximos passos e apoio ao fechamento.',399::numeric,'saas_addon','mensal'),
    ('Vendas & CRM','VendorAI Follow-up','VAI-FOLLOW-001','Automatiza acompanhamento de leads e oportunidades.','Gera cadências, lembretes e contatos de follow-up até resposta ou conclusão.',299::numeric,'saas_addon','mensal'),
    ('Vendas & CRM','VendorAI Lead Scoring','VAI-LEADSCORE-001','Classifica e prioriza leads.','Gera pontuação e prioridade com base em perfil, intenção e comportamento.',249::numeric,'saas_addon','mensal'),
    ('Inteligência','VendorAI Revenue Scout','VAI-REV-001','Identifica oportunidades adicionais de receita.','Gera sinais de recompra, upsell, cross-sell e expansão de carteira.',399::numeric,'saas_addon','mensal'),
    ('Inteligência','VendorAI Next Best Action','VAI-NBA-001','Recomenda a melhor próxima ação por cliente.','Gera recomendações operacionais para avançar relacionamento e vendas.',349::numeric,'saas_addon','mensal'),
    ('Inteligência','VendorAI Intent','VAI-INTENT-001','Analisa sinais de intenção de compra.','Gera indicadores de interesse e mudança de intenção.',349::numeric,'saas_addon','mensal'),
    ('Inteligência','VendorAI Behavior','VAI-BEHAV-001','Analisa comportamento e padrões de interação.','Gera perfis comportamentais e sinais úteis para abordagem.',349::numeric,'saas_addon','mensal'),
    ('Inteligência','VendorAI Journey','VAI-JOURNEY-001','Mapeia a jornada do cliente.','Gera visão do percurso desde a descoberta até pós-venda e recompra.',249::numeric,'saas_addon','mensal'),
    ('Inteligência','VendorAI Churn','VAI-CHURN-001','Detecta risco de perda de clientes.','Gera alertas e sinais de possível abandono ou redução de relacionamento.',299::numeric,'saas_addon','mensal'),
    ('Inteligência','VendorAI Personalization','VAI-PERS-001','Personaliza abordagem e conteúdo por cliente.','Gera mensagens, ofertas e experiências adaptadas ao contexto.',299::numeric,'saas_addon','mensal'),
    ('Atendimento','VendorAI Atendimento','VAI-ATT-001','Central inteligente de atendimento comercial.','Gera respostas assistidas, triagem, histórico e encaminhamento.',399::numeric,'saas_addon','mensal'),
    ('Atendimento','VendorAI Suporte','VAI-SUP-001','Gerencia suporte do início ao encerramento.','Gera acompanhamento, follow-up, resolução e coleta de avaliação.',299::numeric,'saas_addon','mensal'),
    ('Atendimento','VendorAI Tickets','VAI-TICKET-001','Organiza chamados e solicitações.','Gera tickets, prioridades, responsáveis, status e histórico.',199::numeric,'saas_addon','mensal'),
    ('Atendimento','VendorAI Pós-venda','VAI-POS-001','Automatiza relacionamento após a venda.','Gera contatos de acompanhamento, satisfação, recompra e retenção.',249::numeric,'saas_addon','mensal'),
    ('Atendimento','VendorAI NPS','VAI-NPS-001','Mede satisfação e recomendação.','Gera pesquisas, notas e indicadores de experiência.',99::numeric,'saas_addon','mensal'),
    ('Atendimento','VendorAI Reviews','VAI-REVIEWS-001','Coleta avaliações de clientes.','Gera notas, comentários, fotos e histórico de avaliações.',149::numeric,'saas_addon','mensal'),
    ('Atendimento','VendorAI Agenda','VAI-AGENDA-001','Organiza compromissos e agendamentos.','Gera agenda, confirmações, lembretes e disponibilidade.',149::numeric,'saas_addon','mensal'),
    ('Comunicação','VendorAI Omnichannel','VAI-OMNI-001','Unifica canais de atendimento.','Gera uma caixa de entrada central com histórico multicanal.',399::numeric,'saas_addon','mensal'),
    ('Comunicação','VendorAI WhatsApp','VAI-WPP-001','Atendimento e automações no WhatsApp.','Gera conversas organizadas, automações e relacionamento pelo canal.',199::numeric,'saas_addon','mensal'),
    ('Comunicação','VendorAI Instagram','VAI-INSTA-001','Centraliza contatos e DMs do Instagram.','Gera atendimento, captura de leads e histórico das conversas.',149::numeric,'saas_addon','mensal'),
    ('Comunicação','VendorAI E-mail','VAI-EMAIL-001','Comunicação comercial e automações por e-mail.','Gera mensagens, cadências, campanhas e histórico.',149::numeric,'saas_addon','mensal'),
    ('Comunicação','VendorAI Chat','VAI-CHAT-001','Chat inteligente para sites e landing pages.','Gera atendimento em tempo real, triagem e captura de leads.',99::numeric,'saas_addon','mensal'),
    ('Comercial','VendorAI Propostas','VAI-PROP-001','Cria e acompanha propostas comerciais.','Gera propostas estruturadas, envio, histórico e acompanhamento.',149::numeric,'saas_addon','mensal'),
    ('Comercial','VendorAI Orçamentos','VAI-ORC-001','Cria orçamentos comerciais.','Gera composição de produtos e serviços, preços, condições e totais.',199::numeric,'saas_addon','mensal'),
    ('Comercial','VendorAI Aceite','VAI-ASSIN-001','Registra aprovação e aceite digital.','Gera evidência de aceite e avanço do processo comercial.',99::numeric,'saas_addon','mensal'),
    ('Comercial','VendorAI Pedidos','VAI-PED-001','Gerencia pedidos derivados de vendas.','Gera pedidos, status, itens, valores e acompanhamento.',199::numeric,'saas_addon','mensal'),
    ('Comercial','VendorAI Catálogo','VAI-CATALOGO-001','Organiza catálogo de produtos e serviços.','Gera estrutura de famílias, linhas, aplicações, imagens e informações comerciais.',149::numeric,'saas_addon','mensal'),
    ('Marketing','VendorAI Marketing','VAI-MKT-001','Central de planejamento e execução de marketing.','Gera planos, ações, calendário e acompanhamento de campanhas.',399::numeric,'saas_addon','mensal'),
    ('Marketing','VendorAI Content Planner','VAI-PLAN-001','Planeja calendário de conteúdo.','Gera pauta, canais, formatos, horários e cronograma editorial.',199::numeric,'saas_addon','mensal'),
    ('Marketing','VendorAI Social','VAI-SOCIAL-001','Gerencia conteúdo de redes sociais.','Gera posts, legendas, calendário e materiais para publicação.',249::numeric,'saas_addon','mensal'),
    ('Marketing','VendorAI Ads','VAI-ADS-001','Cria e organiza campanhas de anúncios.','Gera anúncios, criativos, segmentações e acompanhamento.',299::numeric,'saas_addon','mensal'),
    ('Marketing','VendorAI Meta Ads','VAI-META-001','Gerencia campanhas Meta.','Gera campanhas, conjuntos, anúncios e acompanhamento de desempenho.',249::numeric,'saas_addon','mensal'),
    ('Marketing','VendorAI Google Ads','VAI-GADS-001','Gerencia campanhas Google.','Gera campanhas, grupos, anúncios e acompanhamento de desempenho.',249::numeric,'saas_addon','mensal'),
    ('Marketing','VendorAI Campaigns','VAI-CAMP-001','Coordena campanhas multicanal.','Gera campanhas integradas com públicos, peças, canais e métricas.',299::numeric,'saas_addon','mensal'),
    ('Marketing','VendorAI Forms','VAI-FORM-001','Cria formulários de captação.','Gera formulários, campos, qualificação e entrada automática de leads.',99::numeric,'saas_addon','mensal'),
    ('Marketing','VendorAI Landing Pages','VAI-LP-001','Cria landing pages focadas em conversão.','Gera páginas de campanha integradas ao CRM e formulários.',249::numeric,'saas_addon','mensal'),
    ('Marketing','VendorAI Sites','VAI-SITE-001','Cria e administra sites profissionais.','Gera páginas, conteúdo, captação e integração com o CRM.',499::numeric,'saas_addon','mensal'),
    ('Marketing','VendorAI SEO','VAI-SEO-001','Otimiza presença orgânica.','Gera recomendações, conteúdo e melhorias de SEO.',249::numeric,'saas_addon','mensal'),
    ('Marketing','VendorAI Blog','VAI-BLOG-001','Planeja e produz conteúdo para blog.','Gera pautas, artigos e calendário editorial.',199::numeric,'saas_addon','mensal'),
    ('IA Criativa','VendorAI Image','VAI-IMG-001','Geração de imagens com IA.','Gera imagens para campanhas, produtos, apresentações e conteúdo.',149::numeric,'saas_addon','mensal'),
    ('IA Criativa','VendorAI Video','VAI-VIDEO-001','Geração e transformação de vídeos com IA.','Gera vídeos comerciais, sociais e institucionais.',299::numeric,'saas_addon','mensal'),
    ('IA Criativa','VendorAI Voice','VAI-VOICE-001','Geração de voz e áudio com IA.','Gera narrações, áudios e vozes para conteúdos.',149::numeric,'saas_addon','mensal'),
    ('IA Criativa','VendorAI Dublê Digital','VAI-DUBLE-001','Cria conteúdo com identidade digital do usuário.','Gera vídeos e peças com avatar, voz e referências autorizadas.',499::numeric,'saas_addon','mensal'),
    ('IA Criativa','VendorAI Creative Studio','VAI-CREATIVE-001','Central integrada de criação com IA.','Gera texto, imagem, vídeo, voz e peças de campanha.',599::numeric,'saas_addon','mensal'),
    ('Commerce','VendorAI Ecommerce','VAI-ECOM-001','Loja virtual integrada ao ecossistema VendorAI.','Gera vitrine, produtos, pedidos e integração comercial.',399::numeric,'saas_addon','mensal'),
    ('Commerce','VendorAI Marketplace','VAI-MKTPLACE-001','Marketplace multiempresa.','Gera vitrine de múltiplos vendedores, ofertas e pedidos.',599::numeric,'saas_addon','mensal'),
    ('Commerce','PraçaAI','VAI-PRACA-001','Ecossistema comercial de marketplace e operação.','Gera vendas, parceiros, logística, comissões e pagamentos integrados.',799::numeric,'saas_addon','mensal'),
    ('Commerce','VendorAI Cupons','VAI-CUPOM-001','Gerencia cupons promocionais.','Gera códigos, regras, descontos e rastreabilidade.',99::numeric,'saas_addon','mensal'),
    ('Commerce','VendorAI Fidelidade','VAI-FIDEL-001','Programa de fidelização.','Gera benefícios, regras e acompanhamento de recorrência.',149::numeric,'saas_addon','mensal'),
    ('Commerce','VendorAI Indicações','VAI-INDICA-001','Programa de indicação de clientes.','Gera vínculos, recompensas e rastreamento das indicações.',149::numeric,'saas_addon','mensal'),
    ('Commerce','VendorAI Influencers','VAI-INFLU-001','Gerencia influenciadores e vendas atribuídas.','Gera cupons, vínculos, vendas e comissões por influenciador.',199::numeric,'saas_addon','mensal'),
    ('Commerce','VendorAI Comissões','VAI-COMIS-001','Calcula e acompanha comissões.','Gera apuração, histórico e valores por vendedor, parceiro ou influenciador.',199::numeric,'saas_addon','mensal'),
    ('Operação','VendorAI Compras','VAI-COMP-001','Gerencia solicitação, cotação e compra.','Gera solicitações, comparativos, aprovações e pedidos de compra.',249::numeric,'saas_addon','mensal'),
    ('Operação','VendorAI Fornecedores','VAI-FORN-001','Gerencia fornecedores.','Gera cadastro, histórico, comparativos e informações de fornecimento.',149::numeric,'saas_addon','mensal'),
    ('Operação','VendorAI Estoque','VAI-EST-001','Controla disponibilidade e movimentações.','Gera saldo, movimentações e alertas de estoque.',249::numeric,'saas_addon','mensal'),
    ('Operação','VendorAI Logística','VAI-LOG-001','Organiza coletas, rotas e entregas.','Gera rotas, responsáveis, etapas e acompanhamento logístico.',299::numeric,'saas_addon','mensal'),
    ('Operação','VendorAI Rastreamento','VAI-TRACK-001','Acompanha pedidos e entregas.','Gera status, eventos e rastreabilidade da entrega.',149::numeric,'saas_addon','mensal'),
    ('Financeiro','VendorAI Financeiro','VAI-FIN-001','Organiza informações financeiras ligadas à operação.','Gera visão financeira, lançamentos e acompanhamento operacional.',299::numeric,'saas_addon','mensal'),
    ('Financeiro','VendorAI Cobrança','VAI-COB-001','Automatiza acompanhamento de cobranças.','Gera lembretes, cadências e histórico de cobrança.',299::numeric,'saas_addon','mensal'),
    ('Conhecimento & Automação','VendorAI Knowledge','VAI-KNOW-001','Base central de conhecimento empresarial.','Gera contexto consultável para usuários e agentes de IA.',199::numeric,'saas_addon','mensal'),
    ('Conhecimento & Automação','VendorAI FAQ','VAI-FAQ-001','Central de perguntas e respostas.','Gera FAQ estruturado e respostas a dúvidas recorrentes.',99::numeric,'saas_addon','mensal'),
    ('Conhecimento & Automação','VendorAI Training','VAI-TRAIN-001','Treinamento interno baseado no conhecimento da empresa.','Gera trilhas, conteúdos e apoio ao treinamento da equipe.',249::numeric,'saas_addon','mensal'),
    ('Conhecimento & Automação','VendorAI Automations','VAI-AUTO-001','Automatiza processos repetitivos.','Gera regras e ações automáticas a partir de eventos.',299::numeric,'saas_addon','mensal'),
    ('Conhecimento & Automação','VendorAI Workflows','VAI-WFLOW-001','Cria fluxos operacionais condicionais.','Gera sequências, condições, responsabilidades e automações.',349::numeric,'saas_addon','mensal'),
    ('Conhecimento & Automação','VendorAI Webhooks','VAI-WEBHOOK-001','Integra eventos com sistemas externos.','Gera disparos e recebimentos de eventos via webhook.',149::numeric,'saas_addon','mensal'),
    ('Conhecimento & Automação','VendorAI API','VAI-API-001','Acesso programático autorizado ao VendorAI.','Gera integração de dados e operações por API.',299::numeric,'saas_addon','mensal'),
    ('Conhecimento & Automação','VendorAI Integrations','VAI-INTEG-001','Central de integrações externas.','Gera conexões e sincronizações com serviços compatíveis.',249::numeric,'saas_addon','mensal'),
    ('Gestão','VendorAI Dashboard','VAI-DASH-001','Painel executivo de indicadores.','Gera visão consolidada de vendas, operação e performance.',199::numeric,'saas_addon','mensal'),
    ('Gestão','VendorAI Analytics','VAI-ANALYTICS-001','Análises e relatórios avançados.','Gera indicadores, comparativos e leituras de desempenho.',249::numeric,'saas_addon','mensal'),
    ('Gestão','VendorAI Observer','VAI-OBS-001','Observa sinais estratégicos da operação.','Gera leitura de cidades, vendedores, produtos, ticket, descontos e oportunidades.',299::numeric,'saas_addon','mensal'),
    ('Gestão','VendorAI Metas','VAI-METAS-001','Define e acompanha metas e KPIs.','Gera metas por período, responsável e indicador.',149::numeric,'saas_addon','mensal'),
    ('Gestão','VendorAI Equipes','VAI-EQUIPE-001','Gerencia usuários, funções e acessos.','Gera organização da equipe, perfis, permissões e responsabilidades.',149::numeric,'saas_addon','mensal'),
    ('Gestão','VendorAI Representantes','VAI-REP-001','Gerencia representantes e territórios.','Gera carteiras, regiões, metas, atividades e resultados.',249::numeric,'saas_addon','mensal'),
    ('Portais','VendorAI Portal Cliente','VAI-PORTAL-CLI-001','Portal de acompanhamento para clientes.','Gera área exclusiva com informações, documentos e andamento.',199::numeric,'saas_addon','mensal'),
    ('Portais','VendorAI Portal Parceiros','VAI-PORTAL-PAR-001','Portal de parceiros e representantes.','Gera área exclusiva para informações, materiais, resultados e operação.',249::numeric,'saas_addon','mensal'),
    ('Prospecção','VendorAI Radar','VAI-RADAR-001','Monitora sinais e oportunidades de mercado.','Gera alertas e oportunidades de prospecção a partir de sinais relevantes.',399::numeric,'saas_addon','mensal'),
    ('Prospecção','VendorAI Radar de Obras','VAI-OBRAS-001','Identifica obras e oportunidades relacionadas à construção.','Gera registros de obras, localização, contexto e oportunidades comerciais.',499::numeric,'saas_addon','mensal'),
    ('Plataforma','VendorAI Multi-Tenant','VAI-MULTI-001','Gerencia múltiplas empresas na mesma estrutura.','Gera separação, administração e governança entre tenants.',799::numeric,'saas_addon','mensal'),
    ('Plataforma','VendorAI White Label','VAI-WLABEL-001','Disponibiliza plataforma com identidade do parceiro.','Gera experiência personalizada de marca e operação.',1499::numeric,'saas_addon','mensal'),
    ('Serviços','VendorAI Onboarding','VAI-ONBOARD-001','Configuração inicial assistida do tenant.','Gera estrutura inicial, usuários e parâmetros para começar a operar.',990::numeric,'service',NULL),
    ('Serviços','VendorAI Import','VAI-IMPORT-001','Importação estruturada de dados.','Gera carga organizada de clientes, leads, produtos e informações.',490::numeric,'service',NULL),
    ('Arqdor','Arqdor Projetos','ARQ-PROJ-001','Gestão de projetos arquitetônicos.','Gera estrutura de projetos, etapas, responsáveis e acompanhamento.',299::numeric,'saas_addon','mensal'),
    ('Arqdor','Arqdor Planta','ARQ-PLANTA-001','Criação e edição de plantas baixas.','Gera plantas e documentação visual do layout.',299::numeric,'saas_addon','mensal'),
    ('Arqdor','Arqdor Fachada','ARQ-FACH-001','Desenvolvimento visual de fachadas.','Gera estudos e propostas de fachada.',299::numeric,'saas_addon','mensal'),
    ('Arqdor','Arqdor 3D','ARQ-3D-001','Modelagem tridimensional de projetos.','Gera modelos 3D para visualização e evolução do projeto.',399::numeric,'saas_addon','mensal'),
    ('Arqdor','Arqdor Render','ARQ-RENDER-001','Renderização realista de projetos.','Gera imagens realistas em alta qualidade a partir do projeto.',299::numeric,'saas_addon','mensal'),
    ('Arqdor','Arqdor Interiores','ARQ-INTER-001','Desenvolvimento de ambientes internos.','Gera estudos de interiores, materiais, composição e visualização.',299::numeric,'saas_addon','mensal'),
    ('Arqdor','Arqdor Materiais','ARQ-MAT-001','Biblioteca de materiais e acabamentos.','Gera seleção e aplicação organizada de materiais nos projetos.',149::numeric,'saas_addon','mensal'),
    ('Arqdor','Arqdor Componentes','ARQ-COMP-001','Biblioteca de móveis e objetos 3D.','Gera componentes reutilizáveis para composição dos ambientes.',149::numeric,'saas_addon','mensal'),
    ('Arqdor','Arqdor Terreno','ARQ-TERR-001','Implantação da edificação no terreno.','Gera posicionamento, orientação e contexto do projeto no lote.',199::numeric,'saas_addon','mensal'),
    ('Arqdor','Arqdor Orçamento','ARQ-ORC-001','Orçamento associado ao projeto.','Gera quantificação, itens e estimativas vinculadas ao projeto.',249::numeric,'saas_addon','mensal'),
    ('Arqdor','Arqdor Cronograma','ARQ-CRONO-001','Planejamento de atividades e prazos.','Gera cronograma, dependências, marcos e acompanhamento da execução.',249::numeric,'saas_addon','mensal'),
    ('Arqdor','Arqdor Diário de Obras','ARQ-DIARIO-001','Registro diário da execução da obra.','Gera registros, fotos, equipes, atividades e evolução.',249::numeric,'saas_addon','mensal'),
    ('Arqdor','Arqdor Compras','ARQ-COMPRAS-001','Compras vinculadas à obra.','Gera solicitações, cotações, comparativos e pedidos.',249::numeric,'saas_addon','mensal'),
    ('Arqdor','Arqdor Custos','ARQ-CUSTOS-001','Controle financeiro da obra.','Gera comparação entre previsto, contratado, comprado e realizado.',249::numeric,'saas_addon','mensal'),
    ('Arqdor','Arqdor Portal Cliente','ARQ-PORTAL-001','Portal de acompanhamento do projeto e obra.','Gera área exclusiva para informações, documentos e decisões do cliente.',199::numeric,'saas_addon','mensal'),
    ('Arqdor','Arqdor Marketplace','ARQ-MKT-001','Marketplace de materiais e fornecedores para projetos.','Gera conexão entre especificações, marcas, produtos e fornecedores.',399::numeric,'saas_addon','mensal')
),
updated AS (
  UPDATE produtos_catalogo c
  SET
    nome = p.nome,
    product_type = p.product_type,
    descricao = p.descricao,
    descricao_longa = p.resultado_gerado,
    preco_base = p.valor,
    preco_mensalidade = CASE WHEN p.product_type = 'saas_addon' THEN p.valor ELSE NULL END,
    preco_implantacao = CASE WHEN p.product_type = 'service' THEN p.valor ELSE c.preco_implantacao END,
    unidade = CASE WHEN p.product_type = 'service' THEN 'servico' ELSE 'mes' END,
    recorrencia = p.recorrencia,
    ativo = true,
    tags = jsonb_build_array('catalogo-ferramentas', p.categoria),
    updated_at = now()
  FROM tool_products p
  WHERE c.sku = p.sku
  RETURNING c.sku
)
INSERT INTO produtos_catalogo
  (id, tenant_id, categoria_id, nome, sku, product_type, descricao, descricao_longa,
   preco_base, preco_implantacao, preco_mensalidade, unidade, recorrencia,
   ativo, destaque, tags, exige_agendamento, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  v.tenant_id,
  v.categoria_id,
  p.nome,
  p.sku,
  p.product_type,
  p.descricao,
  p.resultado_gerado,
  p.valor,
  CASE WHEN p.product_type = 'service' THEN p.valor ELSE NULL END,
  CASE WHEN p.product_type = 'saas_addon' THEN p.valor ELSE NULL END,
  CASE WHEN p.product_type = 'service' THEN 'servico' ELSE 'mes' END,
  p.recorrencia,
  true,
  false,
  jsonb_build_array('catalogo-ferramentas', p.categoria),
  false,
  now(),
  now()
FROM vendor_catalog_tenant v
CROSS JOIN tool_products p
WHERE NOT EXISTS (
  SELECT 1 FROM produtos_catalogo c WHERE c.sku = p.sku
);
