# CRM V4-01 — Lote Único de Validações

Data: 2026-10-09
Branch: `feat/crm-lote-v4-relacionamentos`
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3428
Escopo: cadastro de casal, Pessoa/Empresa/Negócio, contato principal, deduplicação, isolamento multi-tenant, histórico e compatibilidade legado.
Responsável: agente CRM; validação Contabo/deploy sob fluxo oficial coordenado com agente de infraestrutura.

## Resultado do trabalho nesta sessão

**Revisão estática realizada via leitura de arquivos da branch. Não equivale a testes automatizados ou homologação.**

| Validação | Resultado nesta sessão | Evidência / pendência |
|---|---|---|
| Localizar telas e API integradas | Inspeção estática realizada | `NewLeadDialog.tsx`, `DealParticipantsCard.tsx`, `LeadQuickEditButton.tsx`, `crm_deal_participants.ts` |
| Fluxo casal Cliente 1/Cliente 2 | Inspeção estática realizada | Campos e vínculo individual presentes; testar CPF distintos, sem/com empresa |
| Contato principal | Inspeção estática realizada | `isPrimary`, bloqueio transacional por negócio e opção UI; testar 2 sessões concorrentes |
| Exclusão lógica / reativação | Inspeção estática realizada | `inactive`, histórico e filtros na API; testar serialização e idempotência |
| Histórico legado | Inspeção estática realizada | `legacy_existing` com `at:null`; verificar registros antigos reais |
| Dados pessoais | Inspeção estática realizada | Nome, documento, nascimento, contato; testar edição e proteção de vínculo inativo |
| Deduplicação | Inspeção estática realizada | Código evita merge só por telefone; testar CPF igual, contatos compartilhados e colisões |
| Isolamento por tenant | Inspeção estática realizada, **sem aprovação de segurança** | Guards presentes; executar testes de usuário com permissões diferentes e cadastro mestre compartilhado |
| Parse/compilação TypeScript | **Não executada** | Sem checkout/dependências executáveis nesta sessão |
| Build backend `node ./build.mjs` | **Não executado** | Executar em `artifacts/api-server` no ambiente isolado Contabo |
| Homologação Contabo | **Adiada por decisão do usuário** | Última tentativa via Vendi: `VENDI_HOMOLOG_AUTH_EXCHANGE_FAILED:401:upstream_token_rejected` |
| Merge/aprovação/release | **Não realizado** | Requer fluxo oficial após evidências |
| Produção | **Não alterada por este lote** | Sem merge/deploy solicitado |

## Matriz única de testes executáveis na Contabo quando liberada

1. Instalação: `pnpm install --no-frozen-lockfile` no workspace.
2. Em `artifacts/api-server`: `../../node_modules/.bin/tsc -p tsconfig.launch-ci.json --noEmit`; guardar stdout/stderr, exit code, timestamp e SHA.
3. Em `artifacts/api-server`: `node ./build.mjs`; guardar stdout/stderr, exit code, timestamp e SHA.
4. Cadastro PF sem empresa; cadastro PJ com contatos; cadastro casal com CPF diferentes; casal com empresa sem converter consumidores em contatos permanentes.
5. Pessoa já existente, CPF duplicado, nomes iguais com telefone compartilhado e correção de dado pessoal.
6. Contato principal único, editar preferência, desvincular, reativar, dois usuários alterando simultaneamente.
7. Pessoas/empresas em tenants diferentes: consultas, vínculos por id, perfil compartilhado, usuário sem permissão sobre lead/deal.
8. Histórico de vínculo: novo, legado sem metadados, edição, desvinculação idempotente e reativação simultânea.
9. Regressão: lead com representante, empresa sem lead, vínculo legado sem `createdTenantId`, relacionamento permanente vs. contextual.
10. Homologação no ambiente isolado, coleta de evidências, aprovação e só então eventual procedimento controlado de publicação.

