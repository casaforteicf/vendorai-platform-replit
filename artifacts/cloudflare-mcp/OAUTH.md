# Conexão administrativa privada com ChatGPT

Selecione OAuth e mantenha o endereço público terminado em `/mcp`.
O servidor publica descoberta de recurso e de autorização, registro dinâmico
de clientes públicos, código de autorização com PKCE S256 e renovação rotativa.
Somente callbacks HTTPS oficiais do ChatGPT são aceitos; cada cliente fica
vinculado exatamente aos callbacks registrados.

Na página de autorização do servidor, o administrador informa a chave privada
`MCP_ACCESS_TOKEN` do serviço `cloudflare-mcp-v2` no Railway e confirma o acesso
administrativo. Nunca enviar essa chave por chat ou incluí-la em screenshots.
O ChatGPT recebe um token temporário, não a chave administrativa.
Essa conexão tem acesso às ferramentas Cloudflare e Browser Agent disponíveis
no bridge; não é um login de tenant e não deve ser distribuída a clientes.

`MCP_PUBLIC_URL` permite configurar a origem canônica, sem `/mcp` nem barra final.
O padrão é `https://cloudflare-mcp-v2-production.up.railway.app`.
`MCP_ACCESS_TOKEN` deve conter um segredo aleatório forte (32 bytes ou mais).
Rotacioná-lo invalida os clientes registrados e todas as credenciais anteriores.

Tokens de acesso expiram em 1 hora, refresh tokens em 30 dias. Códigos duram
2 minutos e são usados uma única vez. Reutilizar refresh token revoga a família
de tokens. A revogação também bloqueia o token de acesso dessa família.
Consentimentos, códigos, renovações e revogações ficam na memória da única
réplica. Reinícios/deploys invalidam todos os tokens OAuth, exigindo reconexão.
Antes de aumentar réplicas ou distribuir esta integração, migrar esse estado
para armazenamento compartilhado e usar identidade individual de usuários.
Os clientes registrados são assinados e sobrevivem ao reinício enquanto a
chave do administrador permanecer a mesma. O Bearer privado anterior continua
aceito para integrações existentes.

Validação local:

```sh
npm run build
node --test oauth.test.mjs
```
