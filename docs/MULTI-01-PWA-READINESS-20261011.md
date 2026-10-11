# MULTI-01 — Auditoria de instalação Vendor.ai (11/10/2026)

**Estado: auditoria estática iniciada; não homologado.** Vinculado às issues #2895, #2763, #3452 e à base integrada pelo PR #3453.

## Evidência atual do repositório
- `artifacts/frontend/index.html` contém `<link rel="manifest" href="/api/manifest.json">`.
- `artifacts/api-server/src/routes/manifest.ts` implementa o JSON de instalação (display standalone, nome/ícones configuráveis por hostname de tenant, ícone genérico da marca).
- **Risco de distribuição:** rota do manifest está no backend, enquanto frontend pode ser servido por Cloudflare Pages; confirmar se `/api/manifest.json` alcança o backend no ambiente real, com tipo MIME correto.
- **Risco offline:** a rotina de recuperação do `index.html` pode desregistrar todos os service workers e remover todos os caches do origin durante falhas de chunks. Não instalar um worker offline novo antes de projetar caches exclusivos e recuperação que preserve trabalho local.
- `artifacts/mobile/package.json` já contém **Expo 54, React Native, scripts android/ios**. Não recriar app mobile em paralelo. Presença de projeto **não comprova** app assinado/publicado em lojas.
- UI-01.8 (`projectContinuity.ts`) fornece contrato de continuidade/conflitos, **não** motor de armazenamento/sincronização offline.

## Gate de verificação automatizada
```bash
node artifacts/frontend/scripts/audit-install-readiness.mjs
```
Esse teste estrutural não acessa rede, não modifica arquivos e não conta como homologação de instalação.

## Próximas ações com ordem obrigatória
1. Validar resposta real e manifest por host `app.appvendorai.com` e por tenant.
2. Auditar logos: imagem maskable verdadeira, origem CORS, dimensões, aplicação da marca oficial sem modificar arquivo.
3. Verificar service worker existente/registrado, lifecycle, atualização e estratégia de invalidação. Resolver conflito com rotina de recuperação sem apagar projetos locais.
4. Criar instalação PWA sob feature flag, sem publicar antes da homologação em Windows, Android e iOS.
5. Projetar armazenamento local criptografado/autorizado, sincronização por versão, conflitos e migração; testar queda de rede e revogação de conta.
6. Aproveitar app Expo já existente para mobile; compilações e assinatura testadas separadamente; desktop Arqdor com implementação dedicada somente se PWA não cumprir edição 2D/3D offline.
7. Evidências por versão e SHA, testes, aprovação, release monitorado, rollback.

**Sem merge ou deploy de produção por esta auditoria.**


## MULTI-02 — Primeira implementação da oferta de instalação
- Criado `artifacts/frontend/src/components/layout/PwaInstallPrompt.tsx` e integrado ao `SidebarLayout.tsx` sob `VITE_MULTI02_PWA_INSTALL === "true"`. **Flag desativada por padrão**.
- Exibe botão **Instalar** apenas quando o navegador produz evento `beforeinstallprompt`; respeita cancelamento e `appinstalled`. Não simula suporte inexistente e não requer instalação.
- Não registra service worker, não grava dados privados e não promete funcionamento offline.
- A oferta exige teste em dispositivos e confirmação do manifesto no domínio servido. No iOS, que não oferece esse evento em versões usuais do Safari, permanece acesso web sem banner; fluxo orientado de instalação poderá ser tratado separadamente.
- Não habilitar flag antes dos gates de manifesto/ícones, navegação, contraste, interação por teclado e regressão em sessão real.
- **Não foi possível executar build/typecheck/testes neste ambiente de conector. PR permanece draft e sem merge.**


## MULTI-03 — Proteção de rascunhos locais do Arqdor (contrato)
- Novo `arqdorEncryptedDraft.ts`: serialização criptografada AES-GCM com IV aleatório e dados autenticados vinculando usuário, tenant, projeto, contexto e operação; valida versão base antes de preparar o rascunho.
- `arqdorEncryptedDraft.test.ts`: testes declarados de roundtrip, escopo, adulteração e revisão conflitante.
- **Limitações:** ainda não há persistência IndexedDB, geração/recuperação da chave entre sessões, UI Arqdor consumindo esse contrato, export de backup, sync online, upload, migração de schema ou homologação em dispositivo. Chave criptográfica deve ser injetada somente após autenticação e autorização do backend; sem chave, o rascunho é irrecuperável. Nunca armazenar chave em localStorage nem enviar em eventos/telemetria.
- **Gate de produção:** confirmar WebCrypto em navegador suportado, implementar retenção/revogação, tratar quotas e armazenamento cheio, fail-closed para troca de tenant/usuário e sincronização atômica com conflito.


