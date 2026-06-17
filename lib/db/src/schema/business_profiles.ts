import { pgTable, text, timestamp, unique, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const productSchema = z.object({
  nome: z.string().min(1),
  descricao: z.string().optional(),
  preco: z.number().nonnegative().optional(),
});

export const businessProfilesTable = pgTable(
  "business_profiles",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    razaoSocial: text("razao_social").notNull(),
    nomeFantasia: text("nome_fantasia"),
    cnpj: text("cnpj"),
    endereco: text("endereco"),
    telefone: text("telefone"),
    email: text("email"),
    vertical: text("vertical"),
    logoUrl: text("logo_url"),
    faviconUrl: text("favicon_url"),
    produtos: jsonb("produtos").$type<z.infer<typeof productSchema>[]>(),
    diferenciais: text("diferenciais"),
    publicoAlvo: text("publico_alvo"),
    concorrentes: jsonb("concorrentes").$type<string[]>(),
    canaisVenda: jsonb("canais_venda").$type<string[]>(),
    discoveryCompletedAt: timestamp("discovery_completed_at"),
    discoveryData: jsonb("discovery_data").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("business_profiles_tenant_id_unique").on(t.tenantId)]
);

export const insertBusinessProfileSchema = createInsertSchema(
  businessProfilesTable,
  {
    produtos: z.array(productSchema).optional(),
    discoveryData: z.record(z.string(), z.unknown()).optional(),
    discoveryCompletedAt: z.coerce.date().optional(),
  }
).omit({ id: true, createdAt: true, updatedAt: true });

export const updateBusinessProfileSchema = createSelectSchema(
  businessProfilesTable,
  {
    produtos: z.array(productSchema).optional(),
    discoveryData: z.record(z.string(), z.unknown()).optional(),
    discoveryCompletedAt: z.coerce.date().optional(),
  }
)
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertBusinessProfile = z.infer<typeof insertBusinessProfileSchema>;
export type UpdateBusinessProfile = z.infer<typeof updateBusinessProfileSchema>;
export type BusinessProfile = typeof businessProfilesTable.$inferSelect;
