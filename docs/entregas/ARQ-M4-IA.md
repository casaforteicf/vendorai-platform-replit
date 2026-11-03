# ARQ-M4 — IA: ferramentas, executor atômico e contexto

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-03
**Estado:** implementado · validado tecnicamente (tsc + 579 asserts + build) · sem UI e sem chamada de LLM

## Critérios de aceite — como cada um foi cumprido

| Critério | Como está garantido |
|---|---|
| Nenhuma ferramenta escreve no store | cada ferramenta devolve `OperacoesPorEscopo` (ou um efeito de leitura); quem aplica é o executor, sobre uma **cópia** do estado |
| Toda ação é desfazer-ável em bloco | o executor devolve **um** `Passo` (`modelador`, `cross` com `ordem` explícita, ou `null` em leitura); a UI aplica uma vez |
| A IA nunca "acha" que fez | ferramenta inexistente → `OPERACAO_NAO_SUPORTADA`; argumento inválido → `TOOL_CALL_INVALIDA`; ação não reversível sem confirmação → `PROMPT_INSEGURO`; a `TransacaoIA` fica com `status: 'erro'` e as `toolCalls` com o resultado de cada uma |

## `ia/ferramentas.ts` — 6 ferramentas

| Ferramenta | Reversível | O que produz |
|---|---|---|
| `criar_caixa` | sim | `criar_solido` (usa `criarCaixa`, medidas exatas) |
| `aplicar_material` | sim | `atualizar_elemento_bim` (valida elemento **e** material) |
| `colocar_movel` | sim | `criar_solido` + `criar_elemento_bim` (cross-store) |
| `exportar_cotacao` | não (leitura) | efeito com CSV + JSON do quantitativo |
| `pedir_render` | não (leitura) | efeito `PedidoRender` com fingerprint do documento |
| `definir_preco_material` | **não** | efeito de catálogo — exige `confirmado: true` |

## `ia/executor.ts`

- valida o limite de operações por turno (default 20) **antes** de executar;
- aplica cada ferramenta sobre o estado de trabalho (`aplicarPasso` para modelador, aplicador puro para BIM);
- **qualquer falha aborta o plano inteiro**: nenhuma operação parcial vaza, porque o estado de trabalho é descartado;
- monta o passo: `modelador` puro, ou `cross` com `ordem: ['modelador', 'bim']` (o sólido precisa existir antes do elemento que o referencia);
- devolve `{ transacao, passo, estado, efeitos }` — o store/UI aplica, não o executor.

## `ia/contexto.ts`

Resumo determinístico para o prompt: contagens de sólidos e elementos por tipo, unidades medidas
(do quantitativo real), móveis por família, materiais **realmente usados primeiro**, e um texto com
orçamento de 600 caracteres (truncado com `…`).

## Lacuna de contrato registrada

`definir_preco_material` mexe no **catálogo**, que não faz parte do `DocumentoArqdor` — logo não
existe `Passo` para ele. O contrato `ResultadoIA` já previa `passo: Passo | null`, então:
preço altera catálogo, **não** entra no histórico e **exige confirmação humana** (`requerConfirmacao`).
Se o dono quiser Ctrl+Z no preço, é preciso criar escopo `catalogo` no histórico — decisão de contrato,
não de código.

## Testes

`tests/ia` — **35 asserts**: registro, ferramenta inexistente, criar caixa, material válido/ inválido,
móvel cross-store com ordem correta, atomicidade (plano com falha não deixa resíduo), leitura de
cotação e render, preço com/sem confirmação, limites, e contexto.

```
npx tsc -p tsconfig.json --noEmit   → exit 0
npx tsc -p tsconfig.check.json      → exit 0
node tests/run-all.mjs              → 24 suítes · 579 asserts · 0 falhas
npx next build                       → exit 0
```

## O que ainda NÃO existe (próximo passo natural)

1. **Chamada ao modelo** (DeepSeek): escolher modelo/roteamento, montar as ferramentas no formato de
   tool calling e converter a resposta em `ToolCallIA[]`. Hoje o executor recebe o plano pronto.
2. **Integração com o store**: aplicar o `Passo` devolvido (o executor não escreve).
3. **UI de chat** (Vendi IA): depende da tela nova do DeepSeek.
