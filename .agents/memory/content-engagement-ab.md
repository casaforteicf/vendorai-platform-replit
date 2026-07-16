---
name: Content engagement tracking + Campaign A/B testing
description: Como o rastreamento de engajamento funciona no content flow e A/B testing em campanhas
---

## Content Flow — Rastreamento de engajamento

**Tabela:** `prospector_flow_executions`  
**Novas colunas:** `wamid TEXT`, `aberta_em TIMESTAMPTZ`, `clicada_em TIMESTAMPTZ`, `engajamento_adaptado BOOLEAN`

**Fluxo:**
1. `sendDirectWhatsAppMessage` agora retorna `string | undefined` (wamid da Meta API)
2. `contentFlow.ts` salva o wamid na execução após envio
3. URLs de material são wrapped como `/api/track/c/:execId` (redireciona + registra `clicada_em`)
4. `webhooks.ts` processa `value.statuses[].status === "read"` → UPDATE `aberta_em` WHERE `wamid = id`
5. Fluxo adaptativo: antes de cada step, verifica se o step anterior foi enviado mas não aberto há >24h → prefixo de re-engajamento na mensagem

**Why:** Sem wamid, impossível correlacionar read receipt do Meta com a execução específica. Click tracking via redirect endpoint não exige mudança no WhatsApp.

## Campaigns — A/B Testing

**Tabela:** `campaigns`  
**Novas colunas:** `ab_test_enabled INTEGER`, `ab_test_sample_pct INTEGER`, `variant_a_text TEXT`, `variant_b_text TEXT`, `winning_variant TEXT`

**Nova tabela:** `campaign_sent_logs` (campaign_id, lead_id, variant A/B/main, wamid, sent_at, read_at)

**Fluxo:**
1. Se `abTestEnabled=1` + `variantAText` + `variantBText`: split 50/50 de leads (primeiro half → A, segundo → B)
2. Cada envio loga em `campaign_sent_logs` com `variant`
3. `winning_variant` calculado assincronamente: webhook read receipt → `readAt` em `campaign_sent_logs` → comparar taxa de abertura por variante via query

**How to apply:** Para criar campanha com A/B, setar `ab_test_enabled=1`, `variant_a_text` e `variant_b_text` no insert/update de campaigns.
