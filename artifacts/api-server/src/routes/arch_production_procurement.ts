import { Router } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

interface WorkOrderPayload {
  projectId: string;
  proposalId?: string | null;
  proposalItemId?: string | null;
  budgetItemId?: string | null;
  specObjectId?: string | null;
  title: string;
  description?: string | null;
  type?: string;
  priority?: string;
  status?: string;
  item?: string | null;
  quantity?: number;
  unit?: string;
  materialName?: string | null;
  productName?: string | null;
  supplierName?: string | null;
  manufacturerName?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  estimatedCost?: number;
  actualCost?: number;
  notes?: string | null;
}

interface SupplierOrderPayload {
  projectId: string;
  workOrderId?: string | null;
  supplierName: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  item: string;
  quantity?: number;
  unit?: string;
  estimatedValue?: number;
  confirmedValue?: number;
  status?: string;
  expectedDelivery?: string | null;
  deliveredAt?: string | null;
  notes?: string | null;
}

function tenantId(req: any): string | null {
  return req?.user?.tenantId ?? req?.tenantId ?? null;
}

function requireTenant(req: any, res: any): string | null {
  const tid = tenantId(req);
  if (!tid) {
    res.status(403).json({ error: "Tenant ativo é obrigatório para operar a obra do ARQDOR." });
    return null;
  }
  return tid;
}

