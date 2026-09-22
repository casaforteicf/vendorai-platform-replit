export type LeadFormFieldType = "text" | "email" | "phone" | "textarea" | "select" | "number";

export type LeadFormField = {
  key: string;
  label: string;
  type: LeadFormFieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
};

export type LeadFormTemplate = {
  id: string;
  name: string;
  description: string;
  objectives: Array<"whatsapp" | "lead" | "sale" | "visit" | "awareness">;
  recommendedFor: string[];
  submitLabel: string;
  pipelineStage: "em_aquecimento" | "qualificado" | "proposta";
  fields: LeadFormField[];
};

export const LEAD_FORM_TEMPLATES: LeadFormTemplate[] = [
  {
    id: "contato_rapido",
    name: "Contato rápido",
    description: "Baixo atrito para campanhas de descoberta e primeiro contato.",
    objectives: ["lead", "awareness"],
    recommendedFor: ["institucional", "varejo", "serviços", "campanhas amplas"],
    submitLabel: "Quero falar com a empresa",
    pipelineStage: "em_aquecimento",
    fields: [
      { key: "nome", label: "Nome", type: "text", required: true },
      { key: "telefone", label: "WhatsApp", type: "phone", required: true },
      { key: "email", label: "E-mail", type: "email" },
      { key: "mensagem", label: "Como podemos ajudar?", type: "textarea" },
    ],
  },
  {
    id: "solicitar_orcamento",
    name: "Solicitar orçamento",
    description: "Captura intenção comercial e dados mínimos para preparar orçamento.",
    objectives: ["lead", "sale"],
    recommendedFor: ["construção", "arquitetura", "móveis planejados", "serviços", "indústria"],
    submitLabel: "Solicitar orçamento",
    pipelineStage: "qualificado",
    fields: [
      { key: "nome", label: "Nome", type: "text", required: true },
      { key: "telefone", label: "WhatsApp", type: "phone", required: true },
      { key: "email", label: "E-mail", type: "email" },
      { key: "empresa", label: "Empresa", type: "text" },
      { key: "produtos", label: "Produto ou serviço de interesse", type: "text", required: true },
      { key: "orcamento", label: "Faixa de investimento", type: "select", options: ["Até R$ 5 mil", "R$ 5 a 20 mil", "R$ 20 a 50 mil", "R$ 50 a 100 mil", "Acima de R$ 100 mil"] },
      { key: "urgencia", label: "Quando pretende contratar?", type: "select", options: ["Agora", "Até 30 dias", "1 a 3 meses", "Mais de 3 meses"] },
      { key: "desafioPrincipal", label: "Descreva o que precisa", type: "textarea" },
    ],
  },
  {
    id: "agendar_atendimento",
    name: "Agendar atendimento",
    description: "Ideal para campanhas cujo próximo passo é conversa, visita ou demonstração.",
    objectives: ["visit", "lead"],
    recommendedFor: ["clínicas", "seguros", "arquitetura", "consultoria", "serviços"],
    submitLabel: "Quero agendar",
    pipelineStage: "qualificado",
    fields: [
      { key: "nome", label: "Nome", type: "text", required: true },
      { key: "telefone", label: "WhatsApp", type: "phone", required: true },
      { key: "email", label: "E-mail", type: "email" },
      { key: "urgencia", label: "Melhor período", type: "select", options: ["Manhã", "Tarde", "Noite"] },
      { key: "mensagem", label: "Observações", type: "textarea" },
    ],
  },
  {
    id: "produto_interesse",
    name: "Interesse em produto",
    description: "Para produto, estoque, veículo ou item específico.",
    objectives: ["sale", "lead", "whatsapp"],
    recommendedFor: ["varejo", "veículos", "imóveis", "distribuidoras", "e-commerce"],
    submitLabel: "Tenho interesse",
    pipelineStage: "qualificado",
    fields: [
      { key: "nome", label: "Nome", type: "text", required: true },
      { key: "telefone", label: "WhatsApp", type: "phone", required: true },
      { key: "email", label: "E-mail", type: "email" },
      { key: "produtos", label: "Produto de interesse", type: "text", required: true },
      { key: "orcamento", label: "Faixa de investimento", type: "text" },
      { key: "mensagem", label: "Dúvida ou condição desejada", type: "textarea" },
    ],
  },
  {
    id: "pre_projeto",
    name: "Pré-projeto / briefing",
    description: "Capta informações suficientes para iniciar um pré-projeto ou estudo.",
    objectives: ["lead", "sale"],
    recommendedFor: ["construtoras", "arquitetura", "design", "móveis planejados"],
    submitLabel: "Enviar briefing",
    pipelineStage: "qualificado",
    fields: [
      { key: "nome", label: "Nome", type: "text", required: true },
      { key: "telefone", label: "WhatsApp", type: "phone", required: true },
      { key: "email", label: "E-mail", type: "email" },
      { key: "segmento", label: "Tipo de projeto", type: "select", options: ["Casa", "Apartamento", "Comercial", "Interiores", "Reforma", "Outro"] },
      { key: "produtos", label: "Ambientes ou serviços desejados", type: "textarea" },
      { key: "orcamento", label: "Investimento previsto", type: "text" },
      { key: "urgencia", label: "Prazo desejado", type: "text" },
      { key: "desafioPrincipal", label: "Conte um pouco sobre o projeto", type: "textarea", required: true },
    ],
  },
  {
    id: "simulacao",
    name: "Simulação",
    description: "Para campanhas de preço, economia, financiamento, seguro ou comparação.",
    objectives: ["lead", "sale"],
    recommendedFor: ["seguros", "finanças", "construção", "energia", "serviços recorrentes"],
    submitLabel: "Fazer simulação",
    pipelineStage: "qualificado",
    fields: [
      { key: "nome", label: "Nome", type: "text", required: true },
      { key: "telefone", label: "WhatsApp", type: "phone", required: true },
      { key: "email", label: "E-mail", type: "email" },
      { key: "produtos", label: "O que deseja simular?", type: "text", required: true },
      { key: "orcamento", label: "Valor ou faixa aproximada", type: "text" },
      { key: "mensagem", label: "Informações adicionais", type: "textarea" },
    ],
  },
  {
    id: "captura_material",
    name: "Baixar material",
    description: "Captação leve para conteúdo rico, catálogo, tabela ou guia.",
    objectives: ["awareness", "lead"],
    recommendedFor: ["topo de funil", "catálogo", "ebook", "guia", "tabela"],
    submitLabel: "Receber material",
    pipelineStage: "em_aquecimento",
    fields: [
      { key: "nome", label: "Nome", type: "text", required: true },
      { key: "email", label: "E-mail", type: "email", required: true },
      { key: "telefone", label: "WhatsApp", type: "phone" },
      { key: "empresa", label: "Empresa", type: "text" },
    ],
  },
  {
    id: "reserva_compra",
    name: "Comprar / reservar",
    description: "Alta intenção para item disponível, reserva ou fechamento comercial.",
    objectives: ["sale"],
    recommendedFor: ["veículos", "imóveis", "varejo", "estoque limitado", "eventos"],
    submitLabel: "Quero reservar",
    pipelineStage: "proposta",
    fields: [
      { key: "nome", label: "Nome", type: "text", required: true },
      { key: "telefone", label: "WhatsApp", type: "phone", required: true },
      { key: "email", label: "E-mail", type: "email" },
      { key: "produtos", label: "Item", type: "text", required: true },
      { key: "orcamento", label: "Condição / entrada disponível", type: "text" },
      { key: "mensagem", label: "Observações", type: "textarea" },
    ],
  },
];

export function getLeadFormTemplate(id?: string | null) {
  return LEAD_FORM_TEMPLATES.find((template) => template.id === id) ?? null;
}

export function recommendLeadFormTemplate(objective?: string | null, itemType?: string | null) {
  if (itemType === "veiculo" || itemType === "imovel" || itemType === "produto") {
    return objective === "sale"
      ? getLeadFormTemplate("reserva_compra")
      : getLeadFormTemplate("produto_interesse");
  }
  if (objective === "visit") return getLeadFormTemplate("agendar_atendimento");
  if (objective === "sale") return getLeadFormTemplate("solicitar_orcamento");
  if (objective === "awareness") return getLeadFormTemplate("captura_material");
  return getLeadFormTemplate("contato_rapido");
}
