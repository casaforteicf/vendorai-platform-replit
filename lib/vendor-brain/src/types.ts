// ─── Vendor Brain — Core Domain Types ─────────────────────────────────────────
// Cognitive Operating System: intent → context → plan → route → execute.
// No LLM yet — pure architecture contracts for FASE 19.

// ─── Intent ───────────────────────────────────────────────────────────────────

export const INTENT_TYPES = [
  'CREATE_PROJECT', 'GENERATE_RENDER', 'REVIEW_RENDER', 'GENERATE_MEMORIAL',
  'CREATE_CAMPAIGN', 'CREATE_WORKFLOW', 'CONSULT_CRM', 'COMPARE_PROJECTS',
  'PURCHASE_COMPONENTS', 'CREATE_PROPOSAL', 'ANALYZE_PROJECT', 'SEARCH_KNOWLEDGE',
  'CREATE_LEAD', 'SEND_MESSAGE', 'UPDATE_STATUS', 'GENERATE_REPORT',
  'ONBOARD_CLIENT', 'SCHEDULE_MEETING', 'EXPORT_DOCUMENT', 'UNKNOWN',
] as const

export type IntentType = typeof INTENT_TYPES[number]

export interface Intent {
  id:         string
  type:       IntentType
  raw:        string          // original user request text
  entities:   IntentEntity[]  // extracted entities (project name, material, etc.)
  confidence: number          // 0-1
  tenantId:   string
  userId:     string
  createdAt:  string
}

export interface IntentEntity {
  kind:  'project' | 'material' | 'agent' | 'workspace' | 'date' | 'amount' | 'other'
  value: string
  start: number
  end:   number
}

// ─── Context ──────────────────────────────────────────────────────────────────

export interface BrainContext {
  tenantId:   string
  userId:     string
  userRole:   string
  vertical?:  string
  workspace?: string
  projectId?: string
  clientId?:  string
  leadId?:    string
  dealId?:    string
  /** Snapshot of relevant knowledge graph nodes */
  kgNodes?:   KGNodeRef[]
  /** Active agent configs */
  agents?:    AgentRef[]
  /** User permissions */
  permissions: string[]
  assembledAt: string
}

export interface KGNodeRef {
  id:    string
  type:  string
  label: string
}

export interface AgentRef {
  id:    string
  type:  AgentType
  name:  string
  model: string
}

// ─── Agent types ──────────────────────────────────────────────────────────────

export const AGENT_TYPES = [
  'ARCHITECT_AI', 'RENDER_AI', 'BUYER_AI', 'MARKETING_AI', 'CRM_AI',
  'FINANCIAL_AI', 'CONSTRUCTION_AI', 'KNOWLEDGE_AI', 'ORCHESTRATOR',
] as const

export type AgentType = typeof AGENT_TYPES[number]

// ─── Plan ─────────────────────────────────────────────────────────────────────

export interface ExecutionPlan {
  id:          string
  intentId:    string
  tenantId:    string
  goal:        string
  steps:       PlanStep[]
  status:      PlanStatus
  confidence:  number
  estimatedMs: number
  createdAt:   string
  startedAt?:  string
  completedAt?: string
  result?:     PlanResult
}

export type PlanStatus = 'PENDING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

export interface PlanStep {
  id:            string
  planId:        string
  sequence:      number
  label:         string
  description:   string
  agentType:     AgentType
  status:        StepStatus
  dependsOn:     string[]    // step ids
  inputSchema?:  string      // JSON schema ref
  outputSchema?: string
  estimatedMs:   number
  startedAt?:    string
  completedAt?:  string
  output?:       unknown
  error?:        string
}

export type StepStatus = 'WAITING' | 'READY' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED'

export interface PlanResult {
  success:  boolean
  summary:  string
  outputs:  Record<string, unknown>
  duration: number
}

// ─── Routing ──────────────────────────────────────────────────────────────────

export interface RoutingDecision {
  stepId:     string
  agentType:  AgentType
  agentId?:   string         // specific agent instance
  reason:     string
  confidence: number
  alternatives: AgentType[]
}

// ─── Decision ─────────────────────────────────────────────────────────────────

export interface DecisionRecord {
  id:           string
  planId:       string
  stepId?:      string
  type:         DecisionType
  question:     string
  chosen:       string
  alternatives: DecisionAlternative[]
  reason:       string
  context:      Record<string, unknown>
  confidence:   number
  dataUsed:     string[]     // sources/node IDs consulted
  createdAt:    string
}

export type DecisionType = 'AGENT_SELECTION' | 'ROUTE_SELECTION' | 'PARAMETER_CHOICE' | 'FALLBACK' | 'ABORT'

export interface DecisionAlternative {
  option:     string
  confidence: number
  reason:     string
}

// ─── Reasoning ────────────────────────────────────────────────────────────────

export interface ReasoningChain {
  id:          string
  planId:      string
  stepId?:     string
  premises:    Premise[]
  rulesApplied: Rule[]
  sourcesUsed: string[]
  justification: string
  conclusion:  string
  createdAt:   string
}

export interface Premise {
  id:      string
  text:    string
  source:  string
  weight:  number
}

export interface Rule {
  id:    string
  name:  string
  text:  string
  domain: string
}

// ─── Explanation ──────────────────────────────────────────────────────────────

export interface Explanation {
  questionText: string
  answer:       string
  sources:      ExplanationSource[]
  confidence:   number
  generatedAt:  string
}

export interface ExplanationSource {
  type:  'knowledge_graph' | 'project' | 'history' | 'policy' | 'agent'
  id:    string
  label: string
  relevance: number
}

// ─── Task graph ───────────────────────────────────────────────────────────────

export interface TaskGraph {
  goalId:   string
  goal:     string
  nodes:    TaskNode[]
  edges:    TaskEdge[]
}

export interface TaskNode {
  id:        string
  label:     string
  type:      'goal' | 'task' | 'decision' | 'output'
  status:    StepStatus
  agentType?: AgentType
}

export interface TaskEdge {
  from:  string
  to:    string
  label?: string
}

// ─── Observability ────────────────────────────────────────────────────────────

export interface ObservabilityRecord {
  id:          string
  tenantId:    string
  userId:      string
  intentId:    string
  planId:      string
  agentsUsed:  AgentType[]
  startedAt:   string
  completedAt?: string
  durationMs?: number
  success:     boolean
  error?:      string
  metadata:    Record<string, unknown>
}

// ─── Brain Memory ─────────────────────────────────────────────────────────────

export interface BrainMemoryEvent {
  id:          string
  tenantId:    string
  userId:      string
  goal:        string
  planId?:     string
  result?:     string
  learnings:   string[]
  occurredAt:  string
}
