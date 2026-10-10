# UI-01.6 — Preview de navegação contextual

Issue: #3452. PR: #3453. Status: implementado na branch, não homologado.

## Comportamento
- `SidebarLayout.tsx` mantém toda a navegação antiga intacta.
- `VITE_UI01_CONTEXT_NAV === "true"` é obrigatório para habilitar a prévia de um contexto autenticado.
- Por padrão, a variável não é definida: não há consulta adicional nem interface visível.
- O backend `GET /api/ui/contexts` retorna somente o tenant da sessão verificada, sem concessão de módulos.
- O componente `ContextSwitcher` está desabilitado na prévia. Troca efetiva de tenant/projeto ainda não existe.
- A flag é controle de rollout visual, não mecanismo de autorização: permissões reais continuam no backend.

## Validações restantes
1. Executar testes Vitest de `unifiedExperienceCatalog`, `unifiedLegacySessionAdapter`, `unifiedContextsApi`, `ContextSwitcher` e `ui-context-policy`.
2. Executar typecheck de frontend e backend e investigar quaisquer falhas.
3. Confirmar que `/api/ui/contexts` funciona com sessão humana ativa e recusa tokens de obra, pré-projeto e IA.
4. Exercitar troca de tenant via mecanismo atual de superadmin e verificar ausência de contexto residual.
5. Fazer revisão de acessibilidade e layouts mobile/desktop.
6. Revisar permissões/entitlements da API antes de habilitar experiências dinâmicas.
7. Não fazer merge, deploy ou habilitar flag em produção antes da homologação.

## Segurança / futuro
Para vários tenants, usar endpoint de vínculos reais explicitamente autorizados e emitir sessão adequada por organização. Nunca confiar no tenantId do navegador, não reaproveitar override de superadmin como vínculo real e não conceder permissões com base somente na presença de opções no menu.
