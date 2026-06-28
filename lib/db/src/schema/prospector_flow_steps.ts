import { pgTable, text, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { prospectorFlowsTable } from "./prospector_flows";

export const prospectorFlowStepsTable = pgTable(
  "prospector_flow_steps",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    flowId: text("flow_id")
      .notNull()
      .references(() => prospectorFlowsTable.id, { onDelete: "cascade" }),
    ordem: integer("ordem").notNull(),
    canal: text("canal").notNull(),
    delayHoras: integer("delay_horas").default(0),
    mensagemTemplate: text("mensagem_template"),
    // ── Material ──────────────────────────────────────────────────────────────
    // material_tipo: 'html' | 'pdf' | 'imagem' | null
    materialTipo: text("material_tipo"),
    materialPrompt: text("material_prompt"),
    materialPromptVars: jsonb("material_prompt_vars").$type<Record<string, unknown>>(),
    materialUploadUrl: text("material_upload_url"),
    materialUploadNome: text("material_upload_nome"),
    // material_fonte: 'ia' | 'upload' | null
    materialFonte: text("material_fonte"),
  },
  (table) => [
    index("prospector_flow_steps_flow_idx").on(table.flowId),
    index("prospector_flow_steps_ordem_idx").on(table.flowId, table.ordem),
  ],
);

export const insertProspectorFlowStepSchema = createInsertSchema(
  prospectorFlowStepsTable,
).omit({ id: true });

export const updateProspectorFlowStepSchema = createSelectSchema(
  prospectorFlowStepsTable,
)
  .omit({ id: true })
  .partial();

export type InsertProspectorFlowStep = z.infer<typeof insertProspectorFlowStepSchema>;
export type ProspectorFlowStep = typeof prospectorFlowStepsTable.$inferSelect;
