# Vendi — auditoria de autonomia operacional

Data da auditoria: 2026-10-20 (UTC)  
Escopo: código default branch, PRs #3490, #3433, #3446 e #3565, estado do executor Contabo e trilha de migrations.

## Estado comprovado

| Área | Estado comprovado | Evidência | Próximo passo |
|---|---|---|---|
| Missões | API e página de operações suportam criar/listar/detalhar/executar missão e pausar para aprovar ferramentas; eventos guardam evidências. | `artifacts/api-server/src/routes/vendi.ts`, `artifacts/api-server/src/services/vendi-mission-supervisor.ts`, `artifacts/frontend/src/pages/agents/VendiOperations.tsx`. | Validar o fluxo com API e tenant autenticado em homologação. |
| Homologação/publicação na Contabo | Há ferramenta MCP `vendi_contabo_operate` para `build`, `homologate`, `rollback`, `releaseStatus`, `preflight` e `publish`; o operador host recebe ações fixas. | `artifacts/cloudflare-mcp/src/index.ts`, `scripts/vendi-contabo-operator`. | Revalidar ações e gates no host real quando o executor responder. |
| Autorização por ação de release | O handler de `vendi_contabo_operate` chama `contaboOperate` sem `operatorGrant`. Os handlers `request_test` e `get_test_result` aplicam grant por cliente OAuth, ação e lote. A ferramenta de release está anotada `destructiveHint: false`, apesar de aceitar `publish` e `rollback`. O MCP exige OAuth no endpoint, mas este código não comprova uma autorização granular equivalente para release. | Trechos de registro das ferramentas e `operatorGrant` em `artifacts/cloudflare-mcp/src/index.ts`. | Adicionar grant de release por ação/lote, classificar corretamente operações mutáveis e testar negações, antes de usar como trilha operacional. |
| Central de Trabalho do Vendi | A página contém fluxo de missões/aprovações, mas não apresenta acompanhamento de release, homologação, merge ou publicação. | Busca no conteúdo atual de `VendiOperations.tsx`: sem referências a release, homolog, publish, merge ou Contabo. | Integrar uma tela de releases com SHA/lote, estado, evidências, aprovações e links para missão. |
| PR #3490 | Aberto e Draft. Adiciona probes de leitura do executor; não implementa escrita/build. A descrição informa 4/4 testes locais prévios, mas não há status checks no SHA consultado. | [PR #3490](https://github.com/casaforteicf/vendorai-platform-replit/pull/3490), head `01b871c5f3adbc61f44fdd4d4c669770555765f1). | Reconciliar com main, executar testes no checkout do SHA final e validar no MCP/host isolado. |
| PR #3433 | Merged. Contém componentes/scripts de build, gates e merge controlado; a própria descrição registra que a integração do merge no MCP e o teste real Contabo eram pendências. O merge não comprova a conclusão dessas pendências. | [PR #3433](https://github.com/casaforteicf/vendorai-platform-replit/pull/3433), merge `02cccf87512109073987a36aff3302707625b493`. | Verificar os handlers e o executor instalado em Contabo. |
| PR #3446 | Merged. Registra homologação anterior de uma imagem e também ressalta que HEAD posterior não era a mesma imagem; o corpo contém bloqueios históricos de publicação. | [PR #3446](https://github.com/casaforteicf/vendorai-platform-replit/pull/3446), merge `69a04a99382056fd8978d3e3e106f324bf0d6217`. | Confirmar versão ativa atual por consulta ao host e comparar SHA/imagem/registro. |
| PR #3565 | Merged. Trata erro de criação de missão e melhora diagnóstico; o texto do PR diz que não comprovou a causa nem executou deploy. | [PR #3565](https://github.com/casaforteicf/vendorai-platform-replit/pull/3565), merge `2b3d305e830f4cde4fdf85412a608178ccdc7848`. | Executar POST autenticado e caminho de erro em homologação após verificar schema. |
| Migration de missões | O arquivo SQL está presente e cria `vendi_missions` e `vendi_mission_events`; a existência do arquivo não prova aplicação. | `lib/db/migrations/202610012020_vendi_missions.sql`. | Consultar o catálogo de migrations e as duas tabelas no PostgreSQL de homologação, somente leitura. Não aplicar migration sem autorização. |
| Executor/Contabo real | Não foi possível obter estado do host nesta auditoria. As chamadas read-only de status/health/armazenamento e `releaseStatus` retornaram erro interno do conector Contabo. | Consultas MCP realizadas em 2026-10-20 UTC; todas falharam com erro interno, sem saída do host. | Recuperar o conector e repetir status, saúde e auditoria de executor/migration. |

## Testes e validações executados nesta auditoria

- Leitura da metadata e dos diffs de #3490, #3433, #3446 e #3565 pela API GitHub.
- Leitura dos arquivos de rota de missão, supervisor, registro MCP, UI, operador host e migration SQL no default branch.
- Consulta de status de commit: nenhum status check associado ao head consultado de #3490 e ao head de #3565.
- Nenhum build, typecheck, teste local ou teste de integração foi executado: o checkout do repositório não está disponível neste ambiente.
- Nenhuma consulta direta ao banco, execução de migration, homologação, merge ou publicação foi realizada.

## Gate para completar o ciclo

1. Disponibilizar checkout executável do repositório e rodar os gates de build/typecheck/teste no SHA final.
2. Restaurar o conector Contabo e provar estado atual do executor, imagem, healthchecks e migrations.
3. Corrigir a autorização granular do MCP para ações de release; cobrir casos permitidos e negados.
4. Integrar o estado de release na Central de Trabalho e relacionar cada etapa com missão, SHA, evidências e aprovação.
5. Executar ciclo completo somente em homologação isolada. Merge/publicação só após gates comprovados e autorização aplicável.

Nenhuma funcionalidade foi classificada como publicada ou concluída nesta auditoria.
