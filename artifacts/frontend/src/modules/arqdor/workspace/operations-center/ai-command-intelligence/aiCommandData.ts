import type { AIAgent, AIDecision, MemoryItem, Playbook, PromptTemplate, TrainingItem } from "./aiCommandTypes";

export const agents: AIAgent[] = [
  { id: "ag-001", name: "AI Architect", role: "Projeto e render", module: "Design Studio", status: "online", score: 94, tasks: 18, lastAction: "Sugeriu alternativa de tecido" },
  { id: "ag-002", name: "AI Budget", role: "Orçamento e margem", module: "Budget", status: "online", score: 91, tasks: 11, lastAction: "Identificou economia de R$ 840" },
  { id: "ag-003", name: "AI Procurement", role: "Compras e fornecedores", module: "Procurement", status: "learning", score: 88, tasks: 22, lastAction: "Sugeriu fornecedor alternativo" },
  { id: "ag-004", name: "AI Client", role: "Portal cliente", module: "Client Experience", status: "online", score: 92, tasks: 7, lastAction: "Recomendou resumo de aprovação" },
  { id: "ag-005", name: "AI Auditor", role: "Auditoria e risco", module: "Operations", status: "online", score: 89, tasks: 9, lastAction: "Bloqueou pedido sem aprovação" },
];

export const decisions: AIDecision[] = [
  {
    id: "dec-001",
    title: "Bloquear pedido sem aprovação financeira",
    module: "Procurement",
    recommendation: "Manter regra de bloqueio para pedidos acima de R$ 5.000.",
    impact: "critico",
    status: "executed",
    confidence: 97,
  },
  {
    id: "dec-002",
    title: "Ativar workflow de comentário do cliente",
    module: "Client Experience",
    recommendation: "Criar tarefa automática quando cliente pedir alteração.",
    impact: "alto",
    status: "suggested",
    confidence: 91,
  },
  {
    id: "dec-003",
    title: "Fornecedor preferencial de iluminação",
    module: "Marketplace",
    recommendation: "Definir Luminárias Pro como fornecedor preferencial para perfis LED.",
    impact: "medio",
    status: "approved",
    confidence: 93,
  },
  {
    id: "dec-004",
    title: "Normalizar SKU no webhook marketplace",
    module: "Automation",
    recommendation: "Adicionar camada de normalização antes de atualizar cotação.",
    impact: "alto",
    status: "suggested",
    confidence: 88,
  },
];

export const prompts: PromptTemplate[] = [
  { id: "pr-001", name: "Render Preservation Master", module: "Design Studio", purpose: "Preservação absoluta do projeto", version: "1.8", status: "active" },
  { id: "pr-002", name: "Budget Optimization", module: "Budget", purpose: "Economia sem perda de qualidade", version: "1.2", status: "active" },
  { id: "pr-003", name: "Supplier Risk Review", module: "Procurement", purpose: "Análise de risco de fornecedor", version: "1.1", status: "review" },
  { id: "pr-004", name: "Client Approval Summary", module: "Client Experience", purpose: "Resumo claro para aprovação", version: "1.0", status: "active" },
];

export const playbooks: Playbook[] = [
  { id: "pb-001", name: "Render aprovado → especificação", trigger: "Cliente aprova render", steps: 5, modules: ["Design", "Specification", "Budget"], status: "active" },
  { id: "pb-002", name: "Orçamento aprovado → compras", trigger: "Cliente aprova proposta", steps: 7, modules: ["Budget", "Procurement", "Production"], status: "active" },
  { id: "pb-003", name: "Comentário com alteração → revisão", trigger: "Cliente solicita ajuste", steps: 4, modules: ["Client", "Specification"], status: "draft" },
  { id: "pb-004", name: "Fornecedor atrasa → alternativa", trigger: "Lead time em risco", steps: 6, modules: ["Procurement", "Marketplace"], status: "active" },
];

export const memories: MemoryItem[] = [
  { id: "mem-001", title: "Preferência por estilo contemporâneo escandinavo", category: "Estilo", source: "Design Studio", confidence: 96, lastUpdated: "2026-07-14" },
  { id: "mem-002", title: "Evitar alteração de layout sem novo acordo", category: "Regra de projeto", source: "Tratado operacional", confidence: 100, lastUpdated: "2026-07-14" },
  { id: "mem-003", title: "Cliente prefere tecidos fáceis de limpar", category: "Cliente", source: "Portal Cliente", confidence: 88, lastUpdated: "2026-07-12" },
  { id: "mem-004", title: "Luminárias Pro tem melhor prazo para LED", category: "Fornecedor", source: "Procurement", confidence: 93, lastUpdated: "2026-07-13" },
];

export const trainingItems: TrainingItem[] = [
  { id: "tr-001", dataset: "Renders aprovados", module: "Design Studio", samples: 48, quality: 92, status: "ready" },
  { id: "tr-002", dataset: "Cotações e fornecedores", module: "Procurement", samples: 136, quality: 87, status: "processing" },
  { id: "tr-003", dataset: "Comentários de cliente", module: "Client Experience", samples: 64, quality: 84, status: "needs_review" },
  { id: "tr-004", dataset: "Orçamentos aprovados", module: "Budget", samples: 32, quality: 90, status: "ready" },
];

export const aiCommandInsights = [
  {
    title: "O tratado operacional precisa virar regra de sistema",
    description: "Decisões aprovadas não devem ser alteradas sem novo acordo explícito.",
    impact: "Governança crítica",
  },
  {
    title: "Memória da IA deve alimentar render, especificação e compras",
    description: "Preferências de estilo e fornecedores devem ser reutilizadas automaticamente.",
    impact: "Consistência",
  },
  {
    title: "Playbook de comentário do cliente deve ser ativado",
    description: "Solicitações do portal precisam virar tarefa rastreável.",
    impact: "Redução de retrabalho",
  },
];
