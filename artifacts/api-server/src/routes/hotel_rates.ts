import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import {
  InvalidHotelStayError,
  quoteHotelStay,
  ratePlanMatchesRoomCategory,
} from "../lib/hotel-rate-engine.js";
import { hotelAllowed, hotelTransaction } from "../lib/hotel-http.js";

const router: IRouter = Router();
const money = z.number().finite().min(0).max(10000000);
const date = z.iso.date();
const category = z.string().trim().min(1).max(40);


router.get("/tenants/:tenantId/hotelaria/tarifas", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hotelAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    return res.json(await hotelTransaction(tenantId, async (client) => (
      await client.query(
        "SELECT id,name,currency,standard_amount,extra_guest_amount,room_category,active FROM hotel_rate_plans WHERE tenant_id=$1 ORDER BY name",
        [tenantId],
      )
    ).rows));
  } catch {
    return res.status(500).json({ error: "Unable to list rates" });
  }
});

router.post("/tenants/:tenantId/hotelaria/tarifas", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hotelAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  const input = z.object({
    name: z.string().trim().min(1).max(100),
    standardAmount: money,
    extraGuestAmount: money.default(0),
    roomCategory: category.nullable().default(null),
  }).strict().safeParse(req.body);
  if (!input.success) return res.status(422).json({ error: "Invalid rate" });
  try {
    const row = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        "INSERT INTO hotel_rate_plans(id,tenant_id,name,standard_amount,extra_guest_amount,room_category) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,standard_amount,extra_guest_amount,room_category",
        [crypto.randomUUID(), tenantId, input.data.name, input.data.standardAmount, input.data.extraGuestAmount, input.data.roomCategory],
      )
    ).rows[0]);
    return res.status(201).json(row);
  } catch {
    return res.status(409).json({ error: "Rate plan not created" });
  }
});

router.patch("/tenants/:tenantId/hotelaria/tarifas/:planId", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const planId = String(req.params.planId);
  if (!hotelAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  const input = z.object({
    name: z.string().trim().min(1).max(100),
    standardAmount: money,
    extraGuestAmount: money,
    roomCategory: category.nullable(),
    active: z.boolean(),
  }).partial().strict().safeParse(req.body);
  if (!input.success || !Object.keys(input.data).length) {
    return res.status(422).json({ error: "Invalid rate update" });
  }

  const values: unknown[] = [tenantId, planId];
  const sets: string[] = [];
  const add = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column}=$${values.length}`);
  };
  if ("name" in input.data) add("name", input.data.name);
  if ("standardAmount" in input.data) add("standard_amount", input.data.standardAmount);
  if ("extraGuestAmount" in input.data) add("extra_guest_amount", input.data.extraGuestAmount);
  if ("roomCategory" in input.data) add("room_category", input.data.roomCategory ?? null);
  if ("active" in input.data) add("active", input.data.active);

  try {
    const row = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        `UPDATE hotel_rate_plans SET ${sets.join(",")} WHERE tenant_id=$1 AND id=$2 RETURNING id,name,standard_amount,extra_guest_amount,room_category,active`,
        values,
      )
    ).rows[0]);
    return row ? res.json(row) : res.status(404).json({ error: "Plan not found" });
  } catch {
    return res.status(500).json({ error: "Unable to edit rate" });
  }
});

router.post("/tenants/:tenantId/hotelaria/tarifas/:planId/periodos", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const planId = String(req.params.planId);
  if (!hotelAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  const input = z.object({
    startDate: date,
    endDate: date,
    weekday: z.number().int().min(0).max(6).nullable().default(null),
    amount: money,
    priority: z.number().int().min(-100).max(100).default(0),
  }).strict().safeParse(req.body);
  if (!input.success || input.data.endDate < input.data.startDate) {
    return res.status(422).json({ error: "Invalid period" });
  }
  try {
    const row = await hotelTransaction(tenantId, async (client) => (
      await client.query(
        "INSERT INTO hotel_rate_adjustments(id,tenant_id,plan_id,start_date,end_date,weekday,amount,priority) SELECT $1,$2,id,$4,$5,$6,$7,$8 FROM hotel_rate_plans WHERE tenant_id=$2 AND id=$3 RETURNING id",
        [crypto.randomUUID(), tenantId, planId, input.data.startDate, input.data.endDate, input.data.weekday, input.data.amount, input.data.priority],
      )
    ).rows[0]);
    return row ? res.status(201).json(row) : res.status(404).json({ error: "Plan not found" });
  } catch {
    return res.status(500).json({ error: "Unable to add rate period" });
  }
});

router.post("/tenants/:tenantId/hotelaria/tarifas/:planId/cotacao", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const planId = String(req.params.planId);
  if (!hotelAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  const input = z.object({
    arrivalDate: date,
    departureDate: date,
    guestCount: z.number().int().min(1).max(30),
    roomCategory: category.optional(),
  }).strict().safeParse(req.body);
  if (!input.success) return res.status(422).json({ error: "Invalid quotation" });

  try {
    const result = await hotelTransaction(tenantId, async (client) => {
      const planResult = await client.query(
        "SELECT standard_amount,extra_guest_amount,room_category,active FROM hotel_rate_plans WHERE tenant_id=$1 AND id=$2",
        [tenantId, planId],
      );
      const plan = planResult.rows[0];
      if (!plan?.active) return { status: 404 as const, body: { error: "Inactive or unknown plan" } };
      if (!ratePlanMatchesRoomCategory(plan.room_category, input.data.roomCategory)) {
        return { status: 422 as const, body: { error: "Rate plan does not apply to this room category" } };
      }

      const adjustments = await client.query(
        "SELECT start_date::text,end_date::text,weekday,amount,priority FROM hotel_rate_adjustments WHERE tenant_id=$1 AND plan_id=$2 AND start_date<$4::date AND end_date>=$3::date ORDER BY priority DESC,created_at DESC,id DESC",
        [tenantId, planId, input.data.arrivalDate, input.data.departureDate],
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
      const nightly = quote.nights.map((night) => ({ date: night.date, amount: night.amountFormatted }));
      const quotation = (await client.query(
        "INSERT INTO hotel_rate_quotations(id,tenant_id,plan_id,arrival_date,departure_date,guest_count,nightly_prices,total_amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,total_amount,currency",
        [
          crypto.randomUUID(),
          tenantId,
          planId,
          input.data.arrivalDate,
          input.data.departureDate,
          input.data.guestCount,
          JSON.stringify(nightly),
          quote.totalFormatted,
          req.user!.sub,
        ],
      )).rows[0];
      return { status: 201 as const, body: { ...quotation, nights: nightly, financialPosting: false } };
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    if (error instanceof InvalidHotelStayError) return res.status(422).json({ error: error.message });
    console.error("[hotel-rates] quote", error);
    return res.status(500).json({ error: "Unable to calculate quotation" });
  }
});

export default router;
