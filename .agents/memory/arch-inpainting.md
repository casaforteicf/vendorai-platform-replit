---
name: Arch render pipeline — motores validados
description: Arquitetura do módulo Arch/Render, motores por modo, template de prompt Kontext validado 02/07/2026
---

## Motores por modo (validados com testes reais 02/07/2026)

| Modo | Motor Replicate | Input |
|---|---|---|
| **Preservar** | `black-forest-labs/flux-kontext-pro` | `input_image` + prompt textual |
| **Criar** | `black-forest-labs/flux-1.1-pro-ultra` | prompt apenas (`raw: true`) |
| **Ajuste pontual** | `black-forest-labs/flux-fill-pro` | `image` + `mask` + prompt |

**Por que o Kontext funciona onde Fill Pro e Canny falharam:**
- Canny: descarta cor/material (só bordas), móveis ficavam brancos
- Fill Pro com máscara: adequado apenas para zona pontual, não conversão inteira
- Kontext: opera sobre pixels reais da imagem — layout/cor/material preservados por padrão

## Regra de duas etapas (crítica)

Mudanças de Componentes (metal, piso, parede, decoração) e LED **NUNCA** no mesmo prompt da conversão Kontext. Sempre:
1. Etapa 1: Kontext com template base (conversão fotorrealista apenas)
2. Etapa 2: chamada separada sobre o resultado da Etapa 1 (Fill Pro para ajuste pontual)

## Template de prompt Kontext (Seção 1.2 do briefing)

**Ordem obrigatória:**
1. Ação de conversão PRIMEIRO ("Convert this 3D sketch render into a photorealistic photograph…")
2. Lista de preservação individual por objeto/elemento (não termos genéricos)
3. Material/cor exatos + contraste explícito para pares ambíguos
4. Bloco de câmera/qualidade no final

**Por que a ordem importa:** se a preservação vier primeiro, o modelo preserva até o estilo de renderização (esboço), não só o conteúdo.

## Arquitetura de código

**`arch-render-pipeline.ts`** exporta:
- `callReplicateFluxKontext` — Modo Preservar (sem máscara)
- `callReplicateFluxUltraPro` — Modo Criar
- `callReplicateFluxFill` — Ajuste pontual (segunda chamada separada)
- `createZoneMask`, `compositeWithOriginal`, `validateEdgeIntegrity` — mantidos para Fill Pro

**`arch_ai_render.ts` — roteamento em `processRenderJob`:**
- `mode=preservar` → Kontext direto, sem máscara, `motor="replicate-flux-kontext-pro"`
- `mode=criar && userNotes` → Fill Pro com máscara + compositing + validação de bordas
- `mode=criar` (sem userNotes) → Ultra Pro, `motor="replicate-flux-1.1-pro-ultra"`

**`buildPrompt`** despacha para:
- `buildKontextPrompt` — template validado com lista de preservação por zona
- `buildCriarPrompt` — prompt livre com estilo/ângulo/materiais

## Gotchas críticos
- Middleware import: `../middlewares/auth.js` (plural, não `middleware/authenticate.js`)
- `sharp` instalado em `artifacts/api-server` (dependencies)
- Kontext API input: `input_image` (não `image`) — campo diferente do Fill Pro
- Kontext guidance padrão: 3.5 (não 30 como no Fill Pro)
- Tabelas criadas via DDL raw no Supabase (push do Drizzle trunca tenant_domains)
- Frontend usa polling (2s interval, max 90 attempts = 3min)
