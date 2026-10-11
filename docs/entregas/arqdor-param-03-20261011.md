# ARQ-PARAM-03 — Controles paramétricos no painel
Atualização: 11/10/2026. Versão v2026.10.11.3.

## Escopo e rastreabilidade
Continuação autorizada do desenvolvimento Arqdor, sem publicação.
Branch: feat/arqdor-direct-design-workspace-20261009
Commit de código: f6e79ef158ce7cf2cc2fe838111de56a5932f8f9
Base: 531f40a2ef131888ff46a432645764dfa81a7804
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423 (draft).
Dependência: ARQ-PARAM-02 (vãos derivados e histórico).

## Entregas
- Espessura da laje ajustável em centímetros, com padrão de 15 cm; cota superior editável em metros.
- Desnível e espelho preferencial da escada editáveis; resumo dos espelhos/pisos calculados.
- Cobertura plana, uma água ou duas águas, com cota, inclinação e beiral editáveis.
- Cobertura plana fixa a inclinação em zero; alternância para telhado inclinado recupera uma inclinação inicial válida.
- Seleção de elemento existente carrega parâmetros reais; edição preserva pavimento e vãos manuais.
- Novo elemento restaura padrões sem modificar o elemento anterior.
- Campos vazios permanecem inválidos em vez de virarem zero; tipos desconhecidos de cobertura são rejeitados no validador.
- Snapshot permanece serializável e usa o histórico/salvamento existente. Sem mudanças no banco ou novos serviços.

## Arquivos
- artifacts/frontend/src/pages/arch/ConceptArchitecturalElementsPanel.tsx
- artifacts/frontend/src/pages/arch/ConceptArchitecturalElementsPanel.test.tsx
- artifacts/frontend/src/pages/arch/conceptArchitecturalElements.ts
- docs/entregas/arqdor-param-03-20261011.md

## Validação local
21 testes passaram em 4 arquivos recuperados/adicionados no workspace; 6 cenários de interface novos neste lote. Não é a suíte completa anterior de 445 testes.
Comando: vitest run --globals --environment jsdom src/pages/arch/*.test.ts src/pages/arch/*.test.tsx
TypeScript do painel e auxiliares compartilhados passou:
tsc --noEmit --skipLibCheck --target es2022 --moduleResolution bundler --module esnext --jsx react-jsx --allowSyntheticDefaultImports src/pages/arch/ConceptArchitecturalElementsPanel.tsx src/pages/arch/conceptArchitecturalViews.ts
Revisão React: estado explícito, métricas derivadas sem efeitos, defaults reiniciados por interação, entradas rotuladas e validação prévia ao commit.

## Estado, impacto e pendências
Implementado com checks locais aprovados. Validação oficial na Contabo, build completo, inspeção visual integrada, salvamento ponta a ponta e homologação pendentes. Contabo adiada por orientação do usuário. Aprovação, merge em main, deploy e publicação não executados.
Impacto restrito ao painel/validador Arqdor. Os parâmetros alimentam as projeções existentes via snapshot central; não há verificação estrutural/normativa nem suporte a escadas curvas neste lote.
Responsável: agente deste lote. Próximo passo: seleção/interação gráfica dos elementos, checagem visual de parâmetros nas vistas oficiais e persistência com backend, antes da homologação da versão exata.
