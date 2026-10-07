import { Router, type IRouter } from "express";
import multer from "multer";
import { and, eq } from "drizzle-orm";
import { db, archConceptProjectsTable, arqdorUniversalModelsTable } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { convertSketchupToGlb } from "../services/sketchupConverterService.js";
import { parseIfcEditableGeometry } from "../lib/arqdor-ifc-editable.js";
import { parseDxfEditableGeometry } from "../lib/arqdor-dxf-editable.js";
import { analyzeArqdorProjectDocument, universalModelDedupeKey, type ArqdorImportedFloorPlan } from "../lib/arqdor-intelligent-project-import.js";
import { importedFloorPlanToEditableGeometry } from "../lib/arqdor-imported-geometry.js";
import { buildImportedArchitectural3DProfile } from "../lib/arqdor-imported-3d.js";
import crypto from "node:crypto";

const router: IRouter = Router();
const sketchupUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 45 * 1024 * 1024 } });
const geometryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 35 * 1024 * 1024 } });
const intelligentProjectUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post("/arch/concept-projects/:id/import-project-intelligent", intelligentProjectUpload.single("file"), async (req, res) => {
  const tenantId = req.user?.tenantId ?? req.tenantId;
  const userId = req.user?.sub;
  const projectId = String(req.params.id);

  if (!tenantId || !userId) return res.status(401).json({ error: "Sessão inválida." });
  if (!req.file?.buffer?.length) return res.status(400).json({ error: "Envie o projeto no campo file." });

  const extension = req.file.originalname.split(".").pop()?.toLowerCase() ?? "";
  if (!["pdf", "jpg", "jpeg", "png", "webp"].includes(extension)) {
    return res.status(422).json({ error: "Use PDF, JPG, PNG ou WEBP na Importação Inteligente." });
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
      error: "O Projeto Mestre está congelado. Crie uma revisão antes de importar outro projeto.",
      code: "PROJECT_MASTER_FROZEN",
    });
  }

  try {
    const mimeType = req.file.mimetype || (
      extension === "pdf" ? "application/pdf" :
      extension === "png" ? "image/png" :
      extension === "webp" ? "image/webp" : "image/jpeg"
    );
    const analysis = await analyzeArqdorProjectDocument({
      tenantId,
      buffer: req.file.buffer,
      mimeType,
      filename: req.file.originalname,
    });

    const storage = new ObjectStorageService();
    const storagePath = await storage.savePrivateBuffer(
      req.file.buffer,
      mimeType,
      req.file.originalname,
    );
    const sourceUrl = `/api/storage/objects${storagePath.replace(/^\\/objects/, "")}`;
    const importedAt = new Date().toISOString();
    const sourceDocumentHash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");

    const savedModels: Array<{ id: string; kind: string; title: string; confidence: number }> = [];
    for (const candidate of analysis.universalCandidates) {
      const dedupeKey = universalModelDedupeKey(candidate);
      const id = crypto.randomUUID();
      const [saved] = await db
        .insert(arqdorUniversalModelsTable)
        .values({
          id,
          kind: candidate.kind,
          title: candidate.title,
          description: candidate.description ?? null,
          sourceProjectId: projectId,
          sourceTenantId: tenantId,
          sourceFileName: `project-import.${extension || "bin"}`,
          architecture: candidate.architecture,
          metadata: candidate.metadata,
          provenance: {
            ...candidate.provenance,
            sourceDocumentHash,
            importedAt,
          },
          confidence: String(candidate.confidence),
          dedupeKey,
          status: candidate.confidence >= 0.72 ? "ready" : "needs_review",
          isActive: true,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: arqdorUniversalModelsTable.dedupeKey,
          set: {
            description: candidate.description ?? null,
            architecture: candidate.architecture,
            metadata: candidate.metadata,
            provenance: {
              ...candidate.provenance,
              sourceDocumentHash,
              importedAt,
            },
            confidence: String(candidate.confidence),
            status: candidate.confidence >= 0.72 ? "ready" : "needs_review",
            isActive: true,
            updatedAt: new Date(),
          },
        })
        .returning({
          id: arqdorUniversalModelsTable.id,
          kind: arqdorUniversalModelsTable.kind,
          title: arqdorUniversalModelsTable.title,
          confidence: arqdorUniversalModelsTable.confidence,
        });

      if (saved) savedModels.push({
        id: saved.id,
        kind: saved.kind,
        title: saved.title,
        confidence: Number(saved.confidence),
      });
    }

    const config = (concept.configuration ?? {}) as Record<string, any>;
    const currentSources = Array.isArray(config.sourceFiles)
      ? config.sourceFiles.filter((item: unknown) => item && typeof item === "object").slice(-19)
      : [];
    const previousImports = Array.isArray(config.projectImportHistory)
      ? config.projectImportHistory.filter((item: unknown) => item && typeof item === "object").slice(-9)
      : [];

    const geometryPreviews = analysis.memory.floorPlans.map((floorPlan, index) => ({
      index,
      ...importedFloorPlanToEditableGeometry(floorPlan),
    }));
    const architectural3DPreview = buildImportedArchitectural3DProfile(analysis);

    const sourceFile = {
      id: crypto.randomUUID(),
      storagePath,
      url: sourceUrl,
      originalName: req.file.originalname,
      mimeType,
      extension,
      kind: "architectural_project",
      uploadedAt: importedAt,
      status: "parsed",
      parserStatus: "ready_project_memory",
      summary: {
        sheets: analysis.document.detectedSheets.length,
        rooms: analysis.memory.rooms.length,
        openings: analysis.memory.openings.length,
        materials: analysis.memory.materials.length,
        floorPlans: analysis.memory.floorPlans.length,
        geometryReady: geometryPreviews.filter((item) => item.canApply).length,
        architectural3DReady: architectural3DPreview.canApply,
        facades: analysis.memory.facades.length,
        sections: analysis.memory.sections.length,
        universalModels: savedModels.length,
        warnings: analysis.warnings.length + analysis.memory.inconsistencies.length,
      },
    };

    await db
      .update(archConceptProjectsTable)
      .set({
        configuration: {
          ...config,
          sourceFiles: [...currentSources, sourceFile],
          projectMemory: {
            version: analysis.version,
            generatedAt: importedAt,
            sourceId: sourceFile.id,
            document: analysis.document,
            memory: analysis.memory,
            warnings: analysis.warnings,
          },
          projectImportHistory: [
            ...previousImports,
            {
              id: sourceFile.id,
              importedAt,
              sourceDocumentHash,
              document: analysis.document,
              memorySummary: analysis.memory.summary,
              universalModelIds: savedModels.map((item) => item.id),
            },
          ],
        } as any,
        updatedAt: new Date(),
      })
      .where(and(
        eq(archConceptProjectsTable.id, projectId),
        eq(archConceptProjectsTable.tenantId, tenantId),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ));

    return res.status(201).json({
      status: "completed",
      source: sourceFile,
      document: analysis.document,
      memory: analysis.memory,
      universalModels: savedModels,
      geometryPreviews,
      architectural3DPreview,
      warnings: analysis.warnings,
      message: "Projeto interpretado, Memória da Obra gerada e modelos reutilizáveis enviados automaticamente à Biblioteca Universal.",
    });
  } catch (error) {
    return res.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível interpretar o projeto arquitetônico.",
    });
  }
});