async function ownedObra(tid: string, obraId: string) {
  const result = await pool.query(
    `SELECT * FROM obras WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [obraId, tid],
  );
  return result.rows[0] ?? null;
}

async function ownedEtapa(tid: string, obraId: string, etapaId: string) {
  const result = await pool.query(
    `SELECT e.*
       FROM obra_etapas e
       INNER JOIN obras o ON o.id = e.obra_id
      WHERE e.id = $1 AND e.obra_id = $2 AND o.tenant_id = $3
      LIMIT 1`,
    [etapaId, obraId, tid],
  );
  return result.rows[0] ?? null;
}

function scheduleDate(value: unknown): Date | null {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  const date = new Date(`${text}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function scheduleIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function scheduleAddDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function scheduleDurationDays(start: Date, end: Date) {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function scheduleLatest(a: Date | null, b: Date) {
  return !a || b.getTime() > a.getTime() ? b : a;
}

type WorkCalendar = {
  segunda: boolean;
  terca: boolean;
  quarta: boolean;
  quinta: boolean;
  sexta: boolean;
  sabado: boolean;
  domingo: boolean;
  horasDia: number;
  feriados: string[];
};

const DEFAULT_WORK_CALENDAR: WorkCalendar = {
  segunda: true, terca: true, quarta: true, quinta: true, sexta: true,
  sabado: false, domingo: false, horasDia: 8, feriados: [],
};

function normalizeWorkCalendar(raw: any): WorkCalendar {
  const feriados = Array.isArray(raw?.feriados) ? raw.feriados.map((item: any) => String(item).slice(0, 10)) : [];
  return {
    segunda: raw?.segunda ?? true,
    terca: raw?.terca ?? true,
    quarta: raw?.quarta ?? true,
    quinta: raw?.quinta ?? true,
    sexta: raw?.sexta ?? true,
    sabado: raw?.sabado ?? false,
    domingo: raw?.domingo ?? false,
    horasDia: Number(raw?.horasDia ?? raw?.horas_dia ?? 8),
    feriados,
  };
}

function isWorkDay(date: Date, calendar: WorkCalendar) {
  if (calendar.feriados.includes(scheduleIso(date))) return false;
  const day = date.getUTCDay();
  if (day === 0) return calendar.domingo;
  if (day === 1) return calendar.segunda;
  if (day === 2) return calendar.terca;
  if (day === 3) return calendar.quarta;
  if (day === 4) return calendar.quinta;
  if (day === 5) return calendar.sexta;
  return calendar.sabado;
}

function nextWorkDay(date: Date, calendar: WorkCalendar) {
  let next = new Date(date);
  for (let guard = 0; guard < 370; guard++) {
    if (isWorkDay(next, calendar)) return next;
    next = scheduleAddDays(next, 1);
  }
  return next;
}

function addWorkDays(date: Date, days: number, calendar: WorkCalendar) {
  if (days <= 0) return nextWorkDay(date, calendar);
  let current = nextWorkDay(date, calendar);
  let remaining = days;
  while (remaining > 0) {
    current = scheduleAddDays(current, 1);
    if (isWorkDay(current, calendar)) remaining -= 1;
  }
  return current;
}

function workDurationDays(start: Date, end: Date, calendar: WorkCalendar) {
  let current = new Date(start);
  let count = 0;
  for (let guard = 0; guard < 5000 && current <= end; guard++) {
    if (isWorkDay(current, calendar)) count += 1;
    current = scheduleAddDays(current, 1);
  }
  return Math.max(1, count);
}

async function getWorkCalendar(tid: string, obraId: string): Promise<WorkCalendar> {
  const result = await pool.query(
    `SELECT * FROM obra_calendarios WHERE obra_id = $1 AND tenant_id = $2 LIMIT 1`,
    [obraId, tid],
  );
  return result.rows[0] ? normalizeWorkCalendar(result.rows[0]) : DEFAULT_WORK_CALENDAR;
}

async function addEvent(
  projectId: string,
  workOrderId: string | null,
  type: string,
  message: string,
  actorType = "system",
  metadata: Record<string, unknown> = {},
) {
  await pool.query(
    `INSERT INTO arch_execution_events (id, project_id, work_order_id, type, message, actor_type, metadata, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())`,
    [crypto.randomUUID(), projectId, workOrderId, type, message, actorType, JSON.stringify(metadata)],
  );
}

async function getProductionBundle(params: { tenantId?: string | null; projectId: string }) {
  const values: unknown[] = [params.projectId];
  const tenantClause = params.tenantId ? ` AND tenant_id = $${(values.push(params.tenantId), values.length)}` : "";

  const [wo, so, it, qc, ev] = await Promise.all([
    pool.query(`SELECT * FROM arch_work_orders WHERE project_id = $1${tenantClause} AND deleted_at IS NULL ORDER BY created_at DESC`, values),
    pool.query(`SELECT * FROM arch_supplier_orders WHERE project_id = $1${tenantClause} AND deleted_at IS NULL ORDER BY created_at DESC`, values),
    pool.query(`SELECT * FROM arch_installation_tasks WHERE project_id = $1${tenantClause} ORDER BY scheduled_date ASC NULLS LAST`, values),
    pool.query(`SELECT * FROM arch_quality_checks WHERE project_id = $1${tenantClause} ORDER BY created_at DESC`, values),
    pool.query(`SELECT * FROM arch_execution_events WHERE project_id = $1 ORDER BY created_at DESC LIMIT 80`, [params.projectId]),
  ]);

  return {
    workOrders: wo.rows,
    supplierOrders: so.rows,
    installationTasks: it.rows,
    qualityChecks: qc.rows,
    events: ev.rows,
  };
}

async function createWorkOrder(tId: string | null, payload: WorkOrderPayload) {
  const id = crypto.randomUUID();
  const result = await pool.query(
    `INSERT INTO arch_work_orders (
      id, tenant_id, project_id, proposal_id, proposal_item_id, budget_item_id, spec_object_id,
      title, description, type, priority, status,
      item, quantity, unit, material_name, product_name, supplier_name, manufacturer_name,
      planned_start, planned_end, estimated_cost, actual_cost, notes, created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,
      $8,$9,$10,$11,$12,
      $13,$14,$15,$16,$17,$18,$19,
      $20,$21,$22,$23,$24,now(),now()
    ) RETURNING *`,
    [
      id, tId, payload.projectId,
      payload.proposalId ?? null, payload.proposalItemId ?? null,
      payload.budgetItemId ?? null, payload.specObjectId ?? null,
      payload.title, payload.description ?? null,
      payload.type ?? "production", payload.priority ?? "medium", payload.status ?? "planned",
      payload.item ?? null,
      Number(payload.quantity ?? 1), payload.unit ?? "un",
      payload.materialName ?? null, payload.productName ?? null,
      payload.supplierName ?? null, payload.manufacturerName ?? null,
      payload.plannedStart ?? null, payload.plannedEnd ?? null,
      Number(payload.estimatedCost ?? 0), Number(payload.actualCost ?? 0), payload.notes ?? null,
    ],
  );
  await addEvent(payload.projectId, id, "created", "Ordem de execução criada.", "internal", { title: payload.title });
  return result.rows[0];
}

async function updateWorkOrder(id: string, tId: string | null, payload: Partial<WorkOrderPayload>) {
  const currentResult = await pool.query(`SELECT * FROM arch_work_orders WHERE id = $1`, [id]);
  const current = currentResult.rows[0];
  if (!current) return null;

  const allowed: Record<string, string> = {
    title: "title", description: "description", type: "type", priority: "priority", status: "status",
    item: "item", quantity: "quantity", unit: "unit",
    materialName: "material_name", productName: "product_name",
    supplierName: "supplier_name", manufacturerName: "manufacturer_name",
    plannedStart: "planned_start", plannedEnd: "planned_end",
    actualStart: "actual_start", actualEnd: "actual_end",
    estimatedCost: "estimated_cost", actualCost: "actual_cost", notes: "notes",
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, col] of Object.entries(allowed)) {
    if ((payload as Record<string, unknown>)[key] === undefined) continue;
    values.push((payload as Record<string, unknown>)[key]);
    sets.push(`${col} = $${values.length}`);
  }
  if (sets.length === 0) return current;
  values.push(new Date()); sets.push(`updated_at = $${values.length}`);
  values.push(id);
  let where = `id = $${values.length}`;
  if (tId) { values.push(tId); where += ` AND tenant_id = $${values.length}`; }
  const result = await pool.query(`UPDATE arch_work_orders SET ${sets.join(", ")} WHERE ${where} RETURNING *`, values);
  if (payload.status && payload.status !== current.status) {
    await addEvent(current.project_id, id, "status-change", `Status alterado para ${payload.status}.`, "internal", {
      from: current.status, to: payload.status,
    });
  }
  return result.rows[0] ?? null;
}

async function createSupplierOrder(tId: string | null, payload: SupplierOrderPayload) {
  const id = crypto.randomUUID();
  const result = await pool.query(
    `INSERT INTO arch_supplier_orders (
      id, tenant_id, project_id, work_order_id,
      supplier_name, contact_name, contact_phone, contact_email,
      item, quantity, unit, estimated_value, confirmed_value,
      status, requested_at, expected_delivery, notes, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),$15,$16,now(),now()) RETURNING *`,
    [
      id, tId, payload.projectId, payload.workOrderId ?? null,
      payload.supplierName, payload.contactName ?? null, payload.contactPhone ?? null, payload.contactEmail ?? null,
      payload.item, Number(payload.quantity ?? 1), payload.unit ?? "un",
      Number(payload.estimatedValue ?? 0), Number(payload.confirmedValue ?? 0),
      payload.status ?? "quote-requested", payload.expectedDelivery ?? null, payload.notes ?? null,
    ],
  );
  await addEvent(payload.projectId, payload.workOrderId ?? null, "supplier-request", "Pedido/cotação enviado ao fornecedor.", "internal", {
    supplierName: payload.supplierName, item: payload.item,
  });
  return result.rows[0];
}

async function updateSupplierOrder(id: string, tId: string | null, payload: Partial<SupplierOrderPayload>) {
  const currentResult = await pool.query(`SELECT * FROM arch_supplier_orders WHERE id = $1`, [id]);
  const current = currentResult.rows[0];
  if (!current) return null;
  const allowed: Record<string, string> = {
    supplierName: "supplier_name", contactName: "contact_name", contactPhone: "contact_phone", contactEmail: "contact_email",
    item: "item", quantity: "quantity", unit: "unit",
    estimatedValue: "estimated_value", confirmedValue: "confirmed_value",
    status: "status", expectedDelivery: "expected_delivery", deliveredAt: "delivered_at", notes: "notes",
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, col] of Object.entries(allowed)) {
    if ((payload as Record<string, unknown>)[key] === undefined) continue;
    values.push((payload as Record<string, unknown>)[key]);
    sets.push(`${col} = $${values.length}`);
  }
  if (sets.length === 0) return current;
  values.push(new Date()); sets.push(`updated_at = $${values.length}`);
  values.push(id);
  let where = `id = $${values.length}`;
  if (tId) { values.push(tId); where += ` AND tenant_id = $${values.length}`; }
  const result = await pool.query(`UPDATE arch_supplier_orders SET ${sets.join(", ")} WHERE ${where} RETURNING *`, values);
  if (payload.status && payload.status !== current.status) {
    await addEvent(current.project_id, current.work_order_id ?? null, "supplier-delivery", `Fornecedor atualizado para ${payload.status}.`, "internal", {
      supplierOrderId: id, from: current.status, to: payload.status,
    });
  }
  return result.rows[0] ?? null;
}

async function createOrdersFromApproval(tId: string | null, payload: {
  projectId: string;
  proposalId: string;
  onlyApprovedItems?: boolean;
}) {
  let where = `proposal_id = $1`;
  if (payload.onlyApprovedItems) where += ` AND approval_status = 'approved'`;
  const proposalItems = await pool.query(
    `SELECT * FROM arch_proposal_items WHERE ${where} ORDER BY sort_order ASC, created_at ASC`,
    [payload.proposalId],
  );
  for (const item of proposalItems.rows) {
    const exists = await pool.query(`SELECT id FROM arch_work_orders WHERE proposal_item_id = $1 AND deleted_at IS NULL LIMIT 1`, [item.id]);
    if (exists.rows[0]) continue;
    await createWorkOrder(tId, {
      projectId: payload.projectId,
      proposalId: payload.proposalId,
      proposalItemId: item.id,
      budgetItemId: item.budget_item_id ?? null,
      specObjectId: item.spec_object_id ?? null,
      title: `Executar: ${item.item}`,
      description: item.description ?? null,
      type: "production",
      priority: "medium",
      status: "planned",
      item: item.item,
      quantity: Number(item.quantity ?? 1),
      unit: item.unit ?? "un",
      estimatedCost: Number(item.total ?? 0),
      actualCost: 0,
      notes: "Criado automaticamente a partir da aprovação do cliente.",
    });
  }
  await addEvent(payload.projectId, null, "created", "Ordens geradas a partir da aprovação do cliente.", "system", { proposalId: payload.proposalId });
  return getProductionBundle({ tenantId: tId, projectId: payload.projectId });
}

const archProductionProcurementRouter = Router();

archProductionProcurementRouter.post("/arch/construction/ensure", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const projectId = String(req.body?.projectId ?? "").trim();
    const name = String(req.body?.name ?? "Projeto ARQDOR").trim() || "Projeto ARQDOR";
    if (!projectId) { res.status(400).json({ error: "projectId é obrigatório" }); return; }
    const marker = `[ARQDOR:${projectId}]`;
    let result = await pool.query(
      `SELECT * FROM obras WHERE tenant_id = $1 AND (descricao LIKE $2 OR lower(nome) = lower($3)) ORDER BY created_at DESC LIMIT 1`,
      [tid, `%${marker}%`, name],
    );
    let obra = result.rows[0];
    if (!obra) {
      const id = crypto.randomUUID();
      result = await pool.query(
        `INSERT INTO obras (
          id, tenant_id, nome, descricao, cliente_nome, status,
          orcamento_total, custo_realizado, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now()) RETURNING *`,
        [
          id, tid, name, `${marker} Obra operacional vinculada automaticamente ao projeto ARQDOR.`,
          req.body?.clientName ?? null,
          req.body?.status === "em_execucao" ? "em_andamento" : "planejamento",
          req.body?.budget ? String(req.body.budget) : null,
          "0",
        ],
      );
      obra = result.rows[0];
    }

    await pool.query(
      `UPDATE arch_projetos
          SET obra_id = $1,
              status = CASE
                WHEN $2 = 'em_execucao' THEN 'em_execucao'
                WHEN status IN ('briefing','orcamento') THEN 'aprovado'
                ELSE status
              END,
              portal_ativo = true,
              updated_at = now()
        WHERE id = $3 AND tenant_id = $4`,
      [obra.id, req.body?.status ?? null, projectId, tid],
    );

    res.json({ obra });
  } catch (err) {
    logger.error({ err }, "arch/construction/ensure error");
    next(err);
  }
});

