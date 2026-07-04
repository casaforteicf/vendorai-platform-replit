import {
  pgTable,
  text,
  integer,
  numeric,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

// ─── Office Templates (Sprint 9) ─────────────────────────────────────────────
// Modelos reutilizáveis de projeto pré-configurados pelo escritório.
// Aceleram a criação de novos projetos com ambientes, materiais e prompts já definidos.
export const archOfficeTemplatesTable = pgTable("arch_office_templates", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId:       text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),

  nome:           text("nome").notNull(),
  descricao:      text("descricao"),
  tipoObra:       text("tipo_obra"),
  estiloBase:     text("estilo_base"),
  prazoEstimado:  integer("prazo_estimado"),    // dias
  orcamentoBase:  numeric("orcamento_base", { precision: 12, scale: 2 }),

  // Pre-configured content
  ambientes:  jsonb("ambientes").$type<{ nome: string; descricao?: string }[]>(),
  materiais:  jsonb("materiais").$type<{ nome: string; categoria: string; fornecedor?: string }[]>(),
  prompts:    jsonb("prompts").$type<string[]>(),

  // Usage stats
  vezesCriado: integer("vezes_criado").notNull().default(0),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertArchOfficeTemplateSchema = createInsertSchema(
  archOfficeTemplatesTable,
  {
    ambientes: z.array(z.object({ nome: z.string(), descricao: z.string().optional() })).optional(),
    materiais: z.array(z.object({ nome: z.string(), categoria: z.string(), fornecedor: z.string().optional() })).optional(),
    prompts:   z.array(z.string()).optional(),
  },
).omit({ id: true, createdAt: true, updatedAt: true, vezesCriado: true });

export type InsertArchOfficeTemplate = z.infer<typeof insertArchOfficeTemplateSchema>;
export type ArchOfficeTemplate       = typeof archOfficeTemplatesTable.$inferSelect;
