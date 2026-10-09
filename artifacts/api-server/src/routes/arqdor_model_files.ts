import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Router, type IRouter } from "express";
import multer from "multer";
import { and, eq } from "drizzle-orm";
import { db, archProjetosTable } from "@workspace/db";
import { ModelFileStore, MODEL_FILE_LIMIT, safeSegment } from "../lib/arqdor-model-files.js";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MODEL_FILE_LIMIT, files: 1 } });
const prefix = "/arch/projetos/:projectId/model-files";

router.use(prefix, async (req, res, next) => {
  const tenantId = req.user?.tenantId ?? req.tenantId;
  if (!tenantId || !req.user?.sub) return res.status(401).json({ error: "Sessão inválida" });
  try {
    const projectId = safeSegment(String(req.params.projectId));
    safeSegment(tenantId);
    const [project] = await db.select({ id: archProjetosTable.id }).from(archProjetosTable)
      .where(and(eq(archProjetosTable.id, projectId), eq(archProjetosTable.tenantId, tenantId))).limit(1);
    if (!project) return res.status(404).json({ error: "Projeto não encontrado" });
    res.locals.modelScope = { projectId, tenantId, userId: req.user.sub };
    next();
  } catch (error) { next(error); }
});

function store() {
  const root = process.env.ARQDOR_MODEL_ROOT;
  if (!root?.trim()) return null;
  return new ModelFileStore(root);
}

router.get(prefix, async (_req, res, next) => {
  try {
    const storage = store();
    const { tenantId, projectId } = res.locals.modelScope;
    return res.json({ configured: Boolean(storage), formats: ["glb"], maxBytes: MODEL_FILE_LIMIT,
      models: storage ? await storage.list(tenantId, projectId) : [] });
  } catch (error) { next(error); }
});

router.post(prefix, (req, res, next) => {
  if (!store()) return res.status(503).json({ error: "Armazenamento privado de modelos não configurado" });
  upload.single("file")(req, res, error => {
    if (error) return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: "Envie um único GLB de até 45 MB" });
    next();
  });
}, async (req, res, next) => {
  if (!req.file || !/\.glb$/i.test(req.file.originalname)) return res.status(422).json({ error: "Envie um arquivo GLB no campo file" });
  const storage = store();
  if (!storage) return res.status(503).json({ error: "Armazenamento privado indisponível" });
  try {
    const { tenantId, projectId } = res.locals.modelScope;
    return res.status(201).json(await storage.save(tenantId, projectId, req.file.originalname, req.file.buffer));
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && /GLB|glTF|malhas|recursos|Modelo excede/.test(error.message)))
      return res.status(422).json({ error: "GLB inválido ou com recursos externos. Exporte com todas as texturas incorporadas." });
    next(error);
  }
});

