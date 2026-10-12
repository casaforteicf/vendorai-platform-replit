import { z } from "zod/v4";

/** MULTI-04.3 — Strict geometry-only payload, no generic JSON passthrough. */
const finite = z.number().finite().min(-100000).max(100000);
const positive = z.number().finite().positive().max(100000);
const roomSchema = z.strictObject({
  id: z.string().min(1).max(128),
  label: z.string().min(1).max(255),
  kind: z.enum(["sala", "cozinha", "suite", "quarto", "banheiro", "lavanderia",
    "garagem", "gourmet", "piscina", "circulacao", "escada", "outro"]),
  floor: z.number().int().min(0).max(30),
  x: finite, y: finite, width: positive, depth: positive,
  locked: z.boolean().optional(),
  floorMaterialId: z.string().max(128).optional(),
  poolDepthM: positive.optional(),
  stairRiserCount: z.number().int().min(1).max(100).optional(),
  stairTreadDepthM: positive.optional(),
});
const openingSchema = z.strictObject({
  x: finite, y: finite, type: z.enum(["door", "window"]),
});
export const restoreConceptPayloadSchema = z.strictObject({
  operationId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  confirm: z.literal("RESTORE_REVIEWED_GEOMETRY"),
  rooms: z.array(roomSchema).max(1000),
  openingOverrides: z.record(z.string().max(128), openingSchema)
    .refine(value => Object.keys(value).length <= 1000, "Too many opening overrides"),
});
