import { Router, type IRouter } from "express";
import multer from "multer";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { buildReferencePatternsPromptBlock } from "../services/content-reference-creators.js";
import { buildOwnPerformancePromptBlock } from "../services/content-performance.js";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// ─── Script generation (Anthropic) ────────────────────────────────────────────

const TABS = ["workflow", "trends", "hooks", "script"] as const;
type Tab = (typeof TABS)[number];

function buildPrompt(tab: Tab, input: string, referencePatterns: string): string {
  const prompts: Record<Tab, string> = {
    workflow: `Crie um fluxo de conteúdo para Instagram no nicho "${input}": 5 tópicos em alta, script, visual, legenda e 10 hashtags.`,
    trends:   `Liste 5 ângulos de conteúdo em alta no nicho "${input}" para Reels e vídeos curtos com IA.`,
    hooks:    `Crie 5 ganchos para parar a rolagem no nicho "${input}" nos primeiros 3 segundos. Use os gatilhos: surpresa, medo, ego, urgência e desejo.`,
    script:   `Escreva um script de Reel sobre "${input}" com: GANCHO (0-2s), DESENVOLVIMENTO (3-25s) e CTA (26-30s). Máximo 30 segundos.`,
  };
  return prompts[tab] + referencePatterns;
}

router.post("/tenants/:tenantId/content-studio/generate", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" }); return;
  }

  const { tab, input } = req.body as { tab?: string; input?: string };
  if (!input || typeof input !== "string" || input.trim().length < 2) {
    res.status(422).json({ error: "Campo 'input' é obrigatório (mín. 2 caracteres)" }); return;
  }

  const resolvedTab: Tab = TABS.includes(tab as Tab) ? (tab as Tab) : "script";
  try {
    // Padrões dos criadores de referência (se configurados) — enriquece
    // especialmente 'trends' e 'hooks', que sem isso são só o modelo
    // chutando com base no treino, sem nenhum dado real do nicho.
    const [referencePatterns, ownPerformance] = await Promise.all([
      buildReferencePatternsPromptBlock(tenantId),
      buildOwnPerformancePromptBlock(tenantId),
    ]);
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: "Você é um especialista em marketing digital para Instagram no Brasil. Responda sempre em português.",
      messages: [{ role: "user", content: buildPrompt(resolvedTab, input.trim(), ownPerformance + referencePatterns) }],
    });
    const result = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n");
    res.json({ result, tab: resolvedTab });
  } catch (err) {
    req.log.error({ err }, "content-studio: generation failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro desconhecido" });
  }
});

// ─── Product video storyboard (Anthropic Vision) ──────────────────────────────

router.post(
  "/tenants/:tenantId/content-studio/product-video",
  upload.single("image"),
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);
    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Acesso negado" }); return;
    }

    const {
      name        = "",
      description = "",
      price       = "",
      benefits    = "",
      cta         = "Compre agora",
      format      = "reel",
    } = req.body as Record<string, string>;

    if (!name.trim()) {
      res.status(422).json({ error: "Nome do produto é obrigatório" }); return;
    }

    const formatLabel = format === "story" ? "Stories (9:16 vertical, 5 telas)" : "Reels (15-30 segundos, roteiro sequencial)";

    const textPrompt = `Você é um especialista em marketing de conteúdo para Instagram no Brasil.

Crie um storyboard completo para ${formatLabel} de um produto com as seguintes informações:

**Produto:** ${name}
**Descrição:** ${description || "não informada"}
**Preço:** ${price || "não informado"}
**Benefícios principais:** ${benefits || "não informados"}
**CTA final:** ${cta}
${req.file ? "\nUma imagem do produto foi fornecida para referência visual." : ""}

${format === "story"
  ? `Crie exatamente 5 telas de Story (use o formato abaixo para cada tela):

TELA 1 — GANCHO
- Duração: 3s
- Texto principal: [texto impactante, máx. 6 palavras]
- Texto secundário: [frase de apoio opcional]
- Visual: [descrição do visual/cena]

[repita para Telas 2 a 5 com: INTERESSE, PROVA/BENEFÍCIO, OFERTA, CTA]`
  : `Crie o roteiro completo do Reel com:

GANCHO (0-3s): [texto e ação]
PROBLEMA/DESEJO (3-10s): [contexto e identificação]
SOLUÇÃO/PRODUTO (10-20s): [apresentação do produto e benefícios]
PROVA SOCIAL (20-25s): [depoimento, número ou resultado]
CTA (25-30s): [chamada para ação com ${cta}]

Para cada seção: texto de tela, narração/legenda e indicação visual.`}

Ao final, sugira:
- 5 hashtags estratégicas
- Melhor horário para postar
- Música/áudio recomendado`;

    try {
      const imageBlock = req.file
        ? [{
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: (req.file.mimetype || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: req.file.buffer.toString("base64"),
            },
          }]
        : [];

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: "Você é um especialista em marketing digital para Instagram no Brasil. Responda sempre em português de forma clara e estruturada.",
        messages: [{
          role: "user",
          content: [
            ...imageBlock,
            { type: "text", text: textPrompt },
          ],
        }],
      });

      const result = message.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("\n");

      res.json({ result, format });
    } catch (err) {
      req.log.error({ err }, "content-studio: product-video failed");
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro desconhecido" });
    }
  }
);

export default router;
