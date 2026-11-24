import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { hotelTransaction } from "../lib/hotel-http.js";

const router: IRouter = Router();
const uuid = z.string().uuid();
const dateOnly = z.iso.date();
const text = (max = 180) => z.string().trim().min(1).max(max);
const optionalText = (max = 2000) => z.string().trim().max(max).nullish();
const nullableDate = z.iso.date().nullish();

function maintenanceAllowed(req: Express.Request, tenantId: string): boolean {
  const user = req.user;
  return Boolean(
    user?.sub
    && user.tenantId === tenantId
    && user.actorType !== "ai"
    && user.actorType !== "system",
  );
}

function datePlusDays(base: string, days: number): string {
  return new Date(Date.parse(`${base}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const assetInput = z.object({
  code: text(40),
  name: text(160),
  category: text(80).default("Geral"),
  locationType: z.enum(["room", "area"]).default("area"),
  roomId: uuid.nullish(),
  areaName: optionalText(120),
  brand: optionalText(80),
  model: optionalText(80),
  serialNumber: optionalText(120),
  status: z.enum(["active", "inactive"]).default("active"),
  notes: optionalText(4000),
}).strict();

const planInput = z.object({
  assetId: uuid,
  title: text(180),
  intervalDays: z.number().int().min(1).max(3650),
  lastDoneOn: nullableDate,
  nextDueOn: dateOnly,
  active: z.boolean().optional().default(true),
  notes: optionalText(2000),
}).strict();

const priority = z.enum(["low", "normal", "high", "urgent"]);
const woStatus = z.enum(["open", "in_progress", "waiting", "done", "cancelled"]);

const workOrderInput = z.object({
  title: text(180),
  description: optionalText(4000),
  category: text(80).default("Geral"),
  priority: priority.default("normal"),
  status: woStatus.default("open"),
  planId: uuid.nullish(),
  assetId: uuid.nullish(),
  roomId: uuid.nullish(),
  areaName: optionalText(120),
  assignedTo: optionalText(120),
  dueAt: z.string().trim().max(40).nullish(),
  completionNotes: optionalText(2000),
}).strict();

const checklistItem = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  title: text(180),
  requiresNote: z.boolean().optional().default(false),
});

const checklistTemplateInput = z.object({
  title: text(160),
  areaName: text(120).default("Geral"),
  frequency: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  active: z.boolean().optional().default(true),
  items: z.array(checklistItem).min(1).max(200),
}).strict();

const meterInput = z.object({
  name: text(160),
  kind: z.enum(["water", "gas", "energy", "temperature"]),
  unit: text(20),
  location: optionalText(120),
  active: z.boolean().optional().default(true),
}).strict();

const readingInput = z.object({
  readingDate: dateOnly,
  value: z.number().finite(),
  notes: optionalText(1000),
}).strict();

const documentInput = z.object({
  title: text(180),
  kind: text(80).default("Documento"),
  issuer: optionalText(120),
  validUntil: nullableDate,
  fileUrl: optionalText(1000),
  notes: optionalText(4000),
}).strict();

const assetPatch = assetInput.partial();
const planPatch = planInput.partial();
const workOrderPatch = workOrderInput.partial();
const checklistTemplatePatch = checklistTemplateInput.partial();
const meterPatch = meterInput.partial();
const documentPatch = documentInput.partial();

function dueDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

router.get("/tenants/:tenantId/hotelaria/manutencao/resumo", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const summary = await hotelTransaction(tenantId, async (client) => {
      const [orders, plans, checklists, assets, meters, documents] = await Promise.all([
        client.query(
          `SELECT
             count(*) FILTER (WHERE status IN ('open','in_progress','waiting'))::int AS abertos,
             count(*) FILTER (WHERE status IN ('open','in_progress','waiting') AND due_at IS NOT NULL AND due_at < now())::int AS atrasados,
             count(*) FILTER (WHERE status = 'done' AND completed_at >= date_trunc('month', now()))::int AS concluidos_mes
           FROM hotel_maintenance_work_orders WHERE tenant_id=$1`,
          [tenantId],
        ),
        client.query(
          `SELECT
             count(*) FILTER (WHERE active AND next_due_on < CURRENT_DATE)::int AS atrasados,
             count(*) FILTER (WHERE active AND next_due_on BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)::int AS proximos
           FROM hotel_maintenance_plans WHERE tenant_id=$1`,
          [tenantId],
        ),
        client.query(
          `SELECT
             count(*) FILTER (WHERE status='open')::int AS abertos,
             count(*) FILTER (WHERE status='done' AND run_date = CURRENT_DATE)::int AS concluidos_hoje
           FROM hotel_maintenance_checklist_runs WHERE tenant_id=$1 AND run_date = CURRENT_DATE`,
          [tenantId],
        ),
        client.query(
          `SELECT count(*)::int AS total, count(*) FILTER (WHERE status='inactive')::int AS inativos
           FROM hotel_maintenance_assets WHERE tenant_id=$1`,
          [tenantId],
        ),
        client.query(
          `SELECT count(*)::int AS total FROM hotel_maintenance_meters WHERE tenant_id=$1 AND active`,
          [tenantId],
        ),
        client.query(
          `SELECT
             count(*) FILTER (WHERE valid_until IS NOT NULL AND valid_until < CURRENT_DATE)::int AS vencidos,
             count(*) FILTER (WHERE valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + 30)::int AS vencendo
           FROM hotel_maintenance_documents WHERE tenant_id=$1`,
          [tenantId],
        ),
      ]);
      const upcomingOrders = await client.query(
        `SELECT id,title,area_name,priority,status,due_at
         FROM hotel_maintenance_work_orders
         WHERE tenant_id=$1 AND status IN ('open','in_progress','waiting')
         ORDER BY due_at NULLS LAST, opened_at DESC LIMIT 6`,
        [tenantId],
      );
      const upcomingPlans = await client.query(
        `SELECT p.id,p.title,p.next_due_on,a.name AS asset_name,a.code AS asset_code
         FROM hotel_maintenance_plans p
         JOIN hotel_maintenance_assets a ON a.tenant_id=p.tenant_id AND a.id=p.asset_id
         WHERE p.tenant_id=$1 AND p.active
         ORDER BY p.next_due_on LIMIT 6`,
        [tenantId],
      );
      const upcomingDocuments = await client.query(
        `SELECT id,title,kind,valid_until FROM hotel_maintenance_documents
         WHERE tenant_id=$1 AND valid_until IS NOT NULL
         ORDER BY valid_until LIMIT 6`,
        [tenantId],
      );
      return {
        chamados: orders.rows[0],
        preventiva: plans.rows[0],
        checklist: checklists.rows[0],
        equipamentos: assets.rows[0],
        medidores: meters.rows[0],
        documentos: documents.rows[0],
        proximos: {
          chamados: upcomingOrders.rows,
          preventivas: upcomingPlans.rows,
          documentos: upcomingDocuments.rows,
        },
      };
    });
    return res.json(summary);
  } catch {
    return res.status(500).json({ error: "Não foi possível carregar o resumo de manutenção." });
  }
});

// ---------------------------------------------------------------- Equipamentos
router.get("/tenants/:tenantId/hotelaria/manutencao/equipamentos", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const rows = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `SELECT a.id,a.code,a.name,a.category,a.location_type,a.room_id,a.area_name,
                a.brand,a.model,a.serial_number,a.status,a.notes,a.created_at,a.updated_at,
                r.code AS room_code,
                count(p.id) FILTER (WHERE p.active)::int AS planos_ativos,
                min(p.next_due_on) FILTER (WHERE p.active) AS proxima_manutencao
         FROM hotel_maintenance_assets a
         LEFT JOIN hotel_rooms r ON r.tenant_id=a.tenant_id AND r.id=a.room_id
         LEFT JOIN hotel_maintenance_plans p ON p.tenant_id=a.tenant_id AND p.asset_id=a.id
         WHERE a.tenant_id=$1
         GROUP BY a.id,r.code
         ORDER BY a.name`,
        [tenantId],
      )
    ).rows);
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Não foi possível listar os equipamentos." });
  }
});

router.post("/tenants/:tenantId/hotelaria/manutencao/equipamentos", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const input = assetInput.safeParse(req.body);
  if (!input.success) return res.status(422).json({ error: "Dados do equipamento inválidos." });
  const data = input.data;
  try {
    const row = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `INSERT INTO hotel_maintenance_assets
          (id,tenant_id,code,name,category,location_type,room_id,area_name,brand,model,serial_number,status,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [crypto.randomUUID(), tenantId, data.code, data.name, data.category, data.locationType,
          data.roomId ?? null, data.areaName ?? null, data.brand ?? null, data.model ?? null,
          data.serialNumber ?? null, data.status, data.notes ?? null],
      )
    ).rows[0]);
    return res.status(201).json(row);
  } catch {
    return res.status(409).json({ error: "Não foi possível salvar. Verifique se o código já existe." });
  }
});

