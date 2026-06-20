# Resumo Executivo - VendorAI

## O que é o VendorAI

VendorAI é um **CRM SaaS multi-tenant com inteligência artificial** que automatiza vendas, atendimento e gestão de relacionamentos com clientes. Cada tenant (empresa) opera dentro de sua própria instância isolada com limites de uso e plano comercial definido.

---

## 1. Hubs de Produto

### 1.1 CRM Hub
- **Funis**: Pipeline de vendas com fases customizáveis
- **Deals**: Oportunidades vinculadas a leads e funis
- **Leads**: Cadastro de potenciais clientes com qualificação
- **Conversas**: Histórico de mensagens em todos os canais
- **Propostas**: Geração e envio de propostas comerciais
- **Atividades**: Follow-ups, tarefas e ações da equipe

### 1.2 AI Hub (7 Agentes)

| Agente | Função | Disponível em |
|---|---|---|
| **SDR** | Qualificação consultiva — pergunta necessidades, qualifica orçamento, autoridade e timeline | Starter, Growth, Enterprise |
| **Closer** | Fechamento e objeções — aplica técnicas de closing, gera contratos e pedidos | Enterprise |
| **Follow-up** | Reativação suave de leads parados (pós-qualificação) | Starter, Growth, Enterprise |
| **Reactivation** | Reativação de alto churnRisk — lida com inatividade severa | Growth, Enterprise |
| **Scheduler** | Agendamento de reuniões — integra com Google Calendar, gera Meet | Growth, Enterprise |
| **Service** | Suporte pós-venda — responde dúvidas, resolve problemas | Enterprise |
| **Onboarding** | Boas-vindas a novo cliente — orienta primeiro acesso | Enterprise |

### 1.3 Customer Intelligence Hub
- Análise de **churn risk** (risco de perda) por lead
- Score de aquecimento
- Análise de sentimento e engajamento
- Relatório de execução com exportação CSV
- Rate limit por hora (proteção contra consumo excessivo)

### 1.4 Marketing Hub
- **Campanhas**: disparo de mensagens segmentadas por WhatsApp
- **Segmentação**: templates de filtros públicos e privados
- **Campanhas de aquecimento**: agendamento automático para leads frios

### 1.5 Sales / CPQ Hub
- **Catálogo de produtos**: cadastro com preço e disponibilidade
- **Cotação automática**: quote por WhatsApp (texto + PDF)
- **Fechamento de deal**: workflow com contrato (ZapSign) + pedido (Asaas) + onboarding

### 1.6 Schedule Hub
- **Agendas**: conexão com Google Calendar (OAuth)
- **Agendamentos**: criação de reuniões, visitas, consultas, instalações
- **Auto-convites**: geração de Google Meet link

### 1.7 Billing Hub
- **Assinaturas**: gestão de planos comerciais (mensal/anual)
- **Faturas**: integração com Asaas (boletos e cartão)
- **Eventos de billing**: webhook sync
- **Créditos de tokens**: compra avulsa de créditos de uso

### 1.8 Executive Intelligence Hub
- **Dashboard**: métricas de vendas e performance
- **Analytics**: análise de pipeline, conversão e eficiência
- **Site builder**: configuração de landing pages institucionais

### 1.9 Knowledge Hub
- **Base de conhecimento**: documentos, FAQ e respostas pré-cadastradas
- **Regras do Negócio**: regras automáticas (ex: se lead X, ação Y)

### 1.10 Website Hub
- **Configuração do site**: personalização de landing pages
- **Templates**: seções de produtos, depoimentos, contato
- **Geração de site**: site completo com produtos do catálogo

### 1.11 Construção Civil Hub
- **Obras**: gerenciamento de projetos de construção
- **Acompanhamento**: fases e status de cada obra

### 1.12 Varejo Hub
- **Loja de produtos**: display de produtos com fotos
- **Pedidos**: vendas diretas com checkout
- **Nota de saúde**: integração com saúde do estoque

### 1.13 Supermercado Hub
- **Módulo de supermercado**: gestão de produtos e estoque
- **Sync de inventário**: integração com sistemas de estoque

