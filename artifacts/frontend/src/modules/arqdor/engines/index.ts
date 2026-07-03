// ─── Engines barrel ───────────────────────────────────────────────────────────
// All domain engines are accessible via this barrel.
// Engines are pure functions — no React, no network, no state.

export { generateCorePrompt, generateProjectPrompt, generateObjectPrompt,
  generateRulePrompt, generateDNAPrompt, generateRenderPrompt,
  generateNegativePrompt, generateFinalPrompt, generateFullPromptStructure,
  generateObjectFragment,
} from '../../../pages/arch/arqdor/domain/arqdor-prompt-engine'

export { evaluateObjectRules, getDefaultRulesForCategory, evaluateAllObjects,
} from '../../../pages/arch/arqdor/domain/arqdor-rules-engine'

export { validateProject, validationSummary,
} from '../../../pages/arch/arqdor/domain/arqdor-validation-engine'

export { calculateMockRenderScore, scoreColor, scoreLabel, SCORE_DIMENSIONS,
} from '../../../pages/arch/arqdor/domain/arqdor-score-engine'

export { createRelationship, getObjectRelationships, getRelatedObjects,
  buildObjectLookup, getAllObjects, getChildren, RELATIONSHIP_LABELS, RELATIONSHIP_ICONS,
} from '../../../pages/arch/arqdor/domain/arqdor-relationships'
