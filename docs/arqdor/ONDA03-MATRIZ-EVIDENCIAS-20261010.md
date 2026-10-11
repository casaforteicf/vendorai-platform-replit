# Onda 03 — matriz de conciliação e evidências · v2026.10.11-wave03.2

Fonte: issue #3463, comentário 6103599907. 77 IDs preservados: ARQ 36 + MED 3 + REN 12 + MEP 12 + MOV 7 + TER 7. Não declara o lote concluído. Vínculos de PR são referências de investigação, não prova de atendimento integral.

## Evidências executadas

- #3443: 7 arquivos / 30 testes de geometria passaram no SHA adb6977ca32cde994c2dd1184b502bf2db9b7873.
- #3450: baseline c5bebbf19037d58dc704d8380cd77768d5678d87 tinha 5 falhas de 88 testes. Correções no commit 9d37115e5cbe7f93259a5634ab36f684f68a9d2b: área de polígono, CSV preservado e três expectativas corrigidas por cálculo dimensional independente. 26 arquivos / 97 testes passaram; typecheck estrito dos 25 módulos puros passou. Não é build de toda UI.
- #3454: 3 arquivos / 10 testes passaram no SHA 79c7532700c317fb2b086c8b3277135d39b8571d.
- #3426: 2 arquivos / 9 testes de grafo e host-impact passaram no SHA 121400d6b8abcf2218bedb192193e8f1949e993f. Migrations/banco/rotas não executados.
- ARQ-13: cobertura da main 69a04a99382056fd8978d3e3e106f324bf0d6217 trava com step=0 (timeout EXIT 124); proteção de passo/células/pavimento e limite de 250000 amostras adicionada. 2 arquivos / 15 testes passaram; typecheck estrito do módulo passou.

- #3422: baseline aa0a589ddd61938b538c62edae1ead4e7c63fb28 apresentou 7 erros por imports ausentes e uma expectativa com fixture incompleta. Correção dos testes no SHA 7a0028e013bd60fba21b487cde70c3fbf1a187ba: 70 testes Python passaram. Os 12 testes Node de arquivos privados passaram; não houve conversão real Blender/bpy ou validação integrada da API.
- Total: 243 testes focados aprovados. Este total não aprova build completo nem critérios de aceite dos 77 requisitos.

## Bloqueios comprovados

SSH direto à VPS retornou EXIT 255: Network is unreachable. Sem clone autenticado no terminal; cópias existentes parciais. Dispositivo Contabo online identificado, mas execução recusada por cota mensal do Desktop Commander: não repetir ou reconectar. Operador MCP aceita só lotes predefinidos, sem PR/SHA arbitrários. Falta execução de build completo do frontend/backend e homologação funcional. Ready-for-review disponível via GraphQL no conector, incompatível com protocolo REST. Não houve merge, migrations, deploy ou alteração de produção nesta execução. Último status observado: homolog/prod vendorai-api:main-69a04a9. Esta observação não valida funcionalidades da Onda 03.

## Matriz dos 77 requisitos

