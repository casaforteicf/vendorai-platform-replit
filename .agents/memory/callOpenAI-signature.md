---
name: callOpenAI assinatura
description: Assinatura correta de callOpenAI no ai-gateway e como extrair a resposta.
---

## Regra

`callOpenAI(tenantId, feature, messages[], options)` — 4 argumentos posicionais.

- `feature`: valor de `AiFeature` (ex: `"intelligence_analysis"`, `"agent_sdr"`)
- `messages`: array `OpenAI.Chat.ChatCompletionMessageParam[]`
- `options`: `{ model?, temperature?, maxTokens?, responseFormat?, log? }`
- Resposta: `{ content: string; inputTokens: number; outputTokens: number; costUsd: number; usedByok: boolean }`

**Extrair texto:** `response.content` — não `response.choices[0].message.content` (esse é o formato raw do SDK OpenAI, não da nossa abstração).

**Por quê:** O ai-gateway encapsula a chamada SDK e retorna um objeto simplificado; usar `.choices` direto é um erro de camada que o esbuild flagra como "no matching export".

**Como aplicar:** Qualquer job ou rota que precise de LLM via gateway deve importar `callOpenAI` de `../lib/ai-gateway.js` e usar essa assinatura de 4 argumentos.
