import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Box,
  CircleDollarSign,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Search,
  Sparkles,
  Upload,
  Video,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type ProductSpec = { label: string; value: string };
type InteligenciaComercialProduto = {
  caracteristicas?: string[];
  diferenciais?: string[];
  beneficios?: string[];
  doresAtendidas?: string[];
  casosUso?: string[];
  personas?: string[];
  objecoes?: Array<{ objecao: string; resposta?: string; idsProvas?: string[] }>;
  idsProvas?: string[];
  idsProdutosComplementares?: string[];
  afirmacoesPermitidas?: string[];
  afirmacoesProibidas?: string[];
  notasComerciais?: string[];
  duvidasFrequentes?: string[];
  garantia?: string | null;
  instalacaoUso?: string | null;
  entregaPrazo?: string | null;
  orientacoesIa?: string[];
  aprovadoEm?: string | null;
  aprovadoPor?: string | null;
  origem?: "manual" | "sugerido_ia" | "importado" | "misto";
};
type MediaAsset = {
  id: string;
  type: "image" | "video" | "audio" | "document";
  storageUrl: string;
  originalFilename?: string | null;
  metadata?: Record<string, unknown> | null;
};
type CatalogProduct = {
  id: string;
  nome: string;
  sku?: string | null;
  marca?: string | null;
  categoriaNome?: string | null;
  descricao?: string | null;
  descricaoLonga?: string | null;
  precoBase?: string | null;
  precoImplantacao?: string | null;
  precoMensalidade?: string | null;
  precoPromocional?: string | null;
  promocaoAtivaAte?: string | null;
  precoPracaAi?: string | null;
  descontoMaximoPercentual?: string | null;
  categoriaDescontoMaximoPercentual?: string | null;
  recorrencia?: string | null;
  unidade?: string | null;
  prazoEntregaDias?: number | null;
  ativo: boolean;
  vendeNoPracaAi?: boolean | null;
  imagemUrl?: string | null;
  imagens?: string[] | null;
  videoUrl?: string | null;
  tags?: string[] | null;
  especificacoes?: ProductSpec[] | null;
  inteligenciaComercial?: InteligenciaComercialProduto | null;
};
type ProductForm = {
  descricaoCompleta: string;
  caracteristicas: string;
  beneficios: string;
  diferenciais: string;
  doresAtendidas: string;
  aplicacoes: string;
  publicoIndicado: string;
  argumentosComerciais: string;
  afirmacoesPermitidas: string;
  duvidasFrequentes: string;
  objecoesRespostas: string;
  garantia: string;
  instalacao: string;
  entrega: string;
  observacoesIa: string;
  afirmacoesProibidas: string;
  condicoesPagamento: string;
  tags: string;
  aiEnabled: boolean;
};
type TextFieldKey = Exclude<keyof ProductForm, "descricaoCompleta" | "condicoesPagamento" | "tags" | "aiEnabled">;
type KnowledgeField = { key: TextFieldKey; label: string; aliases: string[]; placeholder: string; rows?: number };
type PriceRow = { label: string; value: string; hint?: string };

