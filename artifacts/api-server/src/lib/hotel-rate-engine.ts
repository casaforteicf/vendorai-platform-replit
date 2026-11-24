/**
 * Motor único de tarifas e conta da Hotelaria.
 *
 * A cotação pública (`/hotelaria/tarifas/:id/cotacao`) e a criação da reserva
 * precisam usar exatamente a mesma conta; antes a fórmula vivia só dentro da
 * rota de cotação e a reserva não guardava preço. Aqui o cálculo é puro,
 * inteiro (centavos) e testável, sem tocar no banco.
 */

export type HotelRatePlan = {
  standardAmount: number | string;
  extraGuestAmount: number | string;
  roomCategory?: string | null;
};

export type HotelRateAdjustment = {
  startDate: string;
  endDate: string;
  weekday: number | null;
  amount: number | string;
  priority: number;
};

export type HotelStayInput = {
  arrivalDate: string;
  departureDate: string;
  guestCount: number;
};

export type HotelNightlyPrice = {
  date: string;
  amount: number;
  amountFormatted: string;
};

export type HotelStayQuote = {
  nights: HotelNightlyPrice[];
  nightsCount: number;
  total: number;
  totalFormatted: string;
  currency: string;
};

export type HotelFolioItem = {
  kind: "room" | "extra" | "discount" | "tax";
  totalAmount: number | string;
};

export type HotelFolioPayment = {
  amount: number | string;
};

export type HotelFolioTotals = {
  chargesTotal: number;
  paymentsTotal: number;
  balance: number;
};

export class InvalidHotelStayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidHotelStayError";
  }
}

export class InvalidHotelAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidHotelAmountError";
  }
}

const MAX_NIGHTS = 365;
const MAX_GUESTS = 30;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Converte um valor monetário (número ou numeric do Postgres) em centavos. */
export function toCents(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new InvalidHotelAmountError("Valor monetário inválido.");
  }
  return Math.round(parsed * 100);
}

export function formatCents(cents: number): string {
  if (!Number.isFinite(cents)) throw new InvalidHotelAmountError("Valor monetário inválido.");
  return (cents / 100).toFixed(2);
}

function parseIsoDate(value: string): number {
  if (!ISO_DATE.test(value)) throw new InvalidHotelStayError("Data inválida.");
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) {
    throw new InvalidHotelStayError("Data inválida.");
  }
  return ms;
}

export function hotelStayNights(arrivalDate: string, departureDate: string): number {
  const arrival = parseIsoDate(arrivalDate);
  const departure = parseIsoDate(departureDate);
  const nights = (departure - arrival) / 86_400_000;
  if (!Number.isInteger(nights) || nights < 1) {
    throw new InvalidHotelStayError("A saída deve ser posterior à entrada.");
  }
  if (nights > MAX_NIGHTS) {
    throw new InvalidHotelStayError(`A estadia não pode passar de ${MAX_NIGHTS} noites.`);
  }
  return nights;
}

export function ratePlanMatchesRoomCategory(
  planCategory: string | null | undefined,
  roomCategory: string | null | undefined,
): boolean {
  if (!planCategory) return true;
  return Boolean(roomCategory) && planCategory.toLowerCase() === roomCategory.toLowerCase();
}

/**
 * Aplica a tarifa noite a noite. `adjustments` deve vir na ordem de
 * precedência (prioridade desc, criação desc) — a primeira regra que cobre a
 * data e o dia da semana vence, como já fazia a query da cotação.
 */
export function quoteHotelStay(
  stay: HotelStayInput,
  plan: HotelRatePlan,
  adjustments: HotelRateAdjustment[] = [],
): HotelStayQuote {
  if (!Number.isInteger(stay.guestCount) || stay.guestCount < 1 || stay.guestCount > MAX_GUESTS) {
    throw new InvalidHotelStayError(`A quantidade de hóspedes deve ficar entre 1 e ${MAX_GUESTS}.`);
  }

  const nightsCount = hotelStayNights(stay.arrivalDate, stay.departureDate);
  const arrivalMs = parseIsoDate(stay.arrivalDate);
  const baseCents = toCents(plan.standardAmount);
  const extraGuestCents = toCents(plan.extraGuestAmount ?? 0);
  const extraGuests = Math.max(0, stay.guestCount - 1);

  const nights: HotelNightlyPrice[] = [];
  let totalCents = 0;

  for (let index = 0; index < nightsCount; index += 1) {
    const ms = arrivalMs + index * 86_400_000;
    const date = new Date(ms).toISOString().slice(0, 10);
    const weekday = new Date(ms).getUTCDay();
    const adjustment = adjustments.find((candidate) =>
      candidate.startDate <= date
      && candidate.endDate >= date
      && (candidate.weekday === null || Number(candidate.weekday) === weekday)
    );
    const nightlyBase = adjustment ? toCents(adjustment.amount) : baseCents;
    const nightlyCents = nightlyBase + extraGuests * extraGuestCents;
    totalCents += nightlyCents;
    nights.push({ date, amount: nightlyCents / 100, amountFormatted: formatCents(nightlyCents) });
  }

  return {
    nights,
    nightsCount,
    total: totalCents / 100,
    totalFormatted: formatCents(totalCents),
    currency: "BRL",
  };
}

/** Soma de itens (desconto entra negativo) e pagamentos de uma conta. */
export function computeFolioTotals(
  items: HotelFolioItem[],
  payments: HotelFolioPayment[] = [],
): HotelFolioTotals {
  let chargesCents = 0;
  for (const item of items) {
    const parsed = typeof item.totalAmount === "number"
      ? item.totalAmount
      : Number(String(item.totalAmount).replace(",", "."));
    if (!Number.isFinite(parsed)) throw new InvalidHotelAmountError("Item de conta inválido.");
    chargesCents += Math.round(parsed * 100);
  }

  let paymentsCents = 0;
  for (const payment of payments) {
    const parsed = typeof payment.amount === "number"
      ? payment.amount
      : Number(String(payment.amount).replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) throw new InvalidHotelAmountError("Pagamento inválido.");
    paymentsCents += Math.round(parsed * 100);
  }

  return {
    chargesTotal: chargesCents / 100,
    paymentsTotal: paymentsCents / 100,
    balance: (chargesCents - paymentsCents) / 100,
  };
}

/**
 * Uma conta está quitada quando não sobra saldo (tolerância de meio centavo
 * para arredondamento). Saldo negativo significa crédito/ troco e também
 * permite o check-out.
 */
export function isFolioSettled(balance: number): boolean {
  return Number.isFinite(balance) && balance <= 0.005;
}