archProductionProcurementRouter.get("/arch/construction/:obraId", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const obra = await ownedObra(tid, obraId);
    if (!obra) { res.status(404).json({ error: "Obra não encontrada" }); return; }
    const [etapasResult, diarioResult, comprasResult, medicoesResult, dependenciasResult] = await Promise.all([
      pool.query(`SELECT * FROM obra_etapas WHERE obra_id = $1 ORDER BY ordem ASC, created_at ASC`, [obraId]),
      pool.query(`SELECT * FROM obra_diario WHERE obra_id = $1 ORDER BY data DESC, created_at DESC`, [obraId]),
      pool.query(`SELECT * FROM compras_obras WHERE obra_id = $1 AND tenant_id = $2 ORDER BY created_at DESC`, [obraId, tid]),
      pool.query(
        `SELECT m.* FROM obra_etapa_medicoes m INNER JOIN obra_etapas e ON e.id = m.etapa_id WHERE e.obra_id = $1 ORDER BY m.created_at DESC`,
        [obraId],
      ),
      pool.query(
        `SELECT * FROM obra_etapa_dependencias WHERE obra_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`,
        [obraId, tid],
      ),
    ]);
    const etapas = etapasResult.rows;
    const weightedBase = etapas.reduce((sum: number, item: any) => sum + Number(item.peso_fisico ?? 0), 0);
    const percentualGeral = etapas.length
      ? weightedBase > 0
        ? etapas.reduce((sum: number, item: any) => sum + Number(item.percentual_executado ?? 0) * Number(item.peso_fisico ?? 0), 0) / weightedBase
        : etapas.reduce((sum: number, item: any) => sum + Number(item.percentual_executado ?? 0), 0) / etapas.length
      : 0;
    res.json({
      obra: { ...obra, percentualGeral },
      etapas,
      dependencias: dependenciasResult.rows,
      diario: diarioResult.rows,
      compras: comprasResult.rows,
      medicoes: medicoesResult.rows,
    });
  } catch (err) {
    logger.error({ err }, "arch/construction bundle error");
    next(err);
  }
});

archProductionProcurementRouter.get("/arch/construction/:obraId/baseline", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    if (!await ownedObra(tid, obraId)) { res.status(404).json({ error: "Obra não encontrada" }); return; }

    const baselineResult = await pool.query(
      `SELECT * FROM obra_baselines
        WHERE obra_id = $1 AND tenant_id = $2
        ORDER BY created_at DESC
        LIMIT 1`,
      [obraId, tid],
    );
    const baseline = baselineResult.rows[0] ?? null;
    if (!baseline) { res.json({ baseline: null, etapas: [] }); return; }

    const etapasResult = await pool.query(
      `SELECT * FROM obra_baseline_etapas
        WHERE baseline_id = $1
        ORDER BY created_at ASC`,
      [baseline.id],
    );
    res.json({ baseline, etapas: etapasResult.rows });
  } catch (err) {
    logger.error({ err }, "arch/construction baseline GET error");
    next(err);
  }
});

archProductionProcurementRouter.post("/arch/construction/:obraId/baseline", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    if (!await ownedObra(tid, obraId)) { res.status(404).json({ error: "Obra não encontrada" }); return; }

    const etapasResult = await pool.query(
      `SELECT id, nome, data_inicio_prevista, data_fim_prevista, custo_previsto, peso_fisico,
              equipe_nome, equipe_quantidade, horas_dia
         FROM obra_etapas
        WHERE obra_id = $1
        ORDER BY ordem ASC, created_at ASC`,
      [obraId],
    );
    if (!etapasResult.rows.length) {
      res.status(400).json({ error: "Adicione etapas antes de criar a linha de base" }); return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const baselineId = crypto.randomUUID();
      const baselineResult = await client.query(
        `INSERT INTO obra_baselines (id, tenant_id, obra_id, nome, observacao, created_at)
         VALUES ($1,$2,$3,$4,$5,now())
         RETURNING *`,
        [
          baselineId,
          tid,
          obraId,
          String(req.body?.nome ?? "Linha de base"),
          req.body?.observacao ? String(req.body.observacao) : null,
        ],
      );

      for (const etapa of etapasResult.rows) {
        await client.query(
          `INSERT INTO obra_baseline_etapas (
             id, baseline_id, etapa_id, nome, data_inicio_prevista, data_fim_prevista,
             custo_previsto, peso_fisico, equipe_nome, equipe_quantidade, horas_dia, created_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())`,
          [
            crypto.randomUUID(), baselineId, etapa.id, etapa.nome,
            etapa.data_inicio_prevista, etapa.data_fim_prevista,
            String(etapa.custo_previsto ?? 0), String(etapa.peso_fisico ?? 0),
            etapa.equipe_nome ?? null, Number(etapa.equipe_quantidade ?? 1), String(etapa.horas_dia ?? 8),
          ],
        );
      }
      await client.query("COMMIT");
      res.status(201).json({ baseline: baselineResult.rows[0], etapas: etapasResult.rows });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err }, "arch/construction baseline POST error");
    next(err);
  }
});

archProductionProcurementRouter.get("/arch/construction/:obraId/calendar", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    if (!await ownedObra(tid, obraId)) { res.status(404).json({ error: "Obra não encontrada" }); return; }
    res.json({ calendar: await getWorkCalendar(tid, obraId) });
  } catch (err) {
    logger.error({ err }, "arch/construction calendar GET error");
    next(err);
  }
});

archProductionProcurementRouter.put("/arch/construction/:obraId/calendar", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    if (!await ownedObra(tid, obraId)) { res.status(404).json({ error: "Obra não encontrada" }); return; }
    const calendar = normalizeWorkCalendar(req.body ?? {});
    const result = await pool.query(
      `INSERT INTO obra_calendarios (
         id, tenant_id, obra_id, segunda, terca, quarta, quinta, sexta, sabado, domingo, horas_dia, feriados, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,now(),now())
       ON CONFLICT (obra_id)
       DO UPDATE SET
         segunda = EXCLUDED.segunda, terca = EXCLUDED.terca, quarta = EXCLUDED.quarta,
         quinta = EXCLUDED.quinta, sexta = EXCLUDED.sexta, sabado = EXCLUDED.sabado,
         domingo = EXCLUDED.domingo, horas_dia = EXCLUDED.horas_dia,
         feriados = EXCLUDED.feriados, updated_at = now()
       RETURNING *`,
      [
        crypto.randomUUID(), tid, obraId,
        calendar.segunda, calendar.terca, calendar.quarta, calendar.quinta, calendar.sexta,
        calendar.sabado, calendar.domingo, String(calendar.horasDia), JSON.stringify(calendar.feriados),
      ],
    );
    res.json({ calendar: normalizeWorkCalendar(result.rows[0]) });
  } catch (err) {
    logger.error({ err }, "arch/construction calendar PUT error");
    next(err);
  }
});

