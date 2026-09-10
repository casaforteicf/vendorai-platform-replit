import { describe, expect, it } from "vitest";
import {
  buildRelevantProfessionalDates,
  canonicalizeProfessionalDates,
} from "./professional-calendar-selection.js";

describe("professional calendar selection", () => {
  it("suggests only dates related to professions found on lead cards", () => {
    const dates = buildRelevantProfessionalDates([], ["Médico Veterinário"]);

    expect(dates.some((item) => item.name === "Dia do Médico Veterinário")).toBe(true);
    expect(dates.some((item) => item.name === "Dia do Bibliotecário")).toBe(false);
  });

  it("suggests new catalog dates as inactive", () => {
    const [date] = buildRelevantProfessionalDates([], ["Psicóloga"])
      .filter((item) => item.name === "Dia do Psicólogo");

    expect(date).toMatchObject({ active: false, month: 8, day: 27 });
  });

  it("canonicalizes an existing date without injecting the whole catalog", () => {
    const dates = canonicalizeProfessionalDates([
      {
        name: "Dia do Arquiteto",
        active: true,
        month: 12,
        day: 11,
        professions: ["arquiteto"],
      },
    ]);

    expect(dates).toHaveLength(1);
    expect(dates[0]).toMatchObject({
      name: "Dia do Arquiteto e Urbanista",
      active: true,
      month: 12,
      day: 15,
    });
  });

  it("keeps custom dates while adding a relevant catalog suggestion", () => {
    const dates = buildRelevantProfessionalDates([
      {
        name: "Dia do Instalador ICF",
        active: true,
        month: 6,
        day: 10,
        professions: ["instalador icf"],
      },
    ], ["Médico Veterinário"]);

    expect(dates.some((item) => item.name === "Dia do Instalador ICF" && item.active)).toBe(true);
    expect(dates.some((item) => item.name === "Dia do Médico Veterinário")).toBe(true);
  });
});