router.patch("/tenants/:tenantId/hotelaria/manutencao/equipamentos/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  if (!uuid.safeParse(req.params.id).success) return res.status(422).json({ error: "Equipamento inválido." });
  const input = assetPatch.safeParse(req.body);
  if (!input.success || !Object.keys(input.data).length) return res.status(422).json({ error: "Dados inválidos." });
  const map: Record<string, string> = {
    code: "code", name: "name", category: "category", locationType: "location_type", roomId: "room_id",
    areaName: "area_name", brand: "brand", model: "model", serialNumber: "serial_number", status: "status", notes: "notes",
  };
  const values: unknown[] = [tenantId, req.params.id];
  const sets: string[] = [];
  for (const [key, column] of Object.entries(map)) {
    if (key in input.data) {
      values.push((input.data as Record<string, unknown>)[key] ?? null);
      sets.push(`${column}=$${values.length}`);
    }
  }
  try {
    const row = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `UPDATE hotel_maintenance_assets SET ${sets.join(",")},updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        values,
      )
    ).rows[0]);
    return row ? res.json(row) : res.status(404).json({ error: "Equipamento não encontrado." });
  } catch {
    return res.status(409).json({ error: "Não foi possível atualizar o equipamento." });
  }
});

router.delete("/tenants/:tenantId/hotelaria/manutencao/equipamentos/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    await hotelTransaction(tenantId, async (client) => {
      await client.query("DELETE FROM hotel_maintenance_assets WHERE tenant_id=$1 AND id=$2", [tenantId, req.params.id]);
    });
    return res.status(204).send();
  } catch {
    return res.status(500).json({ error: "Não foi possível excluir o equipamento." });
  }
});

// ----------------------------------------------------------------- Preventiva
router.get("/tenants/:tenantId/hotelaria/manutencao/planos", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const rows = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `SELECT p.*,a.name AS asset_name,a.code AS asset_code,a.area_name,a.room_id,
                r.code AS room_code
         FROM hotel_maintenance_plans p
         JOIN hotel_maintenance_assets a ON a.tenant_id=p.tenant_id AND a.id=p.asset_id
         LEFT JOIN hotel_rooms r ON r.tenant_id=a.tenant_id AND r.id=a.room_id
         WHERE p.tenant_id=$1
         ORDER BY p.active DESC,p.next_due_on`,
        [tenantId],
      )
    ).rows);
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Não foi possível listar os planos preventivos." });
  }
});

router.post("/tenants/:tenantId/hotelaria/manutencao/planos", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const input = planInput.safeParse(req.body);
  if (!input.success) return res.status(422).json({ error: "Dados do plano inválidos." });
  const data = input.data;
  try {
    const row = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `INSERT INTO hotel_maintenance_plans
          (id,tenant_id,asset_id,title,interval_days,last_done_on,next_due_on,active,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [crypto.randomUUID(), tenantId, data.assetId, data.title, data.intervalDays,
          data.lastDoneOn ?? null, data.nextDueOn, data.active, data.notes ?? null],
      )
    ).rows[0]);
    return res.status(201).json(row);
  } catch {
    return res.status(422).json({ error: "Não foi possível criar o plano. Confira o equipamento." });
  }
});

