// ─── ARQDOR AI Brain — Public API ─────────────────────────────────────────────
// Import from this barrel to avoid deep internal imports.

export { ArqOrchestrator, arqOrchestrator } from "./orchestrator";
export { BaseSpecialist }                   from "./base-specialist";
export { IntentDetector }                   from "./intent-detector";

export type {
  SpecialistName,
  IntentCategory,
  SpecialistConfig,
  OrchestrationContext,
  OrchestrationResult,
  OrchestratorLogEntry,
  SpecialistContribution,
} from "./types";
