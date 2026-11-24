import { describe, expect, it } from "vitest";
import {
  InvalidHotelStayError,
  computeFolioTotals,
  formatCents,
  hotelStayNights,
  isFolioSettled,
  quoteHotelStay,
  ratePlanMatchesRoomCategory,
  toCents,
} from "./hotel-rate-engine.js";

const plan = { standardAmount: "200.00", extraGuestAmount: "50.00" };

describe("hotel-rate-engine — cotação da estadia", () => {
  it("cobra a diária base e o adicional por hóspede em todas as noites", () => {
    const quote = quoteHotelStay(
      { arrivalDate: "2026-11-02", departureDate: "2026-11-05", guestCount: 2 },
      plan,
    );

    expect(hotelStayNights("2026-11-02", "2026-11-05")).toBe(3);
    expect(quote.nightsCount).toBe(3);
    expect(quote.nights.map((night) => night.amountFormatted)).toEqual(["250.00", "250.00", "250.00"]);
    expect(quote.totalFormatted).toBe("750.00");
  });

  it("aplica preço especial por dia da semana somente na noite correspondente", () => {
    const quote = quoteHotelStay(
      { arrivalDate: "2026-11-07", departureDate: "2026-11-09", guestCount: 1 },
      plan,
      [{ startDate: "2026-11-01", endDate: "2026-11-30", weekday: 6, amount: "300.00", priority: 5 }],
    );

    // 07/11 é sábado (300); 08/11 é domingo e volta para a base (200).
    expect(quote.nights.map((night) => `${night.date}:${night.amountFormatted}`)).toEqual([
      "2026-11-07:300.00",
      "2026-11-08:200.00",
    ]);
    expect(quote.totalFormatted).toBe("500.00");
  });

  it("respeita a precedência da primeira regra que cobre a data", () => {
    const quote = quoteHotelStay(
      { arrivalDate: "2026-11-06", departureDate: "2026-11-08", guestCount: 1 },
      plan,
      [
        { startDate: "2026-11-06", endDate: "2026-11-09", weekday: null, amount: "350.00", priority: 10 },
        { startDate: "2026-11-01", endDate: "2026-11-30", weekday: null, amount: "250.00", priority: 0 },
      ],
    );

    expect(quote.nights.map((night) => night.amountFormatted)).toEqual(["350.00", "350.00"]);
    expect(quote.totalFormatted).toBe("700.00");
  });

  it("rejeita estadia, datas e quantidade de hóspedes inválidas", () => {
    expect(() => hotelStayNights("2026-11-05", "2026-11-05")).toThrow(InvalidHotelStayError);
    expect(() => hotelStayNights("2026-11-05", "2026-11-01")).toThrow(InvalidHotelStayError);
    expect(() => hotelStayNights("2026-02-30", "2026-03-02")).toThrow(InvalidHotelStayError);
    expect(() => hotelStayNights("2026-11-01", "2027-11-02")).toThrow(InvalidHotelStayError);
    expect(() => quoteHotelStay({ arrivalDate: "2026-11-02", departureDate: "2026-11-04", guestCount: 0 }, plan))
      .toThrow(InvalidHotelStayError);
    expect(() => quoteHotelStay({ arrivalDate: "2026-11-02", departureDate: "2026-11-04", guestCount: 31 }, plan))
      .toThrow(InvalidHotelStayError);
  });

  it("mantém precisão de centavos com numeric do Postgres", () => {
    expect(toCents("200.10")).toBe(20010);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(formatCents(20010)).toBe("200.10");
  });

  it("só aceita plano de categoria compatível com o apartamento", () => {
    expect(ratePlanMatchesRoomCategory(null, "standard")).toBe(true);
    expect(ratePlanMatchesRoomCategory(undefined, null)).toBe(true);
    expect(ratePlanMatchesRoomCategory("standard", "standard")).toBe(true);
    expect(ratePlanMatchesRoomCategory("Standard", "standard")).toBe(true);
    expect(ratePlanMatchesRoomCategory("luxo", "standard")).toBe(false);
    expect(ratePlanMatchesRoomCategory("luxo", null)).toBe(false);
  });
});

describe("hotel-rate-engine — totais da conta", () => {
  it("soma diárias, extras, impostos e desconto, e abate pagamentos", () => {
    const totals = computeFolioTotals(
      [
        { kind: "room", totalAmount: "750.00" },
        { kind: "extra", totalAmount: "40.00" },
        { kind: "discount", totalAmount: "-100.00" },
        { kind: "tax", totalAmount: "20.00" },
      ],
      [{ amount: "500.00" }, { amount: "210.00" }],
    );

    expect(totals).toEqual({ chargesTotal: 710, paymentsTotal: 710, balance: 0 });
    expect(isFolioSettled(totals.balance)).toBe(true);
  });

  it("considera quitada uma conta com crédito/troco e bloqueia saldo devedor", () => {
    const open = computeFolioTotals([{ kind: "room", totalAmount: "100.00" }], [{ amount: "99.99" }]);
    expect(open.balance).toBeCloseTo(0.01, 2);
    expect(isFolioSettled(open.balance)).toBe(false);

    const credit = computeFolioTotals([{ kind: "room", totalAmount: "100.00" }], [{ amount: "120.00" }]);
    expect(credit.balance).toBe(-20);
    expect(isFolioSettled(credit.balance)).toBe(true);
  });
});
