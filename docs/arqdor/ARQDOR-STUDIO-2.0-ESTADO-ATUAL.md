# ARQDOR STUDIO 2.0 — ESTADO ATUAL (ponto de retomada)

**Data:** 2026-11-03 · **Branch:** `codex/arqdor-contracts-fix` · **Último commit:** `76a118741`
**Estado do código:** `tsc --noEmit` **0** · `tsc -p tsconfig.check.json` **0** · **755 asserts em 31 suítes, 0 falhas** · `next build` **0**
**Produção:** **não** promovida (branch não foi para `main`; auto-deploy da Contabo continua intocado)

---

## 1. Como retomar

```bash
cd artifacts/arqdor-studio
npm run dev:clean     # apaga .next e sobe o dev na 5180 (evita o erro de manifest)
# ou, na porta usada nos testes: npx next dev --port 5183
```

- A chave `DEEPSEEK_API_KEY` está em `artifacts/arqdor-studio/.env.local` (ignorado pelo git). O log do dev confirma `Environments: .env.local`.
- **Nunca** rodar `next build` com o dev ativo: corrompe o `.next` (`PageNotFoundError`, `manifest`). Se acontecer: parar o dev, apagar `.next`, buildar.

---

## 2. O que foi entregue

### Fase 1 e 2 (motor) — lotes anteriores
- Modelador (sólidos, push/pull, offset, gizmo por quaternion, vãos booleanos), BIM Core, quantitativos, MEP A*, memorial, conflitos, materiais (M1), biblioteca (M2), render (motor + fila), IA (ferramentas, executor atômico, ponte com store, cliente DeepSeek, chat).

### Bloco 1 — Documentação Técnica
- **Sistema de Vistas**: técnicas (planta baixa com corte em 1,50 m, implantação, cortes, 4 fachadas), axonométricas (isométrica, cavaleira) e cônicas (1/2/3 pontos).
- **Projeção ortográfica real**: matriz `makeOrthographic` aplicada na câmera, preservada no resize; desenho e snap funcionam em qualquer vista.
- **Prancha A4**: escala 1:50/1:100/1:200 com resolução do papel, carimbo com PROJETO / VISTA / ESCALA / ARQUITETO / DATA, export PNG.

### Bloco 2 — Painel de Propriedades e Camadas
- **Unidades** (mm/cm/m/pol) em **Posição, Offset, Largura, Altura e Peitoril**, exibindo e editando na unidade com gravação em metros; escala permanece adimensional.
- **Camadas**: renomear inline, arrastar para reordenar, olho como botão, swatch, criar/excluir, modos (Completo/Estrutural).
- **Ordem de desenho** no 3D por `renderOrder` seguindo a ordem das camadas.
- **Inspetor**: header `Inspetor + LIMPAR`, grid `arq-field-row` nos campos de transformação.
- **Terreno**: plano de referência (OSM), lote editável (largura × profundidade), mapa interativo com retângulo do lote, geolocalização, grade oculta, câmera enquadrando o lote, cor própria; fora do orçamento e sem conversão BIM.
- **Conversão de medida em serviço**: m² → m³ (área × espessura) e m³ → m² (volume ÷ espessura); sem espessura cai em 1 (nunca inventa); medida NaN/≤ 0 protegida.

### Bloco 3 — Materiais, Composições e Orçamento
- **Catálogo** no inspetor: lista com nome/categoria/unidade/preço/fonte, busca, filtro, editar preço (fonte PROPRIO), criar material.
- **Cotação**: exportar CSV do quantitativo (`;` + BOM, abre no Excel pt-BR) e importar CSV do fornecedor mostrando **atualizados** e **ignorados com motivo**.
- **Composições**: insumos por serviço, custo = soma dos insumos, criar/editar, importar/exportar CSV (formato SINAPI-like), aviso de insumo sem preço.
- **Composição no orçamento**: `ElementoBim.servicoId`; elemento com serviço sai do quantitativo de material (sem dupla contagem); `custoDeServicos` com metragem real; bloco **Materiais / Serviços / Total** no painel.
- **Regressão garantida**: modelo sem serviço mantém exatamente o total anterior (testado).