archProductionProcurementRouter.post("/arch/construction/:obraId/plan-from-budget", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const projectId = String(req.body?.projectId ?? "");
    const obra = await ownedObra(tid, obraId);
    if (!obra) { res.status(404).json({ error: "Obra não encontrada" }); return; }
    if (!projectId) { res.status(400).json({ error: "projectId é obrigatório" }); return; }

    const budgetResult = await pool.query(
      `SELECT * FROM arch_budgets
        WHERE project_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1`,
      [projectId, tid],
    );
    const budget = budgetResult.rows[0];
    if (!budget) { res.status(404).json({ error: "Nenhum orçamento do Arqdor encontrado para este projeto" }); return; }

    const itemsResult = await pool.query(
      `SELECT * FROM arch_budget_items
        WHERE budget_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        ORDER BY sort_order ASC, created_at ASC`,
      [budget.id, tid],
    );
    if (!itemsResult.rows.length) {
      res.status(400).json({ error: "O orçamento não possui itens para gerar o planejamento" }); return;
    }

    type PhaseDef = {
      key: string;
      name: string;
      baseDays: number;
      patterns: RegExp[];
    };

    const phases: PhaseDef[] = [
      { key: "projeto", name: "Projeto e planejamento", baseDays: 5, patterns: [/projeto/i, /arquitet/i, /engenhar/i, /aprova/i, /licen/i, /alvar/i, /sondagem/i, /topograf/i] },
      { key: "preliminares", name: "Serviços preliminares", baseDays: 4, patterns: [/canteiro/i, /loca[cç][aã]o/i, /tapume/i, /demoli/i, /limpeza do terreno/i, /terraplen/i, /escava/i] },
      { key: "fundacao", name: "Fundação", baseDays: 7, patterns: [/funda[cç][aã]o/i, /sapata/i, /radier/i, /estaca/i, /baldrame/i, /bloco de funda/i] },
      { key: "estrutura", name: "Estrutura e vedações", baseDays: 12, patterns: [/estrutura/i, /concreto/i, /arma[cç][aã]o/i, /forma/i, /alvenaria/i, /tijolo/i, /bloco/i, /icf/i, /steel frame/i, /parede/i] },
      { key: "cobertura", name: "Cobertura", baseDays: 7, patterns: [/cobertura/i, /telha/i, /calha/i, /rufo/i, /tesoura/i, /madeiramento/i, /shingle/i] },
      { key: "instalacoes", name: "Instalações", baseDays: 10, patterns: [/el[eé]tric/i, /hidr[aá]ul/i, /sanit[aá]ri/i, /esgoto/i, /pluvial/i, /climatiza/i, /g[aá]s/i, /dados/i, /cabeamento/i, /ponto/i] },
      { key: "revestimentos", name: "Revestimentos", baseDays: 12, patterns: [/porcelanato/i, /cer[aâ]mica/i, /revestimento/i, /argamassa/i, /contrapiso/i, /basecoat/i, /drywall/i, /massa corrida/i, /forro/i, /gesso/i] },
      { key: "esquadrias", name: "Esquadrias e vidros", baseDays: 7, patterns: [/esquadria/i, /janela/i, /porta/i, /vidro/i, /pvc/i, /alum[ií]nio/i, /port[aã]o/i] },
      { key: "acabamentos", name: "Pintura e acabamentos", baseDays: 10, patterns: [/pintura/i, /tinta/i, /rodap[eé]/i, /acabamento/i, /marcenaria/i, /m[oó]vel/i, /bancada/i, /lou[cç]a/i, /metal/i, /lumin[aá]ria/i, /plafon/i] },
      { key: "externo", name: "Áreas externas", baseDays: 8, patterns: [/cal[cç]ada/i, /muro/i, /paisag/i, /piscina/i, /deck/i, /fachada/i, /paver/i, /dren/i, /extern/i] },
      { key: "entrega", name: "Limpeza, testes e entrega", baseDays: 4, patterns: [/limpeza final/i, /teste/i, /comission/i, /entrega/i, /vistoria/i, /as built/i] },
    ];

    const grouped = new Map<string, { def: PhaseDef; items: any[]; cost: number; quantity: number }>();
    for (const def of phases) grouped.set(def.key, { def, items: [], cost: 0, quantity: 0 });

    for (const item of itemsResult.rows) {
      const haystack = [
        item.item,
        item.description,
        item.type,
        item.product_name,
        item.material_name,
        item.manufacturer_name,
      ].filter(Boolean).join(" ");
      const def = phases.find((phase) => phase.patterns.some((pattern) => pattern.test(haystack)))
        ?? phases.find((phase) => phase.key === "acabamentos")!;
      const group = grouped.get(def.key)!;
      group.items.push(item);
      group.cost += Number(item.total ?? 0);
      group.quantity += Math.max(0, Number(item.quantity ?? 0));
    }

    const activeGroups = phases
      .map((def) => grouped.get(def.key)!)
      .filter((group) => group.items.length > 0);

    const totalCost = activeGroups.reduce((sum, group) => sum + group.cost, 0);
    const requestedStart = scheduleDate(req.body?.startDate) ?? new Date();
    let cursor = new Date(Date.UTC(
      requestedStart.getUTCFullYear(),
      requestedStart.getUTCMonth(),
      requestedStart.getUTCDate(),
      12, 0, 0,
    ));

    const existingResult = await pool.query(
      `SELECT * FROM obra_etapas WHERE obra_id = $1 ORDER BY ordem ASC, created_at ASC`,
      [obraId],
    );
    const existingByName = new Map(
      existingResult.rows.map((row: any) => [String(row.nome ?? "").trim().toLowerCase(), row]),
    );

    const created: any[] = [];
    const updated: any[] = [];
    const orderedIds: string[] = [];

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (let index = 0; index < activeGroups.length; index++) {
        const group = activeGroups[index]!;
        const quantityFactor = Math.min(8, Math.ceil(group.quantity / 50));
        const costFactor = group.cost > 0 ? Math.min(8, Math.ceil(group.cost / 50000)) : 0;
        const duration = Math.max(1, group.def.baseDays + quantityFactor + costFactor);
        const start = new Date(cursor);
        const end = scheduleAddDays(start, duration - 1);
        cursor = scheduleAddDays(end, 1);
        const weight = totalCost > 0 ? (group.cost / totalCost) * 100 : 100 / activeGroups.length;
        const existing = existingByName.get(group.def.name.toLowerCase());

        if (existing) {
          const result = await client.query(
            `UPDATE obra_etapas
                SET custo_previsto = CASE WHEN COALESCE(custo_previsto, 0)::numeric = 0 THEN $1 ELSE custo_previsto END,
                    peso_fisico = CASE WHEN COALESCE(peso_fisico, 0)::numeric = 0 THEN $2 ELSE peso_fisico END,
                    data_inicio_prevista = COALESCE(data_inicio_prevista, $3),
                    data_fim_prevista = COALESCE(data_fim_prevista, $4),
                    updated_at = now()
              WHERE id = $5 AND obra_id = $6
              RETURNING *`,
            [String(group.cost), String(weight), scheduleIso(start), scheduleIso(end), existing.id, obraId],
          );
          const row = result.rows[0];
          if (row) {
            updated.push(row);
            orderedIds.push(String(row.id));
          }
        } else {
          const id = crypto.randomUUID();
          const result = await client.query(
            `INSERT INTO obra_etapas (
              id, obra_id, nome, descricao, ordem,
              data_inicio_prevista, data_fim_prevista,
              status, percentual_executado, custo_previsto, peso_fisico, marco,
              created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pendente','0',$8,$9,false,now(),now())
            RETURNING *`,
            [
              id, obraId, group.def.name,
              `Gerada automaticamente a partir de ${group.items.length} item(ns) do orçamento ${budget.title ?? ""}`.trim(),
              index,
              scheduleIso(start), scheduleIso(end),
              String(group.cost), String(weight),
            ],
          );
          created.push(result.rows[0]);
          orderedIds.push(id);
        }
      }

      for (let i = 1; i < orderedIds.length; i++) {
        const etapaId = orderedIds[i]!;
        const predecessorId = orderedIds[i - 1]!;
        await client.query(
          `INSERT INTO obra_etapa_dependencias (
            id, tenant_id, obra_id, etapa_id, depende_de_etapa_id, tipo, defasagem_dias, created_at
          )
          SELECT $1,$2,$3,$4,$5,'FS',0,now()
          WHERE NOT EXISTS (
            SELECT 1
              FROM obra_etapa_dependencias
             WHERE obra_id = $3
               AND tenant_id = $2
               AND etapa_id = $4
               AND depende_de_etapa_id = $5
          )`,
          [crypto.randomUUID(), tid, obraId, etapaId, predecessorId],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    res.status(201).json({
      budget: { id: budget.id, title: budget.title, grandTotal: Number(budget.grand_total ?? totalCost) },
      generated: activeGroups.map((group, index) => ({
        key: group.def.key,
        name: group.def.name,
        itemCount: group.items.length,
        cost: group.cost,
        etapaId: orderedIds[index],
      })),
      createdCount: created.length,
      updatedCount: updated.length,
      startDate: activeGroups.length ? scheduleIso(scheduleDate(req.body?.startDate) ?? new Date()) : null,
      endDate: activeGroups.length ? scheduleIso(scheduleAddDays(cursor, -1)) : null,
    });
  } catch (err) {
    logger.error({ err }, "arch/construction plan-from-budget error");
    next(err);
  }
});

