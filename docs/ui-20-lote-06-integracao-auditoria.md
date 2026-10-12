# UI 2.0 — Lote 06, revisão de integração

Data: 2026-10-11. Branch: `feat/ui20-service-tabs-20261011`. PR: #3493 (draft).

## Correção confirmada no código
- `ServiceHome.tsx` tinha duas variáveis `modules`: o catálogo estático de cards e a propriedade de inventário vinda da API. A propriedade ocultava o catálogo, causando acesso a campos incorretos (`key`, `href`, `Icon`) e potencial erro de tipagem/runtime. O catálogo foi renomeado para `serviceCards`.
- A política de visibilidade e sua regra de carregamento continuam reutilizadas tanto na barra quanto na tela de início.

## Validação não realizada
- Typecheck, Vitest, build e teste de navegação com sessão autenticada ainda devem ser executados no ambiente do repositório.
- GitHub Actions não apresentou execuções/checks para o SHA anterior consultado; isso não constitui teste aprovado.
- Conferir a rota de cada serviço no `AppLegacy`, não somente no `App.tsx` (que carrega a aplicação legada).
- Conferir correspondência exata de categorias de tenant, entitlements, permissões por usuário e autorização no backend.
- Revisar componente de início e shell contra regressões em viewport mobile e desktop.

## Comandos de validação sugeridos
```sh
pnpm --filter @workspace/frontend exec vitest run src/lib/ui20ServiceVisibility.test.ts
pnpm --filter @workspace/frontend typecheck
pnpm --filter @workspace/frontend build
```

Não habilitar a feature flag nem fazer merge/deploy antes da homologação.
