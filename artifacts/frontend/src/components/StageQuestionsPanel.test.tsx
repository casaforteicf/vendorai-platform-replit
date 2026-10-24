import { act, fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StageQuestionsPanel } from "./StageQuestionsPanel";

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), invalidateQueries: vi.fn(), admin: true }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));
vi.mock("@workspace/api-client-react", () => ({
  useUpdatePipelineStage: () => ({ mutate: mocks.mutate, isPending: false }),
  getListPipelineStagesQueryKey: (id: string) => [`/api/tenants/${id}/pipeline-stages`],
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isEffectiveAdmin: mocks.admin }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const stage = { id: "stage-1", key: "novo", label: "Novo", perguntas: [{ id: "q1", texto: "Original" }], acompanhamentoConfig: { objetivo: "Original objetivo" } };
const props = { tenantId: "tenant-1", stage, answers: {}, onSaveAnswers: vi.fn() };
const edit = () => fireEvent.click(screen.getByRole("button", { name: "Editar perguntas" }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.admin = true; });

describe("stage question editing", () => {
  it("opens the latest server data for the same stage id", () => {
    const { rerender } = render(<StageQuestionsPanel {...props} />);
    rerender(<StageQuestionsPanel {...props} stage={{ ...stage, perguntas: [{ id: "q1", texto: "Atualizada" }] }} />);
    edit();
    expect(screen.getByDisplayValue("Atualizada")).toBeTruthy();
    expect(screen.queryByDisplayValue("Original")).toBeNull();
  });

  it("discards questions, follow-up settings and pending new text on cancel", () => {
    render(<StageQuestionsPanel {...props} />);
    edit();
    fireEvent.change(screen.getByDisplayValue("Original"), { target: { value: "Rascunho" } });
    fireEvent.change(screen.getByDisplayValue("Original objetivo"), { target: { value: "Descartar" } });
    fireEvent.change(screen.getByPlaceholderText("Nova pergunta desta etapa"), { target: { value: "Pendente" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    edit();
    expect(screen.getByDisplayValue("Original")).toBeTruthy();
    expect(screen.getByDisplayValue("Original objetivo")).toBeTruthy();
    expect(screen.queryByDisplayValue("Pendente")).toBeNull();
  });

  it("preserves an active draft during background refresh", () => {
    const { rerender } = render(<StageQuestionsPanel {...props} />);
    edit();
    fireEvent.change(screen.getByDisplayValue("Original"), { target: { value: "Digitando" } });
    rerender(<StageQuestionsPanel {...props} stage={{ ...stage, perguntas: [{ id: "q1", texto: "Servidor" }] }} />);
    expect(screen.getByDisplayValue("Digitando")).toBeTruthy();
  });

  it("closes editing when the stage changes", () => {
    const { rerender } = render(<StageQuestionsPanel {...props} />);
    edit();
    rerender(<StageQuestionsPanel {...props} stage={{ ...stage, id: "stage-2" }} />);
    expect(screen.queryByRole("button", { name: "Salvar perguntas" })).toBeNull();
  });

  it("refreshes both stage caches after saving", () => {
    render(<StageQuestionsPanel {...props} />);
    edit();
    fireEvent.click(screen.getByRole("button", { name: "Salvar perguntas" }));
    expect(mocks.mutate.mock.calls[0][0]).toMatchObject({ tenantId: "tenant-1", id: "stage-1", data: { perguntas: stage.perguntas } });
    act(() => mocks.mutate.mock.calls[0][1].onSuccess());
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["pipeline-stages", "tenant-1"] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["/api/tenants/tenant-1/pipeline-stages"] });
  });

  it("does not expose configuration to non-admins", () => {
    mocks.admin = false;
    render(<StageQuestionsPanel {...props} />);
    expect(screen.queryByRole("button", { name: "Editar perguntas" })).toBeNull();
  });
});
