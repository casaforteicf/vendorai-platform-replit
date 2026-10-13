# MULTI-04.6 — Correção de tipo e teste SQL descartável

PR #3487, ainda draft e sem publicação.

## Entregue
- Corrigida chamada `restoreRequestFingerprint`: a transação passa `expectedUpdatedAt` como `Date`, conforme a assinatura do utilitário; o próprio utilitário converte a data para ISO.
- Criado `tests/multi04_isolated_sql_regression.sql`, transação com tabelas temporárias e `ROLLBACK`. Exercita escrita inicial, rejeição de revisão obsoleta, imutabilidade do snapshot anterior e leitura da fingerprint.

## Limitações e gates
- O script SQL é um harness para **rodar somente em PostgreSQL descartável**. Ele não executa a transação Drizzle real, não faz dois clientes concorrerem pelo mesmo lock e não substitui testes completos de integração.
- Script e testes ainda não foram executados; não há acesso a banco de homologação validado nesta etapa.
- Próximos passos: testes com dois clientes PostgreSQL independentes, falha forçada de auditoria (rollback), testes reais da migração, comportamento do autosave legado, análise de permissão e validação de endpoint.
- Não registrar rota nem habilitar a flag antes desses gates. Sem merge, migração oficial ou deploy.
