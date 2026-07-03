// ─── Vendor Ecosystem Platform — Business Network (follows/connections) ───────

import { pgTable, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vepCompaniesTable } from "./vep_companies";

export const vepConnectionsTable = pgTable("vep_connections", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // follower → target (directional)
  fromCompanyId: text("from_company_id")
    .notNull()
    .references(() => vepCompaniesTable.id, { onDelete: "cascade" }),
  toCompanyId:   text("to_company_id")
    .notNull()
    .references(() => vepCompaniesTable.id, { onDelete: "cascade" }),

  type:      text("type").notNull().default("follow"),  // follow | partner | favorite
  active:    boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_vep_connections_from").on(t.fromCompanyId),
  index("idx_vep_connections_to").on(t.toCompanyId),
]);

export const insertVepConnectionSchema = createInsertSchema(vepConnectionsTable, {
  fromCompanyId: z.string().min(1),
  toCompanyId:   z.string().min(1),
  type:          z.enum(["follow", "partner", "favorite"]).optional(),
});

export type VepConnection       = typeof vepConnectionsTable.$inferSelect;
export type InsertVepConnection = typeof vepConnectionsTable.$inferInsert;
