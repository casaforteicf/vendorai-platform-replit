export type FacilityView =
  | "dashboard"
  | "manual"
  | "warranties"
  | "assets"
  | "maintenance"
  | "tickets"
  | "schedule"
  | "owner"
  | "documents"
  | "ai";

export type WarrantyStatus = "active" | "expiring" | "expired" | "pending";
export type AssetStatus = "operational" | "maintenance" | "attention" | "inactive";
export type TicketStatus = "open" | "in_progress" | "waiting" | "resolved";
export type Priority = "baixa" | "media" | "alta" | "critica";

export type FacilityAsset = {
  id: string;
  name: string;
  category: string;
  location: string;
  supplier: string;
  installDate: string;
  status: AssetStatus;
  nextMaintenance: string;
};

export type WarrantyItem = {
  id: string;
  title: string;
  supplier: string;
  asset: string;
  startDate: string;
  endDate: string;
  status: WarrantyStatus;
};

export type MaintenanceItem = {
  id: string;
  title: string;
  asset: string;
  frequency: string;
  nextDate: string;
  owner: string;
  priority: Priority;
};

export type ServiceTicket = {
  id: string;
  title: string;
  asset: string;
  location: string;
  status: TicketStatus;
  priority: Priority;
  openedAt: string;
  owner: string;
};

export type OwnerDocument = {
  id: string;
  name: string;
  type: "manual" | "warranty" | "invoice" | "technical" | "contract" | "photo";
  version: string;
  status: "available" | "pending" | "expired";
};

export type PreventiveSchedule = {
  id: string;
  title: string;
  date: string;
  type: "inspection" | "cleaning" | "replacement" | "review";
  responsible: string;
  status: "scheduled" | "done" | "delayed";
};