## Riscos de integração pendentes de validação real

- Atualização de perfil seguida de atualização do vínculo é feita em duas requisições HTTP; possível sucesso parcial se a segunda falhar.
- Alterações em cadastro mestre global exigem revisão aprofundada de autorização e compartilhamento entre tenants.
- Empresas sem lead deixam de autorizar acesso a contatos pelo caminho revisado; compatibilidade operacional precisa de verificação.
- Sem execução de TypeScript/esbuild não existe evidência de compilação do PR.
- Homologação e publicação explicitamente adiadas, sem execução automática em segundo plano.

## Evidência operacional

Este relatório corresponde a inspeção estática de código remoto e planejamento de execução consolidada. **Nenhum teste de runtime nem operação de homologação foi concluído nesta sessão.**

## Correção incremental após revisão — 09/10/2026
- Commit `5b988b0`: na edição de participante, a interface grava primeiro o vínculo do negócio e somente depois altera o perfil mestre. Erro de vínculo já não deixa edição pessoal isolada; erro de perfil após vínculo exibe aviso explícito de sucesso parcial e atualiza cache dos participantes.
- **Não é operação atômica:** continuam duas requisições HTTP. Uma implementação transacional de API permanece como melhoria futura, sujeita a desenho de autorização de perfil global e testes.
- **Status da verificação:** inspeção estática do diff, sem build ou testes de integração. Homologação e publicação adiadas por determinação do usuário.

## Continuação da revisão de persistência — 09/10/2026
- Commit `c73d54b`: a edição do perfil passa a validar vínculo ativo, ausência de relacionamentos de outros tenants, CPF e atualização do cadastro mestre dentro de transação com o mesmo bloqueio consultivo por tenant e negócio empregado nas alterações dos envolvidos.
- **Limite importante:** esta mudança torna atômica a validação/gravação dentro da rota de perfil, mas NÃO torna atômicas as duas requisições da interface (`POST` do vínculo seguido de `PATCH` do perfil). A operação combinada permanece pendente de um endpoint único e testes de integração.
- Revisão textual do código concluída; sem execução de TypeScript, build ou homologação Contabo. Produção sem publicação neste lote.

## Operação única de edição de participante — 09/10/2026
- `66f603e`: criada rota `PATCH /crm/deals/:dealId/people/:personId` para vínculo **já existente**, com Zod, autorização do negócio, conferência de vínculo ativo, autorização global do cadastro mestre, duplicidade de documento e empresa contextual.
- A rota executa atualização de **perfil e vínculo na mesma transação** Drizzle, com bloqueio por tenant/negócio e erro revertendo ambas as alterações.
- `0d57a28`: a tela `DealParticipantsCard` usa apenas esse PATCH quando o usuário edita um participante; adição de novo participante continua via POST tradicional.
- **Escopo real:** a atomicidade vale para edição de participante existente por essa interface. Cadastro de pessoa nova, vínculo permanente a empresa e outras telas ainda precisam de revisão específica.
- **Sem comprovação de execução:** TypeScript, build, testes e homologação não executados nesta sessão. Homologação e publicação adiadas. Produção não alterada.

## Cadastro novo e vínculo permanente — 09/10/2026
- Commit `355d2aa`: `POST /crm/deals/:dealId/people` reúne a criação de nova pessoa mestre, vinculação ao negócio e registro de contato corporativo permanente na mesma transação Drizzle, protegida por bloqueio consultivo de tenant/negócio.
- Em caso de falha em qualquer etapa transacional, a operação inteira deve reverter, evitando cadastro mestre órfão ou vínculo sem contato permanente.
- Limites: verificações prévias de vínculo de pessoa existente ocorrem antes da transação; outros endpoints, como `POST /crm/people` usado em criação de lead/casal, não foram convertidos nesta alteração.
- Evidência: revisão do arquivo remoto após commit; sem TypeScript/build, testes concorrentes ou homologação executados. Homologação Contabo e publicação seguem adiadas e produção inalterada.

