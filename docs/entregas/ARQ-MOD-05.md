# ARQ-MOD-05 — Booleanas (Bloco 5) e Snap (Bloco 6)

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-02
**Estado:** implementado e validado tecnicamente no motor; **UI não verificada em navegador neste turno** (dev server fora do ar — ver pendências)

## Booleanas (D14) — `modelador/booleana.ts`
- Motor **manifold-3d**: união, diferença e interseção; resultado HERDA o id de A (E9) e o sólido B é consumido.
- `transformacao` é *baked* no mesh antes da operação (senão mover com o gizmo faria a booleana operar na posição antiga).
- Erros do contrato respeitados: `WASM_NAO_CARREGADO` antes do carregamento, `LIMITE_TRIANGULOS`, `NAO_MANIFOLD`, `OPERACAO_INVALIDA`.
- Saída triangulada (`Face.triangulada = true`), arestas únicas reconstruídas.
- WASM carregado **sob demanda** e servido de `public/manifold/` (o pacote é ESM gerado por Emscripten e referencia `node:module`; empacotá-lo quebrava o build do Next).
- Store já suportava `aplicar_booleana`; a UI aplica com `aplicar([resultado.operacao])` (undo restaura os dois sólidos).

## Snap (Bloco 6) — `modelador/snap.ts`
- `calcularSnap` implementado: vértice (prioridade 100), aresta (70) e fallback de grade (10), com **raio em pixels de tela** e projeção injetada (domínio sem three).
- Canvas: candidatos montados a partir dos sólidos em coordenadas de mundo; `pointermove` calcula o snap e posiciona um **marcador verde**; o clique no plano usa o ponto do snap quando existe.
- Gizmo ativo desliga o snap (C13).

## Validação
```
tsc (4 gates) → exit 0
tests/run-all.mjs → 282 asserts, 0 falhas
   + booleana 17 · snap 14
```
Volumes conferidos por teste: dois cubos 2×2×2 com sobreposição 1×2×2 → união 12 m³, diferença 4 m³, interseção 4 m³.

## Defeito encontrado e corrigido no caminho
O winding das 6 faces de `criarCaixa` estava **invertido em todas** (sólido "do avesso"): a interseção passava, mas união e diferença davam volume errado. Corrigido com produto vetorial face a face.

## Pendências
- **Servidor de desenvolvimento precisa ser reiniciado pelo usuário** (`npm run dev` em `artifacts/arqdor-studio`): o sandbox bloqueia `spawn` do Next (`EPERM`), e o processo anterior caiu no erro de build.
- **Aba 4 — abertura cortando o mesh 3D**: NÃO implementada neste lote. Hoje o vão afeta planta, orçamento e memorial; o corte do volume é o próximo passo e depende desta booleana.
- UI de booleanas e snap não passou por verificação visual nesta rodada (servidor fora).