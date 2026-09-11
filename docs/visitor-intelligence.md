# Visitor Intelligence

## Objetivo
Unificar telemetria first-party do site institucional, painel web e app/mobile para transformar navegação em contexto comercial utilizável pelo CRM, Revenue Scout e automações.

## Princípios
- Reutilizar `web_behavior_events`; não criar analytics paralelo.
- Isolamento obrigatório por `tenant_id`.
- Sessão nasce anônima e pode ser ligada a `lead_id`/`user_id` somente após identificação legítima.
- Não persistir IP bruto. Geolocalização é aproximada e armazena apenas país/estado/cidade quando fornecidos pela infraestrutura.
- Minimização de user-agent/dispositivo; armazenar categoria derivada, não fingerprint.
- Mascarar campos sensíveis e PII em qualquer mecanismo futuro de replay/heatmap.

## Fase 1 — implementada no PR #1211
1. Painel de visitantes em tempo real com atualização automática.
2. Sessão atual, última atividade e página/tela atual.
3. Origem/referrer/UTM/campanha.
4. País, estado e cidade aproximados por headers confiáveis do edge, sem IP bruto.
5. Tipo de dispositivo, navegador e sistema operacional derivados.
6. Jornada da sessão e histórico de páginas/telas.
7. Identificação visitante -> lead -> usuário.
8. Persistência do vínculo: depois que a sessão vira lead, novos eventos continuam ligados ao mesmo lead.
9. Behavior Intent 0–100 reutilizando o motor existente, sem score paralelo.
10. Destaque de oportunidades quentes online a partir de 60/100.
11. Registro `visitor_intent_hot` no histórico do lead e notificação in-app, com cooldown de 6 horas.
12. Separação e filtro de superfície: Site, App Web e App Mobile.
13. Heartbeat de 30 segundos no app e presença periódica no site para não marcar como offline quem está apenas lendo.
14. Integração com CRM, Launch Command Center e filtros de Behavior Intent já consumidos pelo Revenue Scout.

## Eventos
Eventos públicos já existentes: `page_view`, `cta_click`, `form_start`, `form_submit`, `engagement`.

No app autenticado o coletor suporta também: `session_start`, `heartbeat`, `screen_view`, `feature_use`, `search`, `login`, `signup`, `conversion`, `error`.

## Presença online
Uma sessão é considerada online quando existe atividade nos últimos 90 segundos por padrão. App Web/App Mobile enviam heartbeat a cada 30 segundos. O site envia presença leve a cada 30 segundos usando o endpoint first-party já existente. Não há captura de movimento de mouse/teclado.

## Identidade e uso comercial
- Anônimo: `anonymous_session_id`.
- Lead: após formulário/intake, os eventos da sessão recebem `lead_id` e eventos posteriores continuam ligados a ele.
- Usuário autenticado: eventos do app recebem `user_id` minimizado no metadata.
- Behavior Intent alto/muito alto gera contexto comercial sem alterar artificialmente propensity score ou Revenue Scout score.
- Revenue Scout continua como motor separado, mas pode recortar oportunidades pelo `discoveryData.behaviorIntent` já sincronizado no lead.

## Próximas fases
- Heatmap agregado por página/tela.
- Session replay opcional, com mascaramento forte e política de retenção.
- IA para resumir a jornada e sugerir próxima ação usando página, origem, intenção e estágio do CRM.
- Métricas de produto para trial/cliente: adoção de funcionalidades, ativação e risco de churn.
- Relatórios históricos por cidade/estado, origem, campanha, superfície e conversão.
