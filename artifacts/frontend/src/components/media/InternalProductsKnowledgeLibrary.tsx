import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  Loader2,
  Package,
  Paperclip,
  Save,
  Search,
  Sparkles,
  Upload,
  Video,
  Wand2,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type ProductType = "servico" | "produto" | "oferta" | "etapa";
type AttachmentType = "image" | "video" | "audio" | "document";
type InternalAttachment = {
  id: string;
  nome: string;
  url: string;
  type: AttachmentType;
  mimeType?: string | null;
  fileSize?: number | null;
  uploadedAt?: string | null;
};
type InternalDetails = Record<string, unknown>;
type InternalProduct = {
  id: string;
  categoria: string;
  nome: string;
  descricaoUso: string;
  tipo: ProductType;
  nichosRelacionados?: string[] | null;
  detalhes?: InternalDetails | null;
  anexos?: InternalAttachment[] | null;
  ordem?: number | null;
  ativo?: boolean | null;
};

type FormState = {
  nome: string;
  categoria: string;
  tipo: ProductType;
  descricaoUso: string;
  nichos: string;
  descricaoCompleta: string;
  caracteristicas: string;
  beneficios: string;
  diferenciais: string;
  aplicacoes: string;
  publicoIndicado: string;
  argumentosComerciais: string;
  duvidasFrequentes: string;
  objecoesRespostas: string;
  garantia: string;
  instalacao: string;
  entrega: string;
  observacoesIa: string;
  condicoesPagamento: string;
  tags: string;
  aiEnabled: boolean;
};

type DetailTextKey = Exclude<keyof FormState, "nome" | "categoria" | "tipo" | "descricaoUso" | "nichos" | "tags" | "aiEnabled">;
type KnowledgeField = { key: DetailTextKey; label: string; placeholder: string; rows?: number };

const TYPE_LABEL: Record<ProductType, string> = {
  servico: "Serviço",
  produto: "Solução",
  oferta: "Oferta",
  etapa: "Etapa do processo",
};

const KNOWLEDGE_FIELDS: KnowledgeField[] = [
  { key: "descricaoCompleta", label: "Descrição completa", placeholder: "Descrição oficial e completa, sem inventar características." , rows: 5 },
  { key: "caracteristicas", label: "Características", placeholder: "Recursos, funcionamento, escopo e características conhecidas." },
  { key: "beneficios", label: "Benefícios", placeholder: "Benefícios reais para o cliente e para a operação." },
  { key: "diferenciais", label: "Diferenciais", placeholder: "O que diferencia esta solução de alternativas." },
  { key: "aplicacoes", label: "Aplicações", placeholder: "Onde e em quais situações esta solução deve ser utilizada." },
  { key: "publicoIndicado", label: "Público / cliente indicado", placeholder: "Perfis de empresa ou usuário para os quais faz mais sentido." },
  { key: "argumentosComerciais", label: "Argumentos comerciais", placeholder: "Argumentos aprovados para marketing, atendimento e vendas." },
  { key: "duvidasFrequentes", label: "Dúvidas frequentes", placeholder: "Perguntas frequentes e respostas objetivas.", rows: 4 },
  { key: "objecoesRespostas", label: "Objeções e respostas", placeholder: "Principais objeções e respostas aprovadas.", rows: 4 },
  { key: "garantia", label: "Garantia / compromisso", placeholder: "Políticas ou compromissos reais. Deixe vazio quando não se aplicar." },
  { key: "instalacao", label: "Implantação / uso", placeholder: "Como ativar, implantar, configurar ou usar." },
  { key: "entrega", label: "Entrega / prazo", placeholder: "Prazo ou formato de entrega, se houver informação confirmada." },
  { key: "observacoesIa", label: "Observações para IA", placeholder: "Regras que a IA deve respeitar ao falar desta solução.", rows: 4 },
  { key: "condicoesPagamento", label: "Condições comerciais / pagamento", placeholder: "Condições comerciais confirmadas, se aplicável." },
];

function authHeaders(json = false): Record<string, string> {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}

function normalizedText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function replaceFirstText(root: HTMLElement, from: string, to: string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (normalizedText(node.textContent) === from) {
      node.textContent = to;
      return true;
    }
    node = walker.nextNode();
  }
  return false;
}

