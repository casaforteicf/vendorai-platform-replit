# Diagnóstico Técnico — Plataforma VendorAI
**Data:** 02/07/2026 | **Versão:** 1.0 | **Ambiente:** Produção + Codebase

---

## VISÃO EXECUTIVA

A VendorAI é uma plataforma SaaS multi-tenant de CRM com IA voltada para pequenas e médias empresas no Brasil. Suporta múltiplos segmentos de mercado (Arquitetura, Construção, Varejo, Saúde/Beleza, Supermercado e CRM Geral), cada um com módulos especializados. A arquitetura é robusta e bem estruturada — um monorepo com separação clara entre frontend, backend, banco de dados e bibliotecas compartilhadas.

**Nível de maturidade geral:** ★★★★☆ — Produto avançado, funcional em produção, com alguns gaps em testes automatizados e consistência de UX entre módulos.

---

## 1. ARQUITETURA GERAL

### 1.1 Estrutura do Sistema

```
Monorepo (pnpm workspaces)
├── artifacts/
│   ├── api-server/          # API Express 5 — porta 8080
│   ├── frontend/            # React SPA — raiz /
│   ├── mobile/              # Expo React Native
│   └── website/             # Site institucional (estático)
├── lib/
│   ├── db/                  # Schema Drizzle + migrações
│   ├── api-spec/            # OpenAPI YAML (contrato central)
│   ├── api-zod/             # Zod validators (gerados)
│   ├── api-client-react/    # React Query hooks (gerados)
│   └── integrations/        # Wrappers de serviços externos
└── scripts/                 # Scripts utilitários
```

### 1.2 Stack Tecnológico

| Camada | Tecnologia |
|---|---|
| **Backend** | Node.js 24, Express 5, TypeScript 5.9 |
| **Banco de dados** | PostgreSQL (Supabase) + Drizzle ORM |
| **Validação** | Zod v4, drizzle-zod |
| **Frontend Web** | React 19, Vite, Tailwind CSS, shadcn/ui, Wouter |
| **Mobile** | React Native (Expo) |
| **IA / LLM** | OpenAI (GPT-4o/mini), Anthropic (Claude) |
| **Imagens IA** | OpenAI gpt-image-1, Replicate (Flux) |
| **Build** | esbuild (API), Vite (frontend) |
| **Codegen** | Orval (OpenAPI → hooks + Zod) |
| **Infra** | Replit (hospedagem), Supabase (Postgres), Cloudflare (domínios) |

### 1.3 Padrão de Desenvolvimento (Contract-First)

```
openapi.yaml  →  Orval codegen  →  api-zod (validators)
                              └→  api-client-react (React Query hooks)
```

Qualquer nova rota deve primeiro atualizar o spec, depois gerar os artefatos via `pnpm --filter @workspace/api-spec run codegen`.

### 1.4 Multi-tenancy

- Isolamento lógico por `tenant_id` em todas as tabelas
- Middleware de subdomain/custom domain resolve o tenant a partir do hostname
- Suporte a `*.appvendorai.com` e domínios próprios verificados via DNS
- Permissões por `platform_role` (super_admin) e `role` por tenant (admin, user, viewer)

---

## 2. MÓDULOS EXISTENTES

### 2.1 Hub CRM & Vendas

| Módulo | Status | Descrição |
|---|---|---|
| **Dashboard** | ✅ Completo | Métricas gerais, feed de atividades, insights IA |
| **Leads** | ✅ Completo | Kanban + lista, briefing SPIN, IA ativa por lead |
| **Deals / Pipeline** | ✅ Completo | Funil com etapas configuráveis, probabilidade IA |
| **Conversações** | ✅ Completo | Inbox omnichannel WhatsApp + Instagram DMs |
| **Agenda** | ✅ Completo | Calendário unificado, integração Google Calendar, Meet |
| **Propostas** | ✅ Completo | Geração IA, PDF, assinatura digital, link público para cliente |
| **Atividades** | ✅ Completo | Tarefas, follow-ups, histórico por lead/deal |
| **Usuários** | ✅ Completo | Gestão de equipe, BYOK (chave OpenAI própria), perfis |
| **Configurações** | ✅ Completo | Perfil da empresa, agentes IA, WhatsApp, Instagram |

