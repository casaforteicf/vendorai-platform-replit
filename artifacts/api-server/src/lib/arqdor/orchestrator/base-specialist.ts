// ─── ARQDOR AI Brain — Base Specialist ────────────────────────────────────────
// All specialists extend this abstract class.
// Subclasses only need to implement `config` — everything else is inherited.

import type { IntentCategory, OrchestrationContext, SpecialistConfig, SpecialistContribution } from "./types";

export abstract class BaseSpecialist {
  abstract readonly config: SpecialistConfig;

  // Whether this specialist should participate for a given intent
  isRelevant(intent: IntentCategory): boolean {
    return this.config.intentTriggers.includes(intent);
  }

  // Keyword-level override: subclasses may refine relevance based on raw message
  isRelevantToMessage(_message: string): boolean {
    return false;
  }

  // Build the prompt section this specialist contributes to the system prompt
  buildPromptSection(ctx: OrchestrationContext): SpecialistContribution {
    const filled = this.config.promptTemplate
      .replace("{{PROJECT_CONTEXT}}", ctx.projectContext || "Nenhum projeto ativo")
      .replace("{{OBJECTIVES}}", this.config.objectives.join("; "))
      .replace("{{RESTRICTIONS}}", this.config.restrictions.join("; "));

    return {
      specialist:  this.config.name,
      displayName: this.config.displayName,
      section:     `### ${this.config.displayName} (${this.config.specialty})\n${filled}`,
      priority:    this.config.priority,
    };
  }

  get name(): string { return this.config.name; }
  get displayName(): string { return this.config.displayName; }
  get priority(): number { return this.config.priority; }
}
