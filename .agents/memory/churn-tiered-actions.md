---
name: Churn tiered actions
description: Como o churn check funciona — tabela churn_actions, ações em camadas, mark-churned endpoint
---

## Contexto

`customerIntelligenceTable.churnRisk` (0-100) já é calculado por LLM em `analyze-intelligence.ts`. O scheduler roda `runChurnCheckAll` a cada :05 para leads com churnRisk > 70.

## Nova tabela: `churn_actions`

**Schema:** `lib/db/src/schema/churn_actions.ts`  
**Campos:** tenantId, leadId, actionType (retention_message | escalation_sdr | monitor_only), messageSent, churnRiskAtAction, actionSuccessful, executedAt

**Função:** dedup (janela 7 dias por lead) + auditoria + feedback loop de resultado.

## Novas colunas em `leads`

- `is_churned BOOLEAN DEFAULT FALSE` — churn confirmado
- `churned_at TIMESTAMPTZ` — timestamp do cancelamento

## Ações em camadas no scheduler

**Dedup:** churn_actions (7 dias), não messages. Leads is_churned=true são filtrados do query.

| churnRisk | Tier | Ação |
|---|---|---|
| ≥ 85 | critical | `escalation_sdr` — dispatchAgentBackground com sinal de escalação |
| 70-84 | high | `retention_message` — callOpenAI gera mensagem personalizada, fallback genérico |

Toda ação é logada em `churn_actions` com `churnRiskAtAction`.

## Endpoints

- `POST /tenants/:tenantId/leads/:leadId/mark-churned` — confirma churn (is_churned=true, churned_at=now), marca última churn_action como actionSuccessful=false
- `POST /tenants/:tenantId/churn-actions/:actionId/result` — registra { successful: boolean } na ação

**Why:** Feedback loop: quando uma ação de retenção converte (lead volta a engajar), marcar actionSuccessful=true; quando lead confirma cancelamento, mark-churned fecha o loop automaticamente.

## O que NÃO implementar

- `churn_history` separada — redundante com customer_intelligence (já tem churnRisk + lastAnalyzedAt + churnRiskExplicacao)  
- `content_library` action — tabela não existe no schema
- `discount_offer` — SDR decide descontos em conversa, não de forma automática
- Score heurístico separado — LLM em analyze-intelligence já é mais rico
