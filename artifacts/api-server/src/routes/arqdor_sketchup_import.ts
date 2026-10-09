import { Router, type IRouter } from "express";
import multer from "multer";
import { and, eq } from "drizzle-orm";
import { db, archConceptProjectsTable } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { convertSketchupToGlb } from "../services/sketchupConverterService.js";
import { parseIfcEditableGeometry } from "../lib/arqdor-ifc-editable.js";
import { parseDxfEditableGeometry } from "../lib/arqdor-dxf-editable.js";

const router: IRouter = Router();
const sketchupUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 45 * 1024 * 1024 } });
const geometryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 35 * 1024 * 1024 } });

router.post("/arch/concept-projects/:id/import-geometry", geometryUpload.single("file"), async (req, res) => {
  const tenantId = req.user?.tenantId ?? req.tenantId;
  const userId = req.user?.sub;
  const projectId = String(req.params.id);

  if (!tenantId || !userId) return res.status(401).json({ error: "Sessão inválida." });
  if (!req.file?.buffer?.length) return res.status(400).json({ error: "Envie o arquivo no campo file." });

  const extension = req.file.originalname.split(".").pop()?.toLowerCase() ?? "";
  if (!["ifc", "dxf", "dwg", "skp"].includes(extension)) {
    return res.status(422).json({ error: "Use IFC, DXF, DWG ou SKP para importação de modelo." });
  }
  if (extension === "dwg") {
    return res.status(422).json({
      error: "DWG binário ainda não pode ser convertido com fidelidade neste servidor. Exporte para DXF e importe novamente.",
      code: "DWG_REQUIRES_DXF",
    });
  }
  if (extension === "skp") {
    return res.status(422).json({
      error: "SKP deve ser convertido para GLB pelo fluxo SketchUp existente. A geometria editável não será inferida silenciosamente.",
      code: "SKP_REQUIRES_CONVERSION",
    });
  }

  const [concept] = await db
    .select({
      id: archConceptProjectsTable.id,
      status: archConceptProjectsTable.status,
      configuration: archConceptProjectsTable.configuration,
      rooms: archConceptProjectsTable.rooms,
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
      error: "O Projeto Mestre está congelado. Crie uma revisão antes de importar outra geometria.",
      code: "PROJECT_MASTER_FROZEN",
    });
  }

  try {
    const raw = req.file.buffer.toString("utf8");
    const geometry = extension === "ifc"
      ? parseIfcEditableGeometry(raw)
      : parseDxfEditableGeometry(raw);

    const summary = {
      format: extension,
      walls: geometry.walls.length,
      openings: geometry.openings.length,
      spaces: "spaces" in geometry ? geometry.spaces.length : 0,
      bounds: geometry.bounds,
      unit: geometry.unit,
      warnings: geometry.warnings,
    };

    const mode = String(req.body?.mode ?? "preview").toLowerCase();
    const confirmed = String(req.body?.confirm ?? "").toLowerCase() === "true";
    if (mode !== "apply" || !confirmed) {
      return res.json({
        mode: "preview",
        summary,
        geometry,
        message: "Prévia gerada. Nenhuma geometria foi alterada. Confirme explicitamente para aplicar.",
      });
    }

    const storage = new ObjectStorageService();
    const storagePath = await storage.savePrivateBuffer(
      req.file.buffer,
      req.file.mimetype || (extension === "ifc" ? "application/x-step" : "application/dxf"),
      req.file.originalname,
    );
    const sourceUrl = `/api/storage/objects${storagePath.replace(/^\/objects/, "")}`;
    const config = (concept.configuration ?? {}) as Record<string, any>;
    const currentSources = Array.isArray(config.sourceFiles)
      ? config.sourceFiles.filter((item: unknown) => item && typeof item === "object").slice(-9)
      : [];
    const importedAt = new Date().toISOString();

    const nextConfig: Record<string, any> = {
      ...config,
      floors: Math.max(
        Number(config.floors ?? 1),
        ...geometry.walls.map((wall: any) => Number(wall.floor ?? 0) + 1),
      ),
      customWalls: geometry.walls,
      customOpenings: geometry.openings,
      wallMaterials: "wallMaterials" in geometry ? geometry.wallMaterials : (config.wallMaterials ?? {}),
      sourceFiles: [
        ...currentSources,
        {
          id: crypto.randomUUID(),
          storagePath,
          url: sourceUrl,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          extension,
          kind: "architectural_geometry",
          uploadedAt: importedAt,
          status: "parsed",
          parserStatus: "ready_editable_geometry",
          summary,
        },
      ],
      lastGeometryImport: {
        importedAt,
        format: extension,
        originalName: req.file.originalname,
        summary,
      },
    };

    if ("spaces" in geometry && geometry.spaces.length) {
      nextConfig.spaceProfiles = geometry.spaces.map((space: any) => ({
        id: space.id,
        floor: space.floor,
        label: space.label,
        kind: space.kind,
        centroid: { x: 0, y: 0 },
        area: space.area,
        floorMaterialId: space.floorMaterialId,
        sourceIfcId: space.sourceIfcId,
      }));
    }

    await db
      .update(archConceptProjectsTable)
      .set({
        configuration: nextConfig as any,
        updatedAt: new Date(),
      })
      .where(and(
        eq(archConceptProjectsTable.id, projectId),
        eq(archConceptProjectsTable.tenantId, tenantId),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ));

    return res.json({
      mode: "applied",
      summary,
      geometry,
      source: { storagePath, url: sourceUrl, originalName: req.file.originalname },
      message: "Geometria importada para edição. Revise paredes, aberturas, pavimentos e escala antes de continuar.",
    });
  } catch (error) {
    return res.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível interpretar a geometria do arquivo.",
    });
  }
});

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
