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

function previousWorkDay(date: Date, calendar: WorkCalendar) {
  let previous = new Date(date);
  for (let guard = 0; guard < 370; guard++) {
    if (isWorkDay(previous, calendar)) return previous;
    previous = scheduleAddDays(previous, -1);
  }
  return previous;
}

function subtractWorkDays(date: Date, days: number, calendar: WorkCalendar) {
  if (days <= 0) return previousWorkDay(date, calendar);
  let current = previousWorkDay(date, calendar);
  let remaining = days;
  while (remaining > 0) {
    current = scheduleAddDays(current, -1);
    if (isWorkDay(current, calendar)) remaining -= 1;
  }
  return current;
}

function shiftWorkDays(date: Date, days: number, calendar: WorkCalendar) {
  return days >= 0 ? addWorkDays(date, days, calendar) : subtractWorkDays(date, Math.abs(days), calendar);
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

type CpmDependency = {
  etapa_id: string;
  depende_de_etapa_id: string;
  tipo?: string | null;
  defasagem_dias?: number | string | null;
};

type CpmStage = {
  id: string;
  nome?: string | null;
  data_inicio_prevista?: string | null;
  data_fim_prevista?: string | null;
  marco?: boolean | null;
};

function cpmConstraintWeight(
  predecessorDuration: number,
  successorDuration: number,
  type: string,
  lag: number,
) {
  if (type === "SS") return lag;
  if (type === "FF") return predecessorDuration - successorDuration + lag;
  if (type === "SF") return lag - successorDuration + 1;
  return predecessorDuration + lag; // FS
}

function buildCpm(
  stages: CpmStage[],
  dependencies: CpmDependency[],
  calendar: WorkCalendar,
) {
  const dated = stages
    .map((stage) => {
      const start = scheduleDate(stage.data_inicio_prevista);
      const end = scheduleDate(stage.data_fim_prevista);
      if (!start || !end) return null;
      return {
        id: String(stage.id),
        nome: String(stage.nome ?? "Etapa"),
        marco: Boolean(stage.marco),
        duration: Boolean(stage.marco) ? 1 : workDurationDays(start, end, calendar),
        plannedStart: start,
        plannedEnd: end,
      };
    })
    .filter(Boolean) as Array<{
      id: string;
      nome: string;
      marco: boolean;
      duration: number;
      plannedStart: Date;
      plannedEnd: Date;
    }>;

  if (!dated.length) {
    return {
      valid: true,
      projectStart: null,
      projectFinish: null,
      projectDurationDays: 0,
      criticalIds: [] as string[],
      stages: [] as any[],
    };
  }

  const byId = new Map(dated.map((stage) => [stage.id, stage]));
  const outgoing = new Map<string, Array<{ successorId: string; weight: number }>>();
  const incomingCount = new Map<string, number>(dated.map((stage) => [stage.id, 0]));

  for (const dep of dependencies) {
    const predecessorId = String(dep.depende_de_etapa_id ?? "");
    const successorId = String(dep.etapa_id ?? "");
    const predecessor = byId.get(predecessorId);
    const successor = byId.get(successorId);
    if (!predecessor || !successor || predecessorId === successorId) continue;

    const type = ["FS", "SS", "FF", "SF"].includes(String(dep.tipo ?? "FS"))
      ? String(dep.tipo ?? "FS")
      : "FS";
    const lag = Number(dep.defasagem_dias ?? 0);
    const weight = cpmConstraintWeight(predecessor.duration, successor.duration, type, lag);
    const list = outgoing.get(predecessorId) ?? [];
    list.push({ successorId, weight });
    outgoing.set(predecessorId, list);
    incomingCount.set(successorId, (incomingCount.get(successorId) ?? 0) + 1);
  }

  const queue = dated
    .filter((stage) => (incomingCount.get(stage.id) ?? 0) === 0)
    .map((stage) => stage.id);
  const topo: string[] = [];
  const workingIncoming = new Map(incomingCount);

  while (queue.length) {
    const id = queue.shift()!;
    topo.push(id);
    for (const edge of outgoing.get(id) ?? []) {
      const nextCount = (workingIncoming.get(edge.successorId) ?? 0) - 1;
      workingIncoming.set(edge.successorId, nextCount);
      if (nextCount === 0) queue.push(edge.successorId);
    }
  }

  if (topo.length !== dated.length) {
    return {
      valid: false,
      error: "O cronograma possui ciclo de dependências e o CPM não pode ser calculado.",
      projectStart: null,
      projectFinish: null,
      projectDurationDays: 0,
      criticalIds: [] as string[],
      stages: [] as any[],
    };
  }

  const earliestStart = new Map<string, number>(dated.map((stage) => [stage.id, 0]));
  for (const id of topo) {
    const current = earliestStart.get(id) ?? 0;
    for (const edge of outgoing.get(id) ?? []) {
      earliestStart.set(
        edge.successorId,
        Math.max(earliestStart.get(edge.successorId) ?? 0, current + edge.weight),
      );
    }
  }

  const earliestFinish = new Map<string, number>();
  let projectFinishOffset = 0;
  for (const stage of dated) {
    const ef = (earliestStart.get(stage.id) ?? 0) + stage.duration - 1;
    earliestFinish.set(stage.id, ef);
    projectFinishOffset = Math.max(projectFinishOffset, ef);
  }

  const latestStart = new Map<string, number>();
  for (const stage of dated) {
    latestStart.set(stage.id, projectFinishOffset - stage.duration + 1);
  }
  for (const id of [...topo].reverse()) {
    for (const edge of outgoing.get(id) ?? []) {
      const successorLs = latestStart.get(edge.successorId);
      if (successorLs === undefined) continue;
      latestStart.set(id, Math.min(latestStart.get(id) ?? successorLs, successorLs - edge.weight));
    }
  }

  const projectOrigin = dated.reduce(
    (earliest, stage) => stage.plannedStart < earliest ? stage.plannedStart : earliest,
    dated[0]!.plannedStart,
  );

  const resultStages = dated.map((stage) => {
    const es = earliestStart.get(stage.id) ?? 0;
    const ef = earliestFinish.get(stage.id) ?? es + stage.duration - 1;
    const ls = latestStart.get(stage.id) ?? es;
    const lf = ls + stage.duration - 1;
    const totalFloat = ls - es;

    const successorEdges = outgoing.get(stage.id) ?? [];
    const freeFloat = successorEdges.length
      ? Math.min(...successorEdges.map((edge) => {
          const successorEs = earliestStart.get(edge.successorId) ?? 0;
          return successorEs - (es + edge.weight);
        }))
      : projectFinishOffset - ef;

    return {
      etapaId: stage.id,
      nome: stage.nome,
      durationDays: stage.duration,
      esOffset: es,
      efOffset: ef,
      lsOffset: ls,
      lfOffset: lf,
      earlyStart: scheduleIso(shiftWorkDays(projectOrigin, es, calendar)),
      earlyFinish: scheduleIso(shiftWorkDays(projectOrigin, ef, calendar)),
      lateStart: scheduleIso(shiftWorkDays(projectOrigin, ls, calendar)),
      lateFinish: scheduleIso(shiftWorkDays(projectOrigin, lf, calendar)),
      totalFloatDays: totalFloat,
      freeFloatDays: Math.max(0, freeFloat),
      critical: totalFloat <= 0,
    };
  });

  const criticalIds = resultStages.filter((stage) => stage.critical).map((stage) => stage.etapaId);

  return {
    valid: true,
    projectStart: scheduleIso(projectOrigin),
    projectFinish: scheduleIso(shiftWorkDays(projectOrigin, projectFinishOffset, calendar)),
    projectDurationDays: projectFinishOffset + 1,
    criticalIds,
    stages: resultStages,
  };
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
      pool.query(
        `SELECT c.*,
                e.nome AS etapa_nome,
                COALESCE(c.data_necessidade, e.data_inicio_prevista) AS data_necessidade_calculada,
                CASE
                  WHEN COALESCE(c.data_necessidade, e.data_inicio_prevista) IS NULL THEN NULL
                  ELSE COALESCE(c.data_necessidade, e.data_inicio_prevista) - COALESCE(c.prazo_fornecedor_dias, 0)
                END AS data_limite_compra,
                CASE
                  WHEN lower(c.status) IN ('recebido','cancelado','concluido') THEN 'ok'
                  WHEN COALESCE(c.data_necessidade, e.data_inicio_prevista) IS NULL THEN 'sem_data'
                  WHEN (COALESCE(c.data_necessidade, e.data_inicio_prevista) - COALESCE(c.prazo_fornecedor_dias, 0)) < CURRENT_DATE THEN 'atrasado'
                  WHEN (COALESCE(c.data_necessidade, e.data_inicio_prevista) - COALESCE(c.prazo_fornecedor_dias, 0)) <= CURRENT_DATE + 7 THEN 'atencao'
                  ELSE 'ok'
                END AS risco_cronograma
           FROM compras_obras c
           LEFT JOIN obra_etapas e ON e.id = c.etapa_id AND e.obra_id = c.obra_id
          WHERE c.obra_id = $1 AND c.tenant_id = $2
          ORDER BY COALESCE(c.data_necessidade, e.data_inicio_prevista) ASC NULLS LAST, c.created_at DESC`,
        [obraId, tid],
      ),
      pool.query(
        `SELECT m.* FROM obra_etapa_medicoes m INNER JOIN obra_etapas e ON e.id = m.etapa_id WHERE e.obra_id = $1 ORDER BY m.created_at DESC`,
        [obraId],
      ),
      pool.query(
        `SELECT * FROM obra_etapa_dependencias WHERE obra_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`,
        [obraId, tid],
      ),
    ]);
    const maoObraApontadaResult = await pool.query(
      `SELECT COALESCE(SUM(custo_mao_obra), 0)::numeric AS total
         FROM obra_apontamentos_producao
        WHERE tenant_id = $1 AND obra_id = $2`,
      [tid, obraId],
    );
    const etapas = etapasResult.rows;
    const calendar = await getWorkCalendar(tid, obraId);
    const cpm = buildCpm(etapas, dependenciasResult.rows, calendar);
    const weightedBase = etapas.reduce((sum: number, item: any) => sum + Number(item.peso_fisico ?? 0), 0);
    const percentualGeral = etapas.length
      ? weightedBase > 0
        ? etapas.reduce((sum: number, item: any) => sum + Number(item.percentual_executado ?? 0) * Number(item.peso_fisico ?? 0), 0) / weightedBase
        : etapas.reduce((sum: number, item: any) => sum + Number(item.percentual_executado ?? 0), 0) / etapas.length
      : 0;

    const comprasRealizadas = comprasResult.rows
      .filter((item: any) => ["recebido", "parcial"].includes(String(item.status ?? "").toLowerCase()))
      .reduce((sum: number, item: any) => sum + Number(item.valor_total ?? 0), 0);

    const maoObraExecutadaEstimada = etapas.reduce((sum: number, item: any) => {
      const percentual = Math.max(0, Math.min(100, Number(item.percentual_executado ?? 0))) / 100;
      if (percentual <= 0) return sum;
      const start = scheduleDate(item.data_inicio_prevista);
      const end = scheduleDate(item.data_fim_prevista);
      if (!start || !end) return sum;
      const dias = scheduleDurationDays(start, end);
      const custoPlanejadoMaoObra = dias
        * Math.max(1, Number(item.equipe_quantidade ?? 1))
        * Math.max(0, Number(item.horas_dia ?? 8))
        * Math.max(0, Number(item.custo_hora_pessoa ?? 0));
      return sum + custoPlanejadoMaoObra * percentual;
    }, 0);

    const maoObraApontada = Number(maoObraApontadaResult.rows[0]?.total ?? 0);
    const maoObraConsiderada = maoObraApontada > 0 ? maoObraApontada : maoObraExecutadaEstimada;
    const custoRealizadoCalculado = comprasRealizadas + maoObraConsiderada;
    res.json({
      obra: {
        ...obra,
        percentualGeral,
        custoRealizadoCalculado,
        custoRealizadoDetalhe: {
          comprasRecebidas: comprasRealizadas,
          maoObraApontada,
          maoObraExecutadaEstimada,
          maoObraConsiderada,
          fonte: maoObraApontada > 0
            ? "compras_recebidas_mais_mao_obra_apontada_em_campo"
            : "compras_recebidas_mais_mao_obra_proporcional_ao_avanco",
        },
      },
      etapas,
      dependencias: dependenciasResult.rows,
      cpm,
      diario: diarioResult.rows,
      compras: comprasResult.rows,
      medicoes: medicoesResult.rows,
    });
  } catch (err) {
    logger.error({ err }, "arch/construction bundle error");
    next(err);
  }
});

