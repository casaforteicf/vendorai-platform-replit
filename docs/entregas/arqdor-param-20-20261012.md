# ARQ-PARAM-20 — paredes e vãos na planta documental

Versão: 2026.10.12.20
Código: f4c14278e73feda222dc5d6db2b4cae756089973
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423

## Entrega
Planner envia customWalls/customOpenings ao painel documental. Planta por piso adiciona polígonos das paredes desenhadas, inclusive diagonais, com espessura informada ou padrão 0,15 m. Desconta união dos vãos interceptados a 1,20 m, usando offset normalizado centrado. Vãos altos ficam acima do corte e não interrompem a parede. SVG/A3 e cotas gerais usam a geometria resultante.

## Arquivos
- artifacts/frontend/src/pages/arch/conceptDocumentationWalls.ts
- artifacts/frontend/src/pages/arch/conceptDocumentationWalls.test.ts
- artifacts/frontend/src/pages/arch/ConceptArchitecturalDocumentation.tsx
- artifacts/frontend/src/pages/arch/ConceptArchitecturalElementsPanel.tsx
- artifacts/frontend/src/pages/arch/ConceptPlanner.tsx

## Validação
66 testes locais aprovados em 14 arquivos focados. TypeScript do painel documental e dependências aprovado. Testes de espessura padrão, vãos centrados, piso, janelas altas, paredes diagonais, sobreposição de vãos e parede degenerada. Integração de props no Planner inspecionada; não validada em navegador/build completo.

## Limites e pendências
Somente paredes desenhadas customWalls, sem derivação de paredes dos ambientes antigos. Não une interseções dos polígonos. Vãos são aberturas geométricas, sem arco de porta ou detalhe de caixilho. Defaults para dimensões omitidas: portas 0,90 × 2,10 m; janelas 1,20 × 1,20 m e peitoril 0,90 m. Cortes/elevações de paredes/esquadrias ainda pendentes, assim como impressão real. Homologação/publicação Contabo adiadas pelo usuário; sem merge/main/deploy.
