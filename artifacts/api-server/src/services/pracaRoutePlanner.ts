import type { PoolClient } from "@workspace/db";
import type { Logger } from "pino";
import { vendorPool } from "../lib/vendorDb";
import { logger } from "../lib/logger.js";

type Point = { latitude: number; longitude: number };
type Candidate = {
  id: string;
  cliente_nome: string;
  cliente_whatsapp: string | null;
  endereco_entrega: Record<string, unknown>;
  volumes: Array<{ id: string }>;
  point: Point;
};

function pointFrom(value: unknown): Point | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const latitude = Number(data.latitude ?? data.lat);
  const longitude = Number(data.longitude ?? data.lng ?? data.lon);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function orderByNearest(origin: Point, candidates: Candidate[]): Candidate[] {
  const pending = [...candidates];
  const ordered: Candidate[] = [];
  let current = origin;
  while (pending.length) {
    let best = 0;
    let distance = Number.POSITIVE_INFINITY;
    pending.forEach((candidate, index) => {
      const lat = candidate.point.latitude - current.latitude;
      const lng = candidate.point.longitude - current.longitude;
      const score = lat * lat + lng * lng;
      if (score < distance) {
        distance = score;
        best = index;
      }
    });
    const [next] = pending.splice(best, 1);
    ordered.push(next);
    current = next.point;
  }
  return ordered;
}

async function addPending(
  client: PoolClient,
  tenantId: string,
  waveId: string,
  orderId: string | null,
  code: string,
  description: string,
) {
  await client.query(
    `INSERT INTO praca_logistica_pendencias
       (tenant_id, onda_id, pedido_id, codigo, descricao)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (tenant_id, onda_id, pedido_id, codigo)
     DO UPDATE SET descricao = EXCLUDED.descricao`,
    [tenantId, waveId, orderId, code, description],
  );
}

export interface WavePlanResult {
  waveId: string;
  status: "despachada" | "parcial" | "sem_pedidos" | "bloqueada";
  routes: number;
  plannedOrders: number;
  pendingOrders: number;
}

