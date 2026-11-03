import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// A navegação do módulo depende do Router do wouter; o alvo aqui é a tela.
vi.mock("../HotelModulesNav", () => ({ default: () => null }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { tenantId: "hotel-1" }, token: "token-de-teste" }),
}));

const { FICHAS, listarFichasMock } = vi.hoisted(() => ({
  FICHAS: [
    {
      id: "f1",
      nome: "Arroz branco",
      rendimentoPorcoes: "10",
      observacoes: null,
      ativo: true,
      insumos: [
        {
          id: "i1",
          fichaId: "f1",
          insumoId: null,
          insumoNome: "Arroz",
          unidadeBase: "g" as const,
          quantidadePorPorcao: "80",
          fatorCorrecao: "1",
          ordem: 0,
        },
      ],
    },
    {
      id: "f2",
      nome: "Bife acebolado",
      rendimentoPorcoes: "10",
      observacoes: null,
      ativo: true,
      insumos: [
        {
          id: "i2",
          fichaId: "f2",
          insumoId: null,
          insumoNome: "Bife",
          unidadeBase: "g" as const,
          quantidadePorPorcao: "150",
          fatorCorrecao: "1.2",
          ordem: 0,
        },
      ],
    },
  ],
  listarFichasMock: vi.fn(async () => FICHAS),
}));

vi.mock("@/lib/ab/client", () => ({
  listarFichas: listarFichasMock,
  mensagemDoErro: (erro: unknown) => String(erro),
}));

import Briffing from "./Briffing";

function calcularClique() {
  return userEvent.click(screen.getByRole("button", { name: "Calcular Produção" }));
}

describe("Briffing — tela", () => {
  it("carrega as fichas técnicas da API e lista o cardápio", async () => {
    render(<Briffing />);

    expect(await screen.findByText("Arroz branco")).toBeInTheDocument();
    expect(screen.getByText("Bife acebolado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calcular Produção" })).toBeInTheDocument();
    expect(screen.getByText(/Informe a ocupação e clique/)).toBeInTheDocument();
  });

  it("calcula 150 hóspedes a partir das fichas reais", async () => {
    render(<Briffing />);
    await screen.findByText("Arroz branco");

    await calcularClique();

    // Arroz: 80 g × 150 = 12.000 g; Bife: 150 g × 150 × 1,2 = 27.000 g
    expect(screen.getByText("12.000 g")).toBeInTheDocument();
    expect(screen.getByText("27.000 g")).toBeInTheDocument();
  });

  it("exclui a ficha desmarcada do cálculo", async () => {
    const usuario = userEvent.setup();
    render(<Briffing />);
    await screen.findByText("Arroz branco");

    await usuario.click(screen.getByLabelText("Incluir Bife acebolado no cardápio do dia"));
    await calcularClique();

    expect(screen.getByText("12.000 g")).toBeInTheDocument();
    expect(screen.queryByText("27.000 g")).not.toBeInTheDocument();
  });

  it("mantém o aviso de resultado desatualizado quando a ocupação muda", async () => {
    const usuario = userEvent.setup();
    render(<Briffing />);
    await screen.findByText("Arroz branco");

    await calcularClique();
    const campo = screen.getByLabelText(/Ocupação/);
    await usuario.clear(campo);
    await usuario.type(campo, "100");

    const aviso = screen.getByText(/A ocupação mudou/);
    expect(aviso.textContent).toContain("150 hóspedes");
  });

  it("mostra o estado vazio apontando para o cadastro de fichas", async () => {
    listarFichasMock.mockResolvedValueOnce([]);
    render(<Briffing />);

    expect(await screen.findByText(/Nenhuma ficha técnica cadastrada/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Fichas técnicas" })).toHaveAttribute(
      "href",
      "/hotelaria/ab/fichas-tecnicas",
    );
  });

  it("recusa calcular sem nenhuma ficha selecionada", async () => {
    const usuario = userEvent.setup();
    render(<Briffing />);
    await screen.findByText("Arroz branco");

    await usuario.click(screen.getByLabelText("Incluir Arroz branco no cardápio do dia"));
    await usuario.click(screen.getByLabelText("Incluir Bife acebolado no cardápio do dia"));
    await calcularClique();

    expect(screen.getByRole("alert")).toHaveTextContent(/Selecione pelo menos uma ficha/);
  });

  it("converte a quantidade base para kg na coluna de conversão", async () => {
    render(<Briffing />);
    await screen.findByText("Arroz branco");
    await calcularClique();

    const linhaArroz = screen.getByText("Arroz").closest("tr");
    expect(linhaArroz).not.toBeNull();
    expect(within(linhaArroz as HTMLElement).getByText("12 kg")).toBeInTheDocument();
  });
});
