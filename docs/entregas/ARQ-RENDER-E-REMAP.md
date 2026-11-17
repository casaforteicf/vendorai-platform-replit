# ARQ-RENDER + REMAP — Duplo clique/Alt e Frente C (Render)

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-03
**Estado:** implementado · validado tecnicamente (tsc + 544 asserts + build)

## 1. Conflito de gestos resolvido (decisão do dono)

| Gestos | Ação |
|---|---|
| 1 clique | face / aresta |
| **Alt+clique** | loop (saiu do duplo clique) |
| **Alt+Shift+clique** | sólido inteiro |
| **duplo clique** | editar medida (prioridade) |

A contagem por tempo (450 ms) e os refs de clique foram **removidos**: a regra agora é por
modificador, determinística, sem corrida entre timers. O duplo clique deixou de exigir Push/Pull
ativo — vale em qualquer ferramenta.

Regra extraída para `modelador/selecao-nivel.ts` (pura): `resolverNivel({solido, faceId, arestaId,
altKey, shiftKey})`. O canvas só entrega os modificadores no `aoClicarPeca`.

## 2. Frente C — Render

### `render/pedido.ts`
`PedidoRender` = projeto + **fingerprint do documento** + câmera + qualidade + resolução + data.

- `serializarEstavel`: chaves ordenadas ⇒ mesmo documento sempre gera o mesmo fingerprint;
- `fingerprintDocumento`: FNV-1a 32 bits + comprimento (carimbo de versão, **não** hash criptográfico);
- validação: projeto não vazio, documento não nulo, fov 10–120°, câmera fora do alvo,
  resolução inteira com teto **2560 (preview)** / **8192 (final)**.

### `render/cliente.ts`
Cliente de fila sobre `TransporteRender` (interface), sem conhecer HTTP:

- `enfileirar(pedido)` → `jobId`, ou `FALHA_ENVIO` com detalhe;
- `consultar(jobId)` → estado ou `null` (falha de leitura não derruba a UI);
- `aguardar(jobId)` → polling com intervalo/timeout injetáveis; estados terminais
  `pronto` (exige URL) e `falhou`; retorna `TIMEOUT`, `FALHOU` ou `SEM_URL`.

Relógio e `dormir` são injetados: o teste não espera de verdade.

### Worker legado da Contabo
O adaptador é o `TransporteRender` (POST no worker, GET do estado). O worker
`vendorai-prod-browser` continua sendo o executor; **nenhuma URL foi fixada no código** — a base do
worker é configuração de ambiente, e a URL da imagem deve ser **presignada do R2**, nunca caminho
público fixo.

## 3. Testes

| Suíte | Asserts | Cobertura |
|---|---|---|
| `tests/input` | 32 (+6) | níveis face/loop/sólido com Alt e Alt+Shift |
| `tests/render` | 20 (novo) | fingerprint estável/sensível, validações, fila, timeout, job falho, pronto sem URL |

```
npx tsc -p tsconfig.json --noEmit   → exit 0
npx tsc -p tsconfig.check.json      → exit 0
node tests/run-all.mjs              → 23 suítes · 544 asserts · 0 falhas
npx next build                       → exit 0
```

## 4. Defeito de infraestrutura de teste corrigido

`tests/render` usa `await`: o runner carrega os módulos como **CJS**, então `await` de topo quebrava
o processo (exit 1, silencioso atrás do `findstr`). A suíte passou a exportar
`export async function executar()` — o contrato do runner já previa isso.

## 5. Pendências

- Ligar o `TransporteRender` ao endpoint real do worker (configuração, não código).
- UI de "Render": botão, preview do job e download — só depois da tela nova.
- O `next dev` foi religado na 5183 para o F5. **Não rode build com dev ativo** (corrompe `.next`).
