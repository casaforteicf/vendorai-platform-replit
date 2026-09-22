import { pgTable, text, integer, numeric, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const prospectingObjectionsTable = pgTable(
  "prospecting_objections",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    // Nullable only for legacy rows whose tenant cannot be recovered safely.
    // All new reads/writes must scope by tenantId.
    tenantId: text("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    segmento: text("segmento"),
    objecao: text("objecao").notNull(),
    frequencia: integer("frequencia").notNull().default(1),
    avancos: integer("avancos").notNull().default(0),
    respostas: jsonb("respostas")
      .$type<Array<{ texto: string; usos: number; conversoes: number }>>()
      .default([]),
    taxaConversao: numeric("taxa_conversao", { precision: 5, scale: 2 }),
    taxaQuebra: numeric("taxa_quebra", { precision: 5, scale: 2 }),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("prospecting_objections_tenant_segment_idx").on(table.tenantId, table.segmento),
  ],
);

export type ProspectingObjection = typeof prospectingObjectionsTable.$inferSelect;
