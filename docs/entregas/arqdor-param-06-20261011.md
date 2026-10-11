# ARQ-PARAM-06 — Movimento métrico dos elementos
Atualizado em 11/10/2026. Versão v2026.10.11.6.

## Rastreabilidade e escopo
Branch: feat/arqdor-direct-design-workspace-20261009
Commit de código: 67813040d41375bb0a4b18bdfac8a94e36634ca9
Base: afcbbefa5a632aed9e158eea98d185b913268917
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423 (draft).
Continuação autorizada da seleção/movimentação do editor, dependente dos lotes ARQ-PARAM-02 a 05.

## Implementado
- Elemento selecionado e focado no contorno da planta pode ser movido por setas: 1 cm; Shift: 10 cm.
- Repetição automática da tecla ignorada para evitar múltiplos commits por tecla segurada.
- Laje, escada e cobertura preservam pavimento, dimensões e alturas; vãos manuais são transladados com a laje.
- Deslocamentos inválidos ou que levem a base retangular para fora do terreno são rejeitados sem alteração parcial. O limite usa o retângulo nominal; beiral não entra nesse limite.
- Movimento usa changeArchitecturalModel e histórico existente; painel recebe seleção revisada para mostrar a nova posição.
- Corrigida também a translação dos vãos ao alterar X/Y da laje pelo painel.
- Modelo compartilhado recalcula projeções e vãos automáticos de escada.

## Arquivos
- artifacts/frontend/src/pages/arch/conceptArchitecturalMovement.ts
- artifacts/frontend/src/pages/arch/conceptArchitecturalMovement.test.ts
- artifacts/frontend/src/pages/arch/ConceptArchitecturalPlanLayer.tsx
- artifacts/frontend/src/pages/arch/ConceptArchitecturalPlanLayer.test.tsx
- artifacts/frontend/src/pages/arch/ConceptArchitecturalElementsPanel.tsx
- artifacts/frontend/src/pages/arch/ConceptPlan2D.tsx
- artifacts/frontend/src/pages/arch/ConceptPlanner.tsx
- docs/entregas/arqdor-param-06-20261011.md

## Evidências locais
33 testes passaram em 7 arquivos recuperados/adicionados no workspace; quatro cenários novos de movimento/teclado. Não corresponde à suíte completa anterior.
vitest run --globals --environment jsdom src/pages/arch/*.test.ts src/pages/arch/*.test.tsx
TypeScript passou:
tsc --noEmit --skipLibCheck --target es2022 --moduleResolution bundler --module esnext --jsx react-jsx --allowSyntheticDefaultImports src/pages/arch/ConceptArchitecturalPlanLayer.tsx src/pages/arch/conceptArchitecturalMovement.ts src/pages/arch/ConceptArchitecturalElementsPanel.tsx
Transformação sintática passou:
esbuild src/pages/arch/ConceptPlanner.tsx src/pages/arch/ConceptPlan2D.tsx --outdir=verify --format=esm
Revisão React: handler de teclado evita propagação, validação antes de commit, atualização explícita de seleção/painel e cópia imutável de vãos.

## Estado e pendências
Implementado com checks locais aprovados. Build completo, inspeção visual integrada, uso real do histórico e persistência/backend pendentes. Homologação oficial Contabo adiada por orientação do usuário. Sem aprovação, merge em main, deploy ou publicação.
Não inclui arrasto por pointer/mouse/touch, redimensionamento gráfico, snap para paredes ou seleção no WebGL. Controle de teclado usa passo métrico fixo, sem afirmar suporte a arrasto.
Impacto restrito ao editor Arqdor, sem banco/serviços novos.
Responsável: agente deste lote. Próximo passo: gesto de arrasto transacional com preview/cancelamento, seguido de validação visual e persistência no ambiente completo.
