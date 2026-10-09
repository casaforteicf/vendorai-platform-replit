# Arqdor — registro de entrega do editor

## Bloco de duplicação e divisão

Edição de comprimento diretamente na planta delega ao mesmo fluxo do painel, sem cortar coordenadas para fazer a medida caber. Duplicação desloca ambos os extremos igualmente, tenta o lado oposto junto à borda e rejeita quando nenhum lado cabe, preservando diagonais. Divisão bloqueada quando o ponto atravessa uma porta/janela; offsets são redistribuídos exatamente sem clamps que deslocavam aberturas. Botão de divisão informa a restrição.

Arquivos ConceptPlanner.tsx, conceptWallOperations.ts e conceptWallOperations.test.ts. Sete testes específicos de operações e limites passaram; sintaxe TSX passou. Este bloco não altera o ponto inicial da parede: a revisão identificou que esse controlador não tem chamadas no planner atual. Validação integrada e publicação permanecem adiadas.

## Bloco consolidado de medidas e atalhos

Comprimento da parede usa entrada decimal confirmada; mínimo considera a maior abertura vinculada mais 10 cm; máximo é calculado na direção da parede a partir do início, respeitando o primeiro limite do terreno. Medidas fora desses limites são rejeitadas sem alteração silenciosa. Exclusão por teclado centralizada em um único listener; listeners específicos mantêm duplicação/rotação e respeitam eventos já consumidos. Modo de desenho impede exclusão e duplicação por atalhos de seleção, preservando Backspace para a medida.

Arquivos: ConceptPlanner.tsx, conceptWallLengthLimits.ts e conceptWallLengthLimits.test.ts. Verificação consolidada: 28 testes passaram em 8 arquivos; sintaxe de ConceptPlanner.tsx passou no esbuild. Os testes cobrem geometria e componentes isolados; o planner completo e os conflitos de listeners exigem conferência integrada posterior. Homologação e publicação permanecem adiadas.

Entrada métrica: erro de limites agora visível e associado ao campo para leitores de tela; seleção diferente restaura o valor mesmo quando ambas aberturas possuem a mesma medida. Teste de troca de seleção adicionado. Arquivos ConceptMetricInput.tsx, ConceptMetricInput.test.tsx e ConceptPlanner.tsx.

Correção adicional: normalização do peitoril preserva 0,00 m para janelas até o piso. Três testes específicos cobrem zero, ausência/NaN, limites e portas. Arquivos conceptParametricEditing.ts e conceptOpeningSill.test.ts. Esta evidência é unitária; visualização integrada permanece pendente.

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

21 testes passaram em 6 arquivos: entrada (3), geometria de medidas (4), interação de precisão (6), comportamento móvel existente (2), rede de paredes existente (4) e entrada métrica (2). Execução: Vitest com globals e ambiente jsdom. Sintaxe TSX e CSS e tipagem do auxiliar de geometria verificadas isoladamente.

## Edição das aberturas

Commits 88054515db39f373ca13f9403b14a20614bc5700 e bd82e0b04e9200d23a1d6c69f39f4636142f80e4: testes de correção/cancelamento e entrada métrica para largura, altura e peitoril. ConceptMetricInput.tsx e ConceptMetricInput.test.tsx adicionados; ConceptPlanner.tsx integrado. A medida aceita vírgula e confirma ao sair do campo ou pressionar Enter, sem atualizar o modelo durante cada tecla.

Incremento de posicionamento: distância do centro da abertura desde o início da parede em metros, respeitando margens da largura, e ação Centralizar na parede. O controle percentual existente permanece disponível. Usa o mesmo offset central do modelo e o histórico existente. Homologação e publicação adiadas por solicitação do usuário; nenhum acesso Vendi adicional necessário para este incremento. Verificação integrada das vistas permanece pendente.

Build completo, inspeção visual integrada e E2E em homologação ainda pendentes. A consulta e tentativa de operação somente leitura pelo Vendi retornaram tenant_not_found para casaforteicf. Nenhuma publicação ou alteração em produção nesta entrega. A aprovação não depende do GitHub Actions; exige validação na Contabo conforme o fluxo do projeto.

Esta entrega não implementa BIM completo, colaboração simultânea, importação DWG, renderização fotorrealista ou documentação automática. Esses itens permanecem no roteiro de evolução.
