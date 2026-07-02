import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const archProjectConfigsTable = pgTable("arch_project_configs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId:       text("tenant_id").notNull(),
  leadId:         text("lead_id"),
  nomeConfig:     text("nome_config").notNull(),
  // 'preservar' | 'criar'
  mode:           varchar("mode", { length: 20 }).notNull().default("preservar"),
  estilo:         text("estilo"),
  iluminacao:     text("iluminacao"),
  anguloPadrao:   text("angulo_padrao"),
  // { piso: 'porcelanato claro', parede: 'branco fosco', armario: 'madeira nogueira' }
  paletaMateriais: jsonb("paleta_materiais").$type<Record<string, string>>(),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

export const insertArchProjectConfigSchema = createInsertSchema(archProjectConfigsTable, {
  paletaMateriais: z.record(z.string(), z.string()).optional(),
}).omit({ id: true, createdAt: true });

export const updateArchProjectConfigSchema = createSelectSchema(archProjectConfigsTable, {
  paletaMateriais: z.record(z.string(), z.string()).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type InsertArchProjectConfig = z.infer<typeof insertArchProjectConfigSchema>;
export type UpdateArchProjectConfig = z.infer<typeof updateArchProjectConfigSchema>;
export type ArchProjectConfig       = typeof archProjectConfigsTable.$inferSelect;
