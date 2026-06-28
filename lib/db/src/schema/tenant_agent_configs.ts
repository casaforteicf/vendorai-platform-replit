import { pgTable, text, boolean, timestamp, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const TOM_VALUES = [
  "profissional",
  "amigavel",
  "tecnico",
  "vendedor",
  "neutro",
] as const;

export type TomType = (typeof TOM_VALUES)[number];

export const tenantAgentConfigsTable = pgTable(
  "tenant_agent_configs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    agentKey: text("agent_key").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    systemPromptCustom: text("system_prompt_custom"),
    parametros: jsonb("parametros").$type<Record<string, unknown>>(),
    nomePerfil: text("nome_perfil"),
    tom: text("tom").notNull().default("profissional"),
    restricoes: text("restricoes"),
    knowledgeBaseIds: jsonb("knowledge_base_ids").$type<string[]>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("tenant_agent_configs_tenant_agent_unique").on(t.tenantId, t.agentKey)]
);

export const insertTenantAgentConfigSchema = createInsertSchema(tenantAgentConfigsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateTenantAgentConfigSchema = createSelectSchema(tenantAgentConfigsTable)
  .omit({ id: true, tenantId: true, agentKey: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertTenantAgentConfig = z.infer<typeof insertTenantAgentConfigSchema>;
export type UpdateTenantAgentConfig = z.infer<typeof updateTenantAgentConfigSchema>;
export type TenantAgentConfig = typeof tenantAgentConfigsTable.$inferSelect;
