/**
 * Conta (folio) da hospedagem: uma por reserva, aberta até o check-out.
 * O saldo é sempre recalculado a partir dos itens e pagamentos dentro da
 * mesma transação que os altera.
 */

export type HotelFolioRow = {
  id: string;
  status: "open" | "closed";
  currency: string;
  charges_total: string;
  payments_total: string;
  balance: string;
};

export async function ensureHotelFolio(
  client: any,
  tenantId: string,
  reservationId: string,
  userId: string,
  currency = "BRL",
): Promise<HotelFolioRow> {
  const existing = await client.query(
    "SELECT id,status,currency,charges_total,payments_total,balance FROM hotel_folios WHERE tenant_id=$1 AND reservation_id=$2",
    [tenantId, reservationId],
  );
  if (existing.rowCount) return existing.rows[0];

  const inserted = await client.query(
    `INSERT INTO hotel_folios(id,tenant_id,reservation_id,currency,created_by)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT (tenant_id,reservation_id) DO UPDATE SET updated_at=hotel_folios.updated_at
     RETURNING id,status,currency,charges_total,payments_total,balance`,
    [crypto.randomUUID(), tenantId, reservationId, currency, userId],
  );
  return inserted.rows[0];
}

export async function refreshHotelFolio(
  client: any,
  tenantId: string,
  folioId: string,
): Promise<HotelFolioRow> {
  const sums = await client.query(
    `SELECT
       COALESCE((SELECT SUM(total_amount) FROM hotel_folio_items WHERE tenant_id=$1 AND folio_id=$2),0)::text AS charges_total,
       COALESCE((SELECT SUM(amount) FROM hotel_folio_payments WHERE tenant_id=$1 AND folio_id=$2),0)::text AS payments_total`,
    [tenantId, folioId],
  );
  const charges = Math.round(Number(sums.rows[0]?.charges_total ?? 0) * 100);
  const payments = Math.round(Number(sums.rows[0]?.payments_total ?? 0) * 100);
  const balance = (charges - payments) / 100;
  const updated = await client.query(
    "UPDATE hotel_folios SET charges_total=$3,payments_total=$4,balance=$5,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status,currency,charges_total,payments_total,balance",
    [tenantId, folioId, charges / 100, payments / 100, balance],
  );
  return updated.rows[0];
}

export async function loadHotelFolioDetail(client: any, tenantId: string, reservationId: string) {
  const folio = (await client.query(
    "SELECT id,reservation_id,status,currency,charges_total,payments_total,balance,opened_at,closed_at,closed_by,created_by,updated_at FROM hotel_folios WHERE tenant_id=$1 AND reservation_id=$2",
    [tenantId, reservationId],
  )).rows[0];
  if (!folio) return null;

  const items = await client.query(
    "SELECT id,kind,description,service_date,quantity,unit_amount,total_amount,created_by,created_at FROM hotel_folio_items WHERE tenant_id=$1 AND folio_id=$2 ORDER BY service_date NULLS LAST,created_at,id",
    [tenantId, folio.id],
  );
  const payments = await client.query(
    "SELECT id,method,amount,notes,paid_at,created_by FROM hotel_folio_payments WHERE tenant_id=$1 AND folio_id=$2 ORDER BY paid_at,created_at,id",
    [tenantId, folio.id],
  );

  return { folio, items: items.rows, payments: payments.rows };
}
