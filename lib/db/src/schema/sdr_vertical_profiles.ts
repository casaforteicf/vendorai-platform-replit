import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const sdrVerticalProfilesTable = pgTable("sdr_vertical_profiles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  vertical: text("vertical").notNull().unique(),
  tom: text("tom").notNull(),
  vocabulario: jsonb("vocabulario").$type<string[]>().default([]),
  doresTipicas: jsonb("dores_tipicas").$type<string[]>().default([]),
  aberturaPadrao: text("abertura_padrao").notNull(),
  exemplos: jsonb("exemplos").$type<string[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SdrVerticalProfile = typeof sdrVerticalProfilesTable.$inferSelect;
