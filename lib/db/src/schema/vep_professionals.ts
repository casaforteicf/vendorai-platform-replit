// ─── Vendor Ecosystem Platform — Professionals ───────────────────────────────
// Individual professionals linked to companies.

import { pgTable, text, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vepCompaniesTable } from "./vep_companies";

export const VEP_PROFESSIONAL_ROLES = [
  "ARCHITECT", "INTERIOR_DESIGNER", "ENGINEER", "REPRESENTATIVE",
  "CONSULTANT", "DESIGNER", "SELLER", "SUPPORT", "FINANCIAL",
  "PROCUREMENT", "MANAGER", "DIRECTOR", "OTHER",
] as const;

export const vepProfessionalsTable = pgTable("vep_professionals", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  companyId: text("company_id")
    .references(() => vepCompaniesTable.id, { onDelete: "cascade" }),

  // Identity
  name:       text("name").notNull(),
  role:       text("role"),
  title:      text("title"),
  bio:        text("bio"),
  avatarUrl:  text("avatar_url"),
  email:      text("email"),
  phone:      text("phone"),
  linkedin:   text("linkedin"),
  instagram:  text("instagram"),

  // Expertise
  specialties: jsonb("specialties").$type<string[]>().default([]),
  regions:     jsonb("regions").$type<string[]>().default([]),
  languages:   jsonb("languages").$type<string[]>().default(["pt-BR"]),

  // Register number (CAU, CREA, etc.)
  registerNumber: text("register_number"),
  registerType:   text("register_type"),  // CAU, CREA, CFQ, etc.

  // Optional link to user
  userId: text("user_id"),

  active:    boolean("active").notNull().default(true),
  featured:  boolean("featured").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_vep_professionals_company").on(t.companyId),
]);

export const insertVepProfessionalSchema = createInsertSchema(vepProfessionalsTable, {
  name:        z.string().min(2).max(255),
  role:        z.enum(VEP_PROFESSIONAL_ROLES).optional(),
  specialties: z.array(z.string()).optional(),
  regions:     z.array(z.string()).optional(),
  languages:   z.array(z.string()).optional(),
});

export const selectVepProfessionalSchema = createSelectSchema(vepProfessionalsTable, {
  specialties: z.array(z.string()),
  regions:     z.array(z.string()),
  languages:   z.array(z.string()),
});

export type VepProfessional       = typeof vepProfessionalsTable.$inferSelect;
export type InsertVepProfessional = typeof vepProfessionalsTable.$inferInsert;
