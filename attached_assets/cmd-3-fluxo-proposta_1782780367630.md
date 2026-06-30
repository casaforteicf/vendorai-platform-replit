# COMANDO 3 — Aceite de Proposta

**Stack:** Node + Drizzle + Supabase · React frontend

## Parte A — Rota pública de aceite

Criar rota sem autenticação:
```
POST /api/public/proposals/:token/accept
- Buscar proposta pelo public_token
- Validar: proposta existe, status = 'sent', não expirada
- Se inválida: retornar 400 com mensagem
- Se ok: executar sequência abaixo com accepted_via = 'public_link'
```

Criar também página pública `/p/:token` no frontend:
- Mostrar resumo da proposta (empresa, itens, valor total)
- Botão "Aceitar Proposta"
- Ao clicar: chamar a rota acima e exibir mensagem de sucesso

## Parte B — Aceite manual e via WhatsApp (frontend)

Na tela de detalhe da proposta, adicionar botão "Marcar como aceita" com submenu:
- Via WhatsApp
- Manualmente

Ambos chamam `POST /api/proposals/:id/accept` com o `accepted_via` correspondente.

## Parte C — Sequência backend ao aceitar (todos os caminhos)

```
1. Atualizar proposals: status='accepted', accepted_at=now(), accepted_via, accepted_by
2. Mover deals.stage_id para o stage is_won=true do funil
   → Isso dispara o Fluxo 1 (Vendido) automaticamente — não duplicar lógica
3. Criar cobranças no Asaas com os itens da proposta:
   - Implantação: cobrança única (parcelada se proposal.installments > 1)
   - Mensalidade: recorrente mensal
   - Aplicar split se partner_id existir (60/40)
4. Para cada proposal_item com product_id:
   - Se products.track_inventory = true: decrementar stock_quantity
5. Criar activity: type='proposal_accepted', description='Proposta aceita via [accepted_via]. Cobrança criada.'
6. Incrementar sales_performance do responsável: deals_won+1, revenue_won+valor
```

## Migration necessária

```sql
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS accepted_via text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS accepted_by text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS public_token text UNIQUE DEFAULT gen_random_uuid()::text;
```

## Validação crítica

- Se `proposals.status` já for `accepted`, retornar 409 e não reexecutar
- Se `deals.won_at` já estiver preenchido, não reexecutar o Fluxo 1
