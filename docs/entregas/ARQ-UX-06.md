# ARQ-UX-06 — UX SketchUp: duplo clique na medida, ferramenta Offset e overlay

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-03
**Estado:** implementado · validado tecnicamente (tsc + 329 asserts + build de produção) · **não** validado em navegador neste lote

## Itens

| # | Pedido | Situação real | Ação |
|---|---|---|---|
| 1 | duplo clique para alterar medida da face | não existia; e **2 cliques já eram seleção de loop** (commit `0eac2bffb`) | duplo clique na face abre o campo de medida; **só com Push/Pull ativo**, para não atropelar o loop |
| 2 | ferramenta OFFSET na UI | o motor já tinha `offsetPoligono` (commit `14d821cad`); faltava ligar a face do sólido à UI | `offsetDaFace` (pura) + seção **Offset** no inspetor, aplicando `adicionar_vertices` + `adicionar_arestas` |
| 3 | overlay de seleção (face azul, loop verde) | **já entregue** no commit `9b5998ed5` (`ModeladorCanvas`, bloco "Overlay de seleção: face azul translúcida, loop verde") | verificado, nenhuma alteração necessária |

## Decisão de interação (item 1)

Dois cliques rápidos já significavam **loop** (1 = face, 2 = loop, 3 = sólido). Fazer o duplo clique abrir a
medida em qualquer contexto mataria essa seleção. Reconciliação adotada:

- **Push/Pull ativo** → duplo clique na face abre a medida (altura) com foco no campo;
- **qualquer outra ferramenta** → dois cliques continuam selecionando o loop, como antes.

O handler também força `selecaoNivel = face`, para o overlay azul não ficar contradizendo o campo aberto.

## Offset — limite declarado

`offsetDaFace` só aceita **face horizontal** (piso/laje), porque o cálculo é em planta (X, Z). Face vertical
retorna `FACE_VERTICAL` com mensagem na UI, em vez de gerar contorno degenerado. O `offsetPoligono` continua
só com convexo — côncavo segue registrado como limite no próprio módulo.

Ids determinísticos (`<solido>/<face>/off<i>`): repetir o mesmo offset não duplica geometria.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `src/arqdor/editor/modelador/offset.ts` | `offsetDaFace` (face → vértices/arestas), tipos de erro |
| `src/arqdor/editor/painel/PainelPropriedades.tsx` | seção `SecaoOffset` + prop `aoOffset`; divisórias inline passaram a usar `--arq-ed-linha` |
| `src/arqdor/editor/painel/BarraMedidas.tsx` | prop `focarEm` (foco/select no campo por duplo clique) |
| `src/arqdor/editor/modeladorcanvas/ModeladorCanvas.tsx` | prop `aoDuploCliqueFace` + listener `dblclick` com raycast de face |
| `src/arqdor/editor/EditorShell.tsx` | handlers `aplicarOffset` / `abrirMedidaDaFace` e fiação das props |
| `tests/precisao/check.ts` | 9 asserts novos (offset por face, cota, ids, face vertical, inexistente, colapso) |

## Validação

```
npx tsc -p tsconfig.json --noEmit   → exit 0
npx tsc -p tsconfig.check.json      → exit 0  (compila src + tests para .check-out)
node tests/run-all.mjs              → 329 asserts, 0 falhas (16 suítes; precisão 31 → 40)
npx next build                      → exit 0  (9 rotas; /modelagem 176 kB)
```

Atenção operacional: `tests/run-all.mjs` importa **`.check-out/**` compilado**. Rodar só `node tests/run-all.mjs`
depois de editar testes executa o build antigo — é preciso `tsc -p tsconfig.check.json` antes (é o que
`npm run test:camadas` faz).

## Pendências

1. **Validação em navegador**: duplo clique, offset e overlay precisam de projeto com sólido selecionado.
2. Offset em face vertical (parede) e polígono côncavo continuam fora do escopo.
3. Homologação do lote de UX depende do teste visual do solicitante.
