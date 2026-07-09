import { eventBus, type DomainEvent } from "../event-bus/EventBus";
import { CopilotRealDataService } from "./CopilotRealDataService";

export class AIEventSubscriber {
  constructor(private readonly service = new CopilotRealDataService()) {}

  register() {
    eventBus.subscribe("budget.approved", (event) => this.onBudgetApproved(event));
    eventBus.subscribe("purchase.request.created", (event) => this.onPurchaseCreated(event));
    eventBus.subscribe("production.delivered", (event) => this.onProductionDelivered(event));
    eventBus.subscribe("construction.delivered", (event) => this.onConstructionDelivered(event));
  }

  private async onBudgetApproved(event: DomainEvent) {
    if (event.payload?.projectId) {
      await this.service.analyze(event.payload.projectId);
    }
  }

  private async onPurchaseCreated(event: DomainEvent) {
    if (event.payload?.projectId) {
      await this.service.analyze(event.payload.projectId);
    }
  }

  private async onProductionDelivered(event: DomainEvent) {
    if (event.payload?.projectId) {
      await this.service.analyze(event.payload.projectId);
    }
  }

  private async onConstructionDelivered(event: DomainEvent) {
    if (event.payload?.projectId) {
      await this.service.analyze(event.payload.projectId);
    }
  }
}
