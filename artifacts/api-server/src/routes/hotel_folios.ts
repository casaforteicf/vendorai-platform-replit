import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { hotelAllowed, hotelTransaction } from "../lib/hotel-http.js";
import {
  ensureHotelFolio,
  loadHotelFolioDetail,
  refreshHotelFolio,
} from "../lib/hotel-folio.js";
import { isFolioSettled } from "../lib/hotel-rate-engine.js";

const router: IRouter = Router();
const reservationIdSchema = z.string().uuid();
const money = z.number().finite().min(0).max(10000000);
const paymentMoney = z.number().finite().positive().max(10000000);
const description = z.string().trim().min(1).max(180);
const paymentMethods = ["cash", "pix", "credit_card", "debit_card", "transfer", "other"] as const;

class FolioError extends Error {
  constructor(readonly status: number, message: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = "FolioError";
  }
}

async function loadReservation(client: any, tenantId: string, reservationId: string) {
  return (await client.query(
    `SELECT r.id,r.room_id,r.primary_guest_id,r.arrival_date,r.departure_date,r.guest_count,r.status,
            r.total_amount,r.currency,r.rate_plan_id,
            rm.code AS room_code,rm.name AS room_name,rm.category AS room_category,
            g.full_name AS guest_name
     FROM hotel_reservations r
     JOIN hotel_rooms rm ON rm.tenant_id=r.tenant_id AND rm.id=r.room_id
     JOIN hotel_guests g ON g.tenant_id=r.tenant_id AND g.id=r.primary_guest_id
     WHERE r.tenant_id=$1 AND r.id=$2`,
    [tenantId, reservationId],
  )).rows[0];
}

async function lockOpenFolio(client: any, tenantId: string, reservationId: string) {
  const folio = (await client.query(
    "SELECT id,status,currency,balance FROM hotel_folios WHERE tenant_id=$1 AND reservation_id=$2 FOR UPDATE",
    [tenantId, reservationId],
  )).rows[0];
  if (!folio || folio.status !== "open") {
    throw new FolioError(409, "Conta fechada ou inexistente para esta reserva.");
  }
  return folio;
}

router.get("/tenants/:tenantId/hotelaria/hospedagem/contas", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hotelAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    return res.json(await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `SELECT f.id AS folio_id,f.reservation_id,f.status AS folio_status,f.currency,
                f.charges_total,f.payments_total,f.balance,f.opened_at,f.updated_at,
                r.arrival_date,r.departure_date,r.status AS reservation_status,
                rm.code AS room_code,g.full_name AS guest_name
         FROM hotel_folios f
         JOIN hotel_reservations r ON r.tenant_id=f.tenant_id AND r.id=f.reservation_id
         JOIN hotel_rooms rm ON rm.tenant_id=r.tenant_id AND rm.id=r.room_id
         JOIN hotel_guests g ON g.tenant_id=r.tenant_id AND g.id=r.primary_guest_id
         WHERE f.tenant_id=$1 AND f.status='open' AND r.status IN ('reserved','checked_in')
         ORDER BY r.arrival_date, rm.code`,
        [tenantId],
      )
    ).rows));
  } catch {
    return res.status(500).json({ error: "Could not list folios" });
  }
});

router.get("/tenants/:tenantId/hotelaria/hospedagem/reservas/:id/conta", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const reservationId = String(req.params.id);
  if (!hotelAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  if (!reservationIdSchema.safeParse(reservationId).success) {
    return res.status(422).json({ error: "Invalid reservation" });
  }
  try {
    const result = await hotelTransaction(tenantId, async (client) => {
      const reservation = await loadReservation(client, tenantId, reservationId);
      if (!reservation) return null;
      if (["reserved", "checked_in"].includes(reservation.status)) {
        await ensureHotelFolio(client, tenantId, reservationId, req.user!.sub, reservation.currency ?? "BRL");
      }
      const detail = await loadHotelFolioDetail(client, tenantId, reservationId);
      return {
        reservation,
        folio: detail?.folio ?? null,
        items: detail?.items ?? [],
        payments: detail?.payments ?? [],
      };
    });
    return result ? res.json(result) : res.status(404).json({ error: "Reservation not found" });
  } catch {
    return res.status(500).json({ error: "Could not load folio" });
  }
});

