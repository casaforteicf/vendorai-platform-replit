# ARQ-PARAM-21 — paredes nos cortes e elevações

Versão: 2026.10.12.21
Código: 38fe51d17747ff7495d0a9798114f847fc49c81c
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423

## Entrega
Cortes e elevações adicionam paredes customWalls. Geometria local da parede desconta união dos vãos customOpenings antes de cortar/projetar. Mantém trechos de peitoril e acima das portas/janelas. Interseção com a espessura inclui paredes diagonais. Cotas absolutas seguem floor * 2,96 + 0,16 m, com altura de parede 2,80 m. Integração nas vistas/cotas e exportação SVG/A3 existente.

## Arquivos
- artifacts/frontend/src/pages/arch/conceptDocumentationWalls.ts
- artifacts/frontend/src/pages/arch/conceptDocumentationWalls.test.ts
- artifacts/frontend/src/pages/arch/ConceptArchitecturalDocumentation.tsx

## Validação
68 testes locais aprovados em 14 arquivos focados. TypeScript do componente e dependências aprovado. Novos testes de janela/peitoril/trecho superior, corte fora da parede, piso superior e porta sem preenchimento indevido. Sem build completo, navegador ou impressão real.

## Limites e pendências
Altura fixa conforme padrão atual, sem altura individual de parede. Elevação é projeção, sem remoção de linhas ocultas entre paredes distintas. Paredes derivadas dos ambientes antigos não incluídas. Sem caixilhos, vidros, arcos de portas ou acabamentos. Pranchas múltiplas/PDF e orçamento completo pendentes. Homologação/publicação Contabo adiadas pelo usuário; sem merge/main/deploy.
