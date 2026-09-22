# VendorAI Tenant SaaS Edge

Camada Cloudflare for SaaS usada pelos domínios personalizados dos tenants.

## Fluxo

1. O cliente aponta `www.empresa.com.br` (ou outro subdomínio) por CNAME para `domains.appvendorai.com`.
2. Cloudflare Custom Hostnames valida o domínio e emite SSL.
3. O fallback origin `proxy-fallback.appvendorai.com` é proxied e usa o Worker `vendorai-tenant-saas`.
4. O Worker encaminha a requisição para o backend Railway usando o hostname nativo do Railway para TLS/routing.
5. O hostname original do cliente vai em `x-tenant-custom-host` e só é aceito pelo backend quando `x-vendorai-edge-secret` confere com `TENANT_EDGE_PROXY_SECRET`.
6. O backend resolve `tenant_domains.domain` e serve apenas conteúdo publicado do tenant correspondente.

## Segurança

- Nunca confiar em `x-tenant-custom-host` sem o segredo do edge.
- Não expor `TENANT_EDGE_PROXY_SECRET` no frontend.
- O CNAME target deve continuar proxied no Cloudflare.
- Domínios só ficam `active` após Cloudflare confirmar hostname e SSL.
- Registros de e-mail (MX/SPF/DKIM) do cliente não são alterados.

## Infraestrutura

- CNAME target: `domains.appvendorai.com`
- Fallback origin: `proxy-fallback.appvendorai.com`
- Worker: `vendorai-tenant-saas`
- Setup idempotente: `node cloudflare/tenant-saas-worker/configure.mjs`
