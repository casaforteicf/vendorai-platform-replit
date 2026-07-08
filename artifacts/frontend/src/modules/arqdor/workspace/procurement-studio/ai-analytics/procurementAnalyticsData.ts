import type { AutomationRule, CostOptimizationItem, ForecastItem, ProcurementKPI, RiskItem, SupplierPerformance } from "./procurementAnalyticsTypes";

export const procurementKPIs: ProcurementKPI[] = [
  { id: "kpi-001", label: "Economia identificada", value: "R$ 18.420", change: "+12,4%", description: "Economia potencial em cotações e substituições." },
  { id: "kpi-002", label: "Lead time médio", value: "17 dias", change: "-3 dias", description: "Prazo médio previsto por fornecedor." },
  { id: "kpi-003", label: "Compras em risco", value: "4", change: "+1", description: "Itens com risco de atraso, custo ou aprovação." },
  { id: "kpi-004", label: "Score fornecedores", value: "89%", change: "+4%", description: "Média ponderada dos fornecedores ativos." },
];

export const supplierPerformance: SupplierPerformance[] = [
  { id: "sp-001", name: "Luminárias Pro", category: "Iluminação", score: 94, onTimeRate: 96, avgLeadTime: 7, totalPurchased: 3925, risk: "baixo" },
  { id: "sp-002", name: "Marmoraria Local", category: "Marmoraria", score: 91, onTimeRate: 92, avgLeadTime: 20, totalPurchased: 10488, risk: "medio" },
  { id: "sp-003", name: "Marceneiro Local", category: "Marcenaria", score: 88, onTimeRate: 84, avgLeadTime: 25, totalPurchased: 8260, risk: "medio" },
  { id: "sp-004", name: "Estofados Casa", category: "Mobiliário", score: 82, onTimeRate: 78, avgLeadTime: 18, totalPurchased: 7700, risk: "alto" },
];

export const costOptimizations: CostOptimizationItem[] = [
  { id: "co-001", title: "Substituir tecido da Poltrona Lisboa", currentCost: 7700, optimizedCost: 6860, saving: 840, action: "Aplicar Linho Performance Areia" },
  { id: "co-002", title: "Negociar marcenaria com checklist fechado", currentCost: 8260, optimizedCost: 7850, saving: 410, action: "Enviar contraproposta" },
  { id: "co-003", title: "Agrupar entrega de iluminação", currentCost: 3925, optimizedCost: 3610, saving: 315, action: "Consolidar frete" },
];

export const riskItems: RiskItem[] = [
  { id: "rk-001", title: "Aprovação financeira pendente", description: "Pedido de marcenaria ainda depende de liberação financeira.", level: "alto", owner: "Financeiro", recommendedAction: "Solicitar aprovação automática" },
  { id: "rk-002", title: "Fornecedor de estofado em atenção", description: "On-time rate abaixo de 80% e risco de atraso.", level: "alto", owner: "Compras", recommendedAction: "Buscar fornecedor alternativo" },
  { id: "rk-003", title: "Marmoraria em inspeção", description: "Item recebido antes do prazo, mas precisa aprovação de acabamento.", level: "medio", owner: "Obra", recommendedAction: "Executar checklist técnico" },
  { id: "rk-004", title: "Iluminação sincronizada com marcenaria", description: "Entrega aprovada, mas instalação depende do painel TV.", level: "baixo", owner: "Produção", recommendedAction: "Agrupar instalação" },
];

export const forecastItems: ForecastItem[] = [
  { id: "fc-001", month: "Jul", expectedSpend: 24820, confirmedSpend: 16400, riskSpend: 2800 },
  { id: "fc-002", month: "Ago", expectedSpend: 38200, confirmedSpend: 21900, riskSpend: 6200 },
  { id: "fc-003", month: "Set", expectedSpend: 29600, confirmedSpend: 14500, riskSpend: 4300 },
  { id: "fc-004", month: "Out", expectedSpend: 18400, confirmedSpend: 8200, riskSpend: 2100 },
];

export const automationRules: AutomationRule[] = [
  { id: "auto-001", title: "Solicitar cotação ao especificar item", trigger: "Novo item especificado", action: "Criar solicitação de compra", status: "ativa" },
  { id: "auto-002", title: "Alerta de aprovação parada", trigger: "Pedido aguardando > 48h", action: "Notificar responsável", status: "ativa" },
  { id: "auto-003", title: "Fornecedor alternativo em atraso", trigger: "Lead time acima do previsto", action: "Buscar fornecedor similar", status: "rascunho" },
  { id: "auto-004", title: "Reserva automática de item recebido", trigger: "Recebimento aprovado", action: "Reservar para ambiente", status: "ativa" },
];

export const aiRecommendations = [
  {
    title: "Fechar marcenaria com condição técnica",
    description: "Aprovar pedido somente após anexar checklist de LED, cabos e paginação.",
    impact: "Reduz retrabalho",
  },
  {
    title: "Usar Luminárias Pro como fornecedor padrão",
    description: "Melhor score, menor lead time e bom histórico de entrega.",
    impact: "Fornecedor preferencial",
  },
  {
    title: "Criar automação para aprovação financeira",
    description: "Pedidos acima de R$ 8.000 devem disparar notificação automática.",
    impact: "Menos atraso",
  },
];
