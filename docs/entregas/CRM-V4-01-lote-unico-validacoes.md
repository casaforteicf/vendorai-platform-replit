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