### 2.2 Hub IA & Automação

| Módulo | Status | Descrição |
|---|---|---|
| **Agentes IA** | ✅ Completo | SDR, Closer, Follow-up, Reativação, Relacionamento, Suporte |
| **Prospector** | ✅ Completo | Busca Google Places, fila de prospecção, cold outreach automático |
| **Conteúdo Instagram** | ✅ Completo | Feed, Stories, Reels — geração de texto + imagem IA |
| **Content Studio** | ✅ Completo | Suite avançada: vídeo avatar, produto, batch |
| **Campanhas** | ✅ Completo | Marketing WhatsApp/Email em massa com scheduling |
| **Inteligência (CI)** | ✅ Completo | Análise preditiva de churn, journey stage, análise de leads |
| **Rules Engine** | ✅ Completo | Gatilhos automáticos por evento/churn/etapa |

### 2.3 Hub Vertical — Arquitetura

| Módulo | Status | Descrição |
|---|---|---|
| **Arch Dashboard** | ✅ Completo | Visão geral de projetos de interiores/arquitetura |
| **Arch Render IA** | ✅ Completo | Renderização 3D com Flux (Preservar/Criar/Ajuste) |
| **Arch Catálogo** | ✅ Completo | Móveis e materiais para projetos |
| **Arch Marketplace** | 🟡 Parcial | Itens disponíveis, sem checkout integrado |
| **Portal do Cliente** | ✅ Completo | Link externo para cliente aprovar renders |

### 2.4 Hub Vertical — Construção

| Módulo | Status | Descrição |
|---|---|---|
| **Obras** | ✅ Completo | Gestão de obras com fases, status, equipe |
| **Insumos** | ✅ Completo | Controle de materiais e estoque |
| **Composições SINAPI** | ✅ Completo | Orçamentos com tabela SINAPI |
| **Financeiro Obra** | ✅ Completo | DRE por obra, lançamentos, relatórios |
| **Portal de Obra** | ✅ Completo | Acesso externo para o cliente acompanhar |

### 2.5 Hub Vertical — Varejo

| Módulo | Status | Descrição |
|---|---|---|
| **Produtos Varejo** | ✅ Completo | Catálogo com categorias, gênero, preço |
| **Coleções** | ✅ Completo | Agrupamento de produtos por coleção |
| **Fidelidade** | 🟡 Parcial | Programa de pontos — leitura OK, regras incompletas |
| **Pedidos de Compra** | 🟡 Parcial | Estrutura no schema, UI básica |

### 2.6 Hub Vertical — Beleza & Saúde

| Módulo | Status | Descrição |
|---|---|---|
| **Beauty** | ✅ Completo | Agenda de profissionais, serviços, clientes |
| **Clinic** | ✅ Completo | Prontuários, consultas, médicos |
| **Supermercado** | 🟡 Parcial | Produtos e pedidos, campanhas automáticas |

### 2.7 Hub Administrativo & Financeiro

| Módulo | Status | Descrição |
|---|---|---|
| **Admin — Tenants** | ✅ Completo | Gestão de todas as contas, limites, verticais |
| **Admin — IA Usage** | ✅ Completo | Monitoramento de tokens/custo por tenant |
| **Assinatura / Planos** | ✅ Completo | Planos Starter/Growth/Enterprise + Asaas |
| **Faturamento** | ✅ Completo | Faturas, PIX/Boleto via Asaas |
| **Portal Partner** | ✅ Completo | Indicações, comissões, sub-contas |
| **Gerador de Sites** | ✅ Completo | IA gera site HTML para o tenant publicar |

---

## 3. AGENTES IA IMPLEMENTADOS

### 3.1 Agentes Conversacionais (Tempo Real)

