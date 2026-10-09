# Arqdor — registro de entrega do editor

## Bloco de paredes e nós com aberturas

Atualização de parede e movimentação de junções validam previamente o conjunto de aberturas. Quando apenas um extremo muda, preservam distância ao extremo fixo; quando ambos mudam, preservam posição relativa. Larguras permanecem intactas; parede curta ou colisão após reposicionamento rejeitam a operação antes de aplicar paredes/aberturas. Nó atualiza os dois conjuntos na mesma operação React. Reconciliação antiga removida do planner para usar auxiliar testável único.

Arquivos ConceptPlanner.tsx, conceptWallOpeningReconciliation.ts e conceptWallOpeningReconciliation.test.ts. Dez testes de reconciliação/posicionamento passaram; sintaxe TSX passou. Não representa validação de importação ou teste integrado do planner completo. Homologação e publicação adiadas.

## Bloco de arraste, modelos e catálogo

Arraste e movimentação de aberturas livres verificam encaixe físico e colisões na parede; edição de largura na planta verifica colisões antes de aplicar; modelos de aberturas buscam intervalo livre; aplicação de produto do catálogo rejeita dimensões que não cabem na posição atual ou sobrepõem outra abertura. Validador de encaixe rejeita coordenadas/larguras não finitas. Avisos explicam falhas sem modificar a geometria nessas operações.

Arquivos ConceptPlanner.tsx, conceptOpeningPlacement.ts e conceptOpeningPlacement.test.ts. Rodada consolidada: 37 testes passaram em 10 arquivos; sintaxe TSX passou. Importação, movimentação de nós de paredes e reconciliação global permanecem fora da proteção deste bloco. Homologação e publicação adiadas.

## Bloco de espaço livre para aberturas

Inserção e duplicação buscam um intervalo livre na parede, rejeitando quando não cabe. Alteração de offset pelo painel e alteração de dimensões verificam colisões com outras aberturas na mesma parede. Comparação considera altura e peitoril, permitindo aberturas separadas verticalmente. Falha informa o motivo em aviso dispensável. Não é uma validação global: importações, catálogo, arraste e reconciliação de paredes precisam de revisão posterior.

Arquivos ConceptPlanner.tsx, conceptOpeningPlacement.ts e conceptOpeningPlacement.test.ts. Sete testes do bloco de posicionamento/operações passaram; sintaxe TSX passou. Homologação e publicação seguem adiadas.

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


## Espessura padrão e representação real — revisão 15 cm

Padrão aprovado de 0,15 m para novas paredes e paredes derivadas de ambientes; medidas explícitas existentes preservadas. Seletores de desenho e edição oferecem 10, 12, 15, 20, 25 e 30 cm. Planta 2D representa a espessura real das paredes personalizadas e sugestões sem alterar a largura na seleção; paredes derivadas usam 15 cm, alinhadas ao 3D. Fallback paramétrico e 3D alinhados a 15 cm.

Verificação: 10 testes específicos passaram em 2 arquivos, incluindo parede de 25 cm antes/depois da seleção; sintaxe de ConceptPlanner e ConceptModel3D verificada com esbuild. Validação integrada, homologação Contabo e publicação permanecem pendentes. Lote ARQ-EDITOR-20261009, versão em desenvolvimento.


## Conversão e aplicação de produtos em aberturas

Conversão porta/janela usa uma única atualização após validar largura final, altura e peitoril, com bloqueio de sobreposição horizontal/vertical. Remove vínculo de produto/família ao mudar tipo para evitar associação incompatível. Movimentação bloqueada e conversão rejeitada não adicionam entrada vazia ao histórico. Produtos do catálogo fora da faixa atual de largura/altura são rejeitados com aviso antes da aplicação, evitando redução silenciosa das medidas do produto.

Arquivos: ConceptPlanner.tsx, conceptOpeningPlacement.ts e conceptOpeningConversion.test.ts. Verificação consolidada: 47 testes passaram em 12 arquivos; sintaxe de ConceptPlanner verificada com esbuild. Sem build completo ou validação integrada. Lote ARQ-EDITOR-20261009, versão em desenvolvimento; homologação Contabo e publicação adiadas conforme orientação do usuário.


