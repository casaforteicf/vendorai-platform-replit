# Praça.ai — publicação seletiva e categorias com anúncios ativos

## Regra funcional aprovada
- Praça.ai é o marketplace único de produtos e serviços do ecossistema TAD.
- Produto ou serviço pode ser originado de qualquer módulo autorizado, sem criar um marketplace no Arqdor.
- Publicação é opt-in individual ou por seleção em lote; criar um item não o publica.
- Cada anúncio requer categoria correta da taxonomia Praça.ai, e subcategoria quando aplicável.
- Categoria/subcategoria pública só aparece com pelo menos um anúncio publicado, ativo, elegível e aprovado.
- Ocultar a categoria no site nunca remove sua definição ou cadastros no administrativo.
- Ao retirar o último anúncio elegível, categoria deixa a navegação pública; ao aprovar novo anúncio, reaparece.
- Escopo multi-tenant, permissão, moderação e privacidade são validados no servidor.
- Fonte do cadastro continua no módulo original; o marketplace não duplica o estoque financeiro ou projeto.

## Contratos parciais nesta branch
Funções puras em `artifacts/frontend/src/lib/marketplaceCasaCatalog.ts`: `isPublicCasaListing`, `visibleCasaCategories`, `visibleCasaSubcategories`.
Testes unitários em `artifacts/frontend/src/lib/marketplaceCasaCatalog.test.ts`.

## Pendências da integração real
1. Conectar os modelos atuais de produtos/serviços às tabelas de anúncios existentes, com seleção explícita.
2. Definir taxonomia compartilhada em API e migração versionada (caso necessária), sem criar cadastro concorrente.
3. Aplicar filtro de elegibilidade e agregação no backend público, não somente no frontend.
4. Conferir autorização do tenant, titularidade, revisão, disponibilidade e imagens antes de indexação pública.
5. Criar a UI de publicação individual/múltipla nos cadastros dos módulos pertinentes.
6. Remover rotas/menus de marketplace do Arqdor, preservando referências de materiais e fornecedores necessárias ao projeto.
7. Executar lint, typecheck, build, testes de isolamento e E2E; homologar antes de PR/merge/deploy.

Nenhum recurso real é ativado por esta entrega isolada.

## Auditoria do esquema existente
- `produtos_catalogo.vende_no_praca_ai_produto` já é nullable e representa escolha específica do item.
- `produtos_catalogo.vende_no_arqdor` é outro campo, e não deve disparar publicação no Praça.ai.
- Serviços usam `vendeNoPracaAi` no catálogo de tipos.
- `arch_marketplace_items` continua ligado ao mecanismo do Arqdor; não assumir que é a vitrine pública Praça.ai.
- `Marketplace.tsx` exporta `MarketplaceV2`, que administra templates de segmento, não a vitrine pública Praça.ai.
- Adapter de leitura `projectPracaSourceItem` adicionado para explicitar opt-in; backend e interface ainda não integrados.

## Lote 04 — serviços
- Confirmada a opção `vendeNoPracaAi` já presente em `servicos_tipos` e na tela `ServicosCadastros`.
- As rotas de criação e alteração de serviço rejeitam opt-in com categoria em branco ou serviço desativado, mantendo o isolamento tenant.
- Não foi criada nova vitrine ou categoria pública: a ocultação de categorias vazias ainda precisa da API efetiva do Praça.ai.
- Pendência: taxonomia global canônica de serviços (categorias atuais são livres), revisão de aprovação/moderação, validação integral do payload de serviços e teste de integração.

## Lote 05 — árvore de categorias públicas
- Criado `artifacts/api-server/src/lib/pracaPublicTaxonomy.ts` com projeção independente de banco para contagem de anúncios elegíveis, incluindo ascendentes na navegação.
- Categorias irmãs vazias, categorias inativas/não aprovadas, ancestrais inválidos e ciclos não entram na navegação.
- Testes de unidade em `pracaPublicTaxonomy.test.ts` ainda não executados.
- NÃO existe endpoint público integrado a esta função ainda. Requer descoberta/implantação da consulta canônica de anúncios (produtos + serviços) sem expor dados internos.

## Lote 06 — contrato de vitrine pública
- `artifacts/api-server/src/lib/pracaPublicCatalog.ts` projeta cards públicos sanitizados a partir de anúncios de produtos e serviços **já aprovados**.
- Pesquisa por texto, tipo e categoria descendente; devolve somente campos públicos.
- `pracaPublicCatalog.test.ts` contém testes ainda não executados.
- NÃO está ligado a rota HTTP, frontend, provedor de dados nem moderação persistida. Não confundir essa projeção com publicação real.
- Próxima integração: identificar a tabela canônica de anúncios Praça.ai e sua taxonomia validada, implementar consulta pública server-side, paginação e painel de anunciantes, sem duplicar o mecanismo do Arqdor.

## Lote 07 — adapters de leitura das fontes reais
- `pracaSourceAdapters.ts` integra os campos concretos de `produtos_catalogo` e `servicos_tipos` aos contratos de vitrine, sem mutação nem migração.
- `vendeNoPracaAi` é autorização de intenção, não prova de moderação; falta vínculo com aprovação e categoria canônica pública.
- `pracaSourceAdapters.test.ts` documenta os casos de segurança, ainda não executados.
- Sem rota pública montada: os adapters exigem um registro canônico de aprovação ainda não identificado. Publicar usando apenas o flag seria inseguro.
- Próximo lote exige conexão à fonte validada de anúncios e exposição do endpoint com paginação e checagem de permissões.