archProductionProcurementRouter.post("/arch/construction/:obraId/etapas", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    if (!await ownedObra(tid, obraId)) { res.status(404).json({ error: "Obra não encontrada" }); return; }
    const nome = String(req.body?.nome ?? "").trim();
    if (!nome) { res.status(400).json({ error: "Nome da etapa é obrigatório" }); return; }
    const custoPrevisto = Math.max(0, Number(req.body?.custoPrevisto ?? 0));
    const pesoFisico = Math.max(0, Math.min(100, Number(req.body?.pesoFisico ?? 0)));
    const result = await pool.query(
      `INSERT INTO obra_etapas (
        id, obra_id, nome, descricao, ordem, data_inicio_prevista, data_fim_prevista,
        status, percentual_executado, responsavel,
        equipe_nome, equipe_quantidade, horas_dia, custo_hora_pessoa, produtividade_dia,
        custo_previsto, peso_fisico, marco,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pendente','0',$8,$9,$10,$11,$12,$13,$14,$15,$16,now(),now()) RETURNING *`,
      [
        crypto.randomUUID(), obraId, nome, req.body?.descricao ?? null, Number(req.body?.ordem ?? 0),
        req.body?.dataInicioPrevista || null, req.body?.dataFimPrevista || null,
        req.body?.responsavel || null,
        req.body?.equipeNome || null,
        Math.max(1, Math.min(500, Number(req.body?.equipeQuantidade ?? 1))),
        String(Math.max(0.5, Math.min(24, Number(req.body?.horasDia ?? 8)))),
        String(Math.max(0, Number(req.body?.custoHoraPessoa ?? 0))),
        String(Math.max(0, Number(req.body?.produtividadeDia ?? 0))),
        String(custoPrevisto), String(pesoFisico), Boolean(req.body?.marco),
      ],
    );
    res.status(201).json({ etapa: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "arch/construction etapa error");
    next(err);
  }
});

archProductionProcurementRouter.patch("/arch/construction/:obraId/etapas/:etapaId", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const etapaId = String(req.params["etapaId"] ?? "");
    const current = await ownedEtapa(tid, obraId, etapaId);
    if (!current) { res.status(404).json({ error: "Etapa não encontrada" }); return; }

    const allowed: Record<string, { col: string; transform?: (value: any) => any }> = {
      nome: { col: "nome", transform: (value) => String(value).trim() },
      descricao: { col: "descricao" },
      ordem: { col: "ordem", transform: (value) => Number(value) },
      dataInicioPrevista: { col: "data_inicio_prevista", transform: (value) => value || null },
      dataFimPrevista: { col: "data_fim_prevista", transform: (value) => value || null },
      dataInicioReal: { col: "data_inicio_real", transform: (value) => value || null },
      dataFimReal: { col: "data_fim_real", transform: (value) => value || null },
      status: { col: "status", transform: (value) => String(value) },
      responsavel: { col: "responsavel", transform: (value) => value ? String(value) : null },
      equipeNome: { col: "equipe_nome", transform: (value) => value ? String(value) : null },
      equipeQuantidade: { col: "equipe_quantidade", transform: (value) => Math.max(1, Math.min(500, Number(value ?? 1))) },
      horasDia: { col: "horas_dia", transform: (value) => String(Math.max(0.5, Math.min(24, Number(value ?? 8)))) },
      custoHoraPessoa: { col: "custo_hora_pessoa", transform: (value) => String(Math.max(0, Number(value ?? 0))) },
      produtividadeDia: { col: "produtividade_dia", transform: (value) => String(Math.max(0, Number(value ?? 0))) },
      custoPrevisto: { col: "custo_previsto", transform: (value) => String(Math.max(0, Number(value ?? 0))) },
      pesoFisico: { col: "peso_fisico", transform: (value) => String(Math.max(0, Math.min(100, Number(value ?? 0)))) },
      marco: { col: "marco", transform: (value) => Boolean(value) },
    };
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, rule] of Object.entries(allowed)) {
      if (req.body?.[key] === undefined) continue;
      const transformed = rule.transform ? rule.transform(req.body[key]) : req.body[key];
      values.push(transformed);
      sets.push(`${rule.col} = $${values.length}`);
    }
    if (!sets.length) { res.json({ etapa: current }); return; }
    values.push(etapaId);
    values.push(obraId);
    const result = await pool.query(
      `UPDATE obra_etapas SET ${sets.join(", ")}, updated_at = now() WHERE id = $${values.length - 1} AND obra_id = $${values.length} RETURNING *`,
      values,
    );
    res.json({ etapa: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "arch/construction etapa PATCH error");
    next(err);
  }
});

