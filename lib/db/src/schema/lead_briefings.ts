import { pgTable, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { usersTable } from "./users";

export const leadBriefingsTable = pgTable("lead_briefings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "cascade" })
    .unique(),

  // 1. Dados da empresa / contato
  channelsUsed: jsonb("channels_used").$type<string[]>(),
  contactType: text("contact_type"),
  approachedBy: text("approached_by").references(() => usersTable.id, { onDelete: "set null" }),
  contactDate: text("contact_date"),

  // 2-5. Blocos SPIN — cada um é uma lista de {question, answer}
  situationAnswers: jsonb("situation_answers").$type<Array<{ question: string; answer: string }>>(),
  problemAnswers: jsonb("problem_answers").$type<Array<{ question: string; answer: string }>>(),
  problemMinimized: boolean("problem_minimized").default(false),
  implicationAnswers: jsonb("implication_answers").$type<Array<{ question: string; answer: string }>>(),
  implicationEstimatedValue: text("implication_estimated_value"),
  needAnswers: jsonb("need_answers").$type<Array<{ question: string; answer: string }>>(),
  needThermometer: text("need_thermometer"),

  // 6. Objeções
  objections: jsonb("objections").$type<Array<{ objection: string; response: string }>>(),

  // 7. Classificação de porte
  prospectSize: text("prospect_size"),

  // 8. Material enviado
  presentationSent: boolean("presentation_sent").default(false),
  presentationSentDate: text("presentation_sent_date"),
  presentationLink: text("presentation_link"),

  // 9. Próximo passo
  nextStepType: text("next_step_type"),
  nextStepDate: text("next_step_date"),

  // 10. Notas livres
  freeNotes: text("free_notes"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertLeadBriefingSchema = createInsertSchema(leadBriefingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateLeadBriefingSchema = createSelectSchema(leadBriefingsTable)
  .omit({
    id: true,
    tenantId: true,
    leadId: true,
    createdAt: true,
    updatedAt: true,
  })
  .partial();

export type InsertLeadBriefing = z.infer<typeof insertLeadBriefingSchema>;
export type UpdateLeadBriefing = z.infer<typeof updateLeadBriefingSchema>;
export type LeadBriefing = typeof leadBriefingsTable.$inferSelect;
