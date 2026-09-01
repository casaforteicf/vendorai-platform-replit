# VendorAI — Launch Readiness & Product Adjustment Map

> Documento operacional do lançamento. Regra: preservar o que já funciona, conectar os módulos existentes e só criar o que realmente falta.

## Princípio do lançamento

O VendorAI deve demonstrar sua própria proposta no próprio processo comercial:

**Atrair → Captar → Converter → Fechar → Entregar → Fidelizar → Expandir → Aprender → Melhorar**

A decisão de marketing não termina no clique nem no lead. A hierarquia de otimização é:

1. receita / margem quando disponível;
2. ROAS;
3. CAC / custo por venda;
4. vendas;
5. oportunidades qualificadas;
6. trials ativados;
7. leads;
8. cliques / CTR.

## O que já existe e deve ser reaproveitado

- Publicação real em Google Ads e Meta Ads.
- Campanhas com `utm_code` próprio.
- `leads.ad_campaign_id` para atribuição mídia ↔ CRM.
- Métricas de leads, vendas, receita e ROAS por campanha.
- Geração de criativos com IA e correção de criativos reprovados.
- Guardião de desperdício que pausa campanhas sem conversão dentro de limite autorizado.
- Sites/LPs por tenant com Meta Pixel e Google Ads tag configuráveis.
- Site institucional com hero de lançamento e Linha do Tempo Comercial.
- Arquitetura de LPs verticais em `artifacts/website/src/pages/lp/lpData.ts`.
- Contexto de Marketing separado em público, nicho, oferta/produto e objetivo.
- CRM, negócios e agentes de SDR/follow-up/reativação.
- Job de follow-up que trata leads sem resposta e encaminha para reativação.
- Trial individual de 5 dias em `/demo` + `/auth/demo-signup`.
- Pipeline comercial do VendorAI criado automaticamente quando um trial é aberto.
- Pós-venda automático por entrega, classificação de satisfação e avaliação Google.
- Revenue Scout com regras, pipeline, sequência de produtos, intent score e base de ML.

# Onda 1 — bloqueadores reais de lançamento

## L1. Atribuição first-party ponta a ponta

**Objetivo:** saber qual campanha gerou o lead, a oportunidade e a venda.

Status desta branch:

- [x] intake público aceita UTM, `gclid`, `fbclid`, URL e referrer;
- [x] recupera UTM do Referer para funcionar com o formulário atual;
- [x] resolve `utm_campaign` para `ad_campaign_id`;
- [x] preserva first-touch — não sobrescreve campanha já atribuída;
- [x] registra `lead_attributed`;
- [x] teste unitário do parser de atribuição;
- [ ] LP gerada deve sempre propagar origem para formulário e WhatsApp;
- [ ] trial `/demo` deve preservar UTM/click IDs e atribuir o lead comercial à campanha;
- [ ] Instagram/Messenger e demais entradas devem receber atribuição quando houver identificador confiável;
- [ ] preparar touchpoints posteriores para futura atribuição multi-touch.

**Aceite:** anúncio → LP/demo → lead → negócio ganho → receita deve ser rastreável de ponta a ponta.

## L2. Feedback de conversão para Meta e Google

Não foi localizada uma camada clara de Meta Conversions API / conversões CRM-offline do Google.

Criar um serviço único, idempotente, para enviar:

- lead criado;
- lead qualificado;
- trial iniciado;
- trial ativado;
- venda fechada + valor;
- upgrade quando relevante.

Requisitos:

- Meta Conversions API;
- Google Ads CRM/offline/enhanced conversion quando aplicável;
- hashing/consentimento quando exigido;
- deduplicação browser/server;
- retry e auditoria de envio.

**Aceite:** plataformas recebem sinais de qualidade e receita do CRM, não apenas eventos de navegador.

## L3. Completar o trial de 5 dias — não recriar

O trial já existe:

- `/demo` tem formulário de criação;
- `/auth/demo-signup` cria tenant e usuário próprios;
- `isDemo=true`;
- `demoExpiresAt=+5 dias`;
- cria lead + deal no funil de vendas VendorAI.

Ajustes necessários:

- [ ] definir `provisioningMethod="trial"` no signup;
- [ ] capturar UTM/click IDs no `/demo` e transportar ao backend;
- [ ] atribuir o lead/deal de trial à campanha correta;
- [ ] registrar evento `trial_started`;
- [ ] capturar segmento/subnicho na entrada ou logo no onboarding;
- [ ] activation score do trial;
- [ ] identificar `trial_activated` (ex.: integrou canal/importou lead/rodou automação);
- [ ] jornada Dia 0–5 com Next Best Action;
- [ ] alerta comercial para trial de alta intenção;
- [ ] resumo de valor no Dia 5;
- [ ] conversão trial → plano sem perder tenant/dados;
- [ ] expiração/grace period/recuperação;
- [ ] eventos `subscription_started`, `annual_upgrade`, `churn`.

## L4. Tracking comportamental first-party

Não foi localizado motor claro de comportamento web para página/tempo/scroll.

Criar eventos first-party:

- `page_view`;
- `cta_click`;
- `form_start`;
- `form_submit`;
- `demo_started` / `demo_completed`;
- `pricing_viewed`;
- tempo engajado;
- profundidade de scroll;
- retorno à página;
- anonymous visitor → lead quando houver identificação.

Esses sinais alimentam intenção, mas nunca substituem dados comerciais do CRM.

