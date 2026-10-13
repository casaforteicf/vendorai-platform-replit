# ARQDOR-FUNC-01 — Matriz de alinhamento funcional e UX Studio 2.0
Data: 2026-10-11. Status: auditoria de requisitos; NÃO representa funcionalidades homologadas.

## Regras inegociáveis
- Preservar dados, APIs, permissões, autoria, histórico e versões ao aplicar nova interface. Nada de deploy em produção sem homologação.
- Fonte da verdade de versão de render: arch_ai_renders; não criar segunda tabela. Versionamento imutável, parentRenderId, operationType, approvedBy/At.
- Fidelidade arquitetônica > fotorrealismo > estética; nada de alterações silenciosas de geometria.
- Respeitar tenants e RBAC, logs, autosave, recuperação de erros, concorrência entre abas; operações não disponíveis não devem parecer funcionais.
- Biblioteca única: materiais/texturas e produtos/itens comercializáveis com modelos reutilizáveis e origem preservada.
- UI oficial: docs/arqdor-studio-2-design-system.md prevalece sobre docs/arqdor-ui-reference.md e padrões antigos roxo/laranja.

## Matriz por módulo e critérios de aceitação
### 01 Shell e início
- Navegação própria Arqdor: projetos, Concept, Render, Measure, Biblioteca, móveis, especificação/orçamento; esconder ferramentas não autorizadas por perfil.
- Compacto, dark grafite/verde, painel esquerdo recolhível, painel direito contextual, viewport predominante e barra inferior específica ao módulo.
- Retomar projeto/cena/ferramenta, estados loading/erro/sem acesso e responsivo; teclado e touch.
- Validar nenhum vazamento de estilos para CRM e demais módulos.

### 02 Concept (2D/BIM/3D)
- Desenhar paredes e interseções T/cruzamento com nós editáveis e cotas, edição wall-first por pavimento.
- Aberturas vinculadas (portas/janelas paramétricas), escadas e vazios de laje, cobertura paramétrica; snapping, bloqueios, undo/redo.
- 2D pan/zoom, 3D órbita/zoom, níveis múltiplos, câmeras; fachada fiel às aberturas da planta.
- Importar fotos/croquis/planta IFC, escala/calibração, terreno/implantação; export IFC e SketchUp conforme suporte verificado.
- Biblioteca de móveis, materiais e objetos, prevenção de perda de alteração; não declarar ferramenta pronta sem teste.

### 03 Render / Studio IA
- Presets de câmera, ambientes, luz natural/artificial LED, HDRI conforme suporte real; edição de materiais com roughness, reflexos, transparência, escala.
- Gerar 3 imagens por ação (quando fluxo suportar); requestId idempotente e falha sem consumo indevido; prompt negativo anti-distorção.
- Seleção por máscaras e ajustes localizados; geometria bloqueada salvo autorização explícita; comparador antes/depois.
- Versões e aprovação persistidas em arch_ai_renders, histórico/galeria e Biblioteca de Mídias; ligação Concept → Render → Especificação.
- Vídeo, render físico/ray tracing e preview CPU devem exibir estágio real de implementação, sem confundir protótipo com qualidade V-Ray.

### 04 Measure
- Fotos com cotas e medições manuais verificadas, paredes, aberturas, obstáculos, instalações e acabamentos; unidades explícitas.
- Importar/comparar com projeto, desvios e tolerâncias, histórico/revisões, checklist, vínculo a orçamento e execução.
- Resiliência offline e conflitos entre abas/dispositivos devem ter testes, não só interface.

### 05 Biblioteca Universal / móveis
- Ao importar projeto, extrair modelos de planta/fachada/projeto com origem, revisão e metadados; preservar direitos e acesso por tenant.
- Catálogo de materiais/texturas separado de produtos/itens, filtros técnicos e pré-visualização, vínculos com fornecedores.
- Móveis planejados paramétricos, módulos, medidas, ferragens, materiais, validações e integração a Measure e orçamento.

### 06 Especificação / Orçamento
- Quantitativos por ambiente/elemento, paredes/revestimentos/instalações/esquadrias, composição/custo, cotações multi-fornecedor.
- Versões, materiais vinculados, fases e itens parciais, propostas, cronograma e execução vinculada ao negócio.
- UI técnica de tabela com linhas densas, colunas configuráveis, ações contextuais, sem transformar em dashboard de CRM.

### 07 QA e rastreabilidade
- Auditar para cada botão: componente/arquivo, endpoint, contrato, permissões, estados vazios/erros, persistência, teste, homologação.
- Inventário de telas acessíveis por perfil; testes keyboard/touch/mobile, fluxos completos, contraste e regressão.
- Registrar status: funcional comprovado, parcial, protótipo, pendente, bloqueado, motivo, responsável, evidência.
- Publicar PR e evidências; merge/deploy somente pelo processo de homologação controlado.

## Achados verificados no código/documentação
- docs/arqdor-ui-reference.md mantém cores laranja e superfícies claras legadas; histórico, NÃO fonte visual vigente.
- .agents/memory/arqdor-render-studio-layout.md descreve IDE dark com roxo; revisar overrides e consolidar tokens.
- artifacts/frontend/src/modules/arqdor/theme/ArqdorThemedShell.tsx ainda tem hero title/card genérico; revisar shell sem regressões.
- docs/arqdor-render-version-contract.md estabelece arch_ai_renders e aprovação persistente.
- docs/arqdor-render-cpu-preview.md e docs/arqdor-render-worker-v06.md documentam protótipo isolado, não renderer físico completo.
- Próximo trabalho obrigatório: mapear entradas reais e executar build/QA; este documento é plano verificável e não atesta funcionalidade final.