archProductionProcurementRouter.get("/arch/construction/:obraId/cpm", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    if (!await ownedObra(tid, obraId)) { res.status(404).json({ error: "Obra não encontrada" }); return; }

    const [stagesResult, depsResult, calendar] = await Promise.all([
      pool.query(`SELECT id, nome, data_inicio_prevista, data_fim_prevista, marco FROM obra_etapas WHERE obra_id = $1 ORDER BY ordem ASC, created_at ASC`, [obraId]),
      pool.query(`SELECT etapa_id, depende_de_etapa_id, tipo, defasagem_dias FROM obra_etapa_dependencias WHERE obra_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`, [obraId, tid]),
      getWorkCalendar(tid, obraId),
    ]);

    const cpm = buildCpm(stagesResult.rows, depsResult.rows, calendar);
    if (!cpm.valid) {
      res.status(409).json(cpm);
      return;
    }
    res.json(cpm);
  } catch (err) {
    logger.error({ err }, "arch/construction CPM error");
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
      `SELECT abi.*,
              c.produtividade_dia AS composition_productivity_day,
              c.equipe_padrao AS composition_default_team,
              c.horas_dia_padrao AS composition_default_hours
         FROM arch_budget_items abi
         LEFT JOIN composicoes c
           ON c.id = abi.composition_id
          AND c.tenant_id = $2
        WHERE abi.budget_id = $1
          AND abi.tenant_id = $2
          AND abi.deleted_at IS NULL
        ORDER BY abi.sort_order ASC, abi.created_at ASC`,
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

    type PlanningGroup = {
      def: PhaseDef;
      items: any[];
      cost: number;
      quantity: number;
      productiveItems: number;
      effortPersonDays: number;
      suggestedTeam: number;
      suggestedHours: number;
      units: Set<string>;
    };

    const grouped = new Map<string, PlanningGroup>();
    for (const def of phases) grouped.set(def.key, {
      def,
      items: [],
      cost: 0,
      quantity: 0,
      productiveItems: 0,
      effortPersonDays: 0,
      suggestedTeam: 1,
      suggestedHours: 8,
      units: new Set<string>(),
    });

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
      const itemQuantity = Math.max(0, Number(item.quantity ?? 0));
      group.quantity += itemQuantity;
      if (item.unit) group.units.add(String(item.unit).trim().toLowerCase());

      const productivity = Math.max(0, Number(item.composition_productivity_day ?? 0));
      if (productivity > 0 && itemQuantity > 0) {
        group.productiveItems += 1;
        group.effortPersonDays += itemQuantity / productivity;
        group.suggestedTeam = Math.max(group.suggestedTeam, Math.max(1, Number(item.composition_default_team ?? 1)));
        group.suggestedHours = Math.max(group.suggestedHours, Math.max(0.5, Number(item.composition_default_hours ?? 8)));
      }
    }

    const activeGroups = phases
      .map((def) => grouped.get(def.key)!)
      .filter((group) => group.items.length > 0);

    const totalCost = activeGroups.reduce((sum, group) => sum + group.cost, 0);
    const calendar = await getWorkCalendar(tid, obraId);
    const requestedStart = scheduleDate(req.body?.startDate) ?? new Date();
    let cursor = nextWorkDay(new Date(Date.UTC(
      requestedStart.getUTCFullYear(),
      requestedStart.getUTCMonth(),
      requestedStart.getUTCDate(),
      12, 0, 0,
    )), calendar);

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
        const productivityDriven = group.items.length > 0
          && group.productiveItems === group.items.length
          && group.effortPersonDays > 0;
        const durationSource = productivityDriven ? "composition_productivity" : "heuristic";
        const duration = productivityDriven
          ? Math.max(1, Math.ceil(group.effortPersonDays / Math.max(1, group.suggestedTeam)))
          : Math.max(1, group.def.baseDays + quantityFactor + costFactor);
        const start = nextWorkDay(new Date(cursor), calendar);
        const end = addWorkDays(start, duration - 1, calendar);
        cursor = addWorkDays(end, 1, calendar);
        const stageProductivity = productivityDriven && group.units.size === 1 && group.effortPersonDays > 0
          ? group.quantity / group.effortPersonDays
          : 0;
        const weight = totalCost > 0 ? (group.cost / totalCost) * 100 : 100 / activeGroups.length;
        const existing = existingByName.get(group.def.name.toLowerCase());

        if (existing) {
          const result = await client.query(
            `UPDATE obra_etapas
                SET custo_previsto = CASE WHEN COALESCE(custo_previsto, 0)::numeric = 0 THEN $1 ELSE custo_previsto END,
                    peso_fisico = CASE WHEN COALESCE(peso_fisico, 0)::numeric = 0 THEN $2 ELSE peso_fisico END,
                    data_inicio_prevista = COALESCE(data_inicio_prevista, $3),
                    data_fim_prevista = COALESCE(data_fim_prevista, $4),
                    equipe_quantidade = CASE WHEN $5::boolean AND COALESCE(produtividade_dia, 0)::numeric = 0 THEN $6 ELSE equipe_quantidade END,
                    horas_dia = CASE WHEN $5::boolean AND COALESCE(produtividade_dia, 0)::numeric = 0 THEN $7 ELSE horas_dia END,
                    produtividade_dia = CASE WHEN $5::boolean AND COALESCE(produtividade_dia, 0)::numeric = 0 AND $8::numeric > 0 THEN $8 ELSE produtividade_dia END,
                    updated_at = now()
              WHERE id = $9 AND obra_id = $10
              RETURNING *`,
            [
              String(group.cost), String(weight), scheduleIso(start), scheduleIso(end),
              productivityDriven, group.suggestedTeam, String(group.suggestedHours), String(stageProductivity),
              existing.id, obraId,
            ],
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
              status, percentual_executado,
              equipe_quantidade, horas_dia, produtividade_dia,
              custo_previsto, peso_fisico, marco,
              created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pendente','0',$8,$9,$10,$11,$12,false,now(),now())
            RETURNING *`,
            [
              id, obraId, group.def.name,
              `Gerada automaticamente a partir de ${group.items.length} item(ns) do orçamento ${budget.title ?? ""}. Duração: ${duration} dia(s) via ${durationSource === "composition_productivity" ? "produtividade das composições" : "estimativa heurística"}.`.trim(),
              index,
              scheduleIso(start), scheduleIso(end),
              productivityDriven ? group.suggestedTeam : 1,
              String(productivityDriven ? group.suggestedHours : 8),
              String(productivityDriven ? stageProductivity : 0),
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
      generated: activeGroups.map((group, index) => {
        const productivityDriven = group.items.length > 0
          && group.productiveItems === group.items.length
          && group.effortPersonDays > 0;
        return {
          key: group.def.key,
          name: group.def.name,
          itemCount: group.items.length,
          productiveItems: group.productiveItems,
          productivityCoverage: group.items.length ? group.productiveItems / group.items.length : 0,
          durationSource: productivityDriven ? "composition_productivity" : "heuristic",
          suggestedTeam: productivityDriven ? group.suggestedTeam : null,
          cost: group.cost,
          etapaId: orderedIds[index],
        };
      }),
      createdCount: created.length,
      updatedCount: updated.length,
      startDate: activeGroups.length ? scheduleIso(scheduleDate(req.body?.startDate) ?? new Date()) : null,
      endDate: activeGroups.length ? scheduleIso(subtractWorkDays(cursor, 1, calendar)) : null,
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

archProductionProcurementRouter.post("/arch/construction/:obraId/simulate-scenario", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    if (!await ownedObra(tid, obraId)) { res.status(404).json({ error: "Obra não encontrada" }); return; }

    const selectedEtapaId = req.body?.etapaId ? String(req.body.etapaId) : null;
    const extraPeople = Math.max(-499, Math.min(499, Number(req.body?.extraPeople ?? 0)));
    const delayDays = Math.max(0, Math.min(365, Number(req.body?.delayDays ?? 0)));
    const workSaturday = Boolean(req.body?.workSaturday);

    const baseCalendar = await getWorkCalendar(tid, obraId);
    const calendar: WorkCalendar = { ...baseCalendar, sabado: workSaturday ? true : baseCalendar.sabado };

    const [etapasResult, depsResult] = await Promise.all([
      pool.query(
        `SELECT id, nome, ordem, status, marco, equipe_nome, equipe_quantidade, horas_dia,
                custo_hora_pessoa, custo_previsto, data_inicio_prevista, data_fim_prevista
           FROM obra_etapas
          WHERE obra_id = $1
          ORDER BY ordem ASC, created_at ASC`,
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
    const planned = new Map<string, { start: Date; end: Date }>();
    const original = new Map<string, { start: Date; end: Date }>();
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

    const incoming = new Map<string, any[]>();
    const successors = new Map<string, any[]>();
    for (const dep of depsResult.rows) {
      const target = String(dep.etapa_id);
      const predecessor = String(dep.depende_de_etapa_id);
      incoming.set(target, [...(incoming.get(target) ?? []), dep]);
      successors.set(predecessor, [...(successors.get(predecessor) ?? []), dep]);
    }

    const originalFinish = Array.from(original.values()).reduce<Date | null>(
      (latest, item) => !latest || item.end > latest ? item.end : latest,
      null,
    );

    let originalLaborCost = 0;
    let scenarioLaborCost = 0;

    for (const row of rows) {
      const id = String(row.id);
      const dates = planned.get(id);
      if (!dates || row.marco) continue;

      const oldPeople = Math.max(1, Number(row.equipe_quantidade ?? 1));
      const hours = Math.max(0, Number(row.horas_dia ?? calendar.horasDia));
      const hourly = Math.max(0, Number(row.custo_hora_pessoa ?? 0));
      const oldDuration = workDurationDays(dates.start, dates.end, baseCalendar);
      originalLaborCost += oldDuration * oldPeople * hours * hourly;

      if (selectedEtapaId === id && extraPeople !== 0 && String(row.status ?? "pendente") === "pendente") {
        const newPeople = Math.max(1, oldPeople + extraPeople);
        const effortPersonDays = oldDuration * oldPeople;
        const newDuration = Math.max(1, Math.ceil(effortPersonDays / newPeople));
        planned.set(id, {
          start: dates.start,
          end: addWorkDays(dates.start, newDuration - 1, calendar),
        });
      } else if (workSaturday) {
        const duration = workDurationDays(dates.start, dates.end, baseCalendar);
        planned.set(id, {
          start: nextWorkDay(dates.start, calendar),
          end: addWorkDays(nextWorkDay(dates.start, calendar), duration - 1, calendar),
        });
      }
    }

    if (selectedEtapaId && delayDays > 0) {
      const dates = planned.get(selectedEtapaId);
      const row = byId.get(selectedEtapaId);
      if (dates && row && String(row.status ?? "pendente") === "pendente") {
        const duration = workDurationDays(dates.start, dates.end, calendar);
        const delayedStart = addWorkDays(dates.start, delayDays, calendar);
        planned.set(selectedEtapaId, {
          start: delayedStart,
          end: addWorkDays(delayedStart, duration - 1, calendar),
        });
      }
    }

    function constrainedStart(etapaId: string, duration: number, currentStart: Date) {
      let required = nextWorkDay(currentStart, calendar);
      for (const dep of incoming.get(etapaId) ?? []) {
        const pred = planned.get(String(dep.depende_de_etapa_id));
        if (!pred) continue;
        const lag = Number(dep.defasagem_dias ?? 0);
        const type = String(dep.tipo ?? "FS");
        let candidate: Date;
        if (type === "SS") {
          candidate = shiftWorkDays(pred.start, lag, calendar);
        } else if (type === "FF") {
          const requiredEnd = shiftWorkDays(pred.end, lag, calendar);
          candidate = subtractWorkDays(requiredEnd, duration - 1, calendar);
        } else if (type === "SF") {
          const requiredEnd = shiftWorkDays(pred.start, lag, calendar);
          candidate = subtractWorkDays(requiredEnd, duration - 1, calendar);
        } else {
          candidate = shiftWorkDays(pred.end, lag + 1, calendar);
        }
        if (candidate > required) required = candidate;
      }
      return nextWorkDay(required, calendar);
    }

    const seeds = selectedEtapaId ? [selectedEtapaId] : rows.map((row: any) => String(row.id));
    const queue = [...seeds];
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
        const seen = (guard.get(id) ?? 0) + 1;
        guard.set(id, seen);
        if (seen > rows.length) {
          res.status(409).json({ error: "Dependências inconsistentes impediram a simulação" });
          return;
        }
        queue.push(id);
      }
    }

    for (const row of rows) {
      const id = String(row.id);
      const dates = planned.get(id);
      if (!dates || row.marco) continue;
      const oldPeople = Math.max(1, Number(row.equipe_quantidade ?? 1));
      const people = selectedEtapaId === id ? Math.max(1, oldPeople + extraPeople) : oldPeople;
      const hours = Math.max(0, Number(row.horas_dia ?? calendar.horasDia));
      const hourly = Math.max(0, Number(row.custo_hora_pessoa ?? 0));
      const duration = workDurationDays(dates.start, dates.end, calendar);
      scenarioLaborCost += duration * people * hours * hourly;
    }

    const newFinish = Array.from(planned.values()).reduce<Date | null>(
      (latest, item) => !latest || item.end > latest ? item.end : latest,
      null,
    );

    const changedStages = rows
      .map((row: any) => {
        const id = String(row.id);
        const before = original.get(id);
        const after = planned.get(id);
        if (!before || !after) return null;
        const startDelta = Math.round((after.start.getTime() - before.start.getTime()) / 86_400_000);
        const endDelta = Math.round((after.end.getTime() - before.end.getTime()) / 86_400_000);
        if (!startDelta && !endDelta) return null;
        return {
          etapaId: id,
          nome: String(row.nome),
          startDeltaDays: startDelta,
          endDeltaDays: endDelta,
          newStart: scheduleIso(after.start),
          newEnd: scheduleIso(after.end),
        };
      })
      .filter(Boolean);

    const summary = {
      inputs: { etapaId: selectedEtapaId, extraPeople, delayDays, workSaturday },
      originalFinish: originalFinish ? scheduleIso(originalFinish) : null,
      newFinish: newFinish ? scheduleIso(newFinish) : null,
      finishImpactDays: originalFinish && newFinish
        ? Math.round((newFinish.getTime() - originalFinish.getTime()) / 86_400_000)
        : 0,
      originalLaborCost,
      scenarioLaborCost,
      laborCostImpact: scenarioLaborCost - originalLaborCost,
      changedStages,
    };

    if (req.body?.apply === true) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        for (const item of changedStages as any[]) {
          await client.query(
            `UPDATE obra_etapas
                SET data_inicio_prevista = $1,
                    data_fim_prevista = $2,
                    updated_at = now()
              WHERE id = $3 AND obra_id = $4`,
            [item.newStart, item.newEnd, item.etapaId, obraId],
          );
        }

        if (selectedEtapaId && extraPeople !== 0) {
          const row = byId.get(selectedEtapaId);
          if (row && String(row.status ?? "pendente") === "pendente") {
            const newPeople = Math.max(1, Number(row.equipe_quantidade ?? 1) + extraPeople);
            await client.query(
              `UPDATE obra_etapas
                  SET equipe_quantidade = $1, updated_at = now()
                WHERE id = $2 AND obra_id = $3`,
              [newPeople, selectedEtapaId, obraId],
            );
          }
        }

        if (workSaturday && !baseCalendar.sabado) {
          await client.query(
            `INSERT INTO obra_calendarios (
               id, tenant_id, obra_id, segunda, terca, quarta, quinta, sexta, sabado, domingo, horas_dia, feriados, created_at, updated_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,$11::jsonb,now(),now())
             ON CONFLICT (obra_id)
             DO UPDATE SET sabado = true, updated_at = now()`,
            [
              crypto.randomUUID(), tid, obraId,
              baseCalendar.segunda, baseCalendar.terca, baseCalendar.quarta,
              baseCalendar.quinta, baseCalendar.sexta, baseCalendar.domingo,
              String(baseCalendar.horasDia), JSON.stringify(baseCalendar.feriados),
            ],
          );
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      res.json({ applied: true, ...summary });
      return;
    }

    res.json({ applied: false, ...summary });
  } catch (err) {
    logger.error({ err }, "arch/construction simulate-scenario error");
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
          candidate = shiftWorkDays(pred.start, lag, calendar);
        } else if (type === "FF") {
          const requiredEnd = shiftWorkDays(pred.end, lag, calendar);
          candidate = subtractWorkDays(requiredEnd, duration - 1, calendar);
        } else if (type === "SF") {
          const requiredEnd = shiftWorkDays(pred.start, lag, calendar);
          candidate = subtractWorkDays(requiredEnd, duration - 1, calendar);
        } else {
          candidate = shiftWorkDays(pred.end, lag + 1, calendar);
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

    const calendar = await getWorkCalendar(tid, obraId);
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

        const duration = workDurationDays(successor.start, successor.end, calendar);
        const lag = Number(dep.defasagem_dias ?? 0);
        const type = String(dep.tipo ?? "FS");
        let requiredStart: Date;

        if (type === "SS") {
          requiredStart = shiftWorkDays(predecessor.start, lag, calendar);
        } else if (type === "FF") {
          const requiredEnd = shiftWorkDays(predecessor.end, lag, calendar);
          requiredStart = subtractWorkDays(requiredEnd, duration - 1, calendar);
        } else if (type === "SF") {
          const requiredEnd = shiftWorkDays(predecessor.start, lag, calendar);
          requiredStart = subtractWorkDays(requiredEnd, duration - 1, calendar);
        } else {
          requiredStart = shiftWorkDays(predecessor.end, lag + 1, calendar);
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
            candidate = shiftWorkDays(pred.start, incomingLag, calendar);
          } else if (incomingType === "FF") {
            candidate = subtractWorkDays(shiftWorkDays(pred.end, incomingLag, calendar), duration - 1, calendar);
          } else if (incomingType === "SF") {
            candidate = subtractWorkDays(shiftWorkDays(pred.start, incomingLag, calendar), duration - 1, calendar);
          } else {
            candidate = shiftWorkDays(pred.end, incomingLag + 1, calendar);
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
          end: addWorkDays(constrainedStart, duration - 1, calendar),
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
        req?.user?.sub ?? null, req?.user?.email ?? null,
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
    const etapaId = req.body?.etapaId ? String(req.body.etapaId) : null;
    const prazoFornecedorDias = Math.max(0, Math.min(3650, Number(req.body?.prazoFornecedorDias ?? 0)));
    let dataNecessidade = req.body?.dataNecessidade ? String(req.body.dataNecessidade).slice(0, 10) : null;

    if (etapaId) {
      const etapa = await ownedEtapa(tid, obraId, etapaId);
      if (!etapa) { res.status(404).json({ error: "Etapa vinculada à compra não pertence a esta obra" }); return; }
      dataNecessidade = dataNecessidade ?? etapa.data_inicio_prevista ?? null;
    }

    const result = await pool.query(
      `INSERT INTO compras_obras (
        id, tenant_id, obra_id, etapa_id, descricao, fornecedor, quantidade, valor_unitario,
        valor_total, status, data_prevista, data_necessidade, prazo_fornecedor_dias,
        observacoes, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),now()) RETURNING *`,
      [
        crypto.randomUUID(), tid, obraId, etapaId, descricao, req.body?.fornecedor ?? null,
        String(quantidade), String(valorUnitario), String(valorTotal), req.body?.status ?? "pendente",
        req.body?.dataPrevista || null, dataNecessidade, prazoFornecedorDias,
        req.body?.observacoes ?? null,
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


const OBRA_ROLE_PERMISSIONS: Record<string, string[]> = {
  proprietario: ["obra.read","diario.read","diario.write","cronograma.read","cronograma.write","medicoes.read","medicoes.write","custos.read","compras.read","compras.write","projetos.read","projetos.write","equipe.manage","metas.manage","aprovacoes.manage"],
  administrador: ["obra.read","diario.read","diario.write","cronograma.read","cronograma.write","medicoes.read","medicoes.write","custos.read","compras.read","compras.write","projetos.read","projetos.write","equipe.manage","metas.manage","aprovacoes.manage"],
  engenheiro: ["obra.read","diario.read","diario.write","cronograma.read","cronograma.write","medicoes.read","medicoes.write","custos.read","compras.read","compras.write","projetos.read","projetos.write","equipe.read","metas.read","aprovacoes.manage"],
  arquiteto: ["obra.read","diario.read","diario.write","cronograma.read","cronograma.write","medicoes.read","projetos.read","projetos.write","equipe.read","metas.read","aprovacoes.manage"],
  mestre_obras: ["obra.read","diario.read","diario.write","cronograma.read","cronograma.update_execution","medicoes.read","projetos.read","materiais.request","equipe.read","metas.read","producao.write"],
  pedreiro: ["obra.read_scoped","diario.write_own","tarefas.read_own","tarefas.update_own","materiais.request","projetos.read_scoped","producao.write_own"],
  eletricista: ["obra.read_scoped","diario.write_own","tarefas.read_own","tarefas.update_own","materiais.request","projetos.read_scoped","producao.write_own"],
  encanador: ["obra.read_scoped","diario.write_own","tarefas.read_own","tarefas.update_own","materiais.request","projetos.read_scoped","producao.write_own"],
  terceiro: ["obra.read_scoped","diario.write_own","tarefas.read_own","tarefas.update_own","materiais.request","projetos.read_scoped","producao.write_own"],
  campo: ["obra.read_scoped","diario.write_own","tarefas.read_own","tarefas.update_own","materiais.request","producao.write_own"],
  cliente: ["obra.read_portal","diario.read_approved","cronograma.read_summary","projetos.read_published","aprovacoes.respond"],
};

function obraPermissionsForRole(role: unknown) {
  const key = String(role ?? "campo");
  return OBRA_ROLE_PERMISSIONS[key] ?? OBRA_ROLE_PERMISSIONS.campo ?? [];
}

function asOptionalText(value: unknown) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function asOptionalDate(value: unknown) {
  const text = asOptionalText(value);
  return text ? text.slice(0, 10) : null;
}

function asNonNegativeNumber(value: unknown, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

async function requireOwnedConstruction(req: any, res: any) {
  const tid = requireTenant(req, res);
  if (!tid) return null;
  const obraId = String(req.params["obraId"] ?? "");
  const obra = await ownedObra(tid, obraId);
  if (!obra) {
    res.status(404).json({ error: "Obra não encontrada." });
    return null;
  }
  return { tid, obraId, obra };
}

archProductionProcurementRouter.get("/arch/construction/:obraId/workforce", async (req, res, next) => {
  try {
    const scope = await requireOwnedConstruction(req, res);
    if (!scope) return;
    const { tid, obraId } = scope;

    const [executoresResult, metasResult, apontamentosResult, etapasResult] = await Promise.all([
      pool.query(
        `SELECT e.*,
                u.name AS linked_user_name,
                u.email AS linked_user_email,
                a.status AS access_status,
                a.login_identifier AS access_login,
                a.last_login_at AS access_last_login_at
           FROM obra_executores e
           LEFT JOIN users u ON u.id = e.user_id AND u.tenant_id = e.tenant_id
           LEFT JOIN obra_executor_access a ON a.executor_id = e.id AND a.obra_id = e.obra_id AND a.tenant_id = e.tenant_id
          WHERE e.tenant_id = $1 AND e.obra_id = $2
          ORDER BY CASE e.status WHEN 'ativo' THEN 0 WHEN 'convidado' THEN 1 WHEN 'bloqueado' THEN 2 ELSE 3 END,
                   e.nome ASC`,
        [tid, obraId],
      ),
      pool.query(
        `SELECT m.*,
                e.nome AS executor_nome,
                oe.nome AS etapa_nome
           FROM obra_metas m
           LEFT JOIN obra_executores e ON e.id = m.executor_id
           LEFT JOIN obra_etapas oe ON oe.id = m.etapa_id
          WHERE m.tenant_id = $1 AND m.obra_id = $2
          ORDER BY CASE m.status WHEN 'ativa' THEN 0 WHEN 'atingida' THEN 1 ELSE 2 END,
                   m.created_at DESC`,
        [tid, obraId],
      ),
      pool.query(
        `SELECT a.*,
                e.nome AS executor_nome,
                oe.nome AS etapa_nome
           FROM obra_apontamentos_producao a
           LEFT JOIN obra_executores e ON e.id = a.executor_id
           LEFT JOIN obra_etapas oe ON oe.id = a.etapa_id
          WHERE a.tenant_id = $1 AND a.obra_id = $2
          ORDER BY a.data DESC, a.created_at DESC
          LIMIT 500`,
        [tid, obraId],
      ),
      pool.query(
        `SELECT id, nome, percentual_executado, data_inicio_prevista, data_fim_prevista, status
           FROM obra_etapas
          WHERE obra_id = $1
          ORDER BY ordem ASC, created_at ASC`,
        [obraId],
      ),
    ]);

    const apontamentos = apontamentosResult.rows;
    const metas = metasResult.rows.map((meta: any) => {
      const start = meta.data_inicio ? String(meta.data_inicio).slice(0, 10) : null;
      const end = meta.data_fim ? String(meta.data_fim).slice(0, 10) : null;
      const matching = apontamentos.filter((row: any) => {
        const date = row.data ? String(row.data).slice(0, 10) : "";
        if (meta.executor_id && row.executor_id !== meta.executor_id) return false;
        if (meta.etapa_id && row.etapa_id !== meta.etapa_id) return false;
        if (meta.unidade && row.unidade && String(row.unidade).toLowerCase() !== String(meta.unidade).toLowerCase()) return false;
        if (start && date < start) return false;
        if (end && date > end) return false;
        return true;
      });
      const realizado = matching.reduce((sum: number, row: any) => sum + Number(row.quantidade ?? 0), 0);
      const alvo = Number(meta.valor_meta ?? 0);
      const atingimentoPct = alvo > 0 ? Math.min(999.9, (realizado / alvo) * 100) : 0;
      return { ...meta, realizado, atingimento_pct: atingimentoPct };
    });

    const metasAtivas = metas.filter((meta: any) => meta.status === "ativa");
    const metasAtingidas = metasAtivas.filter((meta: any) => Number(meta.atingimento_pct ?? 0) >= 100).length;
    const atingimentoMedioPct = metasAtivas.length
      ? metasAtivas.reduce((sum: number, meta: any) => sum + Number(meta.atingimento_pct ?? 0), 0) / metasAtivas.length
      : 0;
    const horasApontadas = apontamentos.reduce((sum: number, row: any) => sum + Number(row.horas ?? 0), 0);
    const custoMaoObra = apontamentos.reduce((sum: number, row: any) => sum + Number(row.custo_mao_obra ?? 0), 0);
    const retrabalho = apontamentos.reduce((sum: number, row: any) => sum + Number(row.retrabalho_quantidade ?? 0), 0);
    const notas = apontamentos.map((row: any) => Number(row.qualidade_nota)).filter((n: number) => Number.isFinite(n));
    const qualidadeMedia = notas.length ? notas.reduce((a: number, b: number) => a + b, 0) / notas.length : null;
    const bloqueiosAbertos = apontamentos.filter((row: any) => String(row.bloqueio ?? "").trim().length > 0).length;

    res.json({
      executores: executoresResult.rows,
      metas,
      apontamentos,
      etapas: etapasResult.rows,
      rolePermissions: OBRA_ROLE_PERMISSIONS,
      kpis: {
        executoresAtivos: executoresResult.rows.filter((row: any) => row.status === "ativo").length,
        metasAtivas: metasAtivas.length,
        metasAtingidas,
        atingimentoMedioPct,
        horasApontadas,
        custoMaoObra,
        retrabalho,
        qualidadeMedia,
        bloqueiosAbertos,
      },
    });
  } catch (err) {
    logger.error({ err }, "arch/construction workforce bundle error");
    next(err);
  }
});

archProductionProcurementRouter.post("/arch/construction/:obraId/workforce/executores", async (req, res, next) => {
  try {
    const scope = await requireOwnedConstruction(req, res);
    if (!scope) return;
    const { tid, obraId } = scope;
    const body = req.body ?? {};
    const nome = String(body.nome ?? "").trim();
    if (!nome) {
      res.status(400).json({ error: "Nome do executor é obrigatório." });
      return;
    }

    const perfilAcesso = String(body.perfilAcesso ?? body.funcao ?? "campo");
    const permissoes = Array.isArray(body.permissoes) ? body.permissoes.map(String) : obraPermissionsForRole(perfilAcesso);
    const userId = asOptionalText(body.userId);
    if (userId) {
      const user = await pool.query(`SELECT id FROM users WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [userId, tid]);
      if (!user.rows[0]) {
        res.status(400).json({ error: "Usuário vinculado não pertence a este tenant." });
        return;
      }
    }

    const result = await pool.query(
      `INSERT INTO obra_executores (
        id, tenant_id, obra_id, user_id, tipo, nome, funcao, especialidade, empresa, telefone, email,
        responsavel_direto, data_inicio, data_fim, tipo_contratacao, valor_contratado, jornada, centro_custo,
        acesso_sistema, perfil_acesso, permissoes, status, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,$22,now(),now()
      ) RETURNING *`,
      [
        crypto.randomUUID(), tid, obraId, userId,
        ["pessoa","empresa","equipe"].includes(String(body.tipo)) ? String(body.tipo) : "pessoa",
        nome,
        asOptionalText(body.funcao) ?? "outro",
        asOptionalText(body.especialidade),
        asOptionalText(body.empresa),
        asOptionalText(body.telefone),
        asOptionalText(body.email),
        asOptionalText(body.responsavelDireto),
        asOptionalDate(body.dataInicio),
        asOptionalDate(body.dataFim),
        asOptionalText(body.tipoContratacao) ?? "hora",
        asNonNegativeNumber(body.valorContratado),
        asOptionalText(body.jornada),
        asOptionalText(body.centroCusto),
        Boolean(body.acessoSistema),
        perfilAcesso,
        JSON.stringify(permissoes),
        ["convidado","ativo","bloqueado","finalizado"].includes(String(body.status)) ? String(body.status) : "ativo",
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Este usuário já está vinculado à obra." });
      return;
    }
    next(err);
  }
});

