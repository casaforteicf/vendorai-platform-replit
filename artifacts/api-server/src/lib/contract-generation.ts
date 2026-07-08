import { logger } from "./logger.js";

export interface ContractData {
  dealTitulo: string;
  dealValor: string;
  clienteNome: string;
  clienteEmail: string;
  clienteTelefone: string;
  clienteDocumento?: string;
  clienteEmpresa?: string;
  tenantNome: string;
  dataHoje: string;
  produtosServicos: string;
  partnerName?: string;
  partnerEmail?: string;
  pedidosHtml?: string;
  // ── VendorAI SaaS contract extended fields ──────────────────────────────────
  clienteRazaoSocial?: string;
  clienteEndereco?: string;
  representanteNome?: string;
  representanteCargo?: string;
  representanteNacionalidade?: string;
  representanteEstadoCivil?: string;
  representanteProfissao?: string;
  representanteRg?: string;
  representanteLegalCompleto?: string;
  valorMensalFormatado?: string;
  valorExtenso?: string;
  dataExtensoPTBR?: string;
  // settings-driven
  marcosEstadoCivil?: string;
  diaVencimento?: string;
  indiceReajuste?: string;
  slaInicioHoras?: string;
  slaCriticoHoras?: string;
  slaAltoHoras?: string;
  slaMedioHoras?: string;
  diaLimiteBloqueio?: string;
  prazoQuarentena?: string;
  taxaReativacao?: string;
  vigenciaContrato?: string;
  multaCancelamento?: string;
  localAssinatura?: string;
  finalidadeSistema?: string;
  backupRetencaoDias?: string;
  provedorInfra?: string;
  regiaoDatacenter?: string;
  servicoEmail?: string;
  dpoNome?: string;
  dpoEmail?: string;
  dpoTelefone?: string;
  clienteDpoNome?: string;
}

// ─── Default contract settings ────────────────────────────────────────────────

export const DEFAULT_CONTRACT_SETTINGS: ContractSettings = {
  marcosEstadoCivil: "casado",
  diaVencimento: "10",
  indiceReajuste: "IPCA/IBGE",
  slaInicioHoras: "4",
  slaCriticoHoras: "8",
  slaAltoHoras: "24",
  slaMedioHoras: "72",
  diaLimiteBloqueio: "5º (quinto) dia útil",
  prazoQuarentena: "30 (trinta)",
  taxaReativacao: "R$ 250,00",
  vigenciaContrato: "12 (doze) meses",
  multaCancelamento: "30% (trinta por cento)",
  localAssinatura: "Florianópolis/SC",
  finalidadeSistema: "Gestão comercial com inteligência artificial — CRM, SDR, geração de leads e automação de mensagens",
  backupRetencaoDias: "30",
  provedorInfra: "Supabase (PostgreSQL gerenciado)",
  regiaoDatacenter: "Brasil (São Paulo)",
  servicoEmail: "Resend",
  dpoNome: "Marcos Paulo Reisdorfer",
  dpoEmail: "dpo@vendorai.com.br",
  dpoTelefone: "",
};

export interface ContractSettings {
  marcosEstadoCivil: string;
  diaVencimento: string;
  indiceReajuste: string;
  slaInicioHoras: string;
  slaCriticoHoras: string;
  slaAltoHoras: string;
  slaMedioHoras: string;
  diaLimiteBloqueio: string;
  prazoQuarentena: string;
  taxaReativacao: string;
  vigenciaContrato: string;
  multaCancelamento: string;
  localAssinatura: string;
  finalidadeSistema: string;
  backupRetencaoDias: string;
  provedorInfra: string;
  regiaoDatacenter: string;
  servicoEmail: string;
  dpoNome: string;
  dpoEmail: string;
  dpoTelefone: string;
}

// ─── Number to words (Brazilian Portuguese, monetary) ─────────────────────────

const ONES = [
  "", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
  "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete",
  "dezoito", "dezenove",
];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
  "seiscentos", "setecentos", "oitocentos", "novecentos",
];
const SPECIAL_HUNDREDS = { 100: "cem" } as Record<number, string>;

function threeDigits(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const hundredPart = h > 0 ? HUNDREDS[h] : "";
  let restPart = "";
  if (rest > 0) {
    if (rest < 20) {
      restPart = ONES[rest];
    } else {
      const t = Math.floor(rest / 10);
      const o = rest % 10;
      restPart = TENS[t] + (o > 0 ? ` e ${ONES[o]}` : "");
    }
  }
  if (hundredPart && restPart) return `${hundredPart} e ${restPart}`;
  return hundredPart || restPart;
}

