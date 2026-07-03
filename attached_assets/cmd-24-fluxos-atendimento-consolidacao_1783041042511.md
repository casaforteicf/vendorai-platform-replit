# COMANDO 24 — Consolidação dos Fluxos de Atendimento (verificar + completar)

**Stack:** Node + Drizzle + Supabase · OpenAI · Z-API/Meta Cloud  
**Natureza:** este comando CONSOLIDA a arquitetura conversacional completa.
Para cada item: VERIFICAR se já existe → se existe, validar contra a spec →
se não existe ou está parcial, IMPLEMENTAR. Reportar ao final o status de
cada bloco (✅ existia | 🔧 corrigido | 🆕 implementado).

---

## BLOCO 1 — Regra de posse da conversa (IA ↔ humano)

```
1. Campo leads.active_agent_lock (já existe no schema — verificar uso real)
2. Comportamento obrigatório:
   - IA assume conversas por padrão (Service no inbound, SDR no outbound)
   - Humano envia mensagem manual → lock ativado → TODOS os agentes pausam
     naquela conversa
   - Botão na conversa: [🤖 Devolver para IA] → remove o lock
3. Escalada automática IA → humano (criar se não existir):
   a. Lead pede explicitamente falar com pessoa (detecção por IA)
   b. Objeção sem resposta vencedora na memória (quando cmd-22 F5 ativo)
   c. Sentimento negativo forte detectado na mensagem
   d. Ao escalar: lock + notificação in-app E WhatsApp ao responsável com
      resumo da conversa em 3 linhas gerado por IA
```

## BLOCO 2 — Roteamento inbound

```
Pipeline da mensagem recebida (verificar cada etapa):
webhook → resolve tenant → resolve/cria conversa → vincula lead por telefone
(cria lead source='inbound' se não existir) → roteia (lock? humano : Service)
→ push tempo real ao frontend

Agente Service deve cobrir (testar cada caso):
- Dúvida respondida pela Knowledge Base do tenant
- "Quanto custa X" → consulta catálogo → gera orçamento CPQ → envia link
  de aceite NA CONVERSA
- Pedido de agendamento → handoff interno ao Scheduler (mesma conversa)
- Status de pedido → consulta deals/appointments do contato
- Fora de escopo → escalada do Bloco 1
```

## BLOCO 3 — Janela de 24h Meta (implementar se ausente)

```
1. conversations.last_inbound_at: atualizar a cada msg recebida
2. Antes de QUALQUER envio via Meta Cloud API:
   agora - last_inbound_at < 24h → mensagem livre
   ≥ 24h → usar template aprovado correspondente (confirmação, lembrete,
   pós-atendimento, reativação) — nunca falhar silenciosamente:
   se não houver template adequado, notificar o responsável
3. Z-API não tem essa restrição — aplicar somente ao canal meta_cloud
```

## BLOCO 4 — Cadência outbound do SDR

```
Verificar implementação exata (cmd-16 + cmd-22):
1. SDR NÃO dispara na importação — só via fila/score (cmd-22 F1)
2. Cenário frio: msg teste → (resposta OU 20h) → revelação
3. 48h sem resposta pós-abordagem → Follow-up envia 1 toque único
4. +72h → sai da cadência → entra na reativação (30d)
5. Toda mensagem do SDR registra activity com template e cenário usados
```

## BLOCO 5 — Handoffs entre agentes (a costura)

```
Implementar transições explícitas (campo conversations.current_agent):
SDR → Service/Closer: lead respondeu com dúvida/objeção
Service → Scheduler: lead quer agendar
Scheduler → (encerra): appointment criado → confirmação → SPIN gerado
Closer → humano: negociação de valor fora do padrão
Qualquer → Reativação: cadência esgotada
REGRA: o contexto da conversa acompanha o handoff — o agente seguinte
recebe o resumo do anterior no prompt, nunca começa do zero.
```

## BLOCO 6 — Malha de lembretes (verificar contra cmd-15)

```
- Cron 8h: resumo do dia p/ responsável + lembrete individual p/ cada
  cliente com compromisso (notification_logs anti-duplicação)
- 2h antes: resumo SPIN ao vendedor via WhatsApp com link do roteiro
- 24h antes (verticais que usam, ex salão): confirmação SIM/NÃO —
  resposta NÃO → status 'cancelado' + notifica responsável + oferece
  reagendamento na mesma conversa
```

## BLOCO 7 — Pós-venda conversacional

```
1. Cascata do Vendido dispara Agente Onboarding: mensagem de boas-vindas
   já existe — Onboarding deve também responder dúvidas de ativação e
   guiar o wizard de integrações
2. Pós-atendimento (vertical): agradecimento + link de avaliação Google
3. Inatividade 30d (cliente ativo sem compra/visita): mensagem de retorno
4. Aniversário: parabéns automático (com opt-out por contato:
   contacts.opt_out_datas_especiais)
```

## BLOCO 8 — Métricas dos fluxos (painel em Métricas de IA)

```
Implementar/verificar os contadores:
- taxa de resposta por cenário e por fonte do lead
- tempo médio de 1ª resposta: IA vs humano
- conversão conversa → agendamento | agendamento → venda
- taxa de no-show (appointments 'no_show' / total)
- escaladas p/ humano por motivo
- (quando cmd-22 F5 ativo) conversão por resposta de objeção
```

---

## RELATÓRIO FINAL OBRIGATÓRIO

Ao concluir, gerar `docs/status-fluxos-atendimento.md` com a tabela:
| Bloco | Item | Status (✅ existia / 🔧 corrigido / 🆕 implementado) | Observação |
E listar qualquer item que dependa de fator externo (ex: Instagram DMs
aguardando aprovação Meta) como ⏳ bloqueado externo.

## VALIDAÇÃO E2E (executar os 5 testes)

1. Mensagem inbound nova → lead criado → Service responde → humano responde
   → agentes pausam → [Devolver para IA] reativa
2. "Quanto custa {produto}" → orçamento CPQ com link chega na conversa
3. Lead aceita reunião na conversa → Scheduler agenda → Meet + confirmação
   + SPIN na aba do briefing
4. Deal perdido (motivo: timing) → 30 dias simulados → volta ao funil →
   Reativação aborda mencionando o motivo
5. Mensagem fora da janela 24h via meta_cloud → template usado, não msg livre