Motor: `agent-engine.ts` + `agent-dispatch.ts`
Ativação: mensagem recebida via WhatsApp/Instagram ou evento CRM

#### Agente SDR
- **Função:** Qualificação inicial de leads, entendimento de necessidades
- **Ativação:** Lead com `status === 'novo'`
- **Entradas:** Perfil do lead, histórico de conversa, Customer Intelligence (CI)
- **Saídas:** Mensagens WhatsApp/Instagram de qualificação
- **Regras:** Máx. 3 parágrafos curtos; nunca inventar preços; sugerir agendamento se interesse claro
- **Modo autônomo:** Envia diretamente se `autonomyEnabledAt` definido; caso contrário cria tarefa `pendente_aprovacao`

#### Agente Closer
- **Função:** Remoção de objeções, fechamento de negócios
- **Ativação:** Lead em etapa `proposta` ou `negociacao`
- **Ação especial:** Detecta frases de aceite ("fechado", "aceito") → dispara `{{action:proposal_accept}}` → move deal para "Ganho" automaticamente
- **Integrações:** CRM Deals, Proposta Engine

#### Agente Follow-up
- **Função:** Reengajar leads frios
- **Ativação:** Lead inativo há ≥ 3 dias (scheduler)
- **Modos:** Primeiro Contato vs. Follow-up Rotineiro

#### Agente Reativação
- **Função:** Recuperar leads em risco de churn
- **Ativação:** `churnRisk >= 60%` (Customer Intelligence)

#### Agente Relacionamento
- **Função:** Engajamento pós-venda, aniversários, datas especiais
- **Integrações:** Calendar, dados de família extraídos das conversas por IA

#### Agente Serviço / Suporte
- **Função:** Suporte e onboarding pós-conversão
- **Ativação:** `lead.status === 'cliente'`

### 3.2 Agentes Operacionais (Background)

#### Prospector Queue
- **Função:** Geração automatizada de leads B2B
- **Fluxo:** `prospector_queue` → deduplica → cria Lead + Deal → SDR "Cold Outreach"
- **Integrações:** Google Places API, WhatsApp Cloud API
- **Controle:** `ritmo_diario` configurável por tenant

#### Content-Flow (Nurturing)
- **Função:** Disparo de sequências automáticas de nutrição
- **Etapas:** `gerando` (IA) → `enviando` (WA/Email) → `enviado`
- **Integrações:** `contentGenerator.ts`, Resend, Meta Cloud API

#### Revenue Scout
- **Função:** Identifica oportunidades de expansão na base de clientes
- **Gatilhos:** Recompra, Reativação, Cross-sell, Upgrade, Aniversário
- **Scheduler:** 09:00 BRT diário

#### Family Extractor
- **Função:** Extrai dados de família (cônjuge, filhos, datas) das conversas via IA
- **Saída:** Atualiza campos do lead no CRM automaticamente

### 3.3 Scheduler — Jobs Recorrentes

| Job | Frequência | Função |
|---|---|---|
| churn-check | :05 (hora) | Verifica risco de churn |
| campaigns | :15 (hora) | Dispara campanhas agendadas |
| content-flow | */5 min | Processa nutrição de conteúdo |
| sdr-followup | */1h | Follow-up automático SDR |
| appointment-reminders | */30min | Lembretes de agendamento |
| no-response-closing | 09:30 BRT | Fecha deals sem resposta |
| revenue-scout | 09:00 BRT | Análise de oportunidades |
| billing | dia 5, 08:00 | Cobrança mensal |
| domain-verify | */5 min | Verificação de domínios custom |
| prospector-queue | :35 (hora) | Processa fila do Prospector |
| blender-poll | 30s | Polling de renders Blender |
| daily-agenda-summary | 08:00 BRT | Resumo diário de agenda |

---

## 4. INTEGRAÇÕES EXISTENTES

