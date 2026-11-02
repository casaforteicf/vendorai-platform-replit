import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// A navegação do módulo depende do Router do wouter; o alvo aqui é a tela.
vi.mock("../HotelModulesNav", () => ({ default: () => null }));

import Sobras from "./Sobras";

describe("Sobras — tela", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

    const motivo = screen.getByLabelText("Motivo da sobra de Arroz");
    expect(motivo).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: "Erro de produção" })).toHaveLength(3);
    expect(screen.getAllByRole("option", { name: "Sobra de buffet" })).toHaveLength(3);
    expect(screen.getAllByRole("option", { name: "Validade vencida" })).toHaveLength(3);
  });

  it("mostra o nome do arquivo anexado", async () => {
    const usuario = userEvent.setup();
    render(<Sobras />);

    await usuario.upload(
      screen.getByLabelText("Foto de Arroz"),
      new File(["conteudo"], "sobra-arroz.jpg", { type: "image/jpeg" }),
    );

    expect(screen.getByText("sobra-arroz.jpg")).toBeInTheDocument();
    expect(screen.getByText("Trocar foto")).toBeInTheDocument();
  });

  it("não registra nada sem peso informado", async () => {
    const alerta = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<Sobras />);

    await userEvent.click(screen.getByRole("button", { name: "Registrar Sobras" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/pelo menos um insumo/);
    expect(alerta).not.toHaveBeenCalled();
  });

  it("exige motivo quando há peso", async () => {
    const usuario = userEvent.setup();
    render(<Sobras />);

    await usuario.type(screen.getByLabelText("Peso da sobra de Arroz"), "2");
    await usuario.click(screen.getByRole("button", { name: "Registrar Sobras" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/motivo da sobra de: Arroz/);
  });

  it("registra com alert de sucesso e limpa os campos", async () => {
    const usuario = userEvent.setup();
    const alerta = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<Sobras />);

    await usuario.type(screen.getByLabelText("Peso da sobra de Arroz"), "2");
    await usuario.selectOptions(
      screen.getByLabelText("Motivo da sobra de Arroz"),
      "sobra_buffet",
    );
    await usuario.click(screen.getByRole("button", { name: "Registrar Sobras" }));

    expect(alerta).toHaveBeenCalledTimes(1);
    const texto = String(alerta.mock.calls[0][0]);
    expect(texto).toContain("Sobras registradas");
    expect(texto).toContain("Arroz: 2 kg — Sobra de buffet");

    expect((screen.getByLabelText("Peso da sobra de Arroz") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Motivo da sobra de Arroz") as HTMLSelectElement).value).toBe("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