## Medidas exatas e validação comum das aberturas

Edição de largura pela planta e de parâmetros pelo painel agora valida a medida solicitada sem reduzir largura ou deslocar o centro silenciosamente. Posição percentual também rejeita posição inválida em vez de prender no limite. Largura, altura e peitoril usam validação comum; valores fora da faixa ou não finitos rejeitados. Dimensões existentes de importação são preservadas ao editar outro parâmetro. Helper de ajuste silencioso removido por ficar sem consumidores.

Arquivos: ConceptPlanner.tsx, conceptOpeningPlacement.ts e conceptOpeningExactEdit.test.ts. Validação consolidada: 53 testes passaram em 13 arquivos; sintaxe TSX de ConceptPlanner verificada com esbuild. Sem build completo ou inspeção integrada. Lote ARQ-EDITOR-20261009, versão em desenvolvimento. Homologação Contabo e publicação permanecem adiadas.


## Retorno da edição e vínculo com catálogo

ConceptMetricInput aceita retorno booleano do commit. Se o modelo rejeitar a alteração, restaura o valor real e informa que a medida foi mantida. Handlers de largura/altura/peitoril/posição e comprimento de parede retornam resultado; comprimento rejeitado por reconciliação não adiciona entrada vazia de histórico. Alterações efetivas de largura/altura via edição exata removem catalogProductId; reposicionamento ou medida idêntica preservam vínculo.

Arquivos: ConceptPlanner.tsx, ConceptMetricInput.tsx, ConceptMetricInput.test.tsx, conceptOpeningPlacement.ts, conceptOpeningExactEdit.test.ts. Verificação consolidada: 56 testes passaram em 13 arquivos; sintaxe TSX de Planner e MetricInput verificada isoladamente. Lote ARQ-EDITOR-20261009, versão em desenvolvimento. Build completo, inspeção integrada, homologação Contabo e publicação pendentes.


## Operações de paredes e restauração de histórico

Divisão e duplicação preservam o material da parede. Divisão extraída para operação pura preserva posição física, dimensões e metadados das aberturas, inclusive em diagonais; impede corte através de vão e trechos menores que 0,50 m. Exclusão remove acabamento e seleção da abertura excluída, sem criar histórico para ID inexistente. Restaurar snapshot limpa aviso de erro e interação pendente. Undo/redo agora executam restauração fora dos callbacks atualizadores de estado, evitando efeitos laterais dentro desses callbacks.

Arquivos: ConceptPlanner.tsx, conceptWallOperations.ts e conceptWallSplit.test.ts. Validação: 59 testes passaram em 14 arquivos; sintaxe de ConceptPlanner verificada com esbuild. Fluxo integrado de undo/redo ainda requer inspeção em homologação. Lote ARQ-EDITOR-20261009, versão em desenvolvimento; homologação Contabo e publicação adiadas.


## Coordenadas comuns das aberturas nas vistas

Removido clamp visual de offset entre 8% e 92% dos marcadores personalizados da planta e dos níveis do modelo 3D. Ambas derivações usam openingCoordinates com posição exata desde o extremo inicial, inclusive paredes no sentido inverso. Dados de lado de abertura, folhas, perfil, vidro, fabricante e vínculo de produto propagados ao nível 3D. Isso corrige coordenadas e propagação; não conclui recortes/malhas diagonais ou suporte completo a aberturas empilhadas no 3D.

Arquivos: ConceptPlanner.tsx, conceptOpeningCoordinates.ts e conceptOpeningCoordinates.test.ts. Validação consolidada: 62 testes passaram em 15 arquivos; sintaxe de Planner verificada isoladamente. Build completo e inspeção integrada pendentes. Lote ARQ-EDITOR-20261009, versão em desenvolvimento; homologação Contabo e publicação adiadas.


## Recorte comum de vãos no 3D — diagonais e aberturas empilhadas

