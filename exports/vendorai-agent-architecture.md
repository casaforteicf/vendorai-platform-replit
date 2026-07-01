# VendorAI — Arquitetura de Acionamento dos Agentes de IA

**Versão:** Julho 2026  
**Sistema:** VendorAI Multi-tenant SaaS CRM

---

## 1. Nomenclatura interna vs. nomes de negócio

| AgentName (código) | Chave no BD | Nome de negócio |
|---|---|---|
| `sdr` | sdr | SDR / Qualificação |
| `closer` | closer | Closer / Fechamento |
| `followup` | sdr | Follow-up (variante do SDR) |
| `reactivation` | sdr | Reativação (variante do SDR) |
| `scheduler` | agendamento | Agendamento |
| `service` | suporte | Suporte / Atendimento |
| `onboarding` | suporte | Onboarding (variante do Suporte) |
| `relacionamento` | pos_venda | Pós-venda |

> **Prospector** e **Financeiro/Cobrança** existem como flows separados e não passam pelo `determineAgent` — têm rotas próprias (`/routes/prospector.ts`).

---

## 2. O que dispara cada agente

Existem dois caminhos de disparo completamente separados:

### Caminho A — Tempo real (Webhook)

```
WhatsApp / Instagram / Meta recebe mensagem
  → webhooks.ts registra a mensagem no BD
  → chama dispatchAgentBackground({ tenantId, leadId, mensagem })
  → fire-and-forget: não bloqueia a resposta do webhook
  → processAgentInternal() roda em background
      → determineAgent() decide qual agente responde
      → OpenAI (ou Anthropic como fallback) gera a resposta
      → insertAndRun() cria o agent_task
```

### Caminho B — Agendado (Cron via node-cron)

| Schedule | Job | Ação |
|---|---|---|
| `@:05` (todo hora) | churn-check | Leads com churnRisk ≥ 60% → dispara `reactivation` |
| `@:15` (todo hora) | campaigns | Campaigns `agendada` com `agendadaPara ≤ now` → cria tasks |
| `@03:00` (diário) | reactivation | Fila de reativação proativa |
| `@09:30` (diário) | no-response-closing | Fecha leads sem resposta há X dias |
| `@*/5min` | content-flow | Conteúdo automático |
| `@*/30min` | appointment-reminders | Lembretes de agendamento |
| `@day-5-08:00` | billing | Cobrança mensal |

---

## 3. O roteador — `determineAgent()`

**Arquivo:** `artifacts/api-server/src/services/agent-dispatch.ts:54`

```
determineAgent(lead, ci, deals, diasSinceContact):

  1. ci.churnRisk ≥ 60%          → "reactivation"   ← override de tudo
  2. lead.status === "novo"       → "sdr"
  3. lead.status === "cliente"    → "service"
  4. tem deal ativo?
       etapa "proposta"|"negociacao" → "closer"
       qualquer outra etapa          → "closer"
  5. qualificado + frio ≥ 3 dias → "followup"
  6. default                     → "sdr"
```

### Handoff entre agentes

O handoff **não é um evento explícito** — ele ocorre automaticamente a cada nova mensagem. Se o SDR qualificou o lead e um deal foi criado, na próxima mensagem `determineAgent` roteará automaticamente para `closer`.

**Regra de fallback:**
- Agente determinado desabilitado → cai para `sdr`
- `sdr` também desabilitado → descarta silenciosamente (`skipped`)

**Agente forçado:**  
O chamador pode passar `forcedAgent` para sobrescrever o roteamento automático (ex: scheduler de reativação força `reactivation`).

---

## 4. Pipeline completo de uma mensagem

