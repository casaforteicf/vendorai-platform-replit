# COMANDO 1 — Fluxo "Vendido"

**Stack:** Node + Drizzle + Supabase (gfocphuiyyufwzcyihbk)

## O que fazer

No arquivo que processa `PATCH /api/deals/:id`, após salvar a mudança de stage, adicionar:

```
SE o novo stage tiver is_won = true E o deal ainda não tiver won_at preenchido:
  1. Setar deals.won_at = now()
  2. Gerar contrato (2 partes se sem partner_id, 3 partes se com partner_id)
     - Salvar em contracts com status = 'pending_signature'
  3. Enviar contrato para ZapSign
     - Salvar zapsign_doc_id e zapsign_sign_url em contracts
     - Atualizar status = 'sent_for_signature'
  4. Criar cobrança no Asaas
     - Se partner_id: split 60% Vendor.ai / 40% subaccount do parceiro
     - Se sem partner: 100% conta principal
     - Salvar asaas_payment_id em billing_records
  5. Enviar WhatsApp para o contato do deal:
     "Olá [nome]! Seja bem-vindo à Vendor.ai! Seu contrato foi enviado para assinatura. — Equipe Vendor.ai"
  6. Criar activity no deal: type='deal_won', description='Contrato enviado, cobrança criada.'
Executar de forma assíncrona (não bloquear o response da API).
Se qualquer etapa falhar, salvar em automation_logs (deal_id, step, error_message) e continuar.
```

## Migrations necessárias

```sql
ALTER TABLE deals ADD COLUMN IF NOT EXISTS won_at timestamptz;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS zapsign_doc_id text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS zapsign_sign_url text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_type text;
CREATE TABLE IF NOT EXISTS automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow text, deal_id uuid, step text,
  status text, error_message text,
  created_at timestamptz DEFAULT now()
);
```
