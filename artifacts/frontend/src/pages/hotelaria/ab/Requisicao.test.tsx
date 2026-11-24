import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../HotelModulesNav", () => ({ default: () => null }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { tenantId: "hotel-1" }, token: "token-de-teste" }),
}));

const { INSUMOS, listarInsumosMock, listarRequisicoesMock, criarRequisicaoMock, entregarRequisicaoMock } =
  vi.hoisted(() => ({
    INSUMOS: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", nome: "Arroz", unidade: "g", codigo: null }],
    listarInsumosMock: vi.fn(),
    listarRequisicoesMock: vi.fn(),
    criarRequisicaoMock: vi.fn(),
    entregarRequisicaoMock: vi.fn(),
  }));

vi.mock("@/lib/ab/client", () => ({
  listarInsumos: listarInsumosMock,
  listarRequisicoes: listarRequisicoesMock,
  criarRequisicao: criarRequisicaoMock,
  entregarRequisicao: entregarRequisicaoMock,
  mensagemDoErro: (erro: unknown) => (erro instanceof Error ? erro.message : String(erro)),
}));

import Requisicao from "./Requisicao";

const PENDENTE = {
  id: "11111111-1111-4111-8111-111111111111",
  setor: "cozinha",
  insumoId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  quantidadeBase: "500.0000",
  unidadeBase: "g",
  status: "pendente" as const,
  dataSolicitacao: "2026-11-03",
  baixaAplicadaEm: null,
  createdAt: "2026-11-03T10:00:00.000Z",
  insumoNome: "Arroz",
};

describe("Requisicao — tela", () => {
  beforeEach(() => {
    listarInsumosMock.mockReset().mockResolvedValue(INSUMOS);
    listarRequisicoesMock.mockReset().mockResolvedValue({
      requisicoes: [PENDENTE],
      resumo: { total: 1, pendentes: 1 },
    });
    criarRequisicaoMock.mockReset().mockResolvedValue(PENDENTE);
    entregarRequisicaoMock.mockReset().mockResolvedValue({
      status: "entregue",
      baixa: { quantidadeEstoque: 0.5, unidadeEstoque: "kg" },
    });
  });

  it("lista as requisições e mostra o pedido pendente", async () => {
    render(<Requisicao />);

    expect(await screen.findByText("Arroz")).toBeInTheDocument();
    expect(screen.getByText("Pendente")).toBeInTheDocument();
    expect(screen.getByText("1 pendente(s)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entregar e Baixar" })).toBeInTheDocument();
  });

  it("cria a requisição com setor, insumo e quantidade", async () => {
    const usuario = userEvent.setup();
    render(<Requisicao />);
    await screen.findByText("Arroz");

    await usuario.selectOptions(
      screen.getByLabelText("Insumo"),
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    await usuario.type(screen.getByLabelText("Quantidade"), "500");
    await usuario.click(screen.getByRole("button", { name: "Solicitar" }));

    await waitFor(() => expect(criarRequisicaoMock).toHaveBeenCalledTimes(1));
    expect(criarRequisicaoMock.mock.calls[0]![1]).toEqual({
      setor: "cozinha",
      insumoId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      quantidadeBase: 500,
    });
  });

  it("recusa solicitar sem insumo", async () => {
    render(<Requisicao />);
    await screen.findByText("Arroz");

    await userEvent.click(screen.getByRole("button", { name: "Solicitar" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/Selecione o insumo/);
    expect(criarRequisicaoMock).not.toHaveBeenCalled();
  });

  it("entrega a requisição e mostra a baixa convertida", async () => {
    render(<Requisicao />);
    await screen.findByText("Arroz");

    await userEvent.click(screen.getByRole("button", { name: "Entregar e Baixar" }));

    await waitFor(() => expect(entregarRequisicaoMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent(/Entregue e baixado: 0,5 kg/);
  });

  it("mostra o bloqueio quando o saldo é insuficiente", async () => {
    entregarRequisicaoMock.mockRejectedValueOnce(
      new Error("Saldo insuficiente: disponível 100 na unidade do estoque, necessário 0.5."),
    );

    render(<Requisicao />);
    await screen.findByText("Arroz");

    await userEvent.click(screen.getByRole("button", { name: "Entregar e Baixar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Saldo insuficiente/);
  });
});