// Staging-only conversion: requires a dedicated sandboxed Blender worker.
// Never enable on a general production API host without OS isolation.
router.post(`${prefix}/convert`, (req, res, next) => {
  if (process.env.ARQDOR_ENABLE_MODEL_CONVERSION !== "true")
    return res.status(503).json({ error: "Conversão OBJ/FBX não habilitada neste ambiente" });
  if (!store()) return res.status(503).json({ error: "Armazenamento privado não configurado" });
  upload.single("file")(req, res, error => {
    if (error) return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400)
      .json({ error: "Arquivo excede o limite ou upload inválido" });
    next();
  });
}, async (req, res, next) => {
  if (!req.file || !/\\.(obj|fbx)$/i.test(req.file.originalname))
    return res.status(422).json({ error: "Envie OBJ ou FBX no campo file" });
  const blender = process.env.ARQDOR_BLENDER_BINARY;
  const converter = process.env.ARQDOR_MODEL_CONVERTER_SCRIPT;
  if (!blender || !converter) return res.status(503).json({ error: "Conversor isolado não configurado" });
  const storage = store();
  if (!storage) return res.status(503).json({ error: "Armazenamento privado indisponível" });
  const { tenantId, projectId } = res.locals.modelScope;
  const extension = path.extname(req.file.originalname).toLowerCase();
  const sha256 = createHash("sha256").update(req.file.buffer).digest("hex");
  const workDir = await mkdtemp(path.join(tmpdir(), "arqdor-convert-"));
  try {
    const input = path.join(workDir, `source${extension}`);
    const output = path.join(workDir, "converted.glb");
    await writeFile(input, req.file.buffer, { flag: "wx", mode: 0o600 });
    const run = promisify(execFile);
    const conversionProcess = await run(blender, ["--background", "--python", converter, "--",
      "--input", input, "--output", output, "--sha256", sha256], {
      timeout: 180_000, maxBuffer: 1024 * 1024, cwd: workDir,
    });
    const converted = await readFile(output);
    // ModelFileStore.save validates GLB structure, embedded resources and limit.
    const model = await storage.save(tenantId, projectId, req.file.originalname + ".glb", converted);
    const reportLine = conversionProcess.stdout.split(/\\r?\\n/).reverse()
      .find(line => line.trim().startsWith('{"status": "converted_pending_geometry_review"'));
    if (!reportLine) throw new Error("Conversor não retornou relatório de geometria");
    const geometryReport = JSON.parse(reportLine) as Record<string, unknown>;
    const audit = await storage.attachConvertedSource(
      tenantId, projectId, model.id, req.file.originalname, req.file.buffer, sha256, geometryReport);
    return res.status(201).json({ model, conversion: audit });
  } catch (error) {
    if (error instanceof Error && /GLB|glTF|malhas|recursos|Modelo excede/.test(error.message))
      return res.status(422).json({ error: "Conversão inválida: GLB não passou pela validação" });
    next(error);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

router.get(`${prefix}/:modelId/file`, async (req, res, next) => {
  const storage = store();
  if (!storage) return res.status(503).json({ error: "Armazenamento privado indisponível" });
  try {
    const { tenantId, projectId } = res.locals.modelScope;
    const { buffer } = await storage.file(tenantId, projectId, safeSegment(String(req.params.modelId)));
    res.set({ "Content-Type": "model/gltf-binary", "Cache-Control": "private, no-store",
      "Content-Disposition": "attachment; filename=model.glb", "X-Content-Type-Options": "nosniff" });
    return res.send(buffer);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return res.status(404).json({ error: "Modelo não encontrado" });
    next(error);
  }
});

router.get(`${prefix}/:modelId/calibrations`, async (req, res, next) => {
  const storage = store();
  if (!storage) return res.status(503).json({ error: "Armazenamento privado indisponível" });
  try {
    const { tenantId, projectId } = res.locals.modelScope;
    return res.json(await storage.calibrations(tenantId, projectId, safeSegment(String(req.params.modelId))));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return res.status(404).json({ error: "Modelo não encontrado" });
    next(error);
  }
});

router.post(`${prefix}/:modelId/calibrations`, async (req, res, next) => {
  const storage = store();
  if (!storage) return res.status(503).json({ error: "Armazenamento privado indisponível" });
  try {
    const { tenantId, projectId, userId } = res.locals.modelScope;
    return res.status(201).json(await storage.saveCalibration(tenantId, projectId, safeSegment(String(req.params.modelId)), userId, req.body));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return res.status(404).json({ error: "Modelo não encontrado" });
    if (error instanceof Error && /medidas|Medidas|números|Tolerância/.test(error.message)) return res.status(422).json({ error: error.message });
    next(error);
  }
});


router.get(`${prefix}/:modelId/scene-settings`, async (req, res, next) => {
  const storage = store();
  if (!storage) return res.status(503).json({ error: "Armazenamento privado indisponível" });
  try {
    const { tenantId, projectId } = res.locals.modelScope;
    return res.json(await storage.sceneSettings(tenantId, projectId, safeSegment(String(req.params.modelId))));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return res.status(404).json({ error: "Modelo não encontrado" });
    next(error);
  }
});

router.put(`${prefix}/:modelId/scene-settings`, async (req, res, next) => {
  const storage = store();
  if (!storage) return res.status(503).json({ error: "Armazenamento privado indisponível" });
  try {
    const { tenantId, projectId, userId } = res.locals.modelScope;
    return res.json(await storage.saveSceneSettings(tenantId, projectId, safeSegment(String(req.params.modelId)), userId, req.body));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return res.status(404).json({ error: "Modelo não encontrado" });
    if (error instanceof Error && /inválid|fora do intervalo/.test(error.message)) return res.status(422).json({ error: error.message });
    next(error);
  }
});

export default router;
