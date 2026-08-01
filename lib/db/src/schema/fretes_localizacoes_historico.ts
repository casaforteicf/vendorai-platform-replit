import { pgTable, text, timestamp, doublePrecision, index } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { fretesCargasTable } from "./fretes_cargas";

// Histórico de posições — cada atualização de localização do motorista vira
// uma linha aqui (além de atualizar o "ponto atual" em fretes_cargas), pra
// dar pra desenhar o rastro percorrido no mapa, não só a bolinha de agora.
export const fretesLocalizacoesHistoricoTable = pgTable(
  "fretes_localizacoes_historico",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    cargaId: text("carga_id").notNull().references(() => fretesCargasTable.id, { onDelete: "cascade" }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    registradoEm: timestamp("registrado_em").notNull().defaultNow(),
  },
  (table) => [
    index("fretes_localizacoes_historico_carga_idx").on(table.cargaId, table.registradoEm),
  ],
);

export type FretesLocalizacaoHistorico = typeof fretesLocalizacoesHistoricoTable.$inferSelect;
