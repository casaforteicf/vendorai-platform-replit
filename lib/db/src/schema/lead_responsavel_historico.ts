import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { leadsTable } from "./leads";
import { usersTable } from "./users";

/**
 * Auditoria de toda troca de responsável por um lead. Nunca editada, só
 * inserida — uma linha por evento de (re)atribuição, automática ou manual.
 * Ver artifacts/api-server/src/lib/leadResponsavelHistorico.ts pra quem escreve.
 */
export const leadResponsavelHistoricoTable = pgTable("lead_responsavel_historico", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  leadId: text("lead_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  responsavelAnteriorId: text("responsavel_anterior_id").references(() => usersTable.id, { onDelete: "set null" }),
  responsavelNovoId: text("responsavel_novo_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  alteradoPorId: text("alterado_por_id").references(() => usersTable.id, { onDelete: "set null" }),
  motivo: text("motivo").$type<"automatico" | "manual">().notNull(),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
});

export const insertLeadResponsavelHistoricoSchema = createInsertSchema(leadResponsavelHistoricoTable, {
  motivo: z.enum(["automatico", "manual"]),
}).omit({ id: true, criadoEm: true });

export type InsertLeadResponsavelHistorico = z.infer<typeof insertLeadResponsavelHistoricoSchema>;
export type LeadResponsavelHistorico = typeof leadResponsavelHistoricoTable.$inferSelect;