router.post("/tenants/:tenantId/hotelaria/hospedagem/reservas/:id/conta/itens", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const reservationId = String(req.params.id);
  if (!hotelAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  if (!reservationIdSchema.safeParse(reservationId).success) {
    return res.status(422).json({ error: "Invalid reservation" });
  }
  const input = z.object({
    kind: z.enum(["extra", "discount", "tax"]),
    description,
    quantity: z.number().finite().positive().max(999).default(1),
    unitAmount: money,
    serviceDate: z.iso.date().optional(),
  }).strict().safeParse(req.body);
  if (!input.success) return res.status(422).json({ error: "Invalid folio item" });

  try {
    const result = await hotelTransaction(tenantId, async (client) => {
      const reservation = await loadReservation(client, tenantId, reservationId);
      if (!reservation) throw new FolioError(404, "Reservation not found");
      if (!["reserved", "checked_in"].includes(reservation.status)) {
        throw new FolioError(409, "A conta só aceita lançamentos enquanto a reserva está ativa.");
      }
      await ensureHotelFolio(client, tenantId, reservationId, req.user!.sub, reservation.currency ?? "BRL");
      const folio = await lockOpenFolio(client, tenantId, reservationId);
      const total = Math.round(input.data.quantity * input.data.unitAmount * 100) / 100;
      const signedTotal = input.data.kind === "discount" ? -Math.abs(total) : Math.abs(total);
      await client.query(
        "INSERT INTO hotel_folio_items(id,tenant_id,folio_id,kind,description,service_date,quantity,unit_amount,total_amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          crypto.randomUUID(),
          tenantId,
          folio.id,
          input.data.kind,
          input.data.description,
          input.data.serviceDate ?? null,
          input.data.quantity,
          input.data.unitAmount,
          signedTotal,
          req.user!.sub,
        ],
      );
      await refreshHotelFolio(client, tenantId, folio.id);
      return loadHotelFolioDetail(client, tenantId, reservationId);
    });
    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof FolioError) return res.status(error.status).json({ error: error.message });
    console.error("[hotel-06] folio item", error);
    return res.status(500).json({ error: "Could not add folio item" });
  }
});

router.delete("/tenants/:tenantId/hotelaria/hospedagem/reservas/:id/conta/itens/:itemId", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const reservationId = String(req.params.id);
  const itemId = String(req.params.itemId);
  if (!hotelAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  if (!reservationIdSchema.safeParse(reservationId).success || !reservationIdSchema.safeParse(itemId).success) {
    return res.status(422).json({ error: "Invalid folio item" });
  }
  try {
    const result = await hotelTransaction(tenantId, async (client) => {
      const folio = await lockOpenFolio(client, tenantId, reservationId);
      const item = await client.query(
        "SELECT id,kind FROM hotel_folio_items WHERE tenant_id=$1 AND folio_id=$2 AND id=$3",
        [tenantId, folio.id, itemId],
      );
      if (!item.rowCount) return null;
      if (item.rows[0].kind === "room") {
        throw new FolioError(409, "Diárias da reserva não podem ser removidas; ajuste a tarifa ou registre um desconto.");
      }
      await client.query(
        "DELETE FROM hotel_folio_items WHERE tenant_id=$1 AND folio_id=$2 AND id=$3",
        [tenantId, folio.id, itemId],
      );
      await refreshHotelFolio(client, tenantId, folio.id);
      return loadHotelFolioDetail(client, tenantId, reservationId);
    });
    return result ? res.json(result) : res.status(404).json({ error: "Folio item not found" });
  } catch (error) {
    if (error instanceof FolioError) return res.status(error.status).json({ error: error.message });
    return res.status(500).json({ error: "Could not remove folio item" });
  }
});

