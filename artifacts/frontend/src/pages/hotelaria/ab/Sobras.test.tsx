import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// A navegação do módulo depende do Router do wouter; o alvo aqui é a tela.
vi.mock("../HotelModulesNav", () => ({ default: () => null }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { tenantId: "hotel-1" }, token: "token-de-teste" }),
}));

const { criarSobraMock } = vi.hoisted(() => ({ criarSobraMock: vi.fn() }));

vi.mock("@/lib/ab/client", () => ({
  criarSobra: criarSobraMock,
  mensagemDoErro: (erro: unknown) => (erro instanceof Error ? erro.message : String(erro)),
}));

import Sobras from "./Sobras";

function preencherPeso(nome: string, valor: string) {
  return userEvent.type(screen.getByLabelText(`Peso da sobra de ${nome}`), valor);
}

describe("Sobras — tela", () => {
  beforeEach(() => {
    criarSobraMock.mockReset();
    criarSobraMock.mockResolvedValue({ id: "sobra-1" });
  });

  it("renderiza a tela com os três insumos e o botão de registrar", () => {
    render(<Sobras />);

    expect(
      screen.getByRole("heading", { name: "Controle de Sobras e Desperdício" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Arroz")).toBeInTheDocument();
    expect(screen.getByText("Bife")).toBeInTheDocument();
    expect(screen.getByText("Salada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar Sobras" })).toBeInTheDocument();
  });

  it("preenche a data com o dia de hoje", () => {
    render(<Sobras />);

    const campo = screen.getByLabelText(/Data/) as HTMLInputElement;
    expect(campo.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("oferece os três motivos de sobra em cada insumo", () => {
    render(<Sobras />);

    expect(screen.getByLabelText("Motivo da sobra de Arroz")).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: "Erro de produção" })).toHaveLength(3);
    expect(screen.getAllByRole("option", { name: "Sobra de buffet" })).toHaveLength(3);
    expect(screen.getAllByRole("option", { name: "Validade vencida" })).toHaveLength(3);
  });

  it("mostra o nome do arquivo anexado", async () => {
    render(<Sobras />);

    await userEvent.upload(
      screen.getByLabelText("Foto de Arroz"),
      new File(["conteudo"], "sobra-arroz.jpg", { type: "image/jpeg" }),
    );

    expect(screen.getByText("sobra-arroz.jpg")).toBeInTheDocument();
  });

  it("não chama a API sem peso informado", async () => {
    render(<Sobras />);

    await userEvent.click(screen.getByRole("button", { name: "Registrar Sobras" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/pelo menos um insumo/);
    expect(criarSobraMock).not.toHaveBeenCalled();
  });

  it("exige motivo quando há peso", async () => {
    render(<Sobras />);

    await preencherPeso("Arroz", "2");
    await userEvent.click(screen.getByRole("button", { name: "Registrar Sobras" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/motivo da sobra de: Arroz/);
    expect(criarSobraMock).not.toHaveBeenCalled();
  });

  it("grava via API e limpa os campos", async () => {
    const usuario = userEvent.setup();
    render(<Sobras />);

    await usuario.type(screen.getByLabelText("Peso da sobra de Arroz"), "2");
    await usuario.selectOptions(screen.getByLabelText("Motivo da sobra de Arroz"), "sobra_buffet");
    await usuario.click(screen.getByRole("button", { name: "Registrar Sobras" }));

    await waitFor(() => expect(criarSobraMock).toHaveBeenCalledTimes(1));
    const [, entrada] = criarSobraMock.mock.calls[0]!;
    expect(entrada).toMatchObject({
      insumoNome: "Arroz",
      pesoKg: 2,
      motivo: "sobra_buffet",
    });
    expect(entrada).not.toHaveProperty("registradoPor");

    expect(await screen.findByRole("status")).toHaveTextContent(/1 sobra\(s\) registrada\(s\)/);
    expect((screen.getByLabelText("Peso da sobra de Arroz") as HTMLInputElement).value).toBe("");
  });

  it("mantém os campos do insumo que falhou e reporta o erro", async () => {
    criarSobraMock
      .mockRejectedValueOnce(new Error("Já existe uma sobra deste insumo"))
      .mockResolvedValueOnce({ id: "sobra-2" });

    const usuario = userEvent.setup();
    render(<Sobras />);

    await usuario.type(screen.getByLabelText("Peso da sobra de Arroz"), "1");
    await usuario.selectOptions(screen.getByLabelText("Motivo da sobra de Arroz"), "erro_producao");
    await usuario.type(screen.getByLabelText("Peso da sobra de Bife"), "3");
    await usuario.selectOptions(screen.getByLabelText("Motivo da sobra de Bife"), "sobra_buffet");
    await usuario.click(screen.getByRole("button", { name: "Registrar Sobras" }));

    await waitFor(() => expect(criarSobraMock).toHaveBeenCalledTimes(2));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/Falha ao registrar 1 de 2/);
    // O que falhou continua na tela para nova tentativa; o que gravou saiu.
    expect((screen.getByLabelText("Peso da sobra de Arroz") as HTMLInputElement).value).toBe("1");
    expect((screen.getByLabelText("Peso da sobra de Bife") as HTMLInputElement).value).toBe("");
  });
});
