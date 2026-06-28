/**
 * Prospector Flows — CRUD de fluxos de nutrição e seus steps.
 *
 * Todos os endpoints exigem autenticação (middleware global em routes/index.ts).
 * Isolamento: fluxos e steps são sempre filtrados pelo tenantId do JWT.
 */
import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import multer from "multer";
import {
  db,
  prospectorFlowStepsTable,
  prospectorFlowsTable,
} from "@workspace/db";
import type { PartnerLead } from "@workspace/db";
import { objectStorageClient } from "../lib/objectStorage.js";
import {
  generateMaterial,
} from "../services/contentGenerator.js";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTenantId(req: Parameters<typeof router.get>[1] extends (r: infer R, ...a: unknown[]) => unknown ? R : never): string {
  const id = (req as any).user?.tenantId as string | undefined;
  if (!id) throw Object.assign(new Error("tenantId ausente no token"), { status: 400 });
  return id;
}

/** Garante que o fluxo pertence ao tenant — lança 404 caso contrário. */
async function assertFlowOwnership(flowId: string, tenantId: string): Promise<void> {
  const [row] = await db
    .select({ id: prospectorFlowsTable.id })
    .from(prospectorFlowsTable)
    .where(
      and(
        eq(prospectorFlowsTable.id, flowId),
        eq(prospectorFlowsTable.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (!row) throw Object.assign(new Error("Fluxo não encontrado"), { status: 404 });
}

/** Mirrors the private parsePath in objectStorage.ts */
function parsePath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const parts = path.split("/");
  if (parts.length < 3) throw new Error(`Caminho inválido: ${path}`);
  return { bucketName: parts[1]!, objectName: parts.slice(2).join("/") };
}

async function saveUploadToStorage(
  buffer: Buffer,
  contentType: string,
  tenantId: string,
  stepId: string,
  originalName: string,
): Promise<string> {
  const privateDir = process.env["PRIVATE_OBJECT_DIR"];
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR não configurado");
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const subPath = `prospector-materials/${tenantId}/${stepId}/${Date.now()}_${safeName}`;
  const fullPath = `${privateDir}/${subPath}`;
  const { bucketName, objectName } = parsePath(fullPath);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  const domain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  const apiPath = `/api/storage/objects/${subPath}`;
  return domain ? `https://${domain}${apiPath}` : apiPath;
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const createFlowSchema = z.object({
  nome: z.string().min(1).max(200),
  segmento: z.string().max(100).optional(),
  ativo: z.boolean().optional().default(true),
});

const updateFlowSchema = z.object({
  nome: z.string().min(1).max(200).optional(),
  segmento: z.string().max(100).nullable().optional(),
  ativo: z.boolean().optional(),
});

const createStepSchema = z.object({
  ordem: z.number().int().min(1),
  canal: z.enum(["whatsapp", "email"]),
  delayHoras: z.number().int().min(0).optional().default(0),
  mensagemTemplate: z.string().max(5000).optional(),
  materialTipo: z.enum(["html", "pdf", "imagem"]).optional(),
  materialPrompt: z.string().max(5000).optional(),
  materialFonte: z.enum(["ia", "upload"]).optional(),
  materialPromptVars: z.record(z.string(), z.unknown()).optional(),
});

const updateStepSchema = createStepSchema.partial();

const previewSchema = z.object({
  nome: z.string().optional(),
  empresa: z.string().optional(),
  cidade: z.string().optional(),
  segmento: z.string().optional(),
});

// ── FLOWS ─────────────────────────────────────────────────────────────────────

// GET /prospector/flows — Lista fluxos do tenant com count de steps
router.get("/prospector/flows", async (req, res) => {
  const tenantId = getTenantId(req as any);

  const flows = await db
    .select({
      id: prospectorFlowsTable.id,
      tenantId: prospectorFlowsTable.tenantId,
      nome: prospectorFlowsTable.nome,
      segmento: prospectorFlowsTable.segmento,
      ativo: prospectorFlowsTable.ativo,
      createdAt: prospectorFlowsTable.createdAt,
      stepCount: sql<number>`count(${prospectorFlowStepsTable.id})::int`,
    })
    .from(prospectorFlowsTable)
    .leftJoin(
      prospectorFlowStepsTable,
      eq(prospectorFlowsTable.id, prospectorFlowStepsTable.flowId),
    )
    .where(eq(prospectorFlowsTable.tenantId, tenantId))
    .groupBy(prospectorFlowsTable.id)
    .orderBy(desc(prospectorFlowsTable.createdAt));

  return res.json(flows);
});

// POST /prospector/flows — Cria fluxo
router.post("/prospector/flows", async (req, res) => {
  const tenantId = getTenantId(req as any);

  const parsed = createFlowSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [flow] = await db
    .insert(prospectorFlowsTable)
    .values({ ...parsed.data, tenantId })
    .returning();

  return res.status(201).json(flow);
});

// PATCH /prospector/flows/:id — Edita fluxo
router.patch("/prospector/flows/:id", async (req, res) => {
  const tenantId = getTenantId(req as any);
  const flowId = String(req.params["id"]);

  const parsed = updateFlowSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [flow] = await db
    .update(prospectorFlowsTable)
    .set(parsed.data)
    .where(
      and(
        eq(prospectorFlowsTable.id, flowId),
        eq(prospectorFlowsTable.tenantId, tenantId),
      ),
    )
    .returning();

  if (!flow) {
    res.status(404).json({ error: "Fluxo não encontrado" });
    return;
  }

  return res.json(flow);
});

// DELETE /prospector/flows/:id — Remove fluxo (e steps por CASCADE)
router.delete("/prospector/flows/:id", async (req, res) => {
  const tenantId = getTenantId(req as any);
  const flowId = String(req.params["id"]);

  const [deleted] = await db
    .delete(prospectorFlowsTable)
    .where(
      and(
        eq(prospectorFlowsTable.id, flowId),
        eq(prospectorFlowsTable.tenantId, tenantId),
      ),
    )
    .returning({ id: prospectorFlowsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Fluxo não encontrado" });
    return;
  }

  return res.json({ ok: true });
});

// ── STEPS ─────────────────────────────────────────────────────────────────────

// GET /prospector/flows/:id/steps — Lista steps ordenados por ordem
router.get("/prospector/flows/:id/steps", async (req, res) => {
  const tenantId = getTenantId(req as any);
  const flowId = String(req.params["id"]);
  await assertFlowOwnership(flowId, tenantId);

  const steps = await db
    .select()
    .from(prospectorFlowStepsTable)
    .where(eq(prospectorFlowStepsTable.flowId, flowId))
    .orderBy(asc(prospectorFlowStepsTable.ordem));

  return res.json(steps);
});

// POST /prospector/flows/:id/steps — Cria step
router.post("/prospector/flows/:id/steps", async (req, res) => {
  const tenantId = getTenantId(req as any);
  const flowId = String(req.params["id"]);
  await assertFlowOwnership(flowId, tenantId);

  const parsed = createStepSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [step] = await db
    .insert(prospectorFlowStepsTable)
    .values({ ...parsed.data, flowId })
    .returning();

  return res.status(201).json(step);
});

// PATCH /prospector/flows/:id/steps/:stepId — Edita step
router.patch("/prospector/flows/:id/steps/:stepId", async (req, res) => {
  const tenantId = getTenantId(req as any);
  const flowId = String(req.params["id"]);
  const stepId = String(req.params["stepId"]);
  await assertFlowOwnership(flowId, tenantId);

  const parsed = updateStepSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [step] = await db
    .update(prospectorFlowStepsTable)
    .set(parsed.data)
    .where(
      and(
        eq(prospectorFlowStepsTable.id, stepId),
        eq(prospectorFlowStepsTable.flowId, flowId),
      ),
    )
    .returning();

  if (!step) {
    res.status(404).json({ error: "Step não encontrado" });
    return;
  }

  return res.json(step);
});

// DELETE /prospector/flows/:id/steps/:stepId — Remove step
router.delete("/prospector/flows/:id/steps/:stepId", async (req, res) => {
  const tenantId = getTenantId(req as any);
  const flowId = String(req.params["id"]);
  const stepId = String(req.params["stepId"]);
  await assertFlowOwnership(flowId, tenantId);

  const [deleted] = await db
    .delete(prospectorFlowStepsTable)
    .where(
      and(
        eq(prospectorFlowStepsTable.id, stepId),
        eq(prospectorFlowStepsTable.flowId, flowId),
      ),
    )
    .returning({ id: prospectorFlowStepsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Step não encontrado" });
    return;
  }

  return res.json({ ok: true });
});

// POST /prospector/flows/:id/steps/:stepId/upload — Upload de material
router.post(
  "/prospector/flows/:id/steps/:stepId/upload",
  upload.single("file"),
  async (req, res) => {
    const tenantId = getTenantId(req as any);
    const flowId = String(req.params["id"]);
    const stepId = String(req.params["stepId"]);
    await assertFlowOwnership(flowId, tenantId);

    if (!req.file) {
      res.status(400).json({ error: "Campo 'file' obrigatório (multipart/form-data)" });
      return;
    }

    const url = await saveUploadToStorage(
      req.file.buffer,
      req.file.mimetype,
      tenantId,
      stepId,
      req.file.originalname,
    );

    const [step] = await db
      .update(prospectorFlowStepsTable)
      .set({
        materialUploadUrl: url,
        materialUploadNome: req.file.originalname,
        materialFonte: "upload",
      })
      .where(
        and(
          eq(prospectorFlowStepsTable.id, stepId),
          eq(prospectorFlowStepsTable.flowId, flowId),
        ),
      )
      .returning();

    if (!step) {
      res.status(404).json({ error: "Step não encontrado" });
      return;
    }

    return res.json({ url, originalName: req.file.originalname, step });
  },
);

// POST /prospector/flows/:id/steps/:stepId/preview — Preview do material
router.post("/prospector/flows/:id/steps/:stepId/preview", async (req, res) => {
  const tenantId = getTenantId(req as any);
  const flowId = String(req.params["id"]);
  const stepId = String(req.params["stepId"]);
  await assertFlowOwnership(flowId, tenantId);

  const parsed = previewSchema.safeParse(req.body ?? {});
  const overrides = parsed.success ? parsed.data : {};

  const [step] = await db
    .select()
    .from(prospectorFlowStepsTable)
    .where(
      and(
        eq(prospectorFlowStepsTable.id, stepId),
        eq(prospectorFlowStepsTable.flowId, flowId),
      ),
    )
    .limit(1);

  if (!step) {
    res.status(404).json({ error: "Step não encontrado" });
    return;
  }

  // Lead fictício com os dados de preview
  const fakeLead: PartnerLead = {
    id: "preview-lead",
    tenantId,
    partnerId: null,
    nome: overrides.nome ?? "João Silva",
    empresa: overrides.empresa ?? "Distribuidora Exemplo",
    telefone: "(49) 99999-0000",
    email: "preview@example.com",
    objetivo: null,
    status: "novo",
    source: "prospector",
    prospectorJobId: null,
    googlePlaceId: null,
    score: 80,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Mescla cidade e segmento de preview em materialPromptVars do step
  const previewStep = {
    ...step,
    materialPromptVars: {
      ...(step.materialPromptVars as Record<string, unknown> ?? {}),
      ...(overrides.cidade ? { cidade: overrides.cidade } : { cidade: "Chapecó" }),
      ...(overrides.segmento ? { segmento: overrides.segmento } : { segmento: "materiais de construção" }),
    },
  };

  const url = await generateMaterial(previewStep, fakeLead);
  return res.json({ url });
});

export default router;
