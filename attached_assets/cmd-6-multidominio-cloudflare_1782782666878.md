# COMANDO 6 — Multi-domínio / Subdomínios (Cloudflare for SaaS)

**Stack:** Node + Drizzle + Supabase · Cloudflare for SaaS  
**Objetivo:** cada tenant ganha um subdomínio automático {slug}.vendor.ai + opção de domínio próprio

---

## Parte A — Banco de dados

```sql
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subdomain text UNIQUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_domain text UNIQUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_domain_status text DEFAULT 'not_configured';
-- valores: not_configured | pending_dns | pending_ssl | active | failed
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cloudflare_hostname_id text;
```

---

## Parte B — Criação automática de subdomínio (no onboarding)

Ao criar um tenant (já existe no Fluxo 1 "Vendido"), adicionar:

```
1. Gerar slug a partir do nome da empresa
   - lowercase, sem acentos, sem espaços (trocar por hífen)
   - Ex: "Ferragem Central" → "ferragem-central"
2. Verificar se slug já existe em tenants.subdomain
   - Se existir, adicionar sufixo numérico: ferragem-central-2
3. Salvar em tenants.subdomain
4. Chamar API Cloudflare for SaaS para criar o hostname:
   POST https://api.cloudflare.com/client/v4/zones/{zone_id}/custom_hostnames
   body: { hostname: "{slug}.vendor.ai", ssl: { method: "http", type: "dv" } }
5. Salvar cloudflare_hostname_id retornado
6. Atualizar custom_domain_status = 'active' quando confirmado
```

---

## Parte C — Domínio próprio do tenant (opcional, configurável em Settings)

Nova seção em Configurações do tenant:

```
Tela: Configurações → Domínio
Campo: "Quer usar seu próprio domínio? (ex: app.suaempresa.com.br)"
Input: custom_domain
Botão: "Verificar e ativar"
```

Fluxo ao salvar:

```
1. Validar formato do domínio
2. Chamar Cloudflare API para criar custom hostname:
   POST /zones/{zone_id}/custom_hostnames
   body: { hostname: custom_domain, ssl: { method: "http", type: "dv" } }
3. Salvar cloudflare_hostname_id e status = 'pending_dns'
4. Retornar ao usuário as instruções de CNAME:
   "Aponte um registro CNAME do seu domínio para: {slug}.vendor.ai"
5. Criar job que verifica status a cada 5 min:
   GET /zones/{zone_id}/custom_hostnames/{hostname_id}
   Quando status da Cloudflare = 'active' → atualizar custom_domain_status = 'active'
   Se falhar após 24h → status = 'failed', notificar tenant_admin
```

---

## Parte D — Middleware de roteamento por host

Criar/ajustar middleware que roda em toda requisição:

```javascript
function tenantResolver(req, res, next) {
  const host = req.headers.host; // ex: ferragem-central.vendor.ai ou app.suaempresa.com.br

  // Ignorar domínio principal (admin/marketing)
  if (host === 'vendor.ai' || host === 'www.vendor.ai' || host === 'app.vendor.ai') {
    return next();
  }

  // Buscar tenant pelo subdomínio ou domínio customizado
  const tenant = await db.query.tenants.findFirst({
    where: or(
      eq(tenants.subdomain, extractSubdomain(host)),
      eq(tenants.custom_domain, host)
    )
  });

  if (!tenant) {
    return res.status(404).send('Tenant não encontrado');
  }

  if (tenant.status === 'blocked') {
    return res.redirect('/blocked'); // tela de bloqueio por inadimplência já existe
  }

  req.tenantId = tenant.id;
  next();
}

function extractSubdomain(host) {
  return host.split('.')[0]; // "ferragem-central" de "ferragem-central.vendor.ai"
}
```

Aplicar esse middleware antes de todas as rotas que dependem de tenant.

---

## Parte E — Variáveis de ambiente necessárias

```
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ZONE_ID=
CLOUDFLARE_ACCOUNT_ID=
```

(Confirmar com Marcos se já existem ou precisam ser geradas no painel Cloudflare)

---

## Parte F — Frontend: exibir o link do tenant

No Dashboard Executivo do tenant, mostrar:

```
Card "Seu site": 
  Link: https://{slug}.vendor.ai
  Botão "Copiar link"
  Se custom_domain ativo: mostrar também o domínio próprio
```

---

## VALIDAÇÃO

- [ ] Criar tenant novo → subdomínio gerado automaticamente e acessível
- [ ] Dois tenants com nome parecido → slugs não colidem (sufixo numérico funciona)
- [ ] Configurar domínio próprio → instruções de CNAME aparecem corretamente
- [ ] Após configurar CNAME real → status muda para 'active' automaticamente
- [ ] Acessar subdomínio de tenant bloqueado → redireciona para tela de bloqueio
- [ ] Domínio principal (vendor.ai) continua funcionando normalmente
