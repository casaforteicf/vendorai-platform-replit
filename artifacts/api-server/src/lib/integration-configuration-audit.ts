import { writeConfigurationAudit } from "./configuration-audit.js";

export type IntegrationAuditActor = {
  userId?: string | null;
  ip?: string | null;
};

export async function auditIntegrationChange(input: {
  tenantId: string;
  provider: "whatsapp" | "instagram";
  action: "criar" | "atualizar" | "excluir";
  before?: unknown;
  after?: unknown;
  actor?: IntegrationAuditActor;
}): Promise<boolean> {
  return writeConfigurationAudit({
    tenantId: input.tenantId,
    action: input.action,
    entity: `integration_${input.provider}`,
    entityId: input.tenantId,
    before: input.before,
    after: input.after,
    actor: input.actor,
  });
}
