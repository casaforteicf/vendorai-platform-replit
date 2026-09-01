# VendorAI — Launch Readiness & Product Adjustment Map

> Documento operacional para o lançamento. Objetivo: reutilizar o que já existe, fechar os gaps de medição/conversão e evoluir o Marketing para otimização por receita real.

## Princípio

O VendorAI deve operar o próprio lançamento como demonstração do produto:

**Atrair → Captar → Converter → Fechar → Entregar → Fidelizar → Expandir → Aprender → Melhorar**

A métrica de marketing não termina no clique nem no lead. A hierarquia de decisão é:

1. receita / margem quando disponível;
2. ROAS;
3. CAC / custo por venda;
4. vendas;
5. oportunidades qualificadas;
6. trials ativados;
7. leads;
8. cliques / CTR.

## Estado atual auditado

### Já existe — preservar e integrar

- Publicação real em Google Ads e Meta Ads.
- Campanhas com `utm_code` próprio.
- Vínculo `leads.ad_campaign_id` para atribuição CRM ↔ mídia.
- Métricas de leads, vendas, receita e ROAS por campanha.
- Geração de criativos com IA e correção de criativos reprovados.
- Guardião de desperdício que pode pausar campanha sem conversão dentro do limite autorizado.
- Landing pages/sites gerados por tenant, com Meta Pixel e Google Ads tag configuráveis.
- Contexto de Marketing separado em público/nicho/oferta/objetivo e catálogo do tenant.
- CRM, negócios e agentes de atendimento/follow-up.
- Pós-venda automático por entrega, classificação de satisfação e pedido de avaliação Google quando adequado.
- Revenue Scout com regras, pipeline, sequência de produtos, intent score e base de ML.
- Trial individual de 5 dias já existente no site/backend e agora integrado à atribuição de campanha.
- Arquitetura de LPs verticais já existente no site e reutilizável para os packs de lançamento.

## Onda 1 — bloqueadores de lançamento

### L1. Atribuição first-party ponta a ponta

**Objetivo:** saber exatamente qual campanha gerou cada lead, trial e venda.

Status desta branch:

- [x] intake público aceita UTM, `gclid`, `fbclid`, URL e referrer;
- [x] recupera UTM do Referer atual sem exigir mudança imediata no formulário;
- [x] resolve `utm_campaign` para `ad_campaign_id`;
- [x] usa first-touch: não sobrescreve uma campanha já atribuída;
- [x] registra evento `lead_attributed`;
- [x] adiciona teste unitário do parser de atribuição;
- [x] captura first-touch no site institucional via sessionStorage;
- [x] trial `/auth/trial-signup` recebe atribuição e registra `trial_started`;
- [x] pedidos de demonstração em `/site/contato` recuperam UTM/click IDs e atribuem o lead à campanha;
- [x] follow-up registra `lead_cooling` e `lead_recovered` quando há campanha atribuída;
- [x] `behaviorSessionId` é propagado e vinculado ao lead em demo, trial e intake público;
- [ ] garantir propagação explícita da origem em todo formulário/WhatsApp de sites gerados;
- [ ] garantir atribuição em Instagram/Messenger e demais entradas quando houver identificador de campanha;
- [ ] persistir touchpoints posteriores sem perder o first-touch para futura atribuição multi-touch.

**Aceite:** um lead ou trial originado de anúncio deve aparecer no CRM com a campanha correta, e uma venda ganha deve retornar no overview daquela campanha.

### L2. Lifecycle comercial first-party

Status desta branch:

- [x] `trial_started`;
- [x] `lead_cooling`;
- [x] `lead_recovered`;
- [x] sincronizador idempotente de `trial_activated`;
- [x] sincronizador idempotente de `sale_closed`;
- [x] eventos não críticos deixam de inflar o contador de alertas;
- [x] estado final do CRM é a fonte de verdade, independentemente do caminho de fechamento.

**Definição atual de trial ativado:** onboarding concluído + (integrações concluídas OU primeiro lead real criado no tenant).

### L3. Métricas orientadas a receita

Status desta branch:

- [x] CPL;
- [x] custo por trial;
- [x] custo por trial ativado;
- [x] CAC/custo por venda;
- [x] lead → trial;
- [x] taxa de ativação do trial;
- [x] trial ativado → venda;
- [x] lead → venda;
- [x] receita por lead;
- [x] ROAS;
- [x] leads esfriando/recuperados por campanha;
- [x] recomendação distingue problema de aquisição, ativação e fechamento.

### L4. Conversões server-side / feedback para plataformas

#### Meta Conversions API

Status desta branch:

