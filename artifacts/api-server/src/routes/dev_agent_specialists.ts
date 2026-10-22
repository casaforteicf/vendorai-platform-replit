import { Router } from "express";
import { z } from "zod/v4";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import memoryRouter, { loadEngineeringMemory, recordEngineeringMemory } from "./dev_agent_memory";
import impactRouter, { analyzeChangeImpact } from "./dev_agent_impact";
import recoveryRouter from "./dev_agent_recovery";
import diagnosticsRouter from "./dev_agent_diagnostics";
import qualityRouter from "./dev_agent_quality";

const router = Router();
router.use(memoryRouter);
router.use(impactRouter);
router.use(recoveryRouter);
router.use(diagnosticsRouter);
router.use(qualityRouter);

const councilSchema = z.object({
  requestId: z.string().min(1).max(120),
  request: z.string().min(1).max(12000),
  route: z.string().min(1).max(500),
  evidenceContext: z.string().max(24000).optional().default(""),
});

export type SpecialistOpinion = {
  specialist: "frontend_ux" | "backend_api" | "data_multitenant" | "integrations_devops" | "security_reliability";
  relevant: boolean;
  confidence: number;
  observations: string[];
  risks: string[];
  recommendations: string[];
  validation: string[];
};

export type SpecialistCouncil = {
  primary: SpecialistOpinion["specialist"];
  consulted: SpecialistOpinion["specialist"][];
  opinions: SpecialistOpinion[];
  consensus: string;
  conflicts: string[];
  recommendedValidationCommands: string[];
  confidence: number;
};

const COUNCIL_PROMPT = `Você é o Conselho de Especialistas de Engenharia do VendorAI.
Analise o pedido e as evidências reais fornecidas. Não execute código.

Há cinco especialistas independentes:
1. frontend_ux — React/Vite, UX, responsividade, acessibilidade, estado de UI;
2. backend_api — Express, contratos de API, erros, concorrência e observabilidade;
3. data_multitenant — PostgreSQL/Supabase/Drizzle, isolamento de tenant, RLS e consistência;
4. integrations_devops — webhooks, OAuth, terceiros, deploy e runtime;
5. security_reliability — auth, permissões, segredos, abuso, rollback e resiliência.

Você pode receber engineeringMemory: decisões anteriores resumidas. Use como histórico, nunca como verdade absoluta; evidência atual prevalece.
Você também recebe impactGraph quando disponível: arquivos-semente, imports, referências, domínios afetados, blast radius e sinais de risco. Trate-o como evidência estrutural do repositório.
Cada especialista deve dizer se é relevante. Não invente fatos, arquivos, logs ou testes executados.
Quando a evidência não sustentar uma conclusão, registre a incerteza.
Preserve arquitetura existente e não proponha módulos paralelos.

Comandos de validação disponíveis no repositório e que podem ser RECOMENDADOS, mas nunca alegados como executados sem evidência:
- pnpm run typecheck
- pnpm --filter @workspace/frontend test
- pnpm --filter @workspace/api-server test
- pnpm --filter @workspace/api-server audit:tenant:strict

Retorne SOMENTE JSON no formato:
{
  "primary":"frontend_ux|backend_api|data_multitenant|integrations_devops|security_reliability",
  "consulted":[],
  "opinions":[{
    "specialist":"...",
    "relevant":true,
    "confidence":0.0,
    "observations":[],
    "risks":[],
    "recommendations":[],
    "validation":[]
  }],
  "consensus":"...",
  "conflicts":[],
  "recommendedValidationCommands":[],
  "confidence":0.0
}`;

function parseJson(text: string) {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Resposta JSON inválida");
  }
}

const specialistIds = ["frontend_ux", "backend_api", "data_multitenant", "integrations_devops", "security_reliability"] as const;

function normalizeOpinion(value: any): SpecialistOpinion {
  const specialist = specialistIds.includes(value?.specialist) ? value.specialist : "backend_api";
  return {
    specialist,
    relevant: Boolean(value?.relevant),
    confidence: Math.max(0, Math.min(1, Number(value?.confidence ?? 0.5))),
    observations: Array.isArray(value?.observations) ? value.observations.slice(0, 8).map((v: unknown) => String(v).slice(0, 900)) : [],
    risks: Array.isArray(value?.risks) ? value.risks.slice(0, 8).map((v: unknown) => String(v).slice(0, 900)) : [],
    recommendations: Array.isArray(value?.recommendations) ? value.recommendations.slice(0, 8).map((v: unknown) => String(v).slice(0, 900)) : [],
    validation: Array.isArray(value?.validation) ? value.validation.slice(0, 8).map((v: unknown) => String(v).slice(0, 900)) : [],
  };
}

