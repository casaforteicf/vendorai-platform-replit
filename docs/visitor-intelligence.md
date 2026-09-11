# Visitor Intelligence / Rastreamento Comercial

## Objetivo

Unificar telemetria first-party do site, landing pages, app web e app mobile para transformar navegação em contexto comercial utilizável pelo CRM, SDR, Follow-up, campanhas e Pipeline.

A regra de arquitetura é simples:

- **lead e histórico são permanentes**;
- **campanhas são temporárias**;
- o visitante anônimo permanece no rastreamento/audiências até ser identificado;
- quando é identificado, o histórico anterior da sessão é anexado ao lead;
- uma campanha encerrada não encerra a jornada do lead: ele pode participar de outras campanhas compatíveis no futuro.

## Fluxo comercial

```text
Visita / LP
  -> rastreamento first-party
  -> sinais de comportamento
  -> audiências internas de remarketing
  -> identificação por formulário/WhatsApp/login
  -> Behavior Intent + Commercial Journey
  -> contexto no SDR + material de valor sugerido
  -> follow-up adaptativo
  -> oportunidade / Pipeline
  -> Closer
  -> ganho/perdido
  -> relacionamento, reativação e novas campanhas
```

## O que é rastreado

No site público:

- visitorId first-party pseudônimo persistente, sem PII;
- sessionId por sessão;
- page view por rota, inclusive navegação SPA;
- tempo por página/rota;
- profundidade de scroll;
- cliques em CTA com rótulo, link e elemento;
- início e envio de formulário, sem capturar o conteúdo digitado;
- UTM, referrer, campanha e landing page;
- cidade/estado/país aproximados quando disponíveis na infraestrutura.

No app web/mobile continuam existindo screen views, heartbeat e telemetria operacional, mas a tela de **Rastreamento Comercial** abre por padrão somente Site / Landing Pages para não misturar uso interno com intenção de compra.

## Privacidade e remarketing

Tracking first-party pseudônimo e análise comercial interna não devem armazenar IP bruto nem valores digitados em formulários.

A sincronização futura com plataformas de mídia deve respeitar `adDataConsent`. Por isso a API diferencia:

- perfil rastreado internamente;
- perfil elegível para remarketing/sincronização com mídia.

Não usar PII em replay/heatmap e não criar fingerprint de dispositivo.

## Behavior Intent

`behaviorIntentSync.ts` calcula o score usando, entre outros sinais:

- número de páginas;
- recorrência em sessões diferentes;
- páginas de preço/orçamento/proposta;
- CTA;
- início/abandono/conclusão de formulário;
- tempo por página;
- scroll.

Behavior Intent continua separado do `intentScore` do Revenue Scout.

Faixas comerciais:

- 0–34: descoberta;
- 35–59: aquecimento;
- 60–79: quente;
- 80–100: oportunidade.

## Commercial Journey

Para leads identificados, `discoveryData.commercialJourney` persiste:

- etapa comercial;
- score;
- resumo legível da navegação;
- próxima melhor ação;
- prazo recomendado para follow-up;
- página de maior interesse;
- audiências automáticas;
- páginas e tempo;
- cliques relevantes;
- materiais de valor sugeridos da Knowledge Base;
- lacuna de material quando ainda não existe conteúdo apropriado;
- histórico de campanhas CRM e mídia paga.

A `proximaAcao` do lead é preenchida automaticamente somente quando está vazia ou já é uma ação `[AUTO DIGITAL]`, para não sobrescrever orientação manual do vendedor.

## SDR e Pipeline

O SDR já recebe `lead.proximaAcao` no `buildLeadSection`, então o sinal digital passa a fazer parte do contexto do agente sem criar um agente paralelo.

Quando Behavior Intent chega a 60+:

- é criada uma tarefa comercial deduplicada;
- o responsável atual do lead é mantido;
- um deal em `novo`, `em_aquecimento` ou `qualificado` recebe `relationshipStage`, `aquecimentoTipo=behavior_intent` e `aiBriefing` com a leitura comercial;
- o alerta quente continua respeitando cooldown.

O sistema não dispara WhatsApp automaticamente apenas por uma visita. O envio continua passando pelas regras de atendimento, consentimento, autonomia do agente e cadência já existentes.

## Materiais de valor

A Knowledge Base é a biblioteca única; não criar outro módulo paralelo.

Convenção de tags recomendada:

```text
nurture
stage:descoberta
stage:aquecimento
stage:quente
stage:oportunidade
interest:<produto-ou-rota>
pain:<dor>
objection:<objecao>
format:video
format:pdf
format:case
format:comparativo
```

O Commercial Journey procura materiais ativos compatíveis e sugere até três para o SDR. Se não existir material, registra uma `materialGap` para orientar a produção em Marketing -> Conteúdos & Criativos.

## Campanhas

`campaigns.segmentoFiltro` aceita filtros comerciais sem migration adicional porque o campo já é JSONB:

- `audienceTags`;
- `commercialStages`;
- `behaviorIntentMin`;
- `remarketingEligible`.

`marketingContext.journeyPlan` pode planejar:

- sinais de entrada;
- audiências;
- score para ativar SDR;
- score para oportunidade;
- tags de materiais de nutrição;
- cadência de follow-up;
- sinais de saída;
- permissão de reentrada.

O histórico de participação não depende da campanha ficar ativa: envios de CRM permanecem em `campaign_sent_logs`, e mídia paga permanece ligada por `adCampaignId`/UTM. O Commercial Journey consolida esses registros para o lead.

## Tela de Rastreamento Comercial

A tela deve responder **quem merece atenção agora**, e não apenas listar sessões técnicas.

Prioridades exibidas:

- alta intenção;
- retornaram;
- viram preço/orçamento;
- clicaram CTA;
- leads identificados;
- elegíveis para remarketing.

Ao abrir um perfil, mostrar:

- leitura comercial;
- próxima ação;
- audiências;
- tempo e interesse por página;
- cliques;
- materiais de valor sugeridos;
- histórico de campanhas;
- atalho para o lead no CRM quando identificado.

## Compatibilidade

A resposta da API continua expondo `sessions` para alertas e consumidores legados e adiciona `profiles` para a nova leitura comercial. O frontend possui fallback para APIs antigas durante deploys desencontrados.
