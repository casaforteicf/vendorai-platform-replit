import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConceptPlanner from "./ConceptPlanner";

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

describe("Arqdor Concept — fluxo integrado do editor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "/api/arch/concept-projects/latest" && method === "GET") {
        return jsonResponse(null);
      }

      if (url === "/api/arch/concept-projects" && method === "POST") {
        const payload = JSON.parse(String(init?.body ?? "{}"));
        return jsonResponse({
          id: "concept-integration-1",
          currentStep: payload.currentStep ?? 0,
          lot: payload.lot,
          configuration: payload.configuration,
          rooms: payload.rooms,
          openingOverrides: payload.openingOverrides,
          customerProfile: payload.customerProfile,
          facadePreferences: payload.facadePreferences,
          conceptRender: payload.conceptRender,
          selectedVariant: payload.selectedVariant ?? 0,
        });
      }

      if (url === "/api/arch/concept-projects/concept-integration-1" && method === "PATCH") {
        const payload = JSON.parse(String(init?.body ?? "{}"));
        return jsonResponse({
          id: "concept-integration-1",
          ...payload,
        });
      }

      return jsonResponse({ error: `Unhandled test request: ${method} ${url}` }, false);
    });

    vi.stubGlobal("fetch", fetchMock);
  });

  it("abre o editor, alterna vistas e usa os painéis móveis sem perder persistência", async () => {
    const user = userEvent.setup();
    render(<ConceptPlanner />);

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/arch/concept-projects/latest")
    );

    await user.click(screen.getByRole("button", { name: /continuar/i }));
    await waitFor(() => expect(screen.getByText("Pré-projeto salvo")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /abrir editor/i }));
    expect(await screen.findByText("Editor do pré-projeto")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /+ itens/i }));
    expect(screen.getByText("Construção")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^fechar$/i }));
    await user.click(screen.getByRole("button", { name: /ajustes/i }));
    expect(screen.getByText("Propriedades")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^fechar$/i }));
    await user.click(screen.getByRole("button", { name: "3D" }));
    expect(screen.getByText(/Modelo 3D/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "2D" }));
    expect(screen.getByText(/Planta 2D/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() => {
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
      const patch = calls
        .map(([request, options]) => ({ url: String(request), options: options as RequestInit | undefined }))
        .find((call) =>
          call.url === "/api/arch/concept-projects/concept-integration-1" &&
          call.options?.method === "PATCH"
        );
      expect(patch).toBeTruthy();

      const body = JSON.parse(String(patch?.options?.body ?? "{}"));
      expect(body.configuration.materials).toBeTruthy();
      expect(body.configuration.materials.floor).toBeTruthy();
      expect(body.configuration.materials.exteriorWall).toBeTruthy();
      expect(body.configuration.objects).toBeInstanceOf(Array);
    });
  });
});
