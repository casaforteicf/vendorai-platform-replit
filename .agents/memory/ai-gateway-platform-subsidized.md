---
name: AI Gateway Platform-Subsidized Mode
description: Tenants sem plan_id e sem ai_credits_usd bloqueiam todas as chamadas de IA — como resolver e por quê.
---

## Regra

Quando um tenant tem `plan_id = null` E `ai_credits_usd = 0`, o `checkQuota` calculava `remainingUsd = 0 + 0 - spent = 0`, bloqueando qualquer chamada com "AI quota exhausted ($0 plan)". Isso afeta **todos** os tenants criados antes de planos serem vinculados a eles.

## Fix aplicado

Em `artifacts/api-server/src/lib/ai-gateway.ts`, logo após o step 5 (get plan quota): se `quotaUsd === null && creditsUsd === 0` E a plataforma tem `OPENAI_API_KEY` ou `ANTHROPIC_API_KEY`, retorna `ok: true` com `remainingUsd: Infinity` (modo "platform-subsidized"). O teto diário de $100 (`AI_DAILY_SPEND_CEILING_USD`) ainda protege contra gasto excessivo.

**Why:** O `resolveAIKey` já cai para a chave da plataforma quando não há BYOK. O bloqueio estava ocorrendo *antes* da resolução da chave, na checagem de cota — semanticamente errado: "sem plano" não deve significar "sem acesso", deve significar "usa a chave da plataforma".

## Como aplicar

- Se um tenant volta a mostrar "serviço de IA indisponível", verificar: `plan_id`, `ai_credits_usd`, `openai_key_status` na tabela `tenants`.
- Se `plan_id = null && ai_credits_usd = 0`: o modo platform-subsidized já permite. Se ainda bloqueando, verificar o teto diário (`ai_daily_spend_usd`).
- Para ligar cota por tenant: vincular a um plano via `UPDATE tenants SET plan_id = (SELECT id FROM plans WHERE slug = 'growth') WHERE ...`.
