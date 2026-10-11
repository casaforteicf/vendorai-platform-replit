# ARQ-PARAM-10 — duplicação de elementos

Versão: 2026.10.11.10
Commit de código: e0c4fb7936cece1bd25130c53c3fe19545ec8567
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423

## Entrega
Duplicação de lajes, escadas e coberturas a partir dos parâmetros salvos. Controles de deslocamento X/Y em metros, padrão 0,50 m. Preserva pavimento, espessura, cotas, proporções e opção de abertura automática da escada, inclinação/tipo/beiral da cobertura. Vãos manuais são copiados independentemente e transladados com a laje. Identificadores livres são gerados considerando todos os tipos do modelo. Rejeita deslocamento não finito, cópia coincidente, origem inexistente e contorno nominal fora do lote. A cópia é emitida em uma única chamada onChange, integrada ao histórico existente do Planner. O original permanece selecionado; a cópia fica disponível na lista para edição. Alterações do formulário ainda não salvas não são copiadas; a interface explica isso.

## Arquivos
- artifacts/frontend/src/pages/arch/conceptArchitecturalDuplication.ts
- artifacts/frontend/src/pages/arch/conceptArchitecturalDuplication.test.ts
- artifacts/frontend/src/pages/arch/ConceptArchitecturalElementsPanel.tsx
- artifacts/frontend/src/pages/arch/ConceptArchitecturalElementsPanel.test.tsx

## Validação
48 testes locais aprovados em 8 arquivos focados. TypeScript do painel e dependências sem erros. Casos incluem independência dos vãos, colisões de IDs, cópias repetidas, preservação de parâmetros, limites do lote e campos vazios. Sem build completo do monorepo ou validação E2E/navegador/backend neste lote.

## Pendências
Homologação e publicação Contabo adiadas conforme orientação do usuário. Sem merge em main ou deploy. Permite sobreposição parcial para posicionamento posterior; não valida colisões entre elementos. Limites consideram retângulo nominal do lote, sem beirais/terreno irregular.
