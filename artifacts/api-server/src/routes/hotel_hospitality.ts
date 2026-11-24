import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { validStay } from "../lib/hotel-stay-rules.js";
import { hotelAllowed, hotelTransaction } from "../lib/hotel-http.js";
import { ensureHotelFolio, refreshHotelFolio } from "../lib/hotel-folio.js";
import {
  InvalidHotelStayError,
  isFolioSettled,
  quoteHotelStay,
  ratePlanMatchesRoomCategory,
} from "../lib/hotel-rate-engine.js";

const router: IRouter = Router();
const id = z.string().uuid();
const money = z.number().finite().min(0).max(10000000);
const category = z.string().trim().min(1).max(40);

const roomInput = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(100),
  capacity: z.number().int().min(1).max(30),
  category: category.default("standard"),
}).strict();

const roomUpdate = z.object({
  name: z.string().trim().min(1).max(100),
  capacity: z.number().int().min(1).max(30),
  category,
}).partial().strict();

const guestInput = z.object({
  fullName: z.string().trim().min(2).max(180),
  contactEmail: z.email().optional(),
  contactPhone: z.string().max(40).optional(),
}).strict();

const bookingInput = z.object({
  roomId: id,
  guestId: id,
  arrivalDate: z.iso.date(),
  departureDate: z.iso.date(),
  guestCount: z.number().int().min(1).max(30),
  ratePlanId: id.optional(),
  nightlyAmount: money.optional(),
}).strict();

class HotelBookingError extends Error {
  constructor(readonly status: number, message: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = "HotelBookingError";
  }
}

function nightsBetween(arrivalDate: string, departureDate: string): number {
  return (Date.parse(`${departureDate}T00:00:00Z`) - Date.parse(`${arrivalDate}T00:00:00Z`)) / 86_400_000;
}

async function addRoomCharges(
  client: any,
  tenantId: string,
  folioId: string,
  userId: string,
  description: string,
  nightly: Array<{ date: string; amount: string }>,
) {
  for (const night of nightly) {
    await client.query(
      "INSERT INTO hotel_folio_items(id,tenant_id,folio_id,kind,description,service_date,quantity,unit_amount,total_amount,created_by) VALUES($1,$2,$3,'room',$4,$5,1,$6,$6,$7)",
      [crypto.randomUUID(), tenantId, folioId, description, night.date, night.amount, userId],
    );
  }
}

router.get("/tenants/:tenantId/hotelaria/hospedagem/quartos", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hotelAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    return res.json(await hotelTransaction(tenantId, async (client) => (
      await client.query(
        "SELECT id,code,name,capacity,category,status,housekeeping_status FROM hotel_rooms WHERE tenant_id=$1 ORDER BY code",
        [tenantId],
      )
    ).rows));
  } catch {
    return res.status(500).json({ error: "Could not list rooms" });
  }
});

router.post("/tenants/:tenantId/hotelaria/hospedagem/quartos", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hotelAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  const input = roomInput.safeParse(req.body);
  if (!input.success) return res.status(422).json({ error: "Invalid room" });
  try {
    const result = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        "INSERT INTO hotel_rooms(id,tenant_id,code,name,capacity,category) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,code,name,capacity,category,status,housekeeping_status",
        [crypto.randomUUID(), tenantId, input.data.code, input.data.name, input.data.capacity, input.data.category],
      )
    ));
    return res.status(201).json(result.rows[0]);
  } catch {
    return res.status(409).json({ error: "Could not create room; code may already exist" });
  }
});

