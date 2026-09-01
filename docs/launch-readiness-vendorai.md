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

- [x] UTM, `gclid`, `fbclid`, URL e referrer;
- [x] first-touch preservado;
- [x] demo, trial e intake público associados à campanha quando conhecida;
- [x] `behaviorSessionId` propagado para demo, trial e intake;
- [x] sessão anônima vinculada ao lead após conversão;
- [ ] garantir propagação explícita em todo formulário/WhatsApp de sites gerados;
- [ ] atribuição Instagram/Messenger quando houver identificador de campanha;
- [ ] multi-touch posterior sem perder o first-touch.

### L2. Lifecycle comercial first-party

- [x] `lead_attributed`;
- [x] `lead_cooling`;
- [x] `lead_recovered`;
- [x] `trial_started`;
- [x] `trial_activated`;
- [x] `sale_closed`;
- [x] estado real do CRM como fonte de verdade.

### L3. Métricas orientadas a receita

- [x] CPL;
- [x] custo por trial;
- [x] custo por trial ativado;
- [x] CAC;
- [x] Lead→Trial;
- [x] Trial→Ativação;
- [x] Trial ativado→Venda;
- [x] Lead→Venda;
- [x] Receita/Lead;
- [x] ROAS;
- [x] leads esfriando/recuperados por campanha.

### L4. Conversões server-side

#### Meta

- [x] Lead / StartTrial / TrialActivated / Purchase;
- [x] hashing e event id estável;
- [x] opt-in obrigatório;
- [x] desligado por padrão;
- [ ] validar em tenant controlado.

#### Google Data Manager

- [x] OAuth Google Ads + Data Manager preparado;
- [x] Conversion Actions separadas para Lead / Trial ativado / Venda;
- [x] worker Data Manager preparado;
- [x] GCLID e user data hasheado;
- [x] consentimento obrigatório;
- [x] `validateOnly=true` por padrão;
- [ ] habilitar API no Google Cloud;
- [ ] reconectar conta;
- [ ] configurar IDs reais;
- [ ] validar antes de contabilizar conversões.

### L5. Trial de 5 dias

- [x] tenant e usuário próprios;
- [x] expiração +5 dias;
- [x] lead e deal no CRM VendorAI;
- [x] atribuição e `trial_started`;
- [x] critério de ativação operacional;
- [x] comportamento pré-trial vinculado ao lead;
- [ ] activation score progressivo;
- [ ] resumo de valor dias 1–5;
- [ ] alerta de alta intenção;
- [ ] assinatura / anual / churn.

### L6. Behavior Intent

- [x] page view;
- [x] CTA click;
- [x] form start;
- [x] form submit;
- [x] engajamento;
- [x] scroll depth;
- [x] anonimato antes da conversão;
- [x] vínculo posterior ao lead;
- [x] score explicável 0–100;
- [x] faixas baixo / médio / alto / muito alto;
- [x] ação comercial recomendada;
- [x] motivos do score;
- [x] score visível na ficha do lead com sinais e ação;
- [x] separado de Revenue Scout e churn.

## Próxima frente — Launch Command Center

O Command Center será a visão executiva única do lançamento e deve responder:

1. onde estamos investindo;
2. de onde vêm os visitantes e leads;
3. quais LPs/campanhas geram intenção real;
4. quantos chegam ao trial;
5. quantos ativam;
6. quantos compram;
7. qual o CAC e o ROAS;
8. onde o funil está vazando;
9. o que a IA recomenda fazer agora.

### KPIs obrigatórios

- investimento;
- impressões;
- cliques;
- visitantes;
- leads;
- CPL;
- Behavior Intent médio;
- distribuição por faixa de intenção;
- demos;
- trials;
- trials ativados;
- custo por trial ativado;
- vendas;
- CAC;
- receita;
- MRR;
- ARR quando aplicável;
- ROAS;
- Lead→Venda;
- Trial→Ativação;
- Trial ativado→Venda;
- leads esfriando;
- leads recuperados;
- receita recuperada;
- Revenue Scout: oportunidades e receita.

### Cortes de análise

- período;
- canal;
- plataforma;
- campanha;
- criativo;
- LP;
- macrosegmento;
- vertical;
- origem orgânica/paga;
- faixa de Behavior Intent.

### Diagnóstico de IA

O painel deve classificar o principal gargalo como:

- aquisição;
- anúncio/criativo;
- LP;
- qualidade/intenção;
- ativação do trial;
- follow-up;
- fechamento;
- retenção.

Cada diagnóstico deve indicar evidências, impacto e ação recomendada. CTR/CPL nunca bastam sozinhos para promover campanha vencedora.

## Verticais de lançamento

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

## Regra de produto

O sistema não conclui que um anúncio é vencedor apenas por CTR/CPL. A recomendação de escala considera ativação, venda, CAC e receita. Alteração de orçamento no modo assistido exige aprovação; modo autônomo só pode operar dentro de limites autorizados e auditáveis.
