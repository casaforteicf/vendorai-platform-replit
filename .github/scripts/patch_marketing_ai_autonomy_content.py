from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if text.count(old) != 1:
        raise SystemExit(f"Esperava 1 ocorrência em {path}, encontrei {text.count(old)}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1))


content_path = "artifacts/api-server/src/routes/content.ts"
content = Path(content_path).read_text()
content = content.replace("  subscriptionsTable,\n  instagramConnectionsTable,\n", "  subscriptionsTable,\n", 1)
content = content.replace(
    'import { InstagramApiError, publishFeedPost, publishStoriesPost } from "../lib/instagram-publish.js";\n',
    'import { InstagramApiError } from "../lib/instagram-publish.js";\n',
    1,
)
content = content.replace('import { ObjectStorageService } from "../lib/objectStorage.js";\n', "", 1)
content = content.replace(
    'import { registerPublishedPost, buildOwnPerformancePromptBlock } from "../services/content-performance.js";\n',
    'import { buildOwnPerformancePromptBlock } from "../services/content-performance.js";\n',
    1,
)
content = content.replace('import type { FeedVariation, StoriesVariation } from "@workspace/db";\n', "", 1)
content = content.replace(
    'import { buildReferencePatternsPromptBlock } from "../services/content-reference-creators.js";\n',
    'import { buildReferencePatternsPromptBlock } from "../services/content-reference-creators.js";\nimport { publishContentGenerationToInstagram, SocialPublicationError } from "../services/contentSocialPublisher.js";\n',
    1,
)
content = re.sub(
    r'const router: IRouter = Router\(\);\nconst contentObjectStorage = new ObjectStorageService\(\);\n\nasync function resolveInstagramMediaUrl\(rawUrl: string\): Promise<string> \{.*?\n\}\n\nconst PLAN_LIMITS:',
    'const router: IRouter = Router();\n\nconst PLAN_LIMITS:',
    content,
    count=1,
    flags=re.S,
)

publish_pattern = re.compile(
    r'router\.post\("/tenants/:tenantId/content/:contentId/publish-instagram", async \(req, res\) => \{.*?\n\}\);\n\nrouter\.delete\("/tenants/:tenantId/content/:id",',
    re.S,
)
publish_replacement = '''router.post("/tenants/:tenantId/content/:contentId/publish-instagram", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const contentId = String(req.params["contentId"]);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = publishBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "variationIndex inválido" });
    return;
  }

  try {
    const published = await publishContentGenerationToInstagram({
      tenantId,
      contentId,
      variationIndex: body.data.variationIndex,
      captionOverride: body.data.captionOverride,
      log: req.log,
    });
    res.json({ success: true, postId: published.postId, contentType: published.contentType });
  } catch (err) {
    req.log.error({ err }, "instagram-publish: route failed");
    if (err instanceof SocialPublicationError) {
      res.status(err.status).json({ code: "INSTAGRAM_CONTENT_NOT_READY", error: err.message });
      return;
    }
    if (err instanceof InstagramApiError) {
      const metaCode = err.graph?.code;
      const tokenInvalid = metaCode === 190;
      const permissionMissing = metaCode === 10 || metaCode === 200;
      res.status(tokenInvalid ? 401 : permissionMissing ? 403 : 422).json({
        code: tokenInvalid
          ? "INSTAGRAM_TOKEN_INVALID"
          : permissionMissing
            ? "INSTAGRAM_PERMISSION_MISSING"
            : "INSTAGRAM_PUBLISH_REJECTED",
        error: err.message,
        metaCode,
        metaSubcode: err.graph?.error_subcode,
      });
      return;
    }
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    res.status(502).json({ code: "INSTAGRAM_PUBLISH_FAILED", error: `Falha ao publicar no Instagram: ${msg}` });
  }
});

router.delete("/tenants/:tenantId/content/:id",'''
content, count = publish_pattern.subn(publish_replacement, content, count=1)
if count != 1:
    raise SystemExit(f"Não encontrei exatamente a rota de publicação Instagram para substituir: {count}")
Path(content_path).write_text(content)

ui_path = "artifacts/frontend/src/pages/ContentAutopilotCore.tsx"
replace_once(
    ui_path,
    '    description: "A IA gera, otimiza e publica automaticamente no site próprio, somente a partir de keywords previamente aprovadas.",\n    badge: "Publicação autorizada",',
    '    description: "A IA escolhe oportunidades, cria, otimiza e publica automaticamente no site e nos canais sociais conectados, sem aprovação manual de cada publicação.",\n    badge: "IA autorizada a publicar",',
)
replace_once(
    ui_path,
    '        description: next === "automatic"\n          ? "Somente keywords aprovadas poderão seguir até publicação automática."\n          : MODE_COPY[next].description,',
    '        description: next === "automatic"\n          ? "A IA está autorizada a criar e publicar automaticamente. Patrocínios usam somente orçamentos e limites já configurados no módulo de Anúncios."\n          : MODE_COPY[next].description,',
)
replace_once(
    ui_path,
    '<p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Automático não elimina governança: só consome keywords aprovadas, e seções bloqueadas no Gerador continuam protegidas.</p>',
    '<p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> No modo Automático a IA não depende de aprovação manual por publicação. A governança permanece pelos limites configurados, conexões válidas e proteções do sistema.</p>',
)

core_path = "artifacts/api-server/src/routes/content_autopilot_core.ts"
core = Path(core_path).read_text()
core = core.replace(
    "// Só pra aprovar/descartar por enquanto (status). Demais campos vêm só do Pesquisador.",
    "// Aprovar/descartar continua disponível para modo semiautomático; no Automático, oportunidades descobertas também podem ser executadas pela IA.",
    1,
)
core = core.replace(
    "// Executa uma rodada do job para o tenant atual, usando as MESMAS regras do cron:\n// só keywords aprovadas, teto mensal, modo suggestion/semi/automatic e canal configurado.",
    "// Executa uma rodada do job para o tenant atual, usando as MESMAS regras do cron:\n// Semiautomático usa keywords aprovadas; Automático pode escolher oportunidades descobertas, respeitando teto mensal e canais configurados.",
    1,
)
Path(core_path).write_text(core)
