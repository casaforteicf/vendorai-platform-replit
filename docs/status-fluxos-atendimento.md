# Status dos Fluxos de Atendimento — Cmd 24

> Gerado em: 2026-07-03
> Conjunto de tarefas: #187, #188, #189, #190

## Legenda
| Ícone | Significado |
|-------|-------------|
| ✅ | Já existia antes do Cmd 24 |
| 🔧 | Corrigido ou ajustado no Cmd 24 |
| 🆕 | Implementado do zero no Cmd 24 |
| ⏳ | Bloqueado por dependência externa |

---

## Bloco 1 — Rastreio de Entrada do Lead

| Item | Status | Detalhes |
|------|--------|----------|
| Campo `last_inbound_at` em `conversations` | 🆕 | Coluna adicionada via Task #187; webhooks WhatsApp, Instagram e chat setam ao receber mensagem |
| Campo `current_agent` em `conversations` | 🆕 | Persiste o agente IA ativo por conversa; atualizado a cada dispatch via Task #187 |
| Atualização non-blocking de `current_agent` | 🆕 | No `agent-dispatch.ts` step 4c, deferred até após `resolvedAgentName` ser determinado |

---

## Bloco 2 — Escalação Humana Automática

| Item | Status | Detalhes |
|------|--------|----------|
| Detecção de triggers de escalação | 🆕 | `escalation.ts` com taxonomia: `falar_com_pessoa`, `sentimento_negativo`, `objection_unresolved` (threshold 0.7) |
| Lock humano no lead (`activeAgentLock = "human"`) | 🆕 | Task #188; `agent-dispatch.ts` seta lock e notifica via in-app + WhatsApp |
| Rota `PATCH /conversations/:id/release-lock` | 🆕 | Libera lock com authz per-user; registra atividade `escalacao_humano` |
| Badge "Humano" na lista de conversas | 🆕 | `Conversations.tsx` exibe badge âmbar e banner explicativo |
| Botão "Devolver para IA" no chat | 🆕 | Calls release-lock, invalida query cache, reativa agente IA |
| Atividade `escalacao_humano` no DB | 🆕 | Adicionada ao `activityTipoEnum` + migração `ALTER TYPE` |

---

## Bloco 3 — Janela 24h Meta (Omnichannel)

| Item | Status | Detalhes |
|------|--------|----------|
| Verificação de janela 24h para saída Meta | 🆕 | `omnichannel.ts`: `lastInboundAt` null → `Infinity`; bloqueia envio fora da janela |
| Tratamento de canais não-Meta | ✅ | Email e chat não têm restrição de janela |
| Z-API removido, envio via Meta Cloud API | 🔧 | `meta-whatsapp-cloud-api.md` — todos os envios via Graph API v19 |

---

## Bloco 4 — Handoff de Contexto entre Agentes

| Item | Status | Detalhes |
|------|--------|----------|
| Detecção de handoff no dispatch | 🆕 | Task #189; compara `conversations.current_agent` (anterior) vs `resolvedAgentName` (novo) |
| Geração de resumo via IA | 🆕 | `handoff.ts → generateAgentHandoffSummary`: gpt-4.1-mini, 20 msgs, fallback textual |
| Persistência em `conversations.metadata.handoff_context` | 🆕 | Update JSONB com chave `handoff_context` ao detectar handoff |
| Injeção no system prompt do próximo agente | 🆕 | `agent-dispatch.ts` prepend `## Contexto recebido do agente anterior:\n{summary}` |
| Atividade `handoff_agente` registrada | 🆕 | `resultadoExecucao: "de:sdr|para:service"` parseável pelo frontend |
| Timeline de handoffs no chat (frontend) | 🆕 | `Conversations.tsx`: fetch activities, `HandoffSeparator` inline na timeline |
| Exclusão de transições humano→IA do handoff | 🆕 | Guard `previousAgent !== "humano"` evita falsos positivos |

