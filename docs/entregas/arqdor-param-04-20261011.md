# ARQ-PARAM-04 — Vãos manuais e carregamento validado
Atualizado em 11/10/2026. Versão v2026.10.11.4.

## Objetivo e rastreabilidade
Continuação autorizada das funcionalidades pendentes do editor Arqdor.
Branch: feat/arqdor-direct-design-workspace-20261009
Commit: f7d1eba010c4226610bc04c7e4820be203d123e3
Base: 02a48cb0ddd6d76af0d7e8ccb0de7c2d1958d27b
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423 (draft).
Dependências: ARQ-PARAM-02 (vãos automáticos/histórico), ARQ-PARAM-03 (parâmetros).

## Implementado
- Editor de vãos manuais na laje selecionada: posição absoluta na planta, largura/profundidade em metros, criar/editar/excluir.
- Validação transacional impede dimensões inválidas, recortes fora da laje e sobreposição entre vãos manuais.
- Edições usam o onChange existente do painel, entrando no histórico do planner e nas projeções/quantitativos compartilhados.
- Leitura do snapshot valida versão, listas, identificadores únicos, geometria, pavimentos e estrutura dos vãos antes de atualizar identidade/estado do projeto.
- Dados legados sem modelo são inicializados como modelo vazio; modelos presentes inválidos interrompem o carregamento com erro.
- Cópia dos vãos na restauração evita referências compartilhadas com o JSON original.

## Arquivos
- artifacts/frontend/src/pages/arch/ConceptArchitecturalElementsPanel.tsx
- artifacts/frontend/src/pages/arch/ConceptSlabVoidsEditor.tsx
- artifacts/frontend/src/pages/arch/ConceptSlabVoidsEditor.test.tsx
- artifacts/frontend/src/pages/arch/conceptArchitecturalModel.ts
- artifacts/frontend/src/pages/arch/conceptArchitecturalModel.test.ts
- artifacts/frontend/src/pages/arch/ConceptPlanner.tsx
- docs/entregas/arqdor-param-04-20261011.md

## Evidências locais
26 testes passaram em 5 arquivos recuperados/adicionados no workspace. Cinco novos cenários: criar/editar/excluir/rejeitar vãos, round-trip de JSON e rejeição de estrutura malformada/duplicada. Não corresponde à suíte completa anterior.
vitest run --globals --environment jsdom src/pages/arch/*.test.ts src/pages/arch/*.test.tsx
TypeScript passou para painel e auxiliares:
tsc --noEmit --skipLibCheck --target es2022 --moduleResolution bundler --module esnext --jsx react-jsx --allowSyntheticDefaultImports src/pages/arch/ConceptArchitecturalElementsPanel.tsx src/pages/arch/conceptArchitecturalViews.ts
Transformação sintática do planner passou:
esbuild src/pages/arch/ConceptPlanner.tsx --outdir=verify --format=esm
Revisão React: componente separado, campos rotulados, handlers explícitos, estado local restrito ao formulário, transação antes de alterar snapshot.

## Estado e pendências
Implementado com checks locais aprovados. Build completo, inspeção visual do workspace, salvamento/backend e validação técnica oficial na Contabo pendentes. Homologação Contabo permanece adiada por orientação do usuário. Sem aprovação, merge em main, deploy ou publicação.
Impacto restrito ao editor Arqdor; sem migração de banco ou serviço pago novo. A validação local de JSON não comprova armazenamento com a API.
Seleção/arrasto direto nas vistas, mobile/touch dos elementos novos e confirmação visual do histórico continuam pendentes.
Responsável: agente deste lote. Próximo passo: interação gráfica dos elementos e testes integrados de salvamento/restauração no ambiente completo.