router.get("/arch/concept-projects/:id/imported-project/geometry-preview", async (req, res) => {
  const tenantId = req.user?.tenantId ?? req.tenantId;
  const userId = req.user?.sub;
  const projectId = String(req.params.id);
  if (!tenantId || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const [concept] = await db
    .select({ configuration: archConceptProjectsTable.configuration })
    .from(archConceptProjectsTable)
    .where(and(
      eq(archConceptProjectsTable.id, projectId),
      eq(archConceptProjectsTable.tenantId, tenantId),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ))
    .limit(1);

  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });
  const config = (concept.configuration ?? {}) as Record<string, any>;
  const floorPlans = Array.isArray(config.projectMemory?.memory?.floorPlans)
    ? config.projectMemory.memory.floorPlans as ArqdorImportedFloorPlan[]
    : [];
  if (!floorPlans.length) {
    return res.status(422).json({
      error: "A importação atual não possui planta baixa estruturada para reconstrução.",
      code: "IMPORTED_FLOOR_PLAN_NOT_FOUND",
    });
  }

  const requestedIndex = Number(req.query.floorPlanIndex ?? 0);
  const index = Number.isFinite(requestedIndex)
    ? Math.max(0, Math.min(floorPlans.length - 1, Math.round(requestedIndex)))
    : 0;
  const widthMeters = Number(req.query.widthMeters);
  const depthMeters = Number(req.query.depthMeters);
  const floor = Number(req.query.floor ?? 0);
  const preview = importedFloorPlanToEditableGeometry(floorPlans[index]!, {
    floor: Number.isFinite(floor) ? floor : 0,
    widthMeters: Number.isFinite(widthMeters) && widthMeters > 0 ? widthMeters : undefined,
    depthMeters: Number.isFinite(depthMeters) && depthMeters > 0 ? depthMeters : undefined,
  });

  return res.json({
    floorPlanIndex: index,
    floorPlanCount: floorPlans.length,
    preview,
  });
});

