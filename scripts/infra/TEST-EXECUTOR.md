# Executor de testes por PR / branch / SHA

Executor isolado para Agentes 01–14; nenhum banco, segredo, rede ou socket Docker montado no container. Usa apenas cache pnpm offline autorizado. Não executa migrations, integrações autenticadas ou homologação de API; esses gates precisam de tenants e DB descartáveis fornecidos separadamente.

Ativação única na Contabo por operador autorizado: construir a imagem `docker build -f scripts/infra/test-executor.Dockerfile -t vendorai-test-node24:local .`, disponibilizar cache pnpm offline do lockfile e executar `VENDORAI_OFFLINE_STORE=/caminho/do/cache bash scripts/infra/test-sha.sh 3428 feat/crm-lote-v4-relacionamentos 4e1d1e8a117c850d65cdda449ba8f264e779bd26 full` na cópia Git autorizada. Os resultados ficam em `.test-evidence/pr-...` e incluem manifest, stdout/stderr e exit codes. Se cache não estiver completo, instalação falha sem rede. Node/TypeScript/Vitest/build são testes de código, não homologação autenticada.
