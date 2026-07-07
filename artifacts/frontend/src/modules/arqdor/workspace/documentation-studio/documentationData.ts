import type { DocumentationDiscipline } from "./DocumentationStudioContext";

export type DisciplineDefinition = {
  id: DocumentationDiscipline;
  label: string;
  description: string;
};

export const disciplines: DisciplineDefinition[] = [
  { id: "geral", label: "Geral", description: "Resumo do projeto e índice dos cadernos." },
  { id: "arquitetura", label: "Arquitetura", description: "Plantas, fachadas, cortes e implantação." },
  { id: "interiores", label: "Interiores", description: "Ambientes, conceito, materiais e mobiliário." },
  { id: "marcenaria", label: "Marcenaria", description: "Planta, elevações, módulos, ferragens e MDF." },
  { id: "gesso", label: "Gesso", description: "Forro, sancas, cortineiros, rasgos e perfis." },
  { id: "iluminacao", label: "Iluminação", description: "Luminárias, temperatura, cenas e observações." },
  { id: "eletrica", label: "Elétrica", description: "Tomadas, interruptores, pontos e circuitos." },
  { id: "hidraulica", label: "Hidráulica", description: "Pontos, metais, louças e observações técnicas." },
  { id: "paisagismo", label: "Paisagismo", description: "Espécies, vasos, iluminação externa e implantação." },
  { id: "pintura", label: "Pintura", description: "Cores, ambientes, áreas e acabamentos." },
  { id: "marmoraria", label: "Marmoraria", description: "Bancadas, soleiras, peitoris e cubas." },
  { id: "esquadrias", label: "Esquadrias", description: "Portas, janelas, vidros e persianas." },
  { id: "decoracao", label: "Decoração", description: "Móveis soltos, tapetes, quadros e objetos." },
];

export type DocumentationItem = {
  id: string;
  title: string;
  type: "planta" | "vista" | "memorial" | "quantitativo" | "detalhe";
  status: "pendente" | "gerado" | "revisao" | "aprovado";
};

export function buildDefaultItems(discipline: DocumentationDiscipline): DocumentationItem[] {
  if (discipline === "geral") {
    return [
      { id: "geral-capa", title: "Capa do projeto", type: "memorial", status: "gerado" },
      { id: "geral-indice", title: "Índice de cadernos", type: "memorial", status: "gerado" },
      { id: "geral-revisoes", title: "Controle de revisões", type: "memorial", status: "pendente" },
    ];
  }

  return [
    { id: `${discipline}-planta`, title: "Planta baixa", type: "planta", status: "pendente" },
    { id: `${discipline}-frontal`, title: "Vista frontal", type: "vista", status: "pendente" },
    { id: `${discipline}-lateral`, title: "Vista lateral", type: "vista", status: "pendente" },
    { id: `${discipline}-memorial`, title: "Memorial descritivo", type: "memorial", status: "pendente" },
    { id: `${discipline}-quantitativos`, title: "Quantitativos", type: "quantitativo", status: "pendente" },
  ];
}
