// ─── VKG Zod Schemas ─────────────────────────────────────────────────────────
// Runtime validation for nodes and edges at API/integration boundaries.

import { z } from 'zod'
import { NODE_TYPES, RELATIONSHIP_TYPES } from '../types'

export const NodeTypeSchema        = z.enum(NODE_TYPES)
export const RelationshipTypeSchema = z.enum(RELATIONSHIP_TYPES)

export const VKGNodeSchema = z.object({
  id:              z.string().min(1),
  type:            NodeTypeSchema,
  label:           z.string().min(1),
  tenantId:        z.string().min(1),
  properties:      z.record(z.unknown()).default({}),
  createdAt:       z.string(),
  updatedAt:       z.string(),
  sourceWorkspace: z.string().optional(),
  embedding:       z.array(z.number()).optional(),
})

export const VKGEdgeSchema = z.object({
  id:         z.string().min(1),
  type:       RelationshipTypeSchema,
  sourceId:   z.string().min(1),
  targetId:   z.string().min(1),
  tenantId:   z.string().min(1),
  weight:     z.number().min(0).max(1).default(1),
  properties: z.record(z.unknown()).default({}),
  createdAt:  z.string(),
  inferred:   z.boolean().default(false),
})

export const VKGGraphSchema = z.object({
  nodes: z.array(VKGNodeSchema),
  edges: z.array(VKGEdgeSchema),
})

export const NodeQuerySchema = z.object({
  type:       NodeTypeSchema.optional(),
  tenantId:   z.string().optional(),
  labelLike:  z.string().optional(),
  properties: z.record(z.unknown()).optional(),
  limit:      z.number().int().positive().optional(),
})

export const EdgeQuerySchema = z.object({
  sourceId:  z.string().optional(),
  targetId:  z.string().optional(),
  type:      RelationshipTypeSchema.optional(),
  tenantId:  z.string().optional(),
  minWeight: z.number().min(0).max(1).optional(),
})

export const AddNodeInputSchema = VKGNodeSchema.omit({ createdAt:true, updatedAt:true })
export const CreateEdgeInputSchema = VKGEdgeSchema.omit({ createdAt:true })

export type AddNodeInput    = z.infer<typeof AddNodeInputSchema>
export type CreateEdgeInput = z.infer<typeof CreateEdgeInputSchema>
