# ARQDOR STUDIO 2.0 — FOUNDATION (branch de trabalho)

Branch: `codex/arqdor-studio2-foundation-20261102`
Base: `main` (atualizada em 2026-11-02)
Raiz do app: `artifacts/arqdor-studio/`

## Por que este branch existe

Os Blocos 1–4 do modelador (schema, plano, store, push-pull, gizmo, painel de sólidos) foram
desenvolvidos num ambiente Replit que **não existe mais**. Nada foi localizado no GitHub nem no PC
local — a busca completa está registrada no §0 de:

- `docs/arqdor/ARQDOR-STUDIO-2.0-MODELADOR-BLOCO-5-BOOLEANAS-V1.md`
- `docs/arqdor/ARQDOR-STUDIO-2.0-MODELADOR-BLOCO-6-INFERENCIA-V1.md`

Este branch é a **nova casa** do Arqdor Studio 2.0, recomeçando do Bloco 0.

> Nome `codex/arqdor-3d-model-foundation` **já está ocupado** por um branch antigo (2026-10-11,
> 322 commits à frente / 290 atrás da `main`, conteúdo de contrato GLB). Não foi reutilizado.

## Por que `artifacts/arqdor-studio/`

O `pnpm-workspace.yaml` declara `artifacts/*` como pacotes do workspace. Colocar o app aqui dá:

- instalação isolada: `pnpm install --filter @workspace/arqdor-studio`
- `tsconfig` próprio: `tsc -p artifacts/arqdor-studio/tsconfig.json`
- zero poluição no `package.json` raiz do monorepo

O mapa de arquivos do documento mestre (`src/arqdor/editor/...`) é preservado **dentro** desta raiz.

## Mapa de arquivos

```
artifacts/arqdor-studio/
├── package.json
├── tsconfig.json
└── src/
    ├── arqdor/editor/
    │   ├── index.ts                 (placeholder de toolchain)
    │   ├── bim/                     schema.ts, store.ts, mapper.ts, derivar2d/3d.ts
    │   ├── modelador/               schema.ts, plano.ts, store.ts, hitTest.ts, desenho.ts
    │   │   └── ferramentas/         criarLinha/Retangulo/Circulo/Arco, pushpull
    │   ├── viewport2d/              Viewport2D.tsx
    │   ├── viewport3d/              Viewport3D.tsx, cena.ts
    │   ├── modeladorcanvas/         ModeladorCanvas.tsx, ToolbarModelador.tsx
    │   ├── painel/                  PainelLateral, PainelSolidos, AbaCamadas, AbaBIM, modais
    │   └── hooks/                   useVisibilidadeCamadas.ts
    ├── lib/db/
    │   ├── schema/                  archProjetos.ts, archElementosBim.ts
    │   └── migrations/              000X_arch_elementos_bim.sql
    └── app/api/projetos/[id]/elementos/[elementoId]/route.ts   GET/POST/PATCH/DELETE
```

## Instalação e typecheck (o gate do Bloco 0)

```
pnpm install --filter @workspace/arqdor-studio
cd artifacts/arqdor-studio
$env:NODE_OPTIONS = "--max-old-space-size=4096"   # maquina de 8 GB: feche Chrome/IDE antes
npx tsc -p tsconfig.json --noEmit                  # EXIT 0 obrigatorio
```

Notas de ambiente já medidas nesta máquina:

| Fato | Consequência |
|---|---|
| 7,9 GB de RAM, ~1,4 GB livre | `tsc` já estourou heap antes (`typecheck-3593-memory.log`) |
| C: com ~12 GB livres (89% usado) | `pnpm install` desta app ≈ 500–700 MB; liberar antes |
| D: com ~670 GB livres | alternativa: `pnpm config set store-dir D:\pnpm-store` |
| `pnpm-workspace.yaml` tem `minimumReleaseAge: 1440` | pacote publicado nas últimas 24h é recusado; se acontecer, use versão com ≥ 1 dia |

## Dependências já fixadas

| Pacote | Versão | Origem |
|---|---|---|
| next | 15.5.24 (pin) | mesma versão de `tad/apps/web` — reaproveita o store |
| react / react-dom | `catalog:` | 19.1.0 do catálogo |
| drizzle-orm / zod | `catalog:` | versões do monorepo |
| three / @types/three | ^0.187.0 | bloco visual 3D |
| zustand | ^5.0.16 | stores separados |
| manifold-3d | ^3.5.4 | booleanas (Bloco 5) |
| three-bvh-csg | ^0.0.18 | booleana auxiliar |
| @thatopen/components | ^3.6.0 | IFC (futuro) |
| pg / @types/pg | ^8.23.1 / ^8.11.10 | Drizzle → Postgres |

> Confirmar as assinaturas do `manifold-3d` na versão instalada antes de escrever o adaptador
> (`B5-1.4` do documento do Bloco 5).

## Regras de ouro (não-negociáveis)

1. `Vetor3 = [number, number, number]` — tupla, nunca `{x,y,z}`.
2. Undo agrupado: `PassoUndo = OperacaoModelador[]`; 1 comando = 1 passo.
3. `useModeladorStore ⊥ useBIMStore` — nunca misturados.
4. `CAMADA_MODELADOR = "__modelador__"` — sentinela, nunca filtrada.
5. Fonte única: `arch_elementos_bim` + `solidos`.
6. Sem `any`, sem `as never`, sem `@ts-expect-error` em produção.
7. Verde ARQDOR `#2e7d32`, fundo `#f5f7f5`.
8. Sem Railway, sem deploy por Replit, sem dependência de GitHub Actions.
9. Estado de UI separado do documento.
10. `proximoSolidoN` monotônico, sempre fora do undo.

## O que o `tsc` NÃO garante

- **Regra 6 (sem `any`)**: o compilador barra `any` **implícito** (`noImplicitAny`), não o explícito.
  Banir `any` escrito exige ESLint (`@typescript-eslint/no-explicit-any`) — fora do escopo deste gate.
- **`noUncheckedIndexedAccess` está DESLIGADO** de propósito: o modelador usa `vertices[i]` em laço
  intenso e o flag transformaria todo acesso em `T | undefined`, inundando o código de guards sem
  ganho real. Se for ligar, ligue por módulo, depois dos testes do Bloco 5/6.

## Convenção de commit

```
feat(arqdor): <o que>
docs(arqdor): <documento>
```

Autor obrigatório: `marcosreisdorfer@gmail.com`.
Não commitar: `node_modules`, `dist`, `.next`, `.env`, artefatos de render.

## Push neste PC (sandbox)

O push falha com `schannel: SEC_E_NO_CREDENTIALS` e o credential helper morre em `sh`. Use:

```
git -c http.sslBackend=openssl -c "http.extraheader=AUTHORIZATION: basic <base64(x-access-token:$(gh auth token))>" push
```