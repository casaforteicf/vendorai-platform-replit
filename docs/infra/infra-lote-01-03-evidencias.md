# INFRA-01.03 — Evidências e gates (10/10/2026)

## Desenvolvimento / testes
- PR #3455: verificador `scripts/infra-release-contract-audit.mjs` e quatro testes Node.
- **Execução isolada, fora do checkout da Contabo**: cópia correspondente do verificador/testes executada em Node pelo comando `node --test scripts/infra-release-contract-audit.test.mjs`. Resultado real: **4 testes, 4 passed, 0 failed** (TAP; duração 498,673 ms). Isso valida os cenários de fixture, **não** o funcionamento de CI nem o deploy.
- Run GitHub Actions [38075022013](https://github.com/casaforteicf/vendorai-platform-replit/actions/runs/38075022013): `completed/startup_failure`; chamada de listagem de jobs retornou `[]`. Sem jobs concluídos nem evidência de execução dos testes no GitHub.
- Inspeção dos três workflows principais: referências legadas a Railway em todos os três; `cloudflare-api-container.yml` inclui fallback Railway. Referências de código **não demonstram** deployment ativo.

## Verificações operacionais somente leitura
- `vendi_contabo_operate(releaseStatus, AGENT-01)`: falhou em `ssh ... sudo -n /usr/local/sbin/vendi-contabo-operator releaseStatus AGENT-01`; o conector não expôs exit code remoto nem stderr suficiente; causa interna indeterminada. Não houve execução de build, homologação ou rollback.
- `vendi_crm_summary(krafht-homolog)`: retorno anterior `ok:true`, `tenantId:homolog-krafht`; leitura funcional, não comprova os demais fluxos de autenticação.
- `browser_agent_connections(krafht-homolog)`: `404 tenant_not_found`. Divergência de resolução de tenant persiste entre operações; validar se a API de conexões aceita a mesma tenantKey da API CRM.
- `cloudflare_get_pages_project(vendorai)`: indisponível por ausência de `CLOUDFLARE_API_TOKEN` no conector; política real do Pages não comprovada.
- Desktop Commander: VPS listada online, mas execução remota bloqueada por limite mensal de uso da conexão; não foi possível rodar os testes **na Contabo**.

## Gates não cumpridos
1. Obter canal autorizado que exponha exit code e stderr **sanitizados** do wrapper SSH sem leitura de segredos; corrigir INF-08 na implementação existente, sem serviço paralelo (coordenação PR #3445).
2. Solucionar `startup_failure` dos Actions e executar CI da branch.
3. Verificar configuração efetiva do projeto Cloudflare Pages, incluindo Git production branch e auto deploy, antes de mudar qualquer workflow.
4. Validar auth exchange ponta a ponta e isolamento tenant no Browser MCP, alinhado aos PRs #3432/#3445.
5. Testar procedimento de restauração de backup e rollback em homologação **sem** acionar rollback de produção.

Nenhum merge, deploy, reinício, limpeza Docker, mudança de credenciais ou publicação foi realizado nesta rodada.
