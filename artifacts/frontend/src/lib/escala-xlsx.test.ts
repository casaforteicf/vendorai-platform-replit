import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { estadoInicial, metasDoDia } from "./escala-ab";
import { lerPlanilhaEscala } from "./escala-xlsx";

function dias(): string[] {
  return Array.from({ length: 30 }, (_, i) => String(i + 1));
}

function ocupacao(prefixo: "A" | "C", valor: number): string[] {
  return Array.from({ length: 30 }, () => `${prefixo} - ${valor}`);
}

function planilha(): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  const salao: unknown[][] = [];
  salao[0] = ["ESCALA NOVEMBRO SALÃO"];
  salao[1] = [];
  salao[2] = [];
  salao[3] = ["", "DOM", "SEG", "TER"];
  salao[4] = ["ALMOÇO", ...dias()];
  salao[5] = ["", ...ocupacao("A", 100)];
  salao[6] = ["", ...ocupacao("C", 10)];
  salao[7] = ["ANA", "", "", "F"];
  salao[8] = ["JANTAR", ...ocupacao("A", 80)];
  salao[9] = ["", ...ocupacao("C", 5)];
  salao[10] = ["BRUNO", "", "", "", "", "", "F"];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(salao), "SALÃO");

  const cozinha: unknown[][] = [];
  cozinha[0] = ["ESCALA DEZEMBRO COZINHA"];
  cozinha[1] = [];
  cozinha[2] = [];
  cozinha[3] = ["", "TER", "QUA", "QUI"];
  cozinha[4] = ["ALMOÇO", ...dias()];
  cozinha[5] = ["", ...ocupacao("A", 90)];
  cozinha[6] = ["", ...ocupacao("C", 0)];
  cozinha[7] = ["CHICO"];
  cozinha[8] = ["JANTAR", ...ocupacao("A", 70)];
  cozinha[9] = ["", ...ocupacao("C", 0)];
  cozinha[10] = ["DORA"];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cozinha), "COZINHAA");

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("AJEscala — importação XLSX", () => {
  it("lê a aba do mês escolhido e ignora aba de outro mês", async () => {
    const base = estadoInicial("2026-11-01");
    base.rates.weekend = 150;
    const { estado, resumo } = await lerPlanilhaEscala(planilha(), "2026-11-01", base);

    expect(estado.start).toBe("2026-11-01");
    expect(estado.staff).toHaveLength(2);
    expect(estado.staff.map((s) => s.name)).toEqual(["ANA", "BRUNO"]);
    expect(estado.staff[0]!.shift).toBe("M");
    expect(estado.staff[1]!.shift).toBe("N");
    expect(estado.staff[0]!.start).toBe("06:00");
    expect(estado.staff[0]!.end).toBe("15:24");
    expect(estado.staff[0]!.regime).toBe("5x2 integral");
    expect(estado.staff[0]!.schedule[2]).toBe("F");
    expect(estado.staff[0]!.schedule[0]).toBe("T");
    expect(estado.staff[0]!.schedule.slice(30)).toEqual(["F", "F", "F", "F", "F"]);
    expect(estado.staff[1]!.schedule[5]).toBe("F");
    expect(estado.days).toHaveLength(35);
    expect(estado.days[0]!.morning).toBe(110);
    expect(estado.days[0]!.pax).toBe(85);
    expect(estado.days[0]!.targets).toEqual(metasDoDia(110, 85));
    expect(estado.rates.weekend).toBe(150);
    expect(resumo.colaboradores).toBe(2);
    expect(resumo.setores).toEqual({ "Salão": 2 });
    expect(resumo.diasComOcupacao).toBe(30);
    expect(resumo.abasIgnoradas.join(" ")).toContain("COZINHAA");
    expect(resumo.abasIgnoradas.join(" ")).toContain("DEZEMBRO");
  });

  it("no mês de dezembro lê a aba de dezembro e ignora a de novembro", async () => {
    const { estado, resumo } = await lerPlanilhaEscala(planilha(), "2026-12-01", estadoInicial("2026-12-01"));

    expect(estado.staff).toHaveLength(2);
    expect(estado.staff.every((s) => s.sector === "Cozinha")).toBe(true);
    expect(estado.staff[0]!.schedule.slice(0, 30).every((v) => v === "T")).toBe(true);
    expect(resumo.abasIgnoradas.join(" ")).toContain("SALÃO");
    expect(resumo.setores).toEqual({ Cozinha: 2 });
  });

  it("rejeita arquivo sem abas de escala", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["nada"]]), "Planilha1");
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const { resumo } = await lerPlanilhaEscala(buffer, "2026-11-01", estadoInicial("2026-11-01"));
    expect(resumo.colaboradores).toBe(0);
    expect(resumo.abasIgnoradas.length).toBe(1);
  });
});
