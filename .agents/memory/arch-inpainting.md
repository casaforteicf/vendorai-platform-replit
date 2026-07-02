---
name: Arch inpainting pipeline
description: Arquitetura do módulo Arch/Render modo Preservar — inpainting com máscara + compositing
---

## Problema resolvido
Bug reportado: modo "Preservar estrutura 100%" trocava móveis/piso porque usava flux-canny-pro (img2img, não inpainting). Solução: pipeline de inpainting com máscara via `black-forest-labs/flux-fill-pro`.

## Arquitetura

**Dois modos:**
- `preservar` → Flux Fill Pro (inpainting com máscara) + compositing pós-geração
- `criar` → flux-canny-pro / gpt-image-1 (fluxo original preservado)

**Pipeline preservar:**
1. `createZoneMask(zones, w, h)` — máscara PNG heurística (branco=editável, preto=preservar)
2. `callReplicateFluxFill({imageDataUrl, maskDataUrl, prompt})` — Replicate flux-fill-pro
3. `compositeWithOriginal(generated, original, mask)` — sharp overlay determinístico
4. `validateEdgeIntegrity(original, result, mask)` — auto-rejeição se >15% divergência

**Novos arquivos:**
- `artifacts/api-server/src/lib/arch-render-pipeline.ts` — todo o pipeline (mask + FluxFill + compositing + validate)
- `artifacts/api-server/src/routes/arch_ai_render.ts` — 5 endpoints async

**Novos endpoints (async 202 + polling):**
- `POST /api/arch/ai-render` → `{render_id}` (202)
- `GET /api/arch/ai-render/:id` → status + result_image_url
- `POST /api/arch/ai-render/:id/adjust` → ajuste herdando mode do pai
- `POST /api/arch/project-config` → salvar config reutilizável
- `GET /api/arch/project-config?lead_id=uuid` → listar configs

**Novos schemas DB:**
- `arch_ai_renders` — tabela standalone (não vinculada a cenas)
- `arch_project_configs` — configs reutilizáveis por lead

**Why:**
- Separar das tabelas existentes (`arch_renders` vinculada a `cenas`) evita quebrar o fluxo legado
- Compositing com sharp garante preservação determinística (pixel-level) independente do modelo

## Gotchas críticos
- Middleware import: `../middlewares/auth.js` (plural, não `middleware/authenticate.js`)
- `sharp` instalado em `artifacts/api-server` (dependencies)
- Flux Fill Pro recebe `image` (não `control_image`) e `mask` como campos separados
- Tabelas criadas via `executeSql` no Postgres interno do Replit; em produção rodar DDL via Supabase
- Frontend usa polling (2s interval, max 90 attempts = 3min)
