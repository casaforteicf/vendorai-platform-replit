# Vendi — autonomia integrada, entrega controlada (27/10/2026)

## Objetivo e fonte da verdade
Concluir **um único pipeline**: trabalho → código exato → testes → imagem por SHA →
homologação isolada com prova do mesmo digest → publicação com lock compartilhado
ao auto-deploy da Contabo → rollback verificável → evidências e Central.

Infra: Contabo Docker para API/operador, MCP OAuth com SSH restrito,
GitHub para fonte. **Não usar GitHub Actions, Railway ou Replit.**
NÃO mesclar na `main` antes de validar cron, isolamento de banco, rollback
e preparação do operador instalado. `main` pode disparar publicação automática.

## O que este PR implementa no código (não implantado)
| Área | Alteração | Gate |
| --- | --- | --- |
| Build | `systemd-run` e log root-only por lote, status assíncrono e erro durável | >=14 GiB disponíveis, memória/CPU limitadas, 1 build global |
| Dockerfile | `Dockerfile.deploy` versionado, SHA-256 comparado com original da VPS | SHA do manifesto deve existir no Git local |
| Homologação | container efêmero na rede privada `vendorai-homolog`, sem porta do host | `DATABASE_URL` homolog diferente de produção; workers e startup migrations desabilitados |
| Prova | recibo root-only: lote, SHA, imagem, image ID, instante e status | Somente emitido após health/CRM read-only |
| Publicação | valida recibo SHA+image ID+idade <=24h e locks | Cron deve usar lock comum, auditado e pinado por administrador |
| Rollback | também exige o lock do cron; restaura a imagem anterior se o backup não passar no healthcheck | Backup exato e produção corrente devem corresponder ao registro |
| Autoatualização | ação `upgradeOperator` de lista fixa de scripts, backup e restauração | Manifesto e aprovação por SHA root-owned; precisa bootstrap inicial |
| Auditoria | ação `auditReadiness` somente leitura | Sem imprimir variáveis sensíveis |
| Missões | aprovação restrita aos admins, lease de banco renovável | Migration de lease aplicada e testada |
| Central existente | trabalhador legado bloqueia merge sem gates operacionais verificados | Flags deliberadamente não definidas por este PR |

## 1) Instalação inicial: necessária, uma vez
Como o MCP atual só expõe operações fixas, não tem privilégio para instalar
seu próprio atualizador. A implantação inicial **não está executada**. Antes:

1. Revisar diff e sintaxe `bash -n` de todos os scripts.
2. Verificar no host os nomes, proprietários, permissões, SHA e patches locais
   (ex.: `vendorai-mcp-novo`). Aplicar apenas diferenças reconciliadas.
3. Backup dos scripts instalados e de `vendorai-mcp-novo` com rollback testado.
4. Instalar `vendi04-homologate-candidate`, `vendi04-audit-readiness`,
   `vendi04-controlled-upgrade` e versões revisadas do operador, runner,
   preflight e release controlado. Usar `/usr/local/sbin` root-owned.
5. Compilar e ativar nova versão MCP que reconhece `upgradeOperator` e
   `auditReadiness`, preservando OAuth/SSH e contêiner anterior.
6. Configurar grant OAuth específico para `upgradeOperator` no lote aprovado;
   nunca `*` ou ferramenta de shell genérico.
7. Rodar ações positivas e negações (lote errado, usuário errado, arquivo
   fora da lista, SHA alterado, credenciais expiradas).

**Não** instalar operador via merge direto em main; a versão precisa ser
atualizada num procedimento host-side isolado com rollback.

## 2) Migração de missões
Migration `202610272240_vendi_mission_leases.sql`: criar tabela de lease
para impedir duas execuções da mesma missão simultaneamente. A execução
usa UPSERT atômico com token aleatório, TTL de 4h, heartbeat por etapa,
e release no `finally`. A tabela precisa existir **antes** de ativar o
código novo, de preferência em banco isolado. Conferir compatibilidade da
versão das migrations e do pooler de banco. Missões com passos individuais
acima de 4h exigirão heartbeat independente (não implementado).