---

## 2. Canais de Comunicação (Omnichannel)

| Canal | Descrição |
|---|---|
| **WhatsApp** | Mensagens via Z-API ou WhatsApp Cloud API (Meta) — entrada e saída |
| **Instagram** | DMs e comentários via Instagram Graph API |
| **E-mail** | Envio de propostas e contratos via Resend |
| **Áudio** | Transcrição de áudio para texto (OpenAI Whisper) |
| **Mídia** | Interpretação de imagens e PDFs (OpenAI Vision) |

---

## 3. Sistema de Planos Comerciais

### Planos

| Plano | Módulos | Preço (estimado) |
|---|---|---|
| **Starter** | SDR + Follow-up | R$ 97/mês |
| **Growth** | SDR + Follow-up + Scheduler + Reactivation | R$ 197/mês |
| **Enterprise** | Todos os 7 agentes + Customer Intelligence + Gestão | R$ 497/mês |

### Enforcement
- O plano de cada tenant é armazenado na tabela `tenants` (`plan_id`, `billing_cycle`, `plan_started_at`)
- O middleware `plan-guard` verifica se o agente/módulo está no plano do tenant
- Ação bloqueada: status `blocked_by_plan` no log de ações do agente
- **Modo legacy**: tenants sem plano atribuído são permitidos (transição gradual)

### Admin Endpoints
- `GET /admin/plans` — listar todos os planos
- `GET /admin/tenants/:id/plan` — ver plano e módulos de um tenant
- `PATCH /admin/tenants/:id/plan` — alterar plano do tenant

---

## 4. Automações e Jobs

### Job 1: Churn Check (a cada hora)
- Identifica leads com `churnRisk > 70`
- Aplica regras automáticas (evaluateForLead)
- Dispara WhatsApp automático (autonomous mode)

### Job 2: Reactivation (a cada 6 horas)
- Identifica deals perdidos há mais de 30 dias
- Reclassifica lead como "aquecimento"
- Dispatches agente de reactivation

### Job 3: Campaigns
- Agendamento de campanhas de aquecimento
- Disparo de mensagens automáticas

### Job 4: Customer Intelligence Auto-Analysis
- Re-análise automática quando o lead atinge o threshold de mensagens
- Respeita cooldown (stale period) e limite por hora

---

## 5. Sistema de Integrações

| Integração | Status | O que faz |
|---|---|---|
| **Asaas** | ✅ Configurado | Faturas, cobrança, boleto, cartão |
| **Google Calendar** | ✅ Configurado | Agendamento de reuniões |
| **Instagram** | ✅ Configurado | Webhook de DMs e comentários |
| **WhatsApp Cloud API** | ✅ Configurado | Webhook e envio de mensagens |
| **Resend** | ✅ Configurado | Envio de e-mails |
| **ZapSign** | ✅ Configurado | Geração de contratos |
| **OpenAI** | ✅ Configurado | GPT-4, Whisper, Vision, DALL-E |
| **Supabase** | ✅ Configurado | Banco de dados PostgreSQL |
| **ERP** | ✅ Configurado | Webhook de estoque e inventário |
| **WhatsApp (Z-API)** | ⚠️ Em migração | Sendo substituído pelo Cloud API |

---

## 6. Estrutura de Permissões

| Papel | Acesso |
|---|---|
| **super_admin** | Acesso a todos os tenants, todos os endpoints |
| **tenant_admin** | Acesso ao seu próprio tenant, gerenciamento de usuários |
| **member** | Acesso ao seu próprio tenant, operação diária |
| **partner** | Acesso ao dashboard de revendedor, acesso ao CRM bloqueado |

---

## 7. Configurações por Tenant

