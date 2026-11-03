import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../HotelModulesNav", () => ({ default: () => null }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { tenantId: "hotel-1" }, token: "token-de-teste" }),
}));

const { buscarCmvMock } = vi.hoisted(() => ({ buscarCmvMock: vi.fn() }));

vi.mock("@/lib/ab/client", () => ({
  buscarCmv: buscarCmvMock,
  mensagemDoErro: (erro: unknown) => (erro instanceof Error ? erro.message : String(erro)),
}));

import DashboardCMV from "./DashboardCMV";

const DASHBOARD = {
  mes: "2026-11",
  competencia: { inicio: "2026-11-01", fim: "2026-12-01" },
  compras: {
    valor: 15400.5,
    recebimentos: 12,
    semCusto: 2,
    estimado: true,
    observacao: "ab_recebimentos não grava valor",
  },
  producao: { valor: null, motivo: "Briffing não é persistido" },
  desperdicio: {
    valor: 890.25,
    kg: 12.4,
    semCusto: 1,
    porDia: [
      { data: "2026-10-28", kg: 1, valor: 50 },
      { data: "2026-10-29", kg: 2, valor: 100 },
      { data: "2026-10-30", kg: 3, valor: 150 },
      { data: "2026-10-31", kg: 0, valor: 0 },
      { data: "2026-11-01", kg: 4, valor: 200 },
      { data: "2026-11-02", kg: 2.4, valor: 390.25 },
      { data: "2026-11-03", kg: 0, valor: 0 },
    ],
  },
  estoque: { valor: 5200, insumosSemPreco: 3 },
  receita: { valor: 120000, mock: true, observacao: "PMS" },
  cmv: { valor: 8.5, percentual: 8.5, formula: "(compras - estoque final) / receita" },
};

const SEM_RECEITA = {
  ...DASHBOARD,
  receita: { valor: 0, mock: true, observacao: "PMS" },
  cmv: { valor: null, percentual: null, formula: "(compras - estoque final) / receita" },
};

describe("DashboardCMV — tela", () => {
  beforeEach(() => {
    buscarCmvMock.mockReset().mockResolvedValue(DASHBOARD);
  });

  it("mostra os cards de compras, desperdício, estoque e CMV", async () => {
    render(<DashboardCMV />);

    expect(await screen.findByText("Custo de compras")).toBeInTheDocument();
    expect(screen.getByText("Desperdício (7 dias)")).toBeInTheDocument();
    expect(screen.getByText("Estoque final")).toBeInTheDocument();
    expect(screen.getByText("8,5%")).toBeInTheDocument();
  });

  it("renderiza a série de 7 dias do desperdício", async () => {
    render(<DashboardCMV />);
    await screen.findByText("Custo de compras");

    expect(screen.getByText("Desperdício na semana")).toBeInTheDocument();
    // 7 barras com aria-label de data
    const barras = screen.getAllByLabelText(/^2026-\d{2}-\d{2}:/);
    expect(barras).toHaveLength(7);
  });

  it("mostra '—' no CMV quando a receita não foi informada", async () => {
    buscarCmvMock.mockResolvedValueOnce(SEM_RECEITA);
    render(<DashboardCMV />);

    expect(await screen.findByText("Informe a receita para calcular")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("admite que o custo de produção não é calculável", async () => {
    render(<DashboardCMV />);

    expect(await screen.findByText("Não calculável com o dado atual")).toBeInTheDocument();
    expect(screen.getByText(/Briffing não é persistido/)).toBeInTheDocument();
  });

  it("sinaliza recebimentos sem custo em vez de esconder", async () => {
    render(<DashboardCMV />);
    await screen.findByText("Custo de compras");

    expect(screen.getByText(/2 sem custo/)).toBeInTheDocument();
  });
});