export function numberToWordsPTBR(value: number): string {
  if (value === 0) return "zero reais";
  const intPart = Math.floor(value);
  const centsPart = Math.round((value - intPart) * 100);

  function integerToWords(n: number): string {
    if (n === 0) return "zero";
    if (n < 1000) return threeDigits(n);
    if (n < 1_000_000) {
      const thousands = Math.floor(n / 1000);
      const rem = n % 1000;
      const thousandWord = thousands === 1 ? "mil" : `${threeDigits(thousands)} mil`;
      return rem > 0 ? `${thousandWord} e ${threeDigits(rem)}` : thousandWord;
    }
    if (n < 1_000_000_000) {
      const millions = Math.floor(n / 1_000_000);
      const rem = n % 1_000_000;
      const milWord = millions === 1 ? "um milhão" : `${threeDigits(millions)} milhões`;
      return rem > 0 ? `${milWord} e ${integerToWords(rem)}` : milWord;
    }
    return String(n);
  }

  const reaisWord = intPart === 1 ? "real" : "reais";
  const centavosWord = centsPart === 1 ? "centavo" : "centavos";

  if (intPart === 0) return `${integerToWords(centsPart)} ${centavosWord}`;
  if (centsPart === 0) return `${integerToWords(intPart)} ${reaisWord}`;
  return `${integerToWords(intPart)} ${reaisWord} e ${integerToWords(centsPart)} ${centavosWord}`;
}

// ─── Date formatting (extended Portuguese) ───────────────────────────────────

