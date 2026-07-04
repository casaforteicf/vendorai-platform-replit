// ─── ARQDOR AI Brain — Core Types ────────────────────────────────────────────
// All shared types for the orchestrator, specialists, and logging.
// No external dependencies — pure TypeScript.

export type SpecialistName =
  | "architecture"
  | "interior_design"
  | "lighting"
  | "materials"
  | "budget"
  | "visualization"
  | "presentation"
  | "manufacturer";

export type IntentCategory =
  | "space_planning"         // floor plans, layouts, ergonomics, flow
  | "interior_design"        // style, aesthetics, atmosphere, decor
  | "lighting_design"        // lighting schemes, fixtures, color temperature
  | "material_selection"     // finishes, textures, surfaces, coatings
  | "budget_estimation"      // cost, pricing, ROI, financial scope
  | "render_generation"      // renders, visualizations, prompt crafting
  | "presentation"           // memorials, reports, client communication
  | "manufacturer_sourcing"  // suppliers, brands, catalog, procurement
  | "general";               // catch-all — multiple or unclear intent

export interface SpecialistConfig {
  name:          SpecialistName;
  displayName:   string;
  description:   string;
  specialty:     string;
  objectives:    string[];
  restrictions:  string[];
  promptTemplate:string;
  priority:      number;        // 1 = highest; determines response ordering
  intentTriggers:IntentCategory[];
}

export interface OrchestrationContext {
  message:       string;
  projectContext:string;        // pre-assembled project data string (from DB)
  history:       Array<{ role: "user" | "assistant"; content: string }>;
  tenantId:      string;
  projectId?:    string;
}

export interface SpecialistContribution {
  specialist:  SpecialistName;
  displayName: string;
  section:     string;          // the prompt section this specialist contributes
  priority:    number;
}

export interface OrchestrationResult {
  reply:        string;
  actions:      Array<{ label: string; value: string; variant: "PRIMARY" | "SECONDARY" }>;
  intent:       IntentCategory;
  specialists:  SpecialistName[];
  provider:     string;
  model:        string;
  inputTokens:  number;
  outputTokens: number;
  costUsd:      number;
  durationMs:   number;
}

export interface OrchestratorLogEntry {
  messageId:   string;
  tenantId:    string;
  projectId?:  string;
  intent:      IntentCategory;
  specialists: SpecialistName[];
  inputTokens: number;
  outputTokens:number;
  costUsd:     number;
  durationMs:  number;
  timestamp:   Date;
}
