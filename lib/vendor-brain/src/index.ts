// ─── @workspace/vendor-brain — Public API ─────────────────────────────────────
// FASE 19 — Vendor Brain: Cognitive Operating System
// Interprets goals → assembles context → plans → routes → orchestrates.
// No LLM yet. DDD, SOLID, fully decoupled.

// Core types
export type {
  IntentType, Intent, IntentEntity,
  BrainContext, KGNodeRef, AgentRef, AgentType,
  ExecutionPlan, PlanStep, PlanStatus, StepStatus, PlanResult,
  RoutingDecision, DecisionRecord, DecisionType, DecisionAlternative,
  ReasoningChain, Premise, Rule,
  Explanation, ExplanationSource,
  TaskGraph, TaskNode, TaskEdge,
  ObservabilityRecord, BrainMemoryEvent,
} from './types'

export { INTENT_TYPES, AGENT_TYPES } from './types'
export { resolveBrainVerticalProfile } from './vertical-profiles'
export type { BrainVerticalProfile } from './vertical-profiles'

// Platform foundation — modules, agents, skills, channels and vertical blueprints
export {
  MODULE_REGISTRY,
  AGENT_REGISTRY,
  SKILL_REGISTRY,
  CHANNEL_REGISTRY,
  DEFAULT_MARKETING_AGENT_AUTONOMY,
  getModuleDefinition,
  getAgentDefinition,
  getChannelDefinition,
} from './platform-foundation'
export type {
  CapabilityStatus,
  ModuleId,
  ModuleDefinition,
  SkillId,
  SkillDefinition,
  ChannelId,
  ChannelDefinition,
  AgentId,
  AgentDefinition,
  MarketingAgentContext,
  MarketingAgentAutonomy,
} from './platform-foundation'

export {
  CHANNEL_PUBLICATION_CAPABILITIES,
  getChannelPublicationCapability,
  assertChannelCanPublish,
} from './channel-publication'
export type {
  ChannelPublicationMode,
  ChannelPublicationCapability,
} from './channel-publication'

export {
  VERTICAL_BLUEPRINT_REGISTRY,
  DISTRIBUTOR_BLUEPRINT,
  CONSTRUCTION_BLUEPRINT,
  defineVerticalBlueprint,
  mergeVerticalBlueprint,
  getVerticalBlueprint,
} from './vertical-blueprint'
export type {
  VerticalBlueprint,
  VerticalNavigationItem,
  VerticalKpiDefinition,
  VerticalMarketingBlueprint,
  VerticalIntelligenceBlueprint,
} from './vertical-blueprint'

export { resolveMarketingAgentPlan, getMarketingContextDescription } from './marketing-agent'
export type { MarketingAgentRuntimeContext, MarketingAgentPlan } from './marketing-agent'
export { MarketingPageContextSource, toMarketingAgentRuntimeContext } from './marketing-context'
export type { MarketingPageContext } from './marketing-context'
export { resolveMarketingRuntime, resolveMarketingSignalDecision } from './marketing-runtime'
export type { MarketingCampaignContextInput, MarketingRuntimeResult } from './marketing-runtime'
export { inferMarketingSurface, buildMarketingAgentUiCard } from './marketing-agent-ui'
export type { MarketingSurface, MarketingAgentUiCard } from './marketing-agent-ui'
export { getChannelAdaptation, CHANNEL_ADAPTATIONS } from './channel-adapters'
export type { ChannelAdaptation } from './channel-adapters'
export { calculateDesignQaScore, validateCreativeBrief } from './creative-design'
export type { BrandProfile, CreativeBrief, DesignQaResult } from './creative-design'
export { resolveBrandProfileFromBusinessSource, buildCreativeExecutionPlan, finalizeDesignQa } from './creative-runtime'
export type { BusinessBrandSource, CreativeExecutionPlan, DesignQaInput } from './creative-runtime'
export { buildWebCreativeRuntime, getWebCreativeGuidance } from './web-runtime'
export type { WebSurface, WebCreativeGuidance, WebCreativeRuntime } from './web-runtime'
export { routeSignal, routeSignals } from './intelligence-routing'
export type { BusinessSignal, SignalDomain, OpportunityTarget, RoutedOpportunity } from './intelligence-routing'
export { revenueScoutOpportunityToSignal, resolveRevenueScoutDecision } from './revenue-scout-bridge'
export type { RevenueScoutSignalKind, RevenueScoutOpportunityLike } from './revenue-scout-bridge'
export { buildBusinessObserverSnapshot } from './business-observer'
export type { BusinessObserverSnapshot } from './business-observer'
export { buildBusinessAgentExecutiveBrief } from './business-agent'
export type { ExecutivePriority, BusinessAgentExecutiveBrief } from './business-agent'

// Schemas
export {
  IntentTypeSchema, AgentTypeSchema,
  PlanStatusSchema, StepStatusSchema, DecisionTypeSchema,
  IntentSchema, PlanStepSchema, ExecutionPlanSchema, DecisionRecordSchema,
} from './schemas'