## 3) Gates obrigatórios para release
- Pré-build: SHA de 40 caracteres e manifesto root-owned, Dockerfile exato,
  disco livre >=14 GiB, um build ativo, API prod/homolog saudáveis.
- Build: `STATUS=BUILD_QUEUED` → `BUILD_IN_PROGRESS` →
  `BUILT_NOT_DEPLOYED` ou `BUILD_FAILED`, com log e RC persistentes.
- Homologação: imagem exata, banco distinto, migrations e workers desabilitados,
  chamadas HTTP read-only e recibo. Sem recibo, publicar é **negado**.
- Publicação: recibo root-owned SHA/digest/idade válida; compara o SHA do candidato com o commit da imagem realmente ativa, bloqueando alteração em `lib/db/migrations` ou `lib/db/src/schema` sem comprovante root-owned de compatibilidade de rollback (com BASE_SHA, SHA e lote). Sem lock compartilhado
  de cron `/etc/vendorai/vendi-shared-deploy-lock.path` verificado, é **negada**.
  Não configurar por suposição: confirmar lock REAL de
  `/opt/vendorai/deploy-backend.sh` e `/opt/vendorai/deploy-frontend-auto.sh`.
- Rollback: registro publicado/backup restaurável + lock, testar falhas de
  start, health, rename e preservação do estado. Sem backup, não publicar.
- Banco: diferenças de URL não garantem isolamento físico. Validar também
  hosts, role e db efetivos, perms SQL read-only, tenants, migrações e snapshots.
- Central de Publicações: o worker que faz merge direto em main permanece
  bloqueado sem as flags do host `VENDI_RELEASE_OPERATOR_VALIDATED`,
  `VENDI_RELEASE_HOST_RECEIPTS_VERIFIED` e
  `VENDI_RELEASE_CRON_LOCK_VERIFIED`. Essas flags são **atos de
  configuração auditáveis**, não evidência por si; a integração unificada
  deve validar o recibo confiável do operador antes de habilitá-las.

## 4) Pendências e limites que ESTE PR ainda não resolve
- Auditoria integral de banco, migrations pendentes, backups com restauração
  em ambiente separado e esquema de recuperação de desastre (RTO/RPO).
- Assinatura/verificação criptográfica externa dos comprovantes de release:
  esta etapa usa ownership root e vínculo ao digest, sem serviço de attestations.
- `upgradeOperator` precisa de registro root-owned de aprovação por lote/SHA;
  o GitHub/MCP ainda não provê fluxo de aprovação integrado de duas partes.
- Homologação funcional completa do aplicativo (frontend, Arqdor, Praça.ai,
  CRM e operações) vai além do smoke de saúde e CRM read-only.
- A Central de Missões ganhou um link para a Central de Publicações existente, mas ainda não recebe telemetria host-side contínua.
  Já existe uma Central de Publicações administrativa: **reutilizar essa UI**,
  não criar segunda central. Falta integrar eventos do operador/MCP à tabela
  de releases com identidade, timestamps e recibos verificáveis.
- Validar upgrades/rollback do MCP e de scripts com falhas injetadas em
  staging; servidor com disco ~89% e swap elevado não deve sofrer testes de
  stress na produção.
- Leases de 4h podem vencer durante uma única ferramenta lenta; precisará
  job de renovação fora do loop ou limite de duração das ferramentas.


## Política obrigatória de recursos e retenção (27/10/2026)

**A VPS não deve receber um segundo executor permanente até validar sua capacidade
e eliminar a duplicação operacional dos serviços existentes.**

Consulta direta somente leitura: disco de 96 GB, 85 GB usados, 12 GB livres
(89%); 25 entradas de imagens Docker, 40 contêineres (15 em execução),
11 volumes. O Docker estimou 28,88 GB de imagens potencialmente reclamáveis;
isso NÃO significa 28,88 GB seguramente removíveis, porque tags e camadas
podem ser compartilhadas e imagens podem servir de rollback.

