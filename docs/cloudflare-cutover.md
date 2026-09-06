# VendorAI — Cutover Vercel -> Cloudflare Pages

## Escopo desta etapa

Migrar apenas o frontend React/Vite para Cloudflare Pages. O backend Express continua no Railway durante o primeiro cutover e o PostgreSQL/Auth continuam no Supabase.

## Projeto Cloudflare Pages

- Repositório: `casaforteicf/vendorai-platform-replit`
- Branch de produção: `main`
- Root directory: `/`
- Build command: `pnpm --filter @workspace/frontend run build`
- Build output directory: `artifacts/frontend/dist/public`
- Node: `24`
- Package manager: `pnpm 10.26.1`

Os arquivos `artifacts/frontend/public/_redirects` e `_headers` são copiados pelo Vite para o diretório final.

## Rotas preservadas no cutover

- `/api/*` -> backend Railway atual (proxy 200)
- `/obrasgov/*` -> API pública ObrasGov (proxy 200)
- demais rotas -> `/index.html` (SPA)
- `/assets/*` -> cache imutável
- HTML -> no-store

## Compatibilidade Dublê Digital

O fluxo legado `/content-studio/video/avatar?capture=mobile` agora é tratado pelo próprio frontend e redirecionado para `/content-studio/video/avatar/captura`, preservando os demais parâmetros do QR. Assim o fluxo não depende mais do matching por query string específico da Vercel.

## Homologação antes de trocar DNS

Validar no hostname temporário do Cloudflare Pages:

1. login e logout;
2. Super Admin;
3. tenants e troca de tenant;
4. CRM/leads/deals/conversas;
5. Meta/Instagram/WhatsApp;
6. Google OAuth;
7. uploads e anexos;
8. Dublê Digital e captura mobile por QR;
9. Marketing/Content Studio;
10. Revenue Scout/JARVIS;
11. Gestão de Custos & FinOps;
12. rotas profundas acessadas diretamente/refresh;
13. `/api/health` e principais endpoints autenticados;
14. CORS, cookies, Authorization e headers de origem.

## Variáveis

- `FINOPS_USD_BRL`: câmbio operacional USD/BRL usado para converter custos externos/IA em margem BRL. Se ausente, o backend usa 5.20 como fallback temporário. Em produção deve ser configurado e atualizado pela rotina financeira.

## DNS

Depois da homologação:

1. adicionar `app.appvendorai.com` como custom domain do Pages;
2. confirmar certificado TLS ativo;
3. trocar o apontamento do hostname para Cloudflare;
4. manter Vercel intacta durante a janela de observação;
5. validar login, callbacks OAuth, webhooks e geração de conteúdo no domínio final;
6. só depois remover o domínio da Vercel.

## Rollback

Se houver erro crítico após o cutover, restaurar o apontamento DNS anterior para Vercel. Não remover a configuração Vercel antes da homologação final.

## Fase seguinte

Após frontend estável no Cloudflare:

1. R2 para mídia/anexos de alto volume;
2. Workers para webhooks e APIs leves;
3. Queues/Cron para jobs assíncronos;
4. Hyperdrive -> Supabase PostgreSQL;
5. medir workloads restantes no Railway;
6. remover Railway apenas onde Workers cobrir com segurança;
7. conectar APIs de billing Cloudflare/Supabase/Railway/Meta ao ledger FinOps;
8. substituir o rateio igual de custos compartilhados por rateio ponderado por requisições, storage e processamento quando a telemetria estiver disponível.
