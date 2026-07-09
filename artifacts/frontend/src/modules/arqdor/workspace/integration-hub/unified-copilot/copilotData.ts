import type { CopilotAction, CopilotAgent, CopilotContextItem, CopilotMessage, CopilotPlaybook, HealthCheck } from "./copilotTypes";

export const copilotAgents: CopilotAgent[] = [
  { id: "ag-001", name: "AI Architect", role: "Render, layout e especificação", module: "Design / Specification", status: "online", confidence: 94, activeTasks: 7 },
  { id: "ag-002", name: "AI Budget", role: "Orçamento e margem", module: "Budget", status: "online", confidence: 91, activeTasks: 4 },
  { id: "ag-003", name: "AI Procurement", role: "Compras e fornecedores", module: "Procurement", status: "warning", confidence: 86, activeTasks: 9 },
  { id: "ag-004", name: "AI Production", role: "Produção e OP", module: "Production", status: "idle", confidence: 82, activeTasks: 2 },
  { id: "ag-005", name: "AI Construction", role: "Obra, medição e qualidade", module: "Construction", status: "learning", confidence: 78, activeTasks: 3 },
  { id: "ag-006", name: "AI Facility", role: "Pós-obra e manutenção", module: "Facility", status: "idle", confidence: 74, activeTasks: 1 },
];

export const contextItems: CopilotContextItem[] = [
  { id: "ctx-001", title: "Projeto ARQDOR ativo", module: "Project Studio", entity: "project", confidence: 98, lastUpdated: "Agora" },
  { id: "ctx-002", title: "Render V03 aprovado", module: "Render", entity: "render", confidence: 96, lastUpdated: "Hoje 09:20" },
  { id: "ctx-003", title: "Orçamento executivo aguardando aceite", module: "Budget / Client", entity: "approval", confidence: 94, lastUpdated: "Hoje 10:14" },
  { id: "ctx-004", title: "Procurement bloqueado por aprovação financeira", module: "Procurement", entity: "handoff", confidence: 93, lastUpdated: "Hoje 10:35" },
  { id: "ctx-005", title: "Produto sem ID canônico em Specification → Budget", module: "Data Sync", entity: "conflict", confidence: 89, lastUpdated: "Hoje 10:40" },
];

export const copilotActions: CopilotAction[] = [
  {
    id: "act-001",
    title: "Enviar resumo de aprovação ao cliente",
    module: "Client Experience",
    description: "Gerar mensagem com render aprovado, orçamento executivo e impacto da aprovação.",
    status: "suggested",
    impact: "critico",
  },
  {
    id: "act-002",
    title: "Criar canonicalProductId",
    module: "Data Sync",
    description: "Definir ID único para produto entre Specification, Budget, Procurement e Marketplace.",
    status: "approved",
    impact: "alto",
  },
  {
    id: "act-003",
    title: "Ativar evento budget.approved",
    module: "Event Bus",
    description: "Evento deve liberar Procurement e Production automaticamente.",
    status: "suggested",
    impact: "alto",
  },
  {
    id: "act-004",
    title: "Manter Construction e Facility em mock temporário",
    module: "Integration",
    description: "Aguardar estabilização de Production antes de conectar módulos pós-obra.",
    status: "completed",
    impact: "medio",
  },
];

export const healthChecks: HealthCheck[] = [
  { id: "hc-001", service: "Project API", module: "Project Studio", status: "healthy", latency: "118ms", uptime: "99.9%", lastCheck: "Agora" },
  { id: "hc-002", service: "Render Engine", module: "Render", status: "healthy", latency: "220ms", uptime: "99.4%", lastCheck: "Agora" },
  { id: "hc-003", service: "Budget API", module: "Budget", status: "warning", latency: "510ms", uptime: "98.1%", lastCheck: "1 min" },
  { id: "hc-004", service: "Procurement Sync", module: "Procurement", status: "warning", latency: "640ms", uptime: "97.8%", lastCheck: "2 min" },
  { id: "hc-005", service: "Construction API", module: "Construction", status: "offline", latency: "—", uptime: "0%", lastCheck: "—" },
];

export const copilotMessages: CopilotMessage[] = [
  { id: "msg-001", role: "system", content: "Contexto carregado: projeto, render, orçamento, handoffs e conflitos de dados.", module: "Copilot", timestamp: "Agora" },
  { id: "msg-002", role: "assistant", content: "O principal bloqueio atual é a aprovação financeira do orçamento executivo. Sem isso, Procurement e Production permanecem bloqueados.", module: "Client / Procurement", timestamp: "Agora" },
  { id: "msg-003", role: "assistant", content: "Também existe um conflito técnico: Specification e Budget ainda não compartilham canonicalProductId.", module: "Data Sync", timestamp: "Agora" },
];

export const playbooks: CopilotPlaybook[] = [
  { id: "pb-001", name: "Destravar aprovação do cliente", trigger: "budget.waiting_client_approval", steps: 5, modules: ["Client", "Budget", "Procurement"], status: "active" },
  { id: "pb-002", name: "Resolver conflito de produto", trigger: "data.conflict.product_id", steps: 4, modules: ["Specification", "Budget", "Data Sync"], status: "active" },
  { id: "pb-003", name: "Liberar compras após aprovação", trigger: "budget.approved", steps: 7, modules: ["Budget", "Procurement", "Production"], status: "draft" },
  { id: "pb-004", name: "Gerar pós-obra", trigger: "construction.delivered", steps: 6, modules: ["Construction", "IoT", "Facility"], status: "paused" },
];

export const aiCopilotInsights = [
  {
    title: "Copilot deve ser a interface principal da operação",
    description: "Em vez de vários painéis isolados, o usuário deve perguntar e executar ações pelo copiloto único.",
    impact: "Estratégico",
    action: "Fixar no layout",
  },
  {
    title: "Health Monitor precisa bloquear ações inseguras",
    description: "Se Budget ou Procurement estiverem em warning, o Copilot deve alertar antes de executar automações.",
    impact: "Governança",
    action: "Ativar bloqueios",
  },
  {
    title: "Context Store é o próximo passo",
    description: "O Copilot precisa ler projeto, render, orçamento, compras, obra e facility por um contrato único.",
    impact: "Alta prioridade",
    action: "Criar contexto global",
  },
];
