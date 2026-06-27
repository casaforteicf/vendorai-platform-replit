import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

const TABS = ["workflow", "trends", "hooks", "script"] as const;
type Tab = (typeof TABS)[number];

function buildPrompt(tab: Tab, input: string): string {
  const prompts: Record<Tab, string> = {
    workflow: `Crie um fluxo de conteúdo para Instagram no nicho "${input}": 5 tópicos em alta, script, visual, legenda e 10 hashtags.`,
    trends: `Liste 5 ângulos de conteúdo em alta no nicho "${input}" para Reels e vídeos curtos com IA.`,
    hooks: `Crie 5 ganchos para parar a rolagem no nicho "${input}" nos primeiros 3 segundos. Use os gatilhos: surpresa, medo, ego, urgência e desejo.`,
    script: `Escreva um script de Reel sobre "${input}" com: GANCHO (0-2s), DESENVOLVIMENTO (3-25s) e CTA (26-30s). Máximo 30 segundos.`,
  };
  return prompts[tab];
}

router.post("/tenants/:tenantId/content-studio/generate", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const { tab, input } = req.body as { tab?: string; input?: string };

  if (!input || typeof input !== "string" || input.trim().length < 2) {
    res.status(422).json({ error: "Campo 'input' é obrigatório (mín. 2 caracteres)" });
    return;
  }

  const resolvedTab: Tab = TABS.includes(tab as Tab) ? (tab as Tab) : "script";

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: "Você é um especialista em marketing digital para Instagram no Brasil. Responda sempre em português.",
      messages: [{ role: "user", content: buildPrompt(resolvedTab, input.trim()) }],
    });

    const result = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n");

    res.json({ result, tab: resolvedTab });
  } catch (err) {
    req.log.error({ err }, "content-studio: generation failed");
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    res.status(500).json({ error: msg });
  }
});

export default router;
