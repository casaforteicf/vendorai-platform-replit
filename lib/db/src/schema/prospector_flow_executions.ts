import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { prospectorFlowsTable } from "./prospector_flows";
import { prospectorFlowStepsTable } from "./prospector_flow_steps";
import { partnerLeadsTable } from "./partner_leads";

// status: pendente | gerando | enviando | enviado | falhou | cancelado

export const prospectorFlowExecutionsTable = pgTable(
  "prospector_flow_executions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    flowId: text("flow_id")
      .notNull()
      .references(() => prospectorFlowsTable.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => partnerLeadsTable.id, { onDelete: "cascade" }),
    stepId: text("step_id")
      .notNull()
      .references(() => prospectorFlowStepsTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pendente"),
    materialGeradoUrl: text("material_gerado_url"),
    agendadoPara: timestamp("agendado_para"),
    executadoEm: timestamp("executado_em"),
    erroMsg: text("erro_msg"),
  },
  (table) => [
    index("prospector_flow_exec_flow_idx").on(table.flowId),
    index("prospector_flow_exec_lead_idx").on(table.leadId),
    index("prospector_flow_exec_status_idx").on(table.status),
  ],
);

export const insertProspectorFlowExecutionSchema = createInsertSchema(
  prospectorFlowExecutionsTable,
).omit({ id: true });

export const updateProspectorFlowExecutionSchema = createSelectSchema(
  prospectorFlowExecutionsTable,
)
  .omit({ id: true })
  .partial();

export type InsertProspectorFlowExecution = z.infer<typeof insertProspectorFlowExecutionSchema>;
export type ProspectorFlowExecution = typeof prospectorFlowExecutionsTable.$inferSelect;