router.patch("/tenants/:tenantId/hotelaria/manutencao/planos/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const input = planPatch.safeParse(req.body);
  if (!input.success || !Object.keys(input.data).length) return res.status(422).json({ error: "Dados inválidos." });
  const map: Record<string, string> = {
    assetId: "asset_id", title: "title", intervalDays: "interval_days", lastDoneOn: "last_done_on",
    nextDueOn: "next_due_on", active: "active", notes: "notes",
  };
  const values: unknown[] = [tenantId, req.params.id];
  const sets: string[] = [];
  for (const [key, column] of Object.entries(map)) {
    if (key in input.data) {
      values.push((input.data as Record<string, unknown>)[key] ?? null);
      sets.push(`${column}=$${values.length}`);
    }
  }
  try {
    const row = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `UPDATE hotel_maintenance_plans SET ${sets.join(",")},updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        values,
      )
    ).rows[0]);
    return row ? res.json(row) : res.status(404).json({ error: "Plano não encontrado." });
  } catch {
    return res.status(422).json({ error: "Não foi possível atualizar o plano." });
  }
});

router.post("/tenants/:tenantId/hotelaria/manutencao/planos/:id/executar", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const body = z.object({
    performedOn: dateOnly.optional(),
    performedBy: optionalText(120),
    notes: optionalText(2000),
  }).strict().safeParse(req.body ?? {});
  if (!body.success) return res.status(422).json({ error: "Dados da execução inválidos." });
  const performedOn = body.data.performedOn ?? new Date().toISOString().slice(0, 10);
  try {
    const result = await hotelTransaction(tenantId, async (client) => {
      const plan = (await client.query(
        `SELECT p.*,a.name AS asset_name,a.room_id,a.area_name
         FROM hotel_maintenance_plans p JOIN hotel_maintenance_assets a
           ON a.tenant_id=p.tenant_id AND a.id=p.asset_id
         WHERE p.tenant_id=$1 AND p.id=$2`,
        [tenantId, req.params.id],
      )).rows[0];
      if (!plan) return null;
      const nextDue = datePlusDays(performedOn, plan.interval_days);
      const workOrder = (await client.query(
        `INSERT INTO hotel_maintenance_work_orders
          (id,tenant_id,plan_id,asset_id,room_id,area_name,title,description,category,priority,status,assigned_to,opened_by,completed_at,completion_notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Preventiva','normal','done',$9,$10,now(),$11)
         RETURNING *`,
        [crypto.randomUUID(), tenantId, plan.id, plan.asset_id, plan.room_id, plan.area_name,
          `Preventiva: ${plan.title}`, `Equipamento: ${plan.asset_name}`, body.data.performedBy ?? null,
          req.user?.sub ?? null, body.data.notes ?? null],
      )).rows[0];
      await client.query(
        `UPDATE hotel_maintenance_plans SET last_done_on=$3,next_due_on=$4,updated_at=now()
         WHERE tenant_id=$1 AND id=$2`,
        [tenantId, plan.id, performedOn, nextDue],
      );
      return { workOrder, nextDueOn: nextDue };
    });
    if (!result) return res.status(404).json({ error: "Plano não encontrado." });
    return res.status(201).json(result);
  } catch {
    return res.status(500).json({ error: "Não foi possível registrar a execução." });
  }
});

// -------------------------------------------------------- Chamados / OS
router.get("/tenants/:tenantId/hotelaria/manutencao/chamados", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const status = typeof req.query.status === "string" ? req.query.status : null;
  try {
    const rows = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `SELECT w.*,r.code AS room_code,a.name AS asset_name
         FROM hotel_maintenance_work_orders w
         LEFT JOIN hotel_rooms r ON r.tenant_id=w.tenant_id AND r.id=w.room_id
         LEFT JOIN hotel_maintenance_assets a ON a.tenant_id=w.tenant_id AND a.id=w.asset_id
         WHERE w.tenant_id=$1 AND ($2::text IS NULL OR w.status=$2)
         ORDER BY CASE w.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'waiting' THEN 2 WHEN 'done' THEN 3 ELSE 4 END,
                  w.due_at NULLS LAST, w.opened_at DESC
         LIMIT 300`,
        [tenantId, status],
      )
    ).rows);
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Não foi possível listar os chamados." });
  }
});

router.post("/tenants/:tenantId/hotelaria/manutencao/chamados", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const input = workOrderInput.safeParse(req.body);
  if (!input.success) return res.status(422).json({ error: "Dados do chamado inválidos." });
  const data = input.data;
  const due = dueDate(data.dueAt);
  if (data.dueAt && !due) return res.status(422).json({ error: "Prazo do chamado inválido." });
  try {
    const row = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `INSERT INTO hotel_maintenance_work_orders
          (id,tenant_id,plan_id,asset_id,room_id,area_name,title,description,category,priority,status,assigned_to,opened_by,due_at,completed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING *`,
        [crypto.randomUUID(), tenantId, data.planId ?? null, data.assetId ?? null, data.roomId ?? null,
          data.areaName ?? null, data.title, data.description ?? null, data.category, data.priority,
          data.status, data.assignedTo ?? null, req.user?.sub ?? null, due,
          data.status === "done" ? new Date() : null],
      )
    ).rows[0]);
    return res.status(201).json(row);
  } catch {
    return res.status(422).json({ error: "Não foi possível abrir o chamado." });
  }
});

router.patch("/tenants/:tenantId/hotelaria/manutencao/chamados/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const input = workOrderPatch.safeParse(req.body);
  if (!input.success || !Object.keys(input.data).length) return res.status(422).json({ error: "Dados inválidos." });
  const map: Record<string, string> = {
    title: "title", description: "description", category: "category", priority: "priority", status: "status",
    planId: "plan_id", assetId: "asset_id", roomId: "room_id", areaName: "area_name", assignedTo: "assigned_to",
  };
  const data = input.data as Record<string, unknown>;
  const values: unknown[] = [tenantId, req.params.id];
  const sets: string[] = [];
  for (const [key, column] of Object.entries(map)) {
    if (key in data) {
      values.push(data[key] ?? null);
      sets.push(`${column}=$${values.length}`);
    }
  }
  if ("dueAt" in data) {
    const due = dueDate(data.dueAt as string | null | undefined);
    values.push(due);
    sets.push(`due_at=$${values.length}`);
  }
  if ("completionNotes" in data) {
    values.push(data.completionNotes ?? null);
    sets.push(`completion_notes=$${values.length}`);
  }
  if (data.status === "done") sets.push("completed_at=now()");
  else if (data.status && data.status !== "done") sets.push("completed_at=NULL");
  try {
    const row = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `UPDATE hotel_maintenance_work_orders SET ${sets.join(",")},updated_at=now()
         WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        values,
      )
    ).rows[0]);
    return row ? res.json(row) : res.status(404).json({ error: "Chamado não encontrado." });
  } catch {
    return res.status(422).json({ error: "Não foi possível atualizar o chamado." });
  }
});

