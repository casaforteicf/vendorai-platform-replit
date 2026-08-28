// Entrada prevista no pacote de melhorias.
// O VendorAI já possui um Pipeline/Kanban real em Deals.tsx com dados do CRM,
// drag-and-drop, etapas configuráveis e regras de negócio. Reutilizamos esse
// módulo para não substituir dados reais pelo mock estático do planejamento.
export { default } from "@/pages/Deals";

export const PLANNED_PIPELINE_STAGES = [
  { value: "prospecting", label: "Prospecção" },
  { value: "qualification", label: "Qualificação" },
  { value: "proposal", label: "Proposta" },
  { value: "negotiation", label: "Negociação" },
  { value: "closed", label: "Fechado" },
] as const;