archProductionProcurementRouter.post("/arch/construction/:obraId/level-resources", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    if (!await ownedObra(tid, obraId)) { res.status(404).json({ error: "Obra não encontrada" }); return; }

    const calendar = await getWorkCalendar(tid, obraId);
    const [etapasResult, depsResult] = await Promise.all([
      pool.query(
        `SELECT id, nome, ordem, status, marco, equipe_nome, equipe_quantidade,
                data_inicio_prevista, data_fim_prevista
           FROM obra_etapas
          WHERE obra_id = $1
          ORDER BY data_inicio_prevista ASC NULLS LAST, ordem ASC, created_at ASC`,
        [obraId],
      ),
      pool.query(
        `SELECT etapa_id, depende_de_etapa_id, tipo, defasagem_dias
           FROM obra_etapa_dependencias
          WHERE obra_id = $1 AND tenant_id = $2
          ORDER BY created_at ASC`,
        [obraId, tid],
      ),
    ]);

    const rows = etapasResult.rows;
    const original = new Map<string, { start: Date; end: Date }>();
    const planned = new Map<string, { start: Date; end: Date }>();
    const byId = new Map<string, any>();

    for (const row of rows) {
      const id = String(row.id);
      byId.set(id, row);
      const start = scheduleDate(row.data_inicio_prevista);
      const end = scheduleDate(row.data_fim_prevista);
      if (start && end) {
        original.set(id, { start, end });
        planned.set(id, { start: new Date(start), end: new Date(end) });
      }
    }

    const originalFinish = Array.from(original.values()).reduce<Date | null>(
      (latest, item) => !latest || item.end > latest ? item.end : latest,
      null,
    );

    const incoming = new Map<string, any[]>();
    const successors = new Map<string, any[]>();
    for (const dep of depsResult.rows) {
      const target = String(dep.etapa_id);
      const predecessor = String(dep.depende_de_etapa_id);
      incoming.set(target, [...(incoming.get(target) ?? []), dep]);
      successors.set(predecessor, [...(successors.get(predecessor) ?? []), dep]);
    }

    function constrainedStart(etapaId: string, duration: number, currentStart: Date) {
      let required = new Date(currentStart);
      for (const dep of incoming.get(etapaId) ?? []) {
        const pred = planned.get(String(dep.depende_de_etapa_id));
        if (!pred) continue;
        const lag = Number(dep.defasagem_dias ?? 0);
        const type = String(dep.tipo ?? "FS");
        let candidate: Date;
        if (type === "SS") {
          candidate = scheduleAddDays(pred.start, lag);
        } else if (type === "FF") {
          candidate = scheduleAddDays(scheduleAddDays(pred.end, lag), -(duration - 1));
        } else if (type === "SF") {
          candidate = scheduleAddDays(scheduleAddDays(pred.start, lag), -(duration - 1));
        } else {
          candidate = scheduleAddDays(pred.end, lag + 1);
        }
        if (candidate > required) required = candidate;
      }
      return required;
    }

    const resourceGroups = new Map<string, any[]>();
    for (const row of rows) {
      const name = String(row.equipe_nome ?? "").trim();
      const dates = planned.get(String(row.id));
      if (!name || !dates || row.marco) continue;
      const key = name.toLowerCase();
      resourceGroups.set(key, [...(resourceGroups.get(key) ?? []), row]);
    }

    const shifted = new Set<string>();
    const conflictsResolved: Array<{ equipe: string; etapaId: string; nome: string; days: number }> = [];

    for (const group of resourceGroups.values()) {
      group.sort((a, b) => {
        const aDates = planned.get(String(a.id))!;
        const bDates = planned.get(String(b.id))!;
        return aDates.start.getTime() - bDates.start.getTime() || Number(a.ordem ?? 0) - Number(b.ordem ?? 0);
      });

      let occupiedUntil: Date | null = null;
      for (const row of group) {
        const id = String(row.id);
        const dates = planned.get(id);
        if (!dates) continue;
        const duration = workDurationDays(dates.start, dates.end, calendar);
        const movable = String(row.status ?? "pendente") === "pendente";
        let required = constrainedStart(id, duration, dates.start);

        if (occupiedUntil && required <= occupiedUntil) {
          required = addWorkDays(occupiedUntil, 1, calendar);
        }

        if (required > dates.start && movable) {
          const delta = Math.max(0, Math.round((required.getTime() - dates.start.getTime()) / 86_400_000));
          planned.set(id, { start: required, end: addWorkDays(required, duration - 1, calendar) });
          shifted.add(id);
          conflictsResolved.push({
            equipe: String(row.equipe_nome),
            etapaId: id,
            nome: String(row.nome),
            days: delta,
          });
        }

        const effective = planned.get(id)!;
        if (!occupiedUntil || effective.end > occupiedUntil) occupiedUntil = effective.end;
      }
    }

    // Propagate all dependency constraints after resource leveling.
    const queue = Array.from(shifted);
    const guard = new Map<string, number>();
    while (queue.length) {
      const predecessorId = queue.shift()!;
      for (const dep of successors.get(predecessorId) ?? []) {
        const id = String(dep.etapa_id);
        const row = byId.get(id);
        const dates = planned.get(id);
        if (!row || !dates || String(row.status ?? "pendente") !== "pendente") continue;
        const duration = workDurationDays(dates.start, dates.end, calendar);
        const required = constrainedStart(id, duration, dates.start);
        if (required <= dates.start) continue;
        planned.set(id, { start: required, end: addWorkDays(required, duration - 1, calendar) });
        shifted.add(id);
        const seen = (guard.get(id) ?? 0) + 1;
        guard.set(id, seen);
        if (seen > rows.length) {
          res.status(409).json({ error: "Dependências inconsistentes impediram o nivelamento de recursos" });
          return;
        }
        queue.push(id);
      }
    }

    const newFinish = Array.from(planned.values()).reduce<Date | null>(
      (latest, item) => !latest || item.end > latest ? item.end : latest,
      null,
    );
    const finishImpactDays = originalFinish && newFinish
      ? Math.round((newFinish.getTime() - originalFinish.getTime()) / 86_400_000)
      : 0;

    if (req.body?.dryRun === true) {
      res.json({
        applied: false,
        shiftedCount: shifted.size,
        conflictsResolved,
        finishImpactDays,
        originalFinish: originalFinish ? scheduleIso(originalFinish) : null,
        newFinish: newFinish ? scheduleIso(newFinish) : null,
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const id of shifted) {
        const dates = planned.get(id);
        if (!dates) continue;
        await client.query(
          `UPDATE obra_etapas
              SET data_inicio_prevista = $1,
                  data_fim_prevista = $2,
                  updated_at = now()
            WHERE id = $3 AND obra_id = $4`,
          [scheduleIso(dates.start), scheduleIso(dates.end), id, obraId],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    res.json({
      applied: true,
      shiftedCount: shifted.size,
      conflictsResolved,
      finishImpactDays,
      originalFinish: originalFinish ? scheduleIso(originalFinish) : null,
      newFinish: newFinish ? scheduleIso(newFinish) : null,
    });
  } catch (err) {
    logger.error({ err }, "arch/construction level-resources error");
    next(err);
  }
});

archProductionProcurementRouter.post("/arch/construction/:obraId/etapas/:etapaId/reschedule", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const etapaId = String(req.params["etapaId"] ?? "");
    if (!await ownedObra(tid, obraId)) { res.status(404).json({ error: "Obra não encontrada" }); return; }

    const start = scheduleDate(req.body?.dataInicioPrevista);
    const end = scheduleDate(req.body?.dataFimPrevista);
    if (!start || !end || end.getTime() < start.getTime()) {
      res.status(400).json({ error: "Datas de início e término válidas são obrigatórias" }); return;
    }

    const [etapasResult, depsResult] = await Promise.all([
      pool.query(
        `SELECT id, nome, data_inicio_prevista, data_fim_prevista, marco
           FROM obra_etapas
          WHERE obra_id = $1
          ORDER BY ordem ASC, created_at ASC`,
        [obraId],
      ),
      pool.query(
        `SELECT id, etapa_id, depende_de_etapa_id, tipo, defasagem_dias
           FROM obra_etapa_dependencias
          WHERE obra_id = $1 AND tenant_id = $2
          ORDER BY created_at ASC`,
        [obraId, tid],
      ),
    ]);

    const byId = new Map<string, any>(etapasResult.rows.map((row: any) => [String(row.id), row]));
    const root = byId.get(etapaId);
    if (!root) { res.status(404).json({ error: "Etapa não encontrada" }); return; }

    const successors = new Map<string, any[]>();
    for (const dep of depsResult.rows) {
      const predecessorId = String(dep.depende_de_etapa_id);
      const list = successors.get(predecessorId) ?? [];
      list.push(dep);
      successors.set(predecessorId, list);
    }

    const planned = new Map<string, { start: Date; end: Date }>();
    for (const row of etapasResult.rows) {
      const rowStart = scheduleDate(row.data_inicio_prevista);
      const rowEnd = scheduleDate(row.data_fim_prevista);
      if (rowStart && rowEnd) planned.set(String(row.id), { start: rowStart, end: rowEnd });
    }
    planned.set(etapaId, { start, end });

    const changed = new Set<string>([etapaId]);
    const queue: string[] = [etapaId];
    const processed = new Map<string, number>();

    while (queue.length) {
      const predecessorId = queue.shift()!;
      const predecessor = planned.get(predecessorId);
      if (!predecessor) continue;

      for (const dep of successors.get(predecessorId) ?? []) {
        const successorId = String(dep.etapa_id);
        const successorRow = byId.get(successorId);
        const successor = planned.get(successorId);
        if (!successorRow || !successor) continue;

        const duration = scheduleDurationDays(successor.start, successor.end);
        const lag = Number(dep.defasagem_dias ?? 0);
        const type = String(dep.tipo ?? "FS");
        let requiredStart: Date;

        if (type === "SS") {
          requiredStart = scheduleAddDays(predecessor.start, lag);
        } else if (type === "FF") {
          const requiredEnd = scheduleAddDays(predecessor.end, lag);
          requiredStart = scheduleAddDays(requiredEnd, -(duration - 1));
        } else if (type === "SF") {
          const requiredEnd = scheduleAddDays(predecessor.start, lag);
          requiredStart = scheduleAddDays(requiredEnd, -(duration - 1));
        } else {
          requiredStart = scheduleAddDays(predecessor.end, lag + 1);
        }

        const depsForSuccessor = depsResult.rows.filter((item: any) => String(item.etapa_id) === successorId);
        let constrainedStart: Date | null = null;

        for (const incoming of depsForSuccessor) {
          const pred = planned.get(String(incoming.depende_de_etapa_id));
          if (!pred) continue;
          const incomingLag = Number(incoming.defasagem_dias ?? 0);
          const incomingType = String(incoming.tipo ?? "FS");
          let candidate: Date;
          if (incomingType === "SS") {
            candidate = scheduleAddDays(pred.start, incomingLag);
          } else if (incomingType === "FF") {
            candidate = scheduleAddDays(scheduleAddDays(pred.end, incomingLag), -(duration - 1));
          } else if (incomingType === "SF") {
            candidate = scheduleAddDays(scheduleAddDays(pred.start, incomingLag), -(duration - 1));
          } else {
            candidate = scheduleAddDays(pred.end, incomingLag + 1);
          }
          constrainedStart = scheduleLatest(constrainedStart, candidate);
        }

        constrainedStart = scheduleLatest(constrainedStart, requiredStart);
        if (!constrainedStart) continue;

        // Auto-schedule is conservative: it only pushes dependent work forward when
        // a constraint is violated. Earlier predecessor dates never erase a user's
        // manually planned buffer/float.
        if (successor.start.getTime() >= constrainedStart.getTime()) continue;

        const next = {
          start: constrainedStart,
          end: scheduleAddDays(constrainedStart, duration - 1),
        };
        planned.set(successorId, next);
        changed.add(successorId);

        const count = (processed.get(successorId) ?? 0) + 1;
        processed.set(successorId, count);
        if (count > etapasResult.rows.length) {
          res.status(409).json({ error: "Não foi possível recalcular o cronograma por dependências inconsistentes" });
          return;
        }
        queue.push(successorId);
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const id of changed) {
        const dates = planned.get(id);
        if (!dates) continue;
        await client.query(
          `UPDATE obra_etapas
              SET data_inicio_prevista = $1,
                  data_fim_prevista = $2,
                  updated_at = now()
            WHERE id = $3 AND obra_id = $4`,
          [scheduleIso(dates.start), scheduleIso(dates.end), id, obraId],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    res.json({
      updated: Array.from(changed).map((id) => {
        const dates = planned.get(id)!;
        return {
          etapaId: id,
          nome: byId.get(id)?.nome ?? "Etapa",
          dataInicioPrevista: scheduleIso(dates.start),
          dataFimPrevista: scheduleIso(dates.end),
          cascading: id !== etapaId,
        };
      }),
      cascadedCount: Math.max(0, changed.size - 1),
    });
  } catch (err) {
    logger.error({ err }, "arch/construction reschedule error");
    next(err);
  }
});

archProductionProcurementRouter.delete("/arch/construction/:obraId/etapas/:etapaId", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const etapaId = String(req.params["etapaId"] ?? "");
    if (!await ownedEtapa(tid, obraId, etapaId)) { res.status(404).json({ error: "Etapa não encontrada" }); return; }
    await pool.query(`DELETE FROM obra_etapas WHERE id = $1 AND obra_id = $2`, [etapaId, obraId]);
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "arch/construction etapa DELETE error");
    next(err);
  }
});

