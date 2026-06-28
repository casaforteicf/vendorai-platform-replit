import {
  pgTable,
  varchar,
  text,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const tenantChannelsTable = pgTable(
  "tenant_channels",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    canal: varchar("canal", { length: 20 }).notNull(),
    provider: varchar("provider", { length: 20 }).notNull().default("zapi"),
    status: varchar("status", { length: 20 }).default("inativo"),
    credenciais: jsonb("credenciais").$type<Record<string, unknown>>(),
    phoneNumberId: varchar("phone_number_id", { length: 100 }),
    wabaId: varchar("waba_id", { length: 100 }),
    igAccountId: varchar("ig_account_id", { length: 100 }),
    webhookVerifyToken: varchar("webhook_verify_token", { length: 100 }),
    ultimoTeste: timestamp("ultimo_teste"),
    ultimoErro: text("ultimo_erro"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("tenant_channels_tenant_canal_unique").on(t.tenantId, t.canal),
  ],
);

export const insertTenantChannelSchema = createInsertSchema(
  tenantChannelsTable,
  {
    canal:    z.enum(["whatsapp", "instagram"]),
    provider: z.enum(["zapi", "meta"]).optional(),
    status:   z.enum(["ativo", "inativo", "erro"]).optional(),
    credenciais: z.record(z.string(), z.unknown()).optional(),
    ultimoTeste: z.coerce.date().optional(),
  },
).omit({ id: true, createdAt: true, updatedAt: true });

export const updateTenantChannelSchema = createSelectSchema(
  tenantChannelsTable,
  {
    canal:    z.enum(["whatsapp", "instagram"]).optional(),
    provider: z.enum(["zapi", "meta"]).optional(),
    status:   z.enum(["ativo", "inativo", "erro"]).optional(),
    credenciais: z.record(z.string(), z.unknown()).optional(),
    ultimoTeste: z.coerce.date().optional(),
  },
)
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertTenantChannel = z.infer<typeof insertTenantChannelSchema>;
export type UpdateTenantChannel = z.infer<typeof updateTenantChannelSchema>;
export type TenantChannel = typeof tenantChannelsTable.$inferSelect;
