# CI de produção sem dependência de GitHub Actions

## Gate canônico

- API: `pnpm validate:api`
- Frontend: `pnpm validate:frontend`
- Plataforma completa: `pnpm validate:production`

Esses comandos são a fonte única de validação. O provedor de CI apenas os executa.

## Railway — backend de produção

O `backend/Dockerfile` executa:

```bash
pnpm install --frozen-lockfile
pnpm run validate:api
```

Qualquer falha de typecheck, testes críticos, isolamento multi-tenant, integridade de produção ou build bloqueia a imagem e impede o novo deploy.

## Railway — frontend recovery/validation

O `artifacts/frontend/Dockerfile.railway` executa:

```bash
pnpm install --frozen-lockfile
pnpm run validate:frontend
```

Isso mantém uma validação independente do frontend e também serve como fallback de hospedagem.

## Cloudflare Pages nativo

Quando o projeto Pages estiver conectado diretamente ao repositório, configurar o build command como:

```bash
pnpm install --frozen-lockfile && pnpm validate:frontend
```

Diretório de saída:

```
artifacts/frontend/dist/public
```

Assim o Cloudflare valida e publica sem depender do runner do GitHub Actions.

## Regra operacional

1. Não aumentar baseline de segurança para liberar deploy.
2. Não usar `--no-frozen-lockfile` em produção.
3. Falhou o gate: não publica.
4. Correção de regressão deve incluir teste ou auditoria automática.
5. GitHub Actions passa a ser uma proteção adicional, não dependência única.

## Validação de branch antes do merge

O serviço de validação externo deve acompanhar a branch candidata e executar `pnpm validate:production` antes do merge. Assim, um PR pode ser comprovado mesmo quando os runners do GitHub Actions estiverem indisponíveis.
