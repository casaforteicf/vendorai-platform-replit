# Migration 191 — checks

- `partner_referral_history` deve expor click, lead, order/sale e commission em um formato único.
- Pedidos cancelados não entram.
- Leads excluídos não entram.
- Nenhuma cidade/região é inventada: apenas metadados já existentes são usados.
- Índices cobrem parceiro+data e campanha+data para reduzir custo dos recortes históricos.
