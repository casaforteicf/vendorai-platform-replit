export type ProductVisual = {
  src: string;
  mobile?: string;
  label: string;
};

const MEDIA = "/media/vendorai-official";

const crmPipeline: ProductVisual = { src: `${MEDIA}/crm-pipeline/desktop-1440.png`, mobile: `${MEDIA}/crm-pipeline/mobile-390.png`, label: "CRM e pipeline comercial" };
const crmLeads: ProductVisual = { src: `${MEDIA}/crm-leads/desktop-1440.png`, mobile: `${MEDIA}/crm-leads/mobile-390.png`, label: "Leads e carteira comercial" };
const prospector: ProductVisual = { src: `${MEDIA}/prospector/desktop-1440.png`, mobile: `${MEDIA}/prospector/mobile-390.png`, label: "Prospector IA" };
const omnichannel: ProductVisual = { src: `${MEDIA}/omnichannel/desktop-1440.png`, mobile: `${MEDIA}/omnichannel/mobile-390.png`, label: "Omnichannel e atendimento" };
const revenueScout: ProductVisual = { src: `${MEDIA}/revenue-scout/desktop-1440.png`, mobile: `${MEDIA}/revenue-scout/mobile-390.png`, label: "Revenue Scout" };
const revenueOpportunities: ProductVisual = { src: `${MEDIA}/revenue-opportunities/desktop-1440.png`, mobile: `${MEDIA}/revenue-opportunities/mobile-390.png`, label: "Oportunidades de receita" };
const agenda: ProductVisual = { src: `${MEDIA}/agenda/desktop-1440.png`, mobile: `${MEDIA}/agenda/mobile-390.png`, label: "Agenda inteligente" };
const analytics: ProductVisual = { src: `${MEDIA}/analytics/desktop-1440.png`, mobile: `${MEDIA}/analytics/mobile-390.png`, label: "Analytics executivo" };
const catalogo: ProductVisual = { src: `${MEDIA}/catalogo/desktop-1440.png`, mobile: `${MEDIA}/catalogo/mobile-390.png`, label: "Catálogo comercial" };
const financeiro: ProductVisual = { src: `${MEDIA}/financeiro-erp/desktop-1440.png`, mobile: `${MEDIA}/financeiro-erp/mobile-390.png`, label: "Financeiro e ERP Hub" };
const jarvis: ProductVisual = { src: `${MEDIA}/jarvis/desktop-aberto.png`, label: "JARVIS — inteligência executiva" };

const visuals: Record<string, ProductVisual[]> = {
  growth: [crmPipeline, revenueScout],
  crm: [crmPipeline, crmLeads],
  jarvis: [jarvis, analytics],
  "agentes-ia": [omnichannel, crmLeads],
  prospeccao: [prospector, crmLeads],
  "revenue-scout": [revenueScout, revenueOpportunities],
  omnichannel: [omnichannel, crmLeads],
  marketing: [analytics, crmLeads],
  "agenda-inteligente": [agenda, crmPipeline],
  "catalogo-propostas": [catalogo, crmPipeline],
  financeiro: [financeiro, analytics],
  "sites-lp-ecommerce": [crmLeads, analytics],
  "knowledge-hub": [jarvis, omnichannel],
  analytics: [analytics, crmPipeline],
  automacoes: [omnichannel, crmPipeline],
  "arqdor-ai": [catalogo, analytics],
  "content-planner": [analytics, agenda],
  "content-studio": [analytics, crmLeads],
  "creative-studio": [analytics, catalogo],
  ads: [analytics, crmLeads],
  gestao: [financeiro, analytics],
  "praca-ai": [catalogo, financeiro],
  "app-builder": [{ ...crmPipeline, src: `${MEDIA}/crm-pipeline/mobile-390.png`, mobile: undefined, label: "Experiência mobile conectada ao VendorAI" }, crmPipeline],
  reputation: [analytics, revenueOpportunities],
  "app-personalizado": [{ ...crmLeads, src: `${MEDIA}/crm-leads/mobile-390.png`, mobile: undefined, label: "Experiência mobile do VendorAI" }, crmLeads],
  implantacao: [crmPipeline, agenda],
};

export function getProductVisuals(slug: string): ProductVisual[] {
  return visuals[slug] ?? [crmPipeline, analytics];
}
