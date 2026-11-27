import { describe, expect, it } from "vitest";
import { estadoInicial, type EscalaStaff, type EscalaState } from "./escala-ab";
import { htmlEscala, htmlFolgas } from "./escala-print";

function pessoa(over: Partial<EscalaStaff> & { name: string; sector: string }): EscalaStaff {
  return {
    role: "Auxiliar",
    shift: "M",
    regime: "5x2 integral",
    start: "06:00",
    breakStart: "10:00",
    breakEnd: "11:00",
    end: "15:24",
    sunday: 1,
    schedule: [],
    ...over,
  };
}

function base(): EscalaState {
  const estado = estadoInicial("2026-11-01");
  estado.staff = [
    pessoa({ name: "ANA <script>", sector: "Salão", schedule: estado.days.map((_, d) => (d % 7 === 2 ? "F" : "T")) }),
    pessoa({ name: "BRUNO", sector: "Quiosque", shift: "M", schedule: estado.days.map(() => "T") }),
  ];
  return estado;
}

describe("AJEscala — impressão", () => {
  it("gera a escala do mês com nomes, dias e folgas", () => {
    const html = htmlEscala(base(), "Salão");
    expect(html).toContain("Escala A&amp;B");
    expect(html).toContain("novembro de 2026");
    expect(html).toContain("ANA &lt;script&gt;");
    expect(html).toContain("Salão");
    expect(html).toContain("03<small>");
    expect(html).toContain(">F</td>");
    expect(html).not.toContain("BRUNO");
    expect(html).not.toContain("Quiosque");
  });

  it("imprime todos os setores quando o filtro é Todos", () => {
    const html = htmlEscala(base(), "Todos");
    expect(html).toContain("ANA &lt;script&gt;");
    expect(html).toContain("BRUNO");
    expect((html.match(/class="setor"/g) ?? []).length).toBe(2);
  });

  it("gera o mapa de folgas com datas e total do setor", () => {
    const html = htmlFolgas(base(), "Salão");
    expect(html).toContain("Folgas — novembro de 2026");
    expect(html).toContain("ANA &lt;script&gt;");
    expect(html).toContain("03/11 TER");
    expect(html).toContain("24/11 TER");
    expect(html).toContain("Total do setor");
    expect(html).toContain(">4</td>");
    expect(html).not.toContain("BRUNO");
  });

  it("não vaza HTML dos nomes", () => {
    const html = htmlEscala(base(), "Salão");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
