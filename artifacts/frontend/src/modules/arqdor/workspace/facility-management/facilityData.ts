import type { FacilityAsset, MaintenanceItem, OwnerDocument, PreventiveSchedule, ServiceTicket, WarrantyItem } from "./facilityTypes";

export const assets: FacilityAsset[] = [
  {
    id: "fa-001",
    name: "Perfil LED Linear",
    category: "Iluminação",
    location: "Sala de Estar",
    supplier: "Luminárias Pro",
    installDate: "2026-07-20",
    status: "operational",
    nextMaintenance: "2027-01-20",
  },
  {
    id: "fa-002",
    name: "Bancada Quartzo Branco",
    category: "Marmoraria",
    location: "Cozinha",
    supplier: "Marmoraria Local",
    installDate: "2026-08-01",
    status: "operational",
    nextMaintenance: "2027-08-01",
  },
  {
    id: "fa-003",
    name: "Controlador HVAC",
    category: "Climatização",
    location: "Área Social",
    supplier: "HVAC Service",
    installDate: "2026-08-10",
    status: "attention",
    nextMaintenance: "2026-09-10",
  },
  {
    id: "fa-004",
    name: "Painel TV MDF Carvalho Claro",
    category: "Marcenaria",
    location: "Sala de Estar",
    supplier: "Marceneiro Local",
    installDate: "2026-08-04",
    status: "maintenance",
    nextMaintenance: "2026-11-04",
  },
];

export const warranties: WarrantyItem[] = [
  { id: "wr-001", title: "Garantia Perfil LED", supplier: "Luminárias Pro", asset: "Perfil LED Linear", startDate: "2026-07-20", endDate: "2027-07-20", status: "active" },
  { id: "wr-002", title: "Garantia Bancada Quartzo", supplier: "Marmoraria Local", asset: "Bancada Quartzo Branco", startDate: "2026-08-01", endDate: "2028-08-01", status: "active" },
  { id: "wr-003", title: "Garantia HVAC", supplier: "HVAC Service", asset: "Controlador HVAC", startDate: "2026-08-10", endDate: "2027-02-10", status: "expiring" },
  { id: "wr-004", title: "Garantia Marcenaria", supplier: "Marceneiro Local", asset: "Painel TV MDF Carvalho Claro", startDate: "2026-08-04", endDate: "2027-08-04", status: "pending" },
];

export const maintenanceItems: MaintenanceItem[] = [
  { id: "mt-001", title: "Limpeza de filtro HVAC", asset: "Controlador HVAC", frequency: "Mensal", nextDate: "2026-09-10", owner: "HVAC Service", priority: "alta" },
  { id: "mt-002", title: "Revisão iluminação LED", asset: "Perfil LED Linear", frequency: "Semestral", nextDate: "2027-01-20", owner: "Luminárias Pro", priority: "media" },
  { id: "mt-003", title: "Inspeção vedação bancada", asset: "Bancada Quartzo Branco", frequency: "Anual", nextDate: "2027-08-01", owner: "Marmoraria Local", priority: "baixa" },
  { id: "mt-004", title: "Reaperto e alinhamento marcenaria", asset: "Painel TV MDF Carvalho Claro", frequency: "Trimestral", nextDate: "2026-11-04", owner: "Marceneiro Local", priority: "media" },
];

export const tickets: ServiceTicket[] = [
  { id: "tk-001", title: "HVAC com eficiência reduzida", asset: "Controlador HVAC", location: "Área Social", status: "open", priority: "alta", openedAt: "2026-08-28", owner: "Facility" },
  { id: "tk-002", title: "Ajuste fino no painel TV", asset: "Painel TV MDF Carvalho Claro", location: "Sala de Estar", status: "in_progress", priority: "media", openedAt: "2026-08-20", owner: "Marcenaria" },
  { id: "tk-003", title: "Dúvida sobre limpeza do quartzo", asset: "Bancada Quartzo Branco", location: "Cozinha", status: "waiting", priority: "baixa", openedAt: "2026-08-18", owner: "Atendimento" },
];

export const documents: OwnerDocument[] = [
  { id: "doc-001", name: "Manual do Proprietário.pdf", type: "manual", version: "1.0", status: "available" },
  { id: "doc-002", name: "Garantia Perfil LED.pdf", type: "warranty", version: "1.0", status: "available" },
  { id: "doc-003", name: "Nota Fiscal Marmoraria.pdf", type: "invoice", version: "1.0", status: "available" },
  { id: "doc-004", name: "Ficha Técnica HVAC.pdf", type: "technical", version: "1.1", status: "available" },
  { id: "doc-005", name: "Contrato Assistência Técnica.pdf", type: "contract", version: "0.9", status: "pending" },
];

export const schedules: PreventiveSchedule[] = [
  { id: "sc-001", title: "Limpeza filtro HVAC", date: "2026-09-10", type: "cleaning", responsible: "HVAC Service", status: "scheduled" },
  { id: "sc-002", title: "Revisão marcenaria", date: "2026-11-04", type: "review", responsible: "Marceneiro Local", status: "scheduled" },
  { id: "sc-003", title: "Revisão iluminação", date: "2027-01-20", type: "inspection", responsible: "Luminárias Pro", status: "scheduled" },
  { id: "sc-004", title: "Inspeção bancada", date: "2027-08-01", type: "inspection", responsible: "Marmoraria Local", status: "scheduled" },
];

export const aiFacilityInsights = [
  {
    title: "HVAC deve ser priorizado",
    description: "O controlador está em atenção e há ticket aberto com prioridade alta.",
    impact: "Alta prioridade",
    action: "Agendar técnico",
  },
  {
    title: "Garantia HVAC próxima de vencer",
    description: "A garantia expira antes das demais e deve ser acompanhada.",
    impact: "Evita custo futuro",
    action: "Criar lembrete",
  },
  {
    title: "Manual do proprietário está pronto",
    description: "Documentos principais já estão disponíveis para o portal.",
    impact: "Entrega final",
    action: "Publicar portal",
  },
];
