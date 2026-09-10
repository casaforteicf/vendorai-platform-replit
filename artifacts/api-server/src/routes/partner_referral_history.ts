import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { requireRole } from "../middlewares/auth.js";
import { vendorPool } from "../lib/vendorDb.js";

const router: IRouter = Router();

const filtersSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  campaign: z.string().max(200).optional(),
  city: z.string().max(200).optional(),
  region: z.string().max(200).optional(),
});

router.get("/admin/partners-commercial/history", requireRole("super_admin"), async (req, res) => {
  const parsed = filtersSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(422).json({ error: "Filtros inválidos", details: parsed.error.flatten() });
    return;
  }

  const filters = parsed.data;
  const values: unknown[] = [];
  const where: string[] = [];

  function push(value: unknown) {
    values.push(value);
    return `$${values.length}`;
  }

  if (filters.from) where.push(`event_at >= ${push(filters.from)}::timestamptz`);
  if (filters.to) where.push(`event_at <= ${push(filters.to)}::timestamptz`);
  if (filters.campaign) where.push(`lower(coalesce(campaign,'')) = lower(${push(filters.campaign)})`);
  if (filters.city) where.push(`lower(coalesce(city,'')) = lower(${push(filters.city)})`);
  if (filters.region) where.push(`lower(coalesce(region,'')) = lower(${push(filters.region)})`);

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const result = await vendorPool.query(
    `WITH filtered AS (
       SELECT * FROM partner_referral_history
       ${whereSql}
     )
     SELECT
       p.id AS "partnerId",
       count(*) FILTER (WHERE f.event_type='click')::int AS clicks,
       count(*) FILTER (WHERE f.event_type='lead')::int AS leads,
       count(*) FILTER (WHERE f.event_type='order')::int AS orders,
       count(*) FILTER (WHERE f.event_type='sale')::int AS sales,
       count(*) FILTER (WHERE f.event_type='commission')::int AS commissions,
       coalesce(sum(f.commission_amount) FILTER (WHERE f.event_type='commission'),0)::text AS "commissionAmount",
       coalesce(sum(f.commission_amount) FILTER (WHERE f.event_type='commission' AND f.commission_paid),0)::text AS "paidCommissionAmount",
       CASE WHEN count(*) FILTER (WHERE f.event_type='click') > 0
         THEN round((count(*) FILTER (WHERE f.event_type='lead'))::numeric / (count(*) FILTER (WHERE f.event_type='click'))::numeric * 100, 2)
         ELSE 0 END::text AS "leadConversionPercent",
       CASE WHEN count(*) FILTER (WHERE f.event_type='click') > 0
         THEN round((count(*) FILTER (WHERE f.event_type='sale'))::numeric / (count(*) FILTER (WHERE f.event_type='click'))::numeric * 100, 2)
         ELSE 0 END::text AS "saleConversionPercent",
       CASE WHEN count(*) FILTER (WHERE f.event_type='lead') > 0
         THEN round((count(*) FILTER (WHERE f.event_type='sale'))::numeric / (count(*) FILTER (WHERE f.event_type='lead'))::numeric * 100, 2)
         ELSE 0 END::text AS "leadToSalePercent"
     FROM partners p
     LEFT JOIN filtered f ON f.partner_id = p.id
     GROUP BY p.id, p.created_at
     ORDER BY p.created_at DESC`,
    values,
  );

  const dimensions = await vendorPool.query(
    `SELECT
       array_remove(array_agg(DISTINCT campaign ORDER BY campaign), NULL) AS campaigns,
       array_remove(array_agg(DISTINCT city ORDER BY city), NULL) AS cities,
       array_remove(array_agg(DISTINCT region ORDER BY region), NULL) AS regions
     FROM partner_referral_history
     ${whereSql}`,
    values,
  );

  res.json({
    rows: result.rows,
    filters: {
      from: filters.from ?? null,
      to: filters.to ?? null,
      campaign: filters.campaign ?? null,
      city: filters.city ?? null,
      region: filters.region ?? null,
    },
    dimensions: dimensions.rows[0] ?? { campaigns: [], cities: [], regions: [] },
  });
});

export default router;
