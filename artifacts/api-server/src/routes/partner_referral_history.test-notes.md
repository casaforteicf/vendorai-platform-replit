# Partner referral history — critérios de aceite

- A fonte histórica deve ser `partner_referral_history`, consolidando clique, lead, pedido/venda e comissão sem duplicar regras de negócio.
- Filtro por período deve usar `event_at` da origem real de cada evento.
- Campanha deve priorizar UTM/campanha já capturada no clique, lead ou pedido.
- Cidade/região só deve ser preenchida quando já existir em metadata/attribution metadata; não inferir localização inexistente.
- Comissão continua sendo calculada pelo Commission Engine; esta view é somente analítica.
- Eventos cancelados de Praça.AI não entram no histórico comercial.
- Leads excluídos não entram no histórico.
- O painel deve manter percentuais para comparações e usar valores monetários apenas onde a operação financeira exigir.
