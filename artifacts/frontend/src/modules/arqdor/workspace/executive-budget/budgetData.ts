import type { BudgetDiscipline, BudgetItem } from "./BudgetContext";

export const budgetDisciplines: Array<{ id: BudgetDiscipline; label: string; description: string }> = [
  { id: "geral", label: "Geral", description: "Resumo executivo do orçamento." },
  { id: "marcenaria", label: "Marcenaria", description: "MDF, ferragens, módulos e montagem." },
  { id: "gesso", label: "Gesso", description: "Forros, sancas, rasgos e cortineiros." },
  { id: "marmoraria", label: "Marmoraria", description: "Bancadas, soleiras, peitoris e cubas." },
  { id: "iluminacao", label: "Iluminação", description: "Luminárias, fitas LED e acessórios." },
  { id: "eletrica", label: "Elétrica", description: "Pontos, tomadas, interruptores e quadro." },
  { id: "hidraulica", label: "Hidráulica", description: "Pontos, tubulações, louças e metais." },
  { id: "pintura", label: "Pintura", description: "Tintas, massas, acabamentos e mão de obra." },
  { id: "paisagismo", label: "Paisagismo", description: "Espécies, vasos, pedras e implantação." },
  { id: "esquadrias", label: "Esquadrias", description: "Portas, janelas, vidros e persianas." },
  { id: "mao_de_obra", label: "Mão de obra", description: "Serviços gerais e execução." },
  { id: "frete", label: "Frete", description: "Entrega, logística e deslocamentos." },
];

export function createDefaultBudgetItems(): BudgetItem[] {
  return [
    {
      id: "marc-001",
      discipline: "marcenaria",
      title: "Marcenaria planejada",
      description: "Estimativa inicial para móveis sob medida.",
      unit: "vb",
      quantity: 1,
      unitCost: 18500,
      marginPercent: 18,
      status: "estimado",
    },
    {
      id: "gesso-001",
      discipline: "gesso",
      title: "Forro de gesso",
      description: "Forro, cortineiro e rasgos lineares.",
      unit: "m²",
      quantity: 42,
      unitCost: 145,
      marginPercent: 15,
      status: "a_revisar",
    },
    {
      id: "ilum-001",
      discipline: "iluminacao",
      title: "Iluminação decorativa",
      description: "Spots, perfis e fitas LED.",
      unit: "vb",
      quantity: 1,
      unitCost: 6200,
      marginPercent: 20,
      status: "estimado",
    },
    {
      id: "pint-001",
      discipline: "pintura",
      title: "Pintura interna",
      description: "Paredes e teto com acabamento premium.",
      unit: "m²",
      quantity: 120,
      unitCost: 38,
      marginPercent: 12,
      status: "estimado",
    },
  ];
}

export function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function calculateItemSubtotal(item: BudgetItem) {
  return item.quantity * item.unitCost;
}

export function calculateItemTotal(item: BudgetItem) {
  const subtotal = calculateItemSubtotal(item);
  return subtotal + subtotal * (item.marginPercent / 100);
}
