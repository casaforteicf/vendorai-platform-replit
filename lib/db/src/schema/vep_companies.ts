// ─── Vendor Ecosystem Platform — Companies ────────────────────────────────────
// Platform-level entity. All ecosystem participants (architects, suppliers, etc.)
// FASE 21 — VEP Core

import { pgTable, text, boolean, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const VEP_COMPANY_TYPES = [
  "ARCHITECTURE", "INTERIOR_DESIGN", "CONSTRUCTION", "DEVELOPER",
  "CABINETRY", "STONE", "LIGHTING", "AUTOMATION", "PAINT", "FLOORING",
  "WINDOWS", "PVC", "SUPPLIER", "MANUFACTURER", "DISTRIBUTOR",
  "SERVICE", "CONSULTING", "OTHER",
] as const;

export const VEP_COMPANY_TIERS = ["basic", "verified", "certified", "premium", "enterprise"] as const;
export const VEP_COMPANY_STATUS = ["active", "inactive", "pending", "suspended"] as const;

export const vepCompaniesTable = pgTable("vep_companies", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // Identity
  type:          text("type").notNull().default("OTHER"),
  legalName:     text("legal_name").notNull(),
  tradeName:     text("trade_name"),
  logoUrl:       text("logo_url"),
  coverUrl:      text("cover_url"),
  description:   text("description"),
  mission:       text("mission"),
  history:       text("history"),
  website:       text("website"),
  cnpj:          text("cnpj"),

  // Contact
  phone:   text("phone"),
  email:   text("email"),
  city:    text("city"),
  state:   text("state"),
  country: text("country").default("BR"),
  address: text("address"),

  // Scope & expertise
  segments:       jsonb("segments").$type<string[]>().default([]),
  specialties:    jsonb("specialties").$type<string[]>().default([]),
  regions:        jsonb("regions").$type<string[]>().default([]),
  languages:      jsonb("languages").$type<string[]>().default(["pt-BR"]),
  tags:           jsonb("tags").$type<string[]>().default([]),

  // Certifications & tier
  certifications: jsonb("certifications").$type<string[]>().default([]),
  tier:           text("tier").notNull().default("basic"),

  // Business data
  foundedYear:  integer("founded_year"),
  teamSize:     text("team_size"),    // "1-5", "6-20", "21-100", "100+"
  socialMedia:  jsonb("social_media").$type<Record<string, string>>().default({}),
  workingHours: jsonb("working_hours").$type<Record<string, string>>().default({}),

  // Stats
  status:          text("status").notNull().default("active"),
  featured:        boolean("featured").notNull().default(false),
  verified:        boolean("verified").notNull().default(false),
  followersCount:  integer("followers_count").notNull().default(0),
  projectsCount:   integer("projects_count").notNull().default(0),
  portfolioCount:  integer("portfolio_count").notNull().default(0),

  // Optional link to tenant (if the company is a VendorAI customer)
  tenantId: text("tenant_id"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_vep_companies_type").on(t.type),
  index("idx_vep_companies_status").on(t.status),
]);

export const insertVepCompanySchema = createInsertSchema(vepCompaniesTable, {
  legalName:      z.string().min(2).max(255),
  type:           z.enum(VEP_COMPANY_TYPES).optional(),
  tier:           z.enum(VEP_COMPANY_TIERS).optional(),
  status:         z.enum(VEP_COMPANY_STATUS).optional(),
  segments:       z.array(z.string()).optional(),
  specialties:    z.array(z.string()).optional(),
  regions:        z.array(z.string()).optional(),
  certifications: z.array(z.string()).optional(),
  tags:           z.array(z.string()).optional(),
  languages:      z.array(z.string()).optional(),
  socialMedia:    z.record(z.string(), z.string()).optional(),
  workingHours:   z.record(z.string(), z.string()).optional(),
  foundedYear:    z.number().int().min(1800).max(2100).optional(),
});

export const selectVepCompanySchema = createSelectSchema(vepCompaniesTable, {
  segments:       z.array(z.string()),
  specialties:    z.array(z.string()),
  regions:        z.array(z.string()),
  certifications: z.array(z.string()),
  tags:           z.array(z.string()),
  languages:      z.array(z.string()),
  socialMedia:    z.record(z.string(), z.string()),
  workingHours:   z.record(z.string(), z.string()),
});

export type VepCompany       = typeof vepCompaniesTable.$inferSelect;
export type InsertVepCompany = typeof vepCompaniesTable.$inferInsert;
