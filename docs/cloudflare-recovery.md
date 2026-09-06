# Recuperação do VendorAI no Cloudflare Pages

## Objetivo
Retirar o frontend da Vercel desabilitada sem alterar o backend Railway nem o Supabase.

## Projeto Cloudflare Pages
- Repositório: `casaforteicf/vendorai-platform-replit`
- Branch inicial de homologação: `hotfix/cloudflare-recovery-mainline`
- Root directory: `artifacts/frontend`
- Build command: `cd ../.. && corepack enable && pnpm install --frozen-lockfile && pnpm --filter @workspace/frontend build`
- Build output directory: `dist/public`
- Node.js: 24

## Variáveis do Pages
- `API_ORIGIN=https://vendorai-platform-replit-production.up.railway.app`

O proxy `/api/*` é feito por `functions/api/[[path]].js`, mantendo o frontend same-origin e evitando mudança massiva das chamadas existentes.

O proxy `/obrasgov/*` é feito por `functions/obrasgov/[[path]].js`.

## Compatibilidade SPA
`public/_redirects` contém somente o fallback interno `/* /index.html 200`. Cloudflare Pages não suporta proxy 200 para domínios externos em `_redirects`, por isso APIs usam Pages Functions.

## Captura mobile do Dublê Digital
O fluxo legado `/content-studio/video/avatar?capture=mobile` é tratado pelo React e convertido para `/content-studio/video/avatar/captura`, preservando os demais parâmetros. Assim não depende de redirect condicional por query da Vercel.

## Smoke test antes do domínio
Validar no hostname `*.pages.dev`:
1. `/login` carrega sem erro.
2. Login real completa e sessão persiste.
3. `/api/*` responde através do Railway.
4. Dashboard e conversas carregam.
5. Meta/Instagram/WhatsApp e Google OAuth mantêm callbacks esperados.
6. Uploads e anexos funcionam.
7. Dublê Digital via QR com `capture=mobile` abre a captura correta.
8. `/obrasgov/*` responde.
9. Rotas diretas da SPA não retornam 404.

## Cutover
Somente após smoke test:
1. Adicionar `app.appvendorai.com` como Custom Domain no Pages.
2. Atualizar DNS para o Pages conforme instrução da Cloudflare.
3. Confirmar HTTPS ativo.
4. Validar novamente login, API, OAuth, WhatsApp e Dublê.
5. Manter Vercel sem dependência de produção; remover configuração legada em PR posterior.

## Rollback
Se houver falha no cutover, restaurar o DNS para o destino anterior ou apontar temporariamente para outro frontend validado. Não alterar Railway/Supabase durante o rollback.
