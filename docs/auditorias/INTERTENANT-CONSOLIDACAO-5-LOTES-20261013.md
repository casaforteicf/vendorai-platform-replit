# Consolidação intertenant — auditoria e execução (13/10/2026)

> **Status: EM PREPARAÇÃO — NÃO MERGEAR / NÃO PUBLICAR.** Este documento não declara que as pendências estejam resolvidas.

## Base verificável
- Base da branch: `main` no SHA `15c1310e038c1a806e6bfbd8ae590ce0e82e3ed4`.
- PR #3083: merged, representação intertenant, responsabilidades, comissões e migration 533.
- PR #3301: encerrada sem merge; 21 commits na ponta `3b4a45c3a93829bc3c20054a103af6c9be60ee3a`; em relação à main examinada, GitHub indica 21 ahead / 261 behind. Não reaplicar a branch de forma indiscriminada.
- Arquivos identificados em #3301: `artifacts/api-server/src/lib/round-robin.ts`, rotas `commercial_partnerships.ts`, `deals.ts`, `entregas.ts`, `leads.ts`, `users.ts`; páginas `Deals.tsx`, `LeadWorkspace.tsx`, `Usuarios.tsx`; migration `540_intercompany_shared_pipeline.sql`; schemas `tenant_commercial_partnerships.ts` e `tenant_user_functions.ts`.
- Histórico de Cloudflare Pages em #3301 aponta falha de compilação; não representa teste aprovado. Não pressupor que migrations 533/540 estejam aplicadas.

## Inventário das pendências e gates de aceite

| Lote | Prioridade | Escopo | Aceite obrigatório |
| --- | --- | --- | --- |
| 1 | P0 | Segurança/isolamento | Autorização por tenant, usuário, papel, participante e negócio; impedir IDOR, acesso a outros negócios, bypass por troca de tenant; verificar políticas RLS reais; eventos de troca auditáveis |
| 2 | P1 | Operação | Encaminhamento e devolução sem cópia de negócio, estado próprio no pipeline de cada tenant, atribuição e reatribuição com histórico, tarefas/prazos/notificações do destinatário, anexos com ACL por participante |
| 3 | P1 | ERP | Comissão elegível, pagamentos parciais, baixas, estornos e conciliação consistentes dos dois lados; idempotência e ausência de duplicação |
| 4 | P1/P2 | Gestão | Solicitações, OS e execução entre participantes; painel interempresa, pendências e histórico rastreável |
| 5 | P2 | Homologação | Testes E2E integrados com >=2 tenants, usuário com papel distinto, RLS, permissões negativas, API, frontend, migrações e fluxos financeiros; evidências do SHA exato na Contabo |

## Estratégia de integração
1. Inspecionar a versão atual para identificar código já implementado e diferenças reais do #3301. Não fazer merge/cherry-pick em massa.
2. Priorizar P0 e implementar/adaptar testes de segurança antes de expor novos endpoints ou rotas.
3. Evoluir em mudanças pequenas e isoladas, mantendo feature flags desativadas para recursos incompletos.
4. Revisar migrations antes de executá-las, dando preferência a alterações aditivas e idempotentes.
5. Executar: instalação de dependências; typecheck das libs; backend TypeScript `tsconfig.launch-ci.json`; backend `build.mjs`; frontend Vite; auditoria de bundles; testes direcionados e de integração.
6. Homologar via Contabo/Docker, com backup recuperável, saúde, observabilidade, versão/SHA e rollback. Produção somente após gates aprovados, conforme protocolo existente.

## Proibições e regras de publicação
- Sem Replit, TinyFish, Desktop Commander ou dependência obrigatória de GitHub Actions.
- Nunca registrar credenciais em código, testes, commits, PRs ou relatórios.
- Nunca afirmar entrega, validação, merge ou publicação sem evidência.
- Esta PR de auditoria **não** constitui conclusão dos cinco lotes e **não está liberada para merge**.

## Evidências de conclusão a anexar
- Arquivos/commits de código por requisito e matriz implementado/presente/em falta;
- resultados reexecutáveis dos testes com cenários positivos e negativos entre tenants;
- revisão de RLS e schemas;
- logs dos builds e da auditoria de bundles;
- migrations aprovadas, execução em homologação e rollback testado;
- SHA exato homologado na Contabo e resultado de healthcheck.
