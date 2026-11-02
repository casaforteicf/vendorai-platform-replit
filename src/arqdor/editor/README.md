# ARQDOR STUDIO 2.0 — FOUNDATION (branch de trabalho)

Branch: `codex/arqdor-studio2-foundation-20261102`
Base: `main` @ `19bb0b3`
Criado em: 2026-11-02

## Por que este branch existe

Os Blocos 1–4 do modelador (schema, plano, store, push-pull, gizmo, painel de sólidos) foram
desenvolvidos num ambiente Replit que **não existe mais**. Nada foi localizado no GitHub nem no PC
local — a busca completa está registrada no §0 de:

- `docs/arqdor/ARQDOR-STUDIO-2.0-MODELADOR-BLOCO-5-BOOLEANAS-V1.md`
- `docs/arqdor/ARQDOR-STUDIO-2.0-MODELADOR-BLOCO-6-INFERENCIA-V1.md`

Este branch é a **nova casa** do Arqdor Studio 2.0. A estrutura abaixo é um *scaffold*: pastas vazias
(`.gitkeep`) para que documentos e código entrem sem mais deslocamento de arquivos.

> Nome do branch: `codex/arqdor-3d-model-foundation` **já existe** desde 2026-10-11 (branch antigo,
> 322 commits à frente / 290 atrás da `main`, conteúdo de contrato GLB). Não reutilizamos para não
> arrastar aquele histórico.

## Mapa de arquivos (destino final)

```
src/
├── arqdor/editor/
│   ├── bim/                  schema.ts, store.ts, mapper.ts, derivar2d.ts, derivar3d.ts
│   ├── modelador/            schema.ts, plano.ts, store.ts, hitTest.ts, desenho.ts
│   │   └── ferramentas/      criarLinha, criarRetangulo, criarCirculo, criarArco, pushpull
│   ├── viewport2d/           Viewport2D.tsx
│   ├── viewport3d/           Viewport3D.tsx, cena.ts
│   ├── modeladorcanvas/      ModeladorCanvas.tsx, ToolbarModelador.tsx
│   ├── painel/               PainelLateral, PainelSolidos, AbaCamadas, AbaBIM, modais
│   ├── hooks/                useVisibilidadeCamadas.ts
│   └── EditorShell.tsx
├── lib/db/
│   ├── schema/               archProjetos.ts, archElementosBim.ts
│   └── migrations/           000X_arch_elementos_bim.sql
└── app/api/projetos/[id]/elementos/[elementoId]/route.ts   GET, POST, PATCH, DELETE
```

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

## Como validar (obrigatório antes de qualquer push)

```
cd <raiz-do-app>
npx tsc --noEmit          # EXIT 0 obrigatório
node build.mjs            # EXIT 0 obrigatório (gate real de bundle)
```

Atenção ao ambiente: esta máquina tem 8 GB de RAM (~1,4 GB livres) e o `tsc` deste monorepo já
estourou heap em execução anterior (`typecheck-3593-memory.log`). Antes de rodar:

```
$env:NODE_OPTIONS = "--max-old-space-size=4096"
```

e feche navegadores/IDE pesados. Se ainda estourar, rode por escopo (`tsc -p <tsconfig do artefato>`)
em vez do workspace inteiro.

## Documentos

- Índice dos 14: `docs/arqdor/ARQDOR-STUDIO-2.0-INDICE-DOCUMENTOS-V1.md`
- Bloco 5 (booleanas) e Bloco 6 (inferência): escritos, estado `especificado`
- Registro do lote: `docs/entregas/ARQDOR-STUDIO-2.0-LOTE-1-20261102.md`

Regra de estado: `especificado` ≠ `implementado`. Só avance o estado com evidência (log de `tsc`,
build, checklist crítico). Nunca marcar `validado` sem log.

## Convenção de commit

```
feat(arqdor): <o que>
docs(arqdor): <documento>
```

Autor obrigatório: `marcosreisdorfer@gmail.com`.
Não commitar: `node_modules`, `dist`, `.env`, artefatos de render.