---

## 3. O que falta (lista completa)

### UI de telas pendentes
1. **`/orcamento` com custo**: a página mostra só quantidades (m², m³, un). O valor em R$ vive no painel de materiais. Unificar exige a página (server component) receber catálogo + composições.
2. **Tela de Render**: motor (`PedidoRender`, fila, transporte HTTP) pronto; falta UI e **`RENDER_WORKER_URL`**.
3. **Conflitos**: motor pronto e `PainelConflitos` existe; falta polimento/visual.
4. **IA (Vendi IA)**: chat funcional (topbar + rota server-side + executor + ponte + modo local). Falta a tela nova.

### Dívidas técnicas conhecidas
5. **Persistência**: catálogo, composições e projeto vivem em memória/localStorage. Postgres (Supabase) tem adaptador + migração, **não ligado** (sem `DATABASE_URL` real).
6. **Importação de arquivos**: GLB/DXF prontos e testados; **IFC recusado** (decisão: `web-ifc` só na Fase 3); worker de importação sem wiring de bundler.
7. **Upload de arquivo no canvas**: drop de material na face (Etapa C do Bloco 3) **não implementado**; a aplicação hoje é pelo painel.
8. **Cotas automáticas** na prancha: não implementadas.
9. **Segunda câmera (objeto) + dois viewports**: não implementados (a projeção ortográfica já é real na câmera única).
10. **SVG vetorial**: só PNG; falta exportação vetorial.
11. **Flag "na frente"** (`depthTest: false`) nas camadas: decisão do dono foi **não** implementar por ora.

---

## 4. Decisões pendentes do Product Owner

| # | Decisão | Impacto |
|---|---|---|
| 1 | **`/orcamento` com custo**: unificar R$ na página de orçamento? | exige passar catálogo/composições ao server component |
| 2 | **Render**: quando houver `RENDER_WORKER_URL`/token, qual formato de resposta do worker (estados e URL presignada)? | contrato do transporte já definido; falta endpoint |
| 3 | **Conflitos**: manter o painel atual ou esperar a tela nova do DeepSeek? | evita retrabalho visual |
| 4 | **IA**: ligar a tela nova ao chat existente ou reescrever? | chat já funcional; risco de duplicar |
| 5 | **IFC**: manter recusado até a Fase 3? | confirma a decisão anterior |
| 6 | **Postgres**: ligar quando a VPS estiver pronta (rota server-side + `pg.Pool`) | hoje local é o padrão no MVP |
| 7 | **Material no 3D** (Etapa C): arrastar da lista para a face, aplicando na face **e** no elemento BIM (opção (a) escolhida) | próximo lote de UI/canvas |

---

## 5. Contexto de engenharia (para não repetir erros)

- **Testes**: runner carrega `.check-out` compilado; **sempre** rodar `tsc -p tsconfig.check.json` antes de `node tests/run-all.mjs`, senão valida código velho.
- **Suítes**: 31 no total; as novas são `vistas`, `composicoes`, `servicos`, `lote1-terreno`, `lote1-importacao`, `lote1-infra`.
- **`.next`**: dev e build não compartilham diretório; ordem correta é parar o dev → apagar `.next` → buildar.
- **Canvas**: a câmera é única; projeção ortográfica é matriz, não segundo objeto. Raio/snap/desenho dependem dessa instância — trocar para duas câmeras exige refactor do canvas.
- **Histórico**: uma ação = **um** passo; IA aplica só por `aplicarPassoDaIA`; terreno nunca vira `ElementoBim`.

---

## 6. Verificação final deste ponto de retomada

```
npx tsc -p tsconfig.json --noEmit   → exit 0
npx tsc -p tsconfig.check.json      → exit 0
node tests/run-all.mjs              → 31 suítes · 755 asserts · 0 falhas
npx next build                       → exit 0 (no commit 76a118741)
```

Branch `codex/arqdor-contracts-fix` sincronizada com `origin`. `main` local está à frente de `origin/main` e **não foi promovida**.
