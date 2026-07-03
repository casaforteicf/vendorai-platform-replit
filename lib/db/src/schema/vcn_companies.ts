// ─── Vendor Certified Network — Certified Companies ──────────────────────────
// FASE 22. Platform-level certified manufacturers, distributors, suppliers.

import { pgTable, text, boolean, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const VCN_COMPANY_TYPES = [
  "MANUFACTURER", "DISTRIBUTOR", "RESELLER", "REPRESENTATIVE",
  "SERVICE_PROVIDER", "CABINETRY", "LIGHTING", "STONE", "FLOORING",
  "WINDOWS", "AUTOMATION", "PAINT", "FURNITURE", "DECOR", "OTHER",
] as const;

export const VCN_CERTIFICATION_LEVELS = [
  "official", "certified", "premium", "enterprise",
] as const;

export const VCN_STATUS = ["active", "pending", "suspended", "inactive"] as const;

export const vcnCompaniesTable = pgTable("vcn_companies", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // Identity
  type:        text("type").notNull().default("MANUFACTURER"),
  legalName:   text("legal_name").notNull(),
  brandName:   text("brand_name"),
  logoUrl:     text("logo_url"),
  coverUrl:    text("cover_url"),
  description: text("description"),
  website:     text("website"),
  cnpj:        text("cnpj"),

  // Contact
  phone:   text("phone"),
  email:   text("email"),
  city:    text("city"),
  state:   text("state"),
  country: text("country").default("BR"),
  address: text("address"),

  // Scope
  segments:    jsonb("segments").$type<string[]>().default([]),
  categories:  jsonb("categories").$type<string[]>().default([]),
  regions:     jsonb("regions").$type<string[]>().default([]),
  specialties: jsonb("specialties").$type<string[]>().default([]),
  tags:        jsonb("tags").$type<string[]>().default([]),
  languages:   jsonb("languages").$type<string[]>().default(["pt-BR"]),

  // Certification
  certificationLevel: text("certification_level").notNull().default("official"),
  certifications:     jsonb("certifications").$type<string[]>().default([]),
  verified:           boolean("verified").notNull().default(false),
  featured:           boolean("featured").notNull().default(false),

  // Business
  foundedYear:   integer("founded_year"),
  teamSize:      text("team_size"),
  socialMedia:   jsonb("social_media").$type<Record<string, string>>().default({}),
  workingHours:  jsonb("working_hours").$type<Record<string, string>>().default({}),

  // Stats
  status:           text("status").notNull().default("active"),
  productsCount:    integer("products_count").notNull().default(0),
  specificationsCount: integer("specifications_count").notNull().default(0),
  quotationsCount:  integer("quotations_count").notNull().default(0),
  specialistsCount: integer("specialists_count").notNull().default(0),

  // Optional link to tenant
  tenantId: text("tenant_id"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_vcn_companies_type").on(t.type),
  index("idx_vcn_companies_status").on(t.status),
  index("idx_vcn_companies_cert").on(t.certificationLevel),
]);

export const insertVcnCompanySchema = createInsertSchema(vcnCompaniesTable, {
  legalName:          z.string().min(2).max(255),
  type:               z.enum(VCN_COMPANY_TYPES).optional(),
  certificationLevel: z.enum(VCN_CERTIFICATION_LEVELS).optional(),
  status:             z.enum(VCN_STATUS).optional(),
  segments:           z.array(z.string()).optional(),
  categories:         z.array(z.string()).optional(),
  regions:            z.array(z.string()).optional(),
  specialties:        z.array(z.string()).optional(),
  tags:               z.array(z.string()).optional(),
  languages:          z.array(z.string()).optional(),
  certifications:     z.array(z.string()).optional(),
  socialMedia:        z.record(z.string(), z.string()).optional(),
  workingHours:       z.record(z.string(), z.string()).optional(),
  foundedYear:        z.number().int().min(1800).max(2100).optional(),
});

export const selectVcnCompanySchema = createSelectSchema(vcnCompaniesTable, {
  segments:       z.array(z.string()),
  categories:     z.array(z.string()),
  regions:        z.array(z.string()),
  specialties:    z.array(z.string()),
  tags:           z.array(z.string()),
  languages:      z.array(z.string()),
  certifications: z.array(z.string()),
  socialMedia:    z.record(z.string(), z.string()),
  workingHours:   z.record(z.string(), z.string()),
});

export type VcnCompany       = typeof vcnCompaniesTable.$inferSelect;
export type InsertVcnCompany = typeof vcnCompaniesTable.$inferInsert;
