export type ConstructionContract = {
  projectId: string;
  productionOrderId?: string;
  environmentId?: string;
  phaseId?: string;
  title: string;
  discipline: string;
  progress: number;
  status: "planned" | "in_progress" | "blocked" | "done" | "delayed";
};

export type FacilityContract = {
  projectId: string;
  facilityAssetId?: string;
  constructionPhaseId?: string;
  productionOrderId?: string;
  canonicalProductId?: string;
  supplierId?: string;
  name: string;
  category: string;
  location: string;
  status: "operational" | "maintenance" | "attention" | "inactive";
};

export type ConstructionFacilityEvent =
  | { event: "production.delivered"; projectId: string; productionOrderId: string }
  | { event: "construction.phase.completed"; projectId: string; phaseId: string }
  | { event: "construction.delivered"; projectId: string }
  | { event: "facility.asset.created"; projectId: string; facilityAssetId: string };
