# ARQ-PARAM-07 — Arrasto transacional na planta
Atualizado em 11/10/2026. Versão v2026.10.11.7.

## Rastreabilidade
Branch: feat/arqdor-direct-design-workspace-20261009
Commit de código: 1af48a8bbe558c6d7d4f545324773a697b4d965b
Base: 94e37c0f3e8a54ca15559db41d3ec3c5ddfd1ddc
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423 (draft).
Escopo: continuidade autorizada dos elementos paramétricos; depende de ARQ-PARAM-05/06.

## Implementado
- Arrastar contorno previamente selecionado no modo navegação, com Pointer Events/captura do ponteiro.
- Coordenadas de tela convertidas para metros pela matriz SVG; deslocamento arredondado a 1 cm.
- Prévia local redesenha elemento/vãos durante o gesto sem alterar snapshot persistível nem histórico.
- Soltar confirma um único movimento pelo handler existente; gesto sem deslocamento não cria edição.
- Escape, pointercancel e perda de captura cancelam sem commit.
- Mudança de snapshot, pavimento ou seleção descarta movimento antigo.
- Fora do retângulo nominal do terreno, prévia conserva a última posição válida; não confirma posição inválida. Limite não inclui beiral nem divisa irregular.
- Fluxo para toque usa Pointer Events e touchAction none no elemento selecionado, sem alegar teste em dispositivo real.

## Arquivos
- artifacts/frontend/src/pages/arch/ConceptArchitecturalPlanLayer.tsx
- artifacts/frontend/src/pages/arch/ConceptArchitecturalPlanLayer.test.tsx
- artifacts/frontend/src/pages/arch/ConceptPlan2D.tsx
- docs/entregas/arqdor-param-07-20261011.md

## Evidências locais
37 testes passaram em 7 arquivos recuperados/adicionados. Quatro cenários novos: prévia/commit único, cancelamentos, limite/ponteiro diferente e snapshot alterado.
vitest run --globals --environment jsdom src/pages/arch/*.test.ts src/pages/arch/*.test.tsx
TypeScript da camada passou:
tsc --noEmit --skipLibCheck --target es2022 --moduleResolution bundler --module esnext --jsx react-jsx --allowSyntheticDefaultImports src/pages/arch/ConceptArchitecturalPlanLayer.tsx
Transformação sintática ConceptPlan2D passou com esbuild (sem bundle/build completo).
Testes usam matriz SVG e captura de ponteiro simuladas em jsdom. Não substituem interação real com pan/zoom/toque.
Revisão React: ref para sessão transitória, state apenas para prévia; uma transação na conclusão e isolamento do snapshot base.

## Estado e pendências
Implementado com checks locais aprovados. Inspeção visual integrada, gesto real em mouse/touch, integração com pan/zoom, desfazer/refazer real e persistência/backend pendentes. Build completo e validação técnica oficial Contabo pendentes; homologação adiada por orientação do usuário. Sem merge em main, aprovação, deploy ou publicação.
Redimensionamento por nós, snap para rede de paredes e seleção direta no 3D ainda pendentes.
Impacto restrito ao editor Arqdor; sem banco/serviço novo. Responsável: agente deste lote.
Próximo passo: testar gesto no workspace completo e evoluir manipulação dos elementos com validação de dimensões.
