---
name: Closer closing flow
description: How the Closer agent handles pricing questions and deal closure, including formal quote generation and contract data collection gate.
---

## Rules

### Pricing questions → formal quote (not text)
- When lead asks "quanto custa" or similar, Closer emits `{{action:generate_quote}}` (nothing else).
- Dispatch detects this action, calls `createQuoteFromCatalogPlan()` from `auto-quote.ts` using the first (most expensive) catalog plan.
- Catalog plans are fetched with `orderBy(desc(precoBase))` — Enterprise/most expensive always first.
- Response to lead: "Preparei o orçamento formal ORC-XXX para o plano Enterprise..."

**Why:** The LLM was listing prices as bullet points in chat, which is not a formal quote and bypasses the proposal tracking system.

**How to apply:** Any change to pricing presentation in the Closer must go through `{{action:generate_quote}}` → `createQuoteFromCatalogPlan`. Never instruct the Closer to write prices in text.

### Deal closure → contract data collection gate
- When Closer emits `{{action:proposal_accept}}`, dispatch calls `getMissingContractFields(ctx.lead)` first.
- Required fields: `email`, `documento`, `endereco`, `representanteCargo`, `representanteNacionalidade`, `representanteEstadoCivil`, `representanteProfissao`, `representanteRg`.
- If any fields are missing: sets `lead.discoveryData.pendingProposalAccept = true`, returns message asking for first missing field. Does NOT call `proposalAccepted()`.
- On subsequent closer turns: `pendingProposalAccept === true` → injects `collectContractData` scenario into prompt; dispatch calls `extractAndSaveContractFields()` (synchronous) after LLM response.
- When all fields present: calls `proposalAccepted()`, clears the flag, overrides response with success message.

**Why:** The Closer was saying "vou iniciar o processo de contratação" after receiving only an email, without collecting the fields required by the ZapSign contract template.

**How to apply:** Adding a new required contract field = add it to `CONTRACT_REQUIRED_FIELDS` array and `CONTRACT_FIELD_PROMPTS` map in `agent-dispatch.ts`. No DB migration needed — uses `discoveryData` JSONB for state.

## Key files
- `artifacts/api-server/src/services/agent-dispatch.ts` — `CONTRACT_REQUIRED_FIELDS`, `getMissingContractFields`, `extractAndSaveContractFields`, sections 8a/8b/8c
- `artifacts/api-server/src/services/auto-quote.ts` — `createQuoteFromCatalogPlan`
- `artifacts/api-server/src/lib/agent-engine.ts` — `buildCloserPrompt` (scenario: `collectContractData`, action rules)
