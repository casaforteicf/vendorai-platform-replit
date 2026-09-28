// Jornada única do pré-projeto: substitui as três navegações concorrentes
// (trilho lateral, abas 2D/3D/Fachada/Render e o "Próximo" do guia) por 5 etapas.

export type ConceptJourneyView = "plan" | "model3d" | "facade" | "render";

export type ConceptJourneyStage = {
  id: "terreno" | "casa" | "ajustes" | "fachada" | "enviar";
  label: string;
  helper: string;
};

export const CONCEPT_JOURNEY: ConceptJourneyStage[] = [
  { id: "terreno", label: "Terreno", helper: "Informe as medidas do lote e o lado da frente." },
  { id: "casa", label: "Casa", helper: "Defina cômodos, quantidades, metragens e como a casa precisa funcionar." },
  { id: "ajustes", label: "Ajustes", helper: "Ajuste cômodos, paredes, portas, móveis e acabamentos. Veja em 2D ou 3D." },
  { id: "fachada", label: "Fachada", helper: "Defina o estilo da fachada e gere a imagem realista." },
  { id: "enviar", label: "Enviar", helper: "Revise o resumo, informe o contato e envie ao profissional." },
];

const SITE_TABS = new Set(["site"]);
const HOUSE_TABS = new Set(["brief", "models"]);

export function conceptJourneyIndex(input: {
  step: number;
  editorView: ConceptJourneyView;
  libraryTab: string;
}): number {
  if (input.step >= 6) return 4;
  if (input.editorView === "facade" || input.editorView === "render") return 3;
  if (input.editorView === "model3d") return 2;
  if (SITE_TABS.has(input.libraryTab)) return 0;
  if (HOUSE_TABS.has(input.libraryTab)) return 1;
  return 2;
}

export function conceptJourneyContinueLabel(index: number): string | null {
  if (index >= 4) return null;
  if (index === 3) return "Revisar e enviar";
  return `Continuar: ${CONCEPT_JOURNEY[index + 1].label}`;
}
