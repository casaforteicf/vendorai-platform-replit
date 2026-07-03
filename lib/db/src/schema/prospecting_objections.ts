import { pgTable, text, integer, numeric, jsonb, timestamp } from "drizzle-orm/pg-core";

export const prospectingObjectionsTable = pgTable("prospecting_objections", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  segmento: text("segmento"),
  objecao: text("objecao").notNull(),
  frequencia: integer("frequencia").notNull().default(1),
  respostas: jsonb("respostas").$type<Array<{ texto: string; usos: number; conversoes: number }>>().default([]),
  taxaConversao: numeric("taxa_conversao", { precision: 5, scale: 2 }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ProspectingObjection = typeof prospectingObjectionsTable.$inferSelect;
