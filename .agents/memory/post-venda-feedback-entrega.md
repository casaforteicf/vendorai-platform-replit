---
name: Pós-venda: pesquisa de satisfação pós-entrega
description: fluxo de feedback automático quando entrega.status -> "entregue", com classificação de sentimento por IA e pedido de avaliação Google condicional.
---

# Pesquisa de satisfação pós-entrega

**Regra:** ao transicionar `entrega.status` para `"entregue"`, o agente de Pós-Venda (relacionamento) envia uma pergunta aberta sobre a entrega. A resposta do lead é classificada por IA (JSON estruturado, mesmo estilo do classificador de escalação em `escalation.ts` — nunca por keyword matching) com um gate de confiança (>= 0.6). Respostas ambíguas/baixa confiança são tratadas como neutras: agradece sem presumir sentimento e sem pedir avaliação.

- Positivo + confiante → agradece e só pede avaliação no Google se o tenant tiver configurado `tenants.googleReviewLink` (nunca um link genérico do produto).
- Negativo + confiante → pede desculpas, pergunta o motivo (segundo turno de conversa) e registra o motivo em `entregas.feedbackMotivo`, sem pedir avaliação.
- O fluxo é roteado de forma determinística no dispatcher de agentes via `leads.pendingFeedbackEntregaId` (setado ao disparar a pergunta, limpo ao finalizar) — a mensagem do lead nesse estado nunca passa pelo roteamento normal de agentes/escalação.

**Why:** pedir avaliação para clientes insatisfeitos, ou usar um link de avaliação genérico da plataforma em vez do específico do tenant, prejudica a reputação do tenant no Google.

**How to apply:** qualquer novo fluxo pós-transição de status que precise de uma resposta de IA determinística (não uma pergunta aberta de propósito geral) deve usar o mesmo padrão: campo `pending*Id` no lead + branch dedicado no dispatcher antes da escalação/roteamento normal.
