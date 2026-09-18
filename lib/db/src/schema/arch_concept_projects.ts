import { pgTable, text, timestamp, integer, jsonb, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { archProjetosTable } from "./arch_projetos";

export type ArchConceptLot = {
  width: number;
  depth: number;
};

export type ArchConceptConfiguration = {
  floors: number;
  desiredArea: number;
};

export type ArchConceptRoom = {
  id: string;
  kind: string;
  label: string;
  width: number;
  depth: number;
  floor: number;
  x: number;
  y: number;
  locked?: boolean;
};

export type ArchConceptOpeningOverride = Record<
  string,
  { x: number; y: number; type: "door" | "window" }
>;

export const archConceptProjectsTable = pgTable("arch_concept_projects", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  archProjetoId: text("arch_projeto_id")
    .references(() => archProjetosTable.id, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }).notNull().default("Meu pré-projeto"),
  status: varchar("status", { length: 30 }).notNull().default("draft"),
  currentStep: integer("current_step").notNull().default(0),
  lot: jsonb("lot").$type<ArchConceptLot>().notNull(),
  configuration: jsonb("configuration").$type<ArchConceptConfiguration>().notNull(),
  rooms: jsonb("rooms").$type<ArchConceptRoom[]>().notNull(),
  openingOverrides: jsonb("opening_overrides").$type<ArchConceptOpeningOverride>().notNull().default({}),
  selectedVariant: integer("selected_variant").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertArchConceptProjectSchema = createInsertSchema(archConceptProjectsTable, {
  currentStep: z.coerce.number().int().min(0).max(10),
  selectedVariant: z.coerce.number().int().min(0).max(10),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateArchConceptProjectSchema = createSelectSchema(archConceptProjectsTable, {
  currentStep: z.coerce.number().int().min(0).max(10),
  selectedVariant: z.coerce.number().int().min(0).max(10),
})
  .omit({ id: true, tenantId: true, ownerUserId: true, createdAt: true, updatedAt: true })
  .partial();

export type ArchConceptProject = typeof archConceptProjectsTable.$inferSelect;
