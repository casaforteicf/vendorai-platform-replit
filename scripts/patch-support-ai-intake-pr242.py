from pathlib import Path

ROOT = Path('.')

def replace_once(path, old, new, label):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1 match, encontrado {count}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# 1) Support AI intake: classificar antes de reutilizar AST existente.
path = 'artifacts/api-server/src/services/support-ai-intake.ts'
old = '''  const existingCards = await db.select().from(workCardsTable).where(and(
    eq(workCardsTable.tenantId, input.tenantId),
    eq(workCardsTable.pipeline, "suporte"),
    eq(workCardsTable.leadId, input.lead.id),
  )).orderBy(desc(workCardsTable.updatedAt));
  const activeCard = existingCards.find((card) => !CLOSED_SUPPORT_STAGES.has(card.etapa));
  if (activeCard) {
    return {
      state: "existing",
      isSupportRequest: true,
      code: activeCard.codigo,
      category: String((activeCard.metadata as Record<string, unknown> | null)?.categoria ?? "outro"),
      priority: activeCard.prioridade,
      problemSummary: activeCard.descricao ?? undefined,
      instruction: `Já existe a assistência ${activeCard.codigo} ativa para este cliente. Não abra outro chamado. Continue o atendimento mencionando o código quando for útil e informe que novas informações serão vinculadas ao chamado existente.`,
    };
  }

  const classification = await classifySupportNeed(input);
  if (!classification.isSupportRequest) return { state: "none", isSupportRequest: false };
'''
new = '''  const classification = await classifySupportNeed(input);
  if (!classification.isSupportRequest) return { state: "none", isSupportRequest: false };

  const existingCards = await db.select().from(workCardsTable).where(and(
    eq(workCardsTable.tenantId, input.tenantId),
    eq(workCardsTable.pipeline, "suporte"),
    eq(workCardsTable.leadId, input.lead.id),
  )).orderBy(desc(workCardsTable.updatedAt));
  const activeCard = existingCards.find((card) => !CLOSED_SUPPORT_STAGES.has(card.etapa));
  if (activeCard) {
    return {
      state: "existing",
      isSupportRequest: true,
      code: activeCard.codigo,
      category: String((activeCard.metadata as Record<string, unknown> | null)?.categoria ?? "outro"),
      priority: activeCard.prioridade,
      problemSummary: classification.problemSummary || activeCard.descricao || undefined,
      products: classification.products,
      instruction: `Já existe a assistência ${activeCard.codigo} ativa para este cliente. Não abra outro chamado. Continue o atendimento mencionando o código quando for útil e informe que as novas informações serão vinculadas ao chamado existente.`,
    };
  }
'''
replace_once(path, old, new, 'support intake dedup order')

# 2) Agent dispatch: importar e executar intake antes de montar prompt do service.
path = 'artifacts/api-server/src/services/agent-dispatch.ts'
old = 'import { handleDeliveryFeedbackReply } from "./post-venda.js";\n'
new = 'import { handleDeliveryFeedbackReply } from "./post-venda.js";\nimport { prepareSupportAiIntake } from "./support-ai-intake.js";\n'
replace_once(path, old, new, 'agent-dispatch import')

old = '''    let enrichedScenario: Record<string, unknown> | null = scenario
      ? { ...(scenario as Record<string, unknown>) }
      : null;
    if (resolvedAgentName === "pharmacy") {
'''
new = '''    let enrichedScenario: Record<string, unknown> | null = scenario
      ? { ...(scenario as Record<string, unknown>) }
      : null;

    // Cliente já convertido é atendido pelo agente `service`. Antes de gerar a
    // resposta, classificamos se a conversa realmente exige assistência
    // operacional. Se sim, o fluxo coleta o mínimo necessário e, quando houver
    // contexto suficiente, abre o AST de forma determinística, com responsável
    // real e sem depender de um marcador inventado pelo LLM.
    if (resolvedAgentName === "service") {
      try {
        const supportIntake = await prepareSupportAiIntake({
          tenantId,
          lead: ctx.lead,
          recentMessages: ctx.recentMessages,
          currentMessage: mensagem,
          log,
        });
        if (supportIntake.state !== "none") {
          enrichedScenario = { ...(enrichedScenario ?? {}), supportIntake };
          log.info({ tenantId, leadId, supportIntakeState: supportIntake.state, code: supportIntake.code }, "dispatch: support AI intake prepared");
        }
      } catch (err) {
        // A classificação/abertura não pode derrubar o atendimento principal.
        // O agente continua respondendo normalmente e o erro fica observável.
        log.error({ err, tenantId, leadId }, "dispatch: support AI intake failed (non-fatal)");
      }
    }

    if (resolvedAgentName === "pharmacy") {
'''
replace_once(path, old, new, 'agent-dispatch intake hook')

# 3) Prompt de Service: consumir cenário do intake mesmo com prompt customizado.
path = 'artifacts/api-server/src/lib/agent-engine.ts'
old = 'export function buildServicePrompt(customPrompt: string | undefined, ctx: AgentContext, _scenario?: Record<string, unknown> | null, systemPromptOverride?: string | null): string {'
new = 'export function buildServicePrompt(customPrompt: string | undefined, ctx: AgentContext, scenario?: Record<string, unknown> | null, systemPromptOverride?: string | null): string {'
replace_once(path, old, new, 'service prompt signature')

old = '''  parts.push(buildLeadSection(lead));
  if (ci) {
    const lines = ["## CONTEXTO DO CLIENTE"];
'''
new = '''  parts.push(buildLeadSection(lead));

  const supportIntake = scenario?.supportIntake as {
    state?: "collecting" | "opened" | "existing" | "unassigned";
    code?: string;
    missingQuestion?: string;
    category?: string;
    priority?: string;
    problemSummary?: string;
    products?: string[];
    responsibleName?: string | null;
    instruction?: string;
  } | undefined;
  if (supportIntake?.state && supportIntake.instruction) {
    const details = [
      `Estado: ${supportIntake.state}`,
      supportIntake.code ? `Código AST: ${supportIntake.code}` : null,
      supportIntake.category ? `Categoria: ${supportIntake.category}` : null,
      supportIntake.priority ? `Prioridade: ${supportIntake.priority}` : null,
      supportIntake.problemSummary ? `Problema identificado: ${supportIntake.problemSummary}` : null,
      supportIntake.products?.length ? `Itens/produtos citados: ${supportIntake.products.join(", ")}` : null,
      supportIntake.responsibleName ? `Responsável: ${supportIntake.responsibleName}` : null,
    ].filter(Boolean).join("\\n");
    parts.push(
      "## FLUXO OPERACIONAL DE ASSISTÊNCIA — INSTRUÇÃO OBRIGATÓRIA\\n" +
      `${details}\\n` +
      `${supportIntake.instruction}\\n` +
      "Não invente código, responsável, prazo, diagnóstico ou solução técnica. Se o estado for collecting, faça somente a pergunta indicada. Se for opened, confirme o registro com o código real. Se for existing, não crie nem prometa novo chamado."
    );
  }

  if (ci) {
    const lines = ["## CONTEXTO DO CLIENTE"];
'''
replace_once(path, old, new, 'service prompt intake scenario')

print('support AI intake conectado')