// Engines — interfaces
export type { IIntentEngine }          from './engines/intent-engine'
export type { IContextEngine, ContextSource } from './engines/context-engine'
export type { IPlanningEngine }        from './engines/planning-engine'
export type { IRoutingEngine }         from './engines/routing-engine'
export type { IDecisionEngine }        from './engines/decision-engine'
export type { IOrchestrationEngine }   from './engines/orchestration-engine'
export type { IReasoningEngine }       from './engines/reasoning-engine'
export type { IExplanationEngine }     from './engines/explanation-engine'
export type { IBrainMemoryEngine }     from './engines/memory-engine'
export type { IExecutionEngine, ExecutionRequest, ExecutionResponse } from './engines/execution-engine'
export type { IObservabilityEngine, ObservabilityStats } from './engines/observability-engine'

// Engines — implementations
export { KeywordIntentEngine }         from './engines/intent-engine'
export { ContextEngine, StaticContextSource, KGContextSource, AgentRegistryContextSource, createContextEngine } from './engines/context-engine'
export { TemplatePlanningEngine }      from './engines/planning-engine'
export { RuleBasedRoutingEngine }      from './engines/routing-engine'
export { InMemoryDecisionEngine }      from './engines/decision-engine'
export { InMemoryOrchestrationEngine } from './engines/orchestration-engine'
export { InMemoryReasoningEngine, DOMAIN_RULES } from './engines/reasoning-engine'
export { TemplateExplanationEngine }   from './engines/explanation-engine'
export type { CannedExplanationKey }   from './engines/explanation-engine'
export { InMemoryBrainMemoryEngine }   from './engines/memory-engine'
export { MockedExecutionEngine }       from './engines/execution-engine'
export { InMemoryObservabilityEngine } from './engines/observability-engine'

// Policies
export type { PolicyViolation, PolicyResult, IBrainPolicy } from './policies'
export { TenantIsolationPolicy, PermissionPolicy, MinConfidencePolicy, PolicyRunner, createDefaultPolicies } from './policies'

// ─── VendorBrain singleton factory ────────────────────────────────────────────

import { KeywordIntentEngine }         from './engines/intent-engine'
import { ContextEngine }               from './engines/context-engine'
import { TemplatePlanningEngine }      from './engines/planning-engine'
import { RuleBasedRoutingEngine }      from './engines/routing-engine'
import { InMemoryDecisionEngine }      from './engines/decision-engine'
import { InMemoryOrchestrationEngine } from './engines/orchestration-engine'
import { InMemoryReasoningEngine }     from './engines/reasoning-engine'
import { TemplateExplanationEngine }   from './engines/explanation-engine'
import { InMemoryBrainMemoryEngine }   from './engines/memory-engine'
import { MockedExecutionEngine }       from './engines/execution-engine'
import { InMemoryObservabilityEngine } from './engines/observability-engine'
import { createDefaultPolicies }       from './policies'
import type { Intent, BrainContext, ExecutionPlan } from './types'

export interface VendorBrainInstance {
  intent:        KeywordIntentEngine
  context:       ContextEngine
  planning:      TemplatePlanningEngine
  routing:       RuleBasedRoutingEngine
  decision:      InMemoryDecisionEngine
  orchestration: InMemoryOrchestrationEngine
  reasoning:     InMemoryReasoningEngine
  explanation:   TemplateExplanationEngine
  memory:        InMemoryBrainMemoryEngine
  execution:     MockedExecutionEngine
  observability: InMemoryObservabilityEngine
  policies:      ReturnType<typeof createDefaultPolicies>

  /** High-level: classify → plan → route → simulate */
  think(raw: string, tenantId: string, userId: string, options?: { vertical?: string }): Promise<{
    intent:  Intent
    context: BrainContext
    plan:    ExecutionPlan
    allowed: boolean
    violations: import('./policies').PolicyViolation[]
  }>
}

export function createVendorBrain(): VendorBrainInstance {
  const intent        = new KeywordIntentEngine()
  const context       = new ContextEngine()
  const planning      = new TemplatePlanningEngine()
  const routing       = new RuleBasedRoutingEngine()
  const decision      = new InMemoryDecisionEngine()
  const orchestration = new InMemoryOrchestrationEngine()
  const reasoning     = new InMemoryReasoningEngine()
  const explanation   = new TemplateExplanationEngine()
  const memory        = new InMemoryBrainMemoryEngine()
  const execution     = new MockedExecutionEngine()
  const observability = new InMemoryObservabilityEngine()
  const policies      = createDefaultPolicies()

  async function think(raw: string, tenantId: string, userId: string, options?: { vertical?: string }) {
    const classifiedIntent = intent.classify(raw, tenantId, userId)
    const ctx              = await context.assemble(tenantId, userId)
    ctx.vertical           = options?.vertical
    const plan             = planning.plan(classifiedIntent, ctx)
    const policyResult     = policies.runAll(ctx, plan)

    decision.record(InMemoryDecisionEngine.routeSelection(
      plan.id,
      plan.steps.map(s => s.label).join(' → '),
      [],
      `Template selecionado para intent ${classifiedIntent.type} com confiança ${(classifiedIntent.confidence * 100).toFixed(0)}%`,
    ))

    return { intent: classifiedIntent, context: ctx, plan, allowed: policyResult.allowed, violations: policyResult.violations }
  }

  return {
    intent, context, planning, routing, decision,
    orchestration, reasoning, explanation, memory,
    execution, observability, policies, think,
  }
}
