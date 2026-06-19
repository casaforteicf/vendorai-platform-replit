import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const domainStatusEnum = pgEnum("domain_status", [
  "pending_dns",
  "pending_ssl",
  "active",
  "failed",
]);

export const tenantDomainsTable = pgTable("tenant_domains", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  domain: text("domain").notNull().unique(),
  status: domainStatusEnum("status").notNull().default("pending_dns"),
  cloudflareCustomHostnameId: text("cloudflare_custom_hostname_id"),
  dnsRecordName: text("dns_record_name"),
  dnsRecordValue: text("dns_record_value"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTenantDomainSchema = createInsertSchema(tenantDomainsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateTenantDomainSchema = createSelectSchema(tenantDomainsTable)
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertTenantDomain = z.infer<typeof insertTenantDomainSchema>;
export type UpdateTenantDomain = z.infer<typeof updateTenantDomainSchema>;
export type TenantDomain = typeof tenantDomainsTable.$inferSelect;
