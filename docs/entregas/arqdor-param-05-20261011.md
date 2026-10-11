# ARQ-PARAM-05 — Seleção dos elementos na planta
Atualizado em 11/10/2026. Versão v2026.10.11.5.

## Rastreabilidade e escopo
Continuação autorizada do editor Arqdor.
Branch: feat/arqdor-direct-design-workspace-20261009
Commit de código: a94f8c12b49b40b77bbadffab8b1a8bcdf53e763
Base: fa2d9e838ce4783a206838302ca373713f9d73df
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423 (draft).
Dependências: ARQ-PARAM-02/03/04.

## Implementado
- Camada SVG permite selecionar laje, escada e cobertura pelo contorno no modo navegação.
- Contorno selecionado destacado; Enter/Espaço acionam seleção pelo teclado.
- Elementos de outro pavimento filtrados; vãos derivados permanecem sem interação.
- Sem callback/modo de edição, camada permanece inerte; preenchimento não ocupa os cliques de ambientes e paredes.
- Planner encaminha seleção, limpa seleções convencionais e abre seção Construir.
- Painel carrega os parâmetros do elemento solicitado; revisão permite selecionar novamente o mesmo elemento.
- Modelo rerenderizado não apaga campos ainda não salvos por repetir a mesma solicitação.

## Arquivos
- artifacts/frontend/src/pages/arch/ConceptArchitecturalPlanLayer.tsx
- artifacts/frontend/src/pages/arch/ConceptArchitecturalPlanLayer.test.tsx
- artifacts/frontend/src/pages/arch/ConceptArchitecturalElementsPanel.tsx
- artifacts/frontend/src/pages/arch/ConceptArchitecturalElementsPanel.test.tsx
- artifacts/frontend/src/pages/arch/ConceptPlan2D.tsx
- artifacts/frontend/src/pages/arch/ConceptPlanner.tsx
- docs/entregas/arqdor-param-05-20261011.md

## Evidências locais
29 testes passaram em 6 arquivos recuperados/adicionados no workspace. Novos cenários: clique/teclado e destaque, filtro/inércia, carga do painel e seleção repetida. Não corresponde à suíte completa anterior.
vitest run --globals --environment jsdom src/pages/arch/*.test.ts src/pages/arch/*.test.tsx
TypeScript do painel/camada passou:
tsc --noEmit --skipLibCheck --target es2022 --moduleResolution bundler --module esnext --jsx react-jsx --allowSyntheticDefaultImports src/pages/arch/ConceptArchitecturalElementsPanel.tsx src/pages/arch/ConceptArchitecturalPlanLayer.tsx
Transformação sintática passou:
esbuild src/pages/arch/ConceptPlanner.tsx src/pages/arch/ConceptPlan2D.tsx --outdir=verify --format=esm
Revisão React: lista memoizada, callback dependente da lista e efeito com dependências completas; guard evita apagar edição por solicitação repetida; botões SVG acessíveis.

## Estado e pendências
Implementado com checks locais aprovados. Build completo, inspeção visual real, fluxo integrado de seleção/histórico/salvamento e validação técnica oficial na Contabo pendentes. Contabo continua adiada por orientação do usuário. Sem aprovação, merge em main, deploy ou publicação.
Arrasto, redimensionamento e seleção direta no WebGL/3D ainda pendentes. Clique por touch usa o contorno, sem gestos de arrasto implementados neste lote.
Impacto restrito ao editor Arqdor; sem banco/serviços novos.
Responsável: agente deste lote. Próximo passo: movimentação gráfica com limites/snap e histórico transacional, seguida de validação integrada.
