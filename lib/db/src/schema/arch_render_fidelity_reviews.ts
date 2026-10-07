import { pgTable, text, integer, boolean, timestamp, jsonb, numeric, index } from "drizzle-orm/pg-core";
import { archAiRendersTable } from "./arch_ai_renders";

export type ArchRenderFidelityReviewPayload = {
  overallScore: number;
  camera: unknown;
  geometry: unknown;
  openings: unknown;
  volumetry: unknown;
  materials: unknown;
  lighting: unknown;
  unsolicitedChanges: unknown[];
  acceptedChanges: unknown[];
  summary: string;
  requiresHumanReview: boolean;
};

export const archRenderFidelityReviewsTable = pgTable("arch_render_fidelity_reviews", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull(),
  renderId: text("render_id").notNull().references(() => archAiRendersTable.id, { onDelete: "cascade" }),
  projectId: text("project_id"),
  baseImageUrl: text("base_image_url").notNull(),
  renderImageUrl: text("render_image_url").notNull(),
  requestedChange: text("requested_change"),
  overallScore: integer("overall_score").notNull(),
  requiresHumanReview: boolean("requires_human_review").notNull().default(false),
  review: jsonb("review").$type<ArchRenderFidelityReviewPayload>().notNull(),
  model: text("model").notNull(),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  reviewedBy: text("reviewed_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  renderCreatedIdx: index("idx_arch_render_fidelity_reviews_render_created").on(table.tenantId, table.renderId, table.createdAt),
  projectCreatedIdx: index("idx_arch_render_fidelity_reviews_project_created").on(table.tenantId, table.projectId, table.createdAt),
}));