## MULTI-03 — Cofre local de rascunhos (protótipo não integrado)
- Adicionado `artifacts/frontend/src/lib/arqdorLocalDrafts.ts`: operações explícitas `saveArqdorDraft`, `loadArqdorDraft` e `deleteArqdorDraft` usando IndexedDB com chave composta tenantId/userId/contextId/projectId e revisão base.
- Nenhuma chamada à API, sync automático, salvamento contínuo, cache HTTP ou alteração no fluxo atual do Arqdor. Sem habilitação em produção.
- O controle de permissões de acesso continua responsabilidade do servidor; **não chamar sem validação recente de sessão, tenant, contexto e vínculo de projeto**. Chave composta separa registros, mas **não é criptografia**: browser local pode ser acessado por quem usar o mesmo perfil de navegador. Não armazenar tokens ou dados sensíveis antes de implementar política de criptografia, retenção/limpeza e QA de privacidade.
- MULTI-03 ainda precisa: integração com editor, formato/versionamento de documento, cota/espaço cheio, recuperação após reinício, testes IndexedDB em navegadores, limpeza segura na revogação de acesso, testes de isolamento por tenant e salvamento sem perda.
- MULTI-04 ainda precisa: endpoint autenticado de revisão, idempotência e reconciliação de conflito (nunca sobrescrever automaticamente a revisão remota).
- O código foi commitado, **não compilado nem homologado** neste conector; PR continua draft.


## MULTI-04 — Pré-validação de sincronização (sem upload)
- `artifacts/frontend/src/lib/arqdorDraftReconciliation.ts`: gate determinístico por tenant, usuário, contexto, projeto, permissão de edição e revisão-base local vs. revisão remota.
- Resultados possíveis: `ready` (apenas pré-validação), `conflict` (preservar rascunho, exigir comparação), `denied` (não enviar).
- `arqdorDraftReconciliation.test.ts`: testes de revisão igual/diferente, autorização revogada, identificadores de escopo divergentes e revisão ausente.
- **Sem endpoint de upload, sem merge, sem processamento em segundo plano.** Para proteger projetos, implementação posterior do servidor deverá validar permissão novamente e aplicar gravação condicional atômica com revisão esperada (CAS), deduplicação por operação e histórico de conflitos. O frontend não pode autorizar alterações sozinho.
- MULTI-03 continua não integrado ao editor, e a política de criptografia/retenção dos rascunhos locais ainda precisa ser definida e implementada antes de gravar conteúdo real.
- Testes criados, mas não executados nem homologados neste ambiente. PR ainda draft; produção inalterada.


## MULTI-05 — Auditoria de release do aplicativo Expo
- Configuração real encontrada: Expo SDK 54, React Native 0.81, Expo Router, arquivo `app.json` com identificadores Android/iOS `com.appvendorai.vendorai`, `eas.json` com development/preview/production.
- Criado script somente leitura `node artifacts/mobile/scripts/audit-mobile-readiness.mjs`, que valida campos estruturais, assets, scripts de typecheck e perfis EAS.
- Bloqueios identificados: `artifacts/mobile/package.json` ainda usa variáveis REPLIT_* no script de desenvolvimento; build e assinatura em dispositivos não verificados; ícone deve usar original aprovado; permissões de microfone/notificações precisam de testes; draft IndexedDB web não é uma implementação nativa de persistência Expo.
- Não editar ou publicar pacote sem confirmação de capacidades, autenticação e isolamento entre tenants.
- Pendente: rodar auditoria e typecheck em ambiente com dependências; executar build EAS preview e testar login, sessão, Arqdor, câmera, notificações, logout e proteção dos dados nos aparelhos. Sem publicação em lojas.


## MULTI-05.1 — Execução local sem Replit
- Alterado `artifacts/mobile/package.json`: `dev` agora executa `expo start --localhost` sem `REPLIT_*`, `EXPO_PACKAGER_PROXY_URL`, `REACT_NATIVE_PACKAGER_HOSTNAME` ou `$PORT`. Adicionado `dev:lan` com `expo start --lan` para testes em celular na mesma rede e `audit:readiness` para a auditoria local.
- Comandos no workspace mobile: `pnpm dev` (localhost), `pnpm dev:lan` (LAN) e `pnpm audit:readiness`. O aplicativo ainda depende de variáveis próprias de configuração de API/autenticação que devem ser verificadas em execução; não foram inventadas nem alteradas.
- É apenas correção do script local; builds EAS, credenciais, status da API, testes Android/iOS e publicação permanecem sem validação. Nenhum merge/deploy efetuado.


