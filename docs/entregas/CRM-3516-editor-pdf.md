# CRM-3516 — acesso à impressão no editor v1

2026-10-15. Branch fix/orcamento-editor-pdf-20261015. Implementação 0fa645b40b3d3f103286a7205b5c229b5369630a.

Problema: editor estreito, conteúdo e ações cortados horizontalmente; falta de ação direta para salvar orçamento existente e abrir impressão.

Mudança: largura explícita de 96vw com máximo de 1600px, rodapé fixo dentro da rolagem com botões em grid responsivo e ação Salvar e abrir PDF para orçamento existente. A ação usa a validação e persistência existentes; navega a /propostas/:id/print apenas no sucesso da atualização e após invalidar caches. Não chama retorno ao lead nesse fluxo. Impressão e Salvar como PDF usam a página já existente.

Validação: git diff --check aprovado; build Vite local aprovado. Não houve teste de navegador autenticado. Typecheck global anterior apresenta erros e não é gate aprovado. Homologação Contabo, gates completos e publicação pendentes. Sem migrations, merge ou deploy. Não modificar orçamento apenas para verificar visualização.

Próximo passo: integrador registrar lote/SHA, validar em homologação e promover conforme fluxo autorizado. Acesso imediato ao orçamento mostrado: /propostas/a9526dab-eedb-4220-a1b4-9c75115bb9b9/print.
