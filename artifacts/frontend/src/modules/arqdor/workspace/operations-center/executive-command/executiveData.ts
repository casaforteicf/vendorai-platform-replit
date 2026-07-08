import type { CapacityItem, ExecutiveKPI, ExecutiveRisk, PortfolioProject, PredictiveItem, RealtimeEvent } from "./executiveTypes";

export const executiveKPIs: ExecutiveKPI[] = [
  { id: "kpi-001", label: "Projetos ativos", value: "12", trend: "+3", description: "Projetos em andamento no ARQDOR." },
  { id: "kpi-002", label: "Margem média", value: "18,4%", trend: "+2,1%", description: "Margem consolidada por portfólio." },
  { id: "kpi-003", label: "Risco crítico", value: "2", trend: "-1", description: "Riscos críticos ativos." },
  { id: "kpi-004", label: "Eficiência IA", value: "91%", trend: "+6%", description: "Taxa de assertividade operacional." },
];

export const portfolioProjects: PortfolioProject[] = [
  {
    id: "pf-001",
    name: "Projeto ARQDOR",
    client: "Cliente Demo",
    phase: "Aprovação e compras",
    progress: 68,
    budget: 35290,
    margin: 18,
    health: "atencao",
    nextAction: "Aprovar orçamento executivo",
  },
  {
    id: "pf-002",
    name: "Apartamento Contemporâneo",
    client: "Cliente Premium",
    phase: "Render e especificação",
    progress: 44,
    budget: 68400,
    margin: 22,
    health: "saudavel",
    nextAction: "Validar render V02",
  },
  {
    id: "pf-003",
    name: "Casa Alto Padrão",
    client: "Cliente Casa",
    phase: "Produção",
    progress: 76,
    budget: 148900,
    margin: 16,
    health: "risco",
    nextAction: "Resolver atraso fornecedor",
  },
  {
    id: "pf-004",
    name: "Loja Conceito",
    client: "Cliente Comercial",
    phase: "Orçamento",
    progress: 35,
    budget: 54200,
    margin: 20,
    health: "saudavel",
    nextAction: "Enviar proposta",
  },
];

export const predictiveItems: PredictiveItem[] = [
  {
    id: "pred-001",
    title: "Atraso provável na marcenaria",
    module: "Production",
    prediction: "Pedido pode atrasar 3 a 5 dias se aprovação financeira não ocorrer.",
    probability: 82,
    impact: "alto",
    recommendation: "Acionar cliente e financeiro hoje.",
  },
  {
    id: "pred-002",
    title: "Economia possível em tecidos",
    module: "Specification / Procurement",
    prediction: "Substituição pode reduzir custo sem perda estética.",
    probability: 91,
    impact: "medio",
    recommendation: "Apresentar alternativa ao cliente.",
  },
  {
    id: "pred-003",
    title: "Capacidade da equipe de documentação em limite",
    module: "Operations",
    prediction: "Equipe chegará a 92% de alocação nos próximos 7 dias.",
    probability: 78,
    impact: "alto",
    recommendation: "Repriorizar documentação e pausar demandas não críticas.",
  },
];

export const risks: ExecutiveRisk[] = [
  { id: "risk-001", title: "Aprovação financeira pendente", area: "Client / Budget", level: "critico", owner: "Financeiro", mitigation: "Enviar resumo executivo para aceite imediato." },
  { id: "risk-002", title: "Fornecedor de estofado com baixa pontualidade", area: "Procurement", level: "alto", owner: "Compras", mitigation: "Buscar fornecedor alternativo no marketplace." },
  { id: "risk-003", title: "Equipe de documentação próxima do limite", area: "Operations", level: "alto", owner: "Gestão", mitigation: "Redistribuir tarefas e usar playbook automático." },
  { id: "risk-004", title: "Webhook marketplace com falha de SKU", area: "Automation", level: "medio", owner: "Tech", mitigation: "Adicionar normalização de SKU antes do update." },
];

export const capacityItems: CapacityItem[] = [
  { id: "cap-001", team: "Arquitetura", capacity: 100, allocated: 74, overloadRisk: "medio" },
  { id: "cap-002", team: "Documentação", capacity: 100, allocated: 92, overloadRisk: "alto" },
  { id: "cap-003", team: "Compras", capacity: 100, allocated: 68, overloadRisk: "baixo" },
  { id: "cap-004", team: "Produção", capacity: 100, allocated: 81, overloadRisk: "medio" },
];

export const realtimeEvents: RealtimeEvent[] = [
  { id: "rt-001", title: "Cliente abriu orçamento executivo", module: "Client Experience", status: "success", timestamp: "Agora" },
  { id: "rt-002", title: "Procurement aguardando aprovação financeira", module: "Procurement", status: "warning", timestamp: "5 min" },
  { id: "rt-003", title: "AI Auditor bloqueou pedido sem aceite", module: "Operations", status: "critical", timestamp: "12 min" },
  { id: "rt-004", title: "Render V03 arquivado como aprovado", module: "Design Studio", status: "success", timestamp: "32 min" },
];

export const strategyInsights = [
  {
    title: "Priorizar aprovação financeira",
    description: "Esta é a principal trava do funil operacional e afeta compras, produção e cliente.",
    impact: "Ação imediata",
  },
  {
    title: "Criar regra de normalização de SKU",
    description: "Reduz falhas do marketplace e melhora integração com Procurement.",
    impact: "Melhoria técnica",
  },
  {
    title: "Redistribuir documentação",
    description: "Equipe está em 92% de alocação e pode virar gargalo na próxima semana.",
    impact: "Prevenção de atraso",
  },
];
