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
  typology?: "terrea_2q" | "terrea_3q" | "terrea_lazer" | "sobrado_3q" | "sobrado_master";
  layoutPreferences?: Record<string, boolean>;
  wallFirstFloors?: number[];
  showDimensions?: boolean;
  customWalls?: Array<{
    id: string;
    floor: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    thickness?: number;
  }>;
  customOpenings?: Array<{
    id: string;
    wallId: string;
    floor: number;
    type: "door" | "window";
    offset: number;
    width?: number;
    height?: number;
    sillHeight?: number;
    openingStyle?: "hinged" | "sliding" | "fixed" | "tilt_turn";
    swing?: "left" | "right";
    presetId?: string;
    manufacturer?: string;
    productLine?: string;
    profile?: string;
    frameMaterial?: "pvc" | "aluminum" | "wood" | "steel" | "other";
    frameColor?: string;
    glassType?: "clear" | "tempered" | "laminated" | "insulated" | "frosted" | "none" | "other";
    glassThicknessMm?: number;
    leafCount?: number;
    unitCost?: number;
    components?: string;
  }>;
  spaceProfiles?: Array<{
    id: string;
    floor: number;
    label: string;
    kind: string;
    centroid: { x: number; y: number };
    area: number;
  }>;
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
  stairShape?: "straight" | "l" | "u";
  stairDirection?: "north" | "south" | "east" | "west";
  stairFloorToFloorHeight?: number;
  stairRiserCount?: number;
  stairTreadDepth?: number;
  stairFlightWidth?: number;
  stairLandingDepth?: number;
};

export type ArchConceptOpeningOverride = Record<
  string,
  { x: number; y: number; type: "door" | "window" }
>;

export type ArchConceptCustomerProfile = {
  name?: string;
  phone?: string;
  email?: string;
  budgetRange?: string;
  timeframe?: string;
  notes?: string;
};

export type ArchConceptFacadePreferences = {
  style: "contemporaneo" | "minimalista" | "classico_contemporaneo" | "tropical" | "industrial" | "rustico_contemporaneo";
  roof: "platibanda" | "aparente" | "misto";
  roofWaters?: 1 | 2 | 4;
  roofPitchDeg?: number;
  roofOverhang?: number;
  roofRidgeOrientation?: "x" | "y";
  roofSlopeDirection?: "north" | "south" | "east" | "west";
  roofParapetHeight?: number;
  roofMixedRatio?: number;
  primaryMaterial: "pintura" | "madeira" | "pedra" | "concreto";
  accentMaterial: "nenhum" | "madeira" | "pedra" | "concreto";
  facadeTone: "claro" | "medio" | "escuro";
  frameTone: "preto" | "branco" | "bronze";
  landscaping: "leve" | "medio" | "intenso";
};

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
  customerProfile: jsonb("customer_profile").$type<ArchConceptCustomerProfile>().notNull().default({}),
  facadePreferences: jsonb("facade_preferences").$type<ArchConceptFacadePreferences>().notNull().default({
    style: "contemporaneo",
    roof: "platibanda",
    primaryMaterial: "pintura",
    accentMaterial: "madeira",
    facadeTone: "claro",
    frameTone: "preto",
    landscaping: "medio",
  }),
  conceptRender: jsonb("concept_render").$type<{
    renderId?: string;
    status?: "idle" | "processing" | "completed" | "error";
    resultImageUrl?: string;
    generatedAt?: string;
    error?: string;
  }>().notNull().default({}),
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
