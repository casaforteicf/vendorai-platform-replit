export type DisciplineBudgetLine = {
  id: string;
  title: string;
  description?: string;
  unit: string;
  quantity: number;
  materialCost: number;
  laborCost: number;
  marginPercent: number;
};

export type DisciplineBudgetConfig = {
  id: string;
  label: string;
  description: string;
  lines: DisciplineBudgetLine[];
};

export function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function lineSubtotal(line: DisciplineBudgetLine) {
  return line.quantity * (line.materialCost + line.laborCost);
}

export function lineTotal(line: DisciplineBudgetLine) {
  const subtotal = lineSubtotal(line);
  return subtotal + subtotal * (line.marginPercent / 100);
}

export function disciplineTotal(lines: DisciplineBudgetLine[]) {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

export const disciplineBudgets: DisciplineBudgetConfig[] = [
  {
    id: "marcenaria",
    label: "Marcenaria",
    description: "MDF, ferragens, módulos, montagem e acabamentos.",
    lines: [
      { id: "marc-01", title: "Módulos inferiores", unit: "m", quantity: 5.2, materialCost: 1250, laborCost: 420, marginPercent: 18 },
      { id: "marc-02", title: "Módulos superiores", unit: "m", quantity: 4.1, materialCost: 980, laborCost: 360, marginPercent: 18 },
      { id: "marc-03", title: "Ferragens e puxadores", unit: "vb", quantity: 1, materialCost: 3200, laborCost: 0, marginPercent: 15 },
    ],
  },
  {
    id: "gesso",
    label: "Gesso",
    description: "Forros, sancas, cortineiros, rasgos e perfis.",
    lines: [
      { id: "gesso-01", title: "Forro liso", unit: "m²", quantity: 42, materialCost: 68, laborCost: 77, marginPercent: 15 },
      { id: "gesso-02", title: "Cortineiro embutido", unit: "m", quantity: 6, materialCost: 85, laborCost: 95, marginPercent: 15 },
    ],
  },
  {
    id: "eletrica",
    label: "Elétrica",
    description: "Pontos, tomadas, interruptores, circuitos e instalação.",
    lines: [
      { id: "ele-01", title: "Pontos elétricos", unit: "un", quantity: 28, materialCost: 55, laborCost: 85, marginPercent: 12 },
      { id: "ele-02", title: "Interruptores e tomadas", unit: "un", quantity: 24, materialCost: 48, laborCost: 18, marginPercent: 12 },
    ],
  },
  {
    id: "hidraulica",
    label: "Hidráulica",
    description: "Pontos hidráulicos, louças, metais e instalação.",
    lines: [
      { id: "hid-01", title: "Pontos hidráulicos", unit: "un", quantity: 8, materialCost: 120, laborCost: 180, marginPercent: 12 },
      { id: "hid-02", title: "Instalação de metais", unit: "un", quantity: 6, materialCost: 0, laborCost: 140, marginPercent: 12 },
    ],
  },
  {
    id: "pintura",
    label: "Pintura",
    description: "Massa, fundo, tinta, acabamento e aplicação.",
    lines: [
      { id: "pint-01", title: "Pintura parede", unit: "m²", quantity: 120, materialCost: 14, laborCost: 24, marginPercent: 12 },
      { id: "pint-02", title: "Pintura teto", unit: "m²", quantity: 42, materialCost: 12, laborCost: 28, marginPercent: 12 },
    ],
  },
  {
    id: "marmoraria",
    label: "Marmoraria",
    description: "Bancadas, soleiras, peitoris, cubas e acabamentos.",
    lines: [
      { id: "marm-01", title: "Bancada cozinha", unit: "m²", quantity: 5.1, materialCost: 1350, laborCost: 380, marginPercent: 18 },
      { id: "marm-02", title: "Soleiras e peitoris", unit: "m", quantity: 8, materialCost: 180, laborCost: 65, marginPercent: 15 },
    ],
  },
  {
    id: "paisagismo",
    label: "Paisagismo",
    description: "Espécies, vasos, pedras, iluminação externa e implantação.",
    lines: [
      { id: "pais-01", title: "Espécies vegetais", unit: "vb", quantity: 1, materialCost: 3200, laborCost: 850, marginPercent: 18 },
      { id: "pais-02", title: "Pedras decorativas", unit: "m²", quantity: 18, materialCost: 95, laborCost: 45, marginPercent: 15 },
    ],
  },
  {
    id: "esquadrias",
    label: "Esquadrias",
    description: "Portas, janelas, vidros e persianas.",
    lines: [
      { id: "esq-01", title: "Janela PVC", unit: "un", quantity: 4, materialCost: 1850, laborCost: 220, marginPercent: 18 },
      { id: "esq-02", title: "Porta de correr", unit: "un", quantity: 1, materialCost: 4200, laborCost: 450, marginPercent: 18 },
    ],
  },
  {
    id: "mao_de_obra",
    label: "Mão de obra",
    description: "Serviços complementares e execução geral.",
    lines: [
      { id: "mao-01", title: "Coordenação de execução", unit: "vb", quantity: 1, materialCost: 0, laborCost: 4800, marginPercent: 20 },
    ],
  },
  {
    id: "frete",
    label: "Frete",
    description: "Entrega, deslocamento e logística.",
    lines: [
      { id: "frete-01", title: "Frete e logística", unit: "vb", quantity: 1, materialCost: 1200, laborCost: 0, marginPercent: 10 },
    ],
  },
];
