// ─── Vendor Knowledge Graph — Core Types ────────────────────────────────────
// DDD: domain types are the single source of truth.
// No framework deps — pure TypeScript interfaces.

// ─── Node types ───────────────────────────────────────────────────────────────

export const NODE_TYPES = [
  'User', 'Tenant', 'Workspace', 'Project', 'Environment',
  'Object', 'Material', 'Component', 'Manufacturer', 'Supplier',
  'Brand', 'Customer', 'Lead', 'Deal', 'Proposal',
  'Workflow', 'Task', 'Document', 'Asset', 'Prompt',
  'Render', 'Review', 'DNA', 'Style', 'Moodboard',
  'Budget', 'Purchase', 'Construction', 'Agent', 'Knowledge',
] as const

export type NodeType = typeof NODE_TYPES[number]

// ─── Relationship types ───────────────────────────────────────────────────────

export const RELATIONSHIP_TYPES = [
  'USES', 'CONTAINS', 'PART_OF', 'RELATED_TO', 'SIMILAR_TO',
  'GENERATED_BY', 'APPROVED_BY', 'PURCHASED_FROM', 'RENDERED_WITH',
  'CONNECTED_TO', 'LOCATED_IN', 'BELONGS_TO', 'CREATED_BY',
  'UPDATED_BY', 'REFERENCES', 'INSTALLED_BY', 'ASSOCIATED_WITH',
  'INFLUENCED_BY', 'FOLLOWS', 'TRIGGERS',
] as const

export type RelationshipType = typeof RELATIONSHIP_TYPES[number]

// ─── Node ─────────────────────────────────────────────────────────────────────

export interface VKGNode {
  /** Unique identifier (UUID or tenant-scoped external ID) */
  id:         string
  type:       NodeType
  label:      string
  tenantId:   string
  /** Arbitrary domain-specific properties */
  properties: Record<string, unknown>
  /** ISO timestamp */
  createdAt:  string
  updatedAt:  string
  /** Source workspace that generated this node */
  sourceWorkspace?: string
  /** Embedding vector — populated by search-engine when semantic indexing is enabled */
  embedding?: number[]
}

// ─── Edge ─────────────────────────────────────────────────────────────────────

export interface VKGEdge {
  id:               string
  type:             RelationshipType
  sourceId:         string
  targetId:         string
  tenantId:         string
  weight:           number        // 0-1, confidence / strength of relationship
  properties:       Record<string, unknown>
  createdAt:        string
  /** True when this edge was inferred, not explicitly created */
  inferred:         boolean
}

// ─── Graph snapshot ───────────────────────────────────────────────────────────

export interface VKGGraph {
  nodes: VKGNode[]
  edges: VKGEdge[]
}

// ─── Query API ────────────────────────────────────────────────────────────────

export interface NodeQuery {
  type?:        NodeType
  tenantId?:    string
  labelLike?:   string
  properties?:  Record<string, unknown>
  limit?:       number
}

export interface EdgeQuery {
  sourceId?:    string
  targetId?:    string
  type?:        RelationshipType
  tenantId?:    string
  minWeight?:   number
}

// ─── Traversal ────────────────────────────────────────────────────────────────

export interface TraversalResult {
  node:  VKGNode
  edge:  VKGEdge
  depth: number
}

export interface TraversalOptions {
  maxDepth?:         number
  relationshipTypes?: RelationshipType[]
  direction?:        'outbound' | 'inbound' | 'both'
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface NodeFrequency {
  nodeId: string
  label:  string
  type:   NodeType
  count:  number
}

export interface RelationshipPattern {
  fromType: NodeType
  toType:   NodeType
  relation: RelationshipType
  count:    number
  avgWeight: number
}

// ─── Inference ────────────────────────────────────────────────────────────────

export interface InferenceResult {
  pattern:    string
  confidence: number
  examples:   string[]
  insight:    string
}

// ─── Recommendation ──────────────────────────────────────────────────────────

export interface Recommendation {
  targetNode:  VKGNode
  reason:      string
  confidence:  number
  sourceNodes: string[]
}

// ─── Memory event ─────────────────────────────────────────────────────────────

export interface MemoryEvent {
  id:          string
  tenantId:    string
  userId:      string
  eventType:   string
  nodeIds:     string[]
  edgeIds:     string[]
  context:     Record<string, unknown>
  occurredAt:  string
}

// ─── Search result ────────────────────────────────────────────────────────────

export interface SearchResult {
  node:       VKGNode
  score:      number
  highlights: string[]
}