# Onda 2 — AI Marketing Manager

## Observador — base já existe, ampliar

Já há Ads Intelligence e recomendações. Completar para mostrar/usar:

- CPL;
- CAC;
- Lead → Venda;
- Receita/Lead;
- ROAS;
- qualidade do lead;
- gargalo provável: anúncio, LP, qualificação, follow-up ou fechamento.

Nesta branch o backend já passa a calcular CAC, Lead→Venda e Receita/Lead e a tratar campanha que gera lead mas não venda de forma diferente de uma campanha realmente vencedora.

## Assistido

IA prepara, humano aprova:

- novo criativo;
- headline/LP;
- público;
- keywords;
- extensão de campanha;
- aumento de orçamento.

## Autônomo — fase posterior

O guardião de desperdício já pode pausar sem conversão. Evoluir somente com volume e autorização:

- promover variação vencedora;
- substituir perdedora;
- redistribuir verba dentro de teto;
- respeitar limite diário/mensal;
- considerar janela mínima, volume e atraso entre lead e venda;
- trilha de auditoria de toda decisão.

# Onda 3 — 50 verticais

Não criar 50 sistemas e não descartar `lpData.ts`.

Evoluir a arquitetura existente para **1 engine + packs verticais configuráveis**.

## Lojas / Varejo — 10

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

## Clínicas — 10

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

## Concessionárias — 5

1. Automóveis novos
2. Seminovos / multimarcas
3. Motocicletas
4. Caminhões / comerciais
5. Máquinas agrícolas / pesadas

## Distribuidoras — 7

1. Materiais de construção
2. Autopeças
3. Alimentos e bebidas
4. Farmacêutica / cosméticos / higiene
5. Insumos agrícolas
6. Insumos industriais / MRO
7. Componentes para móveis / marcenaria

## Empresas de Serviços — 6

1. Contabilidade / BPO
2. Advocacia
3. Agências / consultorias
4. Tecnologia / TI / software
5. Manutenção / instalação / facilities
6. Seguros / corretoras

## Indústrias — 12

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

## Contrato de cada pack vertical

Cada vertical deve fornecer para site + Ads + IA:

- `macroSegment`;
- `verticalId` estável;
- aliases de segmento;
- dor principal;
- promessa;
- hero/subheadline;
- CTA;
- Linha do Tempo Comercial específica;
- produtos/serviços típicos;
- agentes mais relevantes;
- keywords iniciais Google;
- hipóteses de público Meta;
- conceitos de criativos: dor, demo, resultado, comparação;
- objeções e respostas;
- sinais de lead scoring;
- follow-ups;
- pós-venda;
- playbook Revenue Scout;
- compliance/restrições;
- KPIs aprendidos por tenant.

# Onda 4 — LPs adaptativas

A infraestrutura vertical já existe; completar os 50 packs e padronizar tracking.

Arquitetura desejada:

- 1 institucional VendorAI;
- 6 hubs de macrosegmento;
- 50 LPs verticais;
- `/demo` como entrada do trial;
- funcionalidades;
- preços.

Cada LP deve manter consistência:

**Anúncio → mensagem da LP → demonstração → trial**.

Testar:

- headline;
- subheadline;
- CTA;
- prova;
- formulário;
- Linha do Tempo;
- criativo ↔ mensagem.

A IA só promove vencedora quando houver dados suficientes e o resultado relevante for trial/venda/receita.

# Onda 5 — eventos comerciais padronizados

Follow-up/reativação já existem operacionalmente. Falta transformar estados importantes em eventos de marketing/analytics consistentes:

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

Todos os eventos devem ser first-party, idempotentes e auditáveis.

# Onda 6 — Lead Scoring

O banco já tem `propensityScore` e `intentScore`, mas para o lançamento precisamos separar claramente:

## Intent / behavior

- pricing;
- demo;
- retornos ao site;
- tempo engajado;
- CTA;
- trial;
- integrações ativadas.

## Commercial fit

- segmento;
- porte;
- volume de leads;
- ticket;
- urgência;
- problema;
- qualidade capturada pela IA.

A prioridade final deve ser explicável: mostrar **por que** aquele lead está quente.

# Onda 7 — Pós-venda + Revenue Scout

Pós-venda e solicitação de avaliação Google já existem. Revenue Scout também.

Conectar os dois à atribuição de receita:

- receita da primeira venda;
- receita recuperada por follow-up;
- receita de recompra;
- receita de upsell/cross-sell;
- receita originada pelo Revenue Scout;
- LTV por campanha/vertical quando houver volume.

Assim a IA pode descobrir que uma campanha com CAC maior gera clientes muito melhores no longo prazo.

# Onda 8 — Launch Command Center

Visões por canal, macrosegmento, vertical, LP, campanha e criativo:

- investimento;
- impressões;
- cliques;
- visitantes;
- leads;
- CPL;
- qualificados;
- demos;
- trials;
- trials ativados;
- vendas;
- Lead→Venda;
- CAC;
- receita;
- MRR/ARR;
- ROAS;
- churn;
- receita recuperada pela IA;
- oportunidades/receita do Revenue Scout.

# Regra de decisão

O VendorAI não deve declarar um anúncio vencedor apenas porque tem CTR ou CPL melhor. A recomendação de escala deve considerar venda e receita. Alterações de orçamento no modo assistido exigem aprovação; autonomia financeira só pode existir dentro de limites previamente autorizados e auditáveis.
