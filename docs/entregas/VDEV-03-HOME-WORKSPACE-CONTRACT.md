# VDEV-03 — Contrato de implementação Home V4 → Workspace V1

**Status:** especificação executável para implementação em branch, NÃO validado em homologação.  
**Issue:** #3582  
**Escopo inicial:** projeto persistente e reabertura segura. Sem mocks.

## Descobertas confirmadas no repositório
- Frontend React com `artifacts/frontend/src/App.tsx` delegando ao `AppLegacy.tsx`, usando Wouter, React Query e autenticação própria.
- `lib/db/src/schema/vendi_missions.ts` já registra missões e eventos com tenantId; NÃO equivale a projetos de clientes.
- Catálogo financeiro de integrações é específico ao ERP; NÃO transformar seu estado em projetos de desenvolvimento.
- Protótipos V4/Workspace V1 não são routes de produção, não devem ser considerados implementados.

## Entidades mínimas — propor migration aditiva
`vendi_studio_projects`:
- `id` UUID PK, `tenant_id` FK not null, `owner_user_id` FK;
- `title` varchar 160 not null, `kind` enum lógico (web_app, mobile_app, website, book, ebook, course, agent, design, media, other);
- `brief` text, `template_id` nullable, `status` (draft, planning, developing, testing, published, archived);
- `settings` jsonb default {}, `created_at`, `updated_at`, `archived_at` nullable.
- Índices: tenant + updated_at DESC; tenant + owner; tenant + status.
- RLS + verificações RBAC na API; não depender apenas do frontend.
`vendi_studio_project_events` (opcional etapa seguinte): tenant_id, project_id, actor, event_type, payload sanitizado, timestamp.
`vendi_missions.source_ref_id` pode associar missão ao ID do projeto, com validação tenant server-side.

## Contratos de API propostos
- `GET /api/vendi-studio/projects?limit=20&cursor=...` → lista paginada (somente projetos visíveis da sessão/tenant).
- `POST /api/vendi-studio/projects` body `{title, kind, brief?, templateId?, idempotencyKey?}` → 201 `{id, title, kind, status, createdAt}`.
- `GET /api/vendi-studio/projects/:id` → projeto autorizado ou 404/403 conforme política.
- `PATCH /api/vendi-studio/projects/:id` → somente atributos permitidos + validação de propriedade.
- `POST /api/vendi-studio/projects/:id/brief` → salva briefing e registra evento, sem iniciar missão IA silenciosamente.
- Todas requerem sessão autenticada, tenant validado do contexto de auth, validação de payload/tamanho e auditoria. Nunca confiar em tenantId enviado pelo cliente.

## Navegação frontend proposta
- `/vendi-studio` → Home V4 oficial, dentro de shell específico do módulo.
- `/vendi-studio/projects/:id` → Workspace V1.
- CTA Criar: valida título/tipo/briefing → POST → somente após 201 navegar para rota com ID real.
- 'Continue de onde parou': dados retornados por GET, nunca cards de exemplo.
- Em loading: desabilitar submit; falha: manter formulário e oferecer retry; status 401: login; 403: sem permissão.
- Zero botões que chamam alert()/toast() como substituto de lógica real. Recursos futuros: desabilitados com explicação e status, não apresentar como disponíveis.

## Plano de testes — obrigatório antes do PR ser aprovado
1. Usuário A no tenant A cria projeto; recebe 201 + UUID, vê no GET e reabre após recarga.
2. Usuário B no tenant B não consegue listar, obter nem editar projeto A, mesmo com UUID válido.
3. Sem autenticação: 401; sem permissão: 403; projeto ausente: 404; payload inválido: 400/422.
4. Duplo clique ou retry usa idempotencyKey ou controle transacional para evitar duplicações.
5. Projeto de tipo ebook não aparece como mobile_app após reabertura.
6. API temporariamente indisponível: formulário preservado e mensagem de erro útil.
7. Menu exclusivo Vendi Studio, desktop 1366px e mobile 390px; sem regressão dos demais módulos.
8. Auditoria de requests e logs não registra briefings privados, dados pessoais ou segredos em texto livre.

## Sequência sugerida de commits
1. Migration + schema Drizzle + RLS + teste cross-tenant.
2. Handlers e testes de API.
3. Home V4 conectada (GET/POST) e Workspace por ID.
4. E2E browser teste real e evidências em homologação Contabo.

## Gate de release
Não realizar merge/publicação apenas porque existe PR. Exigir resultados de teste, healthcheck, evidência da imagem/container versionada, backup/rollback e autorização de publicação. Preservar a infraestrutura atual (Contabo/Cloudflare); sem GitHub Actions obrigatórias.