## Lote casal — criação conjunta em transação (09/10/2026)
- `a4b977f`: nova rota `POST /crm/deals/:dealId/couple` cria Cliente 1 e Cliente 2 com seus vínculos na mesma transação. Verifica autorização do negócio, documentos distintos, colisões de CPF/contato e empresa contextual; identifica ambos como consumidores finais e somente Cliente 1 como contato principal.
- `92218be`: a tela `NewLeadDialog` chama essa operação quando existe negócio inicial e o cadastro é do tipo casal. Evita duas criações de pessoa em chamadas separadas nesse caso.
- **Escopo e limites:** criação do lead e do negócio ainda ocorre antes; vínculo separado da empresa com o negócio continua sendo chamada posterior, podendo falhar após o casal já ter sido salvo. O caminho excepcional de cadastro sem negócio permanece usando solicitações separadas.
- **Validação pendente:** TypeScript, build backend, testes reais de falha na segunda criação/concorrência/CPF/empresa contextual, homologação. Nada publicado e homologação Contabo permanece adiada.

## Casal + vínculo empresarial na mesma transação — 09/10/2026
- `9a1d47e`: `POST /crm/deals/:dealId/couple` vincula também a empresa contextual ao negócio dentro da mesma transação que cria os dois consumidores finais. Mantém histórico do vínculo empresarial e reativa relação preexistente se for o caso.
- `50e6043`: `NewLeadDialog` não executa mais um segundo POST independente para empresa após a operação do casal.
- Limite residual: a criação anterior do lead, do negócio e da empresa mestre ainda ocorre por operações separadas, fora da transação do casal. Fluxo ponta a ponta **não** é integralmente atômico.
- Estado: código alterado e registro atualizado; sem compilação, testes em execução ou homologação. Contabo/Vendi e publicação permanecem adiados.

## Falha parcial no cadastro inicial do lead — 09/10/2026
- `86b81f1`: `NewLeadDialog` passa a registrar o ID do lead e negócio após sua criação; se uma etapa posterior falhar, a interface deixa de afirmar que tudo falhou, comunica que **o lead já foi criado**, atualiza listas e abre o registro existente para revisão, reduzindo risco de duplicação por novo envio.
- Essa alteração é mitigação de UX e recuperação, **não** constitui transação única de criação de lead, negócio e empresa. Para essa atomicidade é preciso consolidar serviços de criação existentes no backend, preservando todas as regras de distribuição, cupom, origem e automações.
- Evidência: commit em branch, sem build/teste runtime. Homologação Contabo e publicação adiadas; produção sem alterações.

## Prevenção de duplo envio no cadastro inicial — 09/10/2026
- `412d8f3`: bloqueio síncrono por `useRef` no `NewLeadDialog` impede submissões simultâneas da mesma instância do formulário; `finally` libera o bloqueio inclusive nos fluxos de erro e de lead parcialmente criado.
- **Limite de segurança:** não oferece idempotência entre sessões, navegadores ou requisições distintas. O backend de criação de lead deve receber um identificador de idempotência, respeitando as regras atuais, antes de classificar o fluxo ponta a ponta como seguro contra duplicidade.
- **Validação:** revisão estática e commit na branch, sem build nem teste em execução. Homologação Contabo e publicação seguem adiadas por decisão do usuário.

## Lote consolidado — 11 pendências (execução de 09/10/2026)

A atualização abaixo cobre **código registrado e testes escritos**, não resultados de testes executados. Sem deploy, merge ou homologação.

