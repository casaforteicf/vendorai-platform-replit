import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const partnerProspectorJobsTable = pgTable("partner_prospector_jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  cidade: text("cidade").notNull(),
  uf: text("uf").notNull(),
  nichos: jsonb("nichos").notNull().$type<string[]>(),
  status: text("status").notNull().default("pendente"),
  totalEncontrados: integer("total_encontrados").default(0),
  totalQualificados: integer("total_qualificados").default(0),
  totalInseridos: integer("total_inseridos").default(0),
  erroMsg: text("erro_msg"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
});

export const insertPartnerProspectorJobSchema = createInsertSchema(
  partnerProspectorJobsTable
).omit({ id: true, createdAt: true });

export const updatePartnerProspectorJobSchema = createSelectSchema(
  partnerProspectorJobsTable
)
  .omit({ id: true, createdAt: true })
  .partial();

export type InsertPartnerProspectorJob = z.infer<typeof insertPartnerProspectorJobSchema>;
export type PartnerProspectorJob = typeof partnerProspectorJobsTable.$inferSelect;