```
Lead manda mensagem no WhatsApp
     │
     ▼
POST /webhooks/whatsapp (Meta Cloud API)
     │  registra mensagem no BD
     │
     ▼
dispatchAgentBackground()           ← fire-and-forget
     │
     ▼
processAgentInternal()
  ┌─ 1. Carrega agentConfig (limites, autonomia, agentes habilitados)
  ├─ 2. loadContext → lead + CustomerIntelligence + conversa + 10 msgs recentes
  ├─ 3. Busca deals abertos do lead
  ├─ 4. determineAgent() → ex: "closer"
  ├─ 5. Verifica se "closer" está habilitado → fallback para "sdr"
  ├─ 6. checkAgentPlan() → plano do tenant tem o módulo?
  ├─ 7. computeLimits() → bateu cota diária ou mensal?
  ├─ 8. PROMPT_BUILDERS["closer"](prompt, ctx, scenario, systemPromptDB)
  │       └─ Monta system prompt com contexto do lead, CI, histórico
  ├─ 9. callOpenAI() via AI Gateway
  │       ├─ Tenta OpenAI (gpt-4o-mini)
  │       └─ Fallback: Anthropic (claude-sonnet) se OpenAI retornar 429/500
  ├─ 10. Se closer + "{{action:proposal_accept}}" → proposalAccepted()
  ├─ 11. updateCounters() → incrementa tokens e mensagens usadas
  ├─ 12. insertAndRun() → cria agent_task no BD
  └─ 13. extractFamilyData() → extrai dados familiares async (não bloqueia)
     │
     ▼
agent_task criado com status:
  "pendente_aprovacao" → humano aprova no dashboard → envia
  "pendente_envio"     → worker envia automaticamente (modo autônomo)
```

---

## 5. Como o `agent_tasks` (log de ações) é usado

`insertAndRun()` em `agent-engine.ts` cria a entrada:

```typescript
{
  tenantId,
  leadId,
  agentName,        // "sdr", "closer", "service"...
  actionType:       "enviar_whatsapp",
  resposta,         // texto gerado pela IA
  status:           isAutonomous ? "pendente_envio" : "pendente_aprovacao",
  isAutonomous,
  extraPayload,     // metadados extras (campaignId, etc.)
}
```

### Dois modos de operação

| Modo | Configuração | Fluxo |
|---|---|---|
| **Revisão humana** (padrão) | `autonomyEnabledAt = null` | Task → `pendente_aprovacao` → humano aprova no dashboard → envia |
| **Autônomo** | `autonomyEnabledAt = <data>` | Task → `pendente_envio` → worker envia imediatamente |

---

## 6. Tempo real vs. polling — latências

| Evento | Mecanismo | Latência típica |
|---|---|---|
| Lead responde no WhatsApp | Webhook Meta → `dispatchAgentBackground` | < 2 segundos |
| Lead responde no Instagram | Webhook Instagram → `dispatchAgentBackground` | < 2 segundos |
| Churn alto detectado | Cron `@:05` | até 60 minutos |
| Campanha agendada dispara | Cron `@:15` | até 60 minutos |
| Lembrete de agendamento | Cron `@*/30min` | até 30 minutos |
| Reativação proativa noturna | Cron `@03:00` | até 24 horas |

---

## 7. AI Gateway — fallback e alertas

**Arquivo:** `artifacts/api-server/src/lib/ai-gateway.ts`

```
callOpenAI() →
  ├─ 429 quota / rate limit → tenta Anthropic como fallback
  │     └─ Anthropic falha também → envia email para vendorai@appvendorai.com
  ├─ 402 billing Anthropic → lança erro amigável
  └─ sucesso → retorna { content, inputTokens, outputTokens }
```

- Throttle de alertas: máximo 1 email a cada 15 minutos por tipo de erro
- Email inclui botão de recarga para o provedor correspondente

---

## 8. Construção do prompt por agente

Cada agente tem um `PROMPT_BUILDER` dedicado em `agent-engine.ts`:

| Agente | Especialidade do prompt |
|---|---|
| `sdr` | Qualificação, primeiro contato, perguntas abertas |
| `closer` | Negociação, objections, `{{action:proposal_accept}}` |
| `followup` | Reengajamento de leads frios |
| `reactivation` | Churn risk alto, abordagem empática com dados de CI |
| `scheduler` | Agendamento comercial B2B, integração Google Calendar |
| `service` | Suporte e atendimento pós-venda |
| `onboarding` | Primeiros passos de novos clientes |
| `relacionamento` | Pós-venda e manutenção de relacionamento |

O prompt inclui automaticamente:
- Dados do lead (nome, empresa, status, score)
- CustomerIntelligence (churnRisk, churnReasons, perfil)
- Histórico das últimas 10 mensagens
- Deals abertos e suas etapas
- System prompt customizado por tenant (via BD)

---

*Gerado automaticamente pelo VendorAI — Julho 2026*
