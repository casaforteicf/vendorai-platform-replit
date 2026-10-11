# Onda03 — integração de MOV/TER

Main fixada em 45acbf1dd946b9dca5183940208b3a064493659b; PR #3450 antes da integração em 9d37115e5cbe7f93259a5634ab36f684f68a9d2b. Conciliação por três árvores com ancestral 69a04a99382056fd8978d3e3e106f324bf0d6217: 71 alterações reaproveitadas, preservando arquivos concorrentes da main.

Único conflito: artifacts/api-server/src/routes/index.ts. git merge-file concluiu EXIT 0; diff contra main contém somente import arqdorPartnerLotsRouter e router.use(arqdorPartnerLotsRouter) na seção Arch Hub. Não removidas rotas concorrentes.

As correções anteriores de área/CSV e 97 testes do núcleo são preservadas. Isso não aprova o novo SHA. Pendentes build frontend completo, tsc launch-ci/esbuild backend, banco isolado/migrations, isolamento de tenant/projeto, homologação, backup e publicação. Não houve merge para main, migration ou deploy nesta operação.
