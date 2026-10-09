# CLAUDE.md — Como trabalhar no Vendor.ai

Guia operacional para qualquer agente/dev que for trabalhar neste repositório.
Monorepo pnpm. Backend em `artifacts/api-server`.

## Regras inegociáveis

- **Nunca usar Replit.** Todo trabalho técnico é via **Git direto**.
- **Commits** sempre com e-mail `marcosreisdorfer@gmail.com` (o GitHub só reconhece esse).
- **Soluções enxutas e baratas.** Não introduzir serviço pago novo sem alinhar antes.
- Sempre incluir **links diretos** relevantes nas respostas ao usuário.

## Infra (out/2026)

- **Backend:** Contabo VPS (`root@31.220.96.205`), Docker.
  - `vendorai-prod-api-candidate` → produção, `127.0.0.1:5001`, rede `vendorai-prod`.
  - `vendorai-homolog-api` → homologação, `127.0.0.1:5000`, rede `vendorai-homolog`.
  - `vendorai-prod-browser` → motor de render/PDF (puppeteer), rede `vendorai-prod`.
  - nginx faz reverse proxy do domínio → `127.0.0.1:5001`.
- **Banco:** Supabase (Postgres).
- **Storage/arquivos:** **Cloudflare R2** (bucket privado). Migrado do Supabase Storage em out/2026. Os arquivos foram copiados pro R2 e **apagados do Supabase** — o código PRECISA ler do R2.
- **Frontend:** Cloudflare Pages (auto-deploy nativo do Git — **não** usa GitHub Actions).
- **GitHub Actions:** **BLOQUEADO** (billing da conta). Não dá pra usar runner/Actions.
- **Railway / Vercel:** legado / fora de uso.

## Deploy (auto-deploy na própria Contabo — custo zero, sem GitHub Actions)

```
push/merge na main
  → cron (~2 min) em /opt/vendorai/deploy-backend.sh detecta commit novo
  → build da imagem (Dockerfile.deploy, com gate tsc + esbuild)
  → HOMOLOGAÇÃO (:5000) → healthcheck
  → se passar, PRODUÇÃO (:5001) → healthcheck
  → rollback automático se a prod não responder
```

- **Deploy manual:** `FORCE=1 bash /opt/vendorai/deploy-backend.sh`
- **Rollback p/ imagem específica:** `DEPLOY_IMAGE=vendorai-api:r2 bash /opt/vendorai/deploy-backend.sh`
- **Healthcheck correto:** `/api/auth/healthz` (NÃO `/api/healthz`).
- O usuário opera por arquivos `.cmd` no Windows (ele não cola no PowerShell).

## Validação obrigatória ANTES de qualquer push

De `artifacts/api-server`:

```
pnpm install --no-frozen-lockfile
../../node_modules/.bin/tsc -p tsconfig.launch-ci.json --noEmit   # EXIT 0 obrigatório
node ./build.mjs                                                   # EXIT 0 obrigatório
```

> ⚠️ O `tsc` do `launch-ci` cobre só um SUBCONJUNTO dos arquivos. O **`node build.mjs`
> (esbuild) é o gate real** — segue todos os imports a partir de `src/index.ts` e pega
> corrupção, símbolo/função duplicado, export faltando, etc. **Nunca confie só no tsc.**

Mudança que toca storage ou algo crítico de produção: fazer **teste controlado na prod**
com rollback à mão.

## Storage (R2) — atenção

- `artifacts/api-server/src/lib/objectStorage.ts` é **R2-aware**: escreve/lê no R2 quando as
  variáveis `R2_*` estão setadas, com **fallback de leitura** no Supabase.
- API pública inalterada (`getObjectEntitySignedUrl`, `getObjectEntityUploadURL`,
  `savePrivateBuffer`...). **Não mudar as assinaturas** (~9 chamadores).
- URL temporária de arquivo = **presignada do R2** (token+TTL na query).
- Rota `/api/storage/objects/*` é **autenticada** (proteção de pasta); `/api/storage/public-objects/*` é pública (streaming).
- **NUNCA** reverter o storage pra Supabase puro — os arquivos não existem mais lá.

## Armadilhas conhecidas

- O workflow `merge-release-agent` foi **desativado** (causava corrupção: funções/blocos duplicados).
- `.cmd` no Windows: no `ssh "..."` **não usar aspas duplas internas** nem **parênteses em `echo` remoto** (quebram o shell). Comparações numéricas, aspas simples OK, redirecionar saída pra `.txt` no Desktop + abrir no notepad.

## Comandos úteis na VPS

```
cat /opt/vendorai/deploy-state/last-status
ls -t /opt/vendorai/logs/deploy-*.log | head -1
docker ps --format '{{.Names}} | {{.Image}} | {{.Status}}'
crontab -l | grep deploy-backend.sh      # automático ligado?
```
