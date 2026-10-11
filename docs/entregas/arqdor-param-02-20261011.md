# ARQ-PARAM-02 — Vãos de escada e histórico paramétrico

Atualizado em 11/10/2026. Versão: v2026.10.11.2.

## Objetivo e escopo
Continuar o editor Arqdor no PR #3423, com abertura automática das lajes superiores definidas no modelo e integração de lajes/escadas/coberturas ao histórico existente. Homologação Contabo e publicação permanecem adiadas por orientação do usuário neste chat.

## Rastreabilidade
- Branch: feat/arqdor-direct-design-workspace-20261009
- Código: c538d81e6e2f6606ac8aed42f68c631b7c98d995
- Base: 034dbac44bda98f62e870de43d62a9fcf687b5a5
- PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423 (draft)
- Registro complementar: docs/releases/arqdor-editor-20261009.md

## Concluído
- Cortes retangulares derivados da escada do pavimento imediatamente inferior, com opção por escada para desligar.
- Recorte limitado a cada laje, preservação dos vãos manuais e atualização após mover/excluir escada.
- Planta, sólidos 3D, acabamentos e quantitativos usam os mesmos cortes; áreas sobrepostas descontadas uma única vez.
- Modelo arquitetônico copiado profundamente no histórico; ações do painel registram um estado anterior e limpam refazer.
- Restauração em desfazer/refazer e dependências completas do histórico no atalho de teclado.
- Pavimento do elemento selecionado preservado na edição; cotas iniciais de laje e desenvolvimento inicial da escada corrigidos.

## Arquivos
- artifacts/frontend/src/pages/arch/conceptArchitecturalElements.ts
- artifacts/frontend/src/pages/arch/conceptArchitecturalModel.ts
- artifacts/frontend/src/pages/arch/conceptArchitecturalViews.ts
- artifacts/frontend/src/pages/arch/ConceptPlanner.tsx
- artifacts/frontend/src/pages/arch/ConceptArchitecturalElementsPanel.tsx
- artifacts/frontend/src/pages/arch/conceptArchitecturalSlabVoids.ts
- artifacts/frontend/src/pages/arch/conceptArchitecturalSlabVoids.test.ts
- artifacts/frontend/src/pages/arch/ConceptArchitecturalElementsPanel.test.tsx
- docs/releases/arqdor-editor-20261009.md
- docs/entregas/arqdor-param-02-20261011.md

## Evidências locais
- vitest run --globals --environment jsdom src/pages/arch/*.test.ts src/pages/arch/*.test.tsx: 15 testes passaram em 4 arquivos recuperados do commit base e adicionados neste lote. Não é uma repetição da suíte completa anterior de 445 testes.
- tsc --noEmit --skipLibCheck --target es2022 --moduleResolution bundler --module esnext --jsx react-jsx --allowSyntheticDefaultImports src/pages/arch/ConceptArchitecturalElementsPanel.tsx src/pages/arch/conceptArchitecturalViews.ts: passou.
- esbuild src/pages/arch/ConceptPlanner.tsx --outdir=verify --format=esm: passou; transformação sintática, sem bundle/typecheck completo do planner.
- Revisão React aplicada: estado derivado, handler de edição, cópia profunda, dependências de teclado, campos rotulados e opção de abertura acessível.

## Estado e pendências
Implementado com checks locais aprovados. Validação técnica oficial na Contabo: pendente. Build completo, inspeção visual integrada, uso real do histórico no planner, persistência com backend, homologação e aprovação: pendentes. Merge em main/deploy/produção: não executados.

Os cortes dependem de lajes superiores presentes no modelo arquitetônico; não criam pavimentos/lajes. Não verificam altura livre nem dimensionamento estrutural. Seleção/arrasto direto dos elementos novos continua pendente. Impacto restrito ao modelo/renderização do Arqdor e ao histórico do editor; nenhum serviço novo ou alteração de banco.

Responsável por implementação: agente deste lote. Próximo passo: validar histórico e geometria no workspace completo, confirmar persistência do snapshot e então homologar a versão exata quando a etapa Contabo for retomada.
