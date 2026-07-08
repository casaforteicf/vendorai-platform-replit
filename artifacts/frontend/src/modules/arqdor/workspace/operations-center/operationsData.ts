import type { ActivityItem, HealthItem, NotificationItem, OperationTask, WorkflowItem } from "./operationsTypes";

export const operationTasks: OperationTask[] = [
  {
    id: "task-001",
    title: "Validar aprovação do orçamento executivo",
    module: "Client Experience",
    owner: "Financeiro",
    status: "pending",
    priority: "critical",
    dueDate: "2026-07-15",
    progress: 20,
    aiNote: "Essa tarefa bloqueia compras e produção.",
  },
  {
    id: "task-002",
    title: "Enviar cotação final da marcenaria",
    module: "Procurement",
    owner: "Compras",
    status: "in_progress",
    priority: "high",
    dueDate: "2026-07-16",
    progress: 62,
    aiNote: "Anexar checklist técnico antes do envio.",
  },
  {
    id: "task-003",
    title: "Revisar tecido alternativo da Poltrona Lisboa",
    module: "Specification",
    owner: "Arquitetura",
    status: "blocked",
    priority: "medium",
    dueDate: "2026-07-14",
    progress: 45,
    aiNote: "Aguardando decisão do cliente.",
  },
  {
    id: "task-004",
    title: "Reservar perfil LED para instalação",
    module: "Procurement",
    owner: "Produção",
    status: "done",
    priority: "medium",
    dueDate: "2026-07-20",
    progress: 100,
    aiNote: "Item recebido e reservado.",
  },
];

export const workflows: WorkflowItem[] = [
  {
    id: "wf-001",
    title: "Especificação aprovada → Solicitação de compra",
    trigger: "Item especificado e aprovado",
    action: "Criar solicitação no Procurement",
    modules: ["Specification", "Procurement"],
    status: "active",
    runs: 18,
    successRate: 96,
  },
  {
    id: "wf-002",
    title: "Orçamento aprovado → Pedido de compra",
    trigger: "Aprovação do cliente",
    action: "Liberar compras e produção",
    modules: ["Budget", "Client", "Procurement", "Production"],
    status: "active",
    runs: 7,
    successRate: 91,
  },
  {
    id: "wf-003",
    title: "Recebimento aprovado → Reserva de item",
    trigger: "Recebimento aprovado",
    action: "Reservar item para ambiente",
    modules: ["Procurement", "Production"],
    status: "active",
    runs: 12,
    successRate: 100,
  },
  {
    id: "wf-004",
    title: "Comentário do cliente → Tarefa",
    trigger: "Novo comentário com solicitação",
    action: "Criar tarefa para arquitetura",
    modules: ["Client", "Specification"],
    status: "draft",
    runs: 0,
    successRate: 0,
  },
];

export const notifications: NotificationItem[] = [
  {
    id: "nt-001",
    title: "Aprovação financeira pendente",
    description: "Orçamento executivo V02 ainda não foi aprovado pelo cliente.",
    module: "Client Experience",
    type: "critical",
    date: "2026-07-14",
  },
  {
    id: "nt-002",
    title: "Cotação de marcenaria aguardando checklist",
    description: "Pedido precisa de validação técnica antes de envio.",
    module: "Procurement",
    type: "warning",
    date: "2026-07-14",
  },
  {
    id: "nt-003",
    title: "Perfil LED reservado com sucesso",
    description: "Item aprovado e reservado para instalação.",
    module: "Inventory",
    type: "success",
    date: "2026-07-13",
  },
];

export const activities: ActivityItem[] = [
  {
    id: "act-001",
    title: "Produto especificado",
    description: "Perfil LED Linear foi vinculado à documentação técnica.",
    module: "Specification",
    actor: "AI Architect",
    date: "2026-07-13",
  },
  {
    id: "act-002",
    title: "Cotação recebida",
    description: "Marmoraria Local enviou orçamento atualizado.",
    module: "Procurement",
    actor: "Compras",
    date: "2026-07-12",
  },
  {
    id: "act-003",
    title: "Comentário do cliente",
    description: "Cliente solicitou alternativa de tecido.",
    module: "Client Experience",
    actor: "Cliente Demo",
    date: "2026-07-11",
  },
];

export const healthItems: HealthItem[] = [
  { id: "hl-001", service: "Render Engine", status: "online", latency: "210ms", uptime: "99.8%" },
  { id: "hl-002", service: "Specification Hub", status: "online", latency: "120ms", uptime: "99.9%" },
  { id: "hl-003", service: "Procurement Engine", status: "warning", latency: "480ms", uptime: "98.1%" },
  { id: "hl-004", service: "Client Portal", status: "online", latency: "160ms", uptime: "99.7%" },
];

export const aiOperationsInsights = [
  {
    title: "Aprovação financeira é o gargalo principal",
    description: "A liberação do orçamento desbloqueia Procurement e Production.",
    impact: "Prioridade crítica",
  },
  {
    title: "Workflow de comentários deve ser ativado",
    description: "Comentários do cliente já estão gerando decisões de especificação.",
    impact: "Automação recomendada",
  },
  {
    title: "Procurement está com latência elevada",
    description: "Verificar integrações de cotação e pedidos se o alerta persistir.",
    impact: "Atenção técnica",
  },
];
