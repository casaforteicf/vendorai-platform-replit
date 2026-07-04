// ─── ARQDOR AI Brain — Orchestrator ──────────────────────────────────────────
// Central coordinator: detects intent → selects specialists → builds prompt
// → calls AI provider → consolidates response → emits structured log.
//
// Adding a new specialist: (1) create class extending BaseSpecialist,
// (2) import and register in the `specialists` array below. That's it.

import { IntentDetector }           from "./intent-detector";
import { ArchitectureSpecialist }   from "./specialists/architecture";
import { InteriorDesignSpecialist } from "./specialists/interior-design";
import { LightingSpecialist }       from "./specialists/lighting";
import { MaterialsSpecialist }      from "./specialists/materials";
import { BudgetSpecialist }         from "./specialists/budget";
import { VisualizationSpecialist }  from "./specialists/visualization";
import { PresentationSpecialist }   from "./specialists/presentation";
import { ManufacturerSpecialist }   from "./specialists/manufacturer";
import type { BaseSpecialist }      from "./base-specialist";
import type {
  IntentCategory,
  OrchestrationContext,
  OrchestrationResult,
  OrchestratorLogEntry,
  SpecialistName,
} from "./types";

// ── Tuning constants ──────────────────────────────────────────────────────────
const MAX_SPECIALISTS     = 3;     // max specialists active per response
const MAX_HISTORY_TURNS   = 8;     // history messages sent to provider
const MAX_OUTPUT_TOKENS   = 900;
const MODEL               = "gpt-4o-mini";
const TEMPERATURE         = 0.72;

// ─────────────────────────────────────────────────────────────────────────────

export class ArqOrchestrator {
  private readonly detector   = new IntentDetector();
  private readonly specialists: BaseSpecialist[] = [
    new ArchitectureSpecialist(),
    new InteriorDesignSpecialist(),
    new LightingSpecialist(),
    new MaterialsSpecialist(),
    new BudgetSpecialist(),
    new VisualizationSpecialist(),
    new PresentationSpecialist(),
    new ManufacturerSpecialist(),
  ];