O PR implementa:
- Reutilização do mesmo SHA + mesmo Dockerfile/contexto de um lote validado:
  `docker tag` reutiliza o mesmo image ID e camadas; **não** compila novamente,
  não cria outro contêiner nem ocupa outra cópia integral das camadas.
- Exatamente um build ativo por host; homologação isolada usa o mesmo lock.
- **Build novo bloqueado** se disco livre <14 GiB, MemAvailable <2 GiB,
  swap ocupado >75%, >=20 IDs distintos de imagens ou >=2 candidatos
  `BUILT_NOT_DEPLOYED` com imagem presente. Os limites são conservadores e
  devem ser calibrados com métricas reais antes da instalação.
- **Homologação temporária**: `docker run --rm --detach`, sem restart,
  com limites de 3 GiB RAM, 4 GiB RAM+swap e 1 CPU. Um contêiner
  interrompido não deve permanecer como contêiner parado; limpeza extra
  no EXIT. Não inicia sob falta de RAM, swap ou <3 GiB livres.
- Auditoria `auditReadiness` lista quantidade de IDs de imagens, contêineres
  ativos/parados, volumes, MemAvailable e swap, e apresenta candidatos de
  limpeza **somente para revisão humana**, sem apagar arquivos ou volumes.
- **Nenhum `docker prune`, `docker rmi` ou deleção de backups automática**.
  A limpeza inicial de imagens/contêineres antigos requer identificar
  referências de volumes, releases publicados, backups, banco, canários
  e imagens atualmente utilizadas, e aprovar exclusões específicas.

Importante: quantidade de tags/contêineres não é igual a consumo de espaço.
O inventário inicial de 40 contêineres só confirma a quantidade, não identifica
quais 25 parados podem ser removidos.

## 5) Testes a executar e evidências exigidas
1. `for f in scripts/vendi-contabo-operator scripts/vendi04-*.sh; do bash -n "$f" || exit 1; done`
2. `node --test scripts/tests/vendi-contabo-operator-status.test.mjs scripts/tests/vendi-autonomia-integrada.test.mjs`
3. `pnpm --filter @workspace/api-server exec tsc -p tsconfig.launch-ci.json --noEmit`
4. `pnpm --filter @workspace/api-server run build`
5. `pnpm --filter @workspace/cloudflare-mcp build` e `pnpm --filter @workspace/cloudflare-mcp typecheck`.
6. Testes isolados de lotes, gates negativos, banco separado e receipt.
7. Contabo: snapshot anterior restaurável; testar homolog e rollback em
   staging, nunca assumir que HTTP 200 sozinho comprova funcionalidade.

**Status em 27/10/2026:** código em PR draft, incluindo o gate do Release Center e lease de missões; testes e instalação no host
não executados nesta etapa. Produção não alterada.

## Auditoria operacional de retomada (27/10/2026)

**Escopo:** consultas diretas Contabo/GitHub sem alteração da produção; correções abaixo realizadas somente nesta branch, não instaladas.

- Produção e homologação: health HTTP 200. Browser Agent: configurado; teste de navegação somente leitura em homolog.appvendorai.com/tad retornou sucesso. CRM de homologação retornou resumo read-only do tenant homolog-krafht.
- VPS: / de 96 GB, aproximadamente 85 GB usados (89%), ~12 GB livres; 40 contêineres no total, 15 ativos, 25 entradas de imagens. **Não executar prune indiscriminado.**
- Host: VENDI-3657 ainda LOT_NOT_REGISTERED, nenhum build. Baseline VENDI-02 informa ROLLBACK_BACKUP=missing para o seu contêiner de homologação; verificar independentemente o rollback **de produção** antes do primeiro release.
- PR 3657: continua draft e não mesclado. O commit candidato deve ser reobtido do HEAD após cada alteração; releases e aprovações anteriores não servem para SHA novo.
- Ajustes feitos nesta branch: encadeamento controlado de releases PUBLISHED → SUPERSEDED após saúde; restauração do estado anterior em falha; sinalização correta de capacidade de novo build (14 GiB) no preflight; cache PNPM com tentativa CoW e fallback de store **somente leitura** em ext4 sem cópia integral; regressões dos scripts incluídas na suite MCP/full. A instalação do operador novo ainda requer bootstrap com acesso administrativo.
- Verificações de fonte dos pontos alterados foram executadas; **não** equivalem a `bash -n`, `node --test`, `tsc`, build real, teste de rollback nem homologação de candidato. Testes isolados continuam bloqueados pelo executor remoto existente.
- Antes de publicar: comprovar cron lock real, identidade e restauração de backups, migrations, grants OAuth, capacidade do host e duas publicações consecutivas em staging. Não marcar nenhuma etapa de implantação como concluída sem evidências.