const KNOWLEDGE_MARKER = "--- Base IA do produto ---";
const FIELD_SPECS: KnowledgeField[] = [
  { key: "caracteristicas", label: "Características", aliases: ["Características", "Caracteristicas", "Detalhes técnicos", "Detalhes tecnicos"], placeholder: "Características, materiais, medidas, composição ou detalhes técnicos relevantes." },
  { key: "beneficios", label: "Benefícios", aliases: ["Benefícios", "Benefício", "Beneficios", "Beneficio", "Vantagens"], placeholder: "Quais benefícios o cliente obtém com este produto?" },
  { key: "diferenciais", label: "Diferenciais", aliases: ["Diferenciais", "Diferencial"], placeholder: "O que diferencia este produto de alternativas e concorrentes?" },
  { key: "doresAtendidas", label: "Dores que resolve", aliases: ["Dores que resolve", "Dores atendidas", "Problemas que resolve", "Necessidades atendidas"], placeholder: "Quais dores, problemas ou necessidades reais este produto ajuda a resolver?" },
  { key: "aplicacoes", label: "Aplicações", aliases: ["Aplicações", "Aplicação", "Aplicacoes", "Aplicacao", "Uso", "Usos"], placeholder: "Onde, como e em quais situações o produto pode ser utilizado?" },
  { key: "publicoIndicado", label: "Público / cliente indicado", aliases: ["Público / cliente indicado", "Público indicado", "Publico indicado", "Público", "Publico", "Cliente indicado"], placeholder: "Para quem este produto é mais indicado?" },
  { key: "argumentosComerciais", label: "Argumentos comerciais", aliases: ["Argumentos comerciais", "Argumento comercial", "Argumentos de venda", "Argumento de venda"], placeholder: "Pontos que vendedores e agentes de IA podem usar no atendimento." },
  { key: "afirmacoesPermitidas", label: "Afirmações permitidas", aliases: ["Afirmações permitidas", "Afirmacoes permitidas", "Claims aprovados", "Informações aprovadas"], placeholder: "Fatos que a IA pode afirmar com segurança porque estão aprovados ou comprovados.", rows: 4 },
  { key: "duvidasFrequentes", label: "Dúvidas frequentes", aliases: ["Dúvidas frequentes", "Duvidas frequentes", "Dúvidas", "Duvidas", "FAQ"], placeholder: "Perguntas frequentes e respectivas respostas.", rows: 4 },
  { key: "objecoesRespostas", label: "Objeções e respostas", aliases: ["Objeções e respostas", "Objecoes e respostas", "Objeções", "Objecoes"], placeholder: "Principais objeções do cliente e como respondê-las com informações reais.", rows: 4 },
  { key: "garantia", label: "Garantia", aliases: ["Garantia", "Garantias"], placeholder: "Regras e informações de garantia." },
  { key: "instalacao", label: "Instalação / uso", aliases: ["Instalação / uso", "Instalacao / uso", "Instalação", "Instalacao", "Modo de uso"], placeholder: "Orientações de instalação, montagem ou utilização." },
  { key: "entrega", label: "Entrega / prazo", aliases: ["Entrega / prazo", "Entrega", "Prazo", "Prazo de entrega"], placeholder: "Informações relevantes sobre entrega, prazo e disponibilidade." },
  { key: "observacoesIa", label: "Observações para IA", aliases: ["Observações para IA", "Observacoes para IA", "Observações", "Observacoes", "Informações adicionais", "Informacoes adicionais"], placeholder: "Regras específicas que a IA deve respeitar ao falar deste produto.", rows: 4 },
  { key: "afirmacoesProibidas", label: "O que a IA não pode afirmar", aliases: ["O que a IA não pode afirmar", "Afirmações proibidas", "Afirmacoes proibidas", "Restrições de afirmação", "Restricoes de afirmacao"], placeholder: "Ex.: não afirmar garantia vitalícia; não comparar desempenho sem laudo; não prometer prazo fixo.", rows: 4 },
];
const PRICE_SPEC_ALIASES = ["Condições de pagamento", "Condicoes de pagamento", "Condição de pagamento", "Condicao de pagamento", "Pagamento", "Valor", "Preço", "Preco", "Investimento"];

function normalizeLabel(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
}
const FIELD_ALIAS_SET = new Set(FIELD_SPECS.flatMap((field) => field.aliases).map(normalizeLabel));
const PRICE_ALIAS_SET = new Set(PRICE_SPEC_ALIASES.map(normalizeLabel));

