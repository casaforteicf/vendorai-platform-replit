import type { ChecklistItem, ConstructionPhase, ConstructionPhoto, DiaryEntry, MeasurementItem, NonConformity, SiteApproval, TeamItem } from "./constructionTypes";

export const phases: ConstructionPhase[] = [
  { id: "ph-001", title: "Preparação da sala", discipline: "Obra civil", status: "done", startDate: "2026-07-01", endDate: "2026-07-04", progress: 100, responsible: "Equipe Obra" },
  { id: "ph-002", title: "Infra elétrica para LED", discipline: "Elétrica", status: "in_progress", startDate: "2026-07-08", endDate: "2026-07-16", progress: 68, responsible: "Equipe Elétrica" },
  { id: "ph-003", title: "Marcenaria painel TV", discipline: "Marcenaria", status: "blocked", startDate: "2026-07-17", endDate: "2026-07-28", progress: 22, responsible: "Marceneiro Local" },
  { id: "ph-004", title: "Instalação bancada gourmet", discipline: "Marmoraria", status: "planned", startDate: "2026-07-24", endDate: "2026-07-26", progress: 0, responsible: "Marmoraria Local" },
];

export const diaryEntries: DiaryEntry[] = [
  {
    id: "di-001",
    date: "2026-07-14",
    weather: "Ensolarado",
    team: "Elétrica + Obra",
    activities: ["Passagem de eletrodutos", "Marcação de pontos de LED", "Conferência de painel TV"],
    blockers: ["Aprovação financeira pendente para liberar marcenaria"],
    notes: "Pontos de LED precisam ser compatibilizados com rasgo técnico do painel.",
  },
  {
    id: "di-002",
    date: "2026-07-13",
    weather: "Nublado",
    team: "Obra",
    activities: ["Limpeza de ambiente", "Conferência de parede", "Recebimento parcial de iluminação"],
    blockers: [],
    notes: "Perfil LED recebido e reservado para instalação.",
  },
];

export const teams: TeamItem[] = [
  { id: "tm-001", name: "Equipe Elétrica", role: "Instalação elétrica", company: "Elétrica Pro", allocated: 76, status: "busy" },
  { id: "tm-002", name: "Marceneiro Local", role: "Marcenaria", company: "Fornecedor", allocated: 48, status: "blocked" },
  { id: "tm-003", name: "Marmoraria Local", role: "Pedras", company: "Fornecedor", allocated: 35, status: "available" },
  { id: "tm-004", name: "Equipe Obra", role: "Apoio geral", company: "Construtora", allocated: 62, status: "busy" },
];

export const measurements: MeasurementItem[] = [
  { id: "ms-001", title: "Infra LED", discipline: "Elétrica", planned: 30, executed: 21, unit: "m", value: 3150, status: "in_progress" },
  { id: "ms-002", title: "Preparação parede painel", discipline: "Obra civil", planned: 1, executed: 1, unit: "vb", value: 1800, status: "done" },
  { id: "ms-003", title: "Instalação bancada", discipline: "Marmoraria", planned: 5.1, executed: 0, unit: "m²", value: 10488, status: "planned" },
];

export const checklists: ChecklistItem[] = [
  { id: "ck-001", title: "Pontos elétricos conferidos", category: "Elétrica", checked: true, owner: "Equipe Elétrica" },
  { id: "ck-002", title: "Rasgo técnico do LED validado", category: "Marcenaria", checked: false, owner: "Arquitetura" },
  { id: "ck-003", title: "Parede pronta para painel", category: "Obra civil", checked: true, owner: "Equipe Obra" },
  { id: "ck-004", title: "Bancada inspecionada antes da instalação", category: "Marmoraria", checked: false, owner: "Obra" },
];

export const nonConformities: NonConformity[] = [
  { id: "nc-001", title: "Divergência entre LED e painel TV", discipline: "Elétrica / Marcenaria", severity: "alto", status: "open", owner: "Arquitetura", recommendation: "Compatibilizar BIM antes de liberar produção." },
  { id: "nc-002", title: "Aprovação financeira bloqueia marcenaria", discipline: "Financeiro", severity: "critico", status: "open", owner: "Cliente / Financeiro", recommendation: "Enviar resumo executivo para aprovação." },
  { id: "nc-003", title: "Bancada aguardando inspeção final", discipline: "Marmoraria", severity: "medio", status: "review", owner: "Obra", recommendation: "Conferir cuba, cooktop e polimento." },
];

export const photos: ConstructionPhoto[] = [
  { id: "pt-001", title: "Parede do painel preparada", area: "Sala de Estar", date: "2026-07-13", status: "approved" },
  { id: "pt-002", title: "Perfil LED recebido", area: "Sala de Estar", date: "2026-07-13", status: "registered" },
  { id: "pt-003", title: "Bancada em inspeção", area: "Cozinha", date: "2026-07-14", status: "review" },
];

export const approvals: SiteApproval[] = [
  { id: "sa-001", title: "Liberação de marcenaria", type: "Produção", status: "pending", dueDate: "2026-07-15", owner: "Cliente / Financeiro" },
  { id: "sa-002", title: "Checklist elétrica", type: "Técnico", status: "approved", dueDate: "2026-07-14", owner: "Arquitetura" },
  { id: "sa-003", title: "Aceite bancada", type: "Qualidade", status: "changes_requested", dueDate: "2026-07-16", owner: "Obra" },
];

export const aiConstructionInsights = [
  {
    title: "Marcenaria está bloqueada por aprovação financeira",
    description: "Essa trava afeta cronograma físico e produção do painel.",
    impact: "Crítico",
    action: "Acionar cliente",
  },
  {
    title: "Conflito LED × painel precisa compatibilização",
    description: "Resolver antes da fabricação evita retrabalho em obra.",
    impact: "Alta prioridade",
    action: "Gerar tarefa BIM",
  },
  {
    title: "Bancada pode antecipar instalação",
    description: "Item recebido, mas depende de inspeção final.",
    impact: "Oportunidade",
    action: "Executar checklist",
  },
];