- [x] worker de server-side conversions criado;
- [x] reutiliza `metaPixelId` + conexão Meta Ads existente;
- [x] eventos elegíveis: Lead, StartTrial, TrialActivated e Purchase;
- [x] PII normalizada e SHA-256 antes do envio;
- [x] `event_id` estável para deduplicação/retry;
- [x] status/erro de envio persistido no metadata do evento;
- [x] limitado a eventos Meta recentes e campanhas Meta;
- [x] protegido por `MARKETING_SERVER_CONVERSIONS_ENABLED`, desligado por padrão;
- [x] consentimento separado do aceite de Termos e evidência de versão/data preparados;
- [ ] validar Pixel, permissão da conexão Meta e eventos em tenant controlado antes de habilitar produção.

#### Google Ads / Data Manager

Em setembro/2026, a implementação nova deve preferir a **Google Data Manager API** para conversões offline/enhanced leads. O fluxo legado `UploadClickConversion` não deve ser adotado como padrão para novos developer tokens.

Status desta branch:

- [x] Google OAuth preparado com escopo Data Manager;
- [x] destinos separados para Lead, Trial ativado e Venda por Conversion Action ID;
- [x] worker com GCLID/user-data hasheado, valor/moeda, consentimento, idempotência e diagnóstico;
- [x] `GOOGLE_DATA_MANAGER_VALIDATE_ONLY=true` por padrão;
- [ ] habilitar a Data Manager API no projeto Google Cloud real;
- [ ] reconectar a conta Google Ads com o novo escopo;
- [ ] configurar Conversion Action IDs reais no tenant VendorAI;
- [ ] validar eventos em `validateOnly` e depois produção controlada.

### L5. Trial individual de 5 dias

Já existe e foi conectado ao lançamento.

Status:

- [x] endpoint/CTA de criação de trial;
- [x] `provisioningMethod = trial`;
- [x] expiração = +5 dias;
- [x] tenant e usuário próprios;
- [x] lead + negócio no CRM comercial da VendorAI;
- [x] atribuição à campanha de origem;
- [x] evento `trial_started`;
- [x] definição e medição de ativação operacional;
- [ ] activation score progressivo, além do critério binário atual;
- [ ] resumo de valor nos dias 1–5;
- [ ] alerta comercial quando houver alta intenção;
- [ ] conversão trial → plano sem perder dados;
- [ ] expiração/grace period e recuperação;
- [ ] eventos de assinatura, upgrade anual e churn.

### L6. Tracking comportamental first-party

Status:

- [x] `page_view`;
- [x] `cta_click`;
- [x] `form_start`;
- [x] `form_submit`;
- [x] tempo engajado;
- [x] profundidade de scroll;
- [x] sessão anônima → lead após identificação;
- [x] Behavior Intent Score explicável 0–100;
- [x] faixa de intenção e ação comercial recomendada;
- [x] Behavior Intent visível na ficha do lead;
- [ ] eventos dedicados `demo_started` / `demo_completed`;
- [ ] evento dedicado `pricing_viewed` em vez de depender apenas da URL;
- [ ] sinal explícito de retorno à página/sessões recorrentes.

## Onda 2 — AI Marketing Manager

### Modo Observador

- lê performance + CRM;
- calcula CPL, CAC, lead→venda, receita/lead, ROAS;
- identifica gargalo: anúncio, LP, qualidade, follow-up ou fechamento;
- recomenda ação, sem alterar mídia.

Status atual: **base implementada no Launch Command Center** com diagnóstico por aquisição, LP, qualidade/intenção, ativação, follow-up, fechamento, escala e aprendizado.

### Modo Assistido

- gera novo criativo/LP/público/keyword;
- prepara rascunho;
- usuário aprova antes de publicar ou alterar orçamento.

### Modo Autônomo

Somente com autorização e guardrails:

- pausar desperdício;
- substituir criativo perdedor;
- promover variações vencedoras;
- redistribuir verba dentro de limites definidos;
- nunca ultrapassar teto diário/mensal;
- exigir volume mínimo e janela mínima de dados;
- considerar atraso entre lead e fechamento.

## Onda 3 — 50 verticais de lançamento

Não criar 50 sistemas. Criar **1 engine + packs verticais configuráveis**, reutilizando a arquitetura `LP_CONFIGS` existente.

### Lojas / Varejo — 10

1. Moda, roupas, calçados e acessórios
2. Móveis, decoração e casa
3. Materiais de construção e acabamentos
4. Eletrônicos e eletrodomésticos
5. Supermercados, mercados e empórios
6. Pet shops
7. Óticas
8. Autopeças e acessórios
9. Cosméticos, perfumaria e beleza
10. Joias, presentes e varejo especializado

### Clínicas — 10

1. Clínica médica
2. Odontologia
3. Estética
4. Dermatologia
5. Fisioterapia
6. Psicologia
7. Nutrição
8. Oftalmologia
9. Ortopedia
10. Clínica veterinária

