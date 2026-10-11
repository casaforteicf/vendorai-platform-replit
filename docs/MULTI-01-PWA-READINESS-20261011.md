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


## MULTI-02 — Primeira implementação da oferta de instalação
- Criado `artifacts/frontend/src/components/layout/PwaInstallPrompt.tsx` e integrado ao `SidebarLayout.tsx` sob `VITE_MULTI02_PWA_INSTALL === "true"`. **Flag desativada por padrão**.
- Exibe botão **Instalar** apenas quando o navegador produz evento `beforeinstallprompt`; respeita cancelamento e `appinstalled`. Não simula suporte inexistente e não requer instalação.
- Não registra service worker, não grava dados privados e não promete funcionamento offline.
- A oferta exige teste em dispositivos e confirmação do manifesto no domínio servido. No iOS, que não oferece esse evento em versões usuais do Safari, permanece acesso web sem banner; fluxo orientado de instalação poderá ser tratado separadamente.
- Não habilitar flag antes dos gates de manifesto/ícones, navegação, contraste, interação por teclado e regressão em sessão real.
- **Não foi possível executar build/typecheck/testes neste ambiente de conector. PR permanece draft e sem merge.**


## MULTI-03 — Proteção de rascunhos locais do Arqdor (contrato)
- Novo `arqdorEncryptedDraft.ts`: serialização criptografada AES-GCM com IV aleatório e dados autenticados vinculando usuário, tenant, projeto, contexto e operação; valida versão base antes de preparar o rascunho.
- `arqdorEncryptedDraft.test.ts`: testes declarados de roundtrip, escopo, adulteração e revisão conflitante.
- **Limitações:** ainda não há persistência IndexedDB, geração/recuperação da chave entre sessões, UI Arqdor consumindo esse contrato, export de backup, sync online, upload, migração de schema ou homologação em dispositivo. Chave criptográfica deve ser injetada somente após autenticação e autorização do backend; sem chave, o rascunho é irrecuperável. Nunca armazenar chave em localStorage nem enviar em eventos/telemetria.
- **Gate de produção:** confirmar WebCrypto em navegador suportado, implementar retenção/revogação, tratar quotas e armazenamento cheio, fail-closed para troca de tenant/usuário e sincronização atômica com conflito.
