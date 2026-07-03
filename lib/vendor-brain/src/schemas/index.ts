// ─── Vendor Brain — Zod Schemas ───────────────────────────────────────────────

import { z } from 'zod'
import { INTENT_TYPES, AGENT_TYPES } from '../types'

export const IntentTypeSchema  = z.enum(INTENT_TYPES)
export const AgentTypeSchema   = z.enum(AGENT_TYPES)

export const PlanStatusSchema  = z.enum(['PENDING','RUNNING','PAUSED','COMPLETED','FAILED','CANCELLED'])
export const StepStatusSchema  = z.enum(['WAITING','READY','RUNNING','COMPLETED','FAILED','SKIPPED'])
export const DecisionTypeSchema = z.enum(['AGENT_SELECTION','ROUTE_SELECTION','PARAMETER_CHOICE','FALLBACK','ABORT'])

export const IntentEntitySchema = z.object({
  kind:  z.enum(['project','material','agent','workspace','date','amount','other']),
  value: z.string(),
  start: z.number(),
  end:   z.number(),
})

export const IntentSchema = z.object({
  id:         z.string(),
  type:       IntentTypeSchema,
  raw:        z.string(),
  entities:   z.array(IntentEntitySchema).default([]),
  confidence: z.number().min(0).max(1),
  tenantId:   z.string(),
  userId:     z.string(),
  createdAt:  z.string(),
})

export const PlanStepSchema = z.object({
  id:            z.string(),
  planId:        z.string(),
  sequence:      z.number().int().nonnegative(),
  label:         z.string(),
  description:   z.string(),
  agentType:     AgentTypeSchema,
  status:        StepStatusSchema.default('WAITING'),
  dependsOn:     z.array(z.string()).default([]),
  estimatedMs:   z.number().default(1000),
  startedAt:     z.string().optional(),
  completedAt:   z.string().optional(),
  output:        z.unknown().optional(),
  error:         z.string().optional(),
})

export const ExecutionPlanSchema = z.object({
  id:           z.string(),
  intentId:     z.string(),
  tenantId:     z.string(),
  goal:         z.string(),
  steps:        z.array(PlanStepSchema),
  status:       PlanStatusSchema.default('PENDING'),
  confidence:   z.number().min(0).max(1),
  estimatedMs:  z.number().default(5000),
  createdAt:    z.string(),
  startedAt:    z.string().optional(),
  completedAt:  z.string().optional(),
})

export const DecisionAlternativeSchema = z.object({
  option:     z.string(),
  confidence: z.number(),
  reason:     z.string(),
})

export const DecisionRecordSchema = z.object({
  id:           z.string(),
  planId:       z.string(),
  stepId:       z.string().optional(),
  type:         DecisionTypeSchema,
  question:     z.string(),
  chosen:       z.string(),
  alternatives: z.array(DecisionAlternativeSchema),
  reason:       z.string(),
  context:      z.record(z.unknown()),
  confidence:   z.number(),
  dataUsed:     z.array(z.string()),
  createdAt:    z.string(),
})
