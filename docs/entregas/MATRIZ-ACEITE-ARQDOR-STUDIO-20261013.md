# Matriz de aceite — Arqdor Studio 2.0 (F03)

Data 13/10/2026. Referências oficiais: [design system](../arqdor-studio-2-design-system.md), [auditoria funcional](../arqdor-studio-2-functional-audit.md), PR [#3507](https://github.com/casaforteicf/vendorai-platform-replit/pull/3507) (mergeado) e drafts [#3503](https://github.com/casaforteicf/vendorai-platform-replit/pull/3503)/[#3504](https://github.com/casaforteicf/vendorai-platform-replit/pull/3504). **Requisitos rastreados ≠ comprovadamente funcionais.** Sem QA navegador ou Contabo nesta rodada.

## Critérios transversais

Tokens aprovados: canvas `#171F22`, surface `#20282A`, panel `#263034`, elevated `#303A3D`, border `#3A4649`, texto `#EEF2EF`, muted `#AAB8B5`, accent `#176D59`, hover `#21856C`, seleção `#4AC59A`. Inter / IBM Plex Sans. Menus 12px, comandos 11–12px, parâmetros 11px, painéis 13px; acessibilidade prevalece. Header 52px, ferramentas 156/56px, propriedades 300px, base 154–184px, tudo responsivo. Logo original sem alteração. Não contam como aceite apenas tokens, estilos importados ou um protótipo.

| ID | Área / requisito | Evidência consultada | Teste observável exigido | Prioridade |
|---|---|---|---|---|
| F03-L01-R01 | Shell único Arqdor dark grafite, verde moderado, tipografia técnica | Tokens/componentes referidos no #3507; **parcial** | Capturas lado a lado com mockup aprovado, CSS computado em telas reais | P1 |
| F03-L01-R02 | Topo compacto com projeto, módulo, sincronização, histórico, ajuda | Não homologado | Abrir projeto e trocar módulos sem perder estado ou permissões | P1 |
| F03-L01-R03 | Ferramentas à esquerda compactas e recolhíveis | Não homologado | Expandir/recolher e restaurar último layout, teclas/touch | P1 |
| F03-L01-R04 | Viewport central dominante, sem cards de CRM | Não homologado | Conferir proporções, zoom, edições e sem sobreposição em tamanhos de tela | P1 |
| F03-L01-R05 | Propriedades contextuais à direita | Não homologado | Selecionar elementos; mudar controles e refletir no objeto persistido | P1 |
| F03-L01-R06 | Faixa inferior de cenas, versões, pavimentos, histórico | Não homologado | Trocar e recuperar estado por contexto, redimensionar sem perda | P1 |
| F03-L02-R01 | Arqdor Projeto (legado Concept) migrado ao layout | Migração parcial #3503/#3507 | Fluxo de desenho 2D/3D, propriedades e cotas sem controles inertes | P1 |
| F03-L02-R02 | Render Studio migrado ao layout | Migração parcial #3504/#3507 | Cena, câmera, materiais, luz, geração real e persistência de versões | P1 |
| F03-L02-R03 | Measure: foto, anotações, medições e propriedades | Sem aceite verificável | Foto com cotas; medidas salvas/reabertas e painel técnico | P1 |
| F03-L02-R04 | Biblioteca: filtros técnicos, materiais, produtos, reutilização | Sem aceite verificável | Buscar, aplicar, salvar, restringir por tenant e reutilizar | P1 |
| F03-L02-R05 | Mobiliário: catálogo e edição paramétrica | Sem aceite verificável | Inserir peça, mudar dimensões/ferragens, salvar/reabrir | P1 |
| F03-L02-R06 | Especificação e orçamento: interface técnica densa | SmartSpec em #3507; sem aceite visual | Linhas/colunas, materiais e orçamento real, sem aparência CRM | P1 |
| F03-L02-R07 | Studio IA: controles e estados operacionais honestos | Sem aceite verificável | Fluxos reais e indisponibilidades explicitadas | P2 |
| F03-L03-R01 | Persistência de seleção, autosave, histórico, undo/redo | Sem aceite transversal | Reabrir projeto e restaurar layout, seleção/revisão conforme regras | P1 |
| F03-L03-R02 | Permissões RBAC e isolamento por tenant | Sem aceite transversal | Perfis distintos/tenants distintos não veem ferramentas ou dados indevidos | P1 |
| F03-L03-R03 | Estados loading/erro/vazio e ações não implementadas | Sem aceite transversal | Nenhum botão falso; falhas e progresso claros e recuperáveis | P1 |
| F03-L03-R04 | Navegação teclado, foco, contraste, touch | Sem QA documentada nesta rodada | Testar desktop e 360/390/412px, leitores/foco/atalhos | P1 |
| F03-L03-R05 | Escopo de CSS sem vazamento CRM/TAD | Componentes escopados declarados #3507; não testado | Screenshot e CSS computado dentro/fora Arqdor | P1 |
| F03-L03-R06 | Comparação visual aprovada e regressão E2E | Sem execução nesta rodada | Screenshots desktop/mobile e Playwright no SHA homologado | P1 |
| F03-L03-R07 | Histórico e contratos preservados | Documento funcional lista `arch_ai_renders` | Conferir versões/IDs, dados legados e navegação sem mutação destrutiva | P1 |

## Ordem de execução

1. Comparar `main` (integração #3507) com #3503 e #3504 **por arquivos/componentes**, evitando sobrescrever tokens já publicados.
2. Concluir primeiro shell e viewport compartilhados, depois migração por módulo com critérios funcionais, sem telas de fachada.
3. Testar acessibilidade, responsividade, permissões e regressões; registrar mockup e screenshots autorizados.
4. Manter elementos incompletos dormentes até homologação, não confundir PR mergeado com release funcional.

**20 requisitos catalogados; 0 homologados por esta auditoria documental.** Percentuais não apurados; owners a designar. Nenhuma alteração em UI/código de produção.