router.patch("/tenants/:tenantId/hotelaria/hospedagem/quartos/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const roomId = String(req.params.id);
  if (!hotelAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  if (!id.safeParse(roomId).success) return res.status(422).json({ error: "Invalid room" });
  const input = roomUpdate.safeParse(req.body);
  if (!input.success || !Object.keys(input.data).length) {
    return res.status(422).json({ error: "Invalid room update" });
  }

  const values: unknown[] = [tenantId, roomId];
  const sets: string[] = [];
  const add = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column}=$${values.length}`);
  };
  if ("name" in input.data) add("name", input.data.name);
  if ("capacity" in input.data) add("capacity", input.data.capacity);
  if ("category" in input.data) add("category", input.data.category);

  try {
    const result = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `UPDATE hotel_rooms SET ${sets.join(",")} WHERE tenant_id=$1 AND id=$2 RETURNING id,code,name,capacity,category,status,housekeeping_status`,
        values,
      )
    ).rows[0]);
    return result ? res.json(result) : res.status(404).json({ error: "Room not found" });
  } catch {
    return res.status(500).json({ error: "Could not update room" });
  }
});

router.post("/tenants/:tenantId/hotelaria/hospedagem/quartos/:id/operacao", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const roomId = String(req.params.id);
  if (!hotelAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  const input = z.object({
    action: z.enum(["dirty", "cleaning", "inspection", "clean", "maintenance", "release"]),
    notes: z.string().max(1000).optional(),
  }).strict().safeParse(req.body);
  if (!id.safeParse(roomId).success || !input.success) {
    return res.status(422).json({ error: "Invalid room operation" });
  }
  try {
    const result = await hotelTransaction(tenantId, async (client) => {
      const current = await client.query(
        "SELECT id,status,housekeeping_status FROM hotel_rooms WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
        [tenantId, roomId],
      );
      if (!current.rowCount) return null;
      const room = current.rows[0];
      const maintenance = ["maintenance", "release"].includes(input.data.action);
      if (input.data.action === "release" && room.status !== "maintenance") return null;
      if (input.data.action === "maintenance" && room.status !== "active") return null;
      if (!maintenance && room.status !== "active") return null;
      if (input.data.action === "maintenance") {
        const occupied = await client.query(
          "SELECT 1 FROM hotel_reservations WHERE tenant_id=$1 AND room_id=$2 AND status='checked_in' LIMIT 1",
          [tenantId, roomId],
        );
        if (occupied.rowCount) return null;
      }
      const from = maintenance ? room.status : room.housekeeping_status;
      const to = input.data.action === "release" ? "active" : input.data.action;
      if (from === to) return null;
      if (maintenance) {
        await client.query("UPDATE hotel_rooms SET status=$3 WHERE tenant_id=$1 AND id=$2", [tenantId, roomId, to]);
      } else {
        await client.query("UPDATE hotel_rooms SET housekeeping_status=$3 WHERE tenant_id=$1 AND id=$2", [tenantId, roomId, to]);
      }
      await client.query(
        "INSERT INTO hotel_room_operational_events(id,tenant_id,room_id,event_type,previous_status,new_status,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          crypto.randomUUID(),
          tenantId,
          roomId,
          maintenance ? (input.data.action === "maintenance" ? "maintenance" : "release") : "housekeeping",
          from,
          to,
          input.data.notes ?? null,
          req.user!.sub,
        ],
      );
      return { id: roomId, status: maintenance ? to : room.status, housekeepingStatus: maintenance ? room.housekeeping_status : to };
    });
    if (!result) return res.status(409).json({ error: "Room absent or operation not permitted" });
    return res.json(result);
  } catch (error) {
    console.error("[hotel-04] room operation", error);
    return res.status(500).json({ error: "Room operation failed" });
  }
});

router.get("/tenants/:tenantId/hotelaria/hospedagem/quartos/:id/historico", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const roomId = String(req.params.id);
  if (!hotelAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  if (!id.safeParse(roomId).success) return res.status(422).json({ error: "Invalid room" });
  try {
    return res.json(await hotelTransaction(tenantId, async (client) => (
      await client.query(
        "SELECT event_type,previous_status,new_status,notes,created_by,created_at FROM hotel_room_operational_events WHERE tenant_id=$1 AND room_id=$2 ORDER BY created_at DESC LIMIT 100",
        [tenantId, roomId],
      )
    ).rows));
  } catch {
    return res.status(500).json({ error: "Could not list room history" });
  }
});

router.get("/tenants/:tenantId/hotelaria/hospedagem/hospedes", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hotelAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    return res.json(await hotelTransaction(tenantId, async (client) => (
      await client.query(
        "SELECT id,full_name FROM hotel_guests WHERE tenant_id=$1 ORDER BY full_name LIMIT 500",
        [tenantId],
      )
    ).rows));
  } catch {
    return res.status(500).json({ error: "Could not list guests" });
  }
});

router.post("/tenants/:tenantId/hotelaria/hospedagem/hospedes", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hotelAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  const input = guestInput.safeParse(req.body);
  if (!input.success) return res.status(422).json({ error: "Invalid guest" });
  try {
    const result = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        "INSERT INTO hotel_guests(id,tenant_id,full_name,contact_email,contact_phone) VALUES($1,$2,$3,$4,$5) RETURNING id,full_name,contact_email,contact_phone",
        [crypto.randomUUID(), tenantId, input.data.fullName, input.data.contactEmail ?? null, input.data.contactPhone ?? null],
      )
    ));
    return res.status(201).json(result.rows[0]);
  } catch {
    return res.status(500).json({ error: "Could not register guest" });
  }
});

router.get("/tenants/:tenantId/hotelaria/hospedagem/reservas", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hotelAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    return res.json(await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `SELECT r.id,r.room_id,r.primary_guest_id,r.arrival_date,r.departure_date,r.guest_count,r.status,
                r.rate_plan_id,r.total_amount,r.currency,r.nightly_prices,
                rm.code AS room_code,rm.category AS room_category,g.full_name AS guest_name,
                f.id AS folio_id,f.status AS folio_status,f.balance AS folio_balance
         FROM hotel_reservations r
         JOIN hotel_rooms rm ON rm.tenant_id=r.tenant_id AND rm.id=r.room_id
         JOIN hotel_guests g ON g.tenant_id=r.tenant_id AND g.id=r.primary_guest_id
         LEFT JOIN hotel_folios f ON f.tenant_id=r.tenant_id AND f.reservation_id=r.id
         WHERE r.tenant_id=$1
         ORDER BY r.arrival_date DESC LIMIT 500`,
        [tenantId],
      )
    ).rows));
  } catch {
    return res.status(500).json({ error: "Could not list bookings" });
  }
});

router.get("/tenants/:tenantId/hotelaria/hospedagem/disponibilidade", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hotelAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const input = z.object({
    arrivalDate: z.iso.date(),
    departureDate: z.iso.date(),
    guestCount: z.coerce.number().int().min(1).max(30),
    category: category.optional(),
  }).safeParse(req.query);
  if (!input.success || !validStay(input.data.arrivalDate, input.data.departureDate)) {
    return res.status(422).json({ error: "Invalid search period" });
  }
  const nights = nightsBetween(input.data.arrivalDate, input.data.departureDate);
  if (!Number.isInteger(nights) || nights > 365) return res.status(422).json({ error: "Maximum 365 nights" });
  try {
    const rooms = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `SELECT rm.id,rm.code,rm.name,rm.capacity,rm.category,rm.status,rm.housekeeping_status
         FROM hotel_rooms rm
         WHERE rm.tenant_id=$1 AND rm.status='active' AND rm.capacity>=$4
           AND ($5::text IS NULL OR lower(rm.category)=lower($5::text))
           AND NOT EXISTS (
             SELECT 1 FROM hotel_reservations r
             WHERE r.tenant_id=rm.tenant_id AND r.room_id=rm.id AND r.status IN ('reserved','checked_in')
               AND r.arrival_date<$3::date AND r.departure_date>$2::date
           )
         ORDER BY rm.code`,
        [tenantId, input.data.arrivalDate, input.data.departureDate, input.data.guestCount, input.data.category ?? null],
      )
    ).rows);
    return res.json({
      arrivalDate: input.data.arrivalDate,
      departureDate: input.data.departureDate,
      rooms,
      availabilitySubjectToRecheck: true,
    });
  } catch {
    return res.status(500).json({ error: "Could not check availability" });
  }
});

router.post("/tenants/:tenantId/hotelaria/hospedagem/reservas", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hotelAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  const input = bookingInput.safeParse(req.body);
  if (!input.success || !validStay(input.data.arrivalDate, input.data.departureDate)) {
    return res.status(422).json({ error: "Invalid booking dates or party" });
  }
  if (!input.data.ratePlanId && input.data.nightlyAmount === undefined) {
    return res.status(422).json({ error: "Informe um plano tarifário ou o valor da diária." });
  }
  const nights = nightsBetween(input.data.arrivalDate, input.data.departureDate);
  if (!Number.isInteger(nights) || nights > 365) return res.status(422).json({ error: "Maximum 365 nights" });

  try {
    const result = await hotelTransaction(tenantId, async (client) => {
      const room = await client.query(
        "SELECT id,capacity,category FROM hotel_rooms WHERE tenant_id=$1 AND id=$2 AND status='active' FOR UPDATE",
        [tenantId, input.data.roomId],
      );
      if (!room.rowCount) throw new HotelBookingError(409, "Apartamento indisponível.");
      if (input.data.guestCount > room.rows[0].capacity) {
        throw new HotelBookingError(422, "Hóspedes acima da capacidade do apartamento.");
      }

      const guest = await client.query(
        "SELECT id FROM hotel_guests WHERE tenant_id=$1 AND id=$2",
        [tenantId, input.data.guestId],
      );
      if (!guest.rowCount) throw new HotelBookingError(422, "Hóspede não encontrado.");

      const conflict = await client.query(
        "SELECT id FROM hotel_reservations WHERE tenant_id=$1 AND room_id=$2 AND status IN ('reserved','checked_in') AND arrival_date<$4 AND departure_date>$3 LIMIT 1",
        [tenantId, input.data.roomId, input.data.arrivalDate, input.data.departureDate],
      );
      if (conflict.rowCount) throw new HotelBookingError(409, "Apartamento indisponível no período.");

      let ratePlanId: string | null = null;
      let quotationId: string | null = null;
      let nightly: Array<{ date: string; amount: string }>;
      let totalFormatted: string;
      let currency = "BRL";
      let chargeDescription = "Diária";

      if (input.data.ratePlanId) {
        const planResult = await client.query(
          "SELECT id,name,currency,standard_amount,extra_guest_amount,room_category,active FROM hotel_rate_plans WHERE tenant_id=$1 AND id=$2",
          [tenantId, input.data.ratePlanId],
        );
        const plan = planResult.rows[0];
        if (!plan?.active) throw new HotelBookingError(422, "Plano tarifário inativo ou inexistente.");
        if (!ratePlanMatchesRoomCategory(plan.room_category, room.rows[0].category)) {
          throw new HotelBookingError(422, "A tarifa não se aplica à categoria deste apartamento.");
        }
        const adjustments = await client.query(
          "SELECT start_date::text,end_date::text,weekday,amount,priority FROM hotel_rate_adjustments WHERE tenant_id=$1 AND plan_id=$2 AND start_date<$4::date AND end_date>=$3::date ORDER BY priority DESC,created_at DESC,id DESC",
          [tenantId, plan.id, input.data.arrivalDate, input.data.departureDate],
        );
        const quote = quoteHotelStay(
          input.data,
          {
            standardAmount: plan.standard_amount,
            extraGuestAmount: plan.extra_guest_amount,
            roomCategory: plan.room_category,
          },
          adjustments.rows.map((row: any) => ({
            startDate: row.start_date,
            endDate: row.end_date,
            weekday: row.weekday === null ? null : Number(row.weekday),
            amount: row.amount,
            priority: Number(row.priority),
          })),
        );
        nightly = quote.nights.map((night) => ({ date: night.date, amount: night.amountFormatted }));
        totalFormatted = quote.totalFormatted;
        currency = plan.currency ?? "BRL";
        ratePlanId = plan.id;
        chargeDescription = `Diária · ${plan.name}`;

        const quotation = await client.query(
          "INSERT INTO hotel_rate_quotations(id,tenant_id,plan_id,arrival_date,departure_date,guest_count,nightly_prices,total_amount,currency,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
          [
            crypto.randomUUID(),
            tenantId,
            plan.id,
            input.data.arrivalDate,
            input.data.departureDate,
            input.data.guestCount,
            JSON.stringify(nightly),
            totalFormatted,
            currency,
            req.user!.sub,
          ],
        );
        quotationId = quotation.rows[0].id;
      } else {
        const nightlyCents = Math.round((input.data.nightlyAmount ?? 0) * 100);
        totalFormatted = ((nightlyCents * nights) / 100).toFixed(2);
        nightly = [];
        for (let index = 0; index < nights; index += 1) {
          const date = new Date(Date.parse(`${input.data.arrivalDate}T00:00:00Z`) + index * 86_400_000)
            .toISOString()
            .slice(0, 10);
          nightly.push({ date, amount: (nightlyCents / 100).toFixed(2) });
        }
      }

      const reservationId = crypto.randomUUID();
      const reservation = await client.query(
        `INSERT INTO hotel_reservations(
           id,tenant_id,room_id,primary_guest_id,arrival_date,departure_date,guest_count,created_by,
           rate_plan_id,quotation_id,nightly_prices,total_amount,currency
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id,status,arrival_date,departure_date,guest_count,total_amount,currency,rate_plan_id`,
        [
          reservationId,
          tenantId,
          input.data.roomId,
          input.data.guestId,
          input.data.arrivalDate,
          input.data.departureDate,
          input.data.guestCount,
          req.user!.sub,
          ratePlanId,
          quotationId,
          JSON.stringify(nightly),
          totalFormatted,
          currency,
        ],
      );

      const folio = await ensureHotelFolio(client, tenantId, reservationId, req.user!.sub, currency);
      await addRoomCharges(client, tenantId, folio.id, req.user!.sub, chargeDescription, nightly);
      const refreshed = await refreshHotelFolio(client, tenantId, folio.id);

      return { ...reservation.rows[0], folio: refreshed };
    });

    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof HotelBookingError) {
      return res.status(error.status).json({ error: error.message, ...(error.details ?? {}) });
    }
    if (error instanceof InvalidHotelStayError) return res.status(422).json({ error: error.message });
    console.error("[hotel-06] create booking", error);
    return res.status(500).json({ error: "Could not create booking" });
  }
});

router.post("/tenants/:tenantId/hotelaria/hospedagem/reservas/:id/:action", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const reservationId = String(req.params.id);
  const action = String(req.params.action);
  if (!hotelAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  if (!id.safeParse(reservationId).success || !["checkin", "checkout", "cancel"].includes(action)) {
    return res.status(422).json({ error: "Invalid operation" });
  }
  const from = action === "checkin" ? "reserved" : action === "checkout" ? "checked_in" : "reserved";
  const to = action === "checkin" ? "checked_in" : action === "checkout" ? "checked_out" : "cancelled";
  const column = action === "checkin" ? "checked_in_at" : action === "checkout" ? "checked_out_at" : null;

  try {
    const result = await hotelTransaction(tenantId, async (client) => {
      const existing = await client.query(
        "SELECT room_id,status FROM hotel_reservations WHERE tenant_id=$1 AND id=$2",
        [tenantId, reservationId],
      );
      if (!existing.rowCount || existing.rows[0].status !== from) return null;
      const room = await client.query(
        "SELECT status,housekeeping_status FROM hotel_rooms WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
        [tenantId, existing.rows[0].room_id],
      );
      if (!room.rowCount) return null;
      if (action === "checkin" && (room.rows[0].status !== "active" || room.rows[0].housekeeping_status !== "clean")) {
        return null;
      }
      if (action === "checkin") {
        const already = await client.query(
          "SELECT 1 FROM hotel_reservations WHERE tenant_id=$1 AND room_id=$2 AND id<>$3 AND status='checked_in' LIMIT 1",
          [tenantId, existing.rows[0].room_id, reservationId],
        );
        if (already.rowCount) return null;
      }

      let folioClosed = false;
      if (action === "checkout" || action === "cancel") {
        const folioResult = await client.query(
          "SELECT id,status,balance FROM hotel_folios WHERE tenant_id=$1 AND reservation_id=$2 FOR UPDATE",
          [tenantId, reservationId],
        );
        const folio = folioResult.rows[0];
        if (folio && folio.status === "open") {
          const refreshed = await refreshHotelFolio(client, tenantId, folio.id);
          if (action === "checkout" && !isFolioSettled(Number(refreshed.balance))) {
            throw new HotelBookingError(409, "Conta em aberto. Registre o pagamento antes do check-out.", {
              code: "FOLIO_OPEN",
              folioId: folio.id,
              balance: refreshed.balance,
            });
          }
          await client.query(
            "UPDATE hotel_folios SET status='closed',closed_at=now(),closed_by=$3,balance=$4,updated_at=now() WHERE tenant_id=$1 AND id=$2",
            [tenantId, folio.id, req.user!.sub, refreshed.balance],
          );
          folioClosed = true;
        }
      }

      const changed = await client.query(
        `UPDATE hotel_reservations SET status=$3${column ? `, ${column}=now()` : ""} WHERE tenant_id=$1 AND id=$2 AND status=$4 RETURNING id,status`,
        [tenantId, reservationId, to, from],
      );
      if (!changed.rowCount) return null;
      if (action === "checkout") {
        await client.query(
          "UPDATE hotel_rooms SET housekeeping_status='dirty' WHERE tenant_id=$1 AND id=$2",
          [tenantId, existing.rows[0].room_id],
        );
        await client.query(
          "INSERT INTO hotel_room_operational_events(id,tenant_id,room_id,event_type,previous_status,new_status,created_by) VALUES($1,$2,$3,'housekeeping',$4,'dirty',$5)",
          [crypto.randomUUID(), tenantId, existing.rows[0].room_id, room.rows[0].housekeeping_status, req.user!.sub],
        );
      }
      return { ...changed.rows[0], folioClosed };
    });

    if (!result) return res.status(409).json({ error: "Room unavailable, not clean or invalid booking transition" });
    return res.json(result);
  } catch (error) {
    if (error instanceof HotelBookingError) {
      return res.status(error.status).json({ error: error.message, ...(error.details ?? {}) });
    }
    return res.status(500).json({ error: "Could not update booking" });
  }
});

router.get("/tenants/:tenantId/hotelaria/hospedagem/previsao-refeicoes", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hotelAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const query = z.object({ start: z.iso.date(), end: z.iso.date() }).safeParse(req.query);
  if (!query.success || query.data.end < query.data.start) {
    return res.status(422).json({ error: "Invalid date range" });
  }
  const start = new Date(`${query.data.start}T12:00:00Z`);
  const end = new Date(`${query.data.end}T12:00:00Z`);
  if ((end.getTime() - start.getTime()) / 86_400_000 > 30) {
    return res.status(422).json({ error: "Maximum 31 days" });
  }
  try {
    const rows = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `SELECT gs.day::date::text AS service_date,
           COALESCE(sum(r.guest_count) FILTER(WHERE r.status='checked_in'),0)::int AS checked_in_guests,
           COALESCE(sum(r.guest_count) FILTER(WHERE r.status='reserved'),0)::int AS reserved_guests,
           COALESCE(count(r.id),0)::int AS occupied_or_reserved_rooms
         FROM generate_series($2::date,$3::date,interval '1 day') gs(day)
         LEFT JOIN hotel_reservations r ON r.tenant_id=$1 AND r.status IN ('reserved','checked_in')
           AND r.arrival_date<=gs.day::date AND r.departure_date>gs.day::date
         GROUP BY gs.day ORDER BY gs.day`,
        [tenantId, query.data.start, query.data.end],
      )
    ).rows);
    return res.json({
      start: query.data.start,
      end: query.data.end,
      source: "hotel_reservations",
      automaticMealCreation: false,
      days: rows,
    });
  } catch (error) {
    console.error("[hotel-04] meal occupancy", error);
    return res.status(500).json({ error: "Unable to calculate occupancy" });
  }
});

export default router;
