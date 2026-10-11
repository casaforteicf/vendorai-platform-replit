# MULTI-01 — Auditoria de instalação Vendor.ai (11/10/2026)

**Estado: auditoria estática iniciada; não homologado.** Vinculado às issues #2895, #2763, #3452 e à base integrada pelo PR #3453.

## Evidência atual do repositório
- `artifacts/frontend/index.html` contém `<link rel="manifest" href="/api/manifest.json">`.
- `artifacts/api-server/src/routes/manifest.ts` implementa o JSON de instalação (display standalone, nome/ícones configuráveis por hostname de tenant, ícone genérico da marca).
- **Risco de distribuição:** rota do manifest está no backend, enquanto frontend pode ser servido por Cloudflare Pages; confirmar se `/api/manifest.json` alcança o backend no ambiente real, com tipo MIME correto.
- **Risco offline:** a rotina de recuperação do `index.html` pode desregistrar todos os service workers e remover todos os caches do origin durante falhas de chunks. Não instalar um worker offline novo antes de projetar caches exclusivos e recuperação que preserve trabalho local.
- `artifacts/mobile/package.json` já contém **Expo 54, React Native, scripts android/ios**. Não recriar app mobile em paralelo. Presença de projeto **não comprova** app assinado/publicado em lojas.
- UI-01.8 (`projectContinuity.ts`) fornece contrato de continuidade/conflitos, **não** motor de armazenamento/sincronização offline.

## Gate de verificação automatizada
```bash
node artifacts/frontend/scripts/audit-install-readiness.mjs
```
Esse teste estrutural não acessa rede, não modifica arquivos e não conta como homologação de instalação.

## Próximas ações com ordem obrigatória
1. Validar resposta real e manifest por host `app.appvendorai.com` e por tenant.
2. Auditar logos: imagem maskable verdadeira, origem CORS, dimensões, aplicação da marca oficial sem modificar arquivo.
3. Verificar service worker existente/registrado, lifecycle, atualização e estratégia de invalidação. Resolver conflito com rotina de recuperação sem apagar projetos locais.
4. Criar instalação PWA sob feature flag, sem publicar antes da homologação em Windows, Android e iOS.
5. Projetar armazenamento local criptografado/autorizado, sincronização por versão, conflitos e migração; testar queda de rede e revogação de conta.
6. Aproveitar app Expo já existente para mobile; compilações e assinatura testadas separadamente; desktop Arqdor com implementação dedicada somente se PWA não cumprir edição 2D/3D offline.
7. Evidências por versão e SHA, testes, aprovação, release monitorado, rollback.

**Sem merge ou deploy de produção por esta auditoria.**
