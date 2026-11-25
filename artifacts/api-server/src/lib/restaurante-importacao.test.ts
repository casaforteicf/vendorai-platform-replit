import { describe, expect, it } from "vitest";
import {
  normalizarData,
  numero,
  parseBriffingDelimitado,
  parseBriffingTexto,
  parseCardapiosDelimitado,
  parseCardapiosTexto,
  parseDelimited,
  parseIngredientesDelimitado,
  parseReceitasDelimitado,
  parseReceitasTexto,
} from "../routes/restaurante_importacao.js";

describe("Restaurante — parsers de importação", () => {
  it("converte número pt-BR e ponto decimal sem confundir milhar", () => {
    expect(numero("2,5")).toBe(2.5);
    expect(numero("1.5")).toBe(1.5);
    expect(numero("1.234,56")).toBe(1234.56);
    expect(numero("")).toBeNull();
  });

  it("normaliza data ISO e dd/mm/aaaa", () => {
    expect(normalizarData("2026-11-25")).toBe("2026-11-25");
    expect(normalizarData("25/11/2026")).toBe("2026-11-25");
    expect(normalizarData("25-11-2026")).toBe("2026-11-25");
  });

  it("lê receitas em CSV com decimal vírgula e agrupa por receita", () => {
    const { rows } = parseDelimited(
      "receita;rendimento;ingrediente;quantidade;unidade;fator_correcao\n" +
      "Arroz branco;10;Arroz;100;g;1\n" +
      "Arroz branco;10;Sal;2,5;g;1\n",
    );
    const avisos: string[] = [];
    const receitas = parseReceitasDelimitado(rows, avisos);
    expect(receitas).toHaveLength(1);
    expect(receitas[0]!.nome).toBe("Arroz branco");
    expect(receitas[0]!.rendimentoPorcoes).toBe(10);
    expect(receitas[0]!.insumos).toEqual([
      { nome: "Arroz", unidade: "g", quantidadePorPorcao: 100, fatorCorrecao: 1 },
      { nome: "Sal", unidade: "g", quantidadePorPorcao: 2.5, fatorCorrecao: 1 },
    ]);
    expect(avisos).toHaveLength(0);
  });

  it("lê cardápios em CSV e normaliza a data brasileira", () => {
    const { rows } = parseDelimited(
      "cardapio;data;servico;receita;porcoes_por_pax\n" +
      "Almoço;25/11/2026;almoco;Arroz branco;0,5\n",
    );
    const cardapios = parseCardapiosDelimitado(rows);
    expect(cardapios).toHaveLength(1);
    expect(cardapios[0]).toMatchObject({ nome: "Almoço", data: "2026-11-25", servico: "almoco" });
    expect(cardapios[0]!.itens[0]).toEqual({ receitaNome: "Arroz branco", porcoesPorPax: 0.5 });
  });

  it("lê ingredientes em CSV e converte kg/l para a unidade base", () => {
    const { rows } = parseDelimited("nome;unidade;preco;categoria\nArroz;g;0,005;grãos\nLeite;l;4,50;bebidas\n");
    const avisos: string[] = [];
    const itens = parseIngredientesDelimitado(rows, avisos);
    expect(itens).toHaveLength(2);
    expect(itens[0]).toMatchObject({ nome: "Arroz", unidade: "g", precoUnitario: "0.0050", categoria: "grãos" });
    expect(itens[1]).toMatchObject({ nome: "Leite", unidade: "ml", precoUnitario: "0.0045", categoria: "bebidas" });
    expect(avisos).toHaveLength(0);
  });

  it("lê receita em texto com cabeçalho e ingredientes", () => {
    const avisos: string[] = [];
    const receitas = parseReceitasTexto(
      "Receita: Arroz branco | Rendimento: 10\n- Arroz: 100 g\n- Sal: 2,5 g\n",
      "receitas.txt",
      avisos,
    );
    expect(receitas).toHaveLength(1);
    expect(receitas[0]!.nome).toBe("Arroz branco");
    expect(receitas[0]!.rendimentoPorcoes).toBe(10);
    expect(receitas[0]!.insumos).toHaveLength(2);
  });

  it("lê receita de PDF com quantidade antes do ingrediente e ignora o modo de preparo", () => {
    const avisos: string[] = [];
    const receitas = parseReceitasTexto(
      "01 Costelinhas ao Barbecue Caseiro\n" +
      "Porções: 6\n" +
      "Ingredientes:\n" +
      "3 kg de costelinhas de porco\n" +
      "300 g de ketchup\n" +
      "100 ml de coca-cola\n" +
      "1,5 kg de batata\n" +
      "1/2 kg de cebola\n" +
      "Modo de preparo:\n" +
      "Tempere as costelinhas e leve à geladeira por 2 horas.\n" +
      "Asse por 30 minutos, pincele o molho e sirva.\n",
      "01_Costelinhas.pdf",
      avisos,
    );
    expect(receitas).toHaveLength(1);
    expect(receitas[0]!.nome).toBe("Costelinhas ao Barbecue Caseiro");
    expect(receitas[0]!.rendimentoPorcoes).toBe(6);
    expect(receitas[0]!.insumos).toEqual([
      { nome: "costelinhas de porco", unidade: "g", quantidadePorPorcao: 3000, fatorCorrecao: 1 },
      { nome: "ketchup", unidade: "g", quantidadePorPorcao: 300, fatorCorrecao: 1 },
      { nome: "coca-cola", unidade: "ml", quantidadePorPorcao: 100, fatorCorrecao: 1 },
      { nome: "batata", unidade: "g", quantidadePorPorcao: 1500, fatorCorrecao: 1 },
      { nome: "cebola", unidade: "g", quantidadePorPorcao: 500, fatorCorrecao: 1 },
    ]);
    expect(avisos).toHaveLength(0);
  });

  it("normaliza peça de aprox. usando o nome da receita", () => {
    const avisos: string[] = [];
    const receitas = parseReceitasTexto(
      "Receita: Lagarto Recheado\nIngredientes:\n1 peça de aprox. 2 kg\n100 g de bacon\n",
      "lagarto.pdf",
      avisos,
    );
    expect(receitas[0]!.insumos[0]).toEqual({ nome: "Lagarto", unidade: "g", quantidadePorPorcao: 2000, fatorCorrecao: 1 });
    expect(avisos).toHaveLength(0);
  });

  it("converte medidas caseiras e aceita a gosto", () => {
    const avisos: string[] = [];
    const receitas = parseReceitasTexto(
      "Receita: Bolo simples\nIngredientes:\n2 xícaras de açúcar\n3 colheres de sopa de óleo\n1 pitada de sal\nSal a gosto\n",
      "bolo.txt",
      avisos,
    );
    expect(receitas[0]!.insumos).toEqual([
      { nome: "açúcar", unidade: "ml", quantidadePorPorcao: 480, fatorCorrecao: 1 },
      { nome: "óleo", unidade: "ml", quantidadePorPorcao: 45, fatorCorrecao: 1 },
      { nome: "sal", unidade: "g", quantidadePorPorcao: 2, fatorCorrecao: 1 },
    ]);
    expect(avisos).toHaveLength(0);
  });

  it("lê receita com nome antes da quantidade e remove preparo entre parênteses", () => {
    const avisos: string[] = [];
    const receitas = parseReceitasTexto(
      "Receita: Molho especial\nIngredientes\nMaionese - 200 g\nMostarda: 50 g\nAlho (picado), 10 g\n",
      "molho.txt",
      avisos,
    );
    expect(receitas[0]!.insumos).toEqual([
      { nome: "Maionese", unidade: "g", quantidadePorPorcao: 200, fatorCorrecao: 1 },
      { nome: "Mostarda", unidade: "g", quantidadePorPorcao: 50, fatorCorrecao: 1 },
      { nome: "Alho", unidade: "g", quantidadePorPorcao: 10, fatorCorrecao: 1 },
    ]);
    expect(avisos).toHaveLength(0);
  });

  it("lê briffing em CSV com data brasileira e serviço", () => {
    const { rows } = parseDelimited("data;servico;ocupacao;evento;observacoes\n25/11/2026;almoço;150;Almoço executivo;Grupo\n");
    const avisos: string[] = [];
    const itens = parseBriffingDelimitado(rows, avisos);
    expect(itens).toEqual([{ data: "2026-11-25", servico: "almoco", ocupacao: 150, evento: "Almoço executivo", observacoes: "Grupo" }]);
    expect(avisos).toHaveLength(0);
  });

  it("lê briffing em texto de uma linha com data, serviço e ocupação", () => {
    const avisos: string[] = [];
    const itens = parseBriffingTexto(
      "Data: 25/11/2026 | Serviço: jantar | Ocupação: 80 | Evento: Confraternização\n",
      avisos,
    );
    expect(itens).toEqual([{ data: "2026-11-25", servico: "jantar", ocupacao: 80, evento: "Confraternização", observacoes: null }]);
    expect(avisos).toHaveLength(0);
  });

  it("lê briffing em bloco de linhas separadas", () => {
    const avisos: string[] = [];
    const itens = parseBriffingTexto(
      "Data: 26/11/2026\nServiço: almoço\nOcupação: 120\nEvento: Grupo\n",
      avisos,
    );
    expect(itens).toEqual([{ data: "2026-11-26", servico: "almoco", ocupacao: 120, evento: "Grupo", observacoes: null }]);
    expect(avisos).toHaveLength(0);
  });

  it("lê cardápio em texto com item no formato receita: porções", () => {
    const avisos: string[] = [];
    const cardapios = parseCardapiosTexto(
      "Cardápio: Almoço | Data: 25/11/2026 | Serviço: almoco\n- Arroz branco: 0,5 porção/pax\n",
      avisos,
    );
    expect(cardapios).toHaveLength(1);
    expect(cardapios[0]).toMatchObject({ nome: "Almoço", data: "2026-11-25", servico: "almoco" });
    expect(cardapios[0]!.itens[0]).toEqual({ receitaNome: "Arroz branco", porcoesPorPax: 0.5 });
  });
});
