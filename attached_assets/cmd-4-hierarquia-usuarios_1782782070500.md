# COMANDO 4 — Hierarquia de Usuários (3 níveis)

**Stack:** Node + Drizzle + Supabase · React frontend

## Estrutura de roles

```
super_admin  → Marcos / equipe Vendor.ai — vê tudo, todos os tenants
partner      → Escritório contábil — vê só seus tenants, comissões, performance
tenant_admin → Dono do negócio — vê só o próprio tenant, todas as funções
tenant_seller→ Vendedor do negócio — vê só leads/deals/agenda atribuídos a ele
```

---

## Parte A — Banco de dados

```sql
-- Garantir coluna role na tabela users
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text DEFAULT 'tenant_seller';
-- valores: super_admin | partner | tenant_admin | tenant_seller

-- Tabela de vínculo parceiro → tenants
CREATE TABLE IF NOT EXISTS partner_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES users(id),
  tenant_id uuid REFERENCES tenants(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(partner_id, tenant_id)
);

-- Comissões do parceiro
CREATE TABLE IF NOT EXISTS partner_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES users(id),
  tenant_id uuid REFERENCES tenants(id),
  month int, year int,
  amount numeric,
  status text DEFAULT 'pending', -- pending | paid
  paid_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```

---

## Parte B — Middleware de autorização

Criar middleware `requireRole(...roles)` que:
- Lê o JWT do usuário logado
- Verifica se `user.role` está na lista de roles permitidas
- Se não: retorna 403
- Aplicar nas rotas existentes:

```
super_admin only:
  GET /api/admin/tenants        (listar todos os tenants)
  GET /api/admin/partners       (listar todos os parceiros)
  GET /api/admin/commissions    (ver todas as comissões)
  DELETE /api/tenants/:id       (remover tenant)

partner + super_admin:
  GET /api/partner/tenants      (só os tenants do parceiro logado)
  GET /api/partner/commissions  (só as comissões do parceiro logado)
  GET /api/partner/dashboard    (dashboard do parceiro)

tenant_admin + super_admin:
  GET /api/settings             (configurações do tenant)
  POST /api/users               (criar usuário no tenant)
  DELETE /api/users/:id         (remover usuário do tenant)

tenant_seller: acesso somente leitura a deals/leads atribuídos
```

---

## Parte C — Dashboard do Parceiro (nova tela)

Criar rota `/partner/dashboard` acessível só para role `partner`.

Componentes da tela:

**Cards de resumo:**
- Total de tenants ativos
- Receita de comissão do mês atual
- Receita de comissão acumulada (ano)
- Próximo pagamento previsto

**Tabela de tenants:**
- Nome do tenant | Plano | Status (ativo/bloqueado) | Data de ativação | Comissão mensal gerada

**Histórico de comissões:**
- Mês | Valor | Status (pago/pendente) | Data de pagamento

Dados via:
```
GET /api/partner/dashboard
→ retorna { tenants: [], commissions: [], summary: {} }
Filtrar por partner_id = usuário logado
```

---

## Parte D — Isolamento de dados por tenant (garantir)

Verificar que todas as queries existentes já filtram por `tenant_id` do usuário logado.
Se alguma rota retornar dados de outros tenants, adicionar o filtro:

```javascript
// Em toda query de dados sensíveis:
where(eq(table.tenant_id, req.user.tenant_id))
```

Para `super_admin`: não aplicar o filtro (vê tudo).
Para `partner`: filtrar pelos `tenant_id` em `partner_tenants` onde `partner_id = req.user.id`.

---

## Parte E — Ajuste no login/JWT

O token JWT deve incluir:
```json
{
  "user_id": "...",
  "tenant_id": "...",
  "role": "tenant_admin",
  "partner_id": "..." // só se role = partner
}
```

Se o campo `role` já existe no JWT, apenas garantir que está sendo emitido corretamente.

---

## Parte F — Menu lateral (frontend)

Ajustar o sidebar para mostrar itens conforme o role:

```
super_admin  → tudo + menu Admin (Tenants, Parceiros, Comissões)
partner      → Dashboard Parceiro + lista de Tenants + Comissões (sem acesso ao CRM dos tenants)
tenant_admin → tudo do tenant (CRM, Omnichannel, Agenda, etc)
tenant_seller→ só Deals, Leads, Agenda, Omnichannel (sem Config, sem Billing)
```

---

## Validação crítica

- Parceiro logado NÃO pode ver dados de tenant que não é dele
- Seller NÃO pode acessar Configurações nem Faturamento
- Super admin pode acessar qualquer tenant sem restrição
- Criar usuário de teste para cada role e verificar o isolamento