| Nº | Item | Mudança / evidência | Estágio real |
|---|---|---|---|
| 1 | Idempotência backend entre sessões | `a1bf152`, `5b60f1c`, `c59483c`, `d968220`: chave por tenant, usuário e hash do payload, com lock transacional; UI envia chave `2b3c0f6` | Implementado em branch; runtime pendente |
| 2 | Lead + negócio + empresa | `d38f7f4` torna lead+negócio automático transacionais; `9af33ae` torna empresa mestre+tenant transacionais; integração completa em operação única **ainda não existe** | Parcial |
| 3 | Recuperação sem duplicação | Tratamento de falha parcial `86b81f1`; replay de lead com chave; replay de casal `db9a620` e UI `52e128e` | Parcial; regressão pendente |
| 4 | Compatibilidade de legados | Tratamento de `legacy_existing`, guarda de origem e história; utilitário testável `ec21385` | Parcial; dados reais não inspecionados |
| 5 | Segurança multi-tenant | Filtros de vínculos ativos e negócios visíveis; controle de perfil global. Risco de cadastro mestre compartilhado exige revisão com testes autenticados | Parcial; não aprovado como seguro |
| 6 | Testes funcionais | Foram escritos os testes unitários `f51a483` e `fb7e890` (10 cenários de utilitários); ainda faltam integrações de casal, representante, vínculos e UX | Testes escritos, **não executados** |
| 7 | Concorrência/rollback | Locks e transações para lead, casal, vínculos e empresa; plano de teste abaixo | Testes concorrentes **não executados** |
| 8 | TypeScript/build backend e frontend | Comandos documentados abaixo | **Não executado** |
| 9 | UX e regressões | Avisos de falha parcial e bloqueio de duplo envio; fluxo de casal atualizado | Parcial; teste visual pendente |
| 10 | Homologação Contabo | Aguardando liberação posterior por decisão do usuário; Vendi com autenticação 401 documentada | **Adiada** |
| 11 | Aprovação / merge / deploy | Nenhuma promoção solicitada ou executada pelo lote | **Não iniciado** |

### Validação técnica futura, sem GitHub Actions obrigatório

Com checkout da branch no ambiente isolado Contabo e dependências instaladas:

```bash
pnpm install --no-frozen-lockfile
cd artifacts/api-server
../../node_modules/.bin/tsc -p tsconfig.launch-ci.json --noEmit
pnpm exec vitest run src/lib/crm-lead-idempotency.test.ts src/lib/crm-relationship-history.test.ts
node ./build.mjs
cd ../frontend
pnpm run typecheck
pnpm run build
```

Registrar para cada comando: SHA testado, ambiente, horário, exit code, log e artefato. **Nenhum comando acima foi executado nesta sessão.**

### Validações de integração não substituídas pelos testes unitários

- Cliente 1 e Cliente 2 com CPFs distintos, contatos compartilhados e repetição de solicitação; falha injetada após primeira inserção e verificação de rollback.
- Duas sessões simultâneas com mesma chave de lead; chave igual com payload diferente ou autor diferente; verificar retorno 200 do cadastro original e inexistência de segundo lead/negócio.
- Lead + auto-deal: falha intencional na criação do deal deve reverter lead; conferir ausência de reserva/comissão/atividade gerada para rollback.
- Criação de empresa já existente no master global e associação em tenants diferentes; falha na associação ao tenant deve reverter a empresa recém-criada.
- Desvinculação e reativação concorrentes; apenas um contato principal, histórico sequencial, relações inativas não visíveis.
- Usuários com permissões diferentes no mesmo tenant; não revelar perfil pessoal por documento, ID ou contato de empresa sem lead visível.
- Cadastro legado sem `createdTenantId` ou `relationshipHistory` e casal com empresa; garantir que nenhum tenant seja atribuído retroativamente sem evidência.
- Regressão visual: tela de cadastro, recuperação após falha, representação comercial, envolvidos e orçamento inicial.

### Ressalva sobre atomicidade ponta a ponta

Não considerar item 2 encerrado: o fluxo de criação de lead ainda invoca serviços de empresa, pessoas, envolvidos e tarefas em requisições posteriores, apesar de transações internas implantadas em vários subfluxos. É necessário consolidar serviços do backend, sem replicar regras de atribuição, campanhas, automações e deduplicação.

