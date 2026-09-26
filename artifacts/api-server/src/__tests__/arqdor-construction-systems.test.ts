import { describe, expect, it } from "vitest";
import {
  CONSTRUCTION_SYSTEM_PROFILES,
  distanceToModule,
  getConstructionSystemProfile,
} from "../lib/arqdor/construction-systems";

describe("Arqdor construction system profiles", () => {
  it("diferencia sistemas por modulação e limites conceituais", () => {
    expect(CONSTRUCTION_SYSTEM_PROFILES.icf.wallAlignmentImportance).toBe("high");
    expect(CONSTRUCTION_SYSTEM_PROFILES.alvenaria_estrutural.planningModuleM).toBe(0.20);
    expect(CONSTRUCTION_SYSTEM_PROFILES.steel_frame.planningModuleM).toBe(0.40);
    expect(CONSTRUCTION_SYSTEM_PROFILES.pre_fabricado.planningModuleM).toBe(0.50);
    expect(CONSTRUCTION_SYSTEM_PROFILES.concreto.cautionSpanM)
      .toBeGreaterThan(CONSTRUCTION_SYSTEM_PROFILES.alvenaria_estrutural.cautionSpanM);
  });

  it("usa perfil conservador quando o método não está definido", () => {
    const profile = getConstructionSystemProfile("desconhecido");
    expect(profile.id).toBe("nao_definido");
    expect(profile.rules.length).toBeGreaterThan(0);
  });

  it("mede afastamento da malha modular", () => {
    expect(distanceToModule(4.0, 0.4)).toBeCloseTo(0, 5);
    expect(distanceToModule(4.13, 0.4)).toBeGreaterThan(0.1);
    expect(distanceToModule(3.6, 0.2)).toBeCloseTo(0, 5);
  });

  it("mantém referências de balanço mais restritas em sistemas portantes modulares", () => {
    expect(CONSTRUCTION_SYSTEM_PROFILES.alvenaria_estrutural.maxConceptualCantileverM)
      .toBeLessThan(CONSTRUCTION_SYSTEM_PROFILES.concreto.maxConceptualCantileverM);
    expect(CONSTRUCTION_SYSTEM_PROFILES.icf.maxConceptualCantileverM)
      .toBeLessThan(CONSTRUCTION_SYSTEM_PROFILES.concreto.maxConceptualCantileverM);
  });
});
