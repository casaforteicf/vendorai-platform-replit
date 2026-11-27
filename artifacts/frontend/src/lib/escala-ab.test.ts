import { describe, expect, it } from "vitest";
import { contar, estadoInicial, fmtHoras, gerarMetas, minutosTrabalho, normalizarEstado, rotuloDia, validar } from "./escala-ab";

describe("AJEscala — cálculo", () => {
  it("cria 35 dias e datas sequenciais", () => {
    const estado = estadoInicial("2026-12-01");
    expect(estado.days).toHaveLength(35);
    expect(rotuloDia(estado, 0)).toBe("01/12");
    expect(rotuloDia(estado, 34)).toBe("04/01");
  });

  it("calcula horas líquidas descontando intervalo", () => {
    const staff = { name: "A", role: "Auxiliar", sector: "Salão", shift: "M", regime: "5x2 integral", start: "08:00", breakStart: "12:00", breakEnd: "13:00", end: "17:24", sunday: 1, schedule: [] };
    expect(minutosTrabalho(staff)).toBe(504);
    expect(fmtHoras(504)).toBe("8h24");
  });

  it("conta efetivos e extras por grupo", () => {
    const estado = estadoInicial("2026-12-01");
    estado.days[0]!.targets = [2, 0, 0, 0, 0, 0, 0, 0];
    estado.staff.push({ name: "A", role: "Cozinheiro", sector: "Cozinha", shift: "M", regime: "5x2 integral", start: "08:00", breakStart: "12:00", breakEnd: "13:00", end: "17:24", sunday: 1, schedule: estado.days.map(() => "F") });
    estado.staff[0]!.schedule[0] = "T";
    const contagem = contar(estado);
    expect(contagem[0]!.ativos[0]).toBe(1);
    expect(contagem[0]!.extras[0]).toBe(1);
  });

  it("gera metas por Pax e valida 5x2", () => {
    const estado = estadoInicial("2026-12-01");
    estado.days[0]!.pax = 150;
    estado.days[0]!.morning = 100;
    gerarMetas(estado);
    expect(estado.days[0]!.targets.some((v) => v > 0)).toBe(true);
    const normalizado = normalizarEstado({ ...estado, staff: [{ name: "A", schedule: estado.days.map(() => "T") }] }, "2026-12-01");
    expect(validar(normalizado).some((item) => item.alertas !== "OK")).toBe(true);
  });
});