## Continuação Lote 2 — 10/10/2026: exclusão e duplicidades

- Commit de código: `fb33aedc2ad4d22f4acb8e8150fd17140eff80c3`.
- Arquivo: `artifacts/api-server/src/routes/leads.ts`.
- Exclusão administrativa retorna conflito 409 para lead já excluído; UPDATE condicional com `isNull(excluidoEm)` impede sobrescrita de auditoria por exclusões simultâneas.
- Lista de duplicidades não oferece como similar um lead excluído.
- Mesclagem rejeita origem/destino excluídos; dispensa de duplicidade rejeita lead excluído e atualização concorrente.
- Evidência efetiva: commit aceito pelo GitHub. Não houve execução de teste, build, integração, homologação Contabo, merge ou publicação.
- Pendência importante: verificar todas as consultas de pipelines e trajetórias de movimentação de deals; não declarar exclusão totalmente validada. O merge de duplicatas ainda possui deleção física do registro de origem, que precisa de revisão para preservar a política de soft delete, sem quebrar as relações existentes.
- Próximas etapas: corrigir movimentações/responsáveis, tarefas por etapa, múltiplos negócios e execução parcial, com testes e evidências por alteração.

## Lote 2 — Continuação de 10/10/2026: pipelines, tarefas e responsabilidades

| Commit | Arquivo | Alteração real |
|---|---|---|
| `5d15cfb` | `routes/deals.ts` | Não criar negócio nem transferir/editar negócio de lead excluído; validação de tenant preservada |
| `d38afe7` | `routes/activities.ts` | Excluir tarefas ligadas a leads excluídos das listas operacionais, preservando os registros |
| `7d25032` | `routes/activities.ts` | Impedir criação manual de atividade para lead logicamente excluído |
| `7e1aebb` | `routes/deals.ts` | Reatribuição de negócio reservada a administrador, com validação de usuário ativo no tenant |

**Situação efetiva:** código salvo na branch do PR #3428. Nenhum comando de TypeScript, teste, build, homologação ou publicação foi executado nesta continuação; não classificar as correções como homologadas.

**Funcionalidades reaproveitadas:** `ensureCommercialStageTasks` e `ensureRelationshipStageTasks` já executam tarefas configuráveis por etapa; `POST /deals` já admite vários negócios por lead; `return-to-qualified` já implementa devolução de orçamento com motivo e atividade. Não criar serviços paralelos.

**Pendências reais antes da conclusão do lote:** validar todas as pipelines e endpoints de exclusão (incluindo mesclagem física de duplicatas); revisar operações concorrentes em movimentações de negócio e atividades; completar UX e modelo de execução parcial por itens/quantidades com vínculos a orçamento; executar testes unitários e integração multi-tenant; build e homologação Contabo isolada; registrar evidências e regressão. Nenhum merge/deploy autorizado.

## Continuação 10/10/2026 — execução parcial por negócio/proposta

- `f4f1450`: autorização em transferência de pipelines; reatribuição de proprietário exige administrador e vendedor/entrega não pode transferir negócio de outro responsável.
- `6d5790e`: API `POST /deals/:id/execution-batches` adicionada. Recebe proposta aceita, etapa de execução e lista de índices dos itens com quantidades; cria card de execução independente na pipeline com vínculo ao lead, negócio e proposta original.
- O orçamento original é preservado (snapshot comercial); informações do lote ficam em `work_cards.metadata` (`propostaId`, `itensLote`, `loteParcial`), com quantidades e referências de etapa/fase.
- A criação usa `pg_advisory_xact_lock` dentro de transação para serializar lotes sobre a mesma proposta, ler quantidades anteriormente enviadas e impedir o excedente. Não permite repetição de índice no mesmo lote, operação para lead excluído, proposta não aceita ou fora do tenant.
- **Evidência:** commits gravados no PR, inspeção estática da arquitetura. **Não executados:** TypeScript, build, testes automatizados, integração autenticada, concorrência real e homologação Contabo.
- **Integração pendente:** interface para seleção de itens/grupos/ambientes/fases e quantidades; consulta de saldo por proposta; política formal de cancelamento/devolução de saldo; idempotência de solicitações repetidas; evitar corrida com edição simultânea da proposta; validar compatibilidade do tipo `workCardsTable.metadata`; normalizar estrutura em migração se volume exigir.
- **Status:** execução parcial implementada **no backend em estágio inicial**, não pronta para homologação ou produção sem testes e fechamento das pendências.

