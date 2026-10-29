# ARQDOR-3680 — logo oficial

- Data: 2026-10-29
- Branch: `fix/arqdor-profissional-sete-ambientes-20261029`
- PR: [#3680](https://github.com/casaforteicf/vendorai-platform-replit/pull/3680)
- Objetivo: substituir o logo improvisado pelo PNG oficial anexado, preservando os sete ambientes aprovados e a regra de zero redundância.
- Escopo: `ArqWorkspace.tsx` e `public/brand/arqdor-logo.png`; sem alterações no Portal do Cliente ou na PR #3679.
- Arquivo: PNG original 1254 × 1254, RGBA; SHA-256 `1ca9224d2ae4f600db0ead4cf4b02325a106abf4bab49dee4ae066665220dd8d`.
- Navegação: teste estático `ARQDOR_SETE_AMBIENTES_STATIC_OK`.
- Suíte frontend: 846/847 testes passaram; a falha é uma expectativa existente de rota `/arch`, enquanto o código-base define `/arch/studio`. A mesma expectativa e rota estão na base `main` (`05d3ccc`).
- Auditoria UI: bloqueada (282 achados HIGH; baseline configurado 170; contratos HTTP 179 vs 170; erros visíveis 64 vs 56). O gate é repo-wide e não foi possível atribuir os achados à mudança do logo.
- Build frontend: `vite build` concluído; avisos de sourcemap e chunks grandes. Typecheck não concluído.
- Preview da branch: Cloudflare Pages reportou deploy bem-sucedido em `5a578497.vendorai.pages.dev`; o PNG foi servido com 1254 × 1254 px.
- Contraste visual: o PNG original foi conferido em fundos claro e escuro; o símbolo verde permanece visível sem filtro e sem distorção. A tela do Workspace não pôde ser acessada: o preview redireciona ao login e o acesso de demonstração retornou HTTP 500.
- Estado: implementado e preview publicado; aprovação geral pendente pelos gates acima e pela inspeção do Workspace. Merge e publicação de produção não executados.
