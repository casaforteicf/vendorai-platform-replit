import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

// Feature store — primeiro passo real de qualquer projeto de ML (antes de
// qualquer modelo treinado). Captura o estado do lead em momentos-chave da
// jornada; quando o lead eventualmente resolve (ganho/perdido), os
// snapshots pendentes desse lead são retroativamente rotulados. Só quando
// houver volume suficiente de exemplos rotulados (resultado preenchido) é
// que faz sentido treinar um modelo de propensão de verdade.
export const mlFeatureSnapshotsTable = pgTable("ml_feature_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  // O que disparou essa captura — ex: "status_change", "test_drive_realizado",
  // "proposta_enviada", "deal_etapa_change".
  eventoTipo: text("evento_tipo").notNull(),
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
  // Bag de features livre (varia por vertical/evento) — decisão consciente
  // de não normalizar em colunas: o vocabulário de features vai crescer e
  // mudar muito antes de qualquer modelo real ser treinado.
  features: jsonb("features").$type<Record<string, unknown>>().notNull(),
  // Rótulo, preenchido depois — null = resultado ainda não conhecido,
  // esse snapshot não deve ser usado como exemplo de treino ainda.
  resultado: text("resultado").$type<"ganho" | "perdido" | null>(),
  resultadoRegistradoEm: timestamp("resultado_registrado_em"),
});

export type MlFeatureSnapshot = typeof mlFeatureSnapshotsTable.$inferSelect;
