// Jornada adaptativa do pré-projeto.
// A navegação muda de verdade conforme o escopo: casa com terreno, casa sem terreno ou ambiente.

export type ConceptJourneyView = "plan" | "model3d" | "facade" | "render";
export type ConceptJourneyScope = "house" | "room" | null;

export type ConceptJourneyStageId =
  | "terrain"
  | "brief"
  | "plan"
  | "adjustments"
  | "decorate"
  | "visual"
  | "render"
  | "send";

export type ConceptJourneyStage = {
  id: ConceptJourneyStageId;
  label: string;
  helper: string;
};

export const CONCEPT_JOURNEY: ConceptJourneyStage[] = [
  { id: "terrain", label: "Terreno", helper: "Informe as medidas do lote e o lado da frente." },
  { id: "plan", label: "Projeto", helper: "Escolha como iniciar: IA, construir do zero, importar projeto ou usar imagem/PDF." },
  { id: "adjustments", label: "Ajustes", helper: "Ajuste cômodos, paredes, portas, móveis e acabamentos. Veja em 2D ou 3D." },
  { id: "visual", label: "Fachada", helper: "Defina o visual e gere a imagem realista." },
  { id: "send", label: "Enviar", helper: "Revise o resumo, informe o contato e envie ao profissional." },
];

export function buildConceptJourney(input: {
  scope: ConceptJourneyScope;
  terrainDefined: boolean;
}): ConceptJourneyStage[] {
  if (input.scope === "room") {
    return [
      { id: "brief", label: "Briefing", helper: "Defina o ambiente, necessidades, referências e medidas conhecidas." },
      { id: "plan", label: "Layout", helper: "Construa ou revise paredes, portas, janelas e organização do espaço." },
      { id: "decorate", label: "Materiais e mobiliário", helper: "Especifique móveis, produtos, acabamentos e pontos técnicos." },
      { id: "render", label: "Render", helper: "Revise o 3D interior e gere a imagem fotorealista do ambiente." },
      { id: "send", label: "Apresentar", helper: "Revise o ambiente e compartilhe a apresentação com o cliente." },
    ];
  }

  if (input.scope === "house" && !input.terrainDefined) {
    return [
      { id: "brief", label: "Briefing", helper: "Defina necessidades e origem da planta. O terreno pode ser adicionado depois." },
      { id: "plan", label: "Planta", helper: "Crie, importe ou revise a planta arquitetônica da casa." },
      { id: "adjustments", label: "Ajustes", helper: "Ajuste ambientes, paredes, aberturas, mobiliário e materiais." },
      { id: "visual", label: "Visual", helper: "Revise o 3D, fachada e gere imagens realistas." },
      { id: "send", label: "Apresentar", helper: "Revise o projeto e compartilhe a apresentação com o cliente." },
    ];
  }

  return [
    { id: "terrain", label: "Terreno", helper: "Defina lote, frente, recuos e implantação." },
    { id: "plan", label: "Planta", helper: "Crie, importe ou desenvolva a planta arquitetônica." },
    { id: "adjustments", label: "Ajustes", helper: "Ajuste ambientes, paredes, aberturas, mobiliário e materiais." },
    { id: "visual", label: "Visual", helper: "Revise o 3D, fachada e gere imagens realistas." },
    { id: "send", label: "Apresentar", helper: "Revise o projeto e compartilhe a apresentação com o cliente." },
  ];
}

export function conceptJourneyIndex(input: {
  step: number;
  editorView: ConceptJourneyView;
  libraryTab: string;
  scope?: ConceptJourneyScope;
  terrainDefined?: boolean;
}): number {
  if (input.step >= 6) return 4;

  if (input.scope === "room") {
    if (input.editorView === "render" || input.editorView === "model3d") return 3;
    if (input.libraryTab === "furniture" || input.libraryTab === "materials") return 2;
    if (input.libraryTab === "brief" || input.libraryTab === "models") return 0;
    return 1;
  }

  if (input.editorView === "facade" || input.editorView === "render") return 3;
  if (input.editorView === "model3d") return 2;

  if (input.scope === "house" && input.terrainDefined === false) {
    if (input.libraryTab === "brief" || input.libraryTab === "models") return 0;
    if (input.libraryTab === "furniture" || input.libraryTab === "materials" || input.libraryTab === "outdoor") return 2;
    return 1;
  }

  if (input.libraryTab === "site") return 0;
  if (input.libraryTab === "brief" || input.libraryTab === "models") return 1;
  return 2;
}

export function conceptJourneyContinueLabel(
  index: number,
  stages: ConceptJourneyStage[] = CONCEPT_JOURNEY,
): string | null {
  if (index >= stages.length - 1) return null;
  if (index === stages.length - 2) return `Revisar e ${stages[stages.length - 1].label.toLowerCase()}`;
  return `Continuar: ${stages[index + 1].label}`;
}
