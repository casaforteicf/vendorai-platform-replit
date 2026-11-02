# ARQ-PREC-09 — Overlay de seleção (lote 3, item 1)

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-02
**Estado:** overlay implementado; **verificação visual pendente**

## Entregue
- `ModeladorCanvas` ganhou um grupo `overlay` na cena e um efeito que o reconstrói quando a
  seleção muda:
  - **face** → malha com `MeshBasicMaterial` azul (`#3b82f6`), opacidade 0,38, `DoubleSide`,
    `depthWrite: false` (não briga com a face real);
  - **loop** → `LineSegments` verde (`#22c55e`) sobre as arestas do contorno;
  - sólido inteiro continua com o destaque de cor já existente no mesh.
- `EditorShell` passou a guardar **ids** do loop (antes só a contagem) e envia
  `faceSelecionada` / `loopSelecionado` ao canvas.

## Validação
```
tsc -p tsconfig.json / tsconfig.check → exit 0
tests/run-all.mjs → 320 asserts, 0 falhas
```

## O que não foi verificado
Nesta rodada os cliques da automação **não acertaram a face** (a parede tinha sido extrudada
antes e mudou de posição), então o overlay não foi visto na tela. A lógica está ligada e
compilada; a confirmação depende de clicar numa face no navegador.

## Pendente do lote 3
- **Duplo clique para alterar a medida da face** — não implementado.
- **Ferramenta Offset na UI** — motor pronto (`offsetPoligono`), botão e fluxo não ligados.