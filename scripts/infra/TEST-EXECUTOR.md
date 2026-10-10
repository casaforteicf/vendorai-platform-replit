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

Para evitar novo fetch, reutilize o snapshot com `cache-fetch exit=0` e SHA idêntico: `VENDORAI_REUSE_STORE=/home/vendorai/vendorai-test-executor/.test-evidence/pr-3428-<ID>/store` com `VENDORAI_PREPARE_OFFLINE` desativado. Identifique o diretório real após conferir `manifest.txt` e `results.txt`. O diretório antigo deve ser preservado durante a execução; não use se o SHA do PR mudou. Essa opção escreve apenas no cache descartável anterior e não no cache original.


## INFRA-01.13 — Operação remota restrita (preparada, não ativada)

`scripts/infra/remote-test-gate.py` é a fachada **privada** que reutiliza `test-sha.sh` e oferece duas ações fixas:
- `request PR BRANCH FULL_SHA SUITE`: solicita a bateria permitida, sem shell livre;
- `result RUN_ID`: lê manifesto, códigos de saída e nomes dos logs da execução, sem permitir caminhos arbitrários.

Executar exclusivamente como o usuário de testes `vendorai`, **nunca root**. O conector MCP autenticado deve impor papéis autorizados, escopo de lotes e auditoria do requisitante **antes** de chamar essa fachada. A ferramenta não implementa autenticação própria e **não deve ser exposta diretamente na rede**. Um mapeamento autorizado da ação no conector existente ainda precisa ser implementado e testado. O operador de releases, com ações distintas e sudo restrito, não deve ser substituído nem receber sudo irrestrito.

O wrapper limita a uma execução simultânea com flock, exige pelo menos 8 GiB livres, fixa cache original e não habilita downloads. O executor conserva Docker --network none, limites de 2 CPUs, 4 GiB RAM e 256 processos. Duração limitada em 1800s; conferir interrupção de descendentes Docker em testes de timeout antes de habilitar acesso remoto. Os resultados por RUN_ID ficam no armazenamento de evidências do worktree. Não fornece acesso livre a arquivos de logs; a exportação de logs sanitizados precisa ser contratada com permissões no conector.

Validação isolada, sem tocar a produção:
```bash
python3 -m unittest discover -s scripts/infra -p 'test_remote_test_gate.py'
```

**Ativação exigida por operador autorizado:** adicionar ao MCP privado Vendi duas operações com validação/autorização por principal (request/result), vinculadas ao executável `/home/vendorai/vendorai-test-executor/scripts/infra/remote-test-gate.py` sob usuário `vendorai`, sem comandos livres nem alteração da política sudo. Validar em tenant descartável e confirmar logs por SHA. Não instalar nem expor endpoint até testes de timeout, espaço, concorrência e isolamento estarem aprovados.

## INFRA-01.14 — segurança de integração MCP (não ativada)
Inspeção do MCP existente `artifacts/cloudflare-mcp/src/index.ts` e `oauth.ts`: o acesso atual usa escopo amplo `vendorai:admin`, e o token de acesso tem `sub: administrator` compartilhado. **Não fornece identidade específica do agente 01–14 nem autorização por lote.** Portanto, adicionar ferramentas `request_test` e `get_test_result` diretamente a esse MCP, aceitando `agent` informado pelo cliente, permitiria falsificação de agente. A integração remota foi intencionalmente retida até existir vinculação confiável da identidade a permissões por lote no próprio servidor/conector. Não criar endpoint público nem ampliar sudo.

Preparado nesta branch: encerramento de grupo de processos por timeout, remoção seletiva usando apenas ID de container descartável capturado via `--cidfile`, limite de 8 GiB livres, trava única e quota de logs de 3 GiB. O encerramento Docker precisa de teste de integração para validar privilégios Docker restritos e descartar containers descendentes em todas as saídas. O limite de logs **não equivale a cota completa de armazenamento**: store/work também precisam de controle adicional antes de ativar. Não fazer remoção automática de evidências ou de imagens oficiais.

**Intervenção autorizada exata:** estender o MCP existente com identidade não falsificável do agente/lot permitidos e duas ferramentas restritas, usando o wrapper apenas como usuário de testes; executar os gates de timeout, concorrência, disco e leitura cruzada de logs em ambiente isolado; então ativar. O conector atual não permite comando livre em host para efetuar essa mudança remotamente, e o Desktop Commander está indisponível por limite mensal. Nenhum deploy, merge ou mudança em produção.

## INFRA-01.16 — Central authenticated operator (code only; no server activation)

The existing MCP private OAuth access token contains a signed `client` claim; `verifiedOperatorClient` derives SHA-256 of that signed claim and **rejects the legacy shared MCP_ACCESS_TOKEN** for test operations. The central operator (not each agent) is granted permissions by server-side `VENDI_TEST_OPERATOR_POLICY`, a JSON object keyed by the 64-character OAuth client hash, for example:
`{"<verified-operator-client-sha256>":{"lots":["LOT-02"],"actions":["request_test","get_test_result"]}}`.
This must be installed by a privileged configuration administrator; never put a token or client secret in Git. An agent name supplied in `request_test` is only audit metadata and **not** an identity credential. Administrative grants must only contain authorized lots and actions. The central coordinator authenticates individually and requests on agents' behalf. Configuring the policy alone is insufficient: the wrapper and restricted SSH access must also be deployed and verified.

`request_test` now passes the authorized lot to the host facade. Each run records `authorized-lot.txt`; `get_test_result` checks that exact lot and the session's permission. Preexisting evidence without this metadata is intentionally inaccessible via MCP; it remains readable to an authorized host operator for audit. Requests and results use a fixed command path, validated scalars, no free-form shell and no deployment commands.

Runtime test limits: one job at a time, 2 CPUs/4 GiB per existing Docker test container, 1800s timeout, 8 GiB free-disk floor, 3 GiB logs guard, 6 GiB overall work/store/log quota checked periodically. On timeout/low disk/storage quota, the process group is terminated and tracked container IDs are selectively removed. These limits are implemented in code, not yet proven on the live host; if group termination, Docker cleanup or filesystem traversal fails, automatic execution must stay disabled. No automatic deletion of retained evidence, production images, backup volumes or rollback artifacts.

**Activation action (existing infrastructure only):** An authorized operator updates the isolated worktree and private MCP runtime from this PR through the controlled non-production process, configures an explicit signed OAuth client-hash allowlist and the restricted SSH command capability solely for `remote-test-gate.py`, and validates a request/result exchange for a disposable PR SHA. The present MCP's broad OAuth administrative login MUST NOT alone be sufficient to run tests. Do not enable it before authenticating the central operator, proving cross-lot denial, disk quota and timeout, and validating no Docker access beyond the existing narrowly scoped policy. No deployment was performed by Agente 01 in this turn.