// ------------------------------------------------------------------ Checklist
router.get("/tenants/:tenantId/hotelaria/manutencao/checklists", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const rows = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `SELECT t.*,
                (SELECT count(*)::int FROM hotel_maintenance_checklist_runs r
                  WHERE r.tenant_id=t.tenant_id AND r.template_id=t.id AND r.run_date=CURRENT_DATE AND r.status='done') AS feito_hoje
         FROM hotel_maintenance_checklist_templates t
         WHERE t.tenant_id=$1 ORDER BY t.active DESC,t.title`,
        [tenantId],
      )
    ).rows);
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Não foi possível listar os checklists." });
  }
});

router.post("/tenants/:tenantId/hotelaria/manutencao/checklists", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const input = checklistTemplateInput.safeParse(req.body);
  if (!input.success) return res.status(422).json({ error: "Dados do checklist inválidos." });
  const data = input.data;
  const items = data.items.map((item) => ({
    id: item.id ?? crypto.randomUUID(), title: item.title, requiresNote: item.requiresNote,
  }));
  try {
    const row = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `INSERT INTO hotel_maintenance_checklist_templates
          (id,tenant_id,title,area_name,frequency,active,items)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,
        [crypto.randomUUID(), tenantId, data.title, data.areaName, data.frequency, data.active, JSON.stringify(items)],
      )
    ).rows[0]);
    return res.status(201).json(row);
  } catch {
    return res.status(422).json({ error: "Não foi possível criar o checklist." });
  }
});

router.patch("/tenants/:tenantId/hotelaria/manutencao/checklists/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const input = checklistTemplatePatch.safeParse(req.body);
  if (!input.success || !Object.keys(input.data).length) return res.status(422).json({ error: "Dados inválidos." });
  const data = input.data as Record<string, unknown>;
  const values: unknown[] = [tenantId, req.params.id];
  const sets: string[] = [];
  const map: Record<string, string> = { title: "title", areaName: "area_name", frequency: "frequency", active: "active" };
  for (const [key, column] of Object.entries(map)) {
    if (key in data) { values.push(data[key] ?? null); sets.push(`${column}=$${values.length}`); }
  }
  if ("items" in data) {
    const items = (data.items as Array<{ id?: string; title: string; requiresNote?: boolean }>).map((item) => ({
      id: item.id ?? crypto.randomUUID(), title: item.title, requiresNote: Boolean(item.requiresNote),
    }));
    values.push(JSON.stringify(items));
    sets.push(`items=$${values.length}::jsonb`);
  }
  try {
    const row = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `UPDATE hotel_maintenance_checklist_templates SET ${sets.join(",")},updated_at=now()
         WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        values,
      )
    ).rows[0]);
    return row ? res.json(row) : res.status(404).json({ error: "Checklist não encontrado." });
  } catch {
    return res.status(422).json({ error: "Não foi possível atualizar o checklist." });
  }
});

