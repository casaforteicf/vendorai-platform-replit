# ARQDOR Render GPU — gates e publicação controlada (PR #3510)

## Fonte da verdade
- PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3510
- Branch: `fix/arqdor-render-preview-parameter-invalidation-20261012`
- Base: `main` (reconciliar antes dos gates).
- Escopo: **frontend experimental** (WebGPU do navegador); não altera API Docker nem provisiona GPU na Contabo.

## Bloqueio identificado em 13/10/2026
- Operador Vendi: `releaseStatus RENDER-01` -> `LOT_NOT_REGISTERED`.
- Isso apenas significa que falta um manifesto root-owned para o **runner Docker** `vendi04-release-runner.sh`.
- **Não criar manifesto Docker para publicar este PR frontend.** O Render WebGPU precisa de build Vite, homologação visual e rota de frontend oficial. O próprio repositório contém registros de deploy frontend via cron Contabo e de Cloudflare Pages nativo: confirmar qual mecanismo atende o domínio ativo antes de qualquer publicação.
- Produção permanece intocada e PR em draft até validação.

## Gates obrigatórios (no checkout completo)
1. Confirmar SHA da HEAD e reconciliação com main atual por API REST GitHub.
2. `pnpm@10.26.1 install --no-frozen-lockfile`.
3. `pnpm run typecheck:libs`.
4. `cd artifacts/api-server && pnpm exec tsc -p tsconfig.launch-ci.json --noEmit && node build.mjs`.
5. `cd artifacts/frontend && pnpm exec vitest run --config vitest.config.ts src/modules/arqdor/workspace/smart-render-engine/render-gpu-capabilities.test.ts src/modules/arqdor/workspace/smart-render-engine/render-webgpu-preview.test.ts`.
6. `cd artifacts/frontend && pnpm run build` (inclui auditoria de bundle pelo postbuild).
7. TypeScript frontend: conferir erros novos versus main no mesmo ambiente conforme `docs/PROTOCOLO-EXECUCAO-AGENTES.md`.

## Testes de navegador obrigatórios
- Navegador com WebGPU: triângulo simples gera imagem visível e com orientação correta; registrar screenshot e eventuais erros de validação WGSL.
- Dispositivo sem WebGPU: botão experimental indisponível; render CPU continua funcionando.
- Cena com 513 triângulos, coordenadas NaN e `truncated=true`: rejeição sem alocar GPU.
- Troca de projeto/parâmetros e cancelamento durante geração: não exportar/salvar imagem obsoleta.
- Confirmar que backend do Render IA, dados de projetos, acesso multi-tenant e Biblioteca não regrediram.
- GPU experimental **não** representa PBR, GI, path tracing, 4K ou GPU servidor.

## Critério de saída
Somente marcar homologado quando comandos, resultados, SHA e evidência visual tiverem sido registrados. Se algum teste falhar, manter feature experimental desabilitada e o PR em draft. Não fazer merge ou deploy com evidência ausente.
