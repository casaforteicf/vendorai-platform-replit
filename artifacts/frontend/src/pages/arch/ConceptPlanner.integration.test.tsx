import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConceptPlanner from "./ConceptPlanner";

vi.mock("./conceptRender", async () => {
  const actual = await vi.importActual<typeof import("./conceptRender")>("./conceptRender");
  return {
    ...actual,
    svgElementToPngDataUrl: vi.fn(async () => "data:image/png;base64,concept-e2e"),
  };
});

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

describe("Arqdor Concept — fluxo integrado do editor", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();

    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
      expect(fetchMock).toHaveBeenCalledWith("/api/arch/concept-projects/latest")
    );

    await user.click(screen.getByRole("button", { name: /continuar/i }));
    await waitFor(() => expect(screen.getByText("Pré-projeto salvo")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /abrir editor/i }));
    expect(await screen.findByText("Editor do pré-projeto")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /+ itens/i }));
    const buildHeading = screen.getByText("Construção");
    const buildPanel = buildHeading.closest("aside");
    expect(buildPanel).not.toBeNull();
    expect(buildPanel?.className).toContain("fixed");
    await user.click(within(buildPanel as HTMLElement).getByRole("button", { name: /^fechar$/i }));

    await user.click(screen.getByRole("button", { name: /^mais$/i }));
    const toolsHeading = screen.getByText("Mais ferramentas");
    const toolsPanel = toolsHeading.closest("aside");
    expect(toolsPanel).not.toBeNull();
    expect(toolsPanel?.className).toContain("fixed");
    expect(within(toolsPanel as HTMLElement).getByRole("button", { name: /espaços/i })).toBeInTheDocument();
    expect(within(toolsPanel as HTMLElement).getByRole("button", { name: /desenhar parede/i })).toBeInTheDocument();
    expect(within(toolsPanel as HTMLElement).getByRole("button", { name: /cotas/i })).toBeInTheDocument();
    await user.click(within(toolsPanel as HTMLElement).getByRole("button", { name: /^fechar$/i }));

    await user.click(screen.getByRole("button", { name: /ajustes/i }));
    const propertiesHeading = screen.getByText("Propriedades");
    const propertiesPanel = propertiesHeading.closest("aside");
    expect(propertiesPanel).not.toBeNull();
    expect(propertiesPanel?.className).toContain("fixed");
    await user.click(within(propertiesPanel as HTMLElement).getByRole("button", { name: /^fechar$/i }));
    await user.click(screen.getByRole("button", { name: "3D" }));
    expect(screen.getByText(/Modelo 3D/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "2D" }));
    expect(screen.getByText(/Planta 2D/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls;
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


  it("gera render, salva dados atuais antes da promoção e reabre o projeto vinculado", async () => {
    const user = userEvent.setup();
    const material = (id: string, category: string, color: string) => ({
      id,
      name: id,
      category,
      color,
      pattern: "solid",
    });

    let storedDraft: any = {
      id: "concept-e2e-1",
      archProjetoId: null,
      currentStep: 4,
      lot: { width: 12, depth: 30 },
      configuration: {
        floors: 1,
        desiredArea: 145,
        typology: "terrea_3q",
        layoutPreferences: {},
        wallFirstFloors: [],
        showDimensions: true,
        customWalls: [],
        customOpenings: [],
        spaceProfiles: [],
        objects: [{
          id: "concept-object-e2e",
          name: "Sofá",
          category: "estar",
          symbol: "sofa",
          floor: 0,
          x: 4,
          y: 4,
          width: 2.2,
          depth: 0.9,
          height: 0.85,
          rotationDeg: 0,
          material: "Linho bege",
          color: "#cdbfae",
        }],
        materials: {
          floor: material("floor-e2e", "floor", "#ddd9d1"),
          floorByLevel: {},
          interiorWall: material("wall-in-e2e", "interior_wall", "#eeeae1"),
          exteriorWall: material("wall-out-e2e", "exterior_wall", "#e7e3db"),
          roof: material("roof-e2e", "roof", "#55504e"),
          stair: material("stair-e2e", "stair", "#b69469"),
        },
      },
      rooms: [{
        id: "room-e2e",
        kind: "sala",
        label: "Sala + jantar",
        width: 5.5,
        depth: 4.5,
        floor: 0,
        x: 1,
        y: 1,
      }],
      openingOverrides: {},
      customerProfile: {},
      facadePreferences: {
        style: "contemporaneo",
        roof: "platibanda",
        primaryMaterial: "pintura",
        accentMaterial: "madeira",
        facadeTone: "claro",
        frameTone: "preto",
        landscaping: "medio",
      },
      conceptRender: { status: "idle" },
      selectedVariant: 0,
    };

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "/api/arch/concept-projects/latest" && method === "GET") {
        return jsonResponse(storedDraft);
      }

      if (url === "/api/arch/concept-projects/concept-e2e-1" && method === "PATCH") {
        const payload = JSON.parse(String(init?.body ?? "{}"));
        storedDraft = { ...storedDraft, ...payload, id: "concept-e2e-1" };
        return jsonResponse(storedDraft);
      }

      if (url === "/api/arch/ai-render" && method === "POST") {
        return jsonResponse({ render_id: "render-e2e-1" });
      }

      if (url === "/api/arch/ai-render/render-e2e-1" && method === "GET") {
        return jsonResponse({
          status: "concluido",
          result_image_url: "https://example.test/render-e2e.jpg",
        });
      }

      if (url === "/api/arch/concept-projects/concept-e2e-1/promote" && method === "POST") {
        if (!storedDraft.customerProfile?.name || !storedDraft.customerProfile?.phone) {
          return jsonResponse({ error: "Dados do cliente não persistidos." }, false);
        }
        storedDraft = { ...storedDraft, archProjetoId: "arch-project-e2e" };
        return jsonResponse({
          project: { id: "arch-project-e2e" },
          leadId: "lead-e2e",
          dealId: "deal-e2e",
        });
      }

      return jsonResponse({ error: `Unhandled test request: ${method} ${url}` }, false);
    });

    const first = render(<ConceptPlanner />);

    expect(await screen.findByText("Editor do pré-projeto")).toBeInTheDocument();
    expect(screen.getByText("Sofá")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Render" }));
    const generateButtons = screen.getAllByRole("button", { name: /^gerar render$/i });
    await user.click(generateButtons[0]!);

    expect(await screen.findByAltText("Render conceitual", {}, { timeout: 6000 })).toHaveAttribute(
      "src",
      "https://example.test/render-e2e.jpg",
    );

    await user.click(screen.getByRole("button", { name: /ver resultado/i }));
    expect(await screen.findByText("Dados do cliente")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Nome do cliente"), "Cliente E2E");
    await user.type(screen.getByPlaceholderText("(49) 99999-9999"), "(49) 99999-0000");

    await user.click(screen.getByRole("button", { name: /enviar ao profissional/i }));

    expect(await screen.findByText(/pré-projeto enviado e vinculado/i)).toBeInTheDocument();

    const calls = fetchMock.mock.calls.map(([request, options], index) => ({
      index,
      url: String(request),
      options: options as RequestInit | undefined,
    }));
    const promoteCall = calls.find((call) =>
      call.url === "/api/arch/concept-projects/concept-e2e-1/promote" &&
      call.options?.method === "POST"
    );
    const saveBeforePromote = calls
      .filter((call) =>
        call.url === "/api/arch/concept-projects/concept-e2e-1" &&
        call.options?.method === "PATCH" &&
        call.index < (promoteCall?.index ?? -1)
      )
      .at(-1);

    expect(promoteCall).toBeTruthy();
    expect(saveBeforePromote).toBeTruthy();
    const savedBody = JSON.parse(String(saveBeforePromote?.options?.body ?? "{}"));
    expect(savedBody.customerProfile).toMatchObject({
      name: "Cliente E2E",
      phone: "(49) 99999-0000",
    });
    expect(savedBody.configuration.objects[0]).toMatchObject({
      id: "concept-object-e2e",
      name: "Sofá",
    });
    expect(savedBody.configuration.materials.exteriorWall.id).toBe("wall-out-e2e");
    expect(savedBody.conceptRender.resultImageUrl).toBe("https://example.test/render-e2e.jpg");

    first.unmount();
    render(<ConceptPlanner />);

    expect(await screen.findByText(/pré-projeto enviado e vinculado/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Cliente E2E")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /abrir projeto profissional/i })).toBeInTheDocument();
  }, 10000);
});
