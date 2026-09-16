import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MobilePresetBlock from "./MobilePresetBlocks";

describe("vendorai-mobile-v1 presets", () => {
  it("filters catalog items by search without changing the source data", async () => {
    const user = userEvent.setup();
    render(
      <MobilePresetBlock
        blockId="catalog"
        type="cards"
        props={{
          variant: "product_grid",
          searchPlaceholder: "Buscar catálogo",
          items: [
            { title: "Item Alpha", brand: "Marca A", category: "Categoria A", price: "R$ 10,00" },
            { title: "Item Beta", brand: "Marca B", category: "Categoria B", price: "R$ 20,00" },
          ],
        }}
      />,
    );

    expect(screen.getByText("Item Alpha")).toBeInTheDocument();
    expect(screen.getByText("Item Beta")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Buscar catálogo"), "Beta");

    expect(screen.queryByText("Item Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Item Beta")).toBeInTheDocument();
  });

  it("navigates quick actions only through declared page ids", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <MobilePresetBlock
        blockId="quick"
        type="cards"
        props={{
          variant: "quick_actions",
          items: [
            { title: "Histórico", icon: "compras", pageId: "history" },
            { title: "Sem destino", icon: "info" },
          ],
        }}
        onNavigate={onNavigate}
      />,
    );

    await user.click(screen.getByRole("button", { name: /histórico/i }));
    expect(onNavigate).toHaveBeenCalledWith("history");

    await user.click(screen.getByRole("button", { name: /sem destino/i }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("renders masked synthetic profile data without exposing a full document", () => {
    render(
      <MobilePresetBlock
        blockId="profile"
        type="list"
        props={{
          variant: "profile_fields",
          title: "Cliente Exemplo",
          subtitle: "Documento: ***.***.***-**",
          items: [
            { label: "E-mail", value: "cliente@exemplo.com" },
            { label: "Celular", value: "(00) 00000-0000" },
          ],
        }}
      />,
    );

    expect(screen.getByText("Cliente Exemplo")).toBeInTheDocument();
    expect(screen.getByText("Documento: ***.***.***-**")).toBeInTheDocument();
    expect(screen.queryByText(/\d{3}\.\d{3}\.\d{3}-\d{2}/)).not.toBeInTheDocument();
  });

  it("uses the declared destination on empty-state actions", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <MobilePresetBlock
        blockId="empty"
        type="callout"
        props={{
          variant: "empty_state",
          title: "Nada por aqui ainda",
          actionLabel: "Voltar ao início",
          pageId: "home",
        }}
        onNavigate={onNavigate}
      />,
    );

    await user.click(screen.getByRole("button", { name: /voltar ao início/i }));
    expect(onNavigate).toHaveBeenCalledWith("home");
  });
});
