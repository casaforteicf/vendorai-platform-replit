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
- Campos de demo/provisionamento de tenant que podem ser reaproveitados para o trial.

## Onda 1 — bloqueadores de lançamento

### L1. Atribuição first-party ponta a ponta

**Objetivo:** saber exatamente qual campanha gerou cada lead e venda.

Status desta branch:

- [x] intake público aceita UTM, `gclid`, `fbclid`, URL e referrer;
- [x] recupera UTM do Referer atual sem exigir mudança imediata no formulário;
- [x] resolve `utm_campaign` para `ad_campaign_id`;
- [x] usa first-touch: não sobrescreve uma campanha já atribuída;
- [x] registra evento `lead_attributed`;
- [x] adiciona teste unitário do parser de atribuição;
- [ ] garantir que toda LP gerada propague a origem para formulário e WhatsApp;
- [ ] garantir atribuição em Instagram/Messenger e demais entradas quando houver identificador de campanha;
- [ ] persistir touchpoints posteriores sem perder o first-touch (para futura atribuição multi-touch).

**Aceite:** um lead originado de um anúncio deve aparecer no CRM com a campanha correta e uma venda ganha deve retornar no overview daquela campanha.

### L2. Conversões server-side / feedback para plataformas

Criar um serviço único de conversões para:

- Meta Conversions API;
- Google Ads conversões de lead/venda (offline/enhanced quando aplicável);
- deduplicação de eventos;
- consentimento e hashing quando exigido;
- retries/idempotência;
- eventos mínimos: lead, lead qualificado, trial, venda, valor da venda.

**Aceite:** Meta/Google recebem sinais de conversão do CRM sem depender somente do navegador.

### L3. Trial individual de 5 dias

Reaproveitar `isDemo`, `demoExpiresAt` e `provisioningMethod`, mas criar fluxo de trial individual (não confundir com a conta demo compartilhada).

Necessário:

- endpoint/CTA de criação de trial;
- `provisioningMethod = trial`;
- expiração = +5 dias;
- tenant e usuário próprios;
- configuração inicial por segmento;
- evento `trial_started`;
- activation score;
- resumo de valor nos dias 1–5;
- alerta comercial quando houver alta intenção;
- conversão trial → plano sem perder dados;
- expiração/grace period e recuperação;
- eventos `trial_activated`, `subscription_started`, `annual_upgrade`, `churn`.

### L4. Tracking comportamental first-party

Criar tabela/serviço de eventos web para LPs e site:

- `page_view`;
- `cta_click`;
- `form_start`;
- `form_submit`;
- `demo_started` / `demo_completed`;
- `pricing_viewed`;
- tempo engajado;
- profundidade de scroll;
- retorno à página;
- identificação anônima → lead quando o formulário for enviado.

Esses sinais alimentam lead score sem substituir eventos comerciais do CRM.

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

Não criar 50 sistemas. Criar **1 engine + packs verticais configuráveis**.

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
- KPIs e benchmarks aprendidos pelo tenant (não hardcoded como verdade universal).

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

Padronizar eventos próprios do VendorAI:

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

Ex.: página de preço, demo, retornos, tempo engajado, CTA, formulário.

### Commercial fit score

Ex.: segmento, tamanho, volume de leads, ticket, problema, urgência, qualificação do agente.

Derivar uma prioridade comercial explicável e registrar os motivos.

## Onda 7 — Launch Command Center

Visões por canal, macrosegmento, vertical, LP, campanha e criativo:

- investimento;
- impressões;
- cliques;
- visitantes;
- leads;
- CPL;
- leads qualificados;
- demos;
- trials;
- trials ativados;
- vendas;
- lead→venda;
- CAC;
- receita;
- MRR/ARR;
- ROAS;
- churn;
- receita recuperada por follow-up;
- oportunidades e receita do Revenue Scout.

## Regra de produto

O sistema não deve concluir que um anúncio é vencedor apenas porque tem melhor CTR/CPL. A recomendação de escala deve considerar conversões comerciais e receita. Toda alteração de orçamento no modo assistido exige aprovação; o modo autônomo só poderá operar dentro de limites autorizados e auditáveis.