## Continuação 10/10/2026 — interface e saldos de execução parcial

- `32cc0f3`: adicionada API `GET /deals/:id/execution-batches?propostaId=...` retornando lotes vinculados e saldo por item; isolamento por tenant, negócio e proposta.
- `e6045ce`: novo componente `PartialExecutionDialog.tsx`, que lista propostas aceitas do negócio, consulta etapas de execução e saldos, permite quantidades parciais e justificativa, cria lote e recarrega os saldos.
- `fe3e276`: botão "Enviar itens para execução" conectado no editor de negócio quando etapa for `ganho` ou `em_execucao`.
- **Validação de commit:** arquivos salvos no GitHub. **Pendente:** inspeção TSX/build, provas de regressão, testes autenticados e UI real; nenhum merge nem deploy efetuado.
- **Riscos conhecidos:** possíveis simultaneidades com alteração da proposta, retry sem chave idempotente e política de cancelar lote; contemplar casos de quantidade fracionária, grupos e fases e notificação de envio. Não considerar a conclusão do Lote 2 nem dar uso em produção antes da homologação.

## Continuação 10/10/2026 — idempotência dos lotes

- `64f89a4`: `POST /deals/:id/execution-batches` recebe `requestId` UUID obrigatório, faz busca de replay sob advisory lock e valida hash do payload mais autor antes de devolver o lote existente. Novo lote: HTTP 201; replay do mesmo payload: HTTP 200; colisão com payload/autor diferente: conflito 409.
- `50b993e`: leitura do lote reutilizado passou a selecionar o ID na mesma consulta transacional.
- `883bcef`: componente da interface gera UUID por submissão, reutiliza em retentativa e reinicia ao modificar campos ou após sucesso.
- Pendências: ainda requer teste simultâneo real, teste de replay, de usuário diferente, de mudança de proposta/itens durante criação, TypeScript/build, homologação. Na base de dados, a chave está em JSON de metadata, protegida pelo lock transacional; avaliar índice dedicado em lote futuro após prova de carga.
- Status: **implementado em código, sem runtime validado e sem publicação**.

## Continuação 10/10/2026 — precisão, contrato comercial e regressão

- `21f558d` implementou funções comuns `quantityUnits`, `remainingQuantity` e `canAllocateQuantity` em `src/lib/crm-partial-execution.ts` para cálculo em unidades inteiras de 1/10000, evitando erros de soma de ponto flutuante.
- `6e37579` passou a usar os helpers na validação do POST e no GET de saldos, com no máximo quatro casas decimais por seleção.
- `38c42d3` acrescentou cenários Vitest para saldo residual, excedente, frações, precisão inválida e histórico excedido. **Testes escritos, não executados**.
- `707f472` exige o negócio em `ganho` ou `em_execucao` antes do envio e relê a proposta aceita dentro da transação após obter o lock para detectar alterações de status/itens.
- Os lotes continuam contando no saldo mesmo que um card seja cancelado: **não liberar quantidades automaticamente** sem fluxo explícito de cancelamento/reversão e trilha de auditoria. Implementar reversão posteriormente.
- Antes da homologação, executar `pnpm exec vitest run src/lib/crm-partial-execution.test.ts`, `tsc -p tsconfig.launch-ci.json --noEmit`, build e testes autenticados de perfis/tenants/replay/concorrência. Sem testes reais ou deploy nesta rodada.

