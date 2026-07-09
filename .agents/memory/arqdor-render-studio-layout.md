---
name: ARQDOR Render Studio layout
description: Estrutura do layout IDE dark premium do /arch/render — 4 painéis + step machine preservado
---

## Layout structure

`RenderStudioPage.tsx` foi reescrito como IDE de 4 painéis em `artifacts/frontend/src/pages/arch/`:

```
<div height=100vh column>
  <Topbar />                          // 52px: logo | busca | projeto | CTA step | copilot | notif | perfil
  <div flex row>
    <LeftSidebar width=220 />         // step machine + nav ARQDOR (oculta sidebar global VendorAI)
    <div flex column>
      <CentralCanvas flex=1 />        // render grande, upload zone ou placeholder
      <BottomPanel height=180 />      // tabs: Storyboard|Versões|Comentários|Histórico|IA
    </div>
    <RightPanel width=300 />          // tabs: Propriedades|Camadas; conteúdo depende do step ativo
  </div>
  <Footer height=28 />               // Salvo | última alteração | ambiente | atalhos
</div>
```

## Design tokens (D object)
- bg: #060911, surface: #0C1120, card: #111827
- purple: #7C3AED, purpleText: #A78BFA
- text: #EDF2F7, muted: #7B8EA5

## Step machine preservado
- 8 steps (projeto → especificação) com toda a lógica de API da Sprint 039 intacta
- Step controla: o item destacado na sidebar, o conteúdo do RightPanel (Properties tab)
- CentralCanvas sempre visível — exibe o render ou upload zone independente do step

## Integração com galeria real
- `BottomPanel` usa `useRealRenderGallery(projectId)` para carregar versões do DB
- Gallery items + in-session versions exibidos juntos no tab "Versões"

**Why:** Screenshot da ferramenta não captura após auth (FullscreenProtectedRoute redireciona para login). Verificar resultado fazendo login manualmente em /arch/render.
