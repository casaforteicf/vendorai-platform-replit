---
name: Project Phoenix UX Design System
description: Design system decision for ARQDOR.ai — light-theme premium shell, flow-step nav, PHX tokens.
---

## Rule
ARQDOR.ai usa o tema PHX (light) para o shell (top bar, wrapper, home). Módulos internos mantêm seus próprios fundos escuros — padrão "Figma: chrome claro, canvas escuro".

## PHX tokens
Definidos em `arqdor-theme.ts` — exportar `PHX` (light). O token `T` (dark) permanece para módulos legados. Nunca misturar PHX e T num mesmo componente.

## Navegação por objetivos
`FLOW_STEPS` em ArqWorkspace.tsx: 7 etapas (Criar → Inspirar → Renderizar → Melhorar → Especificar → Apresentar → Entregar), cada uma mapeada para módulos existentes via `primary` + `extras[]`. Sub-steps aparecem automaticamente quando `extras.length > 0`.

## Componentes Phoenix
- `ProjectHomePhoenix.tsx` — home light com upload, 5-step wizard, style picker
- `RenderProgressModal` — exportado de ProjectHomePhoenix, reutilizável
- `StepCard`, `UploadZone`, `ProjectPanel` — sub-componentes locais

## CTA imutável
`✨ Gerar Render` na top bar SEMPRE visível. Abre `RenderProgressModal` e depois navega para `'renders'`. Nunca remover este botão.

## Copilot
Começa colapsado (`useState(true)` em `copilotCollapsed`). Não alterar a implementação do `ArqCopilot` — só o estado inicial e o botão de toggle no shell.

**Why:** o usuário não deve ver complexidade ao abrir o app. Copilot aberto em cada load cria fricção e pressão cognitiva.

**How to apply:** Ao adicionar novos módulos: criar arquivo em `workspace/modules/`, registrar em `renderModule()`, adicionar ao `FLOW_STEPS.extras[]` do step correspondente — nunca criar nova tab de jornada.
