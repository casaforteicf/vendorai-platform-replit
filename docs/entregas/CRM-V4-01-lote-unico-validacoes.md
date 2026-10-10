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