router.get("/tenants/:tenantId/hotelaria/manutencao/checklists/execucoes", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const runDate = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
    ? req.query.date : new Date().toISOString().slice(0, 10);
  try {
    const rows = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `SELECT r.*,t.title AS template_title,t.area_name,t.frequency
         FROM hotel_maintenance_checklist_runs r
         JOIN hotel_maintenance_checklist_templates t ON t.tenant_id=r.tenant_id AND t.id=r.template_id
         WHERE r.tenant_id=$1 AND r.run_date=$2 ORDER BY t.title`,
        [tenantId, runDate],
      )
    ).rows);
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Não foi possível listar as execuções." });
  }
});

router.post("/tenants/:tenantId/hotelaria/manutencao/checklists/:id/gerar", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const body = z.object({ date: dateOnly.optional() }).strict().safeParse(req.body ?? {});
  if (!body.success) return res.status(422).json({ error: "Data inválida." });
  const runDate = body.data.date ?? new Date().toISOString().slice(0, 10);
  try {
    const row = await hotelTransaction(tenantId, async (client) => {
      const template = (await client.query(
        "SELECT * FROM hotel_maintenance_checklist_templates WHERE tenant_id=$1 AND id=$2",
        [tenantId, req.params.id],
      )).rows[0];
      if (!template) return null;
      const items = (template.items as Array<{ id: string; title: string; requiresNote?: boolean }>).map((item) => ({
        id: item.id, title: item.title, requiresNote: Boolean(item.requiresNote), status: "pending", notes: null,
      }));
      const inserted = await client.query(
        `INSERT INTO hotel_maintenance_checklist_runs
          (id,tenant_id,template_id,run_date,status,items)
         VALUES ($1,$2,$3,$4,'open',$5::jsonb)
         ON CONFLICT (tenant_id,template_id,run_date) DO UPDATE SET updated_at=now()
         RETURNING *`,
        [crypto.randomUUID(), tenantId, template.id, runDate, JSON.stringify(items)],
      );
      return inserted.rows[0];
    });
    return row ? res.status(201).json(row) : res.status(404).json({ error: "Checklist não encontrado." });
  } catch {
    return res.status(500).json({ error: "Não foi possível iniciar o checklist." });
  }
});

