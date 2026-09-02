# VendorAI — Dicionário Oficial de Métricas

Este documento define a fonte de verdade dos KPIs do Dashboard/Command Center. A UI não deve exibir valores simulados: quando a fonte necessária não estiver disponível, o valor deve permanecer nulo e a interface deve explicar o requisito ausente.

## Comercial

- `new_leads`: leads válidos criados no período (`leads.created_at`), excluindo exclusão lógica e registros marcados como não-lead.
- `active_opportunities`: deals comerciais cuja etapa não é `ganho` nem `perdido`.
- `confirmed_sales`: deals em `ganho` cuja data efetiva de fechamento pertence ao período. Ordem de fonte: `data_fechamento`, `won_at`, e somente como fallback legado `updated_at`.
- `sold_revenue`: soma de `deals.valor` das vendas confirmadas do período.
- `average_ticket`: receita vendida dividida pelas vendas confirmadas com valor.
- `commercial_conversion`: oportunidades criadas no período que chegaram a `ganho` / oportunidades criadas no mesmo período. O numerador e denominador devem ser retornados junto da taxa para auditoria.

## Operação

- `execution_active`: `work_cards` da pipeline `execucao` fora de `concluido` e `cancelado`.
- `support_active`: `work_cards` da pipeline `suporte` fora de `fechamento_assistencia` e `cancelado`.
- `overdue_tasks`: atividades `pendente` ou `planejado` com `data_vencimento` anterior ao fim do período.
- `unassigned_active`: cards operacionais ativos sem responsável.

## Inteligência e IA

- `customers_at_risk`: perfis em `customer_intelligence` com `churn_risk > 60`, aplicando os filtros de elegibilidade do cliente/lead.
- `next_best_action`: usa `customer_intelligence.next_best_action`; nunca é inferida no frontend.
- `ai_actions_executed`: ações em `agent_actions_log` com status `executed` no período.

## Histórico de processo e SLA

`process_stage_events` é a fonte oficial para tempo em etapa e gargalo. Cada mudança de etapa cria um evento e fecha o evento anterior com duração em segundos. Registros de backfill são marcados com `origin = backfill_current_state` e não podem ser usados para fabricar duração histórica.

`process_stage_policies` concentra SLA, ordem, criticidade, terminalidade e visibilidade de cada etapa por pipeline. O Comercial pode conviver com a configuração legada até a sincronização completa; Execução e Suporte já usam a política unificada.

## Metas

`business_goals` registra meta, período, unidade, responsável/equipe e escopo. Percentual de realização só existe quando a métrica possui fonte oficial e a meta está ativa no período.

## Feedback

`customer_feedback` registra CSAT, NPS, entrega e assistência. CSAT e NPS permanecem nulos quando não houver respostas suficientes; nunca devem ser preenchidos por estimativa da IA.

## Marketing

CPL/ROAS só podem ser exibidos quando houver, simultaneamente, integração ativa, investimento sincronizado e atribuição de receita confirmada. Conexão OAuth isolada não transforma a métrica em disponível.

## Garantias de governança

- sem placeholders numéricos;
- ausência de dado = `null` + motivo de indisponibilidade;
- fonte primária = banco transacional;
- períodos explícitos em toda resposta;
- métricas históricas não usam backfill como duração real;
- definições de KPI são versionadas e retornadas pelo backend.

## Validação de produção — 2026-09-02

A migration da camada oficial foi aplicada no banco `vendorai-core`. As quatro tabelas novas estão com RLS habilitado e os triggers de mudança de etapa estão ativos para `deals` e `work_cards`. O backfill foi identificado explicitamente como estado atual sem duração histórica.

O build de produção da API foi reproduzido com Node 22, pnpm 10.26.1 e `pnpm --filter @workspace/api-server run build`, concluindo com sucesso. As consultas centrais do Command Center também foram executadas diretamente no banco de produção sem erro antes do redeploy da API.