| Integração | Status | Método | Função |
|---|---|---|---|
| **WhatsApp (Meta Cloud API)** | ✅ Ativo | OAuth 2.0 + Webhook | Mensagens entrada/saída, templates |
| **Instagram (Meta DM)** | ✅ Ativo | OAuth 2.0 + Webhook | DMs no inbox omnichannel |
| **Google Calendar** | ✅ Ativo | OAuth 2.0 + googleapis | Eventos, Meet links, busy-check |
| **OpenAI** | ✅ Ativo | REST SDK + AI Gateway | GPT-4o/mini para agentes, conteúdo |
| **Replicate (Flux)** | ✅ Ativo | REST API | Renders IA do módulo Arch |
| **ZapSign** | ✅ Ativo | REST API | Contratos digitais pós-proposta |
| **Resend (Email)** | ✅ Ativo | REST SDK | E-mails transacionais, alertas |
| **Asaas (Pagamentos)** | ✅ Ativo | REST API | PIX/Boleto, planos, comissões |
| **Object Storage** | ✅ Ativo | GCS via Replit Sidecar | Imagens, PDFs, uploads de usuários |
| **Anthropic (Claude)** | ✅ Ativo | REST SDK | LLM alternativo via AI Gateway |
| **ERP Webhooks** | ✅ Ativo | Outbound POST | Notifica ERP externo ao ganhar deal |
| **Google Places API** | ✅ Ativo | REST API | Descoberta de leads no Prospector |

### 4.1 Limitações por Integração

- **WhatsApp:** Mensagens proativas fora da janela de 24h exigem templates aprovados pela Meta
- **Instagram:** Restrito a contas Business/Creator; app deve estar em modo "Live" na Meta
- **Google Calendar:** Só verifica calendário "primary" por padrão; requer autorização manual por tenant
- **OpenAI:** Sujeito a cotas de token e teto de $100/dia configurado na plataforma
- **Replicate/Flux:** Usado exclusivamente para renderização Arch; modelos disponíveis: `flux-kontext-pro`, `flux-1.1-pro-ultra`, `flux-fill-pro`
- **Asaas:** Apenas métodos de pagamento brasileiros (PIX, Boleto); sandbox via env var

---

## 5. BANCO DE DADOS

### 5.1 Entidades Principais

```
tenants ──┬── users
          ├── leads ──── deals ──── agendamentos
          │           └── propostas
          ├── conversations ── messages
          ├── agent_configs
          ├── agent_tasks
          ├── content_generations
          ├── business_profiles
          ├── subscriptions
          └── [módulos verticais abaixo]
```

### 5.2 Módulos Verticais — Tabelas

| Vertical | Tabelas Principais |
|---|---|
| **Arch** | arch_projetos, arch_ambientes, arch_cenas, arch_renders, arch_catalogo, arch_marketplace_items |
| **Construção** | obras, obra_lancamentos, composicoes_sinapi, insumos |
| **Varejo** | varejo_produtos, varejo_colecoes, varejo_pedidos_compra, varejo_fidelidade |
| **Beleza** | beauty_profissionais, beauty_agendamentos, beauty_servicos |
| **Clínica** | clinic_medicos, clinic_consultas, clinic_prontuarios |
| **Supermercado** | supermercado_produtos, supermercado_pedidos |

### 5.3 Problemas e Gaps no Schema

| # | Problema | Risco | Recomendação |
|---|---|---|---|
| 1 | `partners.tenant_id` sem `.references()` formal (evita dependência circular) | Médio | Validar integridade no application layer; adicionar constraint via DDL raw |
| 2 | Campos críticos como `leads.discovery_data`, `arch_cenas.scene_data` usam JSONB sem constraints | Baixo | Documentar schema esperado; validação via Zod na API |
| 3 | Entidades de Produto fragmentadas (4 tabelas distintas por vertical) | Médio | Avaliar tabela base `produtos` com discriminador de tipo para futuras verticais |
| 4 | `leads.data_nascimento` armazenado como `text` | Baixo | Migrar para `date` para suportar operações nativas de data |
| 5 | Sem tabela de configurações globais do sistema | Baixo | Configurações críticas estão em env vars; considerar tabela `system_settings` |