function normalizeCouncil(value: any): SpecialistCouncil {
  const opinions: SpecialistOpinion[] = Array.isArray(value?.opinions) ? value.opinions.slice(0, 5).map(normalizeOpinion) : [];
  const primary = specialistIds.includes(value?.primary) ? value.primary : (opinions.find((item) => item.relevant)?.specialist ?? "backend_api");
  const consultedRaw = Array.isArray(value?.consulted) ? value.consulted : opinions.filter((item) => item.relevant).map((item) => item.specialist);
  const consulted = consultedRaw.filter((id: unknown): id is SpecialistOpinion["specialist"] => specialistIds.includes(id as any)).slice(0, 5);
  const allowedCommands = new Set([
    "pnpm run typecheck",
    "pnpm --filter @workspace/frontend test",
    "pnpm --filter @workspace/api-server test",
    "pnpm --filter @workspace/api-server audit:tenant:strict",
  ]);
  const commands = Array.isArray(value?.recommendedValidationCommands)
    ? value.recommendedValidationCommands.map(String).filter((command: string) => allowedCommands.has(command)).slice(0, 4)
    : [];
  return {
    primary,
    consulted,
    opinions,
    consensus: String(value?.consensus ?? "Conselho sem consenso conclusivo.").slice(0, 3000),
    conflicts: Array.isArray(value?.conflicts) ? value.conflicts.slice(0, 8).map((v: unknown) => String(v).slice(0, 900)) : [],
    recommendedValidationCommands: commands,
    confidence: Math.max(0, Math.min(1, Number(value?.confidence ?? 0.5))),
  };
}

export async function createSpecialistCouncil(input: z.infer<typeof councilSchema>): Promise<{ council: SpecialistCouncil; engine: string; memoryCount: number; impact: Awaited<ReturnType<typeof analyzeChangeImpact>> }> {
  let engineeringMemory: Awaited<ReturnType<typeof loadEngineeringMemory>> = [];
  try {
    engineeringMemory = await loadEngineeringMemory(12);
  } catch {
    engineeringMemory = [];
  }

  let impact: Awaited<ReturnType<typeof analyzeChangeImpact>>;
  try {
    impact = await analyzeChangeImpact(input);
  } catch {
    impact = {
      seedPaths: [],
      nodes: [],
      affectedDomains: [],
      blastRadius: 0,
      risk: "low",
      reasons: ["Mapa de impacto indisponível nesta análise."],
      confidence: 0,
    };
  }

  const context = { ...input, engineeringMemory, impactGraph: impact };
  let raw = "";
  let engine = "claude-sonnet-4-6";
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3200,
      temperature: 0,
      system: COUNCIL_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(context) }],
    });
    raw = message.content.filter((block: any) => block.type === "text").map((block: any) => block.text).join("");
  } catch {
    engine = "gpt-4o-mini-fallback";
    const openai = await getOpenAIForTenant("");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 3200,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: COUNCIL_PROMPT }, { role: "user", content: JSON.stringify(context) }],
    });
    raw = completion.choices[0]?.message?.content ?? "{}";
  }

  const council = normalizeCouncil(parseJson(raw));
  try {
    await recordEngineeringMemory({
      requestId: input.requestId,
      route: input.route,
      recordedAt: new Date().toISOString(),
      primary: council.primary,
      consulted: council.consulted,
      consensus: council.consensus,
      conflicts: council.conflicts,
      validation: council.recommendedValidationCommands,
      confidence: council.confidence,
    });
  } catch {
    // memória é best-effort: uma falha de persistência não deve derrubar a análise técnica atual
  }

  return { council, engine, memoryCount: engineeringMemory.length, impact };
}

router.post("/support/dev/specialists", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") return res.status(403).json({ error: "Somente Super Admin pode consultar os especialistas do Dev IA." });
  const parsed = councilSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Payload inválido", details: parsed.error.flatten() });
  try {
    const result = await createSpecialistCouncil(parsed.data);
    return res.json({ success: true, ...result });
  } catch (error) {
    req.log?.error({ err: error }, "dev-ia specialist council failed");
    return res.status(500).json({ error: "Falha no Conselho de Especialistas" });
  }
});

export default router;
