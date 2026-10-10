# Executor de testes por PR / branch / SHA

Executor isolado para Agentes 01–14; nenhum banco, segredo, rede ou socket Docker montado no container. Usa apenas cache pnpm offline autorizado. Não executa migrations, integrações autenticadas ou homologação de API; esses gates precisam de tenants e DB descartáveis fornecidos separadamente.

Ativação única na Contabo por operador autorizado: construir a imagem `docker build -f scripts/infra/test-executor.Dockerfile -t vendorai-test-node24:local .`, disponibilizar cache pnpm offline do lockfile e executar `VENDORAI_OFFLINE_STORE=/caminho/do/cache bash scripts/infra/test-sha.sh 3428 feat/crm-lote-v4-relacionamentos 72e133bf381ff6213095b402ade881774573d1f5 full` na cópia Git autorizada. Os resultados ficam em `.test-evidence/pr-...` e incluem manifest, stdout/stderr e exit codes. Se cache não estiver completo, instalação falha sem rede. Node/TypeScript/Vitest/build são testes de código, não homologação autenticada.

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
bash scripts/infra/test-sha.sh 3428 feat/crm-lote-v4-relacionamentos 72e133bf381ff6213095b402ade881774573d1f5 full
```

Os logs `cache-fetch.log`, `install.log`, os testes, `results.txt` e `manifest.txt` registram cada etapa. Se o SHA do CRM mudou, substituir o SHA por HEAD **exato confirmado no GitHub**; o executor rejeita divergência. A etapa com rede não é homologação, e a bateria continua sem rede.

## INFRA-01.12 — evidência da primeira execução CRM (Contabo; fornecida pelo Coordenador)
- PR CRM #3428: `cache-fetch exit=0`; `install exit=0`; `api-ts exit=2`.
- Falhas indicadas pelo TypeScript: `src/__tests__/arqdor-client-portal-2.test.ts`, `src/__tests__/arqdor-reference-photo-analysis.test.ts`, `src/jobs/googleDataManagerConversionSync.test.ts`.
- Os erros detalhados de diagnóstico e o SHA da execução devem ser copiados de `manifest.txt` e `logs/api-ts.log`; não presumir que o HEAD atual seja o SHA efetivamente testado.
- Arquivos Arqdor: encaminhar à frente proprietária Arqdor (identificador numérico do agente ainda não confirmado). Google Data Manager Conversion Sync: encaminhar ao proprietário de Marketing/Integrações (referência histórica PR #3072; atribuição atual requer confirmação). Não alterar código desses módulos pelo Lote 01.

### Validação direcionada, sem repetir fetch online
Uma execução `crm` roda exclusivamente cinco testes Vitest CRM, sem executar o typecheck global. **Não define homologação aprovada**: `api-ts`, integração autenticada e gates gerais continuam obrigatórios antes da homologação integral. Para uma nova execução, use o SHA real de `git rev-parse` do PR #3428:

```bash
cd /home/vendorai/vendorai-test-executor
git fetch origin feat/infra01-sha-test-executor-v4
git diff --quiet && git diff --cached --quiet
git switch --detach FETCH_HEAD
node --test scripts/infra/test-sha.store.test.mjs
# Confirmar SHA do CRM no GitHub; definir SHA_CRM ao commit exato, não ao branch mutável.
VENDORAI_OFFLINE_STORE=/home/vendorai/.local/share/pnpm/store/v10 \
  bash scripts/infra/test-sha.sh 3428 feat/crm-lote-v4-relacionamentos "$SHA_CRM" crm
```

Não definir `VENDORAI_PREPARE_OFFLINE=1` quando cache-fetch e install anteriores já tiveram exit 0 e o cache da nova execução contiver todas as dependências. Como o executor usa snapshot individual, verificar primeiro se o store original continua incompleto; se estiver, o mecanismo pode repetir a falta de tarball, exigindo um preenchimento autorizado por execução, sem alterar cache oficial.

### Política de retenção sem limpeza automática
Consulta somente leitura em 10/10/2026: 96 GB totais, 88 GB usados, 8.2 GB livres, 92% de uso. **Não executar docker prune, remoção de imagens, volumes ou backups.** Antes de testes, inspecionar `df -h`, `du -sh .test-evidence/*` e quais execuções já terminaram. Preservar sempre `manifest.txt`, `results.txt` e `logs/` de cada execução, incluindo erros; arquivar evidências fora de diretórios temporários antes de excluir qualquer snapshot. O operador só pode descartar `work/` e `store/` de uma execução identificada, concluída e sem dependências, após verificar arquivos, titulares e necessidade de reprodução. Não usar retenção automática destrutiva.
