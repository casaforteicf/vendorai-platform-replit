# Vendor.ai — Architecture Blueprint

> Versão: 1.0 · Data: 2025-07 · Status: Documento vivo  
> Revisão: trimestral ou a cada release maior  
> Mantenedores: equipe de engenharia

---

## Índice

1. [Visão geral da plataforma](#1-visão-geral-da-plataforma)
2. [Conceitos oficiais](#2-conceitos-oficiais)
3. [Arquitetura multi-tenant](#3-arquitetura-multi-tenant)
4. [Fluxo de dados Core → Verticais](#4-fluxo-de-dados-core--verticais)
5. [Padrões de desenvolvimento](#5-padrões-de-desenvolvimento)
6. [Estrutura de pastas](#6-estrutura-de-pastas)
7. [Convenções de nomenclatura](#7-convenções-de-nomenclatura)
8. [Padrões de componentes React](#8-padrões-de-componentes-react)
9. [Sistema de permissões](#9-sistema-de-permissões)
10. [Estratégia de plugins e providers](#10-estratégia-de-plugins-e-providers)
11. [Estratégia de versionamento](#11-estratégia-de-versionamento)
12. [Roadmap técnico](#12-roadmap-técnico)
13. [Guia para criar novas Verticais](#13-guia-para-criar-novas-verticais)
14. [Guia para criar novos Hubs e Engines](#14-guia-para-criar-novos-hubs-e-engines)
15. [Padrões de integração com IA](#15-padrões-de-integração-com-ia)
16. [Padrões de UX para Workspaces](#16-padrões-de-ux-para-workspaces)

---

## 1. Visão geral da plataforma

**Vendor.ai** é um SaaS multi-tenant de CRM com IA, desenhado para escalar horizontalmente por meio de **Verticais** especializadas que compartilham o mesmo **Core** de infraestrutura.

```
┌─────────────────────────────────────────────────────────────┐
│                        VENDOR.AI                            │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Arch    │  │  Beauty  │  │  Clinic  │  │  Retail  │  │
│  │ Vertical │  │ Vertical │  │ Vertical │  │ Vertical │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       │              │              │              │         │
│  ─────┴──────────────┴──────────────┴──────────────┴─────  │
│                       CORE PLATFORM                         │
│   CRM · AI Agents · Omnichannel · Analytics · Files        │
│   Knowledge · Tasks · Workflows · Billing · Identity       │
│  ───────────────────────────────────────────────────────── │
│                    INFRAESTRUTURA                           │
│   PostgreSQL · Express · React · OpenAI · Meta · Drizzle  │
└─────────────────────────────────────────────────────────────┘
```

### Princípios fundamentais

1. **Contract-first API** — o OpenAPI spec é a fonte de verdade para todos os contratos
2. **Vertical isolation** — verticais não se importam entre si; comunicam via Core
3. **Engine purity** — engines de IA são funções puras, sem IO, sem React
4. **Provider abstraction** — todo serviço externo (IA, pagamentos, armazenamento) é acessado por uma interface, nunca diretamente
5. **Tenant-first security** — toda query tem `tenantId` obrigatório; ausência é erro, não 404

---

## 2. Conceitos oficiais

### Core
O conjunto de módulos compartilhados por todos os tenants e todas as verticais: autenticação, CRM (Leads/Deals/Pipeline), AI Agents, Omnichannel (WhatsApp/Instagram), Analytics, Calendar, Files, Tasks, Knowledge, Billing e Identity.

```
Core ≠ monólito. Core é uma coleção de Hubs reutilizáveis.
```

### Vertical
Um conjunto de módulos de domínio específico, habilitado por `tenantVertical`. Exemplos:
- **Arch** — projetos arquitetônicos, renders, AIE, arqdor.ai
- **Beauty** — agenda de salão, histórico de serviços
- **Clinic** — prontuário, agenda médica
- **Retail** — estoque, PDV, coleções
- **Supermarket** — pedidos, campanhas

Cada vertical é composta de um ou mais **Workspaces** e consome **Hubs** do Core.

### Workspace
A interface principal de uma vertical — o ambiente onde o usuário trabalha. É um módulo React de alta complexidade com layout próprio, navegação interna e estado rico.

Exemplos:
- `ArqWorkspace` — workspace da vertical Arch (`/arch/render`)
- `BeautyDashboard` — workspace principal de beleza

Um Workspace:
- Tem seu próprio sidebar e módulos
- É lazy-loaded via `React.lazy()`
- Consome `WorkspaceContext` para acesso ao tenant/user/permissions
- Consome Engines e Providers via hooks ou contexto
- **Nunca** importa de outra vertical diretamente

### Hub
Um módulo Core reutilizável que expõe uma capacidade da plataforma. Hubs são consumidos por todas as verticais.

| Hub | Responsabilidade |
|---|---|
| CRM Hub | Leads, Deals, Pipeline, Contatos |
| AI Agents Hub | Configuração e invocação de agentes |
| Workflow Hub | Automações e triggers |
| Marketplace Hub | Produtos digitais, templates, assets |
| Analytics Hub | Métricas agregadas por tenant |
| Files Hub | Upload, storage e entrega de arquivos |
| Knowledge Hub | Base de conhecimento consultável |
| Notifications Hub | Alertas e notificações em tempo real |
| Tasks Hub | Tarefas com assignee, prazo e status |
| Billing Hub | Planos, uso e faturas |
| Calendar Hub | Agendamentos e eventos |

### Engine
Um módulo de processamento puro — sem IO, sem React, sem side effects. Recebe dados estruturados, retorna dados estruturados. Completamente testável com Vitest sem mocks.

```typescript
// Correto: engine puro
export function runLightingEngine(ctx: ProjectContext): LightingProfile { ... }

// Errado: engine com IO
export async function runLightingEngine(projectId: string): Promise<LightingProfile> {
  const ctx = await db.query(...) // NUNCA em um engine
}
```

Engines vivem em `src/modules/<vertical>/engines/`.

### App
Uma aplicação deployável no monorepo — um artifact com seu próprio workflow de desenvolvimento e URL de acesso. Exemplos: `artifacts/frontend`, `artifacts/api-server`, `artifacts/website`, `artifacts/mobile`.

### Asset
Qualquer arquivo binário gerenciado pela plataforma: imagens, renders, PDFs, texturas PBR, catálogos. Todo asset passa pelo Files Hub e é armazenado em object storage (S3-compatible).

### Provider
Uma implementação de um contrato de serviço externo. Todo acesso a serviços externos (IA, pagamentos, mensageria) é feito por um Provider que implementa uma interface definida no código.

```typescript
// Interface (código permanente)
interface RenderProvider {
  render(prompt: string, options: RenderOptions): Promise<RenderResult>
}

// Providers (implementações swappáveis)
class FluxProvider implements RenderProvider { ... }
class MockProvider implements RenderProvider { ... }
class OpenAIProvider implements RenderProvider { ... }
```

---

## 3. Arquitetura multi-tenant

### Modelo de isolamento

A plataforma usa **Row-Level Security lógica** — cada tabela tem `tenant_id NOT NULL` e toda query obrigatoriamente filtra por `tenantId` extraído do JWT.

```typescript
// Correto — sempre filtrar por tenant
const leads = await db.select().from(leadsTable)
  .where(eq(leadsTable.tenantId, req.user.tenantId))

// PROIBIDO — vaza dados entre tenants
const leads = await db.select().from(leadsTable)
```

### Ciclo de vida do tenant

```
TRIAL → ACTIVE → SUSPENDED → CANCELLED
              ↑         |
              └─────────┘ (reativação)
```

### Limites por tenant (configuráveis)

| Campo | Descrição | Default |
|---|---|---|
| `monthlyTokenLimit` | Tokens OpenAI/mês | null (sem limite) |
| `dailyMessageLimit` | Mensagens/dia | null |
| `maxAnalysesPerHour` | Análises IA/hora | null |
| `analysisStalenessHours` | Intervalo mínimo entre análises | 24h |
| `status` | active / suspended / cancelled | active |

### Resolução de tenant por request

```
HTTP Request
    │
    ├── JWT Bearer token
    │       └── claims: { tenantId, userId, role, vertical }
    │
    ├── authenticate middleware (artifacts/api-server/src/middleware/auth.ts)
    │       └── req.user = { tenantId, userId, role }
    │
    └── Route handler
            └── SEMPRE usa req.user.tenantId, nunca req.params
```

---

## 4. Fluxo de dados Core → Verticais

```
                    ┌─────────────┐
                    │  Frontend   │
                    │  (React)    │
                    └──────┬──────┘
                           │ hooks (React Query)
                           │ gerados pelo Orval
                    ┌──────▼──────┐
                    │  API Server │
                    │ (Express 5) │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
   ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
   │  PostgreSQL  │  │  AI Gateway │  │  Object     │
   │  (Supabase)  │  │  (OpenAI,   │  │  Storage    │
   │              │  │   Anthropic)│  │  (S3)       │
   └─────────────┘  └─────────────┘  └─────────────┘
```

### Ciclo contract-first (obrigatório para toda nova rota)

```
1. Editar lib/api-spec/openapi.yaml
        │
        ▼
2. pnpm --filter @workspace/api-spec run codegen
        │
        ├── lib/api-zod/src/generated/api.ts (Zod schemas)
        └── lib/api-client-react/src/generated/ (React Query hooks)
        │
        ▼
3. Implementar route handler em artifacts/api-server/src/routes/
        │ (usar Zod schemas para validação de input/output)
        │
        ▼
4. Usar hooks gerados no frontend
        (nunca fetch() manual em features novas)
```

### Comunicação entre verticais

Verticais **não se comunicam diretamente**. Se a vertical Arch precisa de um Lead do CRM:

```typescript
// CORRETO: via hook do Core
const { data: lead } = useGetLead(projectCrmLinkage.leadId)

// ERRADO: importar de outra vertical
import { getArchProjectLead } from '@/modules/arch/...' // PROIBIDO
```

---

## 5. Padrões de desenvolvimento

### Clean Architecture por camada

```
UI (React components)
    ↓ usa
Application (Use Cases / hooks)
    ↓ usa
Domain (Engines — funções puras)
    ↓ usa
Providers (interfaces de serviços externos)
    ↓ implementa
Infrastructure (fetch, db, S3, AI APIs)
```

**Regra:** dependências apontam sempre para baixo (inward). Engines não conhecem React. UI não conhece Drizzle.

### DDD aplicado

| Conceito DDD | Vendor.ai |
|---|---|
| Bounded Context | Vertical (Arch, Beauty, Clinic...) |
| Aggregate Root | Lead, Deal, ArchProject |
| Entity | ArqObject, ArqMaterial, Message |
| Value Object | ProjectContext, LightingProfile, PlaywrightPrompt |
| Repository | hooks gerados (useGetLead, useUpdateDeal) |
| Domain Service | Engine (runAIE, buildPrompt, generateDNA) |
| Application Service | Use Case (use-cases.ts) |

### SOLID na prática

| Princípio | Aplicação |
|---|---|
| **S** — Single Responsibility | Cada engine faz UMA análise (lighting, composition, DNA...) |
| **O** — Open/Closed | Novos providers via interface, sem modificar o engine |
| **L** — Liskov | Todo `RenderProvider` é intercambiável |
| **I** — Interface Segregation | Interfaces pequenas e focadas (não `GodProvider`) |
| **D** — Dependency Inversion | Engines recebem `ProjectContext`, não acessam DB |

---

## 6. Estrutura de pastas

### Monorepo raiz

```
vendor-ai/
├── artifacts/                    # Apps deployáveis
│   ├── api-server/               # Backend Express 5
│   ├── frontend/                 # SPA React + Vite
│   ├── mobile/                   # Expo React Native
│   └── website/                  # Site institucional
├── lib/                          # Bibliotecas compartilhadas
│   ├── api-spec/                 # OpenAPI spec (fonte de verdade)
│   ├── api-zod/                  # Zod schemas gerados
│   ├── api-client-react/         # React Query hooks gerados
│   ├── db/                       # Drizzle ORM schemas
│   ├── integrations-anthropic-ai/
│   └── object-storage-web/
├── scripts/                      # Scripts utilitários
├── docs/                         # Este arquivo e relatórios técnicos
│   ├── architecture-blueprint.md
│   └── tech-debt-report.md
├── pnpm-workspace.yaml
├── tsconfig.json
└── tsconfig.base.json
```

### Frontend — módulo de vertical

```
src/modules/<vertical>/
├── application/
│   └── use-cases.ts              # Orquestração de engines (sem IO)
├── engines/                      # Engines puros (testáveis)
│   ├── <engine-name>/
│   │   ├── <engine-name>.ts      # Função pura principal
│   │   └── <engine-name>.test.ts # Vitest — sem mocks
│   └── index.ts                  # Barrel export
├── providers/
│   ├── interfaces.ts             # Contratos de serviços externos
│   └── mock-providers.ts         # Implementação de desenvolvimento
├── plugins/
│   └── plugin-registry.ts        # Registry de providers ativos
├── shared/
│   ├── <vertical>-theme.ts       # Constantes de estilo (fonte única)
│   └── platform-types.ts         # Tipos canônicos compartilhados
├── hooks/                        # React hooks da vertical
├── integrations/                 # Bridges para Hubs do Core
│   ├── integration-types.ts
│   └── mock/
├── workspace/                    # UI principal
│   ├── context/
│   │   └── WorkspaceContext.tsx  # Contexto com dados reais do JWT
│   ├── modules/                  # Painéis do workspace (1 por módulo)
│   └── <Vertical>Workspace.tsx   # Orquestrador principal
└── <hub>/                        # Ex: arqhub/, copilot/
    ├── engines/
    ├── ui/
    ├── mock/
    └── <hub>-types.ts
```

### Backend — route por domínio

```
artifacts/api-server/src/
├── routes/
│   ├── auth.ts
│   ├── leads.ts
│   ├── deals.ts
│   ├── arch.ts                   # Rotas da vertical Arch
│   ├── beauty.ts
│   └── ...
├── middleware/
│   ├── auth.ts                   # JWT decode → req.user
│   ├── tenant.ts                 # Verifica status do tenant
│   └── rate-limit.ts
└── index.ts
```

### Database — schema por domínio

```
lib/db/src/schema/
├── tenants.ts
├── users.ts
├── leads.ts
├── deals.ts
├── conversations.ts
├── messages.ts
├── arch-projects.ts              # Vertical Arch
├── arch-objects.ts
├── arch-materials.ts
├── arch-aie-snapshots.ts
└── index.ts                      # Barrel export
```

---

## 7. Convenções de nomenclatura

### Banco de dados

| Entidade | Padrão | Exemplo |
|---|---|---|
| Tabela (Core) | `snake_case` | `leads`, `deals`, `users` |
| Tabela (Vertical) | `<vertical>_<entity>` em inglês | `arq_projects`, `arq_objects` |
| Coluna | `camelCase` no schema Drizzle | `tenantId`, `createdAt` |
| FK | `<entity>Id` | `projectId`, `leadId` |
| Enum | `UPPER_SNAKE_CASE` | `ACTIVE`, `IN_PROGRESS` |

> ⚠️ **Inconsistência atual a corrigir:** tabelas `arch_projetos` (pt-BR) vs `arq_objects` (inglês). Meta: padronizar tudo para `arq_*` em inglês. Ver P1-004 no relatório técnico.

### TypeScript / React

| Artefato | Padrão | Exemplo |
|---|---|---|
| Componente | `PascalCase` | `ArqCopilot`, `ProjectModule` |
| Hook | `camelCase` com prefixo `use` | `useArqProject`, `useWorkspace` |
| Engine (função) | `camelCase` com verbo | `runLightingEngine`, `buildPrompt`, `generateDNA` |
| Tipo / Interface | `PascalCase` | `ProjectContext`, `LightingProfile` |
| Enum (TS) | `PascalCase` | `WorkspaceEnvironment`, `AgentRole` |
| Valor de enum | `UPPER_SNAKE_CASE` | `'ACTIVE'`, `'IN_PROGRESS'` |
| Arquivo de componente | `PascalCase.tsx` | `ArqWorkspace.tsx` |
| Arquivo de engine | `kebab-case.ts` | `lighting-engine.ts` |
| Arquivo de tipos | `kebab-case-types.ts` | `copilot-types.ts` |
| Arquivo de mock | `kebab-case-mock-data.ts` | `arqhub-mock-data.ts` |
| Arquivo de hook | `camelCase.ts` | `useArqProject.ts` |

### API (OpenAPI / Express)

| Elemento | Padrão | Exemplo |
|---|---|---|
| Path | `kebab-case` | `/api/v1/arq-projects` |
| Path param | `camelCase` | `/{projectId}` |
| Query param | `camelCase` | `?tenantId=...` |
| JSON body field | `camelCase` | `{ projectId, tenantId }` |
| Tag OpenAPI | `kebab-case` | `arq-projects`, `leads` |
| Schema OpenAPI | `PascalCase` | `ArqProject`, `Lead` |

---

## 8. Padrões de componentes React

### Hierarquia obrigatória para Workspaces

```
<WorkspaceProvider>          ← dados do JWT, permissões, project ativo
  <WorkspaceLayout>          ← sidebar, topbar, body
    <ModuleContent>          ← painel ativo (lazy-loaded)
      <Engine data>          ← engine puro via hook
    </ModuleContent>
    <CopilotPanel>           ← painel lateral (collapsed/expanded)
  </WorkspaceLayout>
</WorkspaceProvider>
```

### Regras de componentes

**1. Componentes de Workspace não fazem fetch diretamente**
```typescript
// ERRADO
function ProjectModule() {
  const [project, setProject] = useState(null)
  useEffect(() => { fetch('/api/arq/...').then(...) }, [])
}

// CORRETO
function ProjectModule() {
  const { activeProject } = useWorkspace()             // do contexto
  const { data } = useGetArqProject(activeProject?.id) // hook gerado
}
```

**2. Engines são invocados via hooks, nunca via useEffect manual**
```typescript
// ERRADO
useEffect(() => {
  const result = runAIE(mockContext)
  setScores(result)
}, [])

// CORRETO
const scores = useMemo(() => runAIE(realContext), [realContext])
```

**3. Estilos inline via objeto de tema, nunca literais espalhados**
```typescript
// ERRADO
<div style={{ background: '#0d0b1e', color: 'rgba(255,255,255,0.88)' }}>

// CORRETO
import { T } from '../../shared/arqdor-theme'
<div style={{ background: T.bg, color: T.text }}>
```

**4. Componentes grandes (>200 linhas) devem ser divididos**

Limite recomendado: 200 linhas para componentes folha, 300 linhas para orquestradores de layout.

**5. Props typing obrigatório — nunca `any`**
```typescript
// ERRADO
function AgentCard({ agent }: { agent: any }) { ... }

// CORRETO
function AgentCard({ agent }: { agent: AgentSpec }) { ... }
```

### Padrão de módulo de Workspace

Todo módulo (painel) do workspace segue este template:

```typescript
// workspace/modules/MyModule.tsx
import { useWorkspace } from '../context/WorkspaceContext'
import { T } from '../../shared/arqdor-theme'

export function MyModule() {
  const { activeProject, hasPermission } = useWorkspace()

  if (!hasPermission('PROJECT_VIEW')) return <PermissionDenied/>
  if (!activeProject) return <EmptyState/>

  return (
    <div style={{ height: '100%', background: T.bg }}>
      {/* conteúdo */}
    </div>
  )
}
```

---

## 9. Sistema de permissões

### Hierarquia de roles

```
super_admin          ← acesso a todos os tenants
  tenant_admin       ← acesso total ao seu tenant
    manager          ← gestão de equipe e configurações
      agent          ← operação do dia-a-dia
        viewer       ← leitura apenas
```

### WorkspacePermissions (vertical Arch)

```typescript
type WorkspacePermission =
  | 'PROJECT_VIEW'       // Ver projetos
  | 'PROJECT_EDIT'       // Editar objetos e materiais
  | 'PROJECT_RENDER'     // Disparar renders
  | 'MATERIAL_SELECT'    // Selecionar materiais do ARQ HUB
  | 'LIBRARY_ACCESS'     // Acessar biblioteca de componentes
  | 'MARKETPLACE_ACCESS' // Comprar no marketplace
  | 'CRM_LINK'           // Vincular projeto a lead/deal
  | 'TASK_CREATE'        // Criar tasks no Task Hub
  | 'ANALYTICS_VIEW'     // Ver analytics do workspace
  | 'AGENT_INVOKE'       // Invocar agentes de IA
  | 'WORKFLOW_TRIGGER'   // Disparar automações
  | 'KNOWLEDGE_READ'     // Consultar Knowledge Hub
  | 'FILES_UPLOAD'       // Upload de arquivos
```

### Verificação de permissão

```typescript
// No componente
const { hasPermission } = useWorkspace()
if (!hasPermission('PROJECT_RENDER')) return <UpgradePrompt/>

// Utilitário
const canRender = useCan('PROJECT_RENDER')
```

### Permissões no backend

```typescript
// Middleware de role
router.post('/arq/projects/:id/render',
  authenticate,           // verifica JWT
  requireRole('agent'),   // verifica role mínimo
  async (req, res) => { ... }
)
```

---

## 10. Estratégia de plugins e providers

### Plugin Registry

O registry central controla quais providers estão ativos para cada serviço:

```typescript
// plugins/plugin-registry.ts
export const ACTIVE_REGISTRY = {
  render:   new MockRenderProvider(),    // trocar por FluxProvider em prod
  prompt:   new MockPromptProvider(),
  storage:  new S3StorageProvider(),
  ai:       new OpenAIProvider(),
}
```

### Como trocar um provider (exemplo: Flux para OpenAI)

1. Criar `providers/openai-render-provider.ts` implementando `RenderProvider`
2. Atualizar `ACTIVE_REGISTRY.render = new OpenAIRenderProvider()`
3. Zero mudanças nos engines ou na UI

### Adicionando um novo provider

1. Definir interface em `providers/interfaces.ts`
2. Implementar mock em `providers/mock-providers.ts`
3. Registrar no `ACTIVE_REGISTRY`
4. Implementar provider real quando necessário

### Regra: Providers nunca são chamados diretamente

```typescript
// ERRADO — acopla o engine a um serviço específico
import { FluxProvider } from '../providers/flux-provider'
const result = await new FluxProvider().render(prompt)

// CORRETO — usa o registry
import { ACTIVE_REGISTRY } from '../plugins/plugin-registry'
const result = await ACTIVE_REGISTRY.render.render(prompt)
```

---

## 11. Estratégia de versionamento

### API versioning

```
/api/v1/...     ← versão atual (stable)
/api/v2/...     ← próxima versão (quando breaking changes forem necessários)
```

**Breaking changes** requerem nova versão de API. Não-breaking changes (campos opcionais, novos endpoints) podem ir na versão atual.

### Banco de dados

- **Adições** (novas colunas, novas tabelas): migração via Drizzle push ou ALTER TABLE manual
- **Remoções**: NUNCA remover coluna sem período de deprecation de 1 release
- **Renomeações**: usar ADD + deprecate + DROP em 3 releases

### Frontend

- Componentes de workspace são internos — não há versioning de UI
- Engines têm versão implícita via testes — qualquer mudança de output deve ser capturada por testes

### Semver para libs compartilhadas

```
lib/api-zod      → versão bumpa quando schema gerado muda shape
lib/db           → versão bumpa quando schema exportado muda
lib/api-client-react → versão bumpa quando hooks mudam assinatura
```

---

## 12. Roadmap técnico

### Agora (P0 — crítico)
- [ ] Conectar AIE e Copilot ao projeto real (Task #191)
- [ ] Adicionar rotas `/api/arq/*` ao OpenAPI spec
- [ ] Corrigir `WorkspaceContext` para usar JWT real

### Próximo sprint (P1 — alta prioridade)
- [ ] Extrair tema para `arqdor-theme.ts`
- [ ] Adicionar `/api/v1/` prefix
- [ ] Testes unitários para 9 engines puros
- [ ] Error boundary em `useArqProject`

### Médio prazo (Q3 2025)
- [ ] Dividir `AIEDashboard.tsx` e `PromptPlaygroundModule.tsx`
- [ ] Padronizar nomenclatura de tabelas Arch (`arq_*`)
- [ ] Implementar `/api/arq/learning` com dados reais
- [ ] Implementar CRM Tab do IntegrationModule com dados reais

### Longo prazo (Q4 2025 — Q1 2026)
- [ ] UI de edição de objetos e materiais no Workspace (Task #202)
- [ ] Persistência de variações de prompt no banco
- [ ] Mobile workspace (Expo) para arqdor.ai
- [ ] Lazy loading de providers no plugin registry
- [ ] Suporte a multi-workspace por tenant (múltiplos projetos ativos)

---

## 13. Guia para criar novas Verticais

### Passo 1: Schema de banco

```typescript
// lib/db/src/schema/<vertical>-projects.ts
export const <vertical>Projects = pgTable('<vertical>_projects', {
  id:       uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name:     varchar('name', { length: 255 }).notNull(),
  status:   varchar('status', { length: 50 }).default('DRAFT'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})
```

Adicionar ao `lib/db/src/schema/index.ts`.

### Passo 2: OpenAPI spec

```yaml
# lib/api-spec/openapi.yaml
/api/v1/<vertical>/projects:
  get:
    tags: [<vertical>-projects]
    summary: List projects
    parameters:
      - $ref: '#/components/parameters/tenantId'
    responses:
      '200':
        content:
          application/json:
            schema:
              type: array
              items:
                $ref: '#/components/schemas/<Vertical>Project'
```

Executar `pnpm --filter @workspace/api-spec run codegen`.

### Passo 3: Route handler

```typescript
// artifacts/api-server/src/routes/<vertical>.ts
router.get('/projects', authenticate, async (req, res) => {
  const projects = await db.select()
    .from(<vertical>Projects)
    .where(eq(<vertical>Projects.tenantId, req.user.tenantId))
  res.json(projects)
})
```

### Passo 4: Estrutura de módulos frontend

```bash
mkdir -p src/modules/<vertical>/{engines,providers,plugins,shared,workspace,hooks,integrations}
```

Criar:
- `shared/<vertical>-theme.ts` — tema de cores
- `shared/platform-types.ts` — tipos canônicos
- `providers/interfaces.ts` — contratos
- `providers/mock-providers.ts` — mocks de desenvolvimento
- `plugins/plugin-registry.ts` — registry
- `workspace/<Vertical>Workspace.tsx` — UI principal
- `workspace/context/WorkspaceContext.tsx` — contexto

### Passo 5: Registrar rota e nav

```typescript
// artifacts/frontend/src/App.tsx
{vertical === '<vertical>' && (
  <Route path="/<vertical>/main" element={
    <Suspense fallback={<Loading/>}>
      <VerticalWorkspace/>
    </Suspense>
  }/>
)}
```

### Passo 6: Sidebar

Adicionar ao `SidebarLayout.tsx` a entrada condicional por `tenantVertical`.

---

## 14. Guia para criar novos Hubs e Engines

### Novo Hub

Um Hub é um módulo Core reutilizável. Para criar um novo Hub:

1. **Definir tipos** em `src/modules/<vertical>/integrations/integration-types.ts`
2. **Criar mock data** em `integrations/mock/<hub>-mock-data.ts`
3. **Criar aba** no `IntegrationModule.tsx`
4. **Adicionar ao HubMeta registry** com `connected: false` inicialmente
5. **Implementar endpoints** no backend quando pronto
6. **Conectar dados reais** substituindo mock por hooks gerados

### Novo Engine

Um Engine é uma função pura de análise ou geração. Para criar um novo:

```typescript
// engines/<engine-name>/<engine-name>.ts

import type { ProjectContext } from '../../shared/platform-types'

export interface <EngineResult> {
  score: number           // 0–100
  findings: string[]
  recommendations: string[]
}

export function run<EngineName>Engine(ctx: ProjectContext): <EngineResult> {
  // lógica pura — sem IO, sem React, sem side effects
  return {
    score: 0,
    findings: [],
    recommendations: [],
  }
}
```

**Teste obrigatório:**

```typescript
// engines/<engine-name>/<engine-name>.test.ts
import { describe, it, expect } from 'vitest'
import { run<EngineName>Engine } from './<engine-name>'
import { MOCK_PROJECT_CONTEXT } from '../../engines/aie/aie-mock-context'

describe('run<EngineName>Engine', () => {
  it('returns score between 0 and 100', () => {
    const result = run<EngineName>Engine(MOCK_PROJECT_CONTEXT)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })
})
```

**Registrar no orquestrador AIE** se for um sub-engine do AIE:

```typescript
// engines/aie/aie-engine.ts
import { run<EngineName>Engine } from './engines/<engine-name>'

export function runAIE(ctx: ProjectContext): AIEResult {
  return {
    // ...outros engines
    <engineName>: run<EngineName>Engine(ctx),
  }
}
```

---

## 15. Padrões de integração com IA

### Regra: toda IA passa pelo AI Gateway

```typescript
// ERRADO — chama OpenAI diretamente
import OpenAI from 'openai'
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// CORRETO — usa o gateway da plataforma
import { createClient } from '@workspace/integrations-anthropic-ai'
const client = createClient()
```

O AI Gateway gerencia:
- Seleção de provider (OpenAI, Anthropic, etc.)
- Billing e contabilização de tokens
- Rate limiting por tenant
- Fallback entre providers

### Padrões por tipo de IA

| Uso | Pattern |
|---|---|
| Chat / SDR / Agentes | `agent_configs` + AI Gateway + streaming |
| Análise de projeto (AIE) | Engine puro → snapshot → `/api/arq/aie-snapshots` |
| Geração de render | Plugin Registry → `RenderProvider` → object storage |
| Geração de prompt | `buildPrompt()` (engine puro) → translator-specific output |
| DNA do projeto | `generateDNA()` (engine puro) → display only |
| Geração de conteúdo | `/api/content` → AI Gateway |

### Token governance (obrigatório em produção)

```typescript
// Antes de qualquer chamada de IA no backend
const tenant = await getTenant(tenantId)
if (tenant.tokensUsedCurrentMonth >= tenant.monthlyTokenLimit) {
  return res.status(429).json({ error: 'Monthly token limit reached' })
}
// ... chamar IA ...
await incrementTokenUsage(tenantId, tokensUsed)
```

### Engines de IA puros vs. chamadas reais

```
Engine puro (síncrono, sem IO):
  runLightingEngine(), generateDNA(), buildPrompt()
  → Análise local, instantânea, sem custo de API

Chamada real de IA (assíncrona, com custo):
  render, análise de imagem, geração de texto
  → Sempre via Provider + AI Gateway + token governance
```

---

## 16. Padrões de UX para Workspaces

### Layout padrão de Workspace

```
┌────────────┬──────────────────────────────────┬──────────┐
│  TOPBAR    │  TOPBAR                           │  TOPBAR  │
├────────────┼──────────────────────────────────┼──────────┤
│            │                                  │          │
│  SIDEBAR   │        MODULE CONTENT            │ COPILOT  │
│  (módulos) │        (painel ativo)            │  PANEL   │
│            │                                  │          │
│  220px     │        flex: 1                   │  300px   │
│ (56px col) │                                  │ (40px c) │
└────────────┴──────────────────────────────────┴──────────┘
```

### Tema de cores (arqdor.ai — referência)

```typescript
export const T = {
  bg:      '#0d0b1e',                    // fundo global
  sidebar: '#0f0c22',                    // fundo sidebar
  surface: 'rgba(255,255,255,0.04)',     // cards e painéis
  border:  'rgba(255,255,255,0.08)',     // bordas
  purple:  '#7c3aed',                    // accent principal
  purpleL: '#a78bfa',                    // accent light / textos accent
  text:    'rgba(255,255,255,0.88)',     // texto primário
  dim:     'rgba(255,255,255,0.44)',     // texto secundário
} as const
```

Cada vertical deve ter seu próprio arquivo de tema, mas seguir esta estrutura de tokens.

### Regras de UX obrigatórias

1. **Loading states**: Todo dado assíncrono deve ter skeleton ou spinner durante carregamento
2. **Empty states**: Todo painel sem dados deve ter mensagem explicativa e CTA
3. **Error states**: Falhas de rede devem mostrar erro com botão de retry
4. **Feedback imediato**: Ações (salvar, copiar, exportar) devem dar feedback visual em ≤200ms
5. **Módulos lazy-loaded**: Todo módulo de workspace usa `React.lazy()` com `Suspense`
6. **Sidebar collapsible**: Todo workspace tem sidebar que colapsa para ícones (56px)
7. **Copilot panel**: Workspaces complexos têm painel lateral de assistente IA (300px / 40px colapsado)

### Acessibilidade mínima

- Todas as ações têm `title` ou `aria-label`
- Contraste mínimo 4.5:1 para texto (WCAG AA)
- Foco visível em todos os elementos interativos
- Nenhuma ação crítica depende apenas de cor

### Responsividade

- Workspace principal: desktop-first (min 1280px)
- Sidebar colapsa automaticamente abaixo de 1024px
- Copilot panel oculto por padrão em tablets
- Mobile: usar o app Expo (`artifacts/mobile`), não o workspace web

---

## Apêndice A — Decisões de arquitetura registradas

| Data | Decisão | Motivo |
|---|---|---|
| 2025-Q1 | Contract-first API com Orval | Type safety end-to-end, elimina drift entre frontend e backend |
| 2025-Q1 | Supabase Postgres com pooler sa-east-1 | Baixa latência Brasil; conexão direta bloqueada no Replit |
| 2025-Q2 | Engines puros sem IO | Testabilidade; separação clara de concerns; eliminação de side effects |
| 2025-Q2 | Plugin Registry para providers de IA | Permite trocar Flux/OpenAI/Mock sem tocar engines |
| 2025-Q2 | WorkspaceContext por vertical | Evita prop drilling; isola dados de tenant/user dos módulos |
| 2025-Q2 | Drizzle ORM | Type safety nativa; migrations controladas; compatível com Supabase |
| 2025-Q2 | Mock providers em desenvolvimento | Permite desenvolver UI e engines sem custos de API; fácil substituição |

---

## Apêndice B — Glossário

| Termo | Definição |
|---|---|
| **Tenant** | Organização cliente da plataforma; unidade de isolamento de dados |
| **Vertical** | Conjunto de módulos especializados para um segmento (Arch, Beauty...) |
| **Workspace** | Interface principal de uma vertical |
| **Hub** | Módulo Core reutilizável (CRM, Files, Analytics...) |
| **Engine** | Função pura de análise ou geração de dados |
| **Provider** | Implementação de um contrato de serviço externo |
| **Plugin Registry** | Mapa central de providers ativos |
| **AIE** | Arq Intelligence Engine — conjunto de 12+ engines de análise arquitetônica |
| **AQM** | Arq Quality Matrix — sistema de scoring de qualidade de projeto |
| **ARQ Copilot** | Assistente conversacional do workspace Arch |
| **DNA** | Descrição condensada do projeto (estilo + materiais + intents + paleta) |
| **Prompt Playwright** | Engine que traduz o projeto para prompts de render por translator |
| **BYOK** | Bring Your Own Key — tenant usa sua própria chave de IA |