function stringValue(details: InternalDetails | null | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" ? value : "";
}

function stringArrayValue(details: InternalDetails | null | undefined, key: string) {
  const value = details?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function formFromProduct(product: InternalProduct): FormState {
  const details = product.detalhes ?? {};
  return {
    nome: product.nome,
    categoria: product.categoria,
    tipo: product.tipo,
    descricaoUso: product.descricaoUso,
    nichos: (product.nichosRelacionados ?? []).join(", "),
    descricaoCompleta: stringValue(details, "descricaoCompleta"),
    caracteristicas: stringValue(details, "caracteristicas"),
    beneficios: stringValue(details, "beneficios"),
    diferenciais: stringValue(details, "diferenciais"),
    aplicacoes: stringValue(details, "aplicacoes"),
    publicoIndicado: stringValue(details, "publicoIndicado"),
    argumentosComerciais: stringValue(details, "argumentosComerciais"),
    duvidasFrequentes: stringValue(details, "duvidasFrequentes"),
    objecoesRespostas: stringValue(details, "objecoesRespostas"),
    garantia: stringValue(details, "garantia"),
    instalacao: stringValue(details, "instalacao"),
    entrega: stringValue(details, "entrega"),
    observacoesIa: stringValue(details, "observacoesIa"),
    condicoesPagamento: stringValue(details, "condicoesPagamento"),
    tags: stringArrayValue(details, "tags").join(", "),
    aiEnabled: details.aiEnabled !== false,
  };
}

function emptyForm(): FormState {
  return {
    nome: "", categoria: "", tipo: "servico", descricaoUso: "", nichos: "", descricaoCompleta: "", caracteristicas: "",
    beneficios: "", diferenciais: "", aplicacoes: "", publicoIndicado: "", argumentosComerciais: "", duvidasFrequentes: "",
    objecoesRespostas: "", garantia: "", instalacao: "", entrega: "", observacoesIa: "", condicoesPagamento: "", tags: "", aiEnabled: true,
  };
}

function inferType(file: File): AttachmentType | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type === "application/pdf" || file.type.startsWith("text/")) return "document";
  return null;
}

function mediaUrl(value: string) {
  return value.startsWith("/objects/") ? `/api/storage${value}` : value;
}

