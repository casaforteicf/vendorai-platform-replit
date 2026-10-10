# INFRA-LOTE-01 — Diagnóstico seguro do operador Contabo

## Evidência real, 10/10/2026
- `status` Contabo: homolog e candidato de produção ativos.
- `homologHealth`: `{"status":"ok"}`.
- `storage`: 96G total / 81G usados / 15G livres (85%).
- `releaseStatus AGENT-01`: `Command failed` sem exit code nem stderr de processo visível no conector.

## O que este lote muda
Adicionar classificador puro e testes para **identificar o motivo quando houver stderr/exitCode seguros**, sem publicar segredos. Não afirmar a causa do erro atual. Arquivos não são conectados automaticamente ao operador instalado fora do repositório: integração ao wrapper/host requer localizar sua fonte exata e obter retorno seguro dos campos `exitCode` e `stderr`.

## Critério para desbloquear
1. Operador host retorna categoria, código de saída e stderr redigido, sem tokens/segredos.
2. Validar allowlist e mapeamento AGENT-01 para PR #3435/commit imutável.
3. Testar `releaseStatus` novamente antes de permitir build.
4. Preservar imagens de rollback e backups; sem limpeza automatizada.
5. Somente construir/homologar em ambiente controlado, sem merge ou produção.

Teste local: `node --test scripts/infra/vendi-operator-diagnostics.test.mjs`.