## 10/10/2026 — histórico de lotes e ponto de controle

- `6a8d481`: cria registro histórico da formação de cada lote em `activities` pelo serviço já existente `recordDealJourney`. O histórico contém ID do card, proposta, itens/quantidades e justificativa; replays idempotentes não criam histórico duplicado.
- O registro histórico usa a política já existente de melhor esforço; a existência do card é a evidência transacional primária. Reconciliar eventuais falhas de histórico em homologação.
- **Ponto de controle:** PR #3428 aberto e sem merge/deploy. Execução parcial backend+UI escrita, testes unitários escritos, gates de TypeScript, build e integração ainda não executados.
- A inspeção estática não equivale a homologação. Não fazer publicação; priorizar testes reais e revisões de regressão/autorização antes de declarar lote concluído.

## Correção de mesclagem e preservação do lead de origem — 10/10/2026
- Commit `2b3b51dc77c356358636ee6042a93d64b4e96eea` no PR #3428.
- A mesclagem deixa de executar `DELETE` físico do lead de origem e passa a registrar `excluidoEm`, `motivoExclusao` e `metadata.leadMerge` (destino, usuário e horário) na mesma transação de transferência de relacionamentos.
- Atualização condicional evita arquivar novamente uma origem já excluída; os vínculos relacionados continuam realocados para o destino dentro da transação.
- **Limites:** sem execução de TypeScript/build/testes nem homologação. Validar transações concorrentes, filtros em todas as pipelines, auditoria de merges anteriores, e dependências de exclusão lógica antes de aprovar. Dados de inteligência concorrentes ainda usam política própria para unicidade.
- **Release:** sem merge, sem deploy, sem alteração de produção.

## Proteção adicional de negócios ligados a leads excluídos — 10/10/2026
- Commit `8c530d41d10d834ef6413d28629ad4a44762630f` no PR #3428.
- `POST /deals/:id/commercial-review`, `POST /deals/:id/resume-commercial` e `POST /deals/:id/return-to-qualified` agora verificam lead ativo no mesmo tenant antes de aplicar alterações, criar tarefas ou registrar a ação. Para lead ausente/excluído, retornam HTTP 409.
- O `PATCH /deals/:id` já tinha bloqueio similar; alteração evita rotas comerciais alternativas de movimentação em registros excluídos.
- **Evidência:** arquivo atualizado remotamente na branch; TypeScript, build e testes de API não executados nesta sessão. A revisão de todas as rotas que alteram negócios permanece pendente, inclusive cenários concorrentes.
- Sem homologação, merge, deploy nem mudança em produção.

## Guardas de avaliação por IA e reprocessamento de fechamento — 10/10/2026
- Commit `949dde54cdc7402e3ab6edbd52c8bb3f5e38a802` no PR #3428.
- `POST /deals/:id/ai/evaluate` verifica que o negócio tem lead ativo no mesmo tenant antes de solicitar avaliação por IA.
- `POST /admin/deals/:id/retry` bloqueia reprocessamento de fechamento se o lead está ausente ou excluído, preservando o estado até revisão administrativa.
- Limite conhecido: outras rotas e funções assíncronas ainda precisam de revisão, e a checagem antes da escrita não substitui uma verificação transacional contra exclusão simultânea.
- Sem evidência de TypeScript, build, testes de integração, homologação, merge ou deploy. Produção não alterada.