## MULTI-05.2 — Testes automatizados da configuração Expo
- Adicionado `artifacts/mobile/scripts/mobile-readiness.test.mjs` com `node:test` e `node:assert`, sem nova dependência.
- Cobertura: identificadores de pacote Android/iOS; perfil EAS preview interno/APK; scripts livres de variáveis Replit; entrada Expo Router; disponibilidade de auditoria/typecheck; referência ao ícone original e plugin de armazenamento seguro.
- Acrescentado script `pnpm test:readiness` ao package mobile.
- Este teste garante apenas consistência **estática de configuração**; não valida build nativo, permissões em execução, API, login, segurança da sessão, isolamento dos tenants ou publicação. Executar `pnpm test:readiness && pnpm audit:readiness && pnpm typecheck` no workspace mobile e então builds preview Android/iOS em homologação. **Nenhuma execução comprovada nesta sessão.**


## MULTI-06.1 — Inspeção de recuperação e testes (não homologado)
- Criados testes `arqdorLocalDrafts.test.ts` para validar isolamento obrigatório, revisão e falha explícita sem IndexedDB.
- Criado coordenador **somente leitura** `arqdorDraftRecovery.ts`: recebe contexto remoto previamente autenticado, recusa permissão de edição ausente antes de acessar IndexedDB, carrega rascunho do escopo exato e classifica revisão igual/conflito. Não realiza escrita, upload, merge ou ativação do recurso.
- Testes `arqdorDraftRecovery.test.ts` cobrem acesso revogado, ausência de escopo, rascunho ausente e conflito.
- **Não representa conclusão de MULTI-03/04/05/06**: falta autorização fresca ligada ao editor verdadeiro; criptografia/retention e política de dados, salvamento real, endpoint de escrita atômica, monitoramento, build/typecheck e homologação de dispositivo.
- Execução local e CI ainda não comprovadas; PR continua draft e produção inalterada.


## MULTI-06.2 — Primeira integração efetiva com o workspace real
- Identificado fluxo real: `artifacts/frontend/src/modules/arqdor/workspace/WorkspaceContext.tsx` realiza PUT debounced em `/api/arqdor/projects/:id`; `ArqWorkspace.tsx` consome este contexto. Há também `useArqProject`, portanto não confundir os dois salvamentos.
- Corrigido bug preexistente: antes, qualquer resposta HTTP, inclusive erro, era tratada como sucesso; agora somente `response.ok` confirma gravação. Falhas de rede e HTTP geram `saveError` explicitamente; temporizador é limpo ao desmontar.
- Interface real ArqWorkspace agora exibe `saveError` em alerta, prevenindo falsa confiança de salvamento concluído.
- **Ainda NÃO conectado IndexedDB nem sincronização**: o PUT existente não foi alterado em formato ou condição de revisão. É indispensável conferir o endpoint e a política de revisões antes de habilitar envio offline. O novo erro exposto não garante salvamento local automático.
- Pendências de teste: typecheck e Vitest, rede intermitente, HTTP 401/403/409/500, projeto trocado durante debounce, autorização e QA funcional. PR draft, sem deploy.


## MULTI-06.3 — Proteção adicional no salvamento real
- O `WorkspaceContext` agora recusa o PUT se o token ou `ctx.id` estiverem ausentes, exibindo uma mensagem; evita requisições para projetos de identificação vazia.
- Novo teste estático executável: `node artifacts/frontend/scripts/test-arqdor-save-contract.mjs`, verificando tratamento obrigatório de HTTP != 2xx, alerta visível e ausência de upload offline implícito.
- A pesquisa de código não identificou com confiança a implementação backend específica de `PUT /api/arqdor/projects/:id`; **não implementar CAS nem envio offline presumindo semântica de revisões**. Precisa localizar a rota efetiva e validar seus controles de autorização e versão.
- Ainda não foram executados builds/testes neste ambiente do GitHub connector. PR permanece draft; sem merge/deploy.