ConceptModel3D (SVG) e ConceptWebGLScene (WebGL) usam splitWallVoids, com coordenada ao longo do eixo da parede e subtração de intervalos verticais. Implementado recorte em paredes diagonais/invertidas, aberturas empilhadas e união de aberturas sobrepostas sem duplicação dos sólidos. WebGL materializa trechos com caixas fechadas rotacionadas; SVG usa a projeção existente dos trechos. Esquadrias, caixilhos e montantes seguem direção da parede personalizada vinculada. Vínculo custom-wall impede abertura de parede vizinha e passagem de caminhada indevida. Fallback de espessura WebGL alinhado a 15 cm.

Arquivos: ConceptModel3D.tsx, ConceptWebGLScene.tsx, conceptWallVoids.ts e conceptWallVoids.test.ts. 68 testes passaram em 16 arquivos; sintaxe das duas cenas verificada com esbuild; helper tipado isoladamente com tsc. Não realizada inspeção WebGL real ou build completo. Não resolve união booleana entre paredes nem malha única contínua BIM. Lote ARQ-EDITOR-20261009, versão em desenvolvimento; homologação Contabo e publicação adiadas.


## Limites verticais e cruzamentos no 3D

openingVerticalBounds compartilha limites entre recorte e esquadria nas cenas SVG/WebGL. Esquadrias parcialmente acima da parede são representadas somente na faixa da parede; inteiramente acima ou inválidas não geram geometria. Dados do modelo preservados. Espessura de caixilho adapta-se a esquadrias pequenas e montantes não geram altura negativa. Maçaneta acompanha altura efetivamente representada. Marcadores legados sem vínculo custom-wall só recortam paredes compatíveis com sua orientação, evitando recorte perpendicular em cruzamentos.

Arquivos: ConceptModel3D.tsx, ConceptWebGLScene.tsx, conceptWallVoids.ts e conceptWallVoids.test.ts. 72 testes passaram em 16 arquivos; sintaxe TSX das cenas verificada isoladamente. Build completo, união booleana entre paredes e inspeção integrada pendentes. Lote ARQ-EDITOR-20261009, versão em desenvolvimento; homologação Contabo e publicação adiadas.


## Partição da união de volumes ortogonais

partitionOrthogonalWallSolids subtrai volumes já ocupados dos trechos seguintes após o recorte dos vãos. L, T, cruzamentos e paredes duplicadas ortogonais geram volumes sem sobreposição nas cenas SVG/WebGL. Materiais e IDs preservados por trecho; a primeira parede é proprietária do volume compartilhado. Fragmentos finos preservados sem engrossamento mínimo visual. Modelo editável original não modificado.

Limites: paredes diagonais permanecem no caminho anterior; não há união booleana geral de polígonos, remoção de faces internas nem malha única contínua BIM. Paredes inferidas da cena não participam da partição do conjunto explícito. Inspeção visual integrada e desempenho em projetos grandes pendentes.

Arquivos: ConceptModel3D.tsx, ConceptWebGLScene.tsx, conceptWallSolidUnion.ts e conceptWallSolidUnion.test.ts. 78 testes passaram em 17 arquivos; sintaxe TSX das cenas e tipagem isolada do helper verificadas. Lote ARQ-EDITOR-20261009, versão em desenvolvimento. Homologação Contabo e publicação adiadas.


## Superfícies externas da união ortogonal no WebGL

exposedWallFaces remove áreas compartilhadas entre faces adjacentes dos sólidos ortogonais particionados. ConceptWebGLScene substitui as caixas desses trechos por BufferGeometry triangulada das superfícies expostas, com UVs/normais e IDs/material mantidos. Vãos preservam seus revelos. Geometria editável original permanece intacta.

Limites: não cria malha única soldada, não resolve faces de uniões diagonais, e o SVG permanece com as projeções de caixas particionadas. Inspeção visual real, texturas, picking e desempenho em projetos grandes ainda pendentes.

