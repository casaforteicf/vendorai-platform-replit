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
