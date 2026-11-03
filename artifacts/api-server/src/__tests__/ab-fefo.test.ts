import { describe, expect, it } from "vitest";
import {
  avaliarSanidade,
  classificarFefo,
  diasAteValidade,
  exigeTemperatura,
  TEMPERATURA_MAXIMA_CARNE_C,
} from "../lib/ab/fefo.js";

/**
 * FEFO + sanidade do recebimento (AB-06).
 *
 * As fronteiras (7 e 30 dias; -12 °C) são testadas nos dois lados: é onde a
 * regra erra sem ninguém perceber — carne a -11,9 °C aprovada, ou lote a 30
 * dias pintado de vermelho sem necessidade.
 */
describe("diasAteValidade", () => {
  it("conta dias inteiros entre hoje e a validade", () => {
    expect(diasAteValidade("2026-11-10", "2026-11-03")).toBe(7);
    expect(diasAteValidade("2026-12-03", "2026-11-03")).toBe(30);
    expect(diasAteValidade("2026-11-03", "2026-11-03")).toBe(0);
  });

  it("devolve negativo para validade vencida", () => {
    expect(diasAteValidade("2026-11-01", "2026-11-03")).toBe(-2);
  });
});

describe("classificarFefo", () => {
  it("marca vermelho abaixo de 7 dias (inclui vencido)", () => {
    expect(classificarFefo("2026-11-03", "2026-11-03")).toBe("vermelho"); // 0
    expect(classificarFefo("2026-11-09", "2026-11-03")).toBe("vermelho"); // 6
    expect(classificarFefo("2026-10-30", "2026-11-03")).toBe("vermelho"); // vencido
  });

  it("marca amarelo de 7 a 30 dias (fronteiras inclusas)", () => {
    expect(classificarFefo("2026-11-10", "2026-11-03")).toBe("amarelo"); // 7
    expect(classificarFefo("2026-11-20", "2026-11-03")).toBe("amarelo"); // 17
    expect(classificarFefo("2026-12-03", "2026-11-03")).toBe("amarelo"); // 30
  });

  it("marca verde acima de 30 dias", () => {
    expect(classificarFefo("2026-12-04", "2026-11-03")).toBe("verde"); // 31
    expect(classificarFefo("2027-11-03", "2026-11-03")).toBe("verde");
  });

  it("recusa data inválida em vez de devolver etiqueta aleatória", () => {
    expect(() => classificarFefo("03/11/2026", "2026-11-03")).toThrow(/Data inválida/);
  });
});

describe("exigeTemperatura", () => {
  it("reconhece variações de nome de categoria de carne", () => {
    expect(exigeTemperatura("Carnes")).toBe(true);
    expect(exigeTemperatura("CARNES BOVINAS")).toBe(true);
    expect(exigeTemperatura("Carne suína")).toBe(true);
    expect(exigeTemperatura("Açougue")).toBe(false);
  });

  it("não exige para categoria vazia ou de outro tipo", () => {
    expect(exigeTemperatura(null)).toBe(false);
    expect(exigeTemperatura("Bebidas")).toBe(false);
  });
});

describe("avaliarSanidade", () => {
  it("aprova carne dentro do limite", () => {
    const r = avaliarSanidade({ categoriaNome: "Carnes", temperaturaC: -18 });
    expect(r.status).toBe("aprovado");
    expect(r.motivoBloqueio).toBeNull();
    expect(r.temperaturaInadequada).toBe(false);
  });

  it("aprova exatamente no limite (-12,0 °C)", () => {
    expect(avaliarSanidade({ categoriaNome: "Carnes", temperaturaC: TEMPERATURA_MAXIMA_CARNE_C }).status).toBe(
      "aprovado",
    );
  });

  it("bloqueia carne acima do limite, com o motivo", () => {
    const r = avaliarSanidade({ categoriaNome: "Carnes", temperaturaC: -11.9 });
    expect(r.status).toBe("bloqueado");
    expect(r.temperaturaInadequada).toBe(true);
    expect(r.motivoBloqueio).toContain("-11.9 °C");
    expect(r.motivoBloqueio).toContain("carnes");
  });

  it("bloqueia temperatura inadequada mesmo fora de categoria de carne", () => {
    // Um queijo a 8 °C também é risco; ignorar seria pior que bloquear.
    const r = avaliarSanidade({ categoriaNome: "Laticínios", temperaturaC: 8 });
    expect(r.status).toBe("bloqueado");
    expect(r.temperaturaInadequada).toBe(true);
  });

  it("carne sem temperatura informada não é aprovada por omissão", () => {
    const r = avaliarSanidade({ categoriaNome: "Carnes", temperaturaC: null });
    expect(r.temperaturaObrigatoria).toBe(true);
    expect(r.status).toBe("bloqueado");
    expect(r.motivoBloqueio).toBe("Temperatura não informada");
  });

  it("categoria sem exigência e sem temperatura é aprovada", () => {
    const r = avaliarSanidade({ categoriaNome: "Mercearia", temperaturaC: null });
    expect(r.status).toBe("aprovado");
    expect(r.temperaturaObrigatoria).toBe(false);
  });
});
