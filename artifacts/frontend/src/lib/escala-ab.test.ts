import { describe, expect, it } from "vitest";
import { contar, diasNoMes, estadoInicial, fmtHoras, gerarMetas, minutosTrabalho, normalizarEstado, rotuloDia, trocarPeriodo, validar } from "./escala-ab";

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

  it("calcula os dias do mês do período", () => {
    expect(diasNoMes("2026-11-01")).toBe(30);
    expect(diasNoMes("2026-12-01")).toBe(31);
    expect(diasNoMes("2026-02-01")).toBe(28);
    expect(diasNoMes("2028-02-01")).toBe(29);
  });

  it("valida só semanas completas no mês", () => {
    const base = estadoInicial("2026-11-01");
    const schedule = Array.from({ length: 30 }, (_, d) => {
      const dia = new Date(2026, 10, d + 1, 12).getDay();
      return dia === 0 || dia === 6 ? "F" : "T";
    });
    const estado = {
      ...base,
      days: base.days.slice(0, 30),
      staff: [{ name: "A", role: "Auxiliar", sector: "Salão", shift: "M", regime: "5x2 integral", start: "08:00", breakStart: "12:00", breakEnd: "13:00", end: "17:24", sunday: 1, schedule }],
    };
    expect(validar(estado)).toEqual([{ nome: "A", alertas: "OK" }]);
  });

  it("troca o período mantendo equipe/horários e zerando ocupação", () => {
    const estado = estadoInicial("2026-11-01");
    estado.days[0]!.pax = 200;
    estado.days[0]!.morning = 180;
    estado.days[0]!.targets = [5, 5, 5, 5, 5, 5, 5, 5];
    estado.rates.weekend = 150;
    estado.holidays["2026-11-15"] = true;
    estado.criticalPairs = [["A", "B"]];
    estado.extraPeople.push({ name: "X", phone: "", role: "", group: 2, days: [1, 2], notes: "" });
    estado.staff.push({ name: "A", role: "Auxiliar", sector: "Salão", shift: "M", regime: "5x2 integral", start: "06:00", breakStart: "10:00", breakEnd: "11:00", end: "15:24", sunday: 1, schedule: estado.days.map((_, d) => (d < 5 ? "T" : "F")) });

    const novo = trocarPeriodo(estado, "2026-12-01");

    expect(novo.start).toBe("2026-12-01");
    expect(novo.days).toHaveLength(35);
    expect(rotuloDia(novo, 0)).toBe("01/12");
    expect(novo.days[0]!.pax).toBe(0);
    expect(novo.days[0]!.morning).toBe(0);
    expect(novo.days[0]!.targets.every((v) => v === 0)).toBe(true);
    expect(novo.holidays).toEqual({});
    expect(novo.staff).toHaveLength(1);
    expect(novo.staff[0]!.start).toBe("06:00");
    expect(novo.staff[0]!.schedule).toEqual(estado.staff[0]!.schedule);
    expect(novo.staff[0]!.schedule).not.toBe(estado.staff[0]!.schedule);
    expect(novo.rates.weekend).toBe(150);
    expect(novo.criticalPairs).toEqual([["A", "B"]]);
    expect(novo.extraPeople[0]!.days).toEqual([1, 2]);
    expect(estado.start).toBe("2026-11-01");
    expect(estado.days[0]!.pax).toBe(200);
  });
});
