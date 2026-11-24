import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../HotelModulesNav", () => ({ default: () => null }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { tenantId: "hotel-1" }, token: "token-de-teste" }),
}));

const { INSUMOS, listarInsumosMock, listarMapeamentosMock, salvarMapeamentoMock } = vi.hoisted(() => ({
  INSUMOS: [
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", nome: "Arroz", unidade: "g", codigo: "INS-ARR" },
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", nome: "Bife", unidade: "g", codigo: null },
  ],
  listarInsumosMock: vi.fn(),
  listarMapeamentosMock: vi.fn(),
  salvarMapeamentoMock: vi.fn(),
}));

vi.mock("@/lib/ab/client", () => ({
  listarInsumos: listarInsumosMock,
  listarMapeamentos: listarMapeamentosMock,
  salvarMapeamento: salvarMapeamentoMock,
  removerMapeamento: vi.fn(),
  mensagemDoErro: (erro: unknown) => (erro instanceof Error ? erro.message : String(erro)),
}));

import MapeamentoInsumos from "./MapeamentoInsumos";

const ARROZ_PRODUTO = "11111111-1111-4111-8111-111111111111"; // saco (não métrica)
const BIFE_PRODUTO = "22222222-2222-4222-8222-222222222222"; // kg (métrica)

describe("MapeamentoInsumos — tela", () => {
  beforeEach(() => {
    listarInsumosMock.mockReset().mockResolvedValue(INSUMOS);
    listarMapeamentosMock.mockReset().mockResolvedValue([]);
    salvarMapeamentoMock.mockReset().mockResolvedValue({ id: "map-1" });
  });

  it("lista os produtos do estoque e o contador de mapeados", async () => {
    render(<MapeamentoInsumos />);

    expect(await screen.findByText("ARROZ T1 5kg")).toBeInTheDocument();
    expect(screen.getByText("Bife de patinho")).toBeInTheDocument();
    expect(screen.getByText("Alface crespa")).toBeInTheDocument();
    expect(screen.getByText("Óleo de soja 900ml")).toBeInTheDocument();
    expect(screen.getByText("0 de 4 mapeados")).toBeInTheDocument();
  });

  it("preenche o select com os insumos da API", async () => {
    render(<MapeamentoInsumos />);
    await screen.findByText("ARROZ T1 5kg");

    const select = screen.getByLabelText("Insumo de ARROZ T1 5kg");
    expect(select).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: /Arroz/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("option", { name: /Bife/ }).length).toBeGreaterThan(0);
  });

  it("recusa salvar sem insumo selecionado", async () => {
    const usuario = userEvent.setup();
    render(<MapeamentoInsumos />);
    await screen.findByText("ARROZ T1 5kg");

    await usuario.click(screen.getAllByRole("button", { name: "Salvar" })[0]!);

    expect(screen.getByRole("alert")).toHaveTextContent(/Selecione o insumo/);
    expect(salvarMapeamentoMock).not.toHaveBeenCalled();
  });

  it("exige fator de embalagem para unidade não métrica (saco)", async () => {
    const usuario = userEvent.setup();
    render(<MapeamentoInsumos />);
    await screen.findByText("ARROZ T1 5kg");

    await usuario.selectOptions(
      screen.getByLabelText("Insumo de ARROZ T1 5kg"),
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    await usuario.click(screen.getAllByRole("button", { name: "Salvar" })[0]!);

    expect(screen.getByRole("alert")).toHaveTextContent(/não é métrica/);
    expect(salvarMapeamentoMock).not.toHaveBeenCalled();
  });

  it("salva o de-para com o fator informado", async () => {
    const usuario = userEvent.setup();
    listarMapeamentosMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "map-1",
          insumoId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          produtoCatalogoId: ARROZ_PRODUTO,
          fatorEmbalagem: "50000.000000",
          insumoNome: "Arroz",
          insumoUnidade: "g",
          produtoNome: "ARROZ T1 5kg",
          produtoSku: "ARR-T1-5",
          produtoUnidade: "saco",
        },
      ]);

    render(<MapeamentoInsumos />);
    await screen.findByText("ARROZ T1 5kg");

    await usuario.selectOptions(
      screen.getByLabelText("Insumo de ARROZ T1 5kg"),
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    await usuario.type(screen.getByLabelText("Fator de embalagem de ARROZ T1 5kg"), "50000");
    await usuario.click(screen.getAllByRole("button", { name: "Salvar" })[0]!);

    await waitFor(() => expect(salvarMapeamentoMock).toHaveBeenCalledTimes(1));
    expect(salvarMapeamentoMock.mock.calls[0]![1]).toEqual({
      produtoCatalogoId: ARROZ_PRODUTO,
      insumoId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      fatorEmbalagem: 50000,
    });
    expect(await screen.findByRole("status")).toHaveTextContent(/Mapeamento de "ARROZ T1 5kg" salvo/);
    expect(await screen.findByText("1 de 4 mapeados")).toBeInTheDocument();
  });

  it("aceita unidade métrica sem fator", async () => {
    const usuario = userEvent.setup();
    render(<MapeamentoInsumos />);
    await screen.findByText("Bife de patinho");

    await usuario.selectOptions(
      screen.getByLabelText("Insumo de Bife de patinho"),
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
    // botão da linha do bife é o segundo "Salvar"
    await usuario.click(screen.getAllByRole("button", { name: "Salvar" })[1]!);

    await waitFor(() => expect(salvarMapeamentoMock).toHaveBeenCalledTimes(1));
    expect(salvarMapeamentoMock.mock.calls[0]![1]).toEqual({
      produtoCatalogoId: BIFE_PRODUTO,
      insumoId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      fatorEmbalagem: null,
    });
  });

  it("pré-preenche o que já está mapeado e mostra Desvincular", async () => {
    listarMapeamentosMock.mockResolvedValueOnce([
      {
        id: "map-1",
        insumoId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        produtoCatalogoId: ARROZ_PRODUTO,
        fatorEmbalagem: "50000.000000",
        insumoNome: "Arroz",
        insumoUnidade: "g",
        produtoNome: "ARROZ T1 5kg",
        produtoSku: "ARR-T1-5",
        produtoUnidade: "saco",
      },
    ]);

    render(<MapeamentoInsumos />);
    await screen.findByText("ARROZ T1 5kg");

    expect(await screen.findByText("1 de 4 mapeados")).toBeInTheDocument();
    expect((screen.getByLabelText("Insumo de ARROZ T1 5kg") as HTMLSelectElement).value).toBe(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(screen.getByRole("button", { name: "Desvincular" })).toBeInTheDocument();
  });
});