function attachmentIcon(type: AttachmentType) {
  if (type === "image") return <ImageIcon className="h-4 w-4" />;
  if (type === "video") return <Video className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

export default function InternalProductsKnowledgeLibrary() {
  const { user, tenantOverride } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = user?.platformRole === "super_admin";
  const aiTenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const inputRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<InternalProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiFilling, setAiFilling] = useState(false);

  const selected = products.find((product) => product.id === selectedId) ?? null;

  const load = async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    try {
      const response = await fetch("/api/admin/produtos-internos", { headers: authHeaders(), cache: "no-store" });
      const body = await response.json().catch(() => []);
      if (!response.ok) throw new Error("Não foi possível carregar serviços, soluções e etapas.");
      const next = Array.isArray(body) ? (body as InternalProduct[]).filter((product) => product.ativo !== false) : [];
      setProducts(next);
      if (selectedId && !next.some((product) => product.id === selectedId)) setSelectedId(null);
    } catch (error) {
      toast({ title: "Serviços e etapas indisponíveis", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [isSuperAdmin]);
  useEffect(() => { if (selected) setForm(formFromProduct(selected)); }, [selected?.id]);

  useEffect(() => {
    if (!isSuperAdmin) return;

    const injectButton = () => {
      const container = document.getElementById("biblioteca-midias");
      if (!container) return;
      const existing = container.querySelector<HTMLButtonElement>('button[data-internal-products-library="true"]');
      const sourceButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => normalizedText(button.textContent).includes("Produtos do catálogo"));
      if (!sourceButton?.parentElement) return;

      if (existing) {
        const countNode = Array.from(existing.querySelectorAll<HTMLElement>("span, p, div"))
          .find((element) => /^\d+$/.test(normalizedText(element.textContent)));
        if (countNode) countNode.textContent = String(products.length);
        if (sourceButton.nextElementSibling !== existing) sourceButton.insertAdjacentElement("afterend", existing);
        return;
      }

      const clone = sourceButton.cloneNode(true) as HTMLButtonElement;
      clone.dataset.internalProductsLibrary = "true";
      clone.type = "button";
      clone.removeAttribute("aria-pressed");
      replaceFirstText(clone, "Produtos do catálogo", "Serviços e etapas");
      const countNode = Array.from(clone.querySelectorAll<HTMLElement>("span, p, div"))
        .find((element) => /^\d+$/.test(normalizedText(element.textContent)));
      if (countNode) countNode.textContent = String(products.length);
      clone.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setOpen(true);
      });
      sourceButton.insertAdjacentElement("afterend", clone);
    };

    injectButton();
    const observer = new MutationObserver(injectButton);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", injectButton);
    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", injectButton);
      document.querySelectorAll('button[data-internal-products-library="true"]').forEach((button) => button.remove());
    };
  }, [isSuperAdmin, products.length]);

  useEffect(() => {
    const container = document.getElementById("biblioteca-midias");
    if (!container) return;
    const mediaLibrary = container.firstElementChild as HTMLElement | null;
    if (!mediaLibrary) return;
    const previous = mediaLibrary.style.display;
    if (open) mediaLibrary.style.display = "none";
    return () => { mediaLibrary.style.display = previous; };
  }, [open]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return products;
    return products.filter((product) => [
      product.categoria,
      product.nome,
      product.descricaoUso,
      TYPE_LABEL[product.tipo],
      ...(product.nichosRelacionados ?? []),
      ...stringArrayValue(product.detalhes, "tags"),
    ].join(" ").toLocaleLowerCase("pt-BR").includes(term));
  }, [products, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, InternalProduct[]>();
    for (const product of filtered) {
      const list = map.get(product.categoria) ?? [];
      list.push(product);
      map.set(product.categoria, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  async function saveProduct() {
    if (!selected) return;
    if (!form.nome.trim() || !form.categoria.trim() || !form.descricaoUso.trim()) {
      toast({ title: "Preencha nome, categoria e descrição de uso", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const detalhes = {
        ...(selected.detalhes ?? {}),
        descricaoCompleta: form.descricaoCompleta.trim(),
        caracteristicas: form.caracteristicas.trim(),
        beneficios: form.beneficios.trim(),
        diferenciais: form.diferenciais.trim(),
        aplicacoes: form.aplicacoes.trim(),
        publicoIndicado: form.publicoIndicado.trim(),
        argumentosComerciais: form.argumentosComerciais.trim(),
        duvidasFrequentes: form.duvidasFrequentes.trim(),
        objecoesRespostas: form.objecoesRespostas.trim(),
        garantia: form.garantia.trim(),
        instalacao: form.instalacao.trim(),
        entrega: form.entrega.trim(),
        observacoesIa: form.observacoesIa.trim(),
        condicoesPagamento: form.condicoesPagamento.trim(),
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        aiEnabled: form.aiEnabled,
      };
      const body = {
        nome: form.nome.trim(),
        categoria: form.categoria.trim(),
        descricaoUso: form.descricaoUso.trim(),
        tipo: form.tipo,
        nichosRelacionados: form.nichos.split(",").map((item) => item.trim()).filter(Boolean),
        detalhes,
      };
      const response = await fetch(`/api/admin/produtos-internos/${selected.id}`, {
        method: "PATCH", headers: authHeaders(true), body: JSON.stringify(body),
      });
      const updated = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(updated.error || "Não foi possível salvar.");
      setProducts((current) => current.map((product) => product.id === selected.id ? { ...product, ...updated } : product));
      toast({ title: "Item atualizado", description: "Informações, regras e conhecimento ficaram salvos na mesma referência." });
    } catch (error) {
      toast({ title: "Não foi possível salvar", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function fillWithAi() {
    if (!selected || !aiTenantId) {
      toast({ title: "Selecione uma empresa para usar o apoio da IA", variant: "destructive" });
      return;
    }
    setAiFilling(true);
    try {
      const response = await fetch(`/api/tenants/${aiTenantId}/product-knowledge/ai-fill`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          nome: form.nome || selected.nome,
          categoria: form.categoria || selected.categoria,
          tipo: form.tipo,
          descricao: form.descricaoUso || selected.descricaoUso,
          current: form,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "A IA não conseguiu gerar sugestões.");
      const fields = body.fields ?? {};
      setForm((current) => {
        const next = { ...current } as FormState;
        if (!current.descricaoUso.trim() && typeof fields.descricaoUso === "string") next.descricaoUso = fields.descricaoUso;
        for (const field of KNOWLEDGE_FIELDS) {
          if (!current[field.key].trim() && typeof fields[field.key] === "string") next[field.key] = fields[field.key];
        }
        if (!current.tags.trim() && typeof fields.tags === "string") next.tags = fields.tags;
        return next;
      });
      toast({ title: "Sugestões da IA aplicadas", description: "Foram preenchidos somente os campos vazios. Revise antes de salvar." });
    } catch (error) {
      toast({ title: "Apoio da IA indisponível", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setAiFilling(false);
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!selected || !files?.length) return;
    setUploading(true);
    try {
      const nextAttachments = [...(selected.anexos ?? [])];
      for (const file of Array.from(files)) {
        const type = inferType(file);
        if (!type) continue;
        const request = await fetch("/api/storage/uploads/request-url", {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
        });
        const prepared = await request.json().catch(() => ({}));
        if (!request.ok || !prepared.uploadURL || !prepared.objectPath) throw new Error(prepared.error || `Falha ao preparar ${file.name}`);
        const put = await fetch(prepared.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
        if (!put.ok) throw new Error(`Falha ao enviar ${file.name}`);
        nextAttachments.push({
          id: crypto.randomUUID(),
          nome: file.name,
          url: prepared.objectPath,
          type,
          mimeType: file.type || null,
          fileSize: file.size,
          uploadedAt: new Date().toISOString(),
        });
      }
      const response = await fetch(`/api/admin/produtos-internos/${selected.id}`, {
        method: "PATCH", headers: authHeaders(true), body: JSON.stringify({ anexos: nextAttachments }),
      });
      const updated = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(updated.error || "Não foi possível vincular os anexos.");
      setProducts((current) => current.map((product) => product.id === selected.id ? { ...product, ...updated } : product));
      toast({ title: "Arquivos anexados", description: "Os anexos ficaram vinculados a este item." });
    } catch (error) {
      toast({ title: "Falha ao anexar arquivos", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeAttachment(id: string) {
    if (!selected) return;
    const anexos = (selected.anexos ?? []).filter((item) => item.id !== id);
    const response = await fetch(`/api/admin/produtos-internos/${selected.id}`, {
      method: "PATCH", headers: authHeaders(true), body: JSON.stringify({ anexos }),
    });
    if (!response.ok) {
      toast({ title: "Não foi possível remover o anexo", variant: "destructive" });
      return;
    }
    const updated = await response.json().catch(() => ({}));
    setProducts((current) => current.map((product) => product.id === selected.id ? { ...product, ...updated } : product));
  }

  if (!isSuperAdmin || !open) return null;

  return (
    <div data-internal-product-knowledge-root="true" className="mx-auto w-full max-w-[1500px] px-3 pb-24 pt-4 sm:px-6 lg:px-8">
      <input ref={inputRef} type="file" multiple className="hidden" accept="image/*,video/*,audio/*,.pdf,.txt" onChange={(event) => void uploadFiles(event.target.files)} />

      <header className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <button type="button" onClick={() => { setSelectedId(null); setOpen(false); }} className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Voltar à Biblioteca da Empresa
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600"><Package className="h-5 w-5" /></div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Serviços, soluções e etapas</h1>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">Use esta área para o que não é um produto direto do catálogo: serviços, ofertas, soluções e etapas do processo. Cada item pode receber informações, anexos e conhecimento para a IA.</p>
              </div>
            </div>
          </div>
          <a href="/content" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600"><Wand2 className="h-4 w-4" /> Criar material</a>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div className="rounded-2xl border bg-background p-3"><p className="text-xs font-medium text-muted-foreground">Total</p><p className="mt-2 text-xl font-semibold">{products.length}</p></div>
          <div className="rounded-2xl border bg-background p-3"><p className="text-xs font-medium text-muted-foreground">Soluções</p><p className="mt-2 text-xl font-semibold">{products.filter((item) => item.tipo === "produto").length}</p></div>
          <div className="rounded-2xl border bg-background p-3"><p className="text-xs font-medium text-muted-foreground">Serviços</p><p className="mt-2 text-xl font-semibold">{products.filter((item) => item.tipo === "servico").length}</p></div>
          <div className="rounded-2xl border bg-background p-3"><p className="text-xs font-medium text-muted-foreground">Etapas</p><p className="mt-2 text-xl font-semibold">{products.filter((item) => item.tipo === "etapa").length}</p></div>
          <div className="rounded-2xl border bg-background p-3"><p className="text-xs font-medium text-muted-foreground">Ofertas</p><p className="mt-2 text-xl font-semibold">{products.filter((item) => item.tipo === "oferta").length}</p></div>
        </div>
      </header>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_450px]">
        <main className="min-w-0">
          <label className="relative mb-4 block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar serviço, etapa, solução, oferta ou categoria" className="h-11 w-full rounded-xl border bg-background pl-10 pr-3 text-sm outline-none focus:border-orange-300" /></label>
          {loading ? (
            <div className="flex min-h-[360px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
          ) : grouped.length === 0 ? (
            <div className="rounded-3xl border border-dashed p-10 text-center"><Package className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-3 font-semibold">Nenhum item encontrado</p></div>
          ) : (
            <div className="space-y-6">
              {grouped.map(([category, items]) => (
                <section key={category}>
                  <div className="mb-2 flex items-center gap-2"><h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{category}</h2><span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">{items.length}</span></div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {items.map((product) => (
                      <button key={product.id} type="button" onClick={() => setSelectedId(product.id)} className={`rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${selectedId === product.id ? "border-orange-400 ring-2 ring-orange-100" : ""}`}>
                        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{product.nome}</h3><span className="rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{TYPE_LABEL[product.tipo]}</span></div><p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{product.descricaoUso}</p></div><Sparkles className="h-4 w-4 shrink-0 text-orange-500" /></div>
                        <div className="mt-3 flex items-center justify-between border-t pt-3"><span className="text-[11px] text-muted-foreground">{(product.anexos ?? []).length} anexo(s)</span><span className="text-[11px] font-medium text-orange-600">Editar informações</span></div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </main>

        <aside className="h-fit overflow-hidden rounded-3xl border bg-card shadow-sm xl:sticky xl:top-4">
          {!selected ? (
            <div className="p-8 text-center"><Sparkles className="mx-auto h-9 w-9 text-orange-500" /><h2 className="mt-3 font-semibold">Selecione um item</h2><p className="mt-1 text-sm text-muted-foreground">Ao abrir um item você poderá editar, anexar materiais e pedir à IA para completar os campos vazios.</p></div>
          ) : (
            <>
              <div className="flex items-start gap-3 border-b p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><Package className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1"><h2 className="line-clamp-2 font-semibold">{selected.nome}</h2><p className="mt-1 truncate text-xs text-muted-foreground">{selected.categoria} · {TYPE_LABEL[selected.tipo]}</p></div>
                <button type="button" onClick={() => setSelectedId(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
              </div>

              <div className="max-h-[calc(100vh-190px)] space-y-5 overflow-y-auto p-4">
                <div className="rounded-2xl border border-orange-200 bg-orange-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div><div className="flex items-center gap-2 text-sm font-semibold text-orange-950"><Sparkles className="h-4 w-4" /> Apoio da IA</div><p className="mt-1 text-xs leading-relaxed text-orange-800">A IA usa o que já está cadastrado e completa somente campos vazios. Nada é salvo sem sua revisão.</p></div>
                    <button type="button" onClick={() => void fillWithAi()} disabled={aiFilling} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl bg-orange-500 px-3 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-60">{aiFilling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Preencher vazios</button>
                  </div>
                </div>

                <div className="rounded-2xl border p-3">
                  <p className="mb-3 text-sm font-semibold">Cadastro principal</p>
                  <div className="space-y-3">
                    <label className="block text-xs font-medium text-muted-foreground">Nome<input value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-orange-300" /></label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-xs font-medium text-muted-foreground">Categoria<input value={form.categoria} onChange={(event) => setForm((current) => ({ ...current, categoria: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-orange-300" /></label>
                      <label className="block text-xs font-medium text-muted-foreground">Tipo<select value={form.tipo} onChange={(event) => setForm((current) => ({ ...current, tipo: event.target.value as ProductType }))} className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-orange-300"><option value="servico">Serviço</option><option value="etapa">Etapa do processo</option><option value="produto">Solução</option><option value="oferta">Oferta</option></select></label>
                    </div>
                    <label className="block text-xs font-medium text-muted-foreground">Descrição de uso<textarea value={form.descricaoUso} onChange={(event) => setForm((current) => ({ ...current, descricaoUso: event.target.value }))} rows={3} className="mt-1 w-full resize-y rounded-xl border bg-background p-3 text-sm outline-none focus:border-orange-300" /></label>
                    <label className="block text-xs font-medium text-muted-foreground">Nichos relacionados<input value={form.nichos} onChange={(event) => setForm((current) => ({ ...current, nichos: event.target.value }))} placeholder="Ex.: Farmácia, Construção, Imobiliária" className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-orange-300" /></label>
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3"><label className="flex cursor-pointer items-start justify-between gap-3"><div><p className="text-sm font-semibold text-emerald-950">Disponível para IA</p><p className="mt-1 text-xs text-emerald-800">Define se o complemento aprovado pode ser usado por geradores e agentes.</p></div><input type="checkbox" checked={form.aiEnabled} onChange={(event) => setForm((current) => ({ ...current, aiEnabled: event.target.checked }))} className="mt-1 h-4 w-4 accent-emerald-600" /></label></div>

                <section>
                  <div className="mb-3"><p className="text-sm font-semibold">Informações complementares</p><p className="mt-0.5 text-xs text-muted-foreground">Mesmo padrão da base por produto do catálogo.</p></div>
                  <div className="space-y-4">{KNOWLEDGE_FIELDS.map((field) => <label key={field.key} className="block text-xs font-medium text-muted-foreground">{field.label}<textarea value={form[field.key]} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} rows={field.rows ?? 3} placeholder={field.placeholder} className="mt-1 w-full resize-y rounded-xl border bg-background p-3 text-sm text-foreground outline-none focus:border-orange-300" /></label>)}</div>
                  <label className="mt-4 block text-xs font-medium text-muted-foreground">Tags<input value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} placeholder="Ex.: CRM, automação, vendas, WhatsApp" className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-orange-300" /></label>
                </section>

                <section className="border-t pt-4">
                  <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Arquivos anexados</p><p className="mt-0.5 text-xs text-muted-foreground">Fotos, vídeos, PDFs, documentos e referências ficam ligados a este item.</p></div><button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border bg-background px-3 text-xs font-semibold hover:bg-muted disabled:opacity-60">{uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Anexar</button></div>
                  {(selected.anexos ?? []).length === 0 ? (
                    <div className="mt-3 rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground"><Paperclip className="mx-auto mb-2 h-5 w-5" />Nenhum arquivo anexado.</div>
                  ) : (
                    <div className="mt-3 space-y-2">{(selected.anexos ?? []).map((attachment) => <div key={attachment.id} className="flex items-center gap-3 rounded-xl border p-2.5"><a href={mediaUrl(attachment.url)} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">{attachmentIcon(attachment.type)}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{attachment.nome}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{attachment.type === "image" ? "Imagem" : attachment.type === "video" ? "Vídeo" : attachment.type === "audio" ? "Áudio" : "Documento"}</p></div></a><button type="button" onClick={() => void removeAttachment(attachment.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600" title="Remover anexo"><X className="h-3.5 w-3.5" /></button></div>)}</div>
                  )}
                </section>

                <div className="sticky bottom-0 -mx-4 border-t bg-card/95 px-4 pb-1 pt-3 backdrop-blur"><button type="button" onClick={() => void saveProduct()} disabled={saving} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {saving ? "Salvando..." : "Salvar informações"}</button></div>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
