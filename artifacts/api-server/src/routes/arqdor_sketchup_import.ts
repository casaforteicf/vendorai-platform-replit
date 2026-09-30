import { Router, type IRouter } from "express";
import multer from "multer";
import { and, eq } from "drizzle-orm";
import { db, archConceptProjectsTable } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { convertSketchupToGlb } from "../services/sketchupConverterService.js";

const router: IRouter = Router();
const sketchupUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 45 * 1024 * 1024 } });

router.post("/arch/concept-projects/:id/source-file/:sourceId/convert-sketchup", async (req, res) => {
  const tenantId = req.user?.tenantId ?? req.tenantId;
  const userId = req.user?.sub;
  const projectId = String(req.params.id);
  const sourceId = String(req.params.sourceId);

  if (!tenantId || !userId) {
    return res.status(401).json({ error: "Sessão inválida." });
  }

  const [concept] = await db
    .select({
      id: archConceptProjectsTable.id,
      status: archConceptProjectsTable.status,
      configuration: archConceptProjectsTable.configuration,
    })
    .from(archConceptProjectsTable)
    .where(and(
      eq(archConceptProjectsTable.id, projectId),
      eq(archConceptProjectsTable.tenantId, tenantId),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ))
    .limit(1);

  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });

  if (concept.status === "submitted" && (concept.configuration as any)?.projectMaster) {
    return res.status(409).json({
      error: "O Projeto Mestre está congelado. Crie uma revisão antes de converter outra fonte.",
      code: "PROJECT_MASTER_FROZEN",
    });
  }

  const config = (concept.configuration ?? {}) as Record<string, unknown>;
  const sourceFiles = Array.isArray(config.sourceFiles)
    ? config.sourceFiles.filter((item): item is Record<string, any> => !!item && typeof item === "object")
    : [];
  const source = sourceFiles.find((item) => String(item.id) === sourceId);

  if (!source) return res.status(404).json({ error: "Arquivo-fonte não encontrado." });
  if (String(source.extension ?? "").toLowerCase() !== "skp") {
    return res.status(400).json({ error: "Este endpoint converte somente arquivos SKP." });
  }
  if (typeof source.storagePath !== "string" || !source.storagePath.startsWith("/objects/")) {
    return res.status(422).json({ error: "O arquivo SKP não possui caminho de storage válido." });
  }

  try {
    const storage = new ObjectStorageService();
    const file = await storage.getObjectEntityFile(source.storagePath);
    const [buffer] = await file.download();

    const converted = await convertSketchupToGlb({
      buffer,
      originalName: String(source.originalName || "projeto.skp"),
    });

    const baseName = String(source.originalName || "projeto.skp").replace(/\.skp$/i, "");
    const glbStoragePath = await storage.savePrivateBuffer(
      converted.glb,
      "model/gltf-binary",
      `${baseName}.glb`,
    );
    const glbUrl = `/api/storage/objects${glbStoragePath.replace(/^\/objects/, "")}`;
    const convertedAt = new Date().toISOString();

    const updatedSource = {
      ...source,
      parserStatus: "ready_model3d",
      status: "converted",
      convertedAt,
      conversionEngine: converted.engine,
      model3d: {
        storagePath: glbStoragePath,
        url: glbUrl,
        format: "glb",
      },
      manifest: converted.manifest,
    };

    const nextSources = sourceFiles.map((item) => String(item.id) === sourceId ? updatedSource : item);

    await db
      .update(archConceptProjectsTable)
      .set({
        configuration: {
          ...config,
          sourceFiles: nextSources,
        } as any,
        updatedAt: new Date(),
      })
      .where(and(
        eq(archConceptProjectsTable.id, projectId),
        eq(archConceptProjectsTable.tenantId, tenantId),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ));

    return res.json(updatedSource);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível converter o SketchUp.";
    const status = /SKETCHUP_CONVERTER_URL não configurado/.test(message) ? 503 : 422;
    return res.status(status).json({ error: message });
  }
});


router.post("/arch/concept-projects/:id/sketchup-sync", sketchupUpload.single("model"), async (req, res) => {
  const tenantId = req.user?.tenantId ?? req.tenantId;
  const userId = req.user?.sub;
  const projectId = String(req.params.id);

  if (!tenantId || !userId) return res.status(401).json({ error: "Sessão inválida." });
  if (!req.file?.buffer?.length) return res.status(400).json({ error: "Envie o modelo GLB no campo model." });

  const [concept] = await db
    .select({
      id: archConceptProjectsTable.id,
      status: archConceptProjectsTable.status,
      configuration: archConceptProjectsTable.configuration,
    })
    .from(archConceptProjectsTable)
    .where(and(
      eq(archConceptProjectsTable.id, projectId),
      eq(archConceptProjectsTable.tenantId, tenantId),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ))
    .limit(1);

  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });
  if (concept.status === "submitted" && (concept.configuration as any)?.projectMaster) {
    return res.status(409).json({
      error: "O Projeto Mestre está congelado. Crie uma revisão antes de sincronizar o SketchUp.",
      code: "PROJECT_MASTER_FROZEN",
    });
  }

  let manifest: Record<string, unknown> | null = null;
  if (typeof req.body?.manifest === "string" && req.body.manifest.trim()) {
    try {
      const parsed = JSON.parse(req.body.manifest);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) manifest = parsed;
    } catch {
      return res.status(400).json({ error: "Manifesto do SketchUp inválido." });
    }
  }

  try {
    const storage = new ObjectStorageService();
    const originalName = req.file.originalname || "sketchup-model.glb";
    const safeName = /\.glb$/i.test(originalName) ? originalName : `${originalName}.glb`;
    const glbStoragePath = await storage.savePrivateBuffer(
      req.file.buffer,
      "model/gltf-binary",
      safeName,
    );
    const glbUrl = `/api/storage/objects${glbStoragePath.replace(/^\/objects/, "")}`;
    const syncedAt = new Date().toISOString();

    const config = (concept.configuration ?? {}) as Record<string, unknown>;
    const currentSources = Array.isArray(config.sourceFiles)
      ? config.sourceFiles.filter((item) => item && typeof item === "object").slice(-9)
      : [];

    const sourceFile = {
      id: crypto.randomUUID(),
      storagePath: glbStoragePath,
      url: glbUrl,
      originalName: safeName,
      mimeType: "model/gltf-binary",
      extension: "glb",
      kind: "model3d",
      uploadedAt: syncedAt,
      status: "converted",
      parserStatus: "ready_model3d",
      conversionEngine: "sketchup-plugin",
      model3d: {
        storagePath: glbStoragePath,
        url: glbUrl,
        format: "glb",
      },
      manifest,
      sketchupSync: {
        syncedAt,
        source: "sketchup-extension",
        sketchupVersion: typeof req.body?.sketchupVersion === "string" ? req.body.sketchupVersion : null,
      },
    };

    await db
      .update(archConceptProjectsTable)
      .set({
        configuration: {
          ...config,
          sourceFiles: [...currentSources, sourceFile],
        } as any,
        updatedAt: new Date(),
      })
      .where(and(
        eq(archConceptProjectsTable.id, projectId),
        eq(archConceptProjectsTable.tenantId, tenantId),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ));

    return res.status(201).json(sourceFile);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Não foi possível sincronizar o modelo do SketchUp.",
    });
  }
});

export default router;
