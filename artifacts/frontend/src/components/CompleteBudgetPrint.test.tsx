import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: any) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h1>{children}</h1>,
}));
import { CompleteBudgetPrint } from "./CompleteBudgetPrint";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("impressão completa", () => {
  it("carrega o documento autenticado e libera impressão só após carregar o iframe", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ html: "<html><body>Cronograma completo</body></html>" }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    localStorage.setItem("vendorai_token", "test-token");
    render(<CompleteBudgetPrint id="budget-1" open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Imprimir / Salvar como PDF" })).toBeDisabled();
    await waitFor(() => expect(screen.getByTitle("Orçamento completo para impressão")).toBeInTheDocument());
    expect(fetcher).toHaveBeenCalledWith("/api/propostas/budget-1/print-document", expect.objectContaining({
      headers: { Authorization: "Bearer test-token" },
    }));
    const frame = screen.getByTitle("Orçamento completo para impressão");
    expect(frame).toHaveAttribute("sandbox", "allow-same-origin allow-modals");
    fireEvent.load(frame);
    expect(screen.getByRole("button", { name: "Imprimir / Salvar como PDF" })).toBeEnabled();
  });
  it("mostra falha e permite tentar novamente sem imprimir conteúdo parcial", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("erro", { status: 500 })));
    render(<CompleteBudgetPrint id="budget-2" open onOpenChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Imprimir / Salvar como PDF" })).toBeDisabled();
  });
});