archProductionProcurementRouter.post("/arch/construction/:obraId/etapas/:etapaId/dependencias", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const etapaId = String(req.params["etapaId"] ?? "");
    const predecessorId = String(req.body?.dependeDeEtapaId ?? "");
    if (!predecessorId) { res.status(400).json({ error: "Etapa predecessora é obrigatória" }); return; }
    if (predecessorId === etapaId) { res.status(400).json({ error: "Uma etapa não pode depender de si mesma" }); return; }
    if (!await ownedEtapa(tid, obraId, etapaId) || !await ownedEtapa(tid, obraId, predecessorId)) {
      res.status(404).json({ error: "Etapa não encontrada nesta obra" }); return;
    }
    const cycle = await pool.query(
      `WITH RECURSIVE ancestors(node) AS (
         SELECT depende_de_etapa_id FROM obra_etapa_dependencias WHERE obra_id = $1 AND etapa_id = $2
         UNION
         SELECT d.depende_de_etapa_id
           FROM obra_etapa_dependencias d
           INNER JOIN ancestors a ON d.etapa_id = a.node
          WHERE d.obra_id = $1
       ) SELECT 1 FROM ancestors WHERE node = $3 LIMIT 1`,
      [obraId, predecessorId, etapaId],
    );
    if (cycle.rows[0]) { res.status(409).json({ error: "Dependência criaria um ciclo no cronograma" }); return; }
    const tipo = ["FS", "SS", "FF", "SF"].includes(String(req.body?.tipo ?? "FS")) ? String(req.body?.tipo ?? "FS") : "FS";
    const defasagemDias = Number.isFinite(Number(req.body?.defasagemDias)) ? Number(req.body.defasagemDias) : 0;
    const result = await pool.query(
      `INSERT INTO obra_etapa_dependencias (
         id, tenant_id, obra_id, etapa_id, depende_de_etapa_id, tipo, defasagem_dias, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,now())
       ON CONFLICT (etapa_id, depende_de_etapa_id)
       DO UPDATE SET tipo = EXCLUDED.tipo, defasagem_dias = EXCLUDED.defasagem_dias
       RETURNING *`,
      [crypto.randomUUID(), tid, obraId, etapaId, predecessorId, tipo, defasagemDias],
    );
    res.status(201).json({ dependencia: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "arch/construction dependencia POST error");
    next(err);
  }
});

