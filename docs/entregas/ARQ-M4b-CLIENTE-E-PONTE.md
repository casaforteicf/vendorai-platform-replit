# ARQ-M4b — Cliente do modelo (DeepSeek) + ponte com o store

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-03
**Estado:** implementado · validado tecnicamente (tsc + 610 asserts + build) · sem UI e sem chamada real

## 1. Cliente do modelo — `ia/cliente-modelo.ts`

- **Presets**: `DEEPSEEK_OFICIAL` (`https://api.deepseek.com/chat/completions`, `deepseek-chat`) e
  `OPENROUTER_DEEPSEEK` (`https://openrouter.ai/api/v1/chat/completions`, `deepseek/deepseek-chat`).
- `montarMensagens({contexto, pergunta, instrucoes})` → `system` (papel) + `system` (contexto) + `user`.
- `montarCorpoRequisicao(config, mensagens)` → `model`, `messages`, `tools` (as 6 ferramentas no
  formato OpenAI-compatible), `tool_choice: 'auto'`, `temperature` (default 0,2).
- `conversarComModelo(config, mensagens)` → `{ texto, toolCalls, uso, motivo }` ou erro tipado.
- `criarClienteModelo(config)` devolve `{ conversar, ferramentas }`.

**`fetch` é injetado e `apiKey` é passada por quem chama** — o módulo não lê `process.env` nem
guarda segredo. Isso mantém o teste de contrato sem rede e evita chave em log.

### Mapeamento de erro
| Situação | Resultado |
|---|---|
| HTTP não-2xx, exceção de rede, corpo sem `choices` | `API_INDISPONIVEL` (`provedor: 'deepseek'`) |
| `arguments` com JSON inválido ou não-objeto | `TOOL_CALL_INVALIDA` (com a ferramenta) |
| `usage.prompt_tokens` acima de `limiteTokensPrompt` | `LIMITE_TOKENS` |

### Mudança de contrato registrada
`IAErro.API_INDISPONIVEL.provedor` era `'openai' | 'anthropic'`; recebeu **`'deepseek'`** (aditivo).
Sem isso, a escolha do dono (DeepSeek) não seria representável no erro.

## 2. Ponte com o store — `ia/integracao.ts`

Duas fases, de propósito:

1. **validar** todos os escopos sobre o estado atual (`aplicarPasso` / `aplicarPassoBim` em modo
   `direta`), sem escrever nada;
2. **aplicar** na `ordem` do passo.

Sem a fase 1, um passo cross com a parte BIM inválida deixaria a parte do modelador **já aplicada** —
o estado ficaria a meio caminho. O teste cobre exatamente isso: validação falha → nada foi escrito.

- `aplicarPassoCom(passo, aplicadores)` — núcleo puro (testado com aplicadores falsos).
- `criarAplicadoresStore()` — fiação real com `useModeladorStore` e `useBIMStore`.
- `aplicarPassoDaIA(passo)` — entrada única para a UI nova.
- `passo: null` (leitura: cotação, render) → `{ ok: true, aplicado: false }`.
- Escopos `mep` e `moveis` ainda não têm aplicador → `ESCOPO_NAO_SUPORTADO` (falha explícita).

## 3. Testes

`tests/ia-modelo` — **31 asserts**, sem rede (fetch falso):
- esquemas: 6 definições, formato `function`, `criar_caixa` exige `largura`, presets corretos;
- mensagens e corpo: papéis, contexto, `tool_choice`, temperatura, 6 ferramentas;
- resposta: texto, `tool_calls` convertidas (nome + argumentos), uso de tokens;
- contrato: URL/método/`Authorization` enviados;
- falhas: JSON inválido, HTTP 500, exceção de rede, corpo vazio, teto de tokens;
- ponte: passo nulo, modelador, cross com ordem, falha de validação sem escrita, MEP não suportado,
  e a fiação real (`aplicarPassoDaIA(null)`).

```
npx tsc -p tsconfig.json --noEmit   → exit 0
npx tsc -p tsconfig.check.json      → exit 0
node tests/run-all.mjs              → 25 suítes · 610 asserts · 0 falhas
npx next build                       → exit 0
```

## 4. O que falta para a IA funcionar de ponta a ponta

1. **Configuração**: URL/modelo e `DEEPSEEK_API_KEY` no ambiente (ou no gerenciador de chaves);
   nenhuma chave foi commitada.
2. **Orquestração**: `contexto → cliente → executarPlano → aplicarPassoDaIA`, com a confirmação
   humana no meio quando houver ferramenta não reversível (o executor já recusa sem `confirmado`).
3. **UI de chat** (Vendi IA) — tela nova.