function authHeaders(json = false): Record<string, string> {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}
function mediaUrl(value: string) { return value.startsWith("/objects/") ? `/api/storage${value}` : value; }
function publicMediaUrl(value: string) { return new URL(mediaUrl(value), window.location.origin).toString(); }
function specValueAny(product: CatalogProduct, labels: string[]) {
  const aliases = new Set(labels.map(normalizeLabel));
  return product.especificacoes?.find((item) => aliases.has(normalizeLabel(item.label)))?.value?.trim() ?? "";
}
function aiEnabledFor(product: CatalogProduct) { return specValueAny(product, ["Uso pela IA"]) !== "Não"; }
function stripGeneratedKnowledge(value?: string | null) {
  const text = String(value ?? "");
  const index = text.indexOf(KNOWLEDGE_MARKER);
  return (index >= 0 ? text.slice(0, index) : text).trim();
}
function splitDescriptionPrice(value: string) {
  const text = value.trim();
  const match = /(?:^|\s)(?:Valor|Preço|Preco|Investimento)\s*:\s*([\s\S]+)$/i.exec(text);
  if (!match || match.index < 0) return { description: text, payment: "" };
  return {
    description: text.slice(0, match.index).trim().replace(/[;,\s]+$/, "").trim(),
    payment: match[1].trim(),
  };
}
function installmentCondition(value: string) {
  const text = value.trim();
  if (!text) return "";
  const match = /(?:^|\bou\b|[,;])\s*(\d+\s*x\s*(?:de\s*)?R\$?\s*[\d.,]+)/i.exec(text);
  if (!match) return text;
  return match[1]
    .replace(/\s*x\s*/i, "x de ")
    .replace(/de\s+de\s+/i, "de ")
    .replace(/R\$\s*/i, "R$ ")
    .trim();
}
function hasValue(value: unknown) { return value !== null && value !== undefined && String(value).trim() !== ""; }
function textToList(value: string) {
  return value.split(/\n|;/).map((item) => item.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
}
function listToText(value?: string[] | null) {
  return Array.isArray(value) ? value.filter(Boolean).join("\n") : "";
}
function parseObjections(value: string) {
  return textToList(value).map((line) => {
    const parts = line.split(/\s*(?:=>|→|\|)\s*/, 2);
    return { objecao: parts[0] ?? "", ...(parts[1] ? { resposta: parts[1] } : {}) };
  }).filter((item) => item.objecao);
}
function objectionsToText(value?: Array<{ objecao: string; resposta?: string }> | null) {
  return Array.isArray(value)
    ? value.map((item) => item.resposta ? `${item.objecao} → ${item.resposta}` : item.objecao).filter(Boolean).join("\n")
    : "";
}
function formatPrice(value?: string | null) {
  if (!hasValue(value)) return "";
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "";
}
function formatPercent(value?: string | null) {
  if (!hasValue(value)) return "";
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : "";
}
function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("pt-BR").format(date);
}
function priceRows(product: CatalogProduct): PriceRow[] {
  const rows: PriceRow[] = [];
  const push = (label: string, value: string, hint?: string) => { if (value) rows.push({ label, value, hint }); };
  push("Preço à vista", formatPrice(product.precoBase), product.unidade ? `Unidade: ${product.unidade}` : undefined);
  push("Implantação", formatPrice(product.precoImplantacao));
  push("Mensalidade", formatPrice(product.precoMensalidade), product.recorrencia ? `Recorrência: ${product.recorrencia}` : undefined);
  push("Preço promocional", formatPrice(product.precoPromocional), product.promocaoAtivaAte ? `Válido até ${formatDate(product.promocaoAtivaAte)}` : undefined);
  push("Preço no Praça.ai", formatPrice(product.precoPracaAi));
  const productDiscount = formatPercent(product.descontoMaximoPercentual);
  const categoryDiscount = formatPercent(product.categoriaDescontoMaximoPercentual);
  push(productDiscount ? "Teto de desconto do produto" : "Teto de desconto da categoria", productDiscount || categoryDiscount);
  return rows;
}
function inferType(file: File): MediaAsset["type"] | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type === "application/pdf" || file.type.startsWith("text/")) return "document";
  return null;
}
function typeLabel(type: MediaAsset["type"]) {
  return type === "image" ? "Imagem" : type === "video" ? "Vídeo" : type === "audio" ? "Áudio" : "Documento";
}
function emptyForm(): ProductForm {
  return {
    descricaoCompleta: "", caracteristicas: "", beneficios: "", diferenciais: "", doresAtendidas: "", aplicacoes: "", publicoIndicado: "",
    argumentosComerciais: "", afirmacoesPermitidas: "", duvidasFrequentes: "", objecoesRespostas: "", garantia: "", instalacao: "",
    entrega: "", observacoesIa: "", afirmacoesProibidas: "", condicoesPagamento: "", tags: "", aiEnabled: true,
  };
}
function formFromProduct(product: CatalogProduct): ProductForm {
  const form = emptyForm();
  const originalDescription = stripGeneratedKnowledge(product.descricaoLonga) || product.descricao || "";
  const separated = splitDescriptionPrice(originalDescription);
  const intelligence = product.inteligenciaComercial ?? {};
  form.descricaoCompleta = separated.description;
  form.condicoesPagamento = installmentCondition(specValueAny(product, PRICE_SPEC_ALIASES) || separated.payment);
  form.tags = (product.tags ?? []).join(", ");
  form.aiEnabled = aiEnabledFor(product);

  for (const field of FIELD_SPECS) form[field.key] = specValueAny(product, field.aliases);

  form.caracteristicas = listToText(intelligence.caracteristicas) || form.caracteristicas;
  form.beneficios = listToText(intelligence.beneficios) || form.beneficios;
  form.diferenciais = listToText(intelligence.diferenciais) || form.diferenciais;
  form.doresAtendidas = listToText(intelligence.doresAtendidas) || form.doresAtendidas;
  form.aplicacoes = listToText(intelligence.casosUso) || form.aplicacoes;
  form.publicoIndicado = listToText(intelligence.personas) || form.publicoIndicado;
  form.argumentosComerciais = listToText(intelligence.notasComerciais) || form.argumentosComerciais;
  form.afirmacoesPermitidas = listToText(intelligence.afirmacoesPermitidas) || form.afirmacoesPermitidas;
  form.duvidasFrequentes = listToText(intelligence.duvidasFrequentes) || form.duvidasFrequentes;
  form.objecoesRespostas = objectionsToText(intelligence.objecoes) || form.objecoesRespostas;
  form.garantia = intelligence.garantia?.trim() || form.garantia;
  form.instalacao = intelligence.instalacaoUso?.trim() || form.instalacao;
  form.entrega = intelligence.entregaPrazo?.trim() || form.entrega;
  form.observacoesIa = listToText(intelligence.orientacoesIa) || form.observacoesIa;
  form.afirmacoesProibidas = listToText(intelligence.afirmacoesProibidas) || form.afirmacoesProibidas;

  if (!form.entrega && product.prazoEntregaDias != null) form.entrega = `Prazo de entrega: ${product.prazoEntregaDias} dia(s).`;
  return form;
}
function isManagedSpec(label: string) {
  const normalized = normalizeLabel(label);
  return FIELD_ALIAS_SET.has(normalized) || PRICE_ALIAS_SET.has(normalized) || normalized === normalizeLabel("Uso pela IA");
}

