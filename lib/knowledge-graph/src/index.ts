// ─── @workspace/knowledge-graph — Public API ──────────────────────────────────
// FASE 18 — Vendor Knowledge Graph (VKG)
// All workspaces share one graph. Pure logic, no DB, no LLM.
// DDD, SOLID, fully decoupled from framework.

// Core types
export type {
  VKGNode, VKGEdge, VKGGraph,
  NodeType, RelationshipType,
  NodeQuery, EdgeQuery,
  TraversalResult, TraversalOptions,
  NodeFrequency, RelationshipPattern,
  InferenceResult, Recommendation,
  MemoryEvent, SearchResult,
} from './types'

export { NODE_TYPES, RELATIONSHIP_TYPES } from './types'

// Taxonomy
export type { NodeTypeMeta, RelationshipMeta } from './taxonomy'
export { NODE_TAXONOMY, RELATIONSHIP_TAXONOMY, DOMAIN_COLORS } from './taxonomy'

// Schemas (Zod)
export {
  NodeTypeSchema, RelationshipTypeSchema,
  VKGNodeSchema, VKGEdgeSchema, VKGGraphSchema,
  NodeQuerySchema, EdgeQuerySchema,
  AddNodeInputSchema, CreateEdgeInputSchema,
} from './schemas'
export type { AddNodeInput, CreateEdgeInput } from './schemas'

// Engines — interfaces
export type { INodeEngine }         from './engines/node-engine'
export type { IRelationshipEngine } from './engines/relationship-engine'
export type { ISearchEngine }       from './engines/search-engine'
export type { IRecommendationEngine } from './engines/recommendation-engine'
export type { IInferenceEngine }    from './engines/inference-engine'
export type { IMemoryEngine }       from './engines/memory-engine'

// Engines — implementations
export { InMemoryNodeEngine, nodeId }               from './engines/node-engine'
export { InMemoryRelationshipEngine }               from './engines/relationship-engine'
export { GraphEngine }                              from './engines/graph-engine'
export { KeywordSearchEngine }                      from './engines/search-engine'
export { AnalyticsEngine }                          from './engines/analytics-engine'
export { PatternInferenceEngine }                   from './engines/inference-engine'
export { GraphRecommendationEngine }                from './engines/recommendation-engine'
export { InMemoryMemoryEngine }                     from './engines/memory-engine'

// ─── VKG Singleton factory ────────────────────────────────────────────────────
// Convenience: creates a fully wired VKG instance with all engines.

import { GraphEngine }               from './engines/graph-engine'
import { KeywordSearchEngine }        from './engines/search-engine'
import { AnalyticsEngine }            from './engines/analytics-engine'
import { PatternInferenceEngine }     from './engines/inference-engine'
import { GraphRecommendationEngine }  from './engines/recommendation-engine'
import { InMemoryMemoryEngine }       from './engines/memory-engine'

export interface VKGInstance {
  graph:          GraphEngine
  search:         KeywordSearchEngine
  analytics:      AnalyticsEngine
  inference:      PatternInferenceEngine
  recommendations: GraphRecommendationEngine
  memory:         InMemoryMemoryEngine
}

export function createVKG(): VKGInstance {
  const graph           = new GraphEngine()
  const search          = new KeywordSearchEngine(graph.nodes)
  const analytics       = new AnalyticsEngine(graph.nodes, graph.edges)
  const inference       = new PatternInferenceEngine(graph.nodes, graph.edges)
  const recommendations = new GraphRecommendationEngine(graph.nodes, graph.edges)
  const memory          = new InMemoryMemoryEngine()

  return { graph, search, analytics, inference, recommendations, memory }
}
