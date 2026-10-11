import { z } from "zod/v4";

export const restoreConceptPayloadSchema = z.strictObject({
  operationId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  confirm: z.literal("RESTORE_REVIEWED_GEOMETRY"),
  rooms: z.array(z.object({
    id: z.string().min(1),
    label: z.string(),
    kind: z.string(),
    floor: z.number().int().min(0),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().positive(),
    depth: z.number().positive(),
  }).passthrough()).max(1000),
  openingOverrides: z.record(z.string(), z.unknown()),
});