export function dateToExtensoPTBR(date: Date = new Date()): string {
  return date.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ─── Default HTML template ────────────────────────────────────────────────────

function buildContractHtml(data: ContractData, isThreeParty: boolean): string {
  const partes = isThreeParty
    ? `<p><strong>CONTRATADA:</strong> ${data.tenantNome}, representada por seu representante legal.</p>
       <p><strong>PARCEIRO:</strong> ${data.partnerName ?? "Parceiro"}, ${data.partnerEmail ? `e-mail: ${data.partnerEmail}` : ""}.</p>
       <p><strong>CONTRATANTE:</strong> ${data.clienteNome}, ${data.clienteDocumento ? `CPF/CNPJ: ${data.clienteDocumento},` : ""} e-mail: ${data.clienteEmail}, telefone: ${data.clienteTelefone}.</p>`
    : `<p><strong>CONTRATADA:</strong> ${data.tenantNome}, representada por seu representante legal.</p>
       <p><strong>CONTRATANTE:</strong> ${data.clienteNome}, ${data.clienteDocumento ? `CPF/CNPJ: ${data.clienteDocumento},` : ""} e-mail: ${data.clienteEmail}, telefone: ${data.clienteTelefone}.</p>`;

  const pedidosSection = data.pedidosHtml
    ? `<h2>1. Objeto / Pedidos</h2>
       <p>O presente contrato abrange os seguintes serviços/produtos:</p>
       ${data.pedidosHtml}`
    : `<h2>1. Objeto</h2>
       <p>O presente contrato tem como objeto a prestação dos seguintes serviços/produtos:</p>
       <p><strong>${data.produtosServicos}</strong></p>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Contrato ${data.dealTitulo}</title>
<style>
  body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 40px; color: #333; }
  h1 { text-align: center; font-size: 22px; margin-bottom: 8px; }
  h2 { font-size: 16px; margin-top: 24px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .header { text-align: center; margin-bottom: 32px; }
  .partes { background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0; }
  .partes p { margin: 6px 0; }
  .valor { font-size: 18px; font-weight: bold; color: #2563eb; }
  .data { text-align: right; margin-top: 40px; font-size: 14px; color: #666; }
  .assinaturas { margin-top: 60px; display: flex; justify-content: space-between; gap: 24px; }
  .assinatura { flex: 1; text-align: center; border-top: 1px solid #333; padding-top: 8px; }
</style>
</head>
<body>
  <div class="header">
    <h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
    <p style="font-size:14px;color:#666;">Ref: ${data.dealTitulo}</p>
  </div>

  <div class="partes">
    ${partes}
  </div>

  ${pedidosSection}

  <h2>2. Valor</h2>
  <p class="valor">${data.dealValor}</p>
  <p>Valor total do negócio, conforme proposta aceita.</p>

  <h2>3. Prazo e Vigência</h2>
  <p>O contrato entra em vigor na data de assinatura e terá vigência conforme especificado na proposta comercial.</p>

  <h2>4. Assinatura Eletrônica</h2>
  <p>As partes declaram que este contrato será assinado eletronicamente via ZapSign, conforme Lei 14.063/2020.</p>

  <div class="data">
    <p>${data.dataHoje}</p>
  </div>

  <div class="assinaturas">
    <div class="assinatura">
      <p><strong>Contratada</strong><br/>${data.tenantNome}</p>
    </div>
    ${isThreeParty ? `<div class="assinatura"><p><strong>Parceiro</strong><br/>${data.partnerName ?? ""}</p></div>` : ""}
    <div class="assinatura">
      <p><strong>Contratante</strong><br/>${data.clienteNome}</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Custom template: variable interpolation ──────────────────────────────────

export function interpolateTemplate(templateHtml: string, data: ContractData): string {
  const vars: Record<string, string> = {
    // legacy variables (backward compat)
    cliente_nome: data.clienteNome,
    cliente_email: data.clienteEmail,
    cliente_telefone: data.clienteTelefone,
    cliente_cpf_cnpj: data.clienteDocumento ?? "",
    cliente_empresa: data.clienteEmpresa ?? "",
    deal_titulo: data.dealTitulo,
    deal_valor: data.dealValor,
    empresa_nome: data.tenantNome,
    data_hoje: data.dataHoje,
    produtos_servicos: data.produtosServicos,
    parceiro_nome: data.partnerName ?? "",
    parceiro_email: data.partnerEmail ?? "",
    pedidos_lista: data.pedidosHtml ?? "",
    // ── extended SaaS contract variables ──────────────────────────────────────
    cliente_razao_social: data.clienteRazaoSocial ?? data.clienteEmpresa ?? data.clienteNome,
    cliente_cnpj: data.clienteDocumento ?? "",
    cliente_endereco: data.clienteEndereco ?? "",
    representante_nome: data.representanteNome ?? data.clienteNome,
    representante_cargo: data.representanteCargo ?? "Representante Legal",
    representante_nacionalidade: data.representanteNacionalidade ?? "",
    representante_estado_civil: data.representanteEstadoCivil ?? "",
    representante_profissao: data.representanteProfissao ?? "",
    representante_rg: data.representanteRg ?? "",
    representante_legal_completo: data.representanteLegalCompleto ?? data.clienteNome,
    valor_mensal: data.valorMensalFormatado ?? data.dealValor,
    valor_extenso: data.valorExtenso ?? "",
    data_extenso: data.dataExtensoPTBR ?? data.dataHoje,
    marcos_estado_civil: data.marcosEstadoCivil ?? "casado",
    dia_vencimento: data.diaVencimento ?? "10",
    indice_reajuste: data.indiceReajuste ?? "IPCA/IBGE",
    sla_inicio_horas: data.slaInicioHoras ?? "4",
    sla_critico_horas: data.slaCriticoHoras ?? "8",
    sla_alto_horas: data.slaAltoHoras ?? "24",
    sla_medio_horas: data.slaMedioHoras ?? "72",
    dia_limite_bloqueio: data.diaLimiteBloqueio ?? "5º dia útil",
    prazo_quarentena: data.prazoQuarentena ?? "30 (trinta)",
    taxa_reativacao: data.taxaReativacao ?? "R$ 250,00",
    vigencia_contrato: data.vigenciaContrato ?? "12 (doze) meses",
    multa_cancelamento: data.multaCancelamento ?? "30% (trinta por cento)",
    local_assinatura: data.localAssinatura ?? "Florianópolis/SC",
    finalidade_sistema: data.finalidadeSistema ?? "Gestão comercial com inteligência artificial",
    backup_retencao_dias: data.backupRetencaoDias ?? "30",
    provedor_infra: data.provedorInfra ?? "Supabase",
    regiao_datacenter: data.regiaoDatacenter ?? "Brasil (São Paulo)",
    servico_email: data.servicoEmail ?? "Resend",
    dpo_nome: data.dpoNome ?? "",
    dpo_email: data.dpoEmail ?? "",
    dpo_telefone: data.dpoTelefone ?? "",
    cliente_dpo_nome: data.clienteDpoNome ?? data.representanteNome ?? data.clienteNome,
  };

  return templateHtml.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return key in vars ? vars[key] : `{{${key}}}`;
  });
}

// ─── PDF renderer (shared) ────────────────────────────────────────────────────

async function renderHtmlToPdf(html: string): Promise<Buffer> {
  try {
    const puppeteer = (await import("puppeteer-core")).default;
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? "/usr/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" },
    });
    await browser.close();
    return Buffer.from(pdf);
  } catch (err) {
    logger.warn({ err }, "contract-generation: puppeteer failed, falling back to HTML buffer");
    return Buffer.from(html, "utf-8");
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateContractPDF(data: ContractData, isThreeParty: boolean): Promise<Buffer> {
  const html = buildContractHtml(data, isThreeParty);
  return renderHtmlToPdf(html);
}

export async function generateContractFromTemplate(templateHtml: string, data: ContractData): Promise<Buffer> {
  const html = interpolateTemplate(templateHtml, data);
  return renderHtmlToPdf(html);
}

export const CONTRACT_VARIABLES = [
  { variable: "{{cliente_nome}}", label: "Nome do cliente" },
  { variable: "{{cliente_email}}", label: "E-mail do cliente" },
  { variable: "{{cliente_telefone}}", label: "Telefone do cliente" },
  { variable: "{{cliente_cpf_cnpj}}", label: "CPF/CNPJ do cliente" },
  { variable: "{{cliente_empresa}}", label: "Empresa do cliente" },
  { variable: "{{deal_titulo}}", label: "Título do negócio" },
  { variable: "{{deal_valor}}", label: "Valor total (formatado)" },
  { variable: "{{empresa_nome}}", label: "Nome da sua empresa" },
  { variable: "{{data_hoje}}", label: "Data de hoje" },
  { variable: "{{produtos_servicos}}", label: "Produtos/serviços (resumo)" },
  { variable: "{{pedidos_lista}}", label: "Tabela de pedidos selecionados" },
  { variable: "{{parceiro_nome}}", label: "Nome do parceiro (se houver)" },
  // SaaS contract extended
  { variable: "{{cliente_razao_social}}", label: "Razão social do cliente" },
  { variable: "{{cliente_cnpj}}", label: "CNPJ do cliente" },
  { variable: "{{cliente_endereco}}", label: "Endereço completo do cliente" },
  { variable: "{{representante_nome}}", label: "Nome do representante legal" },
  { variable: "{{representante_cargo}}", label: "Cargo do representante" },
  { variable: "{{representante_nacionalidade}}", label: "Nacionalidade do representante" },
  { variable: "{{representante_estado_civil}}", label: "Estado civil do representante" },
  { variable: "{{representante_profissao}}", label: "Profissão do representante" },
  { variable: "{{representante_rg}}", label: "RG do representante" },
  { variable: "{{representante_legal_completo}}", label: "Qualificação completa do representante" },
  { variable: "{{valor_mensal}}", label: "Valor mensal formatado" },
  { variable: "{{valor_extenso}}", label: "Valor mensal por extenso" },
  { variable: "{{data_extenso}}", label: "Data por extenso" },
  { variable: "{{dia_vencimento}}", label: "Dia de vencimento" },
  { variable: "{{indice_reajuste}}", label: "Índice de reajuste" },
  { variable: "{{sla_inicio_horas}}", label: "SLA — início do atendimento (horas)" },
  { variable: "{{sla_critico_horas}}", label: "SLA — resolução crítica (horas)" },
  { variable: "{{sla_alto_horas}}", label: "SLA — resolução alta (horas)" },
  { variable: "{{sla_medio_horas}}", label: "SLA — resolução média/baixa (horas)" },
  { variable: "{{dia_limite_bloqueio}}", label: "Dia limite para bloqueio automático" },
  { variable: "{{taxa_reativacao}}", label: "Taxa de reativação" },
  { variable: "{{vigencia_contrato}}", label: "Vigência do contrato" },
  { variable: "{{multa_cancelamento}}", label: "Multa por cancelamento antecipado" },
  { variable: "{{local_assinatura}}", label: "Local de assinatura" },
  { variable: "{{dpo_nome}}", label: "Nome do DPO (Encarregado de Dados)" },
  { variable: "{{dpo_email}}", label: "E-mail do DPO" },
];
