# JARVIS `/support/chat` — contrato de interceptação

A rota `/support/chat` é compartilhada por interceptadores especializados antes do fallback conversacional final. Isso é intencional, mas a ordem é parte do contrato funcional: cada interceptador só encerra a resposta quando reconhece o comando sob sua responsabilidade; caso contrário deve chamar `next()`.

## Ordem canônica

1. `jarvisEmailActionsRouter`
   - monta internamente `jarvisFastLiveCapabilitiesRouter`;
   - depois `jarvisDeviceActionsRouter`;
   - depois ações de e-mail.
2. `jarvisExternalActionsRouter`
3. `agentTasksRouter` / `agentsRouter` para a fila e ações de agentes.
4. `jarvisNaturalActionsRouter`
5. `jarvisActionPlansRouter`
6. `jarvisMissionsRouter`
   - monta internamente `jarvisPresenceRouter` antes dos handlers finais de missão/presença.
7. `supportRouter` — fallback conversacional/LLM final.

A ordem é definida em `src/routes/index.ts` e pelos `router.use(...)` internos dos routers acima.

## Regras obrigatórias para novos interceptadores

- Não adicionar outro `POST /support/chat` sem registrar a posição neste documento e no teste de contrato.
- Validar tenant e payload antes de executar qualquer ação.
- Quando o comando não pertence ao interceptador, chamar `next()` sem alterar a resposta.
- Quando o comando é tratado, encerrar a resposta uma única vez e não chamar `next()` depois.
- Ações com efeito externo devem manter a política de aprovação/segurança do executor correspondente.
- O `supportRouter` deve permanecer como último consumidor do chat.

## Motivo

Historicamente vários routers passaram a escutar o mesmo endpoint sem um contrato central. O comportamento funcionava pela ordem de montagem do Express, mas ficava fácil quebrá-lo ao mover imports ou `router.use`. Este documento e o teste `jarvis-support-chat-chain.test.ts` tornam a ordem explícita e verificável.
