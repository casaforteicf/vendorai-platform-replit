import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const leadsTable = pgTable("leads", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  telefone: text("telefone"),
  email: text("email"),
  empresa: text("empresa"),
  tamanhoEquipe: text("tamanho_equipe"),
  objetivo: text("objetivo"),
  urgencia: text("urgencia"),
  orcamento: text("orcamento"),
  planoRecomendado: text("plano_recomendado"),
  dorPrincipal: text("dor_principal"),
  proximaAcao: text("proxima_acao"),
  status: text("status").notNull().default("novo"),
  activeAgentLock: text("active_agent_lock"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateLeadSchema = createSelectSchema(leadsTable)
  .omit({
    id: true,
    tenantId: true,
    createdAt: true,
    updatedAt: true,
  })
  .partial();

export type InsertLead = z.infer<typeof insertLeadSchema>;
export type UpdateLead = z.infer<typeof updateLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
