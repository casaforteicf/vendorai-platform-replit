import { FacilityRepository, type FacilityAsset } from "./FacilityRepository";

export type ConstructionDeliveredEvent = {
  event: "construction.delivered";
  projectId: string;
  constructionPhaseId?: string;
  productionOrderId?: string;
  canonicalProductId?: string;
  name: string;
  category: string;
  location: string;
  supplierId?: string;
  installDate?: string;
};

export class ConstructionDeliveredHandler {
  constructor(private readonly facilityRepository = new FacilityRepository()) {}

  toFacilityAsset(event: ConstructionDeliveredEvent): FacilityAsset {
    return {
      projectId: event.projectId,
      constructionPhaseId: event.constructionPhaseId,
      productionOrderId: event.productionOrderId,
      canonicalProductId: event.canonicalProductId,
      name: event.name,
      category: event.category,
      location: event.location,
      supplierId: event.supplierId,
      installDate: event.installDate,
      status: "operational",
    };
  }

  async handle(event: ConstructionDeliveredEvent): Promise<FacilityAsset> {
    return this.facilityRepository.createAsset(this.toFacilityAsset(event));
  }
}