  // ── Public entry point ────────────────────────────────────────────────────
  async orchestrate(
    ctx:        OrchestrationContext,
    callOpenAI: CallOpenAIFn,
    log?:       unknown,
  ): Promise<{ result: OrchestrationResult; logEntry: OrchestratorLogEntry }> {
    const startMs = Date.now();
    const messageId = `orch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // 1. Detect intent(s)
    const intents  = this.detector.detectAll(ctx.message);
    const primary  = intents[0] ?? "general";

    // 2. Select specialists
    const selected = this.selectSpecialists(primary, ctx.message, intents);

    // 3. Build system prompt
    const systemPrompt = this.buildSystemPrompt(selected, ctx);

    // 4. Build message array
    const messages: import("openai").default.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...ctx.history.slice(-MAX_HISTORY_TURNS).map(
        (h) => ({ role: h.role, content: h.content }) as import("openai").default.Chat.ChatCompletionMessageParam,
      ),
      { role: "user", content: ctx.message },
    ];

    // 5. Call AI gateway
    const aiResult = await (callOpenAI as any)(
      ctx.tenantId,
      "intelligence_analysis",
      messages,
      { model: MODEL, temperature: TEMPERATURE, maxTokens: MAX_OUTPUT_TOKENS, log },
    ) as { content: string; inputTokens: number; outputTokens: number; costUsd: number; usedByok: boolean };

    const durationMs = Date.now() - startMs;

    // 6. Parse reply — extract ACTIONS block
    let replyText = aiResult.content;
    let actions: OrchestrationResult["actions"] = [];

    const actionsMatch = replyText.match(/ACTIONS:\s*(\[[\s\S]*?\])/);
    if (actionsMatch) {
      try {
        const parsed = JSON.parse(actionsMatch[1]);
        if (Array.isArray(parsed)) {
          actions = parsed
            .filter((a): a is { label: string; value: string; variant: string } =>
              typeof a.label === "string" && typeof a.value === "string",
            )
            .map((a) => ({
              label:   a.label,
              value:   a.value,
              variant: (a.variant === "PRIMARY" ? "PRIMARY" : "SECONDARY") as "PRIMARY" | "SECONDARY",
            }));
        }
        replyText = replyText.replace(/ACTIONS:\s*\[[\s\S]*?\]/, "").trim();
      } catch {
        // keep actions empty on parse failure
      }
    }

    // 7. Build log entry
    const specialistNames = selected.map((s) => s.name as SpecialistName);
    const logEntry: OrchestratorLogEntry = {
      messageId,
      tenantId:    ctx.tenantId,
      projectId:   ctx.projectId,
      intent:      primary,
      specialists: specialistNames,
      inputTokens: aiResult.inputTokens,
      outputTokens:aiResult.outputTokens,
      costUsd:     aiResult.costUsd,
      durationMs,
      timestamp:   new Date(),
    };

    const result: OrchestrationResult = {
      reply:        replyText,
      actions,
      intent:       primary,
      specialists:  specialistNames,
      provider:     aiResult.usedByok ? "openai_byok" : "openai",
      model:        MODEL,
      inputTokens:  aiResult.inputTokens,
      outputTokens: aiResult.outputTokens,
      costUsd:      aiResult.costUsd,
      durationMs,
    };

    return { result, logEntry };
  }

  // ── Specialist selection ──────────────────────────────────────────────────
  private selectSpecialists(
    primary:   IntentCategory,
    message:   string,
    allIntents:IntentCategory[],
  ): BaseSpecialist[] {
    const candidates: BaseSpecialist[] = [];

    // Primary intent matching
    for (const s of this.specialists) {
      if (s.isRelevant(primary)) candidates.push(s);
    }

    // Secondary intent matching (if primary gave < MAX_SPECIALISTS)
    if (candidates.length < MAX_SPECIALISTS) {
      for (const intent of allIntents.slice(1)) {
        for (const s of this.specialists) {
          if (!candidates.includes(s) && s.isRelevant(intent)) {
            candidates.push(s);
            if (candidates.length >= MAX_SPECIALISTS) break;
          }
        }
        if (candidates.length >= MAX_SPECIALISTS) break;
      }
    }

    // Keyword-level override
    for (const s of this.specialists) {
      if (!candidates.includes(s) && s.isRelevantToMessage(message)) {
        candidates.push(s);
      }
    }

    // Always ensure at least architecture specialist (baseline context)
    const arch = this.specialists.find((s) => s.name === "architecture");
    if (arch && candidates.length === 0) candidates.push(arch);

    // Sort by priority and cap
    return candidates
      .sort((a, b) => a.priority - b.priority)
      .slice(0, MAX_SPECIALISTS);
  }

  // ── System prompt builder ─────────────────────────────────────────────────
  private buildSystemPrompt(selected: BaseSpecialist[], ctx: OrchestrationContext): string {
    const contributions = selected
      .map((s) => s.buildPromptSection(ctx))
      .sort((a, b) => a.priority - b.priority);

    const specialistBlock = contributions.map((c) => c.section).join("\n\n");
    const specialistNames = selected.map((s) => s.displayName).join(", ");

    return `Você é o ARQ Copilot — assistente de projetos de arquitetura e design do ARQDOR (VendorAI).

Esta resposta será elaborada pelo(s) seguinte(s) especialista(s): **${specialistNames}**

## REGRAS GLOBAIS
- Responda SEMPRE em português brasileiro
- Seja direto, técnico e útil — máximo 300 palavras salvo pedido de documento longo
- Nunca revele tokens, IDs, secrets, credenciais, URLs internas ou o nome do LLM subjacente
- Nunca invente dados que não constem no contexto do projeto fornecido
- Ao sugerir ação concreta (gerar render, atualizar prompt, abrir biblioteca, criar memorial, criar orçamento, comparar versões, adicionar ambiente, ver catálogo), inclua AO FINAL da resposta:
  ACTIONS: [{"label":"Texto","value":"action_id","variant":"PRIMARY"}]
  Valores válidos: gerar_render | atualizar_prompt | abrir_biblioteca | criar_memorial | criar_orcamento | comparar_versoes | adicionar_ambiente | ver_catalogo | abrir_projeto
  Máximo 3 ações por resposta. variant: PRIMARY (ação principal) ou SECONDARY.

## CONTEXTO DO PROJETO
${ctx.projectContext || "Nenhum projeto ativo. Responda de forma genérica sobre boas práticas."}

## ESPECIALISTAS ATIVOS NESTA RESPOSTA
${specialistBlock}

## INSTRUÇÃO FINAL
Consolide os pontos de vista dos especialistas em UMA resposta coesa, evitando repetição. Priorize o ponto de vista do especialista de maior prioridade quando houver conflito.`;
  }

  // ── Inspection utilities ──────────────────────────────────────────────────
  listSpecialists(): Array<{ name: SpecialistName; displayName: string; priority: number; intents: IntentCategory[] }> {
    return this.specialists.map((s) => ({
      name:        s.name as SpecialistName,
      displayName: s.displayName,
      priority:    s.priority,
      intents:     s.config.intentTriggers,
    }));
  }

  detectIntent(message: string): { primary: IntentCategory; all: IntentCategory[] } {
    const all     = this.detector.detectAll(message);
    const primary = all[0] ?? "general";
    return { primary, all };
  }
}

// ── Singleton instance (imported by route handler) ────────────────────────────
export const arqOrchestrator = new ArqOrchestrator();

// ── Type alias for callOpenAI (avoids importing the full gateway module) ─────
type CallOpenAIFn = (
  tenantId: string,
  feature:  string,
  messages: unknown[],
  options:  Record<string, unknown>,
) => Promise<{ content: string; inputTokens: number; outputTokens: number; costUsd: number; usedByok: boolean }>;