---

## 6. FLUXOS OPERACIONAIS

### 6.1 Fluxo Principal — Lead Inbound (WhatsApp)

```
Mensagem recebida (Meta Webhook)
        ↓
Webhook /tenants/:id/webhooks/whatsapp
        ↓
Cria/atualiza Conversation + Message no DB
        ↓
Customer Intelligence atualiza churnRisk + journeyStage
        ↓
Rules Engine avalia gatilhos configurados pelo tenant
        ↓
agent-dispatch determina qual agente responde:
  • status=novo       → SDR
  • proposta/negoc.   → Closer
  • cliente           → Suporte
  • inativo ≥3 dias   → Follow-up
        ↓
agent-engine.ts monta prompt contextualizado
  (perfil, histórico, CI, briefing SPIN)
        ↓
OpenAI GPT-4o-mini gera resposta
        ↓
Modo Autônomo?
  SIM → Envia via Meta Cloud API
  NÃO → Cria agent_task "pendente_aprovacao" para o vendedor
```

### 6.2 Fluxo — Prospecção Ativa (Prospector)

```
Tenant configura busca (Google Places + critérios)
        ↓
POST /prospector/search → Google Places API
        ↓
Resultados inseridos na prospector_queue
        ↓
Job prospector-queue (:35/hora) processa a fila
        ↓
Deduplica contra leads existentes (pgvector similarity)
        ↓
Cria Lead + Deal (etapa "novo")
        ↓
SDR despachado para "Cold Outreach"
        ↓
Mensagem enviada via WhatsApp (respeitando ritmo_diario)
```

### 6.3 Fluxo — Proposta e Fechamento

```
Vendedor ou Closer sugere proposta
        ↓
POST /propostas → IA gera conteúdo personalizado
        ↓
PDF gerado + link público enviado ao lead
        ↓
Lead acessa /p/:token → visualiza e assina
        ↓
Closer detecta aceite ("fechado", "aceito")
        ↓
{{action:proposal_accept}} disparado
        ↓
Deal movido para etapa "Ganho"
        ↓
ZapSign gera contrato digital
        ↓
ERP Webhook notifica sistema externo (fire-and-forget)
```

### 6.4 Fluxo — Geração de Conteúdo Instagram

```
Tenant seleciona tipo (Feed/Stories/Reels) + tema
        ↓
POST /content/generate
        ↓
Verificação de limite mensal (plano Starter/Growth/Enterprise)
        ↓
Promise.all([geração de texto, geração de imagens])
  Texto: GPT-4o-mini → variações de legenda + hashtags
  Imagens: gpt-image-1 em paralelo (imageCount simultâneos)
        ↓
Resultado salvo em content_generations
        ↓
Frontend exibe variações; usuário pode publicar no Instagram
```

---

## 7. INTERFACE E EXPERIÊNCIA

### 7.1 Estrutura Atual das Telas

- **Roteamento:** Wouter (leve, sem React Router)
- **Layout:** `SidebarLayout.tsx` com sidebar dinâmica por vertical do tenant
- **Proteção de rotas:** `ProtectedRoute`, `SuperAdminRoute`, `PartnerRoute`
- **Componentes:** shadcn/ui como base, customizados para o produto

### 7.2 Rotas Frontend

| Grupo | Rotas | Notas |
|---|---|---|
| Auth | `/login`, `/register`, `/esqueci-senha` | JWT em localStorage |
| Core | `/dashboard`, `/leads`, `/leads/:id`, `/deals`, `/conversations` | Completas |
| Vendas | `/agenda`, `/propostas`, `/p/:token` | Token público sem auth |
| IA | `/content`, `/content-studio`, `/campanhas`, `/app/prospector` | Completas |
| Vertical Arch | `/arch`, `/arch/render`, `/arch/catalogo` | Completas |
| Vertical Construção | `/obras`, `/insumos`, `/composicoes` | Completas |
| Vertical Varejo | `/varejo/produtos`, `/varejo/colecoes`, `/varejo/fidelidade` | Parciais |
| Vertical Saúde | `/clinic`, `/beauty` | Completas |
| Admin | `/admin/*` | Super admin only |
| Partner | `/partner/*` | Partner role only |