router.patch("/tenants/:tenantId/hotelaria/manutencao/checklists/execucoes/:runId/itens/:itemId", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const body = z.object({
    status: z.enum(["pending", "ok", "problem"]),
    notes: optionalText(1000),
    createWorkOrder: z.boolean().optional().default(false),
    priority: priority.optional().default("normal"),
  }).strict().safeParse(req.body);
  if (!body.success) return res.status(422).json({ error: "Dados do item inválidos." });
  try {
    const result = await hotelTransaction(tenantId, async (client) => {
      const run = (await client.query(
        `SELECT r.*,t.title AS template_title,t.area_name
         FROM hotel_maintenance_checklist_runs r
         JOIN hotel_maintenance_checklist_templates t ON t.tenant_id=r.tenant_id AND t.id=r.template_id
         WHERE r.tenant_id=$1 AND r.id=$2 FOR UPDATE`,
        [tenantId, req.params.runId],
      )).rows[0];
      if (!run) return null;
      const items = run.items as Array<Record<string, unknown>>;
      const item = items.find((entry) => entry.id === req.params.itemId);
      if (!item) return "missing";
      item.status = body.data.status;
      item.notes = body.data.notes ?? null;
      item.checkedAt = new Date().toISOString();
      let workOrderId: string | null = null;
      if (body.data.status === "problem" && body.data.createWorkOrder) {
        workOrderId = crypto.randomUUID();
        await client.query(
          `INSERT INTO hotel_maintenance_work_orders
            (id,tenant_id,area_name,title,description,category,priority,status,opened_by)
           VALUES ($1,$2,$3,$4,$5,'Checklist',$6,'open',$7)`,
          [workOrderId, tenantId, run.area_name, `Checklist: ${item.title}`,
            body.data.notes ?? `Problema encontrado no checklist ${run.template_title}`,
            body.data.priority, req.user?.sub ?? null],
        );
        item.workOrderId = workOrderId;
      }
      const done = items.every((entry) => entry.status !== "pending");
      const updated = (await client.query(
        `UPDATE hotel_maintenance_checklist_runs
         SET items=$3::jsonb,status=$4,completed_by=$5,completed_at=$6,updated_at=now()
         WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        [tenantId, run.id, JSON.stringify(items), done ? "done" : "open",
          done ? req.user?.sub ?? null : null, done ? new Date() : null],
      )).rows[0];
      return { run: updated, workOrderId };
    });
    if (result === null) return res.status(404).json({ error: "Execução não encontrada." });
    if (result === "missing") return res.status(404).json({ error: "Item não encontrado." });
    return res.json(result);
  } catch {
    return res.status(500).json({ error: "Não foi possível atualizar o item." });
  }
});

// ------------------------------------------------------------------ Medidores
router.get("/tenants/:tenantId/hotelaria/manutencao/medidores", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const rows = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `SELECT m.*, l.valor AS ultima_leitura, l.reading_date AS ultima_data, l.anterior AS leitura_anterior,
                CASE WHEN l.valor IS NOT NULL AND l.anterior IS NOT NULL THEN l.valor - l.anterior END AS consumo
         FROM hotel_maintenance_meters m
         LEFT JOIN LATERAL (
           SELECT r.value AS valor,r.reading_date,
                  (SELECT value FROM hotel_maintenance_meter_readings p
                    WHERE p.tenant_id=r.tenant_id AND p.meter_id=r.meter_id AND p.reading_date < r.reading_date
                    ORDER BY p.reading_date DESC LIMIT 1) AS anterior
           FROM hotel_maintenance_meter_readings r
           WHERE r.tenant_id=m.tenant_id AND r.meter_id=m.id
           ORDER BY r.reading_date DESC LIMIT 1
         ) l ON true
         WHERE m.tenant_id=$1 ORDER BY m.active DESC,m.name`,
        [tenantId],
      )
    ).rows);
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Não foi possível listar os medidores." });
  }
});

router.post("/tenants/:tenantId/hotelaria/manutencao/medidores", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const input = meterInput.safeParse(req.body);
  if (!input.success) return res.status(422).json({ error: "Dados do medidor inválidos." });
  const data = input.data;
  try {
    const row = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `INSERT INTO hotel_maintenance_meters (id,tenant_id,name,kind,unit,location,active)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [crypto.randomUUID(), tenantId, data.name, data.kind, data.unit, data.location ?? null, data.active],
      )
    ).rows[0]);
    return res.status(201).json(row);
  } catch {
    return res.status(422).json({ error: "Não foi possível criar o medidor." });
  }
});

