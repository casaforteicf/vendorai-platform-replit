import { ConstructionRepository, type ConstructionPhase } from "./ConstructionRepository";

export type ProductionDeliveredEvent = {
  event: "production.delivered";
  projectId: string;
  productionOrderId: string;
  environmentId?: string;
  title: string;
  discipline: string;
};

export class ProductionDeliveredHandler {
  constructor(private readonly constructionRepository = new ConstructionRepository()) {}

  toConstructionPhase(event: ProductionDeliveredEvent): ConstructionPhase {
    return {
      projectId: event.projectId,
      productionOrderId: event.productionOrderId,
      environmentId: event.environmentId,
      title: event.title,
      discipline: event.discipline,
      progress: 0,
      status: "planned",
    };
  }

  async handle(event: ProductionDeliveredEvent): Promise<ConstructionPhase> {
    return this.constructionRepository.createPhase(this.toConstructionPhase(event));
  }
}