export default function ProductCatalogKnowledgeLibraryV2() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<ProductForm>(emptyForm);

  const selected = products.find((product) => product.id === selectedId) ?? null;
  const selectedPrices = useMemo(() => selected ? priceRows(selected) : [], [selected]);
  const productAssets = useMemo(() => selected ? assets.filter((asset) => asset.metadata?.productId === selected.id) : [], [assets, selected]);
  const filteredProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return products;
    return products.filter((product) => [product.nome, product.sku ?? "", product.marca ?? "", product.categoriaNome ?? "", product.descricao ?? "", ...(product.tags ?? [])]
      .join(" ").toLocaleLowerCase("pt-BR").includes(term));
  }, [products, search]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest("button");
      if (!button?.closest("#biblioteca-midias") || !button.textContent?.includes("Produtos do catálogo")) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setOpen(true);
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  useEffect(() => {
    const container = document.getElementById("biblioteca-midias");
    if (!container) return;
    const mediaLibrary = Array.from(container.children).find((child) => !(child as HTMLElement).dataset.productKnowledgeRoot) as HTMLElement | undefined;
    if (!mediaLibrary) return;
    const previous = mediaLibrary.style.display;
    if (open) mediaLibrary.style.display = "none";
    return () => { mediaLibrary.style.display = previous; };
  }, [open]);

  useEffect(() => {
    const container = document.getElementById("biblioteca-midias");
    if (!container) return;
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("Produtos do catálogo"));
    const numeric = button ? Array.from(button.querySelectorAll("span")).find((span) => /^\d+$/.test(span.textContent?.trim() ?? "")) : null;
    const next = String(products.length);
    if (numeric && numeric.textContent?.trim() !== next) numeric.textContent = next;
  }, [products.length, open]);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [productsResponse, assetsResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/produtos-catalogo`, { headers: authHeaders(), cache: "no-store" }),
        fetch(`/api/tenants/${tenantId}/media/assets?limit=150`, { headers: authHeaders(), cache: "no-store" }),
      ]);
      const productBody = await productsResponse.json().catch(() => []);
      const assetBody = await assetsResponse.json().catch(() => ({}));
      if (!productsResponse.ok) throw new Error("Não foi possível carregar os produtos do catálogo.");
      const nextProducts = Array.isArray(productBody) ? productBody as CatalogProduct[] : [];
      setProducts(nextProducts);
      setAssets(Array.isArray(assetBody.assets) ? assetBody.assets as MediaAsset[] : []);
      if (selectedId && !nextProducts.some((item) => item.id === selectedId)) setSelectedId(null);
    } catch (error) {
      toast({ title: "Catálogo indisponível", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { if (tenantId) void load(); }, [tenantId]);
  useEffect(() => { if (selected) setForm(formFromProduct(selected)); }, [selected?.id]);

  async function sugerirInteligenciaComercial() {
    if (!selected) return;
    setSuggesting(true);
    try {
      const response = await fetch(`/api/produtos-catalogo/${selected.id}/inteligencia-comercial/sugerir`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({}),
      });
      const body = await response.json().catch(() => ({})) as {
        sugestoes?: InteligenciaComercialProduto;
        fontes?: Array<{ id: string; titulo?: string }>;
        aviso?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Não foi possível gerar sugestões.");
      const intelligence = body.sugestoes ?? {};

      setForm((current) => ({
        ...current,
        caracteristicas: listToText(intelligence.caracteristicas) || current.caracteristicas,
        beneficios: listToText(intelligence.beneficios) || current.beneficios,
        diferenciais: listToText(intelligence.diferenciais) || current.diferenciais,
        doresAtendidas: listToText(intelligence.doresAtendidas) || current.doresAtendidas,
        aplicacoes: listToText(intelligence.casosUso) || current.aplicacoes,
        publicoIndicado: listToText(intelligence.personas) || current.publicoIndicado,
        argumentosComerciais: listToText(intelligence.notasComerciais) || current.argumentosComerciais,
        afirmacoesPermitidas: listToText(intelligence.afirmacoesPermitidas) || current.afirmacoesPermitidas,
        duvidasFrequentes: listToText(intelligence.duvidasFrequentes) || current.duvidasFrequentes,
        objecoesRespostas: objectionsToText(intelligence.objecoes) || current.objecoesRespostas,
        garantia: intelligence.garantia?.trim() || current.garantia,
        instalacao: intelligence.instalacaoUso?.trim() || current.instalacao,
        entrega: intelligence.entregaPrazo?.trim() || current.entrega,
        observacoesIa: listToText(intelligence.orientacoesIa) || current.observacoesIa,
        afirmacoesProibidas: listToText(intelligence.afirmacoesProibidas) || current.afirmacoesProibidas,
      }));

      toast({
        title: "Sugestões geradas",
        description: `Revise antes de salvar. ${body.fontes?.length ?? 0} fonte(s) do negócio foram consideradas.`,
      });
    } catch (error) {
      toast({
        title: "Não foi possível gerar sugestões",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSuggesting(false);
    }
  }

  async function saveProduct() {
    if (!selected) return;
    setSaving(true);
    try {
      const preservedSpecs = (selected.especificacoes ?? []).filter((spec) => !isManagedSpec(spec.label));
      const knowledgeSpecs = FIELD_SPECS.flatMap((field) => {
        const value = form[field.key].trim();
        return value ? [{ label: field.label, value }] : [];
      });
      const paymentSpecs = form.condicoesPagamento.trim() ? [{ label: "Condições de pagamento", value: form.condicoesPagamento.trim() }] : [];
      const especificacoes = [...preservedSpecs, ...knowledgeSpecs, ...paymentSpecs, { label: "Uso pela IA", value: form.aiEnabled ? "Sim" : "Não" }];
      const knowledgeText = form.aiEnabled ? knowledgeSpecs.map((spec) => `${spec.label}: ${spec.value}`).join("\n\n") : "";
      const descricaoLonga = [form.descricaoCompleta.trim(), knowledgeText ? `${KNOWLEDGE_MARKER}\n${knowledgeText}` : ""].filter(Boolean).join("\n\n");
      const tags = form.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
      const inteligenciaComercial: InteligenciaComercialProduto = {
        caracteristicas: textToList(form.caracteristicas),
        diferenciais: textToList(form.diferenciais),
        beneficios: textToList(form.beneficios),
        doresAtendidas: textToList(form.doresAtendidas),
        casosUso: textToList(form.aplicacoes),
        personas: textToList(form.publicoIndicado),
        objecoes: parseObjections(form.objecoesRespostas),
        afirmacoesPermitidas: textToList(form.afirmacoesPermitidas),
        afirmacoesProibidas: textToList(form.afirmacoesProibidas),
        notasComerciais: textToList(form.argumentosComerciais),
        duvidasFrequentes: textToList(form.duvidasFrequentes),
        garantia: form.garantia.trim() || null,
        instalacaoUso: form.instalacao.trim() || null,
        entregaPrazo: form.entrega.trim() || null,
        orientacoesIa: textToList(form.observacoesIa),
        aprovadoEm: form.aiEnabled ? new Date().toISOString() : null,
        aprovadoPor: form.aiEnabled ? (user?.id ?? null) : null,
        origem: "manual",
      };
      const response = await fetch(`/api/produtos-catalogo/${selected.id}`, {
        method: "PATCH", headers: authHeaders(true), body: JSON.stringify({ descricaoLonga, especificacoes, tags, inteligenciaComercial }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar as informações do produto.");

      const linkedAssets = assets.filter((asset) => asset.metadata?.productId === selected.id);
      await Promise.all(linkedAssets.map((asset) => fetch(`/api/tenants/${tenantId}/media/assets/${asset.id}`, {
        method: "PATCH", headers: authHeaders(true), body: JSON.stringify({ metadata: { aiUsage: form.aiEnabled ? "approved" : "manual" } }),
      }).catch(() => null)));

      setProducts((current) => current.map((product) => product.id === selected.id ? { ...product, ...body, categoriaNome: product.categoriaNome, categoriaDescontoMaximoPercentual: product.categoriaDescontoMaximoPercentual } : product));
      toast({ title: "Informações do produto salvas", description: form.aiEnabled ? "A Base IA deste produto foi atualizada." : "O complemento foi salvo sem liberação para a IA." });
    } catch (error) {
      toast({ title: "Não foi possível salvar", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function uploadProductFiles(files: FileList | null) {
    if (!selected || !files?.length || !tenantId) return;
    setUploading(true);
    try {
      let nextImages = [...(selected.imagens ?? [])];
      let nextCover = selected.imagemUrl ?? null;
      let nextVideo = selected.videoUrl ?? null;
      let sent = 0;
      for (const file of Array.from(files)) {
        const type = inferType(file);
        if (!type) continue;
        const request = await fetch(`/api/tenants/${tenantId}/media/assets/request-upload`, {
          method: "POST", headers: authHeaders(true), body: JSON.stringify({ name: file.name, contentType: file.type || "application/octet-stream", type, size: file.size }),
        });
        const prepared = await request.json().catch(() => ({}));
        if (!request.ok) throw new Error(prepared.error || `Falha ao preparar ${file.name}`);
        const put = await fetch(prepared.uploadURL, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
        if (!put.ok) throw new Error(`Falha ao enviar ${file.name}`);
        const register = await fetch(`/api/tenants/${tenantId}/media/assets`, {
          method: "POST", headers: authHeaders(true), body: JSON.stringify({
            type, role: "reference", source: "upload", storageUrl: prepared.objectPath, originalFilename: file.name, mimeType: file.type || null, fileSize: file.size,
            metadata: {
              folderPath: "Produtos do catálogo", productId: selected.id, productName: selected.nome,
              aiUsage: form.aiEnabled ? "approved" : "manual", aiCollection: `Produto:${selected.id}`,
              uploadedFrom: "product_catalog_knowledge_library", uploadedAt: new Date().toISOString(),
            },
          }),
        });
        const registered = await register.json().catch(() => ({}));
        if (!register.ok) throw new Error(registered.error || `Falha ao vincular ${file.name}`);
        const url = publicMediaUrl(prepared.objectPath);
        if (type === "image") { nextImages = [...new Set([...nextImages, url])]; if (!nextCover) nextCover = url; }
        if (type === "video" && !nextVideo) nextVideo = url;
        sent += 1;
      }
      const patch = await fetch(`/api/produtos-catalogo/${selected.id}`, {
        method: "PATCH", headers: authHeaders(true), body: JSON.stringify({ imagemUrl: nextCover, imagens: nextImages, videoUrl: nextVideo }),
      });
      if (!patch.ok) throw new Error("Os arquivos foram enviados, mas não foi possível atualizar as mídias do produto.");
      await load();
      toast({ title: `${sent} arquivo(s) vinculado(s) ao produto` });
    } catch (error) {
      toast({ title: "Falha ao anexar arquivos", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  if (!open) return null;

  return (
    <div data-product-knowledge-root="true" className="mx-auto w-full max-w-[1500px] px-3 pb-24 pt-4 sm:px-6 lg:px-8">
      <input ref={uploadInputRef} type="file" multiple className="hidden" accept="image/*,video/*,audio/*,.pdf,.txt" onChange={(event) => void uploadProductFiles(event.target.files)} />
      <header className="mb-5 rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <button type="button" onClick={() => { setSelectedId(null); setOpen(false); }} className="mt-0.5 rounded-xl border bg-background p-2.5 hover:bg-muted" title="Voltar à Biblioteca"><ArrowLeft className="h-4 w-4" /></button>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Produtos do catálogo</h1><span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">{products.length} produtos</span></div>
              <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">O catálogo é a fonte oficial. Aqui você complementa cada produto com informações, argumentos, dúvidas, documentos, fotos e vídeos sem duplicar o cadastro.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800"><div className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4" /> Base por produto</div><p className="mt-1">O conteúdo salvo fica vinculado ao ID real do produto para reutilização pela IA.</p></div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
        <main className="min-w-0">
          <label className="relative mb-4 block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto, SKU, marca, categoria ou descrição" className="h-11 w-full rounded-xl border bg-background pl-10 pr-3 text-sm outline-none focus:border-orange-300" /></label>
          {loading ? <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div> : filteredProducts.length === 0 ? (
            <div className="rounded-3xl border border-dashed p-10 text-center"><Box className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-3 font-semibold">Nenhum produto encontrado</p><p className="mt-1 text-sm text-muted-foreground">Cadastre o produto no Catálogo principal; ele aparecerá aqui automaticamente.</p></div>
          ) : (
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProducts.map((product) => (
                <button key={product.id} type="button" onClick={() => setSelectedId(product.id)} className={`overflow-hidden rounded-2xl border bg-card text-left transition hover:-translate-y-0.5 hover:shadow-md ${selectedId === product.id ? "border-orange-400 ring-2 ring-orange-100" : ""}`}>
                  <div className="aspect-[4/3] overflow-hidden bg-muted">{product.imagemUrl ? <img src={mediaUrl(product.imagemUrl)} alt={product.nome} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Box className="h-10 w-10 text-muted-foreground/50" /></div>}</div>
                  <div className="p-3"><div className="flex items-start justify-between gap-2"><p className="line-clamp-2 text-sm font-semibold">{product.nome}</p><span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${product.ativo ? "bg-emerald-500" : "bg-slate-300"}`} /></div><p className="mt-1 truncate text-xs text-muted-foreground">{product.categoriaNome || "Sem categoria"}{product.sku ? ` · SKU ${product.sku}` : ""}</p><div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs font-semibold">{formatPrice(product.precoBase)}</span><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${aiEnabledFor(product) ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{aiEnabledFor(product) ? "IA liberada" : "IA restrita"}</span></div></div>
                </button>
              ))}
            </section>
          )}
          <p className="mt-4 text-xs text-muted-foreground">Mostrando {filteredProducts.length} de {products.length} produtos reais do catálogo.</p>
        </main>

        <aside className="h-fit overflow-hidden rounded-3xl border bg-card shadow-sm xl:sticky xl:top-4">
          {!selected ? (
            <div className="p-8 text-center"><Sparkles className="mx-auto h-9 w-9 text-orange-500" /><h2 className="mt-3 font-semibold">Selecione um produto</h2><p className="mt-1 text-sm text-muted-foreground">Abra um produto para complementar as informações que a IA poderá usar em atendimento, Praça.ai e geração de conteúdo.</p></div>
          ) : (
            <>
              <div className="flex items-start gap-3 border-b p-4">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">{selected.imagemUrl ? <img src={mediaUrl(selected.imagemUrl)} alt={selected.nome} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Box className="h-6 w-6 text-muted-foreground" /></div>}</div>
                <div className="min-w-0 flex-1"><h2 className="line-clamp-2 font-semibold">{selected.nome}</h2><p className="mt-1 truncate text-xs text-muted-foreground">{selected.categoriaNome || "Sem categoria"}{selected.sku ? ` · ${selected.sku}` : ""}</p><div className="mt-2 flex flex-wrap gap-1.5"><span className="rounded-full bg-muted px-2 py-1 text-[10px]">{selected.ativo ? "Ativo" : "Inativo"}</span><span className="rounded-full bg-muted px-2 py-1 text-[10px]">{selected.vendeNoPracaAi === false ? "Fora do Praça.ai" : "Praça.ai disponível"}</span></div></div>
                <button type="button" onClick={() => setSelectedId(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
              </div>
              <div className="max-h-[calc(100vh-190px)] space-y-5 overflow-y-auto p-4">
                <div className="rounded-2xl border border-orange-200 bg-orange-50 p-3"><label className="flex cursor-pointer items-start justify-between gap-3"><div><p className="text-sm font-semibold text-orange-900">Disponível para IA</p><p className="mt-1 text-xs leading-relaxed text-orange-800/80">Libera o complemento deste produto para uso automatizado. Informações operacionais sensíveis devem ficar fora dos campos abaixo.</p></div><input type="checkbox" checked={form.aiEnabled} onChange={(event) => setForm((current) => ({ ...current, aiEnabled: event.target.checked }))} className="mt-1 h-4 w-4 accent-orange-500" /></label></div>

                <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-violet-950">Inteligência comercial assistida</p>
                      <p className="mt-1 text-xs leading-relaxed text-violet-800/80">
                        A IA usa o cadastro do produto e informações aprovadas da empresa para sugerir benefícios, objeções, aplicações e cuidados. Nada é aprovado automaticamente.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={suggesting}
                      onClick={() => void sugerirInteligenciaComercial()}
                      className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-background px-3 text-xs font-semibold text-violet-800 disabled:opacity-50"
                    >
                      {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Sugerir inteligência com IA
                    </button>
                  </div>
                </div>

                <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-3">
                  <div className="flex items-start gap-2"><CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" /><div><p className="text-sm font-semibold text-sky-950">Preço e pagamento</p><p className="mt-0.5 text-[11px] leading-relaxed text-sky-800/80">Padrão único do catálogo: uma linha para o valor à vista e outra para o parcelamento.</p></div></div>

                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-100 bg-background/90 px-3 py-3">
                      <div className="min-w-0"><p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Preço à vista</p><p className="mt-1 text-sm font-semibold text-foreground">{formatPrice(selected.precoBase) || "Não informado"}</p>{selected.unidade ? <p className="mt-0.5 text-[10px] text-muted-foreground">Unidade: {selected.unidade}</p> : null}</div>
                      <span className="shrink-0 rounded-full bg-sky-100 px-2 py-1 text-[10px] font-semibold text-sky-800">Catálogo</span>
                    </div>

                    <label className="block rounded-xl border border-sky-100 bg-background/90 px-3 py-3">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Preço parcelado</span>
                      <input value={form.condicoesPagamento} onChange={(event) => setForm((current) => ({ ...current, condicoesPagamento: event.target.value }))} placeholder="Ex.: 12x de R$ 499,00" className="mt-1.5 h-9 w-full rounded-lg border border-sky-200 bg-background px-3 text-sm font-semibold text-foreground outline-none focus:border-sky-400" />
                    </label>
                  </div>

                  {selectedPrices.filter((row) => row.label !== "Preço à vista" && !row.label.startsWith("Teto de desconto")).length > 0 ? (
                    <div className="mt-3 border-t border-sky-100 pt-3">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-sky-900/70">Outros valores do catálogo</p>
                      <div className="grid gap-2 sm:grid-cols-2">{selectedPrices.filter((row) => row.label !== "Preço à vista" && !row.label.startsWith("Teto de desconto")).map((row) => <div key={row.label} className="rounded-xl border border-sky-100 bg-background/80 px-3 py-2.5"><p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{row.label}</p><p className="mt-1 text-sm font-semibold text-foreground">{row.value}</p>{row.hint ? <p className="mt-0.5 text-[10px] text-muted-foreground">{row.hint}</p> : null}</div>)}</div>
                    </div>
                  ) : null}

                  <div className="mt-3 rounded-xl border border-slate-200 bg-background/80 px-3 py-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Desconto máximo permitido</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{formatPercent(selected.descontoMaximoPercentual) || formatPercent(selected.categoriaDescontoMaximoPercentual) || "0%"}</p>
                  </div>

                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-emerald-900">
                    <p className="text-xs font-semibold">Checkout automático</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-emerald-800">Quando o cliente confirma a compra, o VendorAI gera o checkout automaticamente com a condição escolhida. Esta é uma regra padrão do sistema e não possui liga/desliga por produto.</p>
                  </div>
                </section>

                <label className="block text-xs font-medium text-muted-foreground">Descrição completa<textarea value={form.descricaoCompleta} onChange={(event) => setForm((current) => ({ ...current, descricaoCompleta: event.target.value }))} rows={5} placeholder="Descrição oficial e completa do produto, sem preço ou condição de pagamento." className="mt-1 w-full resize-y rounded-xl border bg-background p-3 text-sm text-foreground outline-none focus:border-orange-300" /></label>
                <div className="grid gap-4">{FIELD_SPECS.map((field) => <label key={field.label} className="block text-xs font-medium text-muted-foreground">{field.label}<textarea value={form[field.key]} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} rows={field.rows ?? 3} placeholder={field.placeholder} className="mt-1 w-full resize-y rounded-xl border bg-background p-3 text-sm text-foreground outline-none focus:border-orange-300" /></label>)}</div>
                <label className="block text-xs font-medium text-muted-foreground">Tags<input value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} placeholder="ex.: piscina, acabamento, área externa" className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-orange-300" /></label>

                <section className="border-t pt-4">
                  <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Arquivos anexados ao produto</p><p className="mt-0.5 text-xs text-muted-foreground">Fotos, vídeos, PDFs, fichas técnicas e referências ficam vinculados ao ID deste produto.</p></div><button type="button" disabled={uploading} onClick={() => uploadInputRef.current?.click()} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border bg-background px-3 text-xs font-semibold hover:bg-muted disabled:opacity-60">{uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Anexar</button></div>
                  {productAssets.length === 0 ? <div className="mt-3 rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground"><Paperclip className="mx-auto mb-2 h-5 w-5" />Nenhum arquivo complementar anexado.</div> : <div className="mt-3 space-y-2">{productAssets.map((asset) => <a key={asset.id} href={mediaUrl(asset.storageUrl)} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border p-2.5 hover:bg-muted/50"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">{asset.type === "image" ? <ImageIcon className="h-4 w-4" /> : asset.type === "video" ? <Video className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{asset.originalFilename || "Arquivo do produto"}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{typeLabel(asset.type)} · {asset.metadata?.aiUsage === "approved" ? "liberado para IA" : "uso manual"}</p></div></a>)}</div>}
                </section>

                <div className="sticky bottom-0 -mx-4 border-t bg-card/95 px-4 pb-1 pt-3 backdrop-blur"><button type="button" onClick={() => void saveProduct()} disabled={saving} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Salvar informações do produto</button><p className="mt-2 text-center text-[10px] text-muted-foreground">Salva no produto oficial; não cria uma cópia na Biblioteca.</p></div>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