| Configuração | Descrição |
|---|---|
| `monthlyTokenLimit` | Máx. de tokens OpenAI por mês |
| `dailyMessageLimit` | Máx. de mensagens por dia |
| `maxAnalysesPerHour` | Máx. de análises de IA por hora |
| `analysisStalenessHours` | Intervalo mínimo entre análises |
| `analysisMessageThreshold` | Nº de mensagens para disparar nova análise |
| `autonomyEnabledAt` | Data de ativação do modo autônomo |
| `agentsEnabled` | JSON com configuração de cada agente (enabled, prompt) |
| `tipoFechamentoDefault` | Tipo padrão de fechamento (pedido, contrato, pedido_e_contrato) |
| `vertical` | Segmento vertical (construcao, varejo, supermercado) |
| `mensalidadeValor` | Valor da mensalidade (para revendedores) |
| `tokenCredits` | Créditos de tokens comprados |
| `partnerId` | ID do parceiro/revendedor |
| `subdomainSlug` | Subdomínio para landing page |
| `planId` | ID do plano comercial |
| `billingCycle` | Ciclo de faturamento (mensal/anual) |

---

## 8. Stack Tecnológico

| Camada | Tecnologia |
|---|---|
| **Frontend** | React + Vite + Tailwind CSS |
| **Mobile** | Expo + React Native |
| **API** | Express 5 + TypeScript + Drizzle ORM |
| **Banco** | PostgreSQL (Supabase) |
| **Validação** | Zod v4 + drizzle-zod |
| **AI** | OpenAI (GPT-4, Whisper, Vision, DALL-E) |
| **Auth** | JWT + bcrypt |
| **Deploy** | Replit (auto-deploy) |

---

## 9. Endpoints de Administração (super_admin)

| Endpoint | Função |
|---|---|
| `GET /admin/plans` | Listar todos os planos comerciais |
| `GET /admin/tenants/:id/plan` | Ver plano e módulos do tenant |
| `PATCH /admin/tenants/:id/plan` | Alterar plano do tenant |
| `GET /admin/partners` | Listar todos os parceiros |
| `POST /admin/partners` | Criar novo parceiro |
| `PATCH /admin/partners/:id` | Atualizar parceiro |
| `GET /admin/tenants/:id/partner` | Ver parceiro do tenant |
| `PATCH /admin/tenants/:id/partner` | Linkar tenant a parceiro |

---

## 10. Fluxo de Fechamento de Deal (automação)

1. Lead arrastado para "won" no kanban
2. Sistema determina o tipo de fechamento (pedido, contrato, ou ambos)
3. Se contrato: gera contrato via ZapSign
4. Se pedido: cria cobrança via Asaas
5. Após pagamento: dispara onboarding automático
6. Lead atualizado para "cliente" e deal fechado

---

## 11. Contadores e Rate Limits

| Contador | Reset |
|---|---|
| `tokensUsedCurrentMonth` | Manual (mensal) |
| `messagesSentToday` | Automático (diário) |
| `analysisCount` | Rolling window (1 hora) |
| `campaignDisparos` | Automático (período da campanha) |

---

## 12. Arquitetura de Segurança

- **JWT** com refresh token para sessão
- **Block Suspended** — tenants suspensos não podem acessar
- **Block Partner** — parceiros não acessam CRM
- **Rate Limiting** — por hora e por dia
- **Plan Guard** — bloqueia acesso a agentes não contratados
- **Fail-closed** — sem plano = allow (modo legacy), sem módulo = block

---

## 13. Monitoramento e Logs

- **Agent Actions Log**: cada ação de cada agente é registrada
- **Intelligence Analysis Log**: cada análise de IA com tokens usados
- **Messages**: todas as mensagens enviadas e recebidas
- **Billing Events**: cada evento de faturamento
- **Console**: logs estruturados com Pino (nunca console.log)

---

## 14. Configuração de Ambiente

Variáveis críticas disponíveis:
- `DATABASE_URL` (Supabase)
- `JWT_SECRET`, `SESSION_SECRET`
- `OPENAI_API_KEY`
- `ASAAS_API_KEY`
- `RESEND_API_KEY`, `VENDORAI_SIGNING_EMAIL`
- `ZAPSIGN_API_KEY` (para contratos)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`
- `WHATSAPP_VERIFY_TOKEN` (Meta)
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID` (storage de arquivos)

---

*Resumo gerado em 19 de junho de 2026*
