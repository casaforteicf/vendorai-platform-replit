import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const partnersTable = pgTable("partners", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPartnerSchema = createInsertSchema(partnersTable).omit({
  id: true,
  createdAt: true,
});

export const updatePartnerSchema = createSelectSchema(partnersTable)
  .omit({ id: true, createdAt: true })
  .partial();

export type InsertPartner = z.infer<typeof insertPartnerSchema>;
export type Partner = typeof partnersTable.$inferSelect;
