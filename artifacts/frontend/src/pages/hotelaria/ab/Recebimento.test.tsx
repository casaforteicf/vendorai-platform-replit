import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../HotelModulesNav", () => ({ default: () => null }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { tenantId: "hotel-1" }, token: "token-de-teste" }),
}));

const { criarRecebimentoMock } = vi.hoisted(() => ({ criarRecebimentoMock: vi.fn() }));

vi.mock("@/lib/ab/client", () => ({
  criarRecebimento: criarRecebimentoMock,
  mensagemDoErro: (erro: unknown) => (erro instanceof Error ? erro.message : String(erro)),
}));

import Recebimento from "./Recebimento";

const PRODUTO_CARNE = "11111111-1111-4111-8111-111111111111";

function emDias(dias: number): string {
  const agora = new Date();
  const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000);
  local.setDate(local.getDate() + dias);
  return local.toISOString().slice(0, 10);
}

function preencherValidade(valor: string) {
  fireEvent.change(screen.getByLabelText(/Data de validade/), { target: { value: valor } });
}

describe("Recebimento — tela", () => {
  beforeEach(() => {
    criarRecebimentoMock.mockReset();
    criarRecebimentoMock.mockResolvedValue({
      id: "rec-1",
      etiquetaFefo: "verde",
      status: "aprovado",
      motivoBloqueio: null,
    });
  });

  it("renderiza os campos de entrada e o botão", () => {
    render(<Recebimento />);

    expect(screen.getByRole("heading", { name: /Recebimento de mercadorias/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Nota fiscal/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Lote/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Data de validade/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Temperatura/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Quantidade/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar Entrada" })).toBeInTheDocument();
  });

  it("mostra etiqueta VERDE para validade acima de 30 dias", () => {
    render(<Recebimento />);
    preencherValidade(emDias(40));

    expect(screen.getByText("Etiqueta FEFO")).toBeInTheDocument();
    expect(screen.getByText("VERDE")).toBeInTheDocument();
  });

  it("mostra etiqueta AMARELA entre 7 e 30 dias", () => {
    render(<Recebimento />);
    preencherValidade(emDias(15));

    expect(screen.getByText("AMARELO")).toBeInTheDocument();
  });

  it("mostra etiqueta VERMELHA abaixo de 7 dias", () => {
    render(<Recebimento />);
    preencherValidade(emDias(3));

    expect(screen.getByText("VERMELHO")).toBeInTheDocument();
  });

  it("alerta risco sanitário quando a carne vem acima de -12 °C", async () => {
    const usuario = userEvent.setup();
    render(<Recebimento />);

    await usuario.type(screen.getByLabelText(/Temperatura/), "-5");

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/Temperatura inadequada\. Risco Sanitário/);
  });

  it("não alerta com carne dentro do limite", async () => {
    const usuario = userEvent.setup();
    render(<Recebimento />);

    await usuario.type(screen.getByLabelText(/Temperatura/), "-18");

    expect(screen.queryByText(/Risco Sanitário/)).not.toBeInTheDocument();
  });

  it("recusa registrar sem nota fiscal", async () => {
    render(<Recebimento />);
    preencherValidade(emDias(40));

    await userEvent.click(screen.getByRole("button", { name: "Registrar Entrada" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/Informe a nota fiscal/);
    expect(criarRecebimentoMock).not.toHaveBeenCalled();
  });

  it("registra enviando quantidade numérica, temperatura e unidade", async () => {
    const usuario = userEvent.setup();
    render(<Recebimento />);

    await usuario.type(screen.getByLabelText(/Nota fiscal/), "12345");
    await usuario.type(screen.getByLabelText(/Lote/), "L-2026-11");
    preencherValidade(emDias(40));
    await usuario.type(screen.getByLabelText(/Temperatura/), "-18");
    await usuario.type(screen.getByLabelText(/Quantidade/), "20");
    await usuario.click(screen.getByRole("button", { name: "Registrar Entrada" }));

    expect(criarRecebimentoMock).toHaveBeenCalledTimes(1);
    expect(criarRecebimentoMock.mock.calls[0]![1]).toMatchObject({
      produtoCatalogoId: PRODUTO_CARNE,
      notaFiscal: "12345",
      lote: "L-2026-11",
      dataValidade: emDias(40),
      temperaturaC: -18,
      quantidade: 20,
      unidade: "g",
    });
    // Etiqueta do servidor aparece no card após salvar.
    expect(await screen.findByText(/Calculada e gravada pelo servidor/)).toBeInTheDocument();
  });
});
