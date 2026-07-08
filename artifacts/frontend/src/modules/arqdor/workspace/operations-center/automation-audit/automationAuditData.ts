import type { AuditEvent, AutomationRule, ExecutionLog, IncidentItem, PermissionItem } from "./automationAuditTypes";

export const automationRules: AutomationRule[] = [
  {
    id: "auto-001",
    name: "Orçamento aprovado → liberar compras",
    module: "Budget / Procurement",
    trigger: "Cliente aprova orçamento",
    action: "Gerar solicitações de compra",
    status: "active",
    executions: 18,
    successRate: 96,
    lastRun: "2026-07-14 10:32",
  },
  {
    id: "auto-002",
    name: "Recebimento aprovado → reservar item",
    module: "Procurement / Production",
    trigger: "Item recebido e aprovado",
    action: "Reservar para ambiente",
    status: "active",
    executions: 12,
    successRate: 100,
    lastRun: "2026-07-13 15:10",
  },
  {
    id: "auto-003",
    name: "Comentário cliente → tarefa",
    module: "Client / Specification",
    trigger: "Cliente solicita alteração",
    action: "Criar tarefa técnica",
    status: "draft",
    executions: 0,
    successRate: 0,
    lastRun: "—",
  },
  {
    id: "auto-004",
    name: "Pedido parado → notificação",
    module: "Procurement",
    trigger: "Pedido aguardando aprovação > 48h",
    action: "Notificar responsável",
    status: "active",
    executions: 7,
    successRate: 91,
    lastRun: "2026-07-14 09:02",
  },
];

export const executionLogs: ExecutionLog[] = [
  {
    id: "exec-001",
    automation: "Orçamento aprovado → liberar compras",
    module: "Budget / Procurement",
    status: "success",
    startedAt: "2026-07-14 10:32",
    duration: "1.8s",
    output: "3 solicitações criadas.",
  },
  {
    id: "exec-002",
    automation: "Pedido parado → notificação",
    module: "Procurement",
    status: "success",
    startedAt: "2026-07-14 09:02",
    duration: "0.9s",
    output: "Notificação enviada ao financeiro.",
  },
  {
    id: "exec-003",
    automation: "Recebimento aprovado → reservar item",
    module: "Procurement / Production",
    status: "success",
    startedAt: "2026-07-13 15:10",
    duration: "1.1s",
    output: "Perfil LED reservado para Sala de Estar.",
  },
  {
    id: "exec-004",
    automation: "Webhook fornecedor → atualizar cotação",
    module: "Marketplace / Procurement",
    status: "failed",
    startedAt: "2026-07-13 11:42",
    duration: "3.2s",
    output: "Fornecedor sem SKU compatível.",
  },
];

export const auditEvents: AuditEvent[] = [
  {
    id: "aud-001",
    title: "Aprovação financeira acessada",
    module: "Client Experience",
    actor: "Gestor financeiro",
    severity: "info",
    date: "2026-07-14 11:20",
    details: "Usuário abriu aprovação do orçamento executivo V02.",
  },
  {
    id: "aud-002",
    title: "Tentativa de pedido sem aprovação",
    module: "Procurement",
    actor: "Sistema",
    severity: "warning",
    date: "2026-07-14 10:50",
    details: "Automação bloqueou geração de pedido sem aceite financeiro.",
  },
  {
    id: "aud-003",
    title: "Alteração de permissão",
    module: "Operations",
    actor: "Admin",
    severity: "security",
    date: "2026-07-13 18:03",
    details: "Perfil Compras recebeu permissão para aprovar pedidos até R$ 5.000.",
  },
  {
    id: "aud-004",
    title: "Falha em webhook fornecedor",
    module: "Marketplace",
    actor: "Webhook",
    severity: "critical",
    date: "2026-07-13 11:42",
    details: "Payload sem SKU compatível para atualização de cotação.",
  },
];

export const permissions: PermissionItem[] = [
  { id: "perm-001", role: "Admin", module: "Todos", permission: "Acesso total", status: "allowed" },
  { id: "perm-002", role: "Arquitetura", module: "Specification", permission: "Editar especificações", status: "allowed" },
  { id: "perm-003", role: "Compras", module: "Procurement", permission: "Aprovar até R$ 5.000", status: "restricted" },
  { id: "perm-004", role: "Cliente", module: "Client Portal", permission: "Aprovar e comentar", status: "restricted" },
  { id: "perm-005", role: "Fornecedor", module: "Marketplace", permission: "Publicar produto sem revisão", status: "blocked" },
];

export const incidents: IncidentItem[] = [
  {
    id: "inc-001",
    title: "Webhook marketplace falhou",
    module: "Marketplace",
    severity: "critical",
    status: "investigating",
    owner: "Tech",
    createdAt: "2026-07-13 11:42",
  },
  {
    id: "inc-002",
    title: "Pedido bloqueado por aprovação",
    module: "Procurement",
    severity: "warning",
    status: "open",
    owner: "Financeiro",
    createdAt: "2026-07-14 10:50",
  },
  {
    id: "inc-003",
    title: "Latência elevada no Procurement",
    module: "Procurement",
    severity: "warning",
    status: "resolved",
    owner: "Tech",
    createdAt: "2026-07-12 16:20",
  },
];

export const aiAuditInsights = [
  {
    title: "Regra de bloqueio está funcionando",
    description: "A automação impediu pedido de compra sem aprovação financeira.",
    impact: "Controle preservado",
  },
  {
    title: "Webhook do marketplace precisa validação de SKU",
    description: "Falha recorrente pode ser resolvida com etapa de normalização antes de atualizar cotação.",
    impact: "Correção recomendada",
  },
  {
    title: "Permissão de compras está adequada",
    description: "Limite de R$ 5.000 reduz risco operacional sem travar compras pequenas.",
    impact: "Manter regra",
  },
];