## Proteção contra exclusão física de negócio — 10/10/2026
- Commit `9678ab786e9323a3f09b5904690c36ecec8adabb` no PR #3428.
- Identificado DELETE físico no endpoint `DELETE /deals/:id`. Substituído por HTTP 409 com código `DEAL_ARCHIVAL_REQUIRED`, preservando registros de negócios e vínculos já existentes.
- Esta é uma medida conservadora de proteção, **não** o fluxo final de exclusão/arquivamento. A ação de excluir negócio deixará de funcionar até que exista transição de arquivamento/retirada da pipeline com histórico, autorização administrativa e consultas filtradas. Evitar declarar essa função concluída.
- Pendências: desenhar/implementar estado de arquivamento persistente sem exclusão física, compatibilidade de pipelines e contratos, garantir que usuários comuns não tenham ação de exclusão, testar referência a proposta/execução/atividade e tratar concorrência.
- Evidência: commit no GitHub; sem execução de TypeScript/build/testes ou homologação, merge e publicação.

## Arquivamento seguro de negócios — 10/10/2026
- Modelo Drizzle: campos opcionais `archivedAt`, `archivedBy`, `archiveReason`; commit `bcca665`.
- `DELETE /deals/:id` realiza **arquivamento lógico**, com motivo obrigatório (3–1000 caracteres), data e autor; só admins podem arquivar, e duplicações retornam 409. Relações e histórico são preservados no banco; commit `56bd3a8`.
- Listagem `GET /tenants/:tenantId/deals` oculta arquivados por padrão; `includeArchived=true` somente para administradores, exige correspondência do tenant da sessão (ou Superadmin); edição `PATCH /deals/:id` bloqueada em arquivados; commit `424c887`.
- Migração SQL **não aplicada**: `lib/db/migrations/20261010_crm_v4_deal_archival.sql` commit `8e3bee5`. Confirmação de integração ao migrador e ordem/numeração exigida antes de execução.
- **Não homologado:** falta testar TypeScript, migração, consultas, concorrência, operações alternativas, frontend e regras de arquivamento de negócios com execução/contratos ativos. Exige revisão para impedir novas operações após arquivamento em todas as rotas. Até então código não está pronto para promoção.
- Sem merge, sem deploy, sem alteração em produção.

## Proteção de operações em negócios arquivados — 10/10/2026
- Commit `c71424eff9fbb4a7ae0ec74c1d6edf3608814e2c`.
- Incluída verificação `archivedAt` com resposta HTTP 409 (`DEAL_ARCHIVED`) nas rotas de transferência de pipeline, criação de lote de execução, análise comercial, retomada comercial, retorno à qualificação, avaliação por IA e reprocessamento administrativo de fechamento.
- `return-to-qualified` e `ai/evaluate` passaram a selecionar explicitamente `archivedAt` para fazer a verificação.
- **Riscos ainda abertos:** verificação fora da transação não impede corrida entre arquivamento e operação concorrente; operações assíncronas e rotas em outros módulos não estão totalmente cobertas. Arquivamento de negócio em execução ou com contrato ativo requer regra explícita; não declarar encerrado. Migração continua apenas escrita, não executada.
- Evidência limitada a commit registrado no GitHub: não houve TypeScript, build, testes, homologação, merge ou deploy.

## Guarda de vínculos contratuais e operacionais — 10/10/2026
- Commit `23f359e143b55cd7ee68d4b95d4115bdc255b60d` na PR #3428.
- O arquivamento de negócio agora consulta contratos (`contracts`) e cards de execução (`work_cards`) no mesmo tenant, rejeitando o arquivamento HTTP 409 com `DEAL_HAS_LINKED_OBLIGATIONS` quando qualquer relacionamento existir.
- Comportamento conservador: contratos históricos e execuções finalizadas também bloqueiam, até disponibilizar revisão/encerramento administrativo explícito. Não apagar ou desvincular contratos ou work cards para contornar a trava.
- **Risco pendente:** a checagem e atualização são comandos separados e não têm garantia de serialização contra criação concorrente de contrato/card. Necessário gate transacional e testes antes da homologação. Revisar ainda os demais vínculos financeiros/OS e interface administrativa.
- Evidência: commit no GitHub; sem execução de build, TypeScript, testes, migração, homologação, merge ou publicação.
