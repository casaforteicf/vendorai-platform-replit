# ARQ-LOTE1-MOTOR — Fechamento do motor (terreno, importação, Postgres, render, chat)

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-03
**Branch:** `codex/arqdor-contracts-fix`
**Estado:** **validado tecnicamente** — `tsc 0` · **690 asserts em 28 suítes** · `build 0`
**Não homologado, não publicado.** Nenhum merge/deploy.

---

## 1. Terreno (Google/OSM) — motor pronto

`terreno/localizacao.ts`
- aceita `-23.55, -46.63` (vírgula, ponto e vírgula ou espaço), `@lat,lng,17z`, `?q=`, `&ll=`,
  `mlat/mlon` (OSM) e `geo:`;
- valida faixa (lat ±90, lng ±180) e erros tipados `VAZIO` / `FORMATO_INVALIDO` / `COORDENADA_FORA_DA_FAIXA`.

`terreno/tiles.ts`
- projeção Web Mercator (`lonParaTileX`, `latParaTileY`, `tileDaLocalizacao`), `metrosPorPixel`;
- URL por provedor: OSM (`tile.openstreetmap.org`), Esri World Imagery, Google Static Maps
  (`satellite`, exige chave — sem chave devolve `null`);
- `atribuicaoTerreno` embute a atribuição obrigatória.

`terreno/terreno.ts`
- cria **um quad** (4 vértices, 4 arestas, 1 face com `material: MAT-TERRENO`) em metros;
- nome marcado `__terreno__lat,lng@z` → `ehTerreno` / `contabilizaNoOrcamento` = **false**;
- nunca é materializado como `ElementoBim`, então **não entra no quantitativo/orçamento**;
- `textura` devolve URL, atribuição, lat/lng, zoom e metros/pixel (o canvas usa isso para o UV).

**Pendente (UI):** baixar a imagem e aplicar como textura (o motor entrega URL + escala). Nenhuma
chamada de rede foi feita — provedor/zoom e licença (OSM exige atribuição; Google exige chave/ToS).

## 2. Importação (GLB/DXF agora; IFC/glTF recusados com motivo)

- `importacao/glb.ts`: container glTF binário lido à mão (chunks JSON/BIN, `accessors` de POSITION
  float32 VEC3, índices 8/16/32 bits). Sem dependência externa.
- `importacao/dxf.ts`: ASCII, entidades `3DFACE` e `LWPOLYLINE` fechada (por elevação). `LINE`/`ARC`
  não formam face e são ignorados — não inventamos espessura.
- `importacao/processar.ts`: detecta formato, converte malha em **sólido único** com dedupe de
  vértices, centra a bbox em (x,z) e apoia a base em `y = 0`; devolve **uma** operação
  `criar_solido` ⇒ **um único PassoUndo**.
- `importacao/worker.ts`: worker real (mensagem com bytes → resultado), **sem** wiring de bundler.
- Recusas explícitas: `.gltf` → "use .glb"; `.ifc` → "exige web-ifc (dependência pesada),
  pendente de aprovação"; extensão desconhecida → `FORMATO_DESCONHECIDO`.

**Decisão pendente do dono:** IFC exige `web-ifc` (WASM, ~1 MB+) ou serviço externo — não instalei
nada sem alinhamento.

## 3. Postgres (Supabase)

- `persistencia/postgres.ts`: `criarAdaptadorPostgres(pool)` com **injeção de `PoolLike`** (sem
  dependência `pg` no bundle), upsert por `id` em `arqdor_projetos`, leitura e listagem;
- `criarAdaptadorResiliente`: se o Postgres lançar, cai para o adaptador local (dev sem rede/banco);
- `adaptadorDeAmbiente(env, local, pool)`: com `DATABASE_URL` **e** pool → Postgres resiliente; sem →
  local;
- migração: `artifacts/arqdor-studio/migrations/001_arqdor_projetos.sql`
  (`id text pk`, `dados jsonb`, timestamps, índice de atualização).

**Pendente (integração):** o `EditorShell` ainda usa o adaptador local. Ligar a persistência no app
exige uma rota server-side que crie o `pg.Pool` a partir de `DATABASE_URL` — é mudança de app, não de
motor, e ficou fora para não mexer na UI atual.

## 4. Render — worker legado da Contabo

- `render/transporte-http.ts`: `criarTransporteHttp` (POST `${base}/render`, GET
  `${base}/render/:jobId`, `Bearer` opcional, estados validados: `na_fila|processando|pronto|falhou`);
- `transporteDeAmbiente(env, fetch)`: lê `RENDER_WORKER_URL`, `RENDER_WORKER_TOKEN`, `R2_BUCKET`;
  sem URL → **null** (a UI deve dizer "render não configurado", não tentar e falhar);
- a imagem é consumida como **URL presignada** devolvida pelo worker (R2), nunca caminho público fixo.

**Pendente:** nenhuma chamada real — não há URL/token do worker nesta máquina.

## 5. Chat IA

Já entregue nos commits `0de0fb698` e `79ea19e82`: painel mínimo (topbar do editor + sidebar),
rota `/api/ia/chat` com a chave no servidor, `ToolCallIA` → `executarPlano` → `aplicarPassoDaIA`, e
modo local rotulado quando não há chave. Nada alterado neste lote.

## 6. Testes (novos: 70 asserts em 3 suítes)

| Suíte | Asserts | Cobre |
|---|---|---|
| `tests/lote1-terreno` | 26 | parse (5 formatos), tiles/URL/atribuição, quad de terreno, exclusão do orçamento, recusas |
| `tests/lote1-importacao` | 22 | GLB montado no teste, centragem/base, DXF quad, IFC/glTF recusados, operação única |
| `tests/lote1-infra` | 22 | upsert/leitura/lista no Postgres, fallback local, escolha por ambiente, transporte HTTP, 500, estado inválido, env do render |

```
npx tsc -p tsconfig.json --noEmit   → exit 0
npx tsc -p tsconfig.check.json      → exit 0
node tests/run-all.mjs              → 28 suítes · 690 asserts · 0 falhas
npx next build                       → exit 0 (após limpar .next)
```

**Evidência do pitfall conhecido:** o primeiro `next build` falhou com
`PageNotFoundError: Cannot find module for page: /_document` porque o `.next` estava contaminado por
dev+build. `rmdir /s /q .next` + build → exit 0. Não é regressão de código.

## 7. Bloqueios reais e próximos passos

| Item | Bloqueio | Responsável |
|---|---|---|
| Baixar tile/textura do terreno | UI nova (canvas) | DeepSeek |
| Worker de importação no bundle | config de worker no Next + botão de importar (UI) | DeepSeek |
| IFC | dependência `web-ifc` (decisão de custo/tamanho) | dono |
| App usando Postgres | rota server-side + `pg.Pool` + `DATABASE_URL` real | próximo lote de infra |
| Render de verdade | `RENDER_WORKER_URL`/token do worker na VPS | dono (credencial) |
| Chat com modelo real | `DEEPSEEK_API_KEY` | dono (credencial) |