archProductionProcurementRouter.delete("/arch/construction/:obraId/dependencias/:dependenciaId", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    if (!await ownedObra(tid, obraId)) { res.status(404).json({ error: "Obra não encontrada" }); return; }
    await pool.query(
      `DELETE FROM obra_etapa_dependencias WHERE id = $1 AND obra_id = $2 AND tenant_id = $3`,
      [String(req.params["dependenciaId"] ?? ""), obraId, tid],
    );
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "arch/construction dependencia DELETE error");
    next(err);
  }
});

archProductionProcurementRouter.post("/arch/construction/:obraId/diario", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    if (!await ownedObra(tid, obraId)) { res.status(404).json({ error: "Obra não encontrada" }); return; }
    const conteudo = String(req.body?.conteudo ?? "").trim();
    const data = String(req.body?.data ?? "").trim();
    if (!conteudo || !data) { res.status(400).json({ error: "Data e conteúdo são obrigatórios" }); return; }
    const result = await pool.query(
      `INSERT INTO obra_diario (
        id, obra_id, data, conteudo, responsavel_id, responsavel_nome, status,
        clima_tempo, mao_de_obra, observacoes, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,'rascunho',$7,$8,$9,now(),now()) RETURNING *`,
      [
        crypto.randomUUID(), obraId, data, conteudo,
        req?.user?.sub ?? null, req?.user?.name ?? req?.user?.email ?? null,
        req.body?.climaTempo ?? null,
        req.body?.maoDeObra === undefined || req.body?.maoDeObra === "" ? null : Number(req.body.maoDeObra),
        req.body?.observacoes ?? null,
      ],
    );
    res.status(201).json({ diario: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "arch/construction diario error");
    next(err);
  }
});

archProductionProcurementRouter.post("/arch/construction/:obraId/compras", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    if (!await ownedObra(tid, obraId)) { res.status(404).json({ error: "Obra não encontrada" }); return; }
    const descricao = String(req.body?.descricao ?? "").trim();
    if (!descricao) { res.status(400).json({ error: "Descrição da compra é obrigatória" }); return; }
    const quantidade = Number(req.body?.quantidade ?? 0);
    const valorUnitario = Number(req.body?.valorUnitario ?? 0);
    const valorTotal = req.body?.valorTotal === undefined ? quantidade * valorUnitario : Number(req.body.valorTotal);
    const result = await pool.query(
      `INSERT INTO compras_obras (
        id, tenant_id, obra_id, descricao, fornecedor, quantidade, valor_unitario,
        valor_total, status, data_prevista, observacoes, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now()) RETURNING *`,
      [
        crypto.randomUUID(), tid, obraId, descricao, req.body?.fornecedor ?? null,
        String(quantidade), String(valorUnitario), String(valorTotal), req.body?.status ?? "pendente",
        req.body?.dataPrevista || null, req.body?.observacoes ?? null,
      ],
    );
    res.status(201).json({ compra: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "arch/construction compra error");
    next(err);
  }
});

archProductionProcurementRouter.post("/arch/construction/:obraId/etapas/:etapaId/medicoes", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const etapaId = String(req.params["etapaId"] ?? "");
    if (!await ownedObra(tid, obraId)) { res.status(404).json({ error: "Obra não encontrada" }); return; }
    const etapa = await ownedEtapa(tid, obraId, etapaId);
    if (!etapa) { res.status(404).json({ error: "Etapa não encontrada" }); return; }
    const novo = Number(req.body?.percentualNovo ?? 0);
    if (!Number.isFinite(novo) || novo < 0 || novo > 100) {
      res.status(400).json({ error: "Percentual deve estar entre 0 e 100" }); return;
    }
    const medicaoResult = await pool.query(
      `INSERT INTO obra_etapa_medicoes (
        id, etapa_id, data, percentual_anterior, percentual_novo, responsavel_id,
        observacao, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,now()) RETURNING *`,
      [
        crypto.randomUUID(), etapaId, req.body?.data ?? new Date().toISOString().slice(0, 10),
        String(etapa.percentual_executado ?? 0), String(novo), req?.user?.sub ?? null,
        req.body?.observacao ?? null,
      ],
    );
    await pool.query(
      `UPDATE obra_etapas
          SET percentual_executado = $1,
              status = $2,
              data_inicio_real = CASE WHEN $1::numeric > 0 AND data_inicio_real IS NULL THEN CURRENT_DATE ELSE data_inicio_real END,
              data_fim_real = CASE WHEN $1::numeric >= 100 THEN CURRENT_DATE ELSE data_fim_real END,
              updated_at = now()
        WHERE id = $3 AND obra_id = $4`,
      [String(novo), novo >= 100 ? "concluida" : novo > 0 ? "em_andamento" : "pendente", etapaId, obraId],
    );
    res.status(201).json({ medicao: medicaoResult.rows[0] });
  } catch (err) {
    logger.error({ err }, "arch/construction medicao error");
    next(err);
  }
});

archProductionProcurementRouter.get("/arch/producao", async (req, res, next) => {
  try {
    const projectId = String(req.query["projectId"] ?? "");
    if (!projectId) { res.status(400).json({ error: "projectId é obrigatório" }); return; }
    const result = await getProductionBundle({ tenantId: tenantId(req), projectId });
    res.json(result);
  } catch (err) {
    logger.error({ err }, "arch/producao GET error");
    next(err);
  }
});

archProductionProcurementRouter.post("/arch/producao/from-approval", async (req, res, next) => {
  try {
    const result = await createOrdersFromApproval(tenantId(req), req.body);
    res.status(201).json(result);
  } catch (err) {
    logger.error({ err }, "arch/producao/from-approval error");
    next(err);
  }
});

archProductionProcurementRouter.post("/arch/producao/work-orders", async (req, res, next) => {
  try {
    const workOrder = await createWorkOrder(tenantId(req), req.body as WorkOrderPayload);
    res.status(201).json({ workOrder });
  } catch (err) {
    logger.error({ err }, "arch/producao/work-orders POST error");
    next(err);
  }
});

archProductionProcurementRouter.patch("/arch/producao/work-orders/:id", async (req, res, next) => {
  try {
    const workOrder = await updateWorkOrder(req.params["id"]!, tenantId(req), req.body as Partial<WorkOrderPayload>);
    if (!workOrder) { res.status(404).json({ error: "Ordem não encontrada" }); return; }
    res.json({ workOrder });
  } catch (err) {
    logger.error({ err }, "arch/producao/work-orders PATCH error");
    next(err);
  }
});

archProductionProcurementRouter.post("/arch/producao/supplier-orders", async (req, res, next) => {
  try {
    const supplierOrder = await createSupplierOrder(tenantId(req), req.body as SupplierOrderPayload);
    res.status(201).json({ supplierOrder });
  } catch (err) {
    logger.error({ err }, "arch/producao/supplier-orders POST error");
    next(err);
  }
});

archProductionProcurementRouter.patch("/arch/producao/supplier-orders/:id", async (req, res, next) => {
  try {
    const supplierOrder = await updateSupplierOrder(req.params["id"]!, tenantId(req), req.body as Partial<SupplierOrderPayload>);
    if (!supplierOrder) { res.status(404).json({ error: "Pedido de fornecedor não encontrado" }); return; }
    res.json({ supplierOrder });
  } catch (err) {
    logger.error({ err }, "arch/producao/supplier-orders PATCH error");
    next(err);
  }
});

export default archProductionProcurementRouter;
