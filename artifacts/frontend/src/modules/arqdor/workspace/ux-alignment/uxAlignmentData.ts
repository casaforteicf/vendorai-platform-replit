export type ProjectScore = {
  label: string;
  value: number;
  status: "ok" | "attention" | "critical";
};

export const projectScores: ProjectScore[] = [
  { label: "Briefing", value: 92, status: "ok" },
  { label: "Design", value: 86, status: "ok" },
  { label: "Materiais", value: 68, status: "attention" },
  { label: "Orçamento", value: 42, status: "attention" },
  { label: "Produção", value: 25, status: "critical" },
];

export const aiInsights = [
  {
    id: "lighting",
    title: "Iluminação pode melhorar",
    description: "A sala possui boa iluminação natural, mas falta luz indireta para cenas noturnas.",
    impact: "Qualidade +12%",
  },
  {
    id: "budget",
    title: "Economia possível",
    description: "Trocar o tecido da poltrona pode reduzir custo sem comprometer o conceito.",
    impact: "Economia estimada R$ 1.850",
  },
  {
    id: "production",
    title: "Produção ainda incompleta",
    description: "Marcenaria e marmoraria ainda não possuem fornecedor selecionado.",
    impact: "Pendência de execução",
  },
];

export const storyTimeline = [
  { id: "v01", title: "Conceito inicial", description: "Primeira composição visual aprovada internamente." },
  { id: "v02", title: "Cliente pediu layout mais leve", description: "Sofá e poltronas foram reposicionados." },
  { id: "v03", title: "IA ajustou materiais", description: "Madeira e pedra foram equilibradas para reduzir peso visual." },
  { id: "v04", title: "Prévia de iluminação", description: "Incluída iluminação indireta no painel e teto." },
  { id: "v05", title: "Versão atual", description: "Pronta para especificação e orçamento executivo." },
];

export const selectedObject = {
  id: "poltrona-lisboa",
  name: "Poltrona Lisboa",
  supplier: "Estofados Casa",
  price: "R$ 3.850",
  deadline: "18 dias",
  compatibility: 92,
  material: "Tecido Linho Bege",
  aiRecommendation: "Manter modelo, revisar tecido para reduzir custo e melhorar durabilidade.",
};
