import { describe, expect, it } from "vitest";
import { csvDecimal, parseConstructionCsv } from "./construction-csv";

describe("construction CSV import", () => {
  it("normalizes BOM, accents and common header aliases", () => {
    const rows = parseConstructionCsv(
      "\uFEFFcód;Nome;Preço Unitário R$;Unidade\nMAT-001;Cimento CP II;35,90;sc",
    );

    expect(rows).toEqual([
      {
        codigo: "MAT-001",
        nome: "Cimento CP II",
        preco_unitario: "35,90",
        unidade: "sc",
      },
    ]);
  });

  it("supports comma and tab delimited files", () => {
    expect(parseConstructionCsv("codigo,nome,unidade\nA1,Areia,m³")[0]).toMatchObject({
      codigo: "A1",
      nome: "Areia",
      unidade: "m³",
    });

    expect(parseConstructionCsv("codigo\tnome\tunidade\nB1\tBrita\tm³")[0]).toMatchObject({
      codigo: "B1",
      nome: "Brita",
      unidade: "m³",
    });
  });

  it("keeps delimiters and escaped quotes inside quoted fields", () => {
    const rows = parseConstructionCsv(
      'codigo;nome;descricao;unidade\nA1;"Argamassa; interna";"Uso ""premium""";kg',
    );

    expect(rows[0]).toMatchObject({
      codigo: "A1",
      nome: "Argamassa; interna",
      descricao: 'Uso "premium"',
      unidade: "kg",
    });
  });

  it("maps composition and input aliases used by spreadsheet templates", () => {
    const rows = parseConstructionCsv(
      "codigo_composicao;nome_composicao;codigo_insumo;nome_insumo;qtd\nC1;Parede;I1;Bloco;12,5",
    );

    expect(rows[0]).toMatchObject({
      composicao_codigo: "C1",
      composicao_nome: "Parede",
      insumo_codigo: "I1",
      insumo_nome: "Bloco",
      quantidade: "12,5",
    });
  });
});

describe("construction CSV decimals", () => {
  it("converts Brazilian decimal and thousands separators", () => {
    expect(csvDecimal("1.234,56")).toBe("1234.56");
    expect(csvDecimal("12,5")).toBe("12.5");
  });

  it("accepts dot decimals and rejects invalid numeric values", () => {
    expect(csvDecimal("12.50")).toBe("12.50");
    expect(csvDecimal("R$ 12,50")).toBe("");
    expect(csvDecimal("")).toBe("");
  });
});