router.patch("/tenants/:tenantId/hotelaria/manutencao/medidores/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const input = meterPatch.safeParse(req.body);
  if (!input.success || !Object.keys(input.data).length) return res.status(422).json({ error: "Dados inválidos." });
  const data = input.data as Record<string, unknown>;
  const values: unknown[] = [tenantId, req.params.id];
  const sets: string[] = [];
  const map: Record<string, string> = { name: "name", kind: "kind", unit: "unit", location: "location", active: "active" };
  for (const [key, column] of Object.entries(map)) {
    if (key in data) { values.push(data[key] ?? null); sets.push(`${column}=$${values.length}`); }
  }
  try {
    const row = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `UPDATE hotel_maintenance_meters SET ${sets.join(",")},updated_at=now()
         WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        values,
      )
    ).rows[0]);
    return row ? res.json(row) : res.status(404).json({ error: "Medidor não encontrado." });
  } catch {
    return res.status(422).json({ error: "Não foi possível atualizar o medidor." });
  }
});

router.get("/tenants/:tenantId/hotelaria/manutencao/medidores/:id/leituras", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const rows = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `SELECT id,reading_date,value,notes,created_by,created_at
         FROM hotel_maintenance_meter_readings
         WHERE tenant_id=$1 AND meter_id=$2 ORDER BY reading_date DESC LIMIT 120`,
        [tenantId, req.params.id],
      )
    ).rows);
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Não foi possível listar as leituras." });
  }
});

router.post("/tenants/:tenantId/hotelaria/manutencao/medidores/:id/leituras", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const input = readingInput.safeParse(req.body);
  if (!input.success) return res.status(422).json({ error: "Leitura inválida." });
  const data = input.data;
  try {
    const row = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `INSERT INTO hotel_maintenance_meter_readings
          (id,tenant_id,meter_id,reading_date,value,notes,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (tenant_id,meter_id,reading_date)
         DO UPDATE SET value=EXCLUDED.value,notes=EXCLUDED.notes,created_by=EXCLUDED.created_by
         RETURNING *`,
        [crypto.randomUUID(), tenantId, req.params.id, data.readingDate, data.value, data.notes ?? null, req.user?.sub ?? null],
      )
    ).rows[0]);
    return res.status(201).json(row);
  } catch {
    return res.status(422).json({ error: "Não foi possível registrar a leitura. Confira o medidor." });
  }
});

// ---------------------------------------------------------------- Documentação
router.get("/tenants/:tenantId/hotelaria/manutencao/documentos", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const rows = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `SELECT *, CASE WHEN valid_until IS NULL THEN NULL ELSE valid_until - CURRENT_DATE END AS dias_para_vencer
         FROM hotel_maintenance_documents WHERE tenant_id=$1
         ORDER BY valid_until NULLS LAST,title`,
        [tenantId],
      )
    ).rows);
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Não foi possível listar os documentos." });
  }
});

router.post("/tenants/:tenantId/hotelaria/manutencao/documentos", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const input = documentInput.safeParse(req.body);
  if (!input.success) return res.status(422).json({ error: "Dados do documento inválidos." });
  const data = input.data;
  try {
    const row = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `INSERT INTO hotel_maintenance_documents
          (id,tenant_id,title,kind,issuer,valid_until,file_url,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [crypto.randomUUID(), tenantId, data.title, data.kind, data.issuer ?? null,
          data.validUntil ?? null, data.fileUrl ?? null, data.notes ?? null],
      )
    ).rows[0]);
    return res.status(201).json(row);
  } catch {
    return res.status(422).json({ error: "Não foi possível salvar o documento." });
  }
});

