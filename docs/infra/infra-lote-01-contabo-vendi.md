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

## Nova checagem real, 10/10/2026 (sem deploy)
- `vendi_contabo_status(status)`: containers `vendorai-homolog-api`, `vendorai-prod-api-candidate`, `vendorai-mcp-contabo-fixed`, `vendorai-prod-browser` ativos.
- `homologHealth`: `{"status":"ok"}`.
- `storage`: 96G total / 81G usados / 15G livres (85%). NÃO executar `docker prune` nem remover imagens/volumes: há material recuperável que pode sustentar rollback.
- `vendi_contabo_operate(releaseStatus,AGENT-01)`: falha real no comando SSH restrito com mensagem `Command failed: ssh ... sudo -n /usr/local/sbin/vendi-contabo-operator releaseStatus AGENT-01`. Conector não expõe `exitCode` remoto ou `stderr` remoto. Categoria segura: `REMOTE_EXIT_UNOBSERVABLE`. **Causa no host não confirmada**.
- `browser_agent_status`: configured=true, runtime=cdp, vendiAutonomyEnabled=false.
- `vendi_crm_summary(krafht-homolog)`: `HTTP 401 Invalid or expired token`.
- `browser_agent_connections(krafht-homolog)`: `HTTP 404 tenant_not_found`.
- `AGENT-01`: PR #3435 em rascunho, head observado `c1a5c1883953aa2b85a5356bceba30dca05e2743`; **não foi demonstrado** registro deste SHA no operador host.

## Implementação incremental no PR #3445
- Classificador reconhece mensagem SSH encapsulada sem inferir indevidamente o tipo de falha interna.
- `errorMessage` disponível como fallback quando o conector não entrega `stderr`.
- Retornos continuam restritos a categoria, ação, lote, exitCode se observado e remediação genérica. Segredos, opções SSH e texto remoto não saem no resultado.
- Testes específicos adicionados; execução na Contabo ainda pendente porque operador MCP não permite comandos livres e a fonte do wrapper não está exposta neste PR.

## Pendências reais / próximo gate
1. Localizar a implementação **já instalada** do wrapper `vendi_contabo_operate` no MCP atual, sem criar outro serviço. Encapsular `spawn/exec` existente para capturar `exitCode` e `stderr` com sanitização antes de qualquer resposta; preservar o contrato público e o comando restrito.
2. No host, validar acesso da identidade SSH específica, `sudo -n -l`, arquivo `/usr/local/sbin/vendi-contabo-operator`, symlinks, propriedade/permissões, allowlist e mapeamento do lote AGENT-01. Somente inspeção inicialmente.
3. Revalidar após o ajuste `releaseStatus AGENT-01` e comparar o SHA imutável com PR #3435, sem invocar `build`, `homologate` ou `rollback` até o status estar legível.
4. Corrigir credencial MCP↔API de homologação somente após identificar seu mecanismo de rotação; não incluir tokens, valores de segredo ou cabeçalhos em GitHub.
5. Resolver o mapeamento do tenant e validar Browser Agent em missão real **somente leitura**, assistida, com conta/conexão previamente autorizada.
6. Executar `node --test scripts/infra/vendi-operator-diagnostics.test.mjs` no checkout do PR e anexar saída efetiva. Homologação, rollback e build integral continuam sem evidência nova nesta rodada.
7. Produção intocada, sem merge ou publicação. Registro Mestre: PR #3444 (branch própria, ainda não integrada).

