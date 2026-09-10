import { describe, expect, it } from "vitest";
import { DEFAULT_PROFESSIONAL_DATES, mergeProfessionalDates } from "./professional-calendar.js";

describe("professional calendar catalog", () => {
  it("contains the veterinary date on September 9", () => {
    const date = DEFAULT_PROFESSIONAL_DATES.find((item) => item.name === "Dia do Médico Veterinário");

    expect(date).toMatchObject({ month: 9, day: 9, active: false });
    expect(date?.professions).toContain("veterinário");
  });

  it("keeps tenant activation but restores canonical date and profession mapping", () => {
    const merged = mergeProfessionalDates([
      {
        name: "Dia do Médico Veterinário",
        active: true,
        month: 1,
        day: 1,
        professions: ["texto digitado manualmente"],
      },
    ]);
    const date = merged.find((item) => item.name === "Dia do Médico Veterinário");

    expect(date).toMatchObject({ month: 9, day: 9, active: true });
    expect(date?.professions).toContain("médico veterinário");
    expect(date?.professions).not.toContain("texto digitado manualmente");
  });

  it("recognizes old labels as aliases and upgrades them to the canonical entry", () => {
    const merged = mergeProfessionalDates([
      {
        name: "Dia do Arquiteto",
        active: true,
        month: 12,
        day: 11,
        professions: ["arquiteto"],
      },
    ]);
    const date = merged.find((item) => item.name === "Dia do Arquiteto e Urbanista");

    expect(date).toMatchObject({ month: 12, day: 15, active: true });
    expect(merged.some((item) => item.name === "Dia do Arquiteto")).toBe(false);
  });

  it("keeps tenant-specific custom professional dates", () => {
    const custom = {
      name: "Dia do Instalador ICF",
      active: true,
      month: 6,
      day: 10,
      professions: ["instalador icf"],
    };

    const merged = mergeProfessionalDates([custom]);
    expect(merged).toContainEqual(custom);
  });

  it("uses the corrected Brazilian journalist date", () => {
    const date = DEFAULT_PROFESSIONAL_DATES.find((item) => item.name === "Dia do Jornalista");
    expect(date).toMatchObject({ month: 4, day: 7 });
  });
});