Arquivos: ConceptWebGLScene.tsx, conceptWallSurfaces.ts e conceptWallSurfaces.test.ts. Verificação: 83 testes passaram em 18 arquivos, incluindo área externa de parede isolada, adjacência, cruzamento e revelos; sintaxe da cena e tipagem isolada do helper verificadas. Lote ARQ-EDITOR-20261009, versão em desenvolvimento; homologação Contabo e publicação adiadas.


### Faces externas na vista SVG 3D

A vista 3D alternativa reutiliza as faces expostas da união de paredes ortogonais, com descarte de faces voltadas para trás e ordenação dos trechos pela profundidade da câmera. Materiais, seleção e pintura continuam vinculados à parede original. Paredes diagonais mantêm a renderização anterior.

Validação: 83 testes em 18 arquivos passaram; transformação TSX do componente por esbuild passou. A conferência visual integrada, o build completo e a homologação/publicação não foram realizados neste lote.


### Colisão de caminhada consistente com os vãos

Passagens derivadas do recorte físico compartilhado de portas, incluindo vínculo à parede, orientação, diagonais e união de vãos sobrepostos. Sem ampliação artificial de portas estreitas; visitante de raio 24 cm e altura 1,70 m deve caber no vão. Janelas e portas baixas não liberam passagem. Todas as paredes de cruzamentos continuam verificadas.

Validação: 88 testes em 19 arquivos passaram; esbuild da cena e tipagem isolada do helper passaram. Navegação visual integrada e build completo pendentes. Homologação/publicação adiadas no lote ARQ-EDITOR-20261009, versão em desenvolvimento.


### Deslocamento e teclado da caminhada

Movimento subdividido em passos de no máximo 5 cm, verificando colisões ao longo do trajeto e permitindo deslizamento lateral. Evita o salto através de paredes em deslocamentos grandes nos cenários cobertos. Atalhos de caminhada ignoram campos editáveis e eventos já consumidos; perda de foco da janela limpa teclas, controles e arraste.

Validação: 92 testes em 19 arquivos passaram; transformação TSX da cena e tipagem isolada do helper passaram. Conferência visual integrada, build completo e homologação/publicação pendentes. Lote ARQ-EDITOR-20261009, versão em desenvolvimento.


### Velocidade e controles de toque

Caminhada baseada no tempo transcorrido, preservando a velocidade configurada equivalente a 60 fps; movimento diagonal normalizado e intervalo limitado a 100 ms após pausas. Botões de toque capturam o ponteiro, desativam gestos nativos e encerram a tecla ao perder a captura.

Validação: 95 testes em 19 arquivos passaram; sintaxe TSX verificada. Verificação em dispositivos reais, build completo e homologação/publicação pendentes. Lote ARQ-EDITOR-20261009, versão em desenvolvimento.


### Controles independentes e interrupção da caminhada

Teclado e botões de toque usam fontes independentes; cada ponteiro tem seu comando, evitando que a liberação de um toque cancele uma tecla física ou outro toque. Direções opostas se cancelam. Ocultar a aba, focar um campo editável, perder foco, trocar modo e reiniciar a câmera limpam os comandos de toque junto com o teclado.

Validação: 98 testes em 20 arquivos passaram; transformação TSX da cena passou. Teste integrado de teclado/toque em dispositivo real e build completo pendentes. Homologação/publicação permanecem adiadas. Lote ARQ-EDITOR-20261009, versão em desenvolvimento.


### Seleção protegida após gestos de câmera

Seleção/pintura WebGL restritas ao modo órbita e botão principal. Arrastes acima de 5 pixels, múltiplos ponteiros e gestos cancelados bloqueiam o clique subsequente, incluindo arraste que retorna à posição inicial. Eventos de liberação fora do canvas acompanhados; listeners removidos no encerramento da cena.

Validação: 102 testes em 21 arquivos passaram; transformação TSX da cena passou. Teste integrado dos gestos, build completo e homologação/publicação pendentes. Lote ARQ-EDITOR-20261009, versão em desenvolvimento.


### Proteção de gestos na vista SVG

