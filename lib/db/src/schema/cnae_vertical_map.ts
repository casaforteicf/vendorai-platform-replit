import { pgTable, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const cnaeVerticalMapTable = pgTable("cnae_vertical_map", {
  cnae: text("cnae").primaryKey(),
  label: text("label").notNull(),
  vertical: text("vertical").notNull(),
  prioridade: integer("prioridade").notNull().default(5),
});

export const insertCnaeVerticalMapSchema = createInsertSchema(cnaeVerticalMapTable);
export const selectCnaeVerticalMapSchema = createSelectSchema(cnaeVerticalMapTable);