## Revisão operacional de 28/10/2026 — PR #3657

Esta seção prevalece sobre descrições históricas acima. Nenhuma instalação,
publicação, migration de produção, merge ou limpeza do host foi executada.

- Publicações sucessivas transferem PUBLISHED/SUPERSEDED após saúde; rollback
  reativa o predecessor e preserva os backups. Interrupções mantêm marcador
  INCONSISTENT para reconciliação administrativa. A consistência é decidida
  depois do flock em `/opt/vendorai/deploy.lock`, compartilhado com o cron.
- Build exige 14 GiB livres, 6 GiB MemAvailable (4 de orçamento + 2 de reserva),
  swap usado <=75%, menos de 20 imagens distintas e limite de candidatos.
  Limites Docker: 4 GiB, sem swap adicional, uma CPU; sem remoção automática.
- Testes exigem 8 GiB livres e o mesmo orçamento de memória. O store pnpm usa
  reflink obrigatório ou bind somente leitura; não faz cópia integral fallback.
- Homologação usa o DB local da rede Docker existente, fixa todas as variantes
  de URL no mesmo banco e impõe sessões read-only. URLs externas são recusadas.
- Central usa o MCP existente, com binding administrativo por release UUID,
  lote existente e SHA completo (`VENDI_RELEASE_BINDINGS`). O endpoint privado
  `VENDI_RELEASE_MCP_URL` e o token OAuth `VENDI_RELEASE_MCP_OAUTH_TOKEN` são
  provisionados fora do Git. Não cria PR nem mescla main para publicar.
- `/admin/releases/:id/operator` permite build/homologate/releaseStatus a
  super_admin. Os recibos ficam em `admin_releases.test_summary`. Publish e
  rollback passam pelo mesmo operador, grants por ação/lote e digest ativo.
  É uma integração de backend; publicação de frontend no Cloudflare Pages
  não está automatizada por este adaptador.
- O grant OAuth identifica cliente assinado dedicado, não a pessoa dentro de
  cliente compartilhado. Token legado não autoriza operações no host.
- Release exige arquivo root:600 `<lote>.tests` com LOT, SHA,
  STATUS=PASSED e SUITE=api,mcp,operator,rollback,migrations. Somente responsável
  pelos testes pode atestar o resultado; arquivo não foi criado nesta rodada.
- Migration de leases testada duas vezes em PostgreSQL 17 descartável, com
  roles, RLS, disputa/expiração, cascade e dump/restore de dados sintéticos.
  Isso NÃO valida catálogo, papéis, backup integral ou restore do vendorai-core.

Evidências da rodada: 30 testes Node de operador/ponte/cache + 10 de OAuth e
política; 6 cenários Bash executados por harness Python (Docker simulado),
3 cenários do gerador real de ambiente e 14 regressões da fachada de testes.
Build/typecheck MCP e typecheck direcionado do adaptador passaram. Ensaio
Docker real com serviços sintéticos e migration/restore sintéticos passaram.
Typecheck global API abortou por heap; build API isolado falhou por dependências
ausentes no cache reutilizado. Candidato real não foi construído/homologado.