## INFRA-LOTE-01.1 — verificações de release e API (código adicionado, não ativado)
- `scripts/infra/vendi-release-gates.mjs`: `assessReleaseReadiness` é função pura, conservadora, sem rede e sem executar releases. Confere lote, SHA completo de 40 hexadecimais, digest Docker `sha256:`, correspondência SHA/imagem, mapeamento do lote, operador, homologação saudável, testes, backup, rollback, migrações, isolamento multi-tenant e evidência de aprovação. `target=production` é sempre rejeitado por esse gate específico de homologação.
- `evaluateApiAuth`: classifica 401 (credencial inválida/expirada), 403 (permissão), 404 (tenant/endpoint ausente); não tenta rotacionar token e não faz retry automático.
- `scripts/infra/vendi-release-gates.test.mjs`: cobertura da negativa padrão, commit/digest imutáveis, controles de backup/rollback/aprovação, bloqueio de produção, ausência de eco de segredos e tratamento separado de 401/403/404.
- **Limitação crítica**: não existe ligação entre o novo verificador e o operador em produção; qualquer resultado de teste com dados simulados não é evidência de ambiente real. Sem mecanismo de autorização ativa ou rollback operacional incluído aqui.
- Comando de teste para checkout da branch: `node --test scripts/infra/vendi-operator-diagnostics.test.mjs scripts/infra/vendi-release-gates.test.mjs`.
- Próxima integração exige fonte do wrapper MCP existente e leitura do operador host. Não criar processos paralelos nem publicar.

## INFRA-LOTE-01.2 — vínculo de evidências e aprovação (10/10/2026)
- O gate offline agora exige `evidenceSource` não vazio com caracteres permitidos, `evidenceCommitSha` idêntico a `commitSha` e `evidenceImageDigest` idêntico à imagem informada.
- Aprovação fica vinculada ao **mesmo** `approvedLot` e `approvedCommitSha`. Approval de outro lote/commit falha com código estável; verificador não ecoa as referências sensíveis.
- Regressões adicionadas para cruzamento indevido de lote, commit e imagem. Testes ainda não rodados no host.
- **Limite de confiança:** as provas são booleanos/strings informados pelo chamador; este gate sozinho não verifica criptograficamente a procedência nem consulta a Contabo. Integrá-lo ao operador existente exige coletar evidências de fontes autenticadas e confiar apenas no contexto do operador; não oferecer `approved:true` diretamente a chamadas de tenant.

## INFRA-LOTE-01.3 — robustez do diagnóstico SSH (10/10/2026)
- Diagnóstico considera **conjuntamente** campos `stderr` e `errorMessage`, quando ambos são strings; evita perder a falha do host caso o wrapper também reporte `Command failed`.
- Códigos de saída somente são preservados se inteiros seguros no intervalo 0–255; valores arbitrários são tratados como indisponíveis.
- Objetos arbitrários em `stderr` ou `errorMessage` são ignorados, sem serializar dados sensíveis.
- Regressões adicionadas para esse comportamento. **Não há comprovação de execução dos testes na Contabo nem integração do classificador ao MCP/operador instalado**.

## INFRA-LOTE-01.4 — integração real localizada no repositório (10/10/2026)
- Identificado `artifacts/cloudflare-mcp/src/index.ts`, função `vendorApi`, com fallback silencioso para a URL antiga de produção Railway quando `VENDORAI_API_BASE` faltava.
- Removido fallback; agora a configuração exige `VENDORAI_API_BASE` explícita e URL HTTPS, sem userinfo, query ou fragmento. O caminho configurado é preservado.
- Sanitizado retorno de falhas do cliente MCP: 401/403/404 e demais erros geram códigos fixos; corpo da resposta da API não é mais ecoado em `Error`.
- **Atenção**: este arquivo integra o MCP de Cloudflare/browser do repositório, mas não foi comprovado que ele é a mesma implementação do container `vendorai-mcp-contabo-fixed`. Alteração de branch não corrige o 401 do ambiente até configurar a variável correta, executar testes e homologar o binário correspondente.
- Não alterados tokens, secrets, tenant tables, produção, operador SSH ou containers.
- Validar em ambiente isolado: `pnpm --filter @workspace/cloudflare-mcp build` e chamadas autenticadas de homologação com `VENDORAI_API_BASE` apontando explicitamente para a API correta (nunca assumir produção).
