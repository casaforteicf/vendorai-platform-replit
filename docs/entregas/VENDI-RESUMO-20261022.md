# Vendi — consultas sem inflação e resumo de missão — 2026-10-22

## Objetivo e evidência
A missão de produção 313f3e07-b574-4c86-a488-44a4d1fda7d6 concluiu após retomada, mas acumulou nove passos para três consultas solicitadas. Os replanejamentos adaptativos adicionavam consultas e preservavam os passos pendentes. A interface terminava na timeline técnica, sem resumo legível. A causa da falha inicial de planejamento permanece não confirmada.

## Alterações
- Planos compostos integralmente por ferramentas sem mutação e sem efeito externo seguem o plano de consultas, sem replanejamento adaptativo após cada leitura. Recuperação de falhas continua disponível.
- Removem-se consultas exatamente iguais somente em planos novos compostos integralmente por consultas. Inputs distintos (inclusive limites/filtros) são preservados. Planos mistos, ações externas e ferramentas desconhecidas não são compactados; planos persistidos não são reindexados.
- Resumo determinístico usa a última observação bem-sucedida por ferramenta. Não soma amostras, não chama IA nem executa novamente consultas, não exibe dados individuais. Contagens ausentes não viram zero. Agendamentos não são descritos como atividades vencidas.
- GET de detalhe calcula o resumo com eventos já autorizados pelo contexto do tenant, inclusive para missões antigas concluídas; não escreve no banco. A interface mostra Resultado da missão antes do plano e da timeline.
- Resultado das novas execuções também persiste o resumo e a evidência por saída. Sem migração ou novo segredo.

## Rastreabilidade e dependências
Branch: fix/vendi-mission-summary-20261021. Base de aplicação: 2c7fe971e199bb7ec0862a4d7892aa3ad474aaeb (PR 3584, publicada). PR/commit desta melhoria constam no histórico Git e no PR correspondente.
Não altera o operador de releases do PR 3588 nem integra WhatsApp. Backend e frontend precisam ser promovidos nas suas rotas controladas; publicar somente a API não disponibiliza o novo cartão na interface.

## Validação em 2026-10-22
- Node local: 11 testes passaram (integridade, consultas com inputs distintos, planos mistos, resumo de repetições, zero/ausência, eventos legados, agendamentos).
- TypeScript strict dos dois helpers puros: passou.
- Transpilação sintática TS/TSX de cinco arquivos alterados: passou; não equivale à checagem completa de tipos da aplicação.
- git diff --check: passou.
- Dockerfile.deploy inclui os 11 testes, compilação da API e build do frontend (inclui auditoria de bundle). A configuração launch-ci existente não é uma checagem completa de tipos.
- Build isolado e homologação real na Contabo: pendentes. Não executados localmente. Produção não alterada por este lote.

## Limites e próximo passo
Estado: implementado com testes unitários locais; sem homologação ou publicação desta versão. Missões somente de consulta deixam de descobrir novos passos por adaptação; devem incluir as consultas necessárias no planejamento inicial. Não deduplicar inputs distintos nem reindexar planos já executados. Homologar uma nova missão de três consultas, conferir exatamente três resultados e resumo coerente. Validar também o detalhe da missão antiga sem reexecutá-la. Identificar a publicação efetiva do frontend antes de promover seu bundle. Preservar rollback da API e do frontend.

## Evidência Contabo e correção do planejamento — 2026-10-22
- Commit 03b408bf641d460bcc035e4408d6131d77ab3a16: build VENDI-3590 concluído, imagem sha256:4c89cd7da73a2a2d29cdbc7beacbc4c702c4da89c47776b3ef82c559eea79e92. Testes, compilação API, frontend e auditoria de bundle passaram no build.
- Homologação ativada com healthcheck; backup vendorai-homolog-api-before-3590-20261022-003438.
- Missão 2b7a590a-27f7-4c38-bd95-fe2d1496cb38: plano predefinido concluiu com 3 consultas, 0 replanejamentos e resumo de três ferramentas. Dados retornados: zero registros no tenant de teste. Este teste não comprova o planejador IA.
- Homologação inicialmente sem OPENAI_API_KEY/MASTER_ENCRYPTION_KEY. Configurações existentes provisionadas sem exibir valores; healthcheck passou. Backup vendorai-homolog-api-before-ai-20261022-004508.
- Diagnóstico persistido no host confirmou falha 22P02 ao registrar feature=agent_runtime em ai_usage_logs, após retorno de tokens do provedor. O enum canônico AI_FEATURES não inclui agent_runtime, embora o supervisor usasse as any.
- Correção adicional: supervisor registra intelligence_analysis, categoria já existente no schema, removendo o cast; mantém billingScope=platform_runtime. Sem migration, sem remoção de auditoria e sem alteração dos outros chamadores de agent_runtime fora deste escopo.
- 11 testes locais passaram novamente após a correção. Esta revisão adicional ainda exige novo build isolado, teste real do planejador e promoção; os testes da imagem anterior não homologam esta revisão.
- Frontend ativo confirmado pelo SSH: Nginx /etc/nginx/sites-enabled/vendorai-app-prod, root /var/www/vendorai-app/current, backend 127.0.0.1:5001. Symlink apontava para release cb9e99cb2ea28cb8fdf3da4dd7ac5cd3b712e563. Pages vendorai não lista o domínio do app, tem produção automática desativada; não acionar publicação ali por suposição.
- Produção permanece sem a melhoria deste PR. Registro deste lote: PR 3590. Homologação final e interface ainda pendentes.

## Ajuste de seleção de ferramentas — 2026-10-22
A revisão fcb8e124 compilou no lote VENDI-3591 e foi ativada em homologação com healthcheck OK; backup vendorai-homolog-api-before-3591-20261022-113538. O planejamento real retornou PLANEJAMENTO_OK, confirmando a correção do registro de uso IA. Entretanto incluiu agenda.appointments.list além das três consultas pedidas.
Ajuste adicional no prompt e nas descrições do registry distingue compromissos de agenda de tarefas vencidas, indica a ferramenta correta e exige plano mínimo sem categorias não solicitadas. Não remove ferramentas por regex nem impede consultas de agenda explicitamente solicitadas. Nenhuma mudança no executor, banco ou frontend.
Validação desta revisão: 11 testes locais de integridade/resumo passaram; transpilação sintática dos dois arquivos passou. São instruções ao modelo: ainda não garantem por si só a seleção correta. Novo build e teste real do planejamento (três consultas, e cenário que pede agenda) pendentes; produção não alterada.

## Homologação real 3592 e ajuste de domínio
- Imagem 3592 / commit 779fb407c1b3d7807708ca18bd9d9fe9712a6582 construída na Contabo; API saudável e smoke autenticado aprovado (401 sem autenticação, 404 tenant ausente, 200 tenant de teste).
- Planejamento IA: três ferramentas CRM corretas, agenda explícita aprovada; missão 4e2a12d8-869e-4005-8b68-0aef9110b836 completed, três consultas, zero replanejamentos e três resumos.
- Frontend extraído da mesma imagem e servido somente em homologação; configuração anterior do Nginx preservada.
- Validação visual encontrou “Site não encontrado”: main.tsx tratava homolog.appvendorai.com como slug de site público de cliente. Adicionadas exceções exatas para homolog e homolog2, preservando os demais subdomínios.
- Novo build e validação visual deste ajuste pendentes; produção permanece sem promoção deste lote.