### 7.3 Problemas de UX Identificados

| # | Problema | Impacto |
|---|---|---|
| 1 | Área em branco na tela de Conversações (z-index) | Médio — UX prejudicada |
| 2 | Forms de validação Zod podem exibir JSON cru em casos de erro inesperado | Baixo |
| 3 | Lazy imports pesados causam spinner perceptível em conexões lentas | Baixo |
| 4 | Responsividade mobile incompleta no Kanban e no Render Arch | Médio |
| 5 | Preview do Gerador de Sites pode aparecer em branco intermitentemente | Médio |
| 6 | Galeria de fotos no site gerado não permitia adicionar/remover fotos | Corrigido ✅ |
| 7 | Geração de conteúdo Instagram com 4+ imagens causava timeout no proxy | Corrigido ✅ |

---

## 8. DÍVIDA TÉCNICA

| Área | Problema | Prioridade |
|---|---|---|
| **Testes** | Zero testes automatizados de integração funcionando (3 existem mas com timeout flaky ~26s por import lento) | 🔴 Alta |
| **Schema de DB** | `data_nascimento` como texto; produtos fragmentados por vertical | 🟡 Média |
| **Código duplicado** | 4 tabelas de produto independentes (catalog, varejo, supermercado, insumos) sem entidade base | 🟡 Média |
| **Error handling** | Algumas rotas ainda com DB queries fora de try/catch (Express 5 captura, mas sem telemetria) | 🟡 Média |
| **Bundle size** | `dist/index.mjs` de 17.5MB para o api-server (esbuild bundle) | 🟡 Média |
| **Mobile** | App Expo pouco desenvolvido vs. web — gap de feature entre plataformas | 🟡 Média |
| **Circular dep** | `partners.tenant_id` sem FK formal por dependência circular no schema | 🟡 Média |
| **Configurações** | Configurações globais do sistema hardcoded em env vars | 🟢 Baixa |
| **API codegen drift** | Risco de rotas sem cobertura no spec OpenAPI à medida que o sistema cresce | 🟡 Média |
| **Fidelidade Varejo** | Módulo incompleto — regras de pontos não implementadas | 🟡 Média |
| **Marketplace Arch** | Sem checkout integrado | 🟢 Baixa |

---

## 9. DIAGNÓSTICO — O QUE EXISTE vs. O QUE FALTA

### ✅ O que já existe e funciona

- Multi-tenant completo com isolamento por tenant_id
- 6+ verticais de mercado com módulos especializados
- 6 agentes de IA conversacionais + 4 agentes operacionais
- Inbox omnichannel (WhatsApp + Instagram)
- Scheduler robusto com 15+ jobs recorrentes
- Pipeline de prospecção ativa (Google Places → SDR automático)
- Gerador de conteúdo Instagram (Feed/Stories/Reels) com imagens IA
- Gerador de sites com edição inline
- Propostas com PDF, assinatura e link público
- Portal do cliente (Arch + Obras)
- Programa de parceiros com comissões (Asaas)
- AI Gateway com modo platform-subsidized, BYOK e teto de custo
- Renderização 3D com Flux (Arch)
- Analytics de agentes, canais e inteligência

### 🟡 O que está parcialmente implementado

| Item | Gap |
|---|---|
| Fidelidade Varejo | Estrutura de pontos criada, regras de uso não implementadas |
| Marketplace Arch | Catálogo disponível, sem fluxo de compra/pedido |
| Supermercado | Produtos e pedidos OK; campanhas automáticas básicas |
| App Mobile | Core de leads/conversas presente; muito abaixo da paridade com web |
| Pedidos de compra Varejo | Schema existe, UI rudimentar |
| Testes automatizados | 3 testes de isolamento existem mas com timeout flaky |