---

## Bloco 5 — Persistência de Contexto entre Sessões

| Item | Status | Detalhes |
|------|--------|----------|
| Últimas 10 mensagens injetadas no prompt | ✅ | `loadContext` em `agent-engine.ts` — `recentMessages` sempre carregados |
| Customer Intelligence (CI) no prompt | ✅ | `buildLeadSection` + seção CI em todos os prompt builders |
| Handoff context reutilizado em turnos subsequentes | 🆕 | `conversations.metadata.handoff_context` lido para turnos sem troca de agente |

---

## Bloco 6 — Agentes e Roteamento

| Item | Status | Detalhes |
|------|--------|----------|
| `determineAgent` — roteamento por lead state | ✅ | `agent-engine.ts`; baseado em `etapa`, `churnRisk`, `diasSinceContact` |
| Fallback para SDR se agente desabilitado | ✅ | `resolvedAgentName = agentCfg?.enabled ? agentName : "sdr"` |
| Verificação de plano por agente | ✅ | `checkAgentPlan` bloqueia agents fora do plano |
| DB-driven system prompt override | ✅ | `getAgentConfig` + `AGENT_NAME_TO_KEY` para override por tenant |
| Motor Preditivo (Cmd 22) injetado no SDR | ✅ | `scenario.cold_outreach` via `agent-dispatch.ts` |

---

## Bloco 7 — Canais e Envio

| Item | Status | Detalhes |
|------|--------|----------|
| WhatsApp via Meta Cloud API | 🔧 | Z-API 100% removido; Graph API v19 |
| Instagram via Graph API | ✅ | Credenciais em `agent_configs`; IGSID em leads |
| Webhook Meta (text/audio/image) | ✅ | `media requer downloadMetaMedia(id, token)` |
| Webhook Instagram | ✅ | `/tenants/:id/webhooks/instagram` |
| Templates aprovados Meta | ⏳ | Envio fora de janela 24h requer template aprovado pela Meta; aguarda aprovação externa |

---

## Bloco 8 — Métricas de Fluxo

| Item | Status | Detalhes |
|------|--------|----------|
| Rota `GET /analytics/flow-metrics` | 🆕 | Task #190; 5 métricas: 1ª resposta IA vs humano, conv→agendamento, appt→venda, no-show, escalações |
| Tempo médio de 1ª resposta IA vs humano | 🆕 | CTE com `DISTINCT ON` por conversa; avg em segundos |
| Taxa de conversão conversa → agendamento | 🆕 | COUNT leads únicos com agendamento / total leads com conversa |
| Taxa de conversão agendamento → venda | 🆕 | COUNT agendamentos cujo lead tem deal `etapa = 'ganho'` |
| No-show rate | 🆕 | COUNT `agendamentos.status = 'no_show'` / total |
| Escalações por razão | 🆕 | GROUP BY `resultado_execucao` em `activities` tipo `escalacao_humano` |
| Cards de Métricas de Fluxo no frontend | 🆕 | Aba "Fluxo" em `Analytics.tsx` com 6 cards |

---

## Resumo Geral

| Bloco | Implementado | Parcial/Bloqueado |
|-------|-------------|-------------------|
| 1 — Rastreio de entrada | ✅ 3/3 | — |
| 2 — Escalação humana | ✅ 6/6 | — |
| 3 — Janela 24h Meta | ✅ 3/3 | — |
| 4 — Handoff de contexto | ✅ 7/7 | — |
| 5 — Persistência de contexto | ✅ 3/3 | — |
| 6 — Agentes e roteamento | ✅ 6/6 | — |
| 7 — Canais e envio | ✅ 4/5 | ⏳ Templates Meta |
| 8 — Métricas de fluxo | ✅ 6/6 | — |

**Total: 38/39 itens implementados** (1 item aguardando aprovação de templates Meta — externo à implementação)