| ID | Requisito | Origem | Sublote | PRs / SHA | Evidência / próximo trabalho | Homologação | Produção |
|---|---|---|---|---|---|---|---|
| ARQ-01 | BIM único | verification_required | W03-ARQ | #3423 @ 1e44d11b4143; #3426 @ 121400d6b8ab | Conciliar editor, modelo salvo, IDs e instalação MEP; PRs não comprovam modelo único. | Não verificada | Não publicada |
| ARQ-02 | Acesso direto ao editor | code_in_pr | W03-ARQ | #3423 @ 1e44d11b4143 | Homologar acesso direto, tenant, persistência e abertura de projeto. | Não verificada | Não publicada |
| ARQ-03 | Planta 2D precisa | verification_required | W03-ARQ | #3423 @ 1e44d11b4143 | Homologar cotas, precisão, edição, mobile e persistência. | Não verificada | Não publicada |
| ARQ-04 | Sincronização 2D 3D fachada | verification_required | W03-ARQ | #3423 @ 1e44d11b4143; #3443 @ adb6977ca32c | Validar integração visual e sincronização do modelo após editar paredes e aberturas. | Não verificada | Não publicada |
| ARQ-05 | Espessura 15cm configurável | code_in_pr | W03-ARQ | #3438 @ d778918a3ed9; #3439 @ f1eee932a1a2 | Resolver conflito #3438 e aplicar cadeia #3439 antes do build completo. | Não verificada | Não publicada |
| ARQ-06 | Interseções ortogonais | code_in_pr | W03-ARQ | #3440 @ ac39530003e8; #3443 @ adb6977ca32c | 30 testes do núcleo #3443 passaram; cadeia e UI ainda pendentes. | Não verificada | Não publicada |
| ARQ-07 | Esquadrias paramétricas | verification_required | W03-ARQ | #3423 @ 1e44d11b4143 | Validar portas/janelas paramétricas, vínculo à parede e quadro. | Não verificada | Não publicada |
| ARQ-08 | Vãos geométricos reais | code_in_pr | W03-ARQ | #3441 @ 9e1d4234bbd6; #3442 @ 74fb8a011081; #3443 @ adb6977ca32c | 30 testes #3443 incluem vazio de porta; sincronização persistida/visual pendente. | Não verificada | Não publicada |
| ARQ-09 | Validador geométrico | code_in_pr | W03-ARQ | #3442 @ 74fb8a011081; #3443 @ adb6977ca32c | 30 testes #3443 cobrem órfãos e geometria; visual/fluxo real pendentes. | Não verificada | Não publicada |
| ARQ-10 | Malhas trianguladas | code_in_pr | W03-ARQ | #3443 @ adb6977ca32c | 30 testes do núcleo #3443 passaram; build frontend e UI pendentes. | Não verificada | Não publicada |
| ARQ-11 | Lajes paramétricas | verification_required | W03-ARQ | #3423 @ 1e44d11b4143 | Confirmar lajes editáveis e aberturas em escadas, não inferir da cobertura. | Não verificada | Não publicada |
| ARQ-12 | Escadas paramétricas | verification_required | W03-ARQ | #3423 @ 1e44d11b4143 | Confirmar geometria de escadas e vão da laje; evidência funcional ausente. | Não verificada | Não publicada |
| ARQ-13 | Coberturas paramétricas | verification_required | W03-ARQ |  #3466 @ 6b5c7b3038c4 | Travamento passo zero reproduzido (timeout EXIT 124); correção local/15 testes; build completo pendente. | Não verificada | Não publicada |
| ARQ-14 | Multiplos pavimentos | verification_required | W03-ARQ | #3423 @ 1e44d11b4143; #3443 @ adb6977ca32c | Testes de geometria cobrem pavimentos; persistência/edição integrada pendentes. | Não verificada | Não publicada |
| ARQ-15 | Posicionamento preciso | verification_required | W03-ARQ | #3423 @ 1e44d11b4143; #3450 @ 9d37115e5cbe | Validar medidas e movimento em 2D/3D com limites; suíte móveis 97 passou. | Não verificada | Não publicada |
| ARQ-16 | Biblioteca mobiliário | verification_required | W03-ARQ | #3450 @ 9d37115e5cbe | Núcleo de busca/templates de móveis testado; catálogo e UX integrada pendentes. | Não verificada | Não publicada |
| ARQ-17 | Circulação ergonomia | verification_required | W03-ARQ | #3450 @ 9d37115e5cbe | Clearances/AABB preliminares testados; regras de ergonomia reais pendentes. | Não verificada | Não publicada |
| ARQ-18 | Ventilação e iluminação | verification_required | W03-ARQ | #3423 @ 1e44d11b4143 | Sem comprovação funcional de dimensionamento de ventilação/iluminação. | Não verificada | Não publicada |
| ARQ-19 | Validações arquitetônicas | verification_required | W03-ARQ | #3423 @ 1e44d11b4143; #3450 @ 9d37115e5cbe | Validadores parciais; conferir regras arquitetônicas e casos funcionais. | Não verificada | Não publicada |
| ARQ-20 | Implantação no terreno | verification_required | W03-ARQ | #3450 @ 9d37115e5cbe | Domínio de lote existe em #3450; confirmar implantação do edifício real. | Não verificada | Não publicada |
| ARQ-21 | Plantas por IA | verification_required | W03-ARQ | #3423 @ 1e44d11b4143 | Identificar geração real e validar planta funcional com cotas antes de homologar. | Não verificada | Não publicada |
| ARQ-22 | Fachada fiel à planta | verification_required | W03-ARQ | #3423 @ 1e44d11b4143 | Verificar coerência entre fachadas, pavimentos e aberturas do modelo persistido. | Não verificada | Não publicada |
| ARQ-23 | Importação croqui planta | verification_required | W03-ARQ | #3423 @ 1e44d11b4143 | Normalizador de importação na main inspecionado; integração real não homologada. | Não verificada | Não publicada |
| ARQ-24 | Calibração C9 C10 C11 | verification_required | W03-ARQ | #3423 @ 1e44d11b4143; #3422 @ 7a0028e013bd | Validar C9/C10/C11 por arquivo, origem e escala; GLB calibração distinta. | Não verificada | Não publicada |
| ARQ-25 | Importação IFC DXF SKP | verification_required | W03-ARQ | #3450 @ 9d37115e5cbe; #3422 @ 7a0028e013bd | DXF de referência testado; confirmar IFC e SKP reais sem chamar referência de conversão. | Não verificada | Não publicada |
| ARQ-26 | Exportação IFC | verification_required | W03-ARQ | #3423 @ 1e44d11b4143 | Confirmar IFC WALL/DOOR/WINDOW e roundtrip por IDs e offsets. | Não verificada | Não publicada |
| ARQ-27 | Importação GLB | code_in_pr | W03-ARQ | #3422 @ 7a0028e013bd | PR #3422 exige armazenamento, autorização e importação/render real; build completo pendente. | Não verificada | Não publicada |
| ARQ-28 | Biblioteca plantas | verification_required | W03-ARQ | #3423 @ 1e44d11b4143 | Main tem extração de candidatos pre_project; gravação/deduplicação/biblioteca pendentes. | Não verificada | Não publicada |
| ARQ-29 | Biblioteca fachadas | verification_required | W03-ARQ | #3423 @ 1e44d11b4143 | Main tem candidatos facade; anonimização/gravação/UX pendentes. | Não verificada | Não publicada |
| ARQ-30 | Biblioteca projetos completos | verification_required | W03-ARQ | #3423 @ 1e44d11b4143 | Main tem complete_project; coerência entre documentos e biblioteca pendentes. | Não verificada | Não publicada |
| ARQ-31 | Quadro de esquadrias | verification_required | W03-ARQ | #3423 @ 1e44d11b4143 | Main pede quadro de esquadrias na extração; validar dimensões e rastreabilidade por página. | Não verificada | Não publicada |
| ARQ-32 | Quantitativos por ambiente | verification_required | W03-ARQ | #3423 @ 1e44d11b4143; #3450 @ 9d37115e5cbe | Quantitativos móveis testados; normalizador de importação parcial; cenários reais pendentes. | Não verificada | Não publicada |
| ARQ-33 | Orçamento arquitetônico | verification_required | W03-ARQ | #3447 @ 56b6ef558709; #3450 @ 9d37115e5cbe | Handoff preliminar de móveis testado; preços, proposta e integração orçamento pendentes. | Não verificada | Não publicada |
| ARQ-34 | Persistência e versões | verification_required | W03-ARQ | #3423 @ 1e44d11b4143; #3422 @ 7a0028e013bd | Confirmar versão persistida, permissões e concorrência; cópia local não prova. | Não verificada | Não publicada |
| ARQ-35 | Mobile caminhada | verification_required | W03-ARQ | #3423 @ 1e44d11b4143 | Homologar gestos mobile, caminhada, desempenho e precisão. | Não verificada | Não publicada |
| ARQ-36 | Projeto inteligente real | verification_required | W03-ARQ | #3423 @ 1e44d11b4143 | Decompor critério em geração, edição, materiais e orçamento; não inferir de protótipos. | Não verificada | Não publicada |
| MED-01 | Arqdor Measure: fotos com medidas manuais verificadas | approved_scope_unverified | W03-MED | #3450 @ 9d37115e5cbe | Checklist existente tem fotos no tipo mas não UI de captura; medição física-financeira não é Measure. | Não verificada | Não publicada |
| MED-02 | Comparação projeto versus medições de campo | approved_scope_unverified | W03-MED | #3450 @ 9d37115e5cbe | checkAsBuilt do #3450 testado; integrar ao checklist e ao projeto salvo, com autor/data/fotos. | Não verificada | Não publicada |
| MED-03 | Measure multi-vertical: móveis, esquadrias, pedra, vidro e obras | approved_scope_unverified | W03-MED | #3450 @ 9d37115e5cbe | Motor preliminar compartilhado; validar fluxos e especificações por vertical. | Não verificada | Não publicada |
| REN-01 | Fidelidade geométrica | verification_required | W03-REN | #3454 @ 79c7532700c3; #3422 @ 7a0028e013bd | 10 testes de render CPU passaram no #3454; não comprovam GPT Image 2, vídeo, consumo, biblioteca ou fidelidade em produção. | Não verificada | Não publicada |
| REN-02 | Motor GPT Image 2 | verification_required | W03-REN | #3454 @ 79c7532700c3; #3422 @ 7a0028e013bd | 10 testes de render CPU passaram no #3454; não comprovam GPT Image 2, vídeo, consumo, biblioteca ou fidelidade em produção. | Não verificada | Não publicada |
| REN-03 | Três imagens por ação | verification_required | W03-REN | #3454 @ 79c7532700c3; #3422 @ 7a0028e013bd | 10 testes de render CPU passaram no #3454; não comprovam GPT Image 2, vídeo, consumo, biblioteca ou fidelidade em produção. | Não verificada | Não publicada |
| REN-04 | Histórico render | verification_required | W03-REN | #3454 @ 79c7532700c3; #3422 @ 7a0028e013bd | 10 testes de render CPU passaram no #3454; não comprovam GPT Image 2, vídeo, consumo, biblioteca ou fidelidade em produção. | Não verificada | Não publicada |
| REN-05 | Melhoria sem distorção | verification_required | W03-REN | #3454 @ 79c7532700c3; #3422 @ 7a0028e013bd | 10 testes de render CPU passaram no #3454; não comprovam GPT Image 2, vídeo, consumo, biblioteca ou fidelidade em produção. | Não verificada | Não publicada |
| REN-06 | Troca materiais | verification_required | W03-REN | #3454 @ 79c7532700c3; #3422 @ 7a0028e013bd | 10 testes de render CPU passaram no #3454; não comprovam GPT Image 2, vídeo, consumo, biblioteca ou fidelidade em produção. | Não verificada | Não publicada |
| REN-07 | Luz natural LED | verification_required | W03-REN | #3454 @ 79c7532700c3; #3422 @ 7a0028e013bd | 10 testes de render CPU passaram no #3454; não comprovam GPT Image 2, vídeo, consumo, biblioteca ou fidelidade em produção. | Não verificada | Não publicada |
| REN-08 | Estilos arquitetônicos | verification_required | W03-REN | #3454 @ 79c7532700c3; #3422 @ 7a0028e013bd | 10 testes de render CPU passaram no #3454; não comprovam GPT Image 2, vídeo, consumo, biblioteca ou fidelidade em produção. | Não verificada | Não publicada |
| REN-09 | Layout Render Studio | verification_required | W03-REN | #3454 @ 79c7532700c3; #3422 @ 7a0028e013bd | 10 testes de render CPU passaram no #3454; não comprovam GPT Image 2, vídeo, consumo, biblioteca ou fidelidade em produção. | Não verificada | Não publicada |
| REN-10 | Vídeo de projeto | verification_required | W03-REN | #3454 @ 79c7532700c3; #3422 @ 7a0028e013bd | 10 testes de render CPU passaram no #3454; não comprovam GPT Image 2, vídeo, consumo, biblioteca ou fidelidade em produção. | Não verificada | Não publicada |
| REN-11 | Biblioteca automática | verification_required | W03-REN | #3454 @ 79c7532700c3; #3422 @ 7a0028e013bd | 10 testes de render CPU passaram no #3454; não comprovam GPT Image 2, vídeo, consumo, biblioteca ou fidelidade em produção. | Não verificada | Não publicada |
| REN-12 | Consumo e tentativas | verification_required | W03-REN | #3454 @ 79c7532700c3; #3422 @ 7a0028e013bd | 10 testes de render CPU passaram no #3454; não comprovam GPT Image 2, vídeo, consumo, biblioteca ou fidelidade em produção. | Não verificada | Não publicada |
| MEP-01 | Contrato BIM MEP | code_in_pr | W03-MEP | #3425 @ 7cff48563b4e; #3426 @ 121400d6b8ab | 9 testes de grafo/impacto de paredes passaram no #3426; rotas, migrations 565–569, banco isolado e UX pendentes. | Não verificada | Não publicada |
| MEP-02 | Redes nós e segmentos | code_in_pr | W03-MEP | #3425 @ 7cff48563b4e; #3426 @ 121400d6b8ab | 9 testes de grafo/impacto de paredes passaram no #3426; rotas, migrations 565–569, banco isolado e UX pendentes. | Não verificada | Não publicada |
| MEP-03 | Elétrica | verification_required | W03-MEP | #3425 @ 7cff48563b4e; #3426 @ 121400d6b8ab | 9 testes de grafo/impacto de paredes passaram no #3426; rotas, migrations 565–569, banco isolado e UX pendentes. | Não verificada | Não publicada |
| MEP-04 | Hidráulica | verification_required | W03-MEP | #3425 @ 7cff48563b4e; #3426 @ 121400d6b8ab | 9 testes de grafo/impacto de paredes passaram no #3426; rotas, migrations 565–569, banco isolado e UX pendentes. | Não verificada | Não publicada |
| MEP-05 | Esgoto pluvial | verification_required | W03-MEP | #3425 @ 7cff48563b4e; #3426 @ 121400d6b8ab | 9 testes de grafo/impacto de paredes passaram no #3426; rotas, migrations 565–569, banco isolado e UX pendentes. | Não verificada | Não publicada |
| MEP-06 | Climatização | verification_required | W03-MEP | #3425 @ 7cff48563b4e; #3426 @ 121400d6b8ab | 9 testes de grafo/impacto de paredes passaram no #3426; rotas, migrations 565–569, banco isolado e UX pendentes. | Não verificada | Não publicada |
| MEP-07 | Energia solar | verification_required | W03-MEP | #3425 @ 7cff48563b4e; #3426 @ 121400d6b8ab | 9 testes de grafo/impacto de paredes passaram no #3426; rotas, migrations 565–569, banco isolado e UX pendentes. | Não verificada | Não publicada |
| MEP-08 | Automação e cabeamento | verification_required | W03-MEP | #3425 @ 7cff48563b4e; #3426 @ 121400d6b8ab | 9 testes de grafo/impacto de paredes passaram no #3426; rotas, migrations 565–569, banco isolado e UX pendentes. | Não verificada | Não publicada |
| MEP-09 | Piso aquecido | verification_required | W03-MEP | #3425 @ 7cff48563b4e; #3426 @ 121400d6b8ab | 9 testes de grafo/impacto de paredes passaram no #3426; rotas, migrations 565–569, banco isolado e UX pendentes. | Não verificada | Não publicada |
| MEP-10 | Compatibilização MEP arquitetura | verification_required | W03-MEP | #3425 @ 7cff48563b4e; #3426 @ 121400d6b8ab | 9 testes de grafo/impacto de paredes passaram no #3426; rotas, migrations 565–569, banco isolado e UX pendentes. | Não verificada | Não publicada |
| MEP-11 | Quantitativos MEP | verification_required | W03-MEP | #3425 @ 7cff48563b4e; #3426 @ 121400d6b8ab | 9 testes de grafo/impacto de paredes passaram no #3426; rotas, migrations 565–569, banco isolado e UX pendentes. | Não verificada | Não publicada |
| MEP-12 | Memorial técnico | verification_required | W03-MEP | #3425 @ 7cff48563b4e; #3426 @ 121400d6b8ab | 9 testes de grafo/impacto de paredes passaram no #3426; rotas, migrations 565–569, banco isolado e UX pendentes. | Não verificada | Não publicada |
| MOV-01 | Modelagem paramétrica de móveis e componentes | verification_required | W03-MOV | #3450 @ 9d37115e5cbe | 97 testes do núcleo passaram após correção; UI, persistência, produção e build completo pendentes. | Não verificada | Não publicada |
| MOV-02 | Peças, chapas, fitas e plano de corte preliminar | verification_required | W03-MOV | #3450 @ 9d37115e5cbe | 97 testes do núcleo passaram após correção; UI, persistência, produção e build completo pendentes. | Não verificada | Não publicada |
| MOV-03 | Ferragens, portas e gavetas | verification_required | W03-MOV | #3450 @ 9d37115e5cbe | 97 testes do núcleo passaram após correção; UI, persistência, produção e build completo pendentes. | Não verificada | Não publicada |
| MOV-04 | Plano CNC e nesting industrial | verification_required | W03-MOV | #3450 @ 9d37115e5cbe | Nesting industrial/CNC não implementado pelo algoritmo preliminar; requer fabricação e homologação específicas. | Não verificada | Não publicada |
| MOV-05 | Orçamento automático de móveis | verification_required | W03-MOV | #3450 @ 9d37115e5cbe | 97 testes do núcleo passaram após correção; UI, persistência, produção e build completo pendentes. | Não verificada | Não publicada |
| MOV-06 | Produção e lista de compras | verification_required | W03-MOV | #3450 @ 9d37115e5cbe | 97 testes do núcleo passaram após correção; UI, persistência, produção e build completo pendentes. | Não verificada | Não publicada |
| MOV-07 | Visualização 3D de móveis | verification_required | W03-MOV | #3450 @ 9d37115e5cbe | 97 testes do núcleo passaram após correção; UI, persistência, produção e build completo pendentes. | Não verificada | Não publicada |
| TER-01 | Importação de terreno por mapas | verification_required | W03-TER | #3450 @ 9d37115e5cbe | Domínio de lotes e origem testado no núcleo #3450; portal, mapas, recuos, implantação e CRM integrados não comprovados. | Não verificada | Não publicada |
| TER-02 | Polígono e medidas reais do terreno | verification_required | W03-TER | #3450 @ 9d37115e5cbe | Domínio de lotes e origem testado no núcleo #3450; portal, mapas, recuos, implantação e CRM integrados não comprovados. | Não verificada | Não publicada |
| TER-03 | Portal de lotes de imobiliárias | verification_required | W03-TER | #3450 @ 9d37115e5cbe | Domínio de lotes e origem testado no núcleo #3450; portal, mapas, recuos, implantação e CRM integrados não comprovados. | Não verificada | Não publicada |
| TER-04 | Projete sua casa com lote predefinido | verification_required | W03-TER | #3450 @ 9d37115e5cbe | Domínio de lotes e origem testado no núcleo #3450; portal, mapas, recuos, implantação e CRM integrados não comprovados. | Não verificada | Não publicada |
| TER-05 | Recuos e regras do condomínio | verification_required | W03-TER | #3450 @ 9d37115e5cbe | Domínio de lotes e origem testado no núcleo #3450; portal, mapas, recuos, implantação e CRM integrados não comprovados. | Não verificada | Não publicada |
| TER-06 | Implantação automática no terreno | verification_required | W03-TER | #3450 @ 9d37115e5cbe | Domínio de lotes e origem testado no núcleo #3450; portal, mapas, recuos, implantação e CRM integrados não comprovados. | Não verificada | Não publicada |
| TER-07 | Vínculo do interessado ao CRM | verification_required | W03-TER | #3450 @ 9d37115e5cbe | Domínio de lotes e origem testado no núcleo #3450; portal, mapas, recuos, implantação e CRM integrados não comprovados. | Não verificada | Não publicada |

