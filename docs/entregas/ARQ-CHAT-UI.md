# ARQ-CHAT — Vendi IA mínimo ligado ao motor

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-03
**Estado:** implementado · validado tecnicamente (tsc + 615 asserts + build) · **UAT parcial no navegador** (falta a chave)

## 1. Arquitetura (por que a chave não vai para o browser)

```
ChatIA (client) → POST /api/ia/chat (servidor) → DeepSeek
                       ↓ toolCalls
              montarPlanoDoChat → executarPlano → aplicarPassoDaIA → stores → canvas
```

- **`src/app/api/ia/chat/route.ts`**: lê `DEEPSEEK_API_KEY` do ambiente **do servidor**, monta as
  mensagens com as instruções de domínio, chama o cliente e devolve `{texto, toolCalls}`.
  Sem chave → `503 { erro: 'IA_NAO_CONFIGURADA' }`.
- **`ia/ChatIA.tsx`**: painel mínimo (input + Enviar), sem nenhuma regra de geometria.
- **`ia/chat-core.ts`** (puro): `montarPlanoDoChat` (sem tool call não há plano) e
  `mensagemDoResultado` (traduz erro/leitura/aplicação).
- **`stores/useChatIAStore.ts`**: só o estado de abrir/fechar — não é documento.

## 2. Fluxo de uma mensagem

1. contexto: `resumirDocumento(...).texto` (contagens, unidades, materiais);
2. `POST /api/ia/chat` com `{ pergunta, contexto }`;
3. resposta com `toolCalls` → `montarPlanoDoChat` → `PlanoIa`;
4. `executarPlano(plano, estado)` valida e monta **um** `Passo`;
5. `aplicarPassoDaIA(passo)` valida tudo e aplica no store;
6. a cena atualiza (o canvas assina o store) e o autosave do `EditorShell` persiste.

Nenhuma etapa escreve no store fora de `aplicarPassoDaIA`.

## 3. Acesso na interface

- **Dashboard**: botão "Conversar" do card Vendi IA na sidebar (antes `disabled`, agora abre o chat).
- **Editor**: o modo imersão não tem sidebar — foi adicionado o botão **"Vendi IA"** na topbar
  (ao lado de Salvar). Sem esse botão o chat era inalcançável justamente onde o projeto existe.

## 4. Instruções de domínio enviadas ao modelo

A rota injeta: medidas em metros; **parede = caixa com profundidade 0,15 m**; laje com 0,10–0,20 m;
chamar a ferramenta quando houver medidas; perguntar quando faltar informação. Sem isso o modelo
tenderia a "descrever" a parede em vez de chamar `criar_caixa`.

## 5. Configuração (obrigatória para o teste real)

```bash
cd artifacts/arqdor-studio
copy .env.example .env.local     # e preencha DEEPSEEK_API_KEY
# reinicie o `next dev`
```

`.env.local` está coberto pelo `.gitignore` (`.env.*`), e `.env.example` é versionável (exceção já
prevista). A chave **nunca** chega ao browser: só a rota do servidor a usa.

## 6. Verificação no navegador (feita)

| Passo | Resultado |
|---|---|
| clicar "Vendi IA" na topbar | painel abre com input e Enviar |
| digitar "crie uma parede de 4x2,8" + Enter | mensagem aparece no histórico |
| POST `/api/ia/chat` | responde **503** (sem chave) |
| UI | mostra "IA não configurada: defina DEEPSEEK_API_KEY em artifacts/arqdor-studio/.env.local e reinicie o dev." |

**O que NÃO foi verificado:** a chamada real à DeepSeek e a criação da parede por tool call — exige a
chave. O contrato do cliente e a conversão de `toolCalls` já estão cobertos por 31 asserts em
`tests/ia-modelo`.

## 7. Testes

`tests/ia` ganhou 5 asserts de chat (plano a partir de tool call, conversa sem tool call, mensagem de
erro/leitura/aplicação). Total: **25 suítes · 615 asserts · 0 falhas**.

## 9. Modo local (sem chave) — para testar o motor hoje

Quando a rota responde `IA_NAO_CONFIGURADA`, o chat tenta um **interpretador local** de comandos
(`ia/comando-local.ts`) e avisa na própria mensagem: *"Modo local (sem IA): …"*.

- `crie uma parede de 4x2,8` → `criar_caixa` 4 × 2,8 × **0,15** (parede);
- `parede de 5;2,8;0,2` → espessura explícita;
- `caixa de 2x2x2` → três medidas;
- `laje de 5x4` → 5 × 0,15 × 4;
- qualquer outra frase → mensagem de configuração, sem inventar ação.

O caminho do modelo **não foi alterado**: com a chave presente, a rota responde e o modo local nem é
consultado. O interpretador existe só para o motor ser testável sem custo de API — e é rotulado na UI.

### UAT feito no navegador (sem chave)

| Passo | Resultado |
|---|---|
| clicar "Vendi IA" na topbar | painel abre |
| enviar "crie uma parede de 4x2,8" | "Modo local (sem IA): Parede 4 × 2,8 × 0,15 m." |
| aplicação | "Aplicado no projeto: criar_caixa." |
| status bar | **5 → 6 sólidos** (o sólido nasceu no documento) |

**O que segue não verificado:** a chamada real à DeepSeek. Com a chave em `.env.local`, o modo local
deixa de ser usado e o teste passa a ser do modelo.

## 10. Pendências

- chave real no `.env.local` e teste de ponta a ponta ("crie uma parede de 4x2,8" deve criar caixa
  4 × 2,8 × 0,15);
- visual do chat: o DeepSeek refaz;
- confirmação humana de ação não reversível ainda não tem UI (o executor já recusa sem `confirmado`).
