// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConceptIdeaEntry } from "./ConceptIdeaEntry";

afterEach(cleanup);

describe("pré-projeto: ideia → editor", () => {
  it("permite começar sem ideia e sem informar terreno", () => {
    const onStart = vi.fn();
    render(<ConceptIdeaEntry initialIdea="" initialScope={null} onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir tela de projetar" }));
    expect(onStart).toHaveBeenCalledWith("", "house");
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("leva o texto e o escopo escolhidos diretamente para o editor", () => {
    const onStart = vi.fn();
    render(<ConceptIdeaEntry initialIdea="" initialScope="house" onStart={onStart} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Uma cozinha integrada  " } });
    fireEvent.click(screen.getByRole("radio", { name: "Um ambiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir tela de projetar" }));
    expect(onStart).toHaveBeenCalledWith("Uma cozinha integrada", "room");
  });

  it("preserva a ideia e o escopo recebidos de um rascunho", () => {
    const onStart = vi.fn();
    render(<ConceptIdeaEntry initialIdea="Suíte com closet" initialScope="room" onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir tela de projetar" }));
    expect(onStart).toHaveBeenCalledWith("Suíte com closet", "room");
  });
});
