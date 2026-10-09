# Arqdor — registro de entrega do editor

Identificador desta entrega: ARQ-EDITOR-20261009. Versão: desenvolvimento, PR #3423.

## Entrada e espaço de trabalho

Commit: e8e13b51e262d55f8c12c2a25db10e8763db3fd5.
Entrada opcional por ideia, abertura direta do editor, navegação entre vistas, painéis laterais e identidade verde com a fonte existente.
Arquivos: ConceptPlanner.tsx, ConceptClientBriefPanel.tsx, ConceptIdeaEntry.tsx, ConceptIdeaEntry.test.tsx e concept-editor-workspace.css em artifacts/frontend/src/pages/arch.

## Precisão do desenho

Incremento seguinte no mesmo PR: medidas decimais com ponto ou vírgula; espessura selecionável; direção definida pelo cursor; preservação das coordenadas de snap; rejeição de medidas que ultrapassam a área; concluir a cadeia de paredes; atalhos de portas e janelas na parede selecionada.
Arquivos: ConceptPlan2D.tsx, ConceptPlanner.tsx, conceptWallDrawing.ts, conceptWallDrawing.test.ts, ConceptPlan2D.precision.test.tsx e concept-editor-workspace.css no mesmo diretório.
O commit deste incremento consta no histórico do PR.

## Evidências e pendências

17 testes passaram em 5 arquivos: entrada (3), geometria de medidas (4), interação de precisão (4), comportamento móvel existente (2) e rede de paredes existente (4). Execução: Vitest com globals e ambiente jsdom. Sintaxe TSX e CSS e tipagem do auxiliar de geometria verificadas isoladamente.

Build completo, inspeção visual integrada e E2E em homologação ainda pendentes. A consulta e tentativa de operação somente leitura pelo Vendi retornaram tenant_not_found para casaforteicf. Nenhuma publicação ou alteração em produção nesta entrega. A aprovação não depende do GitHub Actions; exige validação na Contabo conforme o fluxo do projeto.

Esta entrega não implementa BIM completo, colaboração simultânea, importação DWG, renderização fotorrealista ou documentação automática. Esses itens permanecem no roteiro de evolução.
