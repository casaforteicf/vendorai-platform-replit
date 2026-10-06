export const LEAD_SOURCE_OPTIONS = [
  { value: "manual", label: "Cadastro manual" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "email", label: "E-mail" },
  { value: "site", label: "Site / formulário" },
  { value: "anuncio", label: "Anúncio" },
  { value: "indicacao", label: "Indicação" },
  { value: "prospeccao", label: "Prospecção" },
  { value: "pedido_importado", label: "Pedido / orçamento importado" },
  { value: "outro", label: "Outro" },
] as const;

export const LEAD_REGISTRATION_CORE_FIELDS = [
  "nome",
  "telefone",
  "email",
  "empresa",
  "documento",
  "endereco",
  "mercadoSegmento",
  "instagramHandle",
  "profissao",
  "objetivo",
  "source",
  "assignedTo",
] as const;

/**
 * Padrão único do CRM: toda porta de entrada deve alimentar o mesmo cadastro
 * canônico. As telas podem mostrar menos campos inicialmente, mas não devem
 * manter modelos de dados concorrentes.
 */
export const LEAD_REGISTRATION_STANDARD_VERSION = "2026-10";
