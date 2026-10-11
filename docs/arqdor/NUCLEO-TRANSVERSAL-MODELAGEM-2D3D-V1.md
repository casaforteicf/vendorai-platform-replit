# ARQDOR — NUCLEO TRANSVERSAL DE MODELAGEM 2D/3D — PROPOSTA V1.0

> Escopo: Pré-Projeto, arquitetura, interiores, mobiliário, terreno, documentação e engenharia.
> Registro de requisitos; não constitui implementação do motor.
> Branch de planejamento: feat/arqdor-lote13-furniture-core-20261010; PR #3450. Integrar futuramente a um lote próprio do motor Arqdor, não somente ao Lote 13.

## Princípios
- UMA geometria e árvore de objetos por projeto, compartilhada entre Pré-Projeto e demais módulos. Evitar duplicação ou cópias desconectadas das paredes, lajes, aberturas e ambientes.
- Geometria bruta e objetos semânticos (Wall, Slab, Door, Room, Furniture) são diferentes, mas ligados por IDs e revisões.
- Precisão determinística, com unidade base documentada; conversão clara m/mm e tolerâncias.
- Instâncias, grupos e componentes têm escopos de edição explícitos: editar esta instância, editar definição compartilhada ou tornar único.
- Ferramentas operam também com mouse/teclado e touch quando pertinente; undo/redo por transação; proteção contra geometria inválida.
- Reaproveitar recursos existentes de paredes, calibração, SketchUp, CAD, IF C e geração de pranchas antes de substituir implementações.

## Pacotes de desenvolvimento compartilhados
### MC.01 — Navegação e orientação
Órbita, pan, zoom cursor-centric, zoom extensão/seleção, projeção ortográfica/perspectiva, vistas superior/frontal/lateral/isométrica, cortes de visualização, controles mouse/touch e atalhos configuráveis.

### MC.02 — Desenho e inferência
Linha, retângulo, polígono, círculo, arco, curvas, borracha; autossnap pontos finais/médios, eixos, faces, interseções, paralelismo e perpendicularidade; face somente quando loop planar válido.

### MC.03 — Transformações
Mover, copiar, rotacionar, escalar, array linear/circular, espelhar, push/pull, offset, follow-path, booleanas em sólidos válidos; preview e rollback atômico.

### MC.04 — Precisão
Fita métrica, transferidor, cotas de trabalho, guias, caixa de medidas com entrada durante o comando, unidades m/cm/mm, ângulos, travamento de eixos, tolerância e mensagens de inconsistência.

### MC.05 — Organização
Grupos isolados, componentes vinculados, edição local e global, tags/camadas não destrutivas, hierarquia por projeto/pavimento/ambiente, busca, favoritos, ocultar/isolar/travar.

### MC.06 — Materiais e faces
Materiais e texturas orientáveis/escaláveis por face, transparência, cor e propriedades físicas separadas, edições por seleção; UV e múltiplas camadas de revestimento com quantitativo próprio.

### MC.07 — Arquitetura semântica
Converter contornos em paredes/lajes/ambientes, portas/janelas paramétricas vinculadas, interseções, espessuras, pé-direito, escadas, cobertura, aberturas. Alterações propagam impactos sem regravar revisões aprovadas.

### MC.08 — Terreno e contexto
Geolocalização e orientação norte configuráveis, importação autorizada de relevo/curvas de nível, TIN/grade, modelagem de terreno, limites do lote; dados geográficos com origem e precisão conhecidas. Não assumir disponibilidade livre de imagens satélite.

### MC.09 — Sol e sombras
Orientação, fuso, data/hora, norte verdadeiro, posição solar, sombras na cena e em vistas, análise de insolação com premissas documentadas.

### MC.10 — Componentes dinâmicos
Definições e instâncias, regras dimensionais, dependências, dimensões mínimas/máximas, recalculo determinístico, sugestão IA opcional e validação da fabricabilidade conforme especialidade.

### MC.11 — Documentação estilo LayOut
Folhas/pranchas parametrizadas, viewport vinculada a revisão, vistas ortográficas, cortes, elevações, cotas, legendas, escala, carimbo, índice e export PDF. Atualização consistente com diff entre revisões.

### MC.12 — Extensibilidade segura
API de extensões versionada e com escopos/permissões por tenant, contratos de geometria/comandos, isolamento e limites de recursos, auditoria, assinatura/revisão e catálogo curado. Não expor execução arbitrária de scripts na aplicação ou acesso irrestrito a dados.

### MC.13 — UX e confiabilidade
Autosave com controle de conflitos, recuperação de rascunhos, undo/redo, desempenho para modelos extensos (LOD, seleção espacial), feedback de comando, painel de atalhos, validação de geometria e telemetria técnica sem dados sensíveis.

## Integração com o Lote 13
O Lote 13 consome MC.01–MC.13 para produzir interiores e mobiliário. Mantém regras especializadas próprias: MDF/chapas/ferragens, fitas, etiquetas, planos de corte, pedras, vidros, metais, peças, fornecedores e cotações.
O ponto de entrada do Studio deve permitir 3 caminhos: selecionar um ambiente no Pré-Projeto com geometria vinculada; criar ambiente com paredes; importar referência/modelo. Todos são perspectivas sobre o MESMO grafo de objetos e revisões quando persistidos.

## Critérios mínimos de aceite por recurso
- Geometria de projeto existente continua disponível ao alternar Pré-Projeto e Interiores sem duplicação.
- Draw -> extrude -> offset -> hole/boolean -> apply material to one face -> save -> reopen mantém forma, material, IDs e medidas.
- Componente repetido suporta editar definição e tornar instância única com comportamento previsível.
- Snaps/cotas e valores digitados resistem a zoom, orbit e transformações.
- Terreno, geolocalização e sombras registram premissas e origem dos dados.
- Pranchas vinculadas indicam quando revisão está obsoleta.
- Plugins não burlam tenant/RBAC ou executam código irrestrito.
- Testes unitários, de integração e E2E devem ser executados e homologados antes de marcar funcionalidade pronta.

## Dependências e fases
Base primeiro: geometria e sistema de comandos, unidades, precisão, navegação e snapshots (MC.01–MC.05, MC.13).
Depois: arquitetura semântica e edição por face (MC.06–MC.07), documentação e componentes paramétricos (MC.10–MC.11).
Terceiro: terreno, geolocalização, sombras e API extensível (MC.08–MC.09, MC.12).
Disponibilidade real depende de levantamento do código existente e testes; este documento não comprova entrega operacional.
