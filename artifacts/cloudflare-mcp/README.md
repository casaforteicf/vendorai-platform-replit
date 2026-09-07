# VendorAI Cloudflare MCP

Servidor MCP privado para operar Cloudflare sem compartilhar credenciais no chat.

## Arquitetura

ChatGPT / cliente MCP -> `/mcp` -> Cloudflare API.

O endpoint exige `Authorization: Bearer <MCP_ACCESS_TOKEN>` e usa um token Cloudflare armazenado somente no ambiente de hospedagem.

## Variáveis obrigatórias

- `CLOUDFLARE_API_TOKEN`: token Cloudflare restrito.
- `CLOUDFLARE_ACCOUNT_ID`: ID da conta Cloudflare.
- `MCP_ACCESS_TOKEN`: segredo independente usado para autenticar o cliente MCP.

## Permissões Cloudflare para a primeira versão

Mínimo recomendado:

- Pages: Read
- Pages: Write
- Zone: Read (somente para `cloudflare_list_zones`)

Não habilite DNS Write nesta primeira versão. O bridge inicial não altera DNS.

## Endpoints

- `GET /health`: healthcheck sem segredo.
- `/mcp`: endpoint MCP autenticado.

## Ferramentas MCP

- `cloudflare_status`
- `cloudflare_list_pages_projects`
- `cloudflare_get_pages_project`
- `cloudflare_create_pages_project_from_github`
- `cloudflare_list_pages_deployments`
- `cloudflare_trigger_pages_deployment`
- `cloudflare_list_zones`

## VendorAI

O helper de criação de Pages usa por padrão:

- GitHub owner: `casaforteicf`
- owner ID: `173710513`
- repositório: `vendorai-platform-replit`
- repo ID: `1301046243`

Esses valores podem ser sobrescritos na chamada da ferramenta.

## Desenvolvimento

```bash
corepack enable
pnpm install --no-frozen-lockfile
pnpm --filter @workspace/cloudflare-mcp typecheck
pnpm --filter @workspace/cloudflare-mcp build
pnpm --filter @workspace/cloudflare-mcp start
```

## Segurança

- Nunca grave `CLOUDFLARE_API_TOKEN` no GitHub.
- Nunca cole o token Cloudflare em conversas.
- Use um token Cloudflare de menor privilégio possível.
- `MCP_ACCESS_TOKEN` deve ser diferente do token Cloudflare.
- Ferramentas de escrita são explicitamente marcadas como mutações; exclusão de projeto e DNS não são expostas nesta versão.
