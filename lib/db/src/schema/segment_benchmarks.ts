import { pgTable, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";

export const segmentBenchmarksTable = pgTable("segment_benchmarks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  segmento: text("segmento").notNull().unique(),
  ticketMedio: numeric("ticket_medio", { precision: 10, scale: 2 }),
  taxaRespostaPadrao: numeric("taxa_resposta_padrao", { precision: 5, scale: 2 }),
  volumeMedioAtendimentos: integer("volume_medio_atendimentos"),
  perdaEstimadaPorLeadPerdido: numeric("perda_estimada_por_lead_perdido", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SegmentBenchmark = typeof segmentBenchmarksTable.$inferSelect;