## MULTI-04.2 — Endpoint real localizado e gravação condicional opcional
- O backend real fica em `artifacts/api-server/src/routes/arch.ts`, com `GET/PUT /arqdor/projects/:id` às linhas de origem aproximadas 8706/8728. O PUT existente faz upsert incondicional do JSON inteiro — risco de sobrescrever versões quando utilizado para sincronização offline.
- Adicionados `GET /arqdor/projects/:id/revision` e `PUT /arqdor/projects/:id/conditional`, autenticados e limitados a `tenantId(req)`. A gravação condicional exige `expectedRevision`, `contextBlob.id === :id`, atualiza apenas registro existente, usa `xmin::text` do PostgreSQL para CAS atômico, e devolve 409 se houve edição concorrente/registro ausente. Não muda o PUT legado e não é ativado automaticamente pelo editor.
- Teste estrutural: `node artifacts/api-server/scripts/test-arqdor-conditional-save.mjs` verifica presença das rotas, escopo tenant e guarda CAS sem upsert.
- **Revisão de segurança ainda necessária:** verificar autorização por papel/usuário dentro do tenant (não apenas autenticação tenant), política contra projetos do mesmo tenant sem permissão de edição, limite de payload, erros de banco e semântica de token MVCC após restaurar backups. O token `xmin` só é apropriado como revisão efêmera por linha; não serve de histórico durável. A rota não comprova integração com autosave, que permanece no PUT legado.
- **Status:** código commitado mas sem execução comprovada de typecheck/integração em PostgreSQL e sem publicação. Não permitir offline sync automático antes de homologar esses bloqueios.


## MULTI-04.3 — Cliente de envio condicional, sem ativação
- Corrigida regex do backend no `PUT /arqdor/projects/:id/conditional`: o token PostgreSQL `xmin` numérico é validado por `/^\\d+$/` (a versão anterior escapava a barra indevidamente).
- Criado `arqdorConditionalUpload.ts`: helper explícito (nenhum gatilho automático), exige token, compatibilidade de identidade/tenant/contexto/projeto/revisão, usa somente endpoint de atualização condicional e devolve estados `saved/conflict/denied/failed`. **Nunca exclui rascunho local** ao receber sucesso: a cópia precisa ser validada posteriormente.
- Criado `arqdorConditionalUpload.test.ts` cobrindo sessão/permissão, revisão divergente, conflito no servidor, sucesso e falha de rede.
- **Ainda bloqueado para uso final:** backend atualmente garante autenticação e escopo tenant, mas ainda não prova permissão de edição por usuário/projeto. O cliente recebe `canEdit` do chamador e isso não substitui autorização real do servidor. Exige política de acesso por projeto e testes com banco e múltiplos usuários antes de integrar ao editor ou habilitar o recurso.
- Sem CI ou build comprovados; PR draft, sem merge/deploy.


## MULTI-04.4 — Restrição fail-closed de permissão (intermediária)
- As duas novas rotas `GET /arqdor/projects/:id/revision` e `PUT /arqdor/projects/:id/conditional` receberam `requireRole("super_admin", "tenant_admin")`. Usuários comuns não podem acessar o recurso experimental enquanto não existe ACL de projeto comprovada. O PUT legado permanece intacto.
- Estendido teste de contrato para exigir explicitamente o middleware de papel em ambas as rotas.
- **Não resolve permissões individuais de projeto** nem permite sincronização offline geral: apenas reduz a superfície de acesso durante o desenvolvimento. Antes de liberar a todos os colaboradores, implementar vínculo de projeto/ACL real, garantir autorização por projeto e tenant, limites de corpo, integridade de versão e testes funcionais.
- Não houve compilação, execução de testes de integração, merge ou publicação nesta etapa.


## MULTI-04.5 — Restrições de identidade do piloto de sincronização
- Inspeção do modelo existente: `arqdor_workspace_projects` tem apenas ID, tenant, contextBlob e datas, **não possui proprietário ou tabela de membros de projeto**. O WorkspaceContext de apresentação mapeia papéis a permissões, mas esse mapeamento visual não representa autorização de projeto persistida no backend.
- Acrescentada regra `canUseArqdorConditionalSave` para as rotas experimentais: somente identidade humana com `sub` presente, tenant compatível, papel super_admin/tenant_admin e escopo normal `tenant` (ou campo legado ausente); acessos `obra`, `preprojeto` e agentes internos são negados.
- Expandido teste estático do endpoint. **Isto não é ACL individual por projeto.** Não liberar colaborador nem vincular o autosave antigo ao endpoint condicional sem modelagem de proprietário/membros com migração de banco, autorização por projeto e testes reais de transação.
- As alterações seguem em PR draft, sem build, homologação ou deploy confirmado.


