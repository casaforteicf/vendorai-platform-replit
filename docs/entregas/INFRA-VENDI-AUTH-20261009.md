# Registro Mestre — Vendi / autenticação homologação (2026-10-09)

- **Lote:** INFRA-VENDI-AUTH-20261009
- **Versão:** diagnóstico v1 (documentação, sem alteração de runtime)
- **Módulo:** Browser Agent MCP / autenticação entre produção e homologação
- **Objetivo:** resolver `VENDI_HOMOLOG_AUTH_EXCHANGE_FAILED` sem compartilhar JWT_SECRET e sem interferir na produção.
- **Escopo autorizado:** diagnóstico, correção, integração e validação em homologação; produção protegida.
- **Responsável:** agente da sessão de diagnóstico (Vendi para missão de navegação).
- **Branch:** `docs/vendi-homolog-auth-401-diagnostico-20261009`
- **PR histórico relacionado:** #2980 (já integrado), #3427 (Draft, erro distinto `VENDI_AUTH_REJECTED:401`).
- **PR deste lote:** consultar PR criado para este documento.
- **Arquivos alterados neste registro:** apenas este documento.

## Evidência real

1. `browser_agent_status` do conector VendorAI: `ok=true`, `configured=true`, runtime `cdp`, `secureSecretInjection=true`.
2. `browser_agent_connections` com tenantKey `vendorai`: tenant resolvido e conexão salva para `https://homolog.appvendorai.com/`.
3. Missão read-only do próprio Vendi em `https://homolog.appvendorai.com/`, `allowWrite=false`, `maxSteps=8`, retornou:
   - API externa: HTTP 500
   - `VENDI_HOMOLOG_AUTH_EXCHANGE_FAILED:401:{\"error\":\"upstream_token_rejected\",\"status\":401}`
   - runId: `a5a31ffc-6118-4cb2-9f73-db71dfe36387`
4. Código existente em `artifacts/api-server/src/routes/browser_agent_mcp.ts`: POST `/api/internal/browser-mcp/homolog-bootstrap` valida token upstream via `HOMOLOGATION_UPSTREAM_AUTH_ME_URL` (padrão `https://app.appvendorai.com/api/auth/me`). Ao receber resposta não-2xx, retorna `401 upstream_token_rejected`.
5. Na API de produção, `/api/auth/me` depende de `authenticate`, assinatura JWT válida e usuário ativo. O diagnóstico ainda não isola qual das verificações originou HTTP 401.

## Estado técnico

- **Implementado:** fluxo de exchange existente na main (PR #2980).
- **Validado tecnicamente:** somente reprodução do erro e inspeção do código; NÃO houve build, typecheck, teste automatizado ou log direto do servidor da Contabo.
- **Homologado:** não.
- **Aprovado para produção:** não.
- **Publicado:** nenhuma mudança deste lote.
- **Dependências:** acesso aos logs e variáveis efetivamente carregadas nos contêineres Contabo; confirmar roteamento real do domínio de produção.
- **Impedimento real:** Vendi não consegue completar autenticação em homologação, e o conector disponível nesta sessão não expõe terminal/logs/env dos contêineres.

## Próxima ação operacional na Contabo (somente leitura)

1. Verificar qual serviço recebe `https://app.appvendorai.com/api/auth/me` (Nginx/upstream real) e qual serviço emite o token MCP.
2. Comparar apenas fingerprints não reversíveis da configuração de `JWT_SECRET` entre **os serviços de produção que deveriam compartilhar autenticação**, sem imprimir o segredo e **sem igualar segredos entre produção e homologação**.
3. Conferir status/erro do `/auth/me` emitido pela produção para o runId acima e se o principal super_admin está ativo no banco de produção.
4. Verificar `HOMOLOGATION_UPSTREAM_AUTH_ME_URL` e `HOMOLOGATION_AUTH_BOOTSTRAP_ENABLED` na homologação.
5. Corrigir somente a causa comprovada; executar build/testes aplicáveis na Contabo e repetir a missão read-only do Vendi verificando ausência de 401 e navegação autenticada.

**Nota de segurança:** não registrar token Bearer, JWT_SECRET, cookies ou credenciais em logs/PR. Não alterar a produção neste lote sem o procedimento de promoção controlada. Não depender de GitHub Actions; não usar Replit, TinyFish ou Desktop Commander.

Atualizado em 2026-10-09.