Bloqueios observados: VPS abaixo dos gates de disco/RAM/swap; imagem do executor
não está presente; lock global de build ausente; nenhum manifesto existente
aponta para o SHA deste PR; versão ativa foi alterada externamente durante a
inspeção e exige reconciliação de proveniência. Não registrar novo lote:
responsável deve definir a atualização controlada de um registro existente,
preservando histórico e backups. Não habilitar flags da Central até concluir
os gates. Missões com etapa >4h ainda exigem heartbeat independente.

## Diretriz posterior de 28/10/2026 — autorização dinâmica e publicação direta

O pedido atualizado substitui a obrigatoriedade de homologação. Publicação direta
passa a exigir `.tests` root:600 com LOT, SHA, IMAGE_ID, AT_EPOCH (até 24h),
STATUS=PASSED e SUITE=api,mcp,operator,rollback,migrations. Mantêm-se aprovações,
backup, schema review, lock do cron, saúde e reversão. Homologação continua
opcional. O publicador atual é de API: TARGET ausente conserva o legado api;
TARGET diferente de api falha fechado, sem publicar módulos errados.
O preflight não depende mais do container removido vendorai-homolog-api.
Essas mudanças de host/API permanecem código candidato, não instalado.

Autorização dinâmica de #3661 incorporada sem perder validações de documentos
nulos, ações extras e grants por ação. Emissão OAuth agora inclui client assinado,
preservando correção já presente na imagem instalada mas ausente nesta branch.
Teste real de emissão/refresh verifica a identidade usada pelos grants.

Com autorização expressa do usuário, o MCP existente recebeu somente o módulo
da PR #3661 (fonte d2f110abf1a138bdabd71ec0977ed6856d4509d6), preservando os demais
binários, configuração, ações concedidas e segredos. Imagem derivada do baseline
060360e3df1f, sem reconstruir API ou outros serviços. allRegisteredLots=true foi
ativado somente no único cliente já autorizado. SSH passou a bind persistente
read-only; JSON de recriação root:600 em /etc/vendorai/mcp-novo/create.json.
Backup do container anterior mantido; oito testes em imagem isolada e saúde
HTTP passaram. Rollback real ao container anterior e retorno ao candidato
passaram com HTTP 200 em ambos. O conector autenticado chegou ao operador para
VENDI-3616; preflight host falhou pelo nome de homologação removido. Lote ausente
continua negado pelo host. Não ocorreu publicação ou migração de API/DB.

Inventário anterior de disco está superado: nova consulta confirmou 17.33 GiB
livres, 14 imagens distintas antes da imagem MCP candidata, 12 containers/8
ativos antes da atualização, MemAvailable ~2.14 GiB e swap ~31%. RAM ainda
abaixo do gate de 6 GiB para build/testes completos. Nenhuma limpeza feita nesta
tarefa; exclusões anteriores ocorreram externamente. Backups de produção,
manifestos e dados preservados. Integração completa com a Central e publicação
real da API ainda dependem de testes completos, proveniência, backup/restore e
instalação autorizada do restante do operador. Não declarar autonomia integral.

Fechamento da ativação MCP: após ensaio real do preflight contra o host, somente
`vendi04-release-preflight` foi atualizado com backup e locks. Hash instalado:
bdeb80d314dada5e20cdacffb6a588fa84e0d5d2084a53ea71957cd1f5e6b77d.
O preflight de VENDI-3616 passou pelo conector OAuth/SSH real, com SHA do manifesto
confirmado. É aprovação de saúde/workspace, não aprovação de build/publicação.
O instalador legado não persistente foi desabilitado no código para impedir
retorno ao container aposentado ou sobrescrita parcial do MCP.
Regressões desta diretriz: 42 testes Node e 8 cenários Python/Bash passaram;
MCP build/typecheck e adaptador typecheck passaram. Publicador direto continua
não instalado. API mudou externamente durante a sessão para a variante
login-3659-tad-3660-commercial-3662; esta tarefa não publicou essa versão.
