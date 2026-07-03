// ─── Vendor Partner Network — Partners table ──────────────────────────────────
// Platform-level entity: visible to ALL verticals.
// FASE 20 — VPN Core

import { pgTable, text, boolean, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const PARTNER_TYPES = [
  "MANUFACTURER", "DISTRIBUTOR", "RESELLER", "REPRESENTATIVE",
  "INSTALLER", "SERVICE_PROVIDER", "ARCHITECT", "DESIGNER",
  "CONSTRUCTOR", "SUPPLIER", "LANDSCAPING", "LIGHTING",
  "MARBLE", "CABINETRY", "AUTOMATION", "CUSTOM",
] as const;

export const PARTNER_TIERS = ["basic", "verified", "official", "premium", "enterprise"] as const;
export const PARTNER_STATUS = ["active", "inactive", "pending", "suspended"] as const;

export const vpnPartnersTable = pgTable("vpn_partners", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // Identity
  name:        text("name").notNull(),
  brand:       text("brand"),
  type:        text("type").notNull().default("SUPPLIER"),
  logoUrl:     text("logo_url"),
  description: text("description"),
  website:     text("website"),

  // Contact
  phone:   text("phone"),
  email:   text("email"),
  city:    text("city"),
  state:   text("state"),
  country: text("country").default("BR"),

  // Geographic & commercial data
  regions:      jsonb("regions").$type<string[]>().default([]),
  segments:     jsonb("segments").$type<string[]>().default([]),
  specialties:  jsonb("specialties").$type<string[]>().default([]),
  languages:    jsonb("languages").$type<string[]>().default(["pt-BR"]),
  tags:         jsonb("tags").$type<string[]>().default([]),

  // Certifications (Vendor seal)
  certifications: jsonb("certifications").$type<string[]>().default([]),
  tier:           text("tier").notNull().default("basic"),

  // Business info
  cnpj:         text("cnpj"),
  workingHours: jsonb("working_hours").$type<Record<string, string>>().default({}),
  socialMedia:  jsonb("social_media").$type<Record<string, string>>().default({}),

  // Metadata
  status:     text("status").notNull().default("active"),
  featured:   boolean("featured").notNull().default(false),
  totalLeads: integer("total_leads").notNull().default(0),
  totalOrders:integer("total_orders").notNull().default(0),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVpnPartnerSchema = createInsertSchema(vpnPartnersTable, {
  name:           z.string().min(2).max(255),
  type:           z.enum(PARTNER_TYPES).optional(),
  tier:           z.enum(PARTNER_TIERS).optional(),
  status:         z.enum(PARTNER_STATUS).optional(),
  regions:        z.array(z.string()).optional(),
  segments:       z.array(z.string()).optional(),
  specialties:    z.array(z.string()).optional(),
  certifications: z.array(z.string()).optional(),
  tags:           z.array(z.string()).optional(),
  languages:      z.array(z.string()).optional(),
  workingHours:   z.record(z.string(), z.string()).optional(),
  socialMedia:    z.record(z.string(), z.string()).optional(),
});

export const selectVpnPartnerSchema = createSelectSchema(vpnPartnersTable, {
  regions:        z.array(z.string()),
  segments:       z.array(z.string()),
  specialties:    z.array(z.string()),
  certifications: z.array(z.string()),
  tags:           z.array(z.string()),
  languages:      z.array(z.string()),
  workingHours:   z.record(z.string(), z.string()),
  socialMedia:    z.record(z.string(), z.string()),
});

export type VpnPartner       = typeof vpnPartnersTable.$inferSelect;
export type InsertVpnPartner = typeof vpnPartnersTable.$inferInsert;
