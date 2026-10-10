import { pgTable, text, integer, jsonb, timestamp, primaryKey, index, foreignKey, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenantsTable } from "./tenants";
import { arqdorWorkspaceProjectsTable } from "./arqdor_workspace_projects";

/** MEP-01: tenant/project-scoped BIM infrastructure graph. Coordinates are millimeters. */
export const arqdorMepSystemsTable = pgTable("arqdor_mep_systems", {
  id: text("id").notNull().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull(),
  discipline: text("discipline").$type<"electrical" | "cold_water" | "hot_water" | "sanitary">().notNull(),
  name: text("name").notNull(),
  status: text("status").$type<"draft" | "review" | "approved">().notNull().default("draft"),
  revision: integer("revision").notNull().default(1),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, t => [
  primaryKey({ columns: [t.tenantId, t.projectId, t.id] }),
  foreignKey({ columns: [t.projectId, t.tenantId], foreignColumns: [arqdorWorkspaceProjectsTable.id, arqdorWorkspaceProjectsTable.tenantId], name: "arqdor_mep_system_project_fk" }).onDelete("cascade"),
  check("arqdor_mep_system_revision_positive", sql`${t.revision} > 0`),
  index("arqdor_mep_system_discipline_idx").on(t.tenantId, t.projectId, t.discipline),
]);

export const arqdorMepNetworksTable = pgTable("arqdor_mep_networks", {
  id: text("id").notNull().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull(),
  projectId: text("project_id").notNull(),
  systemId: text("system_id").notNull(),
  name: text("name").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
}, t => [
  primaryKey({ columns: [t.tenantId, t.projectId, t.id] }),
  foreignKey({ columns: [t.tenantId, t.projectId, t.systemId], foreignColumns: [arqdorMepSystemsTable.tenantId, arqdorMepSystemsTable.projectId, arqdorMepSystemsTable.id], name: "arqdor_mep_network_system_fk" }).onDelete("cascade"),
]);

export const arqdorMepNodesTable = pgTable("arqdor_mep_nodes", {
  id: text("id").notNull().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull(),
  projectId: text("project_id").notNull(),
  networkId: text("network_id").notNull(),
  floorId: text("floor_id").notNull(),
  roomId: text("room_id"),
  hostElementId: text("host_element_id"),
  kind: text("kind").notNull(),
  xMm: integer("x_mm").notNull(),
  yMm: integer("y_mm").notNull(),
  zMm: integer("z_mm").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
}, t => [
  primaryKey({ columns: [t.tenantId, t.projectId, t.networkId, t.id] }),
  foreignKey({ columns: [t.tenantId, t.projectId, t.networkId], foreignColumns: [arqdorMepNetworksTable.tenantId, arqdorMepNetworksTable.projectId, arqdorMepNetworksTable.id], name: "arqdor_mep_node_network_fk" }).onDelete("cascade"),
  index("arqdor_mep_node_host_idx").on(t.tenantId, t.projectId, t.hostElementId),
]);

export const arqdorMepSegmentsTable = pgTable("arqdor_mep_segments", {
  id: text("id").notNull().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull(),
  projectId: text("project_id").notNull(),
  networkId: text("network_id").notNull(),
  fromNodeId: text("from_node_id").notNull(),
  toNodeId: text("to_node_id").notNull(),
  material: text("material"),
  nominalSizeMm: integer("nominal_size_mm"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
}, t => [
  primaryKey({ columns: [t.tenantId, t.projectId, t.id] }),
  foreignKey({ columns: [t.tenantId, t.projectId, t.networkId], foreignColumns: [arqdorMepNetworksTable.tenantId, arqdorMepNetworksTable.projectId, arqdorMepNetworksTable.id], name: "arqdor_mep_segment_network_fk" }).onDelete("cascade"),
  foreignKey({ columns: [t.tenantId, t.projectId, t.networkId, t.fromNodeId], foreignColumns: [arqdorMepNodesTable.tenantId, arqdorMepNodesTable.projectId, arqdorMepNodesTable.networkId, arqdorMepNodesTable.id], name: "arqdor_mep_segment_from_fk" }).onDelete("cascade"),
  foreignKey({ columns: [t.tenantId, t.projectId, t.networkId, t.toNodeId], foreignColumns: [arqdorMepNodesTable.tenantId, arqdorMepNodesTable.projectId, arqdorMepNodesTable.networkId, arqdorMepNodesTable.id], name: "arqdor_mep_segment_to_fk" }).onDelete("cascade"),
  check("arqdor_mep_segment_distinct_nodes", sql`${t.fromNodeId} <> ${t.toNodeId}`),
  check("arqdor_mep_segment_positive_size", sql`${t.nominalSizeMm} IS NULL OR ${t.nominalSizeMm} > 0`),
]);

export type ArqdorMepSystem = typeof arqdorMepSystemsTable.$inferSelect;
export type ArqdorMepNetwork = typeof arqdorMepNetworksTable.$inferSelect;
export type ArqdorMepNode = typeof arqdorMepNodesTable.$inferSelect;
export type ArqdorMepSegment = typeof arqdorMepSegmentsTable.$inferSelect;
