# Executor de testes por PR / branch / SHA

Executor isolado para Agentes 01–14; nenhum banco, segredo, rede ou socket Docker montado no container. Usa apenas cache pnpm offline autorizado. Não executa migrations, integrações autenticadas ou homologação de API; esses gates precisam de tenants e DB descartáveis fornecidos separadamente.

Ativação única na Contabo por operador autorizado: construir a imagem `docker build -f scripts/infra/test-executor.Dockerfile -t vendorai-test-node24:local .`, disponibilizar cache pnpm offline do lockfile e executar `VENDORAI_OFFLINE_STORE=/caminho/do/cache bash scripts/infra/test-sha.sh 3428 feat/crm-lote-v4-relacionamentos 4e1d1e8a117c850d65cdda449ba8f264e779bd26 full` na cópia Git autorizada. Os resultados ficam em `.test-evidence/pr-...` e incluem manifest, stdout/stderr e exit codes. Se cache não estiver completo, instalação falha sem rede. Node/TypeScript/Vitest/build são testes de código, não homologação autenticada.

## Correção pnpm ENOENT v10

Informe `VENDORAI_OFFLINE_STORE=/home/vendorai/.local/share/pnpm/store/v10` **ou** o diretório pai `.../store`. O executor normaliza para a raiz que contém `v10` e copia esse cache para o diretório descartável de cada execução, montado gravável **somente dentro desse teste**. O cache original não é alterado; a cópia pode consumir espaço em disco (Contabo anteriormente em 85%), portanto conferir espaço disponível antes do primeiro teste. Validar com `node --test scripts/infra/test-sha.store.test.mjs`.

Para atualizar exclusivamente o worktree já existente (sem checkout da main):

```bash
cd /home/vendorai/vendorai-test-executor
git fetch origin feat/infra01-sha-test-executor-v4
git diff --quiet && git diff --cached --quiet || { echo 'Worktree com alterações; abortando'; exit 1; }
git switch --detach FETCH_HEAD
node --test scripts/infra/test-sha.store.test.mjs
```

Se a branch estiver em uso por outro worktree, não force `git switch`: verificar `git worktree list` e usar o worktree proprietário da branch. Não tocar no repositório principal nem realizar merge de PR.

## INFRA-01.11 — cache offline incompleto (ERR_PNPM_NO_OFFLINE_TARBALL)

Quando houver pacotes ausentes, como `aws4fetch@1.0.20`, o operador autorizado habilita **somente naquela execução** a etapa explícita `VENDORAI_PREPARE_OFFLINE=1`. O executor confirma o PR/branch/SHA antes de iniciar, usa `pnpm fetch --frozen-lockfile --ignore-scripts` na cópia descartável do cache e **somente este fetch** recebe rede Docker bridge. O pnpm install, TypeScript, Vitest e build continuam em containers `--network none`. Nenhum token, banco, socket Docker ou diretório original do cache é montado como gravável. Não executar `pnpm install` no repositório principal. A etapa fetch não executa scripts de dependências.

Antes da execução, verificar `df -h` e o espaço da pasta .test-evidence. A cópia reflink economiza blocos quando suportada; outros sistemas de arquivos usam cópia normal, portanto não remova caches existentes ou volumes Docker automaticamente. Caso não exista espaço suficiente, **abortar** e solicitar destinação de armazenamento autorizada; não limpar backups/rollback por conta própria.

```bash
cd /home/vendorai/vendorai-test-executor
git fetch origin feat/infra01-sha-test-executor-v4
git diff --quiet && git diff --cached --quiet || { echo 'Worktree com mudanças'; exit 1; }
git switch --detach FETCH_HEAD
node --test scripts/infra/test-sha.store.test.mjs
df -h .
VENDORAI_OFFLINE_STORE=/home/vendorai/.local/share/pnpm/store/v10 \
VENDORAI_PREPARE_OFFLINE=1 \
bash scripts/infra/test-sha.sh 3428 feat/crm-lote-v4-relacionamentos 4e1d1e8a117c850d65cdda449ba8f264e779bd26 full
```

Os logs `cache-fetch.log`, `install.log`, os testes, `results.txt` e `manifest.txt` registram cada etapa. Se o SHA do CRM mudou, substituir o SHA por HEAD **exato confirmado no GitHub**; o executor rejeita divergência. A etapa com rede não é homologação, e a bateria continua sem rede.
