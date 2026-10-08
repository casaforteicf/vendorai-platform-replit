import { pgTable, text, integer, boolean, timestamp, doublePrecision, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const prospectorConfigTable = pgTable("prospector_config", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  setor: text("setor"),
  cidade: text("cidade"),
  cnaeAlvo: text("cnae_alvo").array().notNull().default([]),
  raioKm: integer("raio_km"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  ritmoDiario: integer("ritmo_diario").notNull().default(10),
  autoDispatchThreshold: integer("auto_dispatch_threshold").notNull().default(80),
  ativo: boolean("ativo").notNull().default(false),
  horarioCron: text("horario_cron").notNull().default("09:00"),

  // Universal cold-prospecting orchestration (tenant-scoped).
  coldProspectingMode: text("cold_prospecting_mode")
    .$type<"off" | "assisted" | "autonomous">()
    .notNull()
    .default("off"),
  allowedSolutions: jsonb("allowed_solutions")
    .$type<Array<"vendorai" | "arqdor">>()
    .notNull()
    .default(["vendorai"]),
  targetSegments: jsonb("target_segments").$type<string[]>().notNull().default([]),
  targetPersonas: jsonb("target_personas").$type<string[]>().notNull().default([]),
  allowedChannels: jsonb("allowed_channels").$type<Array<"whatsapp" | "email" | "phone" | "instagram">>().notNull().default(["whatsapp"]),
  contactWindowStart: text("contact_window_start").notNull().default("08:00"),
  contactWindowEnd: text("contact_window_end").notNull().default("18:00"),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  maxContactsPerPerson7d: integer("max_contacts_per_person_7d").notNull().default(5),
  qualificationThreshold: integer("qualification_threshold").notNull().default(70),
  meetingReadinessThreshold: integer("meeting_readiness_threshold").notNull().default(80),
  autoSendApprovedContent: boolean("auto_send_approved_content").notNull().default(false),
  conversionCriteria: jsonb("conversion_criteria").$type<{
    requireResponsible?: boolean;
    requireConfirmedPain?: boolean;
    requireDecisionMakerOrPath?: boolean;
    requireMeetingAccepted?: boolean;
  }>().notNull().default({
    requireResponsible: true,
    requireConfirmedPain: true,
    requireDecisionMakerOrPath: true,
    requireMeetingAccepted: false,
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProspectorConfigSchema = createInsertSchema(prospectorConfigTable, {
  ritmoDiario: z.number().int().min(1).max(500),
  raioKm: z.number().int().min(1).max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  coldProspectingMode: z.enum(["off", "assisted", "autonomous"]).optional(),
  allowedSolutions: z.array(z.enum(["vendorai", "arqdor"])).min(1).max(2).optional(),
  targetSegments: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  targetPersonas: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  allowedChannels: z.array(z.enum(["whatsapp", "email", "phone", "instagram"])).min(1).max(4).optional(),
  contactWindowStart: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/).optional(),
  contactWindowEnd: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/).optional(),
  timezone: z.string().min(1).max(100).optional(),
  maxContactsPerPerson7d: z.number().int().min(1).max(30).optional(),
  qualificationThreshold: z.number().int().min(0).max(100).optional(),
  meetingReadinessThreshold: z.number().int().min(0).max(100).optional(),
  autoSendApprovedContent: z.boolean().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateProspectorConfigSchema = createSelectSchema(prospectorConfigTable, {
  ritmoDiario: z.number().int().min(1).max(500).optional(),
  raioKm: z.number().int().min(1).max(100).optional(),
}).partial().omit({ id: true, tenantId: true, createdAt: true, updatedAt: true });

export type ProspectorConfig = typeof prospectorConfigTable.$inferSelect;
export type InsertProspectorConfig = z.infer<typeof insertProspectorConfigSchema>;
export type UpdateProspectorConfig = z.infer<typeof updateProspectorConfigSchema>;
