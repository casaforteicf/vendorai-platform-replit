import type { ApprovalItem, ClientFile, ClientProject, CommentItem, FinancialItem, ScheduleItem, TimelineItem } from "./clientExperienceTypes";

export const clientProject: ClientProject = {
  id: "client-project-001",
  title: "Projeto ARQDOR",
  clientName: "Cliente Demo",
  phase: "Aprovação e compras",
  progress: 68,
  nextAction: "Aprovar orçamento executivo e liberação de compras",
  portalToken: "portal-demo-token",
};

export const timelineItems: TimelineItem[] = [
  {
    id: "tl-001",
    title: "Briefing aprovado",
    description: "Escopo inicial validado com cliente.",
    date: "2026-07-01",
    status: "done",
    owner: "Cliente",
  },
  {
    id: "tl-002",
    title: "Render principal aprovado",
    description: "Conceito visual validado para seguir à documentação.",
    date: "2026-07-06",
    status: "done",
    owner: "Arquitetura",
  },
  {
    id: "tl-003",
    title: "Especificações em revisão",
    description: "Materiais e fornecedores sendo confirmados.",
    date: "2026-07-10",
    status: "active",
    owner: "ARQDOR",
  },
  {
    id: "tl-004",
    title: "Aprovação de orçamento",
    description: "Cliente deve aprovar proposta executiva.",
    date: "2026-07-14",
    status: "active",
    owner: "Cliente",
  },
  {
    id: "tl-005",
    title: "Compras e produção",
    description: "Pedidos e ordens de produção após aprovação financeira.",
    date: "2026-07-18",
    status: "pending",
    owner: "Compras",
  },
];

export const approvals: ApprovalItem[] = [
  {
    id: "ap-001",
    title: "Render Sala de Estar — V03",
    type: "Render",
    status: "approved",
    sentAt: "2026-07-06",
    dueAt: "2026-07-08",
    note: "Aprovado pelo cliente para seguir especificação.",
  },
  {
    id: "ap-002",
    title: "Orçamento Executivo — V02",
    type: "Proposta",
    status: "pending",
    sentAt: "2026-07-12",
    dueAt: "2026-07-15",
    value: 35290,
    note: "Aguardando aceite para iniciar compras.",
  },
  {
    id: "ap-003",
    title: "Tecido Poltrona Lisboa",
    type: "Material",
    status: "changes_requested",
    sentAt: "2026-07-11",
    dueAt: "2026-07-14",
    note: "Cliente pediu alternativa mais resistente.",
  },
];

export const comments: CommentItem[] = [
  {
    id: "cm-001",
    author: "Cliente Demo",
    role: "client",
    message: "Gostei do conceito, mas gostaria de uma opção de tecido mais fácil de limpar.",
    date: "2026-07-11",
    linkedTo: "Poltrona Lisboa",
  },
  {
    id: "cm-002",
    author: "AI Client",
    role: "ai",
    message: "Sugestão: apresentar Linho Performance Areia como alternativa com maior durabilidade.",
    date: "2026-07-11",
    linkedTo: "Tecido",
  },
  {
    id: "cm-003",
    author: "Arquitetura",
    role: "architect",
    message: "Vamos manter a paleta e substituir apenas a especificação do tecido.",
    date: "2026-07-12",
    linkedTo: "Especificação",
  },
];

export const files: ClientFile[] = [
  { id: "fl-001", name: "Render_Sala_V03.jpg", type: "render", size: "4.2 MB", version: "V03", status: "available" },
  { id: "fl-002", name: "Memorial_Descritivo.pdf", type: "pdf", size: "1.8 MB", version: "R01", status: "available" },
  { id: "fl-003", name: "Orcamento_Executivo_V02.pdf", type: "proposal", size: "950 KB", version: "V02", status: "available" },
  { id: "fl-004", name: "Contrato_Projeto.pdf", type: "contract", size: "680 KB", version: "R00", status: "pending" },
];

export const financialItems: FinancialItem[] = [
  { id: "fin-001", title: "Entrada projeto", amount: 5000, dueDate: "2026-07-02", status: "paid" },
  { id: "fin-002", title: "Aprovação orçamento executivo", amount: 12500, dueDate: "2026-07-15", status: "pending" },
  { id: "fin-003", title: "Compras iniciais", amount: 17790, dueDate: "2026-07-20", status: "scheduled" },
];

export const scheduleItems: ScheduleItem[] = [
  { id: "sch-001", title: "Reunião de aprovação", date: "2026-07-15", time: "14:00", type: "approval", status: "scheduled" },
  { id: "sch-002", title: "Visita técnica", date: "2026-07-18", time: "09:30", type: "site_visit", status: "scheduled" },
  { id: "sch-003", title: "Entrega iluminação", date: "2026-07-20", time: "10:00", type: "delivery", status: "scheduled" },
];

export const aiClientInsights = [
  {
    title: "Aprovação financeira é próxima trava",
    description: "O orçamento executivo precisa ser aprovado para liberar compras e produção.",
    impact: "Prioridade alta",
  },
  {
    title: "Cliente pediu troca de tecido",
    description: "A alternativa Linho Performance Areia resolve durabilidade sem alterar conceito.",
    impact: "Boa solução",
  },
  {
    title: "Portal pode acelerar aprovação",
    description: "Enviar resumo com render, orçamento e próximos passos aumenta chance de aceite.",
    impact: "Ação recomendada",
  },
];
