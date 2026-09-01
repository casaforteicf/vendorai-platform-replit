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
- [x] captura first-touch no site institucional via sessionStorage;
- [x] trial `/auth/trial-signup` recebe atribuição e registra `trial_started`;
- [x] pedidos de demonstração em `/site/contato` recuperam UTM/click IDs e atribuem o lead à campanha;
- [x] follow-up registra `lead_cooling` e `lead_recovered` quando há campanha atribuída;
- [x] `behaviorSessionId` é propagado para demo, trial e intake público;
- [ ] garantir propagação explícita da origem em todo formulário/WhatsApp de sites gerados;
- [ ] garantir atribuição em Instagram/Messenger e demais entradas quando houver identificador de campanha;
- [ ] persistir touchpoints posteriores sem perder o first-touch para futura atribuição multi-touch.

### L2. Lifecycle comercial first-party

- [x] `trial_started`;
- [x] `lead_cooling`;
- [x] `lead_recovered`;
- [x] sincronizador idempotente de `trial_activated`;
- [x] sincronizador idempotente de `sale_closed`;
- [x] eventos não críticos deixam de inflar o contador de alertas;
- [x] estado final do CRM é a fonte de verdade.

**Definição atual de trial ativado:** onboarding concluído + (integrações concluídas OU primeiro lead real criado no tenant).

### L3. Métricas orientadas a receita

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

- [x] worker server-side criado;
- [x] reutiliza `metaPixelId` + conexão Meta Ads existente;
- [x] eventos Lead, StartTrial, TrialActivated e Purchase;
- [x] PII normalizada e SHA-256 antes do envio;
- [x] `event_id` estável para deduplicação/retry;
- [x] consentimento explícito obrigatório;
- [x] protegido por `MARKETING_SERVER_CONVERSIONS_ENABLED`, desligado por padrão;
- [ ] validar Pixel, token e evento de teste em tenant controlado antes de produção.

#### Google Ads / Data Manager

- [x] OAuth preparado com `adwords` + `datamanager`;
- [x] campos de Conversion Action separados para Lead, Trial ativado e Venda;
- [x] worker Data Manager criado;
- [x] GCLID e dados first-party normalizados/hasheados;
- [x] consentimento obrigatório;
- [x] valor/moeda em venda;
- [x] `validateOnly=true` por padrão;
- [ ] habilitar Data Manager API no projeto Google Cloud;
- [ ] reconectar conta Google concedendo novo escopo;
- [ ] configurar Conversion Action IDs reais;
- [ ] validar payload em `validateOnly` e somente então contabilizar conversões reais.

### L5. Trial individual de 5 dias

- [x] endpoint/CTA de criação de trial;
- [x] `provisioningMethod = trial`;
- [x] expiração = +5 dias;
- [x] tenant e usuário próprios;
- [x] lead + negócio no CRM comercial da VendorAI;
- [x] atribuição à campanha de origem;
- [x] evento `trial_started`;
- [x] definição e medição de ativação operacional;
- [x] comportamento pré-trial vinculado ao lead comercial;
- [ ] activation score progressivo, além do critério binário atual;
- [ ] resumo de valor nos dias 1–5;
- [ ] alerta comercial quando houver alta intenção;
- [ ] conversão trial → plano sem perder dados;
- [ ] expiração/grace period e recuperação;
- [ ] eventos de assinatura, upgrade anual e churn.

### L6. Tracking comportamental first-party

- [x] `page_view`;
- [x] `cta_click`;
- [x] `form_start`;
- [x] `form_submit`;
- [x] tempo engajado;
- [x] profundidade de scroll;
- [x] identificação anônima → lead após formulário;
- [x] eventos sem e-mail, telefone ou IP;
- [x] Behavior Intent Score explicável;
- [x] score separado do `intentScore` do Revenue Scout;
- [x] faixas baixo / médio / alto / muito alto;
- [x] próxima ação recomendada por faixa;
- [x] score, sinais, motivos e ação visíveis na ficha do lead;
- [ ] `demo_started` / `demo_completed` dedicados;
- [ ] retorno à página / múltiplas sessões do mesmo usuário com abordagem privacy-safe.

## Onda 2 — AI Marketing Manager

### Modo Observador

- lê performance + CRM;
- calcula CPL, CAC, lead→venda, receita/lead, ROAS;
- identifica gargalo: anúncio, LP, qualidade, follow-up ou fechamento;
- recomenda ação, sem alterar mídia.

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
- conceitos de criativo;
- objeções e respostas;
- lead scoring inicial;
- follow-ups;
- gatilhos de pós-venda;
- playbook Revenue Scout;
- compliance/restrições do nicho;
- KPIs e benchmarks aprendidos pelo tenant.

## Onda 4 — Landing Pages adaptativas

Arquitetura:

- 1 institucional VendorAI;
- 6 hubs de macrosegmento;
- 50 LPs verticais;
- 1 página de demonstração;
- páginas de funcionalidades e planos.

A IA só promove variante quando houver dados suficientes e resultado relevante — trial, ativação, venda ou receita — não por CTR isolado.

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

## Onda 6 — Lead scoring

Duas dimensões, não um único número opaco:

### Intent/behavior score

Implementado para comportamento web com explicação dos pontos, faixa e ação recomendada.

### Commercial fit score

Próxima evolução: segmento, tamanho, volume de leads, ticket, problema, urgência e qualificação do agente.

A prioridade final deve combinar intenção + fit, mantendo ambos visíveis e auditáveis.

## Onda 7 — Launch Command Center

Próxima frente de desenvolvimento.

Visões por canal, macrosegmento, vertical, LP, campanha e criativo:

- investimento;
- impressões;
- cliques;
- visitantes;
- leads;
- CPL;
- behavior intent médio e distribuição por faixa;
- leads qualificados;
- demos;
- trials;
- trials ativados;
- custo por trial ativado;
- vendas;
- lead→venda;
- trial→ativação;
- trial ativado→venda;
- CAC;
- receita;
- MRR/ARR;
- ROAS;
- churn;
- receita recuperada por follow-up;
- oportunidades e receita do Revenue Scout.

## Regra de produto

O sistema não conclui que um anúncio é vencedor apenas porque tem melhor CTR/CPL. A recomendação de escala considera conversões comerciais, ativação, qualidade e receita. Toda alteração de orçamento no modo assistido exige aprovação; o modo autônomo só opera dentro de limites autorizados e auditáveis.