### ❌ O que está faltando para o fluxo de Prospecção Ativa

| Item | Prioridade | Esforço Estimado |
|---|---|---|
| **Painel de prospecção com métricas** (taxa de resposta, leads convertidos por campanha) | 🔴 Alta | Médio |
| **Agendamento inteligente de cold outreach** (horários de pico por vertical/região) | 🔴 Alta | Médio |
| **Sequências de follow-up configuráveis** (N passos, N dias, mensagens personalizáveis) | 🔴 Alta | Alto |
| **Integração LinkedIn / Web Scraping** para enriquecer leads descobertos | 🟡 Média | Alto |
| **A/B testing de mensagens de prospecção** | 🟡 Média | Médio |
| **Blacklist/opt-out de prospecção** por número/empresa | 🔴 Alta | Baixo |
| **Webhook de resposta** para detectar automaticamente leads que responderam | 🟡 Média | Baixo |
| **Dashboard de funil de prospecção** (descoberto → contactado → respondeu → qualificado → negócio) | 🔴 Alta | Médio |

---

## 10. RECOMENDAÇÕES — PRÓXIMAS ETAPAS

### Prioridade Alta 🔴

1. **Implementar Dashboard de Prospecção Ativa**
   - Métricas: leads descobertos, contactados, taxa de resposta, conversão por vertical
   - Funil visual: Descoberto → Contactado → Respondeu → Qualificado → Deal

2. **Sequências de Follow-up Configuráveis**
   - Permitir ao tenant definir: número de tentativas, intervalo entre tentativas, mensagem personalizada por etapa
   - Atualmente o SDR faz follow-up mas sem configuração granular

3. **Blacklist de Prospecção**
   - Impedir que números/empresas já contatados ou que recusaram sejam recontactados
   - Crítico para conformidade e reputação de domínio WhatsApp

4. **Testes Automatizados**
   - Mínimo: testes de integração para os fluxos críticos (webhook WhatsApp, geração de proposta, prospector)

### Prioridade Média 🟡

5. **Agendamento Inteligente de Envios**
   - Horários de pico por segmento/região para maximizar taxa de abertura
   - Respeito a janelas de silêncio (noite, feriados)

6. **Unificação da Entidade Produto**
   - Tabela base `produtos` com discriminador de tipo
   - Reduz manutenção à medida que novas verticais são adicionadas

7. **Paridade Mobile**
   - App Expo com pelo menos as funcionalidades core: leads, conversas, agenda, tasks

8. **Enriquecimento de Leads**
   - Integrar serviço de enriquecimento (CNPJ, LinkedIn, Clearbit-like) para leads B2B descobertos pelo Prospector

### Prioridade Baixa 🟢

9. **Marketplace Arch com Checkout**
   - Adicionar fluxo de pedido + integração Asaas para venda de itens de catálogo

10. **Fidelidade Varejo**
    - Implementar regras de resgate de pontos e campanhas baseadas em pontos acumulados

---

## APÊNDICE — Limites de Escala Atuais

| Recurso | Limite Atual | Gargalo |
|---|---|---|
| PostgreSQL (Supabase) | Plano gratuito: ~500MB | Planos pagos escalam para TB |
| API (single process) | Centenas de req/s | Milhares de tenants ativos simultâneos |
| OpenAI | Limitado pela cota da chave da plataforma | Dependente do plano da conta OpenAI |
| Tokens/mês por tenant | Configurável (`monthlyTokenLimit`) | null = sem limite |
| Mensagens/dia por tenant | Configurável (`dailyMessageLimit`) | null = sem limite |
| Gerações de conteúdo/mês | Starter: 20 / Growth: 50 / Enterprise: 200 | Hardcoded em `PLAN_LIMITS` |
| Prospecção (`ritmo_diario`) | Configurável por tenant | Limitado pela cota da Places API |

---

*Documento gerado automaticamente com análise completa do codebase VendorAI em 02/07/2026.*