router.patch("/tenants/:tenantId/hotelaria/manutencao/documentos/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const input = documentPatch.safeParse(req.body);
  if (!input.success || !Object.keys(input.data).length) return res.status(422).json({ error: "Dados inválidos." });
  const data = input.data as Record<string, unknown>;
  const values: unknown[] = [tenantId, req.params.id];
  const sets: string[] = [];
  const map: Record<string, string> = {
    title: "title", kind: "kind", issuer: "issuer", validUntil: "valid_until", fileUrl: "file_url", notes: "notes",
  };
  for (const [key, column] of Object.entries(map)) {
    if (key in data) { values.push(data[key] ?? null); sets.push(`${column}=$${values.length}`); }
  }
  try {
    const row = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `UPDATE hotel_maintenance_documents SET ${sets.join(",")},updated_at=now()
         WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        values,
      )
    ).rows[0]);
    return row ? res.json(row) : res.status(404).json({ error: "Documento não encontrado." });
  } catch {
    return res.status(422).json({ error: "Não foi possível atualizar o documento." });
  }
});

router.delete("/tenants/:tenantId/hotelaria/manutencao/documentos/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!maintenanceAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    await hotelTransaction(tenantId, async (client) => {
      await client.query("DELETE FROM hotel_maintenance_documents WHERE tenant_id=$1 AND id=$2", [tenantId, req.params.id]);
    });
    return res.status(204).send();
  } catch {
    return res.status(500).json({ error: "Não foi possível excluir o documento." });
  }
});

export default router;
