import type { ProductionDiscipline } from "./ProductionStudioContext";

export type Supplier = {
  id: string;
  name: string;
  type: "local" | "manufacturer";
  discipline: ProductionDiscipline;
  compatibility: number;
  estimatedCost: string;
  estimatedDeadline: string;
  status: "ready" | "needs_review" | "future";
};

export const disciplines: Array<{ id: ProductionDiscipline; label: string; description: string }> = [
  { id: "marcenaria", label: "Marcenaria", description: "Módulos, MDF, ferragens, puxadores e produção." },
  { id: "gesso", label: "Gesso", description: "Forros, sancas, cortineiros, rasgos e perfis." },
  { id: "marmoraria", label: "Marmoraria", description: "Bancadas, soleiras, peitoris e acabamentos." },
  { id: "iluminacao", label: "Iluminação", description: "Luminárias, cenas, temperatura e fornecedores." },
  { id: "pintura", label: "Pintura", description: "Cores, áreas, acabamento e consumo estimado." },
  { id: "paisagismo", label: "Paisagismo", description: "Espécies, vasos, pedras, iluminação e irrigação." },
  { id: "esquadrias", label: "Esquadrias", description: "Portas, janelas, vidros, persianas e PVC." },
];

export const suppliers: Supplier[] = [
  { id: "local-wood-01", name: "Marceneiro Local", type: "local", discipline: "marcenaria", compatibility: 82, estimatedCost: "A cotar", estimatedDeadline: "A definir", status: "ready" },
  { id: "evviva", name: "Evviva", type: "manufacturer", discipline: "marcenaria", compatibility: 94, estimatedCost: "$$$$", estimatedDeadline: "45 dias", status: "future" },
  { id: "bertolini", name: "Bertolini", type: "manufacturer", discipline: "marcenaria", compatibility: 91, estimatedCost: "$$$", estimatedDeadline: "35 dias", status: "future" },
  { id: "gesso-local", name: "Gesseiro Local", type: "local", discipline: "gesso", compatibility: 88, estimatedCost: "A cotar", estimatedDeadline: "A definir", status: "ready" },
  { id: "marmoraria-local", name: "Marmoraria Local", type: "local", discipline: "marmoraria", compatibility: 86, estimatedCost: "A cotar", estimatedDeadline: "A definir", status: "ready" },
  { id: "pintor-local", name: "Pintor Local", type: "local", discipline: "pintura", compatibility: 90, estimatedCost: "A cotar", estimatedDeadline: "A definir", status: "ready" },
];

export function getSuppliersByDiscipline(discipline: ProductionDiscipline) {
  return suppliers.filter((supplier) => supplier.discipline === discipline);
}

export function buildCompatibilityNotes(supplier?: Supplier | null) {
  if (!supplier) return ["Selecione um fornecedor ou fabricante para iniciar a compatibilização."];

  if (supplier.type === "local") {
    return [
      "Documentação neutra para execução por prestador local.",
      "Gerar pacote técnico com planta, vistas, medidas e memorial.",
      "Quantitativos precisam ser conferidos antes do orçamento final.",
    ];
  }

  return [
    "Converter projeto para modulação oficial do fabricante.",
    "Ajustes serão exibidos antes da aplicação.",
    "Compatibilização não altera o conceito sem aprovação do arquiteto.",
  ];
}
