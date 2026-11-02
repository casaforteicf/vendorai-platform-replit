import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// A navegação do módulo depende do Router do wouter; o alvo aqui é a tela.
vi.mock("../HotelModulesNav", () => ({ default: () => null }));

import Briffing from "./Briffing";

function calcularClique() {
  return userEvent.click(screen.getByRole("button", { name: "Calcular Produção" }));
}

describe("Briffing — tela", () => {
  it("mostra o cardápio simulado e pede o cálculo antes de exibir produção", () => {
    render(<Briffing />);

    expect(screen.getByRole("heading", { name: /Briffing/ })).toBeInTheDocument();
    expect(screen.getByText("Arroz branco")).toBeInTheDocument();
    expect(screen.getByText("Bife acebolado")).toBeInTheDocument();
    expect(screen.getByText("Salada da casa")).toBeInTheDocument();
    expect(screen.getByText(/Informe a ocupação e clique/)).toBeInTheDocument();
    expect(screen.queryByText("Quantidade base")).not.toBeInTheDocument();
  });

  it("calcula 150 hóspedes e mostra o consolidado com fator de correção", async () => {
    render(<Briffing />);

    await calcularClique();

    // Arroz: 80 g × 150 × 1 = 12.000 g
    expect(screen.getByText("12.000 g")).toBeInTheDocument();
    expect(screen.getByText("12 kg")).toBeInTheDocument();

    // Bife: 150 g × 150 × 1,2 = 27.000 g
    expect(screen.getByText("27.000 g")).toBeInTheDocument();
    expect(screen.getByText("27 kg")).toBeInTheDocument();

    // Alface: 40 g × 150 × 1,15 = 6.900 g
    expect(screen.getByText("6.900 g")).toBeInTheDocument();

    // Laranja é contada em unidades e não converte para kg
    expect(screen.getByText("450 un")).toBeInTheDocument();
  });

  it("não arredonda meia porção: 150 hóspedes × 0,5 = 75 porções", async () => {
    render(<Briffing />);
    await calcularClique();

    const linhaPudim = screen.getByText("Pudim (meia porção)").closest("tr");
    expect(linhaPudim).not.toBeNull();
    expect(within(linhaPudim as HTMLElement).getByText("75")).toBeInTheDocument();

    // Leite condensado: 60 g × 75 = 4.500 g — mesmo valor da cebola, então a
    // asserção é por linha e não no documento inteiro.
    const linhaLeite = screen.getByText("Leite condensado").closest("tr");
    expect(linhaLeite).not.toBeNull();
    expect(within(linhaLeite as HTMLElement).getByText("4.500 g")).toBeInTheDocument();
  });

  it("avisa quando a ocupação muda depois do cálculo", async () => {
    const usuario = userEvent.setup();
    render(<Briffing />);

    await calcularClique();
    expect(screen.queryByText(/A ocupação mudou/)).not.toBeInTheDocument();

    const campo = screen.getByLabelText(/Ocupação/);
    await usuario.clear(campo);
    await usuario.type(campo, "100");

    const aviso = screen.getByText(/A ocupação mudou/);
    expect(aviso.textContent).toContain("150 hóspedes");

    await calcularClique();
    expect(screen.queryByText(/A ocupação mudou/)).not.toBeInTheDocument();
    // 80 g × 100 = 8.000 g
    expect(screen.getByText("8.000 g")).toBeInTheDocument();
  });

  it("recusa ocupação vazia com mensagem clara", async () => {
    const usuario = userEvent.setup();
    render(<Briffing />);

    await usuario.clear(screen.getByLabelText(/Ocupação/));
    await calcularClique();

    expect(screen.getByRole("alert")).toHaveTextContent("Informe a ocupação em hóspedes.");
    expect(screen.queryByText("Quantidade base")).not.toBeInTheDocument();
  });

  it("limpa o resultado ao clicar em Limpar", async () => {
    render(<Briffing />);

    await calcularClique();
    expect(screen.getByText("12.000 g")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Limpar" }));

    expect(screen.queryByText("12.000 g")).not.toBeInTheDocument();
    expect(screen.getByText(/Informe a ocupação e clique/)).toBeInTheDocument();
  });
});
