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
  projectScope?: "house" | "room";
  startWithTerrain?: boolean;
  startSourceChosen?: boolean;
  intakeStage?: "kind" | "terrain_choice" | "terrain_editor" | "source" | "complete";
  terrainDefined?: boolean;
  /** Idempotency token created once per new-project browser session. */
  creationKey?: string;
  workspaceBounds?: { width: number; depth: number };
  typology?: "terrea_2q" | "terrea_3q" | "terrea_lazer" | "sobrado_3q" | "sobrado_master";
  layoutPreferences?: Record<string, boolean>;
  wallFirstFloors?: number[];
  showDimensions?: boolean;
  sitePlacement?: {
    frontSide: "bottom" | "top" | "left" | "right";
    setbackFront: number;
    setbackRear: number;
    setbackLeft: number;
    setbackRight: number;
    avoidSide?: "bottom" | "top" | "left" | "right" | null;
    strategy?: "balanced" | "access" | "solar" | "leisure";
    lotBoundary?: {
      kind: "polygon";
      points: Array<{ x: number; y: number }>;
    } | null;
    northSide?: "bottom" | "top" | "left" | "right" | null;
    vehicleAccessSide?: "bottom" | "top" | "left" | "right" | null;
    slope?: "flat" | "to_front" | "to_rear" | "to_left" | "to_right";
    preferredViewSide?: "bottom" | "top" | "left" | "right" | null;
    avoidSide?: "bottom" | "top" | "left" | "right" | null;
    strategy?: "balanced" | "access" | "solar" | "leisure";
    lotBoundary?: {
      kind: "polygon";
      points: Array<{ x: number; y: number }>;
    } | null;
  };
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
    swingSide?: "inside" | "outside";
    leafCount?: number;
    frameProfile?: string;
    glassType?: string;
    manufacturer?: string;
    catalogProductId?: string;
  }>;
  spaceProfiles?: Array<{
    id: string;
    floor: number;
    label: string;
    kind: string;
    centroid: { x: number; y: number };
    area: number;
    floorMaterialId?: string;
  }>;
  objects?: Array<{
    id: string;
    kind: "sofa" | "bed" | "table" | "chair" | "cabinet" | "tv" | "plant" | "lamp" | "rug"
      | "outlet" | "switch" | "light_point" | "water_point" | "drain_point" | "shower_point" | "faucet_point";
    label: string;
    floor: number;
    x: number;
    y: number;
    width: number;
    depth: number;
    rotation: number;
    materialId?: string;
    catalogProductId?: string;
    imageUrl?: string;
    supplier?: string;
    price?: number;
    model3dUrl?: string;
  }>;
  wallMaterials?: Record<string, string>;
  savedTourPoints?: Array<{
    id: string;
    name: string;
    floor: number;
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  }>;
  publicTourToken?: string;
  publicTourEnabled?: boolean;
  publicTourUpdatedAt?: string;
  facadeDesign?: Record<string, unknown>;
  revisionOfConceptId?: string;
  revisionNumber?: number;
  projectMaster?: {
    version: number;
    frozenAt: string;
    sourceConceptId: string;
    sourceUpdatedAt: string;
    geometryVersion: "master_facade_v1";
    lot: ArchConceptLot;
    floors: number;
    desiredArea: number;
    sitePlacement?: Record<string, unknown>;
    rooms: ArchConceptRoom[];
    customWalls: Array<Record<string, unknown>>;
    customOpenings: Array<Record<string, unknown>>;
    openingOverrides: ArchConceptOpeningOverride;
    facadePreferences: ArchConceptFacadePreferences;
    facadeDesign?: Record<string, unknown>;
    projectBrief?: Record<string, unknown> | null;
    objects: Array<Record<string, unknown>>;
    spaceProfiles: Array<Record<string, unknown>>;
    wallMaterials: Record<string, string>;
    acceptanceProof: {
      validatorVersion: string;
      status: "approved" | "review";
      score: number;
      issues: Array<{ id: string; severity: "error" | "warning"; roomId?: string; message: string }>;
      acceptedWarningIds: string[];
      evaluatedAt: string;
    };
    conceptRender?: Record<string, unknown>;
    quantities: Array<{
      stage: string;
      item: string;
      unit: string;
      quantity: number;
      basis: "geometry" | "concept";
      compositionCode?: string;
      catalogProductId?: string;
      manufacturer?: string;
    }>;
    links: {
      archProjetoId: string;
      obraId: string;
      budgetId: string;
      leadId: string | null;
      dealId: string | null;
    };
  };
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
  floorMaterialId?: string;
  poolDepthM?: number;
  stairRiserCount?: number;
  stairTreadDepthM?: number;
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
    source?: "facade" | "model3d";
    renderView?: "exterior" | "interior";
    history?: Array<{
      renderId: string;
      resultImageUrl: string;
      generatedAt: string;
      source: "facade" | "model3d";
      renderView: "exterior" | "interior";
    }>;
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
  .omit({ id: true, tenantId: true, ownerUserId: true, archProjetoId: true, status: true, createdAt: true, updatedAt: true })
  .partial();

export type ArchConceptProject = typeof archConceptProjectsTable.$inferSelect;