router.post("/tenants/:tenantId/hotelaria/hospedagem/reservas/:id/conta/pagamentos", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const reservationId = String(req.params.id);
  if (!hotelAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  if (!reservationIdSchema.safeParse(reservationId).success) {
    return res.status(422).json({ error: "Invalid reservation" });
  }
  const input = z.object({
    method: z.enum(paymentMethods),
    amount: paymentMoney,
    notes: z.string().trim().max(500).optional(),
  }).strict().safeParse(req.body);
  if (!input.success) return res.status(422).json({ error: "Invalid payment" });

  try {
    const result = await hotelTransaction(tenantId, async (client) => {
      const reservation = await loadReservation(client, tenantId, reservationId);
      if (!reservation) throw new FolioError(404, "Reservation not found");
      if (!["reserved", "checked_in"].includes(reservation.status)) {
        throw new FolioError(409, "A conta só aceita lançamentos enquanto a reserva está ativa.");
      }
      await ensureHotelFolio(client, tenantId, reservationId, req.user!.sub, reservation.currency ?? "BRL");
      const folio = await lockOpenFolio(client, tenantId, reservationId);
      await client.query(
        "INSERT INTO hotel_folio_payments(id,tenant_id,folio_id,method,amount,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [crypto.randomUUID(), tenantId, folio.id, input.data.method, input.data.amount, input.data.notes ?? null, req.user!.sub],
      );
      await refreshHotelFolio(client, tenantId, folio.id);
      return loadHotelFolioDetail(client, tenantId, reservationId);
    });
    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof FolioError) return res.status(error.status).json({ error: error.message });
    console.error("[hotel-06] folio payment", error);
    return res.status(500).json({ error: "Could not register payment" });
  }
});

router.delete("/tenants/:tenantId/hotelaria/hospedagem/reservas/:id/conta/pagamentos/:paymentId", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const reservationId = String(req.params.id);
  const paymentId = String(req.params.paymentId);
  if (!hotelAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  if (!reservationIdSchema.safeParse(reservationId).success || !reservationIdSchema.safeParse(paymentId).success) {
    return res.status(422).json({ error: "Invalid payment" });
  }
  try {
    const result = await hotelTransaction(tenantId, async (client) => {
      const folio = await lockOpenFolio(client, tenantId, reservationId);
      const deleted = await client.query(
        "DELETE FROM hotel_folio_payments WHERE tenant_id=$1 AND folio_id=$2 AND id=$3 RETURNING id",
        [tenantId, folio.id, paymentId],
      );
      if (!deleted.rowCount) return null;
      await refreshHotelFolio(client, tenantId, folio.id);
      return loadHotelFolioDetail(client, tenantId, reservationId);
    });
    return result ? res.json(result) : res.status(404).json({ error: "Payment not found" });
  } catch (error) {
    if (error instanceof FolioError) return res.status(error.status).json({ error: error.message });
    return res.status(500).json({ error: "Could not remove payment" });
  }
});

router.post("/tenants/:tenantId/hotelaria/hospedagem/reservas/:id/conta/fechar", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const reservationId = String(req.params.id);
  if (!hotelAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  if (!reservationIdSchema.safeParse(reservationId).success) {
    return res.status(422).json({ error: "Invalid reservation" });
  }
  try {
    const result = await hotelTransaction(tenantId, async (client) => {
      const reservation = await loadReservation(client, tenantId, reservationId);
      if (!reservation) throw new FolioError(404, "Reservation not found");
      const folio = await lockOpenFolio(client, tenantId, reservationId);
      const refreshed = await refreshHotelFolio(client, tenantId, folio.id);
      if (!isFolioSettled(Number(refreshed.balance))) {
        throw new FolioError(409, "A conta ainda tem saldo em aberto.", {
          code: "FOLIO_OPEN",
          folioId: folio.id,
          balance: refreshed.balance,
        });
      }
      await client.query(
        "UPDATE hotel_folios SET status='closed',closed_at=now(),closed_by=$3,balance=$4,updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [tenantId, folio.id, req.user!.sub, refreshed.balance],
      );
      return loadHotelFolioDetail(client, tenantId, reservationId);
    });
    return res.json(result);
  } catch (error) {
    if (error instanceof FolioError) return res.status(error.status).json({ error: error.message, ...(error.details ?? {}) });
    console.error("[hotel-06] close folio", error);
    return res.status(500).json({ error: "Could not close folio" });
  }
});

export default router;
