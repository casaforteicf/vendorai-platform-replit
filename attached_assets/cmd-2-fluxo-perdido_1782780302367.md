# COMANDO 2 — Fluxo "Perdido"

**Stack:** Node + Drizzle + Supabase · React frontend

## Parte A — Modal obrigatório (frontend)

No Kanban e na tela de deal, quando o usuário tentar mover para stage com `is_lost = true`:
- Bloquear a mudança
- Abrir modal com:
  - Select obrigatório "Motivo da perda": Preço alto / Escolheu concorrente / Sem budget / Timing ruim / Sem resposta / Produto não atende / Outro
  - Textarea opcional "Observações"
  - Botões: Cancelar | Confirmar perda
- Só salvar após confirmação

## Parte B — Backend ao confirmar

```
PATCH /api/deals/:id
SE novo stage tiver is_lost = true:
  1. Salvar deals.loss_reason e deals.loss_notes
  2. Setar deals.lost_at = now()
  3. Criar activity: type='deal_lost', description='Perdido. Motivo: [loss_reason]'
  4. Inserir em reactivation_queue:
     { deal_id, scheduled_for: now() + 30 days, status: 'pending', loss_reason }
```

## Parte C — Cron job diário (meia-noite)

```
Buscar reactivation_queue onde scheduled_for <= now() e status = 'pending'
Para cada registro:
  1. Mover deal para o primeiro stage do funil (stage com menor order/posição)
  2. Criar activity: type='reactivation_scheduled'
  3. Chamar o Agente Reativação do AI Hub passando deal_id e loss_reason
  4. Atualizar reactivation_queue.status = 'executed', executed_at = now()
```

## Migration necessária

```sql
ALTER TABLE deals ADD COLUMN IF NOT EXISTS loss_reason text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS loss_notes text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS lost_at timestamptz;
CREATE TABLE IF NOT EXISTS reactivation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES deals(id),
  scheduled_for timestamptz NOT NULL,
  status text DEFAULT 'pending',
  loss_reason text,
  executed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```
