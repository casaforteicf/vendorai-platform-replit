# Visitor Intelligence

## Objetivo
Unificar telemetria first-party do site institucional, painel web e app/mobile para transformar navegação em contexto comercial utilizável pelo CRM, Revenue Scout e automações.

## Princípios
- Reutilizar `web_behavior_events`; não criar analytics paralelo.
- Isolamento obrigatório por `tenant_id`.
- Sessão nasce anônima e pode ser ligada a `lead_id`/`user_id` somente após identificação legítima.
- Não persistir IP bruto. Geolocalização é aproximada e deve armazenar apenas país/estado/cidade quando disponível.
- Minimização de user-agent/dispositivo; armazenar categoria derivada, não fingerprint.
- Mascarar campos sensíveis e PII em qualquer mecanismo futuro de replay/heatmap.

## Fase 1
1. Painel Visitantes em tempo real.
2. Sessão atual, última atividade, página/tela atual.
3. Origem/referrer/UTM/campanha.
4. País, estado e cidade aproximados.
5. Tipo de dispositivo, navegador e sistema operacional derivados.
6. Jornada da sessão e histórico de páginas.
7. Identificação visitante -> lead -> usuário.
8. Behavior Intent existente visível no painel.
9. Filtros por período, origem, localização, página, campanha e status de identificação.
10. Integração com CRM e Command Center.

## Eventos
Eventos existentes: `page_view`, `cta_click`, `form_start`, `form_submit`, `engagement`.

Adicionar de forma compatível: `session_start`, `heartbeat`, `screen_view`, `feature_use`, `search`, `login`, `signup`, `conversion`, `error`.

## Presença online
Considerar uma sessão online quando houver evento/heartbeat nos últimos 60-90 segundos. O heartbeat deve ser leve e não registrar movimento de mouse/teclado.

## Próximas fases
- Alertas de oportunidade quente.
- Heatmap agregado.
- Session replay opcional e fortemente mascarado.
- IA para resumir a jornada e recomendar próxima ação.
- Métricas de produto para trial/cliente: adoção de funcionalidades, ativação e risco de churn.