A matriz JSON adjacente contém arquivos candidatos e SHAs completos por requisito. Todos os estados permanecem verification_required até gates específicos; aprovação de escopo e testes de helpers não substituem produto integrado.

## Conciliação concorrente

A main avançou para d1219b301bf0777f0150e2f962f6e62d1b56103e durante a execução. A cobertura original permaneceu byte a byte igual; a branch incorpora essa main preservando todas as alterações concorrentes. PR desta correção: #3466. PR #3450 no commit 9d37115e5cbe7f93259a5634ab36f684f68a9d2b foi observado mergeable=true após esse avanço; isso não aprova build/homologação.

## Atualização de conciliação em 2026-10-11

Comparação REST de #3422 contra main observou base b7dadf23c8d763811c7b73aa2006588704371032: 322 commits à frente e 87 atrás, com ancestral bcec19c509754628e71b048a835b54cf7cf654da. Isso exige conciliação dos arquivos existentes; não é seguro substituir a main pela árvore desse PR. #3466 foi observado com mergeable=false após novos avanços concorrentes da main. Esses conflitos permanecem pendentes.

Os commits criados pelo conector têm autor/committer vendorai@appvendorai.com e trailer de coautoria marcosreisdorfer@gmail.com. A exigência de autor/committer nesse e-mail ainda precisa ser satisfeita antes da integração; coautoria não certifica a identidade do merge.
