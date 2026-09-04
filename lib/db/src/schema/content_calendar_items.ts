import { pgTable, text, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { mediaPlansTable } from "./media_plans";

export const CONTENT_CALENDAR_TIPOS = [
  "feed",
  "stories",
  "reels",
  "carrossel",
  "meta_ad",
  "search_ad",
  "display_ad",
  "performance_max",
  "youtube_short",
  "youtube_video",
  "tiktok",
  "linkedin_post",
  "whatsapp",
  "email",
  "blog",
  "landing_page",
  "site",
  "sms",
] as const;
export type ContentCalendarTipo = (typeof CONTENT_CALENDAR_TIPOS)[number];

export const CONTENT_CALENDAR_STATUS = ["planejado", "gerado", "publicado", "pulado"] as const;
export type ContentCalendarStatus = (typeof CONTENT_CALENDAR_STATUS)[number];

export const contentCalendarItemsTable = pgTable("content_calendar_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  mediaPlanId: text("media_plan_id").references(() => mediaPlansTable.id, { onDelete: "set null" }),
  dataAgendada: date("data_agendada").notNull(),
  pilar: text("pilar").notNull(),
  temaSugerido: text("tema_sugerido").notNull(),
  tipo: text("tipo").$type<ContentCalendarTipo>().notNull().default("feed"),
  canal: text("canal").notNull().default("instagram"),
  status: text("status").$type<ContentCalendarStatus>().notNull().default("planejado"),
  // Preenchidos quando o conteúdo já foi produzido no Gerador de Conteúdo.
  contentGenerationId: text("content_generation_id"),
  variationIdx: integer("variation_idx"),
  // Preenchido quando publicado -- liga pro registro de post (content.ts)
  contentIdPublicado: text("content_id_publicado"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const selectContentCalendarItemSchema = createSelectSchema(contentCalendarItemsTable, {
  tipo: z.enum(CONTENT_CALENDAR_TIPOS),
  status: z.enum(CONTENT_CALENDAR_STATUS),
});
export type ContentCalendarItem = typeof contentCalendarItemsTable.$inferSelect;