# ARQ-PARAM-13 — validação de snapshots na API

Versão: 2026.10.11.13
Código: 82b8ecfb5fbf54a289e38d6fa8f2eae08a723490
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423

## Entrega
Guardas em POST e PATCH do Concept antes da gravação. Rejeitam versão inválida, IDs duplicados, pavimentos inválidos, dimensões inválidas, vãos fora/sobrepostos, proporções de escadas e parâmetros de coberturas/esquadrias. Código HTTP 400 com ARCHITECTURAL_MODEL_INVALID. Snapshots ausentes/nulos de projetos legados permanecem compatíveis. A guarda não altera geometria nem limita elementos ao retângulo do lote.

## Arquivos
- artifacts/api-server/src/lib/arch-concept-model-validation.ts
- artifacts/api-server/src/lib/arch-concept-model-validation.test.ts
- artifacts/api-server/src/routes/arch.ts

## Verificação
5 testes locais aprovados em 2 arquivos (2 novos testes com múltiplos casos de paridade frontend/backend e 3 do helper de preservação). TypeScript do validador de produção aprovado. Typecheck do arquivo de testes bloqueado pela resolução local de vitest. Rotas integradas por inspeção de código; não executadas via HTTP, banco ou suite Express. Não equivale a homologação. Validador backend separado do frontend; testes de paridade ajudam a detectar divergências, sem garantia para todos os valores.

## Pendências
Ciclo HTTP/banco e E2E/desfazer-refazer/mobile pendentes. Biblioteca, documentação técnica, formatos e colaboração continuam com desenvolvimento pendente; este lote cobre a validação na API. Homologação/publicação Contabo adiadas pelo usuário; sem merge/main/deploy.
