# ARQ-PARAM-08 — Consistência dos gestos de arrasto
Atualizado em 11/10/2026. Versão v2026.10.11.8.

## Rastreabilidade
Branch: feat/arqdor-direct-design-workspace-20261009
Commit de código: ea2ef58d9658b9dc14148e25e2793590e2ccd7db
Base: a05cd5ec0e6ac8813e81ba5cff427b677ce93ebe
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423 (draft).
Escopo autorizado: continuidade da manipulação gráfica do editor; revisão de ARQ-PARAM-07.

## Correções
- Bloqueia setas e comandos de seleção durante um arrasto ativo; evita edição concorrente pelo teclado antes de soltar.
- Escape/cancelamento limpa a prévia e libera imediatamente a captura do ponteiro.
- Sessão transitória guarda o alvo para liberar a captura sem esperar outro evento.
- Perda de captura de um segundo ponteiro não cancela o gesto do primeiro.
- Ref é limpa antes de liberar captura, evitando recursão em lostpointercapture.
- Após cancelamento, movimento por teclado funciona novamente.

## Arquivos
- artifacts/frontend/src/pages/arch/ConceptArchitecturalPlanLayer.tsx
- artifacts/frontend/src/pages/arch/ConceptArchitecturalPlanLayer.test.tsx
- docs/entregas/arqdor-param-08-20261011.md

## Evidências locais
39 testes passaram em 7 arquivos recuperados/adicionados no workspace; dois cenários novos exercitam concorrência teclado/ponteiro, liberação da captura e identificação do ponteiro.
vitest run --globals --environment jsdom src/pages/arch/*.test.ts src/pages/arch/*.test.tsx
TypeScript da camada passou:
tsc --noEmit --skipLibCheck --target es2022 --moduleResolution bundler --module esnext --jsx react-jsx --allowSyntheticDefaultImports src/pages/arch/ConceptArchitecturalPlanLayer.tsx
Testes simulam Pointer Events, matriz SVG e captura em jsdom; não equivalem a inspeção em navegador/dispositivo real.
Revisão React: sessão transitória em ref, cancelamento sem mutação do modelo e isolamento dos comandos durante gesto.

## Estado e pendências
Implementado com checks locais aprovados. Build completo, validação visual integrada, comportamento real mouse/touch, salvamento/backend e validação técnica oficial Contabo pendentes. Contabo adiada por orientação do usuário. Sem merge em main, aprovação, deploy ou publicação.
Redimensionamento gráfico, snap para paredes e seleção direta 3D continuam pendentes.
Impacto restrito ao componente da planta Arqdor; sem banco/serviço novo.
Responsável: agente deste lote. Próximo passo: redimensionamento transacional e validação visual do workspace completo.
