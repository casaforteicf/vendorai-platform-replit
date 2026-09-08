import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export type JarvisKeyPersonPublicSource = {
  sourceId?: string | null;
  sourceName?: string | null;
  publicUrl?: string | null;
  sourceType?: string | null;
};

export const jarvisKeyPeopleTable = pgTable("jarvis_key_people", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  organization: text("organization"),
  role: text("role"),
  monitoringReason: text("monitoring_reason"),
  publicSources: jsonb("public_sources").$type<JarvisKeyPersonPublicSource[]>(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type JarvisKeyPerson = typeof jarvisKeyPeopleTable.$inferSelect;
export type InsertJarvisKeyPerson = typeof jarvisKeyPeopleTable.$inferInsert;