Vista compatível reutiliza o rastreamento de gestos para bloquear clique após arraste, multitoque ou cancelamento, antes dos handlers de paredes, ambientes, aberturas e objetos. Pintura de objetos passa a ocorrer no clique validado, evitando dupla aplicação no pressionamento e na liberação. Arraste de objetos continua com seleção inicial para edição.

Validação: 102 testes em 21 arquivos passaram; transformação TSX do componente passou. Verificação integrada de SVG/WebGL, build completo e homologação/publicação pendentes. Lote ARQ-EDITOR-20261009, versão em desenvolvimento.


### Ferramenta de pintura atual e edição de objetos

Clique WebGL consulta ferramenta e callbacks atuais por referência, corrigindo captura dos valores iniciais na inicialização da cena. Gizmo de objeto desacoplado enquanto pintura está ativa. Vista SVG impede arraste de objetos em qualquer ferramenta de pintura e ignora seleção de alvos incompatíveis; clique no fundo preserva seleção durante pintura.

Validação: 102 testes existentes em 21 arquivos passaram; transformação TSX das duas cenas passou. Este conjunto não possui teste integrado de pintura/WebGL; conferência visual, build completo e homologação/publicação pendentes. Lote ARQ-EDITOR-20261009, versão em desenvolvimento.


### Transformação de objetos com dados atuais

Gizmo WebGL consulta dimensões atuais do lote e callbacks atuais de alteração/início/fim de edição, sem capturar valores iniciais da cena. Conversão de posição e rotação extraída para helper; snap de 5 cm limitado ao lote após arredondamento, evitando ultrapassar bordas fora da grade. Valores não finitos e dimensões não positivas rejeitados; objetos maiores que o lote mantêm origem não negativa, sem redimensionamento automático. Limites ainda usam largura/profundidade nominais, sem envelope rotacionado.

Validação: 106 testes em 22 arquivos passaram; transformação TSX da cena passou. Interação integrada do gizmo/histórico, build completo e homologação/publicação pendentes. Lote ARQ-EDITOR-20261009, versão em desenvolvimento.


### Limites de objetos rotacionados no gizmo

Commit do gizmo WebGL calcula envelope horizontal com largura/profundidade e ângulo final arredondado a 5 graus. Limita posição após snap usando esse envelope. Testes verificam quatro cantos em seis ângulos e borda no ângulo arredondado. Objetos que não cabem no envelope do terreno não são reduzidos; origem centralizada quando possível. Aviso para esse caso, padronização dos demais caminhos de edição/2D e colisões com ambientes permanecem pendentes.

Validação: 108 testes em 22 arquivos passaram; tipagem isolada do helper passou. Verificação visual integrada, build completo e homologação/publicação pendentes. Lote ARQ-EDITOR-20261009, versão em desenvolvimento.


### Limites compartilhados para objetos na vista compatível

Arraste, redimensionamento por alça, botões de escala e giro de 90 graus da vista SVG usam o envelope rotacionado compartilhado. Ao mover ou redimensionar, ângulo existente preservado sem snap angular adicional. Giro local envolve callbacks de início/fim de edição. Redimensionamento continua limitado às dimensões nominais do lote; objetos cujo envelope não cabe não são reduzidos automaticamente.

Validação: 109 testes em 22 arquivos passaram; transformação TSX da vista SVG passou. Interação integrada/histórico, edição 2D/painel, aviso de objeto que não cabe, build completo e homologação/publicação pendentes. Lote ARQ-EDITOR-20261009, versão em desenvolvimento.


### Limites rotacionados na atualização central de objetos

updateObjectById usa envelope rotacionado compartilhado nos caminhos de 2D/3D/painel que passam por esse handler. Coordenadas e ângulos preservados sem snap adicional; campos geométricos não finitos rejeitados. Alterações somente de material/produto preservam geometria sem recalcular posição/dimensões. Clamps dimensionais existentes mantidos; inserção, duplicação e outros setters diretos ainda não usam esse handler.

Validação: 111 testes em 22 arquivos passaram; transformação TSX do planner passou. Integração visual, build completo e homologação/publicação pendentes. Lote ARQ-EDITOR-20261009, versão em desenvolvimento.
