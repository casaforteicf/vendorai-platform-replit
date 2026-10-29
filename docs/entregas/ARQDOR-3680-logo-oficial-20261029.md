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
- Verificação visual claro/escuro: pendente do preview da branch.
- Estado: implementado; aprovação geral pendente devido aos gates acima e à verificação visual. Merge e publicação não executados.