### Concessionárias — 5

1. Automóveis novos
2. Seminovos / multimarcas
3. Motocicletas
4. Caminhões / comerciais
5. Máquinas agrícolas / pesadas

### Distribuidoras — 7

1. Materiais de construção
2. Autopeças
3. Alimentos e bebidas
4. Farmacêutica / cosméticos / higiene
5. Insumos agrícolas
6. Insumos industriais / MRO
7. Componentes para móveis / marcenaria

### Empresas de Serviços — 6

1. Contabilidade / BPO
2. Advocacia
3. Agências / consultorias
4. Tecnologia / TI / software
5. Manutenção / instalação / facilities
6. Seguros / corretoras

### Indústrias — 12

1. Alimentos e bebidas
2. Materiais de construção
3. Metalúrgica / metalmecânica
4. Plástico / borracha
5. Móveis em escala industrial
6. Têxtil / confecção
7. Máquinas / equipamentos
8. Química / higiene / limpeza
9. Embalagens
10. Agroindústria
11. Fábrica de esquadrias de PVC
12. Marcenaria / móveis sob medida

### Cada pack vertical precisa conter

- `macroSegment` e `verticalId` estáveis;
- dor principal;
- promessa;
- hero e subheadline;
- CTA;
- jornada comercial / Linha do Tempo Comercial;
- produtos/serviços mais comuns;
- agentes relevantes;
- palavras-chave Google iniciais;
- interesses/hipóteses Meta;
- 10 conceitos de criativo (dor, demo, resultado, comparação);
- objeções e respostas;
- lead scoring inicial;
- follow-ups;
- gatilhos de pós-venda;
- playbook Revenue Scout;
- compliance/restrições do nicho;
- KPIs e benchmarks aprendidos pelo tenant, não hardcoded como verdade universal.

## Onda 4 — Landing Pages adaptativas

Arquitetura:

- 1 institucional VendorAI;
- 6 hubs de macrosegmento;
- 50 LPs verticais;
- 1 página de demonstração;
- páginas de funcionalidades e planos.

LP deve receber contexto de campanha e preservar tracking.

Testes:

- headline;
- subheadline;
- CTA;
- prova;
- formulário;
- demo;
- criativo ↔ mensagem da LP.

A IA promove uma variante somente por resultado relevante (trial/venda/receita) quando houver dados suficientes.

## Onda 5 — Eventos críticos do ciclo comercial

Vocabulário alvo:

- `lead_created`;
- `lead_cooling`;
- `lead_recovered`;
- `lead_qualified`;
- `lead_lost`;
- `sale_closed`;
- `trial_started`;
- `trial_activated`;
- `subscription_started`;
- `annual_upgrade`;
- `churn`;
- `review_requested`;
- `review_recovery_started`;
- `revenue_scout_opportunity`;
- `revenue_scout_sale`.

Eventos comerciais devem ser first-party e idempotentes.

## Onda 6 — Lead scoring

Usar duas dimensões, não um único número opaco:

### Intent/behavior score

Status atual: **implementado** como `discoveryData.behaviorIntent`, separado do Revenue Scout.

### Commercial fit score

Ex.: segmento, tamanho, volume de leads, ticket, problema, urgência, qualificação do agente.

Pendente: consolidar um fit comercial separado e derivar uma prioridade final explicável sem misturar Intent, Revenue Scout e churn.

## Onda 7 — Launch Command Center

Status atual:

- [x] visão no Hub de Campanhas;
- [x] investimento;
- [x] visitantes;
- [x] leads;
- [x] CPL;
- [x] trials;
- [x] trials ativados;
- [x] custo por trial ativado;
- [x] vendas;
- [x] lead→venda;
- [x] trial→ativação;
- [x] trial ativado→venda;
- [x] CAC;
- [x] receita;
- [x] ROAS;
- [x] Behavior Intent médio e distribuição por faixa;
- [x] leads esfriando e recuperados;
- [x] diagnóstico de gargalo e próxima ação;
- [x] filtros reais por período (7/30/90 dias/histórico), plataforma, campanha, LP, vertical e faixa de intenção;
- [ ] MRR/ARR consolidado;
- [ ] churn no mesmo painel;
- [ ] receita recuperada por follow-up como valor monetário, não apenas contagem;
- [ ] oportunidades e receita do Revenue Scout no mesmo painel;
- [ ] comparação automática entre LPs/criativos/verticais com ranking de vencedores por receita/CAC.

## Regra de produto

O sistema não deve concluir que um anúncio é vencedor apenas porque tem melhor CTR/CPL. A recomendação de escala deve considerar conversões comerciais e receita. Toda alteração de orçamento no modo assistido exige aprovação; o modo autônomo só poderá operar dentro de limites autorizados e auditáveis.