archProductionProcurementRouter.patch("/arch/construction/:obraId/workforce/executores/:executorId", async (req, res, next) => {
  try {
    const scope = await requireOwnedConstruction(req, res);
    if (!scope) return;
    const { tid, obraId } = scope;
    const executorId = String(req.params["executorId"] ?? "");
    const current = await pool.query(
      `SELECT * FROM obra_executores WHERE id = $1 AND tenant_id = $2 AND obra_id = $3 LIMIT 1`,
      [executorId, tid, obraId],
    );
    if (!current.rows[0]) {
      res.status(404).json({ error: "Executor não encontrado." });
      return;
    }

    const body = req.body ?? {};
    const perfilAcesso = body.perfilAcesso !== undefined ? String(body.perfilAcesso) : String(current.rows[0].perfil_acesso);
    const permissoes = Array.isArray(body.permissoes)
      ? body.permissoes.map(String)
      : body.perfilAcesso !== undefined ? obraPermissionsForRole(perfilAcesso) : current.rows[0].permissoes;

    const result = await pool.query(
      `UPDATE obra_executores SET
        nome = COALESCE($4, nome),
        funcao = COALESCE($5, funcao),
        especialidade = CASE WHEN $6::boolean THEN $7 ELSE especialidade END,
        empresa = CASE WHEN $8::boolean THEN $9 ELSE empresa END,
        telefone = CASE WHEN $10::boolean THEN $11 ELSE telefone END,
        email = CASE WHEN $12::boolean THEN $13 ELSE email END,
        data_inicio = CASE WHEN $14::boolean THEN $15::date ELSE data_inicio END,
        data_fim = CASE WHEN $16::boolean THEN $17::date ELSE data_fim END,
        tipo_contratacao = COALESCE($18, tipo_contratacao),
        valor_contratado = COALESCE($19, valor_contratado),
        jornada = CASE WHEN $20::boolean THEN $21 ELSE jornada END,
        centro_custo = CASE WHEN $22::boolean THEN $23 ELSE centro_custo END,
        acesso_sistema = COALESCE($24, acesso_sistema),
        perfil_acesso = COALESCE($25, perfil_acesso),
        permissoes = $26::jsonb,
        status = COALESCE($27, status),
        updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND obra_id = $3
       RETURNING *`,
      [
        executorId, tid, obraId,
        body.nome !== undefined ? asOptionalText(body.nome) : null,
        body.funcao !== undefined ? asOptionalText(body.funcao) : null,
        body.especialidade !== undefined, asOptionalText(body.especialidade),
        body.empresa !== undefined, asOptionalText(body.empresa),
        body.telefone !== undefined, asOptionalText(body.telefone),
        body.email !== undefined, asOptionalText(body.email),
        body.dataInicio !== undefined, asOptionalDate(body.dataInicio),
        body.dataFim !== undefined, asOptionalDate(body.dataFim),
        body.tipoContratacao !== undefined ? asOptionalText(body.tipoContratacao) : null,
        body.valorContratado !== undefined ? asNonNegativeNumber(body.valorContratado) : null,
        body.jornada !== undefined, asOptionalText(body.jornada),
        body.centroCusto !== undefined, asOptionalText(body.centroCusto),
        body.acessoSistema !== undefined ? Boolean(body.acessoSistema) : null,
        body.perfilAcesso !== undefined ? perfilAcesso : null,
        JSON.stringify(permissoes ?? []),
        body.status !== undefined && ["convidado","ativo","bloqueado","finalizado"].includes(String(body.status)) ? String(body.status) : null,
      ],
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

archProductionProcurementRouter.post("/arch/construction/:obraId/workforce/metas", async (req, res, next) => {
  try {
    const scope = await requireOwnedConstruction(req, res);
    if (!scope) return;
    const { tid, obraId } = scope;
    const body = req.body ?? {};
    const nome = String(body.nome ?? "").trim();
    if (!nome) {
      res.status(400).json({ error: "Nome da meta é obrigatório." });
      return;
    }

    const executorId = asOptionalText(body.executorId);
    const etapaId = asOptionalText(body.etapaId);
    if (executorId) {
      const executor = await pool.query(
        `SELECT id FROM obra_executores WHERE id = $1 AND tenant_id = $2 AND obra_id = $3 LIMIT 1`,
        [executorId, tid, obraId],
      );
      if (!executor.rows[0]) {
        res.status(400).json({ error: "Executor da meta não pertence a esta obra." });
        return;
      }
    }
    if (etapaId) {
      const etapa = await pool.query(
        `SELECT id FROM obra_etapas WHERE id = $1 AND obra_id = $2 LIMIT 1`,
        [etapaId, obraId],
      );
      if (!etapa.rows[0]) {
        res.status(400).json({ error: "Etapa da meta não pertence a esta obra." });
        return;
      }
    }

    const result = await pool.query(
      `INSERT INTO obra_metas (
        id, tenant_id, obra_id, executor_id, etapa_id, nome, tipo, valor_meta, unidade, periodo,
        data_inicio, data_fim, peso, status, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),now())
      RETURNING *`,
      [
        crypto.randomUUID(), tid, obraId,
        executorId,
        etapaId,
        nome,
        ["quantidade","prazo","custo","qualidade","produtividade"].includes(String(body.tipo)) ? String(body.tipo) : "quantidade",
        asNonNegativeNumber(body.valorMeta),
        asOptionalText(body.unidade),
        ["diaria","semanal","mensal","etapa","obra"].includes(String(body.periodo)) ? String(body.periodo) : "diaria",
        asOptionalDate(body.dataInicio),
        asOptionalDate(body.dataFim),
        Math.max(0.001, asNonNegativeNumber(body.peso, 1)),
        ["ativa","atingida","pausada","encerrada"].includes(String(body.status)) ? String(body.status) : "ativa",
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

archProductionProcurementRouter.patch("/arch/construction/:obraId/workforce/metas/:metaId", async (req, res, next) => {
  try {
    const scope = await requireOwnedConstruction(req, res);
    if (!scope) return;
    const { tid, obraId } = scope;
    const metaId = String(req.params["metaId"] ?? "");
    const body = req.body ?? {};
    const result = await pool.query(
      `UPDATE obra_metas SET
        nome = COALESCE($4, nome),
        valor_meta = COALESCE($5, valor_meta),
        unidade = CASE WHEN $6::boolean THEN $7 ELSE unidade END,
        periodo = COALESCE($8, periodo),
        data_inicio = CASE WHEN $9::boolean THEN $10::date ELSE data_inicio END,
        data_fim = CASE WHEN $11::boolean THEN $12::date ELSE data_fim END,
        status = COALESCE($13, status),
        updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND obra_id = $3
       RETURNING *`,
      [
        metaId, tid, obraId,
        body.nome !== undefined ? asOptionalText(body.nome) : null,
        body.valorMeta !== undefined ? asNonNegativeNumber(body.valorMeta) : null,
        body.unidade !== undefined, asOptionalText(body.unidade),
        body.periodo !== undefined && ["diaria","semanal","mensal","etapa","obra"].includes(String(body.periodo)) ? String(body.periodo) : null,
        body.dataInicio !== undefined, asOptionalDate(body.dataInicio),
        body.dataFim !== undefined, asOptionalDate(body.dataFim),
        body.status !== undefined && ["ativa","atingida","pausada","encerrada"].includes(String(body.status)) ? String(body.status) : null,
      ],
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: "Meta não encontrada." });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

archProductionProcurementRouter.post("/arch/construction/:obraId/workforce/apontamentos", async (req, res, next) => {
  try {
    const scope = await requireOwnedConstruction(req, res);
    if (!scope) return;
    const { tid, obraId } = scope;
    const body = req.body ?? {};
    const executorId = asOptionalText(body.executorId);
    if (!executorId) {
      res.status(400).json({ error: "Selecione o executor." });
      return;
    }
    const executor = await pool.query(
      `SELECT id FROM obra_executores WHERE id = $1 AND tenant_id = $2 AND obra_id = $3 LIMIT 1`,
      [executorId, tid, obraId],
    );
    if (!executor.rows[0]) {
      res.status(400).json({ error: "Executor não pertence a esta obra." });
      return;
    }
    const etapaId = asOptionalText(body.etapaId);
    if (etapaId) {
      const etapa = await pool.query(
        `SELECT id FROM obra_etapas WHERE id = $1 AND obra_id = $2 LIMIT 1`,
        [etapaId, obraId],
      );
      if (!etapa.rows[0]) {
        res.status(400).json({ error: "Etapa do apontamento não pertence a esta obra." });
        return;
      }
    }

    const qualidade = body.qualidadeNota === "" || body.qualidadeNota === null || body.qualidadeNota === undefined
      ? null
      : Math.max(0, Math.min(10, Number(body.qualidadeNota)));

    const result = await pool.query(
      `INSERT INTO obra_apontamentos_producao (
        id, tenant_id, obra_id, executor_id, etapa_id, data, quantidade, unidade, horas,
        custo_mao_obra, retrabalho_quantidade, qualidade_nota, bloqueio, observacao, created_by,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),now())
      RETURNING *`,
      [
        crypto.randomUUID(), tid, obraId, executorId,
        etapaId,
        asOptionalDate(body.data) ?? new Date().toISOString().slice(0, 10),
        asNonNegativeNumber(body.quantidade),
        asOptionalText(body.unidade),
        asNonNegativeNumber(body.horas),
        asNonNegativeNumber(body.custoMaoObra),
        asNonNegativeNumber(body.retrabalhoQuantidade),
        qualidade,
        asOptionalText(body.bloqueio),
        asOptionalText(body.observacao),
        req.user?.sub ?? null,
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default archProductionProcurementRouter;
