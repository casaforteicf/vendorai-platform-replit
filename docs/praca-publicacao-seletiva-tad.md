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