## TAD — primeira tela de uso (não ativada)
- Criado `artifacts/frontend/src/pages/TadCentral.tsx` com buscador, agrupamento, cards e navegação por serviço.
- Usa `authorizedLauncherModules`: somente interseção das permissões e habilitações validadas pelo servidor.
- Onde a rota não foi auditada, exibe "Em integração" e não cria navegação falsa.
- Praça.ai aparece como serviço único, não como marketplace interno do Arqdor.
- Pendente: endpoint de permissões efetivas por usuário, confirmação das rotas, montagem no App, preferências e gates completos.

## TAD — entrada integrada na aplicação (ainda não ativada em produção)
- Rota autenticada `/tad` montada em `AppLegacy.tsx` na branch.
- `TadCentralRoute` busca módulos habilitados do tenant com Bearer token, aborta requisições ao sair, limpa estado ao mudar de tenant e falha fechado em erros.
- Importante: `nav-modules` NÃO prova permissão efetiva do usuário. Portanto `permittedModules=[]` intencionalmente bloqueia links até integração de endpoint de permissões efetivas. A tela ainda não pode servir de launcher funcional.
- Não altera a página padrão nem o pós-login. Próximo passo é auditar autorização por usuário e conectar entitlements ao seletor.

## TAD — tela de prévia segura
- A página mostra cards informativos dos módulos habilitados para o tenant, mesmo quando não existe permissão individual verificada; todos ficam sem links nesse estado.
- Não confunde exibição de serviços com liberação de acesso; módulos não habilitados seguem ocultos.
- A navegação só ocorre quando houver habilitação, permissão efetiva e rota auditada.
- O fluxo principal do aplicativo continua inalterado e a tela não é redirecionamento pós-login.

## Lote 08 — inventário privado de preparação
- Endpoint autenticado `GET /api/tenants/:tenantId/praca-ai/preparacao`, sujeito aos guards globais e ao escopo do tenant.
- Lista somente itens com opt-in explícito, com sinal de preparação para revisão (não equivale a anúncio aprovado/publicado).
- Não fornece dados confidenciais de clientes, custos ou projetos. Não ativa vitrine pública.
- Serviços ainda precisam mapear texto livre de categoria para taxonomia oficial Praça.ai.
- Pendente executar build/testes e confirmar tabelas/colunas em homologação; API pública e aprovação continuam bloqueadas.

## Lote 09 — painel privado de preparação
- Componente React PracaAdsPreparationPanel integrado à tela de Catálogo de Produtos.
- Consulta a API interna de preparação sob autenticação, sem ações de publicação.
- Exibe itens selecionados, revisão e erros; não afirma que anúncios estão publicados.
- Ainda pendente painel completo independente dentro da TAD, moderação real, ligação à taxonomia pública, compilação e homologação.

## TAD — correção de renderização e condição de acesso
- Corrigida inicialização de `canOpen` antes da composição do card, evitando erro de referência na renderização da tela.
- Cards só recebem link caso o módulo esteja na interseção de habilitação e permissão verificada e possua rota.
- O endpoint de autorização individual ainda está pendente; não remover `permittedModules=[]` sem integrar uma fonte de permissão efetiva confiável.

## TAD — separação da navegação por ambientes (lote inicial)
- A Agenda global foi retirada do dropdown `CRM & Atendimento` e se torna uma entrada independente na navegação legada, respeitando os filtros originais de visibilidade por empresa, vertical e usuário.
- CRM conserva leads, negócios, empresas, pipelines, prospector, conversas e operações comerciais específicas; Arqdor, Marketing, ERP, IA e Administração já tinham grupos distintos no menu legado.
- O próximo passo é aplicar shells por ambiente da TAD, sem remover nem desativar as rotas legadas e sem quebrar atalhos históricos.
- Pendência de QA: compilar, confirmar que Agenda não duplica e auditar permissões efetivas antes de alterar pós-login.

## TAD — entrada após login (branch, NÃO publicada)
- Login normal com usuário autenticado redireciona para `/tad`; contas `partner` mantêm `/partner`.
- Hosts de homologação retornam por padrão à `/tad`, preservando caminhos específicos válidos de retorno.
- `/tad` usa `FullscreenProtectedRoute` para evitar o menu CRM ao selecionar serviços.
- Sidebar legado ganha entrada `Voltar à TAD Central`, preservando as rotas existentes.
- O domínio app.appvendorai.com só mudará após homologação, merge e deploy autorizados. O launcher ainda precisa de permissão individual integrada para liberar links; não declarar pronto.

## TAD — verificação individual
- Endpoint autenticado `tad-effective-modules` checa usuário e tenant, devolve somente mapeamentos auditados ou módulos para administradores; exige autorização comercial/habilitação do tenant separadamente.
- Frontend consulta as duas fontes e faz interseção. Falhas bloqueiam novas permissões.
- Módulos com rotas `null` não são clicáveis; subsistemas sem equivalência de grants confirmada permanecem conservadores.
- Essa alteração precisa de build e testes de integração antes da publicação.