export async function planPickupWave(
  tenantId: string,
  serviceDate: string,
  log: Logger = logger,
): Promise<WavePlanResult> {
  const client = await vendorPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`praca-wave:${tenantId}:${serviceDate}`]);

    const configResult = await client.query(
      `SELECT c.*,
              (($2::date + c.horario_corte)::timestamp AT TIME ZONE c.timezone) AS corte_em,
              (($2::date + c.horario_despacho)::timestamp AT TIME ZONE c.timezone) AS despacho_em
         FROM praca_logistica_config c
        WHERE c.tenant_id=$1 AND c.ativo=true`,
      [tenantId, serviceDate],
    );
    const config = configResult.rows[0];
    if (!config) throw Object.assign(new Error("Logística não configurada para o tenant."), { statusCode: 422 });

    const dayResult = await client.query(
      "SELECT extract(isodow FROM $1::date)::int AS weekday",
      [serviceDate],
    );
    if (!config.dias_semana.includes(dayResult.rows[0].weekday)) {
      throw Object.assign(new Error("A data não pertence aos dias de operação configurados."), { statusCode: 422 });
    }

    const waveResult = await client.query(
      `INSERT INTO praca_ondas_coleta
         (tenant_id, data_servico, corte_em, despacho_em)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (tenant_id, data_servico)
       DO UPDATE SET updated_at=now()
       RETURNING id, status`,
      [tenantId, serviceDate, config.corte_em, config.despacho_em],
    );
    const waveId = waveResult.rows[0].id;

    if (waveResult.rows[0].status !== "planejando") {
      const summary = await client.query(
        `SELECT status, pedidos_planejados, pedidos_pendentes,
                (SELECT count(*)::int FROM praca_rotas_entrega WHERE onda_id=$1) AS routes
           FROM praca_ondas_coleta WHERE id=$1`,
        [waveId],
      );
      await client.query("COMMIT");
      const row = summary.rows[0];
      return {
        waveId,
        status: row.status,
        routes: row.routes,
        plannedOrders: row.pedidos_planejados,
        pendingOrders: row.pedidos_pendentes,
      };
    }

    const pickup = pointFrom(config.endereco_coleta);
    if (!pickup) {
      await addPending(client, tenantId, waveId, null, "COLETA_SEM_COORDENADAS", "O endereço de coleta precisa de latitude e longitude válidas.");
      await client.query(
        "UPDATE praca_ondas_coleta SET status='bloqueada', motivo_bloqueio=$2, updated_at=now() WHERE id=$1",
        [waveId, "Endereço de coleta sem coordenadas válidas."],
      );
      await client.query("COMMIT");
      return { waveId, status: "bloqueada", routes: 0, plannedOrders: 0, pendingOrders: 0 };
    }

    const orderResult = await client.query(
      `SELECT p.id, p.cliente_nome, p.cliente_whatsapp, p.endereco_entrega,
              jsonb_agg(jsonb_build_object('id',v.id) ORDER BY v.numero) AS volumes
         FROM praca_pedidos p
         JOIN praca_pedido_volumes v ON v.pedido_id=p.id
        WHERE p.tenant_id=$1
          AND p.status='pronto_coleta'
          AND p.created_at <= $2
          AND v.status IN ('etiquetado','pronto_coleta')
          AND NOT EXISTS (
            SELECT 1 FROM praca_rota_paradas rp
             WHERE rp.pedido_id=p.id AND rp.tipo='entrega' AND rp.status<>'ignorada'
          )
          AND (
            NOT EXISTS (
              SELECT 1 FROM praca_reentregas rr
               WHERE rr.pedido_id=p.id AND rr.status='solicitada'
            )
            OR EXISTS (
              SELECT 1 FROM praca_reentregas rr
               WHERE rr.pedido_id=p.id AND rr.status='solicitada' AND rr.data_servico=$3::date
            )
          )
        GROUP BY p.id
        HAVING bool_and(v.status IN ('etiquetado','pronto_coleta'))
        ORDER BY p.created_at, p.id
        `,
      [tenantId, config.corte_em, serviceDate],
    );

    const valid: Candidate[] = [];
    let pendingOrders = 0;
    for (const row of orderResult.rows) {
      const point = pointFrom(row.endereco_entrega);
      if (!point) {
        pendingOrders++;
        await addPending(client, tenantId, waveId, row.id, "ENTREGA_SEM_COORDENADAS", "O endereço de entrega precisa de latitude e longitude válidas.");
        continue;
      }
      valid.push({ ...row, point });
    }

    if (!valid.length) {
      const status = pendingOrders ? "parcial" : "sem_pedidos";
      await client.query(
        "UPDATE praca_ondas_coleta SET status=$2, pedidos_pendentes=$3, updated_at=now() WHERE id=$1",
        [waveId, status, pendingOrders],
      );
      await client.query("COMMIT");
      return { waveId, status, routes: 0, plannedOrders: 0, pendingOrders };
    }

    const courierResult = await client.query(
      `SELECT id FROM users
        WHERE tenant_id=$1 AND active=true AND user_function='entrega'
        ORDER BY last_assigned_at ASC NULLS FIRST, id`,
      [tenantId],
    );
    if (!courierResult.rows.length) {
      for (const order of valid) {
        await addPending(client, tenantId, waveId, order.id, "SEM_ENTREGADOR", "Não há entregador ativo cadastrado para esta rota.");
      }
      pendingOrders += valid.length;
      await client.query(
        "UPDATE praca_ondas_coleta SET status='bloqueada', pedidos_pendentes=$2, motivo_bloqueio=$3, updated_at=now() WHERE id=$1",
        [waveId, pendingOrders, "Nenhum entregador ativo cadastrado."],
      );
      await client.query("COMMIT");
      return { waveId, status: "bloqueada", routes: 0, plannedOrders: 0, pendingOrders };
    }

    const maxStops = Number(config.max_paradas_por_rota);
    const routeCount = Math.min(courierResult.rows.length, Math.ceil(valid.length / maxStops));
    const buckets: Candidate[][] = Array.from({ length: routeCount }, () => []);
    valid.forEach((order, index) => buckets[index % routeCount].push(order));

    let plannedOrders = 0;
    for (let index = 0; index < buckets.length; index++) {
      const courierId = courierResult.rows[index].id;
      const deliveries = orderByNearest(pickup, buckets[index]);
      const route = await client.query(
        `INSERT INTO praca_rotas_entrega
           (tenant_id, onda_id, entregador_id, numero, total_paradas)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [tenantId, waveId, courierId, index + 1, deliveries.length + 1],
      );
      const routeId = route.rows[0].id;
      const pickupStop = await client.query(
        `INSERT INTO praca_rota_paradas
           (tenant_id, rota_id, tipo, sequencia, endereco_snapshot, latitude, longitude)
         VALUES ($1,$2,'coleta',1,$3,$4,$5) RETURNING id`,
        [tenantId, routeId, config.endereco_coleta, pickup.latitude, pickup.longitude],
      );

      for (let deliveryIndex = 0; deliveryIndex < deliveries.length; deliveryIndex++) {
        const order = deliveries[deliveryIndex];
        const stop = await client.query(
          `INSERT INTO praca_rota_paradas
             (tenant_id, rota_id, pedido_id, tipo, sequencia, endereco_snapshot,
              contato_snapshot, latitude, longitude)
           VALUES ($1,$2,$3,'entrega',$4,$5,$6,$7,$8) RETURNING id`,
          [
            tenantId, routeId, order.id, deliveryIndex + 2, order.endereco_entrega,
            { nome: order.cliente_nome, whatsapp: order.cliente_whatsapp },
            order.point.latitude, order.point.longitude,
          ],
        );
        for (const volume of order.volumes) {
          await client.query(
            `INSERT INTO praca_rota_parada_volumes (tenant_id, parada_id, volume_id)
             VALUES ($1,$2,$3)`,
            [tenantId, stop.rows[0].id, volume.id],
          );
          await client.query(
            `INSERT INTO praca_rota_parada_volumes (tenant_id, parada_id, volume_id)
             VALUES ($1,$2,$3) ON CONFLICT (volume_id) DO NOTHING`,
            [tenantId, pickupStop.rows[0].id, volume.id],
          );
        }
        await client.query(
          `UPDATE praca_reentregas SET status='incluida_em_onda',updated_at=now()
            WHERE pedido_id=$1 AND status='solicitada' AND data_servico=$2::date`,
          [order.id, serviceDate],
        );
        await client.query(
          "UPDATE praca_pedidos SET status='coleta_agendada', updated_at=now() WHERE id=$1",
          [order.id],
        );
        await client.query(
          `INSERT INTO praca_pedido_eventos
             (tenant_id,pedido_id,tipo,status_anterior,status_novo,ator_tipo,ator_id,metadata)
           VALUES ($1,$2,'rota_planejada','pronto_coleta','coleta_agendada','sistema',NULL,$3)`,
          [tenantId, order.id, { waveId, routeId, courierId, deliverySequence: deliveryIndex + 2 }],
        );
        plannedOrders++;
      }
      await client.query("UPDATE users SET last_assigned_at=now() WHERE id=$1", [courierId]);
    }

    const status = pendingOrders ? "parcial" : "despachada";
    await client.query(
      `UPDATE praca_ondas_coleta
          SET status=$2, pedidos_planejados=$3, pedidos_pendentes=$4, updated_at=now()
        WHERE id=$1`,
      [waveId, status, plannedOrders, pendingOrders],
    );
    await client.query("COMMIT");
    log.info({ tenantId, waveId, routeCount, plannedOrders, pendingOrders }, "praca/logistics: pickup wave planned");
    return { waveId, status, routes: routeCount, plannedOrders, pendingOrders };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function processDuePickupWaves(log: Logger = logger): Promise<void> {
  const due = await vendorPool.query(
    `SELECT c.tenant_id,
            (now() AT TIME ZONE c.timezone)::date::text AS service_date
       FROM praca_logistica_config c
      WHERE c.ativo=true
        AND extract(isodow FROM now() AT TIME ZONE c.timezone)::int = ANY(c.dias_semana)
        AND (now() AT TIME ZONE c.timezone)::time >= c.horario_despacho
        AND NOT EXISTS (
          SELECT 1 FROM praca_ondas_coleta o
           WHERE o.tenant_id=c.tenant_id
             AND o.data_servico=(now() AT TIME ZONE c.timezone)::date
        )`,
  );
  for (const row of due.rows) {
    try {
      await planPickupWave(row.tenant_id, row.service_date, log);
    } catch (error) {
      log.error({ error, tenantId: row.tenant_id }, "praca/logistics: due wave failed");
    }
  }
}
