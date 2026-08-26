import { Router, type IRouter } from "express";
import { vendorPool } from "../lib/vendorDb";
import { planPickupWave } from "../services/pracaRoutePlanner.js";

const router: IRouter = Router();

function canAccess(req: Express.Request, tenantId: string) {
  const user = (req as any).user;
  return user?.platformRole === "super_admin" || user?.tenantId === tenantId;
}

function validTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validPoint(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  const lat = Number(data.latitude ?? data.lat);
  const lng = Number(data.longitude ?? data.lng ?? data.lon);
  return Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

router.put("/tenants/:tenantId/praca-logistics/config", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const timezone = typeof req.body?.timezone === "string" ? req.body.timezone.trim() : "";
  const cutoff = req.body?.horarioCorte;
  const dispatch = req.body?.horarioDespacho;
  const weekdays = Array.isArray(req.body?.diasSemana)
    ? [...new Set(req.body.diasSemana.map(Number))]
    : [];
  const pickupAddress = req.body?.enderecoColeta;
  const maxStops = Number(req.body?.maxParadasPorRota);

  if (!timezone || !validTime(cutoff) || !validTime(dispatch) || dispatch < cutoff) {
    return res.status(422).json({ error: "Timezone e horários válidos são obrigatórios; o despacho não pode preceder o corte." });
  }
  if (!weekdays.length || weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
    return res.status(422).json({ error: "diasSemana deve conter números ISO de 1 (segunda) a 7 (domingo)." });
  }
  if (!validPoint(pickupAddress)) {
    return res.status(422).json({ error: "enderecoColeta deve conter latitude e longitude válidas." });
  }
  if (!Number.isInteger(maxStops) || maxStops < 1 || maxStops > 200) {
    return res.status(422).json({ error: "maxParadasPorRota deve estar entre 1 e 200." });
  }

  const timezoneResult = await vendorPool.query(
    "SELECT 1 FROM pg_timezone_names WHERE name=$1 LIMIT 1",
    [timezone],
  );
  if (!timezoneResult.rowCount) return res.status(422).json({ error: "Timezone IANA não reconhecido." });

  const result = await vendorPool.query(
    `INSERT INTO praca_logistica_config
       (tenant_id, timezone, horario_corte, horario_despacho, dias_semana,
        endereco_coleta, max_paradas_por_rota, ativo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (tenant_id) DO UPDATE SET
       timezone=EXCLUDED.timezone,
       horario_corte=EXCLUDED.horario_corte,
       horario_despacho=EXCLUDED.horario_despacho,
       dias_semana=EXCLUDED.dias_semana,
       endereco_coleta=EXCLUDED.endereco_coleta,
       max_paradas_por_rota=EXCLUDED.max_paradas_por_rota,
       ativo=EXCLUDED.ativo,
       updated_at=now()
     RETURNING *`,
    [tenantId, timezone, cutoff, dispatch, weekdays, pickupAddress, maxStops, req.body?.ativo !== false],
  );
  res.json({ config: result.rows[0] });
});

router.get("/tenants/:tenantId/praca-logistics/config", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const result = await vendorPool.query(
    "SELECT * FROM praca_logistica_config WHERE tenant_id=$1",
    [tenantId],
  );
  res.json({ config: result.rows[0] ?? null });
});

router.post("/tenants/:tenantId/praca-logistics/waves", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const serviceDate = typeof req.body?.dataServico === "string" ? req.body.dataServico : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
    return res.status(422).json({ error: "dataServico deve usar o formato YYYY-MM-DD." });
  }
  const result = await planPickupWave(tenantId, serviceDate);
  res.status(result.status === "bloqueada" ? 409 : 201).json(result);
});

router.get("/tenants/:tenantId/praca-logistics/waves", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const result = await vendorPool.query(
    `SELECT o.*,
            count(DISTINCT r.id)::int AS total_rotas,
            count(DISTINCT p.id) FILTER (WHERE NOT p.resolvida)::int AS total_pendencias
       FROM praca_ondas_coleta o
       LEFT JOIN praca_rotas_entrega r ON r.onda_id=o.id
       LEFT JOIN praca_logistica_pendencias p ON p.onda_id=o.id
      WHERE o.tenant_id=$1
      GROUP BY o.id
      ORDER BY o.data_servico DESC
      LIMIT $2`,
    [tenantId, limit],
  );
  res.json({ waves: result.rows });
});

router.get("/tenants/:tenantId/praca-logistics/waves/:waveId", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const waveId = String(req.params.waveId);

  const [wave, routes, pending] = await Promise.all([
    vendorPool.query("SELECT * FROM praca_ondas_coleta WHERE id=$1 AND tenant_id=$2", [waveId, tenantId]),
    vendorPool.query(
      `SELECT r.*,
              coalesce(jsonb_agg(
                jsonb_build_object(
                  'id',p.id,'pedidoId',p.pedido_id,'tipo',p.tipo,'sequencia',p.sequencia,
                  'status',p.status,'endereco',p.endereco_snapshot,'contato',p.contato_snapshot,
                  'latitude',p.latitude,'longitude',p.longitude,
                  'motivoFalhaCodigo',p.motivo_falha_codigo,
                  'motivoFalhaDescricao',p.motivo_falha_descricao
                ) ORDER BY p.sequencia
              ) FILTER (WHERE p.id IS NOT NULL), '[]'::jsonb) AS paradas
         FROM praca_rotas_entrega r
         LEFT JOIN praca_rota_paradas p ON p.rota_id=r.id
        WHERE r.onda_id=$1 AND r.tenant_id=$2
        GROUP BY r.id ORDER BY r.numero`,
      [waveId, tenantId],
    ),
    vendorPool.query(
      "SELECT * FROM praca_logistica_pendencias WHERE onda_id=$1 AND tenant_id=$2 ORDER BY resolvida, created_at",
      [waveId, tenantId],
    ),
  ]);
  if (!wave.rowCount) return res.status(404).json({ error: "Onda não encontrada." });
  res.json({ wave: wave.rows[0], routes: routes.rows, pending: pending.rows });
});


router.patch("/tenants/:tenantId/praca-logistics/pending/:pendingId", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const pendingId = String(req.params.pendingId);
  const resolved = req.body?.resolvida === true;
  if (!resolved) {
    return res.status(422).json({ error: "Confirme a resolução com resolvida=true após corrigir o dado de origem." });
  }
  const result = await vendorPool.query(
    `UPDATE praca_logistica_pendencias
        SET resolvida=true, resolvida_em=now()
      WHERE id=$1 AND tenant_id=$2 AND resolvida=false
      RETURNING *`,
    [pendingId, tenantId],
  );
  if (!result.rowCount) return res.status(404).json({ error: "Pendência aberta não encontrada." });
  res.json({
    pending: result.rows[0],
    nextStep: "O pedido corrigido e ainda em pronto_coleta entrará na próxima onda elegível.",
  });
});

export default router;