router.post("/arch/concept-projects/:id/imported-project/apply-geometry", async (req, res) => {
  const tenantId = req.user?.tenantId ?? req.tenantId;
  const userId = req.user?.sub;
  const projectId = String(req.params.id);
  if (!tenantId || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const confirmed = req.body?.confirm === true || String(req.body?.confirm ?? "").toLowerCase() === "true";
  if (!confirmed) {
    return res.status(400).json({
      error: "Confirme explicitamente a aplicação da geometria importada.",
      code: "CONFIRMATION_REQUIRED",
    });
  }

  const [concept] = await db
    .select({
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
  const config = (concept.configuration ?? {}) as Record<string, any>;
  if (concept.status === "submitted" && config.projectMaster) {
    return res.status(409).json({
      error: "O Projeto Mestre está congelado. Crie uma revisão antes de aplicar a geometria importada.",
      code: "PROJECT_MASTER_FROZEN",
    });
  }

  const floorPlans = Array.isArray(config.projectMemory?.memory?.floorPlans)
    ? config.projectMemory.memory.floorPlans as ArqdorImportedFloorPlan[]
    : [];
  if (!floorPlans.length) {
    return res.status(422).json({
      error: "A importação atual não possui planta baixa estruturada.",
      code: "IMPORTED_FLOOR_PLAN_NOT_FOUND",
    });
  }

  const requestedIndex = Number(req.body?.floorPlanIndex ?? 0);
  const index = Number.isFinite(requestedIndex)
    ? Math.max(0, Math.min(floorPlans.length - 1, Math.round(requestedIndex)))
    : 0;
  const floor = Number.isFinite(Number(req.body?.floor)) ? Math.max(0, Math.round(Number(req.body.floor))) : 0;
  const widthMeters = Number(req.body?.widthMeters);
  const depthMeters = Number(req.body?.depthMeters);
  const preview = importedFloorPlanToEditableGeometry(floorPlans[index]!, {
    floor,
    widthMeters: Number.isFinite(widthMeters) && widthMeters > 0 ? widthMeters : undefined,
    depthMeters: Number.isFinite(depthMeters) && depthMeters > 0 ? depthMeters : undefined,
  });

  if (!preview.canApply) {
    return res.status(422).json({
      error: preview.requiresCalibration
        ? "Informe largura e profundidade reais para calibrar a planta antes de aplicar."
        : "A geometria importada ainda não atingiu confiança suficiente para ser aplicada.",
      code: preview.requiresCalibration ? "CALIBRATION_REQUIRED" : "GEOMETRY_LOW_CONFIDENCE",
      preview,
    });
  }

  const replace = req.body?.replace !== false;
  const existingWalls = Array.isArray(config.customWalls) ? config.customWalls : [];
  const existingOpenings = Array.isArray(config.customOpenings) ? config.customOpenings : [];
  const existingSpaces = Array.isArray(config.spaceProfiles) ? config.spaceProfiles : [];
  const keepOtherFloors = <T extends { floor?: number }>(items: T[]) =>
    items.filter((item) => Number(item?.floor ?? 0) !== floor);

  const nextWalls = replace ? [...keepOtherFloors(existingWalls), ...preview.walls] : [...existingWalls, ...preview.walls];
  const nextOpenings = replace ? [...keepOtherFloors(existingOpenings), ...preview.openings] : [...existingOpenings, ...preview.openings];
  const nextSpaces = replace ? [...keepOtherFloors(existingSpaces), ...preview.spaces] : [...existingSpaces, ...preview.spaces];

  const wallMaterials = { ...(config.wallMaterials ?? {}) } as Record<string, string>;
  for (const wall of preview.walls) {
    if (wall.material) wallMaterials[wall.id] = wall.material;
  }

  const appliedAt = new Date().toISOString();
  await db
    .update(archConceptProjectsTable)
    .set({
      configuration: {
        ...config,
        floors: Math.max(Number(config.floors ?? 1), floor + 1),
        customWalls: nextWalls,
        customOpenings: nextOpenings,
        spaceProfiles: nextSpaces,
        wallMaterials,
        wallFirstFloors: Array.from(new Set([
          ...(Array.isArray(config.wallFirstFloors) ? config.wallFirstFloors : []),
          floor,
        ])).sort((a, b) => Number(a) - Number(b)),
        importedGeometryState: {
          appliedAt,
          floorPlanIndex: index,
          sourcePage: preview.page,
          floor,
          widthMeters: preview.widthMeters,
          depthMeters: preview.depthMeters,
          confidence: preview.confidence,
          topologyRepairs: preview.topologyRepairs,
          walls: preview.walls.length,
          openings: preview.openings.length,
          spaces: preview.spaces.length,
          warnings: preview.warnings,
        },
      } as any,
      updatedAt: new Date(),
    })
    .where(and(
      eq(archConceptProjectsTable.id, projectId),
      eq(archConceptProjectsTable.tenantId, tenantId),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ));

  return res.json({
    mode: "applied",
    floorPlanIndex: index,
    preview,
    message: "Planta importada convertida em paredes e aberturas editáveis do Arqdor.",
  });
});


router.get("/arch/concept-projects/:id/imported-project/3d-preview", async (req, res) => {
  const tenantId = req.user?.tenantId ?? req.tenantId;
  const userId = req.user?.sub;
  const projectId = String(req.params.id);
  if (!tenantId || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const [concept] = await db
    .select({ configuration: archConceptProjectsTable.configuration })
    .from(archConceptProjectsTable)
    .where(and(
      eq(archConceptProjectsTable.id, projectId),
      eq(archConceptProjectsTable.tenantId, tenantId),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ))
    .limit(1);

  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });
  const config = (concept.configuration ?? {}) as Record<string, any>;
  const memory = config.projectMemory?.memory;
  if (!memory || typeof memory !== "object") {
    return res.status(422).json({
      error: "Importe um projeto arquitetônico antes de gerar a reconstrução 3D.",
      code: "PROJECT_MEMORY_NOT_FOUND",
    });
  }

  return res.json({
    preview: buildImportedArchitectural3DProfile({ memory } as any),
  });
});

router.post("/arch/concept-projects/:id/imported-project/apply-3d", async (req, res) => {
  const tenantId = req.user?.tenantId ?? req.tenantId;
  const userId = req.user?.sub;
  const projectId = String(req.params.id);
  if (!tenantId || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const confirmed = req.body?.confirm === true || String(req.body?.confirm ?? "").toLowerCase() === "true";
  if (!confirmed) {
    return res.status(400).json({
      error: "Confirme explicitamente a aplicação das informações verticais importadas.",
      code: "CONFIRMATION_REQUIRED",
    });
  }

  const [concept] = await db
    .select({
      status: archConceptProjectsTable.status,
      configuration: archConceptProjectsTable.configuration,
      facadePreferences: archConceptProjectsTable.facadePreferences,
    })
    .from(archConceptProjectsTable)
    .where(and(
      eq(archConceptProjectsTable.id, projectId),
      eq(archConceptProjectsTable.tenantId, tenantId),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ))
    .limit(1);

  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });
  const config = (concept.configuration ?? {}) as Record<string, any>;
  if (concept.status === "submitted" && config.projectMaster) {
    return res.status(409).json({
      error: "O Projeto Mestre está congelado. Crie uma revisão antes de aplicar a reconstrução 3D.",
      code: "PROJECT_MASTER_FROZEN",
    });
  }

  const memory = config.projectMemory?.memory;
  if (!memory || typeof memory !== "object") {
    return res.status(422).json({
      error: "A importação atual não possui Memória da Obra.",
      code: "PROJECT_MEMORY_NOT_FOUND",
    });
  }

  const preview = buildImportedArchitectural3DProfile({ memory } as any);
  if (!preview.canApply) {
    return res.status(422).json({
      error: "Os cortes/fachadas/cobertura ainda não têm evidência suficiente para parametrização 3D.",
      code: "IMPORTED_3D_LOW_CONFIDENCE",
      preview,
    });
  }

  const currentFacadeDesign = (config.facadeDesign ?? {}) as Record<string, any>;
  const currentRoofConfig = (currentFacadeDesign.roofConfig ?? {}) as Record<string, any>;
  const nextFacadeDesign = preview.roof.pitchDegrees != null
    ? {
        ...currentFacadeDesign,
        roofConfig: {
          ...currentRoofConfig,
          pitchDegrees: Math.round(preview.roof.pitchDegrees * 10) / 10,
        },
      }
    : currentFacadeDesign;

  const currentFacadePreferences = (concept.facadePreferences ?? {}) as Record<string, any>;
  const roofText = [preview.roof.type, preview.roof.material].filter(Boolean).join(" ").toLowerCase();
  const explicitPitchedRoof = /shingle|telha|duas águas|duas aguas|quatro águas|quatro aguas|gable|hip/.test(roofText);
  const nextFacadePreferences = explicitPitchedRoof
    ? { ...currentFacadePreferences, roof: "aparente" }
    : currentFacadePreferences;

  const appliedAt = new Date().toISOString();
  await db
    .update(archConceptProjectsTable)
    .set({
      configuration: {
        ...config,
        importedArchitecturalModel: {
          version: 1,
          appliedAt,
          ...preview,
        },
        facadeDesign: nextFacadeDesign,
      } as any,
      facadePreferences: nextFacadePreferences as any,
      updatedAt: new Date(),
    })
    .where(and(
      eq(archConceptProjectsTable.id, projectId),
      eq(archConceptProjectsTable.tenantId, tenantId),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ));

  return res.json({
    mode: "applied",
    preview,
    facadeDesign: nextFacadeDesign,
    facadePreferences: nextFacadePreferences,
    message: "Cortes, fachadas e cobertura foram consolidados no perfil 3D importado do Arqdor.",
  });
});

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