## MULTI-07 — Modelagem de colaboradores por projeto (não ativada)
- Criado `lib/db/src/schema/arqdor_workspace_members.ts` com relação (tenant, projeto, usuário), perfis owner/editor/viewer, chave composta e índice por usuário. Depende de migração SQL e registro no export/schema do banco antes de operar; **nenhuma migração executada**.
- Criada política pura `artifacts/api-server/src/lib/arqdor-workspace-access.ts` que nega por padrão se não houver membro, escopo correto, usuário ativo, identidade humana e permissão owner/editor.
- Criados testes da política para owner/editor/viewer, divergência entre tenants/projetos/usuários, acesso convidado, IA, usuário inativo e ausência de vínculo.
- **Não integrado ao endpoint ainda:** requer criar/validar migration com FK composta para tenant+project, validar que o usuário pertence ao mesmo tenant no banco, definir provisionamento de dono dos projetos existentes e mecanismo de convite/revogação; conectar query de membership ao backend e eliminar qualquer fallback permissivo. Até lá, as rotas experimentais continuam restritas ao piloto administrativo.
- Sem build, migration, teste em banco, merge ou deploy; PR permanece draft.


## MULTI-07.1 — Migração SQL preparada sem aplicar
- Registrado export do esquema `arqdor_workspace_members` em `lib/db/src/schema/index.ts`.
- Criada migração aditiva `lib/db/migrations/024_arqdor_workspace_members.sql`, com FK composta (projeto, tenant), papel owner/editor/viewer, índice e trigger que exige usuário ativo e pertencente ao mesmo tenant.
- Por segurança, **não atribui proprietários automaticamente** em projetos históricos. A origem de cada projeto precisa ser confirmada antes do cadastro inicial dos membros.
- Teste estático `node artifacts/api-server/scripts/test-arqdor-membership-migration.mjs` criado; **não executado** nesta sessão. É preciso avaliar a sequência de migrações do banco atual, colisões de numeração e rodar testes em banco isolado, homologação e revisão da política de migração.
- A nova tabela **ainda não está conectada à API**; as rotas de sincronização seguem com restrição administrativa. Sem migração executada, merge ou deploy.


## MULTI-07.2 — Consulta real de membro, sem writes
- Criado `artifacts/api-server/src/lib/arqdor-workspace-membership.ts`, que consulta o projeto, a conta de usuário ativa e sua linha de membership, sempre delimitados por tenant. Não usa permissão visual no frontend como autorização.
- Adicionada rota autenticada `GET /arqdor/projects/:id/edit-access` sob flag **ARQDOR_PROJECT_ACL_ENABLED=true**, desligada por padrão. Retorna somente `projectId` e `canEdit`, nunca o contexto do projeto. Em erro de banco responde 503 e não concede acesso.
- Ampliado teste estático `test-arqdor-membership-migration.mjs` para garantir a flag e a consulta. Não houve execução de testes ou migração real.
- **Ainda não cria/revoga colaboradores**, e as rotas condicionais de gravação continuam restritas aos administradores. A próxima etapa deve definir provisionamento seguro de owner, revogação sem retirar último owner e validação de permissões dentro da mesma transação do UPDATE. Não habilitar a flag sem migração e testes isolados.


## MULTI-07.3 — Cadastro e revogação de membros, em piloto bloqueado
- Criado e montado `artifacts/api-server/src/routes/arqdor_workspace_members.ts` com GET `/arqdor/projects/:id/members`, PUT `/arqdor/projects/:id/members/:userId` e DELETE `/arqdor/projects/:id/members/:userId`. Flag `ARQDOR_PROJECT_ACL_ENABLED=true` obrigatória, desativada por padrão; rotas apenas para super_admin/tenant_admin humanos do tenant.
- PUT valida projeto no tenant, usuário ativo no mesmo tenant e só aceita `editor` ou `viewer`. Não atribui `owner`; não altera automaticamente proprietários históricos.
- DELETE não remove owners por condição SQL na própria exclusão; evita remoção por corrida da leitura. Atribuição/transferência de proprietário deverá ser um fluxo separado, auditável, com validação de proveniência.
- Teste estático `node artifacts/api-server/scripts/test-arqdor-members-routes.mjs` criado para verificar flag, mounting, validações e proteção de owner.
- **Importante:** estes endpoints pressupõem que a migração SQL 024 foi aplicada em um banco isolado/homologação; não estão disponíveis no ambiente atual. A sincronização condicional ainda usa restrição administrativa (não houve substituição por ACL). Faltam audit log, verificação transacional de membros nas próprias operações de gravação, proteção contra concorrência na atribuição de funções, testes reais de migração/SQL, typecheck, homologação e publicação controlada.
- Sem merge, sem deploy, sem migração no banco oficial; não reivindicar validação funcional.
