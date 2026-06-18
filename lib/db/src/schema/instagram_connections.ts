import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const instagramConnectionsTable = pgTable("instagram_connections", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  accountId: text("account_id"),
  pageId: text("page_id"),
  username: text("username"),
  pageAccessToken: text("page_access_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  connectedAt: timestamp("connected_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  disconnectedAt: timestamp("disconnected_at"),
});

export const insertInstagramConnectionSchema = createInsertSchema(instagramConnectionsTable, {
  tokenExpiresAt: z.coerce.date().optional(),
  connectedAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  disconnectedAt: z.coerce.date().optional(),
}).omit({ id: true, createdAt: true });

export const updateInstagramConnectionSchema = createSelectSchema(instagramConnectionsTable, {
  tokenExpiresAt: z.coerce.date().optional(),
  connectedAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  disconnectedAt: z.coerce.date().optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type InsertInstagramConnection = z.infer<typeof insertInstagramConnectionSchema>;
export type UpdateInstagramConnection = z.infer<typeof updateInstagramConnectionSchema>;
export type InstagramConnection = typeof instagramConnectionsTable.$inferSelect;
