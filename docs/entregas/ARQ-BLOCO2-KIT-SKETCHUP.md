# ARQ-BLOCO2 — Kit SketchUp (navegação, gizmo com readout, offset em qualquer face, BIM sincronizado)

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-03
**Estado:** implementado · validado tecnicamente (tsc + 340 asserts + build) · **parcialmente validado em navegador**

## Os 7 itens

| # | Pedido | Situação | Evidência |
|---|---|---|---|
| 1 | meio = PAN, direito = ORBIT, roda = ZOOM | **implementado** | `OrbitControls.mouseButtons` (MIDDLE→PAN, RIGHT→ROTATE, LEFT→ROTATE), `enableZoom`, `contextmenu` suprimido no canvas |
| 2 | Mover com `deltaEixo` e distância ao vivo | **implementado** | HUD no canvas via `textoDoArrasto` + `objectChange` do TransformControls; formatação testada (eixo dominante + distância 3-4-5) |
| 3 | Rotacionar com ângulo ao vivo | **implementado** | mesma HUD; `textoRotacionar` testado (90° em Y, 45° em X) |
| 4 | Escalar com readout | **implementado** | mesma HUD; `textoEscalar` testado (fator × 2,00) |
| 5 | Offset em qualquer face | **implementado e validado em navegador** | offset resolvido na base da própria face (`u` = 1ª aresta, `v` = n × u); face vertical aceita |
| 6 | Push/Pull em sólido já BIM | **implementado e validado** | já funcionava; agora `aplicarGeometria` **reprojeta o elemento BIM automaticamente** |
| 7 | Duplo clique abre a medida com foco | **implementado** | detecção por tempo (400 ms, mesma face); agora em **qualquer** ferramenta (troca para Push/Pull e foca) |

## Mudanças de motor (puras, testáveis)

- **`modelador/gizmo-hud.ts` (novo):** `textoMover`, `textoRotacionar`, `textoEscalar`, `textoDoArrasto`.
  Usa `eixoDominante`/`deltaEixo` do snap — o readout mostra eixo + valor, não só um número solto.
- **`modelador/offset.ts`:** `offsetDaFace` deixou de ser “só planta (X,Z)”. Agora monta a base
  ortonormal do plano da face (normal de Newell, `u` = primeira aresta, `v` = n × u), roda
  `offsetPoligono` nessa base e devolve os pontos em 3D. `FACE_VERTICAL` **deixou de existir**.
- **`EditorShell.aplicarGeometria`:** aplica as operações no modelador e, se o sólido já está
  materializado, roda `materializarSolidos` sobre o estado previsto (`aplicarPasso`) e emite
  `atualizar_elemento_bim` — fecha a dessincronia que o aviso âmbar só explicava.
  Usado por Push/Pull, Offset e pelo gizmo.

## Validação em navegador (`:5183`, dev subido nesta sessão)

| Passo | Resultado |
|---|---|
| Sólido BIM carregado (16 v / 28 a / 16 f) | render ok, sem erro de runtime |
| Face **vertical** selecionada | tooltip "4,00 × 3,20 m · 12,80 m²" |
| Offset `0,15` na face vertical | **"Offset de 0,15 m — borda paralela criada (BIM atualizado)"** + borda paralela desenhada na face |
| Texto da seção Offset | corrigido para "horizontal ou vertical" (hot reload confirmado) |

## O que NÃO foi verificado por este agente

- **Navegação (item 1) e HUD do gizmo (itens 2–4):** exigem arrasto de mouse (botão do meio,
  direito, alça do gizmo). A automação disponível só dispara cliques simples — não há como
  segurar e arrastar. A configuração está aplicada e o formatador está testado, mas o gesto
  precisa do seu teste humano.
- **Duplo clique universal:** o mecanismo (tempo) já foi validado antes; a mudança de hoje
  (funcionar em qualquer ferramenta) não foi reexecutada no navegador.

## Gates

```
npx tsc -p tsconfig.json --noEmit   → exit 0
npx tsc -p tsconfig.check.json      → exit 0
node tests/run-all.mjs              → 340 asserts, 0 falhas (precisão 40 → 51)
npx next build                      → exit 0 (/modelagem 177 kB)
```

## Observação de ambiente

O `next dev` da porta 5183 tinha caído; foi reaberto por esta sessão (terminal próprio) e ficou
rodando para o seu F5. Projeto de teste "Projeto 03/11/2026" continua no banco (criado no lote
anterior) — pode ser apagado pela Lixeira.

## Pendências

1. Teste humano de arrasto: PAN (meio), ORBIT (direito), ZOOM (roda), e a HUD durante mover/rotacionar/escalar.
2. Promoção para produção (push em `main`) segue não executada.
