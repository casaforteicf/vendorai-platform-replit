import { z } from "zod/v4";

export const renderOperationTypeSchema = z.enum([
  "initial",
  "material",
  "lighting",
  "improve",
  "approved",
]);

export const renderSelectionMetadataSchema = z.array(z.object({
  id: z.string().optional(),
  label: z.string().optional(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
}));

export const renderVersionMetadataSchema = z.object({
  operation_type: renderOperationTypeSchema.optional(),
  material_id: z.string().nullable().optional(),
  material_name: z.string().nullable().optional(),
  selection_metadata: renderSelectionMetadataSchema.optional(),
  cost_estimate_usd: z.union([z.string(), z.number()]).nullable().optional(),
  approval_note: z.string().nullable().optional(),
});

export type RenderVersionMetadataInput = z.infer<typeof renderVersionMetadataSchema>;

export function inferOperationType(input: {
  explicit?: RenderVersionMetadataInput["operation_type"];
  materialId?: string | null;
  materialName?: string | null;
  lightingChanged?: boolean;
  isInitial?: boolean;
}): z.infer<typeof renderOperationTypeSchema> {
  if (input.explicit) return input.explicit;
  if (input.isInitial) return "initial";
  if (input.materialId || input.materialName) return "material";
  if (input.lightingChanged) return "lighting";
  return "improve";
}

export function normalizeRenderVersionMetadata(
  input: RenderVersionMetadataInput,
): {
  operationType?: string;
  materialId?: string | null;
  materialName?: string | null;
  selectionMetadata?: Array<{ id?: string; label?: string; x: number; y: number; w: number; h: number }>;
  costEstimateUsd?: string | null;
  approvalNote?: string | null;
} {
  const parsed = renderVersionMetadataSchema.parse(input);

  return {
    operationType: parsed.operation_type,
    materialId: parsed.material_id,
    materialName: parsed.material_name,
    selectionMetadata: parsed.selection_metadata,
    costEstimateUsd: parsed.cost_estimate_usd == null ? parsed.cost_estimate_usd : String(parsed.cost_estimate_usd),
    approvalNote: parsed.approval_note,
  };
}
