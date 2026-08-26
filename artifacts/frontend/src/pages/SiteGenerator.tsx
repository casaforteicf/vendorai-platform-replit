import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGetBusinessProfileByTenant, getGetBusinessProfileByTenantQueryKey, useRequestUploadUrl } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, Download, MessageSquare, RotateCcw, Globe, Sparkles, Quote, ImageIcon, Plus, Trash2, Upload, ShoppingCart, LayoutTemplate, Tag, Pencil, Check, X } from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────

const COLORS = [
  { hex: "#6366F1", label: "Indigo" },
  { hex: "#0EA5E9", label: "Azul" },
  { hex: "#10B981", label: "Verde" },
  { hex: "#F59E0B", label: "Âmbar" },
  { hex: "#EF4444", label: "Vermelho" },
  { hex: "#EC4899", label: "Rosa" },
  { hex: "#8B5CF6", label: "Roxo" },
  { hex: "#14B8A6", label: "Teal" },
];

const SITE_TYPES = [
  { id: "landing", icon: "📢", label: "Landing page" },
  { id: "ecommerce", icon: "🛒", label: "E-commerce" },
  { id: "institutional", icon: "🏢", label: "Institucional" },
  { id: "product", icon: "🏷️", label: "Produto específico" },
] as const;

const SUGGESTIONS = [
  "Muda a cor principal para verde",
  "Adiciona seção de depoimentos",
  "Reescreve o hero com mais urgência",
  "Adiciona uma seção de FAQ",
  "Deixa os textos mais curtos e diretos",
  "Adiciona um WhatsApp flutuante",
];

type SiteType = "landing" | "ecommerce" | "institutional" | "product";
type GeneratorStatus = "idle" | "generating" | "ready" | "error";

interface Product { name: string; price: string; }
interface SiteConfig {
  type: SiteType;
  name: string;
  sector: string;
  desc: string;
  pain: string;
  tone: string;
  cta: string;
  color: string;
  products: Product[];
  whatsapp?: string;
  instagram?: string;
  images?: string[];
  servicos?: string;
  /** Set when type === "product" — id of the single catalog product this page sells. */
  produtoId?: string;
}
interface CatalogProductOption {
  id: string;
  nome: string;
  precoBase: string;
  imagemUrl?: string | null;
  imagens?: string[] | null;
  ativo?: boolean;
}
interface ChatMessage { role: "user" | "assistant"; content: string; }
interface Testimonial {
  id: string;
  name: string;
  company: string;
  text: string;
  photoUrl: string;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

interface SiteSummary { id: string; name: string; siteType: string; updatedAt: string; }
interface BulkJobState {
  key: string;
  label: string;
  status: "pending" | "done" | "error";
  error?: string;
  siteId?: string;
  siteSlug?: string;
}

function useSiteGenerator(tenantId: string, token: string | null) {
  const [status, setStatus] = useState<GeneratorStatus>("idle");
  const [html, setHtml] = useState("");
  const [siteId, setSiteId] = useState<string | null>(null);
  const [siteSlug, setSiteSlug] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentSiteType, setCurrentSiteType] = useState<string | null>(null);
  const [currentConfig, setCurrentConfig] = useState<SiteConfig | null>(null);
  const [sitesList, setSitesList] = useState<SiteSummary[]>([]);

  const authHeaders: Record<string, string> = token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };

  const loadAll = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/tenants/${tenantId}/site-generator`, { headers: authHeaders });
      if (!res.ok) return;
      const sites = await res.json();
      setSitesList(sites ?? []);
    } catch {}
  }, [tenantId, token]);

  const loadSite = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/tenants/${tenantId}/site-generator/${id}`, { headers: authHeaders });
      if (!res.ok) return;
      const site = await res.json();
      setHtml(site.html ?? "");
      setSiteId(site.id);
      setSiteSlug(site.siteSlug ?? null);
      setIsPublished(site.published ?? false);
      setCurrentSiteType(site.siteType ?? null);
      setCurrentConfig(site.config ?? null);
      setStatus("ready");
    } catch {}
  }, [tenantId, token]);

  const loadLatest = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/tenants/${tenantId}/site-generator/latest`, { headers: authHeaders });
      if (!res.ok) return;
      const site = await res.json();
      setHtml(site.html ?? "");
      setSiteId(site.id);
      setSiteSlug(site.siteSlug ?? null);
      setIsPublished(site.published ?? false);
      setCurrentSiteType(site.siteType ?? null);
      setCurrentConfig(site.config ?? null);
      setStatus("ready");
    } catch {
      // No existing site — keep idle state
    }
  }, [tenantId, token]);

  const publish = useCallback(async () => {
    if (!siteId) return;
    const res = await fetch(`/api/tenants/${tenantId}/site-generator/${siteId}/publish`, {
      method: "POST",
      headers: authHeaders,
    });
    if (res.ok) setIsPublished(true);
  }, [siteId, tenantId, token]);

  const saveHtml = useCallback(async (newHtml: string) => {
    if (!siteId) throw new Error("Nenhum site gerado");
    const res = await fetch(`/api/tenants/${tenantId}/site-generator/${siteId}/html`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ html: newHtml }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `Erro ${res.status}`);
    }
    // Só atualiza o preview depois que a versão foi realmente persistida.
    setHtml(newHtml);
  }, [siteId, tenantId, token]);

  // Submits one generate job and polls it to completion — shared by the
  // single-site flow (generate) and the bulk flow (generateBulk), so both
  // go through the exact same request/poll/timeout logic.
  const submitAndPollJob = useCallback(async (config: SiteConfig) => {
    const startRes = await fetch(`/api/tenants/${tenantId}/site-generator/generate`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(config),
    });
    if (!startRes.ok) {
      const err = await startRes.json().catch(() => ({}));
      throw new Error(err.error ?? `Erro ${startRes.status}`);
    }
    const { jobId } = await startRes.json();
    if (!jobId) throw new Error("Resposta inválida do servidor");

    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const pollRes = await fetch(
        `/api/tenants/${tenantId}/site-generator/jobs/${jobId}`,
        { headers: authHeaders },
      );
      if (!pollRes.ok) {
        const body = await pollRes.json().catch(() => ({}));
        if (pollRes.status === 404) {
          throw new Error("A geração foi interrompida no servidor. Tente gerar novamente.");
        }
        throw new Error(body.error ?? `Erro ao acompanhar geração (${pollRes.status})`);
      }
      const job = await pollRes.json();

      if (job.status === "done") return job.result;
      if (job.status === "error") throw new Error(job.error ?? "Erro na geração");
      // status === "pending" → keep polling
    }
    throw new Error("Tempo limite excedido. Tente novamente.");
  }, [tenantId, token]);

  const generate = useCallback(async (config: SiteConfig) => {
    setStatus("generating");
    setError(null);
    setHtml("");
    setSiteId(null);
    setSiteSlug(null);
    setHistory([]);
    setCurrentSiteType(config.type);
    setCurrentConfig(config);

    try {
      const site = await submitAndPollJob(config);
      setHtml(site.html);
      setSiteId(site.id);
      setSiteSlug(site.siteSlug ?? null);
      setCurrentSiteType(site.siteType ?? config.type);
      setCurrentConfig(site.config ?? config);
      setHistory([
        { role: "user", content: `Gerar site para: ${config.name}` },
        { role: "assistant", content: site.html },
      ]);
      setStatus("ready");
      setSitesList((prev) => {
        const filtered = prev.filter((s: SiteSummary) => s.id !== site.id);
        return [{ id: site.id, name: site.name, siteType: site.siteType, updatedAt: site.updatedAt }, ...filtered];
      });
    } catch (err: any) {
      setStatus("error");
      setError(err.message ?? "Erro desconhecido");
    }
  }, [tenantId, token, submitAndPollJob]);

  // Fires N generate jobs concurrently (one per item) and tracks each one's
  // progress independently — used to generate several product landing pages
  // (or any other combination of sites) in a single action.
  const [bulkJobs, setBulkJobs] = useState<BulkJobState[]>([]);
  const [bulkRunning, setBulkRunning] = useState(false);

  const generateBulk = useCallback(async (items: Array<{ key: string; label: string; config: SiteConfig }>) => {
    setBulkRunning(true);
    setBulkJobs(items.map((it) => ({ key: it.key, label: it.label, status: "pending" })));

    await Promise.all(items.map(async (it) => {
      try {
        const site = await submitAndPollJob(it.config);
        setSitesList((prev) => {
          const filtered = prev.filter((s: SiteSummary) => s.id !== site.id);
          return [{ id: site.id, name: site.name, siteType: site.siteType, updatedAt: site.updatedAt }, ...filtered];
        });
        setBulkJobs((prev) => prev.map((j) => (j.key === it.key
          ? { ...j, status: "done", siteId: site.id, siteSlug: site.siteSlug ?? undefined }
          : j)));
      } catch (err: any) {
        setBulkJobs((prev) => prev.map((j) => (j.key === it.key
          ? { ...j, status: "error", error: err.message ?? "Erro desconhecido" }
          : j)));
      }
    }));

    setBulkRunning(false);
  }, [submitAndPollJob]);

  const clearBulk = useCallback(() => {
    setBulkJobs([]);
  }, []);

  const refine = useCallback(async (message: string): Promise<string> => {
    if (!siteId) throw new Error("Nenhum site gerado");

    const res = await fetch(`/api/tenants/${tenantId}/site-generator/${siteId}/refine`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ message, history }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `Erro ${res.status}`);
    }
    const data = await res.json();
    setHtml(data.html);
    setHistory((h) => [
      ...h,
      { role: "user", content: message },
      { role: "assistant", content: data.html },
    ]);
    return data.html;
  }, [siteId, tenantId, token, history]);

  const download = useCallback(async (filename = "site") => {
    if (!html) return;

    // Collect all unique src/href URLs that reference images
    const srcRe = /\b(src|href)=["']([^"']+\.(png|jpg|jpeg|gif|webp|svg|ico))["']/gi;
    const urlSet = new Set<string>();
    for (const m of html.matchAll(srcRe)) { urlSet.add(m[2]!); }

    // Also pick up CSS url(...) background images
    const cssRe = /url\(["']?([^"')]+\.(png|jpg|jpeg|gif|webp|svg|ico))["']?\)/gi;
    for (const m of html.matchAll(cssRe)) { urlSet.add(m[1]!); }

    // Convert each to base64 data URL (skip if already data: or fails to fetch)
    const replacements = new Map<string, string>();
    await Promise.all(Array.from(urlSet).map(async (url) => {
      if (url.startsWith('data:')) return;
      try {
        const absolute = url.startsWith('http') ? url : url.startsWith('/') ? url : `/${url}`;
        const res = await fetch(absolute, { credentials: 'include' });
        if (!res.ok) return;
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        replacements.set(url, dataUrl);
      } catch { /* skip */ }
    }));

    // Apply replacements (longest-first to avoid partial-URL collisions)
    let inlined = html;
    const sorted = Array.from(replacements.entries()).sort((a, b) => b[0].length - a[0].length);
    for (const [orig, dataUrl] of sorted) {
      const escaped = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      inlined = inlined.replace(new RegExp(escaped, 'g'), dataUrl);
    }

    const blobOut = new Blob([inlined], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blobOut);
    a.download = filename.toLowerCase().replace(/\s+/g, '-') + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }, [html]);

  const reset = useCallback(() => {
    setStatus("idle");
    setHtml("");
    setSiteId(null);
    setHistory([]);
    setError(null);
    setCurrentSiteType(null);
    setCurrentConfig(null);
  }, []);

  const renameSite = useCallback(async (id: string, name: string) => {
    const res = await fetch(`/api/tenants/${tenantId}/site-generator/${id}/name`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `Erro ${res.status}`);
    }
    setSitesList((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  }, [tenantId, token]);

  return {
    status, html, siteId, siteSlug, isPublished, error, currentSiteType, currentConfig, sitesList,
    generate, generateBulk, bulkJobs, bulkRunning, clearBulk,
    refine, download, reset, loadLatest, loadAll, loadSite, saveHtml, publish, renameSite,
  };
}

// ── ConfigForm ─────────────────────────────────────────────────────────────────

function ConfigForm({ tenantId, token, onGenerate, onGenerateBulk }: {
  tenantId: string;
  token: string | null;
  onGenerate: (config: SiteConfig) => void;
  onGenerateBulk: (items: Array<{ key: string; label: string; config: SiteConfig }>) => void;
}) {
  const [siteType, setSiteType] = useState<SiteType>("landing");
  const [color, setColor] = useState("#6366F1");
  const [tone, setTone] = useState("profissional");
  const [products, setProducts] = useState<Product[]>([{ name: "", price: "" }]);
  const [images, setImages] = useState<string[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProductOption[]>([]);
  // Vários produtos podem ser marcados: 1 selecionado gera aquela página só
  // (fluxo de sempre, vai pro Preview); mais de 1 dispara uma LP para cada
  // produto de uma vez (fluxo em massa).
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  const requestUploadUrl = useRequestUploadUrl();
  const { toast } = useToast();

  // Load the catalog product list only when the "Produto específico" tab is
  // selected — that's the only mode that needs it.
  useEffect(() => {
    if (siteType !== "product" || !tenantId) return;
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`/api/tenants/${tenantId}/produtos-catalogo`, { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setCatalogProducts(Array.isArray(rows) ? rows.filter((p: CatalogProductOption) => p.ativo !== false) : []))
      .catch(() => setCatalogProducts([]));
  }, [siteType, tenantId, token]);

  const { data: bp } = useGetBusinessProfileByTenant(tenantId, {
    query: { queryKey: getGetBusinessProfileByTenantQueryKey(tenantId), enabled: !!tenantId },
  });

  const nomeNegocio = bp?.nomeFantasia ?? bp?.razaoSocial ?? "";
  const setor = bp?.vertical ?? "";
  const descNegocio = bp?.diferenciais || bp?.publicoAlvo || "";
  const telefone = bp?.telefone ?? "";
  const logoUrl = bp?.logoUrl ?? "";

  async function uploadOneImage(file: File): Promise<void> {
    setUploadingCount((n) => n + 1);
    try {
      const result = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
        requestUploadUrl.mutate(
          { data: { name: file.name, size: file.size, contentType: file.type || "image/jpeg" } },
          { onSuccess: resolve, onError: reject },
        );
      });
      const putRes = await fetch(result.uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "image/jpeg" },
      });
      if (!putRes.ok) throw new Error("Upload falhou");
      setImages((prev) => [...prev, `${window.location.origin}/api/storage/${result.objectPath}`]);
    } catch {
      toast({ title: `Erro ao enviar "${file.name}". Tente novamente.`, variant: "destructive" });
    } finally {
      setUploadingCount((n) => n - 1);
    }
  }

  async function handleImagesUpload(files: File[]) {
    for (const file of files) {
      await uploadOneImage(file);
    }
  }

  function addProduct() { setProducts((p) => [...p, { name: "", price: "" }]); }
  function removeProduct(i: number) { setProducts((p) => p.filter((_, idx) => idx !== i)); }
  function updateProduct(i: number, field: keyof Product, value: string) {
    setProducts((p) => p.map((prod, idx) => (idx === i ? { ...prod, [field]: value } : prod)));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (siteType === "product" && selectedProductIds.length === 0) return; // guarded by disabled submit button too
    const fd = new FormData(e.currentTarget);

    const baseConfig: Omit<SiteConfig, "produtoId"> = {
      type: siteType,
      name: nomeNegocio || (fd.get("name") as string) || "",
      sector: setor || (fd.get("sector") as string) || "",
      desc: descNegocio || (fd.get("desc") as string) || "",
      pain: fd.get("pain") as string,
      tone,
      cta: fd.get("cta") as string,
      color,
      products: products.filter((p) => p.name.trim()),
      whatsapp: telefone || (fd.get("whatsapp") as string) || "",
      instagram: (fd.get("instagram") as string) || "",
      images: images.filter(Boolean),
      servicos: (fd.get("servicos") as string) || "",
    };

    if (siteType === "product" && selectedProductIds.length > 1) {
      // Vários produtos marcados → gera uma LP para cada um, em paralelo.
      onGenerateBulk(
        selectedProductIds.map((id) => {
          const p = catalogProducts.find((cp) => cp.id === id);
          return {
            key: id,
            label: p?.nome ?? id,
            config: { ...baseConfig, produtoId: id },
          };
        }),
      );
      return;
    }

    onGenerate({
      ...baseConfig,
      produtoId: siteType === "product" ? selectedProductIds[0] : undefined,
    });
  }

  const missingName = !nomeNegocio;
  const missingSetor = !setor;
  const missingDesc = !descNegocio;

  const profileItems = [
    nomeNegocio && { label: "Nome", value: nomeNegocio },
    setor && { label: "Setor", value: setor },
    descNegocio && { label: "Descrição", value: descNegocio.length > 80 ? descNegocio.slice(0, 80) + "…" : descNegocio },
    telefone && { label: "WhatsApp", value: telefone },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">

      {/* ── Tipo de site ── */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Tipo de site</Label>
        <div className="grid grid-cols-3 gap-2">
          {SITE_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSiteType(t.id)}
              className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm font-medium transition-all cursor-pointer ${
                siteType === t.id
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-foreground"
              }`}
            >
              <span className="text-2xl leading-none">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Dados do perfil (auto-preenchidos) ── */}
      {profileItems.length > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50/50 dark:border-green-900/40 dark:bg-green-950/20 px-4 py-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-green-800 dark:text-green-400 uppercase tracking-wider">✓ Do seu perfil</span>
            <a href={`${import.meta.env.BASE_URL}configuracoes?tab=perfil`} target="_blank" rel="noreferrer" className="text-[10px] text-green-700 dark:text-green-500 underline underline-offset-2 hover:no-underline">
              Editar perfil →
            </a>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {profileItems.map((f) => (
              <div key={f.label} className="flex items-start gap-1.5 text-xs col-span-1">
                <span className="text-muted-foreground shrink-0 w-20">{f.label}:</span>
                <span className="text-foreground font-medium line-clamp-1">{f.value}</span>
              </div>
            ))}
            {logoUrl && (
              <div className="flex items-center gap-1.5 text-xs col-span-1">
                <span className="text-muted-foreground shrink-0 w-20">Logo:</span>
                <img
                  src={logoUrl.startsWith("/objects/") ? `/api/storage${logoUrl}` : logoUrl}
                  alt="Logo"
                  className="h-5 w-auto max-w-[70px] object-contain rounded"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Campos ausentes do perfil ── */}
      {(missingName || missingSetor || missingDesc) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20 px-4 py-3 flex flex-col gap-3">
          <p className="text-xs text-amber-800 dark:text-amber-400">
            ⚠ Dados não encontrados no perfil. Preencha aqui ou{" "}
            <a href={`${import.meta.env.BASE_URL}configuracoes?tab=perfil`} target="_blank" rel="noreferrer" className="underline underline-offset-2">complete seu perfil</a>.
          </p>
          {missingName && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="sg-name" className="text-xs">Nome do negócio *</Label>
              <Input id="sg-name" name="name" required placeholder="Ex: Floricultura Primavera" />
            </div>
          )}
          {missingSetor && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="sg-sector" className="text-xs">Setor / nicho</Label>
              <Input id="sg-sector" name="sector" placeholder="Ex: floricultura, consultoria" />
            </div>
          )}
          {missingDesc && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="sg-desc" className="text-xs">O que o negócio faz *</Label>
              <Textarea id="sg-desc" name="desc" rows={2} required placeholder="Descreva em 1-2 frases o que o negócio faz e para quem" />
            </div>
          )}
        </div>
      )}

      {/* ── Questionário ── */}
      <div className="flex flex-col gap-3">
        <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Perguntas para o site</Label>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sg-pain" className="text-sm font-medium">
            Qual a maior dificuldade do seu cliente ideal? <span className="text-destructive">*</span>
          </Label>
          <Input
            id="sg-pain"
            name="pain"
            required
            placeholder="Ex: não consigo encontrar flores frescas de qualidade na cidade"
          />
          <p className="text-[10px] text-muted-foreground">Usado para criar um headline que ressoa com o problema real do cliente</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sg-cta" className="text-sm font-medium">O que você quer que o visitante faça?</Label>
          <Input id="sg-cta" name="cta" placeholder="Ex: Solicitar orçamento, Comprar agora, Agendar visita" />
        </div>

        {!telefone && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sg-whatsapp" className="text-sm font-medium">WhatsApp para contato</Label>
            <PhoneInput id="sg-whatsapp" name="whatsapp" />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sg-instagram" className="text-sm font-medium">
            Instagram{" "}
            <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground text-sm">@</span>
            <Input
              id="sg-instagram"
              name="instagram"
              placeholder="seunegocio"
              className="pl-7"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">Aparece no rodapé do site com link direto para o perfil</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sg-servicos" className="text-sm font-medium">
            Principais serviços / produtos{" "}
            <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Textarea
            id="sg-servicos"
            name="servicos"
            rows={2}
            placeholder="Ex: Buquês personalizados, arranjos para eventos, coroas, delivery"
          />
          <p className="text-[10px] text-muted-foreground">Liste o que aparece no site — o mais completo, melhor o resultado</p>
        </div>
      </div>

      {/* ── Fotos da empresa/serviços ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Fotos da empresa</Label>
          <span className="text-[10px] text-muted-foreground">Opcional — mas melhora muito o resultado</span>
        </div>
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((url, i) => (
              <div key={i} className="relative group">
                <img
                  src={url}
                  alt={`Foto ${i + 1}`}
                  className="h-20 w-20 object-cover rounded-lg border border-border"
                />
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <label className={`cursor-pointer ${uploadingCount > 0 ? "pointer-events-none opacity-60" : ""}`}>
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              handleImagesUpload(files);
              e.target.value = "";
            }}
          />
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors">
            {uploadingCount > 0
              ? <><Loader2 className="h-4 w-4 animate-spin shrink-0" />Enviando foto {uploadingCount > 1 ? `(${uploadingCount} restantes)` : ""}…</>
              : <><Upload className="h-4 w-4 shrink-0" />+ Adicionar fotos do local, produto ou serviço</>
            }
          </div>
        </label>
      </div>

      {/* ── Produtos — só e-commerce ── */}
      {siteType === "ecommerce" && (
        <div className="flex flex-col gap-2">
          <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Produtos</Label>
          <p className="text-xs text-muted-foreground rounded-md bg-muted/60 border border-dashed px-3 py-2">
            🛒 Os produtos do seu <strong>Catálogo de Produtos</strong> serão incluídos automaticamente (com imagens, preços e estoque real). Adicione extras abaixo se quiser.
          </p>
          {products.map((p, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input placeholder="Nome do produto" value={p.name} onChange={(e) => updateProduct(i, "name", e.target.value)} />
              <Input placeholder="R$ 0,00" value={p.price} onChange={(e) => updateProduct(i, "price", e.target.value)} className="w-28" />
              {products.length > 1 && (
                <Button type="button" variant="outline" size="icon" onClick={() => removeProduct(i)} className="shrink-0 text-destructive hover:border-destructive hover:text-destructive">✕</Button>
              )}
            </div>
          ))}
          <Button type="button" variant="ghost" className="self-start text-primary" onClick={addProduct}>+ Adicionar produto extra</Button>
        </div>
      )}

      {/* ── Produto(s) — landing de produto específico, pode marcar vários ── */}
      {siteType === "product" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Produto(s) do catálogo *</Label>
            {catalogProducts.length > 0 && (
              <button
                type="button"
                className="text-[10px] text-primary underline underline-offset-2 hover:no-underline"
                onClick={() => setSelectedProductIds((prev) =>
                  prev.length === catalogProducts.length ? [] : catalogProducts.map((p) => p.id))}
              >
                {selectedProductIds.length === catalogProducts.length ? "Limpar seleção" : "Selecionar todos"}
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground rounded-md bg-muted/60 border border-dashed px-3 py-2">
            🏷️ Marque 1 produto para gerar só a página dele, ou marque vários para gerar uma landing page para cada um de uma vez. Nome, preço, fotos e especificações vêm direto do seu Catálogo de Produtos.
          </p>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y">
            {catalogProducts.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum produto ativo encontrado no catálogo.</div>
            )}
            {catalogProducts.map((p) => {
              const checked = selectedProductIds.includes(p.id);
              return (
                <label
                  key={p.id}
                  className={`flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer transition-colors ${checked ? "bg-primary/5" : "hover:bg-muted/50"}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setSelectedProductIds((prev) =>
                      checked ? prev.filter((id) => id !== p.id) : [...prev, p.id])}
                    className="h-4 w-4 shrink-0 accent-primary"
                  />
                  <span className="flex-1 truncate">{p.nome}</span>
                  <span className="text-xs text-muted-foreground shrink-0">R$ {parseFloat(p.precoBase).toFixed(2).replace(".", ",")}</span>
                </label>
              );
            })}
          </div>
          {selectedProductIds.length > 1 && (
            <p className="text-[10px] text-primary font-medium">
              ✦ {selectedProductIds.length} produtos marcados — vai gerar {selectedProductIds.length} landing pages, uma para cada um.
            </p>
          )}
        </div>
      )}

      {/* ── Aparência e tom ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label>Cor principal</Label>
          <div className="flex gap-2 flex-wrap py-1">
            {COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                title={c.label}
                aria-label={c.label}
                aria-pressed={color === c.hex}
                onClick={() => setColor(c.hex)}
                className={`w-7 h-7 rounded-full border-2 transition-all cursor-pointer ${color === c.hex ? "border-foreground scale-110" : "border-transparent"}`}
                style={{ background: c.hex }}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sg-tone">Tom de voz</Label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger id="sg-tone"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="profissional">Profissional e confiável</SelectItem>
              <SelectItem value="amigavel">Amigável e próximo</SelectItem>
              <SelectItem value="urgente">Urgente e direto</SelectItem>
              <SelectItem value="premium">Premium e sofisticado</SelectItem>
              <SelectItem value="descontraido">Descontraído e criativo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        type="submit"
        size="lg"
        className="mt-1 w-full font-semibold"
        disabled={uploadingCount > 0 || (siteType === "product" && selectedProductIds.length === 0)}
      >
        {uploadingCount > 0
          ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando fotos…</>
          : selectedProductIds.length > 1
            ? `✦ Gerar ${selectedProductIds.length} landing pages com IA`
            : "✦ Gerar site com IA"
        }
      </Button>
    </form>
  );
}

// ── Inline editing script injected into the preview iframe ─────────────────────

const INLINE_EDIT_SCRIPT = `
<script id="__ve_editor__">
(function(){
  var TAGS=['h1','h2','h3','h4','h5','h6','p','span','a','button','li','td','th','label','strong','em','small','div'];
  var css=document.createElement('style');
  css.id='__ve_style__';
  css.textContent=
    '[data-ve-editable]:hover{outline:2px dashed #818cf8!important;outline-offset:2px;cursor:text!important;}'+
    '[data-ve-editable]:focus{outline:2px solid #6366f1!important;outline-offset:2px;background:rgba(99,102,241,0.06)!important;border-radius:2px;}'+
    '[data-ve-img]:hover .ve-img-overlay{opacity:1!important;}'+
    '.ve-img-wrap{position:relative;display:inline-block;width:100%;}'+
    '.ve-img-overlay{position:absolute;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;gap:8px;opacity:0;transition:opacity .18s;border-radius:inherit;z-index:9;}'+
    '.ve-img-overlay button{color:#fff;font:600 13px system-ui;border:1px solid rgba(255,255,255,.65);background:rgba(15,23,42,.72);padding:7px 10px;border-radius:7px;cursor:pointer;text-shadow:0 1px 4px rgba(0,0,0,.5);}'+
    '.ve-img-overlay button:hover{background:#4f46e5}.ve-img-overlay button.ve-img-delete:hover{background:#dc2626;}'+
    '.ve-sec-ctrl{position:absolute;top:6px;right:8px;display:none;gap:4px;z-index:100;}'+
    '[data-ve-sec]:hover>.ve-sec-ctrl{display:flex!important;}'+
    '[data-ve-sec]{position:relative;}'+
    '.ve-sec-btn{background:rgba(30,30,40,.82);color:#fff;border:none;border-radius:5px;padding:3px 7px;font-size:11px;cursor:pointer;line-height:1.4;backdrop-filter:blur(4px);}'+
    '.ve-sec-btn:hover{background:#4f46e5;}.ve-sec-btn.del:hover{background:#dc2626;}'+
    '#__ve_fmt__{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:99999;background:rgba(15,15,25,.94);padding:5px 10px;border-radius:10px;display:none;align-items:center;gap:5px;box-shadow:0 4px 20px rgba(0,0,0,.5);backdrop-filter:blur(12px);}'+
    '.__ve_fmtbtn{background:none;border:none;color:#e2e8f0;cursor:pointer;padding:3px 7px;border-radius:5px;font-size:13px;transition:background .12s;min-width:28px;}'+
    '.__ve_fmtbtn:hover{background:rgba(255,255,255,.18);}'+
    '.__ve_fmtsep{width:1px;height:18px;background:rgba(255,255,255,.2);margin:0 3px;}'+
    '.__ve_fmtsel{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#e2e8f0;padding:2px 5px;border-radius:5px;font-size:12px;cursor:pointer;}'+
    '.__ve_fmtclr{width:26px;height:22px;padding:0;border:1px solid rgba(255,255,255,.2);border-radius:4px;cursor:pointer;background:transparent;}';
  document.head.appendChild(css);

  /* ── send(): clones the live DOM and strips every editor-only artifact
     (controls, wrappers, attributes, injected style/toolbar) before
     serializing — so what gets saved/published is always clean HTML,
     never the WYSIWYG editing state. ── */
  function send(editKind){
    var clone=document.documentElement.cloneNode(true);
    ['#__ve_editor__','#__ve_style__','#__ve_fmt__','.ve-sec-ctrl','.ve-img-overlay','.ve-ph-overlay'].forEach(function(sel){
      clone.querySelectorAll(sel).forEach(function(el){el.remove();});
    });
    clone.querySelectorAll('[data-ve-sec]').forEach(function(el){el.removeAttribute('data-ve-sec');});
    clone.querySelectorAll('[data-ve-editable]').forEach(function(el){el.removeAttribute('data-ve-editable');el.removeAttribute('contenteditable');});
    clone.querySelectorAll('span.ve-img-wrap[data-ve-img]').forEach(function(wrap){
      var img=wrap.querySelector('img');
      if(img)wrap.replaceWith(img);
    });
    clone.querySelectorAll('[data-ve-img]').forEach(function(el){el.removeAttribute('data-ve-img');});
    window.parent.postMessage({type:'ve-html-edit',editKind:editKind||'manual',html:'<!DOCTYPE html>'+clone.outerHTML},'*');
  }

  /* ── formatting toolbar ── */
  var fmtEl=null,activeEl=null;
  function getFmt(){
    if(fmtEl)return fmtEl;
    fmtEl=document.createElement('div');fmtEl.id='__ve_fmt__';

    function btn(html,cmd,val){
      var b=document.createElement('button');b.className='__ve_fmtbtn';b.innerHTML=html;
      b.addEventListener('mousedown',function(e){e.preventDefault();document.execCommand(cmd,false,val||null);send();});
      return b;
    }
    function sep(){var s=document.createElement('div');s.className='__ve_fmtsep';return s;}

    fmtEl.appendChild(btn('<b>B</b>','bold'));
    fmtEl.appendChild(btn('<i>I</i>','italic'));
    fmtEl.appendChild(btn('<u>U</u>','underline'));
    fmtEl.appendChild(sep());

    var szLbl=document.createElement('span');szLbl.textContent='Tam:';szLbl.style.cssText='color:#94a3b8;font-size:11px;white-space:nowrap;';
    fmtEl.appendChild(szLbl);
    var sz=document.createElement('select');sz.className='__ve_fmtsel';
    [['12px','12'],['14px','14'],['16px','16'],['20px','20'],['24px','24'],['32px','32'],['48px','48']].forEach(function(o){
      var opt=document.createElement('option');opt.value=o[0];opt.textContent=o[1]+'px';
      if(o[0]==='16px')opt.selected=true;
      sz.appendChild(opt);
    });
    sz.addEventListener('change',function(){
      document.execCommand('fontSize',false,'7');
      document.querySelectorAll('font[size="7"]').forEach(function(f){f.removeAttribute('size');f.style.fontSize=sz.value;});
      send();
    });
    fmtEl.appendChild(sz);
    fmtEl.appendChild(sep());

    var clrLbl=document.createElement('span');clrLbl.textContent='Cor:';clrLbl.style.cssText='color:#94a3b8;font-size:11px;';
    fmtEl.appendChild(clrLbl);
    var clr=document.createElement('input');clr.type='color';clr.value='#111827';clr.className='__ve_fmtclr';
    clr.addEventListener('change',function(){document.execCommand('foreColor',false,clr.value);send();});
    fmtEl.appendChild(clr);

    document.body.appendChild(fmtEl);
    return fmtEl;
  }
  function showFmt(){getFmt().style.display='flex';}
  function hideFmt(){if(fmtEl)fmtEl.style.display='none';}

  /* ── text editing ── */
  function setupText(el){
    if(el.__ve)return;el.__ve=true;
    if(!el.textContent.trim())return;
    // skip large container divs (has many block children)
    var blockTags=/^(DIV|SECTION|ARTICLE|NAV|HEADER|FOOTER|MAIN|ASIDE|UL|OL|TABLE|TBODY|TR|FORM)$/;
    if(el.tagName==='DIV'||el.tagName==='SPAN'){
      var hasBlockChild=false;
      Array.from(el.children).forEach(function(c){if(blockTags.test(c.tagName))hasBlockChild=true;});
      if(hasBlockChild)return;
    }
    el.setAttribute('data-ve-editable','1');
    el.addEventListener('click',function(e){e.stopPropagation();activeEl=el;el.contentEditable='true';el.focus();showFmt();});
    el.addEventListener('blur',function(){
      setTimeout(function(){
        if(document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#__ve_fmt__'))return;
        el.contentEditable='false';hideFmt();send();
      },150);
    });
    el.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();el.blur();}if(e.key==='Escape'){el.contentEditable='false';hideFmt();}});
  }

  /* ── image editing ── */
  var imgs=[];
  function setupImg(img,index){
    if(img.__veImg)return;img.__veImg=true;imgs[index]=img;
    var par=img.parentElement;if(!par)return;
    if(!par.classList.contains('ve-img-wrap')){
      var wrap=document.createElement('span');
      wrap.className='ve-img-wrap';wrap.setAttribute('data-ve-img','1');
      par.insertBefore(wrap,img);wrap.appendChild(img);par=wrap;
    }
    if(!par.querySelector('.ve-img-overlay')){
      var ov=document.createElement('div');ov.className='ve-img-overlay';
      var swap=document.createElement('button');swap.type='button';swap.textContent='🖼 Trocar';
      swap.addEventListener('click',function(e){e.stopPropagation();window.parent.postMessage({type:'ve-img-pick',mode:'img',imgIndex:index},'*');});
      var del=document.createElement('button');del.type='button';del.className='ve-img-delete';del.textContent='✕ Excluir';
      del.addEventListener('click',function(e){e.stopPropagation();if(confirm('Excluir esta imagem do site?')){par.remove();send('image');}});
      ov.appendChild(swap);ov.appendChild(del);par.appendChild(ov);
    }
  }

  /* ── placeholder div editing (CSS gradient / empty gallery slots) ── */
  var placeholderEls=[];
  function setupImgPlaceholder(el,index){
    if(el.__vePh)return;
    var style=(el.getAttribute('style')||'').toLowerCase();
    var text=(el.textContent||'').trim();
    var cls=(el.className||'').toLowerCase();
    var isGrad=style.includes('gradient')||(style.includes('background')&&!el.querySelector('img'));
    var isPlus=text==='+'||text==='✚'||text==='adicionar foto'||text==='clique para adicionar foto';
    var isGalCls=!!(cls.match(/gallery|galeria|foto|photo|img-ph|thumb|pic|portfolio|project|placeholder/));
    if(!isGrad&&!isPlus&&!isGalCls)return;
    if(el.querySelector('img'))return; // already has real image
    el.__vePh=true;
    placeholderEls[index]=el;
    el.style.cursor='pointer';
    if(!el.style.position||el.style.position==='static')el.style.position='relative';
    var ov=document.createElement('div');
    ov.className='ve-ph-overlay';
    ov.style.cssText='position:absolute;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .18s;cursor:pointer;border-radius:inherit;z-index:9;';
    var lbl=document.createElement('span');
    lbl.style.cssText='color:#fff;font-size:13px;font-weight:600;pointer-events:none;text-shadow:0 1px 4px rgba(0,0,0,.5);';
    lbl.textContent='🖼 Adicionar foto';
    ov.appendChild(lbl);el.appendChild(ov);
    el.addEventListener('mouseenter',function(){ov.style.opacity='1';});
    el.addEventListener('mouseleave',function(){ov.style.opacity='0';});
    el.addEventListener('click',function(e){e.stopPropagation();window.parent.postMessage({type:'ve-img-pick',mode:'placeholder',imgIndex:index},'*');});
  }

  /* ── sections: detect, report, setup controls ── */
  function getSections(){
    var body=document.body;
    var main=body.querySelector('main')||body;
    var secs=[];
    main.querySelectorAll(':scope>section,:scope>article').forEach(function(el){secs.push(el);});
    if(secs.length<2){
      secs=[];
      Array.from(main.children).forEach(function(el){
        var t=el.tagName;
        if(t==='SECTION'||t==='ARTICLE'||(t==='DIV'&&(el.id||el.className.match(/[a-z]{3,}/i))))secs.push(el);
      });
    }
    return secs;
  }

  function reportSections(){
    var secs=getSections();
    var list=secs.map(function(el,i){
      var h=el.querySelector('h1,h2,h3');
      var raw=h?h.textContent.trim():(el.id||'');
      var title=(raw.slice(0,36)||(el.className.split(' ').filter(function(c){return c.length>2;})[0]||('Seção '+(i+1))));
      return {index:i,title:title};
    });
    window.parent.postMessage({type:'ve-sections',sections:list},'*');
  }

  function setupSections(){
    // remove existing controls first (re-init after reorder)
    document.querySelectorAll('.ve-sec-ctrl').forEach(function(el){el.remove();});
    document.querySelectorAll('[data-ve-sec]').forEach(function(el){el.removeAttribute('data-ve-sec');delete el.__veSec;});
    var secs=getSections();
    secs.forEach(function(sec,i){
      sec.__veSec=true;sec.setAttribute('data-ve-sec','1');
      var ctrl=document.createElement('div');ctrl.className='ve-sec-ctrl';
      function mkBtn(txt,cls,fn){var b=document.createElement('button');b.className='ve-sec-btn'+(cls?' '+cls:'');b.textContent=txt;b.addEventListener('click',function(e){e.stopPropagation();fn();});ctrl.appendChild(b);}
      if(i>0)mkBtn('↑ Subir','',function(){var p=sec.previousElementSibling;if(p){sec.parentNode.insertBefore(sec,p);send();setupSections();reportSections();}});
      if(i<secs.length-1)mkBtn('↓ Descer','',function(){var n=sec.nextElementSibling;if(n){sec.parentNode.insertBefore(n,sec);send();setupSections();reportSections();}});
      mkBtn('✕ Remover','del',function(){if(confirm('Remover esta seção?')){sec.remove();send();setupSections();reportSections();}});
      sec.insertBefore(ctrl,sec.firstChild);
    });
    reportSections();
  }

  window.addEventListener('message',function(e){
    if(!e.data)return;
    if(e.data.type==='ve-img-set'){
      if(e.data.mode==='placeholder'){
        var ph=placeholderEls[e.data.imgIndex];
        if(ph){
          var newImg=document.createElement('img');
          newImg.src=e.data.newSrc;
          newImg.alt='Foto';
          newImg.loading='lazy';
          newImg.style.cssText='width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit;';
          ph.innerHTML='';ph.appendChild(newImg);
          setupImg(newImg,imgs.length);
          send('image');
        }
      } else {
        var img=imgs[e.data.imgIndex];if(img){img.src=e.data.newSrc;send('image');}
      }
    }
    if(e.data.type==='ve-inject-section'){
      var tpl=e.data.html;
      var footer=document.querySelector('footer');
      if(footer){footer.insertAdjacentHTML('beforebegin',tpl);}
      else{document.body.insertAdjacentHTML('beforeend',tpl);}
      send();setupSections();reportSections();
    }
    if(e.data.type==='ve-section-move'){
      var secs=getSections();
      var from=e.data.from,to=e.data.to;
      if(from<0||to<0||from>=secs.length||to>=secs.length||from===to)return;
      var el=secs[from],ref=secs[to];
      if(to<from){ref.parentNode.insertBefore(el,ref);}
      else{ref.parentNode.insertBefore(el,ref.nextSibling);}
      send();setupSections();reportSections();
    }
    if(e.data.type==='ve-section-delete'){
      var secs2=getSections();
      var idx=e.data.index;
      if(idx>=0&&idx<secs2.length){secs2[idx].remove();send();setupSections();reportSections();}
    }
  });

  function init(){
    TAGS.forEach(function(t){document.querySelectorAll(t).forEach(setupText);});
    document.querySelectorAll('img').forEach(function(img,i){setupImg(img,i);});
    // detect CSS gradient placeholder divs (gallery slots without real images)
    var phCount=0;
    document.querySelectorAll('div,section').forEach(function(el){
      if(phCount>=30)return;
      var before=Object.keys(placeholderEls).length;
      setupImgPlaceholder(el,1000+phCount);
      if(Object.keys(placeholderEls).length>before)phCount++;
    });
    setupSections();
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}
})();
</script>`;

function injectEditScript(html: string): string {
  if (html.includes('__ve_editor__')) return html;
  const idx = html.lastIndexOf('</body>');
  if (idx !== -1) return html.slice(0, idx) + INLINE_EDIT_SCRIPT + html.slice(idx);
  return html + INLINE_EDIT_SCRIPT;
}

/**
 * Removes every trace of the WYSIWYG editor (script, injected style/toolbar,
 * section controls, image-swap overlays, data-ve-* attributes) from an HTML
 * string before it's saved or published. Uses a real DOM parse rather than
 * regex so nested editor markup is fully removed, not just the <script> tag.
 * Also acts as a safety net for HTML that was saved before this cleanup
 * existed and still carries leftover editor markup.
 */
function stripEditScript(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.getElementById("__ve_editor__")?.remove();
    doc.getElementById("__ve_style__")?.remove();
    doc.getElementById("__ve_fmt__")?.remove();
    doc.querySelectorAll(".ve-sec-ctrl, .ve-img-overlay, .ve-ph-overlay").forEach((el) => el.remove());
    doc.querySelectorAll("[data-ve-sec]").forEach((el) => el.removeAttribute("data-ve-sec"));
    doc.querySelectorAll("[data-ve-editable]").forEach((el) => {
      el.removeAttribute("data-ve-editable");
      el.removeAttribute("contenteditable");
    });
    doc.querySelectorAll("span.ve-img-wrap[data-ve-img]").forEach((wrap) => {
      const img = wrap.querySelector("img");
      if (img) wrap.replaceWith(img);
    });
    doc.querySelectorAll("[data-ve-img]").forEach((el) => el.removeAttribute("data-ve-img"));
    return "<!DOCTYPE html>" + doc.documentElement.outerHTML;
  } catch {
    // Fallback: at least strip the editor <script> tag if DOM parsing fails
    return html.replace(/<script\s+id="__ve_editor__"[\s\S]*?<\/script>/i, "");
  }
}

// ── Section templates for "Add Section" ────────────────────────────────────────

const SECTION_TEMPLATES: Array<{ id: string; label: string; icon: string; prompt: string }> = [
  { id: 'gallery', label: 'Galeria de Fotos', icon: '🖼️', prompt: 'Adicione uma seção de galeria de fotos ao site. Use um grid responsivo de 3 colunas com tags <img> reais (use src de imagens Unsplash relacionadas ao setor, ex: https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&h=400&fit=crop), alt descritivo e loading="lazy". Não use gradiente CSS como placeholder de imagem — use sempre <img> com URLs reais.' },
  { id: 'team', label: 'Nossa Equipe', icon: '👥', prompt: 'Adicione uma seção "Nossa Equipe" com 3 cards de membros (foto placeholder circular, nome, cargo e breve bio). Use o mesmo estilo visual do site.' },
  { id: 'services', label: 'Serviços', icon: '⚙️', prompt: 'Adicione uma seção de Serviços com 4 cards (ícone SVG, título, descrição breve). Use o mesmo estilo visual e cores do site.' },
  { id: 'contact', label: 'Formulário de Contato', icon: '📬', prompt: 'Adicione uma seção de Contato com formulário (Nome, E-mail, Mensagem, botão Enviar) e informações de contato ao lado (telefone, email, endereço). Use o mesmo estilo visual do site.' },
  { id: 'faq', label: 'FAQ / Perguntas', icon: '❓', prompt: 'Adicione uma seção FAQ com 5 perguntas e respostas frequentes do negócio. Use um acordeão visual (detalhes/summary) com estilo moderno. Use o mesmo estilo visual do site.' },
  { id: 'stats', label: 'Números / Estatísticas', icon: '📊', prompt: 'Adicione uma seção com 4 estatísticas de destaque (ex: anos de experiência, clientes atendidos, projetos entregues, satisfação). Use números grandes e destaque visual. Use o mesmo estilo visual do site.' },
  { id: 'cta', label: 'CTA / Chamada para Ação', icon: '🚀', prompt: 'Adicione uma seção de CTA (call-to-action) com fundo colorido, título impactante, subtítulo e botão grande. Use as cores primárias do site.' },
];

// ── SitePreview ────────────────────────────────────────────────────────────────

function SitePreview({
  html,
  status,
  error,
  onDownload,
  onRefine,
  onSave,
  tenantId,
}: {
  html: string;
  status: GeneratorStatus;
  error: string | null;
  onDownload: () => void;
  onRefine: (prompt?: string) => void | Promise<void>;
  onSave?: (html: string) => Promise<void>;
  tenantId: string;
}) {
  const [pendingHtml, setPendingHtml] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [sections, setSections] = useState<Array<{ index: number; title: string }>>([]);
  const [showSections, setShowSections] = useState(true);
  const [addingSection, setAddingSection] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const imgPickRef = useRef<HTMLInputElement>(null);
  const pendingImgIndex = useRef<number>(-1);
  const pendingImgMode = useRef<'img' | 'placeholder'>('img');
  const { toast } = useToast();
  const requestUploadUrl = useRequestUploadUrl();

  // Listen for inline edits from the iframe
  useEffect(() => {
    async function handler(e: MessageEvent) {
      if (!e.data?.type) return;
      if (e.data.type === 've-html-edit') {
        const editedHtml = stripEditScript(e.data.html as string);
        if (e.data.editKind === 'image' && onSave) {
          setSaving(true);
          try {
            await onSave(editedHtml);
            setPendingHtml(null);
            toast({ description: '✓ Imagem atualizada no site' });
          } catch (error) {
            setPendingHtml(editedHtml);
            toast({
              title: 'Não foi possível salvar a imagem',
              description: error instanceof Error ? error.message : 'Tente novamente.',
              variant: 'destructive',
            });
          } finally {
            setSaving(false);
          }
        } else {
          setPendingHtml(editedHtml);
        }
      } else if (e.data.type === 've-img-pick') {
        pendingImgIndex.current = e.data.imgIndex as number;
        pendingImgMode.current = (e.data.mode as string) === 'placeholder' ? 'placeholder' : 'img';
        imgPickRef.current?.click();
      } else if (e.data.type === 've-sections') {
        setSections(e.data.sections as Array<{ index: number; title: string }>);
      }
    }
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onSave, toast]);

  // Reset pending when html prop changes (new generation)
  useEffect(() => { setPendingHtml(null); setSections([]); }, [html]);

  async function handleImgFilePick(file: File) {
    const idx = pendingImgIndex.current;
    if (idx < 0) return;
    setUploadingImg(true);
    try {
      const uploadResult = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
        requestUploadUrl.mutate(
          { data: { name: file.name, size: file.size, contentType: file.type || 'image/png' } },
          { onSuccess: resolve, onError: reject },
        );
      });
      const uploadRes = await fetch(uploadResult.uploadURL, {
        method: 'PUT', body: file,
        headers: { 'Content-Type': file.type || 'image/png' },
      });
      if (!uploadRes.ok) throw new Error('Upload falhou');
      const newSrc = `/api/storage/${uploadResult.objectPath}`;
      iframeRef.current?.contentWindow?.postMessage({ type: 've-img-set', mode: pendingImgMode.current, imgIndex: idx, newSrc }, '*');
    } catch {
      toast({ title: 'Erro ao enviar foto. Tente novamente.', variant: 'destructive' });
    } finally {
      setUploadingImg(false);
      pendingImgIndex.current = -1;
    }
  }

  async function handleAddSection(tpl: typeof SECTION_TEMPLATES[number]) {
    setAddingSection(true);
    try {
      await Promise.resolve(onRefine(tpl.prompt));
      toast({ description: `✓ Seção "${tpl.label}" sendo gerada…` });
    } catch {
      toast({ title: 'Erro ao adicionar seção', variant: 'destructive' });
    } finally {
      setAddingSection(false);
    }
  }

  async function saveInlineEdits() {
    if (!pendingHtml || !onSave) return;
    setSaving(true);
    try {
      await onSave(pendingHtml);
      setPendingHtml(null);
      toast({ description: "✓ Edições salvas" });
    } catch {
      toast({ title: "Erro ao salvar edições", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const displayHtml = html ? injectEditScript(html) : '';

  return (
    <div className="flex flex-col gap-3">
      {/* hidden file input for inline image replacement */}
      <input ref={imgPickRef} type="file" accept="image/*" className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImgFilePick(f); e.target.value = ''; }} />

      {status === "generating" && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          Gerando site com IA… isso pode levar 20-40 segundos
        </div>
      )}
      {status === "error" && error && (
        <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
      )}
      {uploadingImg && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />Enviando foto…
        </div>
      )}

      {/* Unsaved edits bar */}
      {pendingHtml && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-indigo-300 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/40 px-4 py-2.5">
          <span className="text-sm text-indigo-700 dark:text-indigo-300">✏️ Edições não salvas</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPendingHtml(null)} className="text-muted-foreground">Descartar</Button>
            <Button size="sm" onClick={saveInlineEdits} disabled={saving || !onSave}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}Salvar edições
            </Button>
          </div>
        </div>
      )}

      {/* ── Sections panel ── */}
      {sections.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/20">
          <button
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowSections(v => !v)}
          >
            <span>📋 Painel de Seções ({sections.length})</span>
            <span>{showSections ? '▲' : '▼'}</span>
          </button>
          {showSections && (
            <div className="border-t border-border px-3 pb-3 pt-2 flex flex-col gap-1.5">
              {sections.map((sec) => (
                <div key={sec.index} className="flex items-center gap-2 rounded-md bg-background border border-border px-3 py-1.5 text-sm">
                  <span className="flex-1 truncate text-foreground">{sec.title || `Seção ${sec.index + 1}`}</span>
                  <button
                    className="text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted transition-colors text-xs"
                    title="Subir"
                    onClick={() => {
                      if (sec.index === 0) return;
                      iframeRef.current?.contentWindow?.postMessage({ type: 've-section-move', from: sec.index, to: sec.index - 1 }, '*');
                    }}
                  >↑</button>
                  <button
                    className="text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted transition-colors text-xs"
                    title="Descer"
                    onClick={() => {
                      if (sec.index === sections.length - 1) return;
                      iframeRef.current?.contentWindow?.postMessage({ type: 've-section-move', from: sec.index, to: sec.index + 1 }, '*');
                    }}
                  >↓</button>
                  <button
                    className="text-muted-foreground hover:text-destructive px-1.5 py-0.5 rounded hover:bg-destructive/10 transition-colors text-xs"
                    title="Remover"
                    onClick={() => iframeRef.current?.contentWindow?.postMessage({ type: 've-section-delete', index: sec.index }, '*')}
                  >✕</button>
                </div>
              ))}

              {/* Add section dropdown */}
              <div className="mt-1.5">
                <p className="text-[10px] text-muted-foreground mb-1.5">Adicionar nova seção:</p>
                <div className="flex flex-wrap gap-1.5">
                  {SECTION_TEMPLATES.map(tpl => (
                    <button
                      key={tpl.id}
                      disabled={addingSection}
                      onClick={() => void handleAddSection(tpl)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                    >
                      {addingSection ? <Loader2 className="h-3 w-3 animate-spin" /> : <span>{tpl.icon}</span>}
                      {tpl.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preview iframe */}
      <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
        {displayHtml ? (
          <>
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-muted/50">
              <span className="text-[10px] text-muted-foreground">
                ✏️ Textos: clique para editar (B/I/U + tamanho + cor) · 🖼️ Fotos: passe o mouse para trocar ou excluir · Seções: hover → ↑↓✕
              </span>
            </div>
            <iframe
              ref={iframeRef}
              srcDoc={displayHtml}
              title="Preview do site gerado"
              sandbox="allow-scripts allow-same-origin"
              className="w-full border-none block"
              style={{ height: 520 }}
            />
          </>
        ) : (
          <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
            Configure o site e clique em "Gerar" para ver o preview aqui.
          </div>
        )}
      </div>

      {html && (
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={onDownload}>
            <Download className="h-4 w-4 mr-2" />Baixar HTML
          </Button>
          <Button onClick={() => onRefine()}>
            <MessageSquare className="h-4 w-4 mr-2" />Refinar com chat
          </Button>
        </div>
      )}
    </div>
  );
}

// ── RefinementChat ─────────────────────────────────────────────────────────────

function RefinementChat({
  onRefine,
  onViewPreview,
}: {
  onRefine: (msg: string) => Promise<string>;
  onViewPreview: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Site gerado! Peça ajustes aqui — mude seções, cores, textos ou adicione novos blocos.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function send() {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setLoading(true);
    try {
      await onRefine(msg);
      setMessages((m) => [...m, { role: "assistant", content: "Site atualizado! Veja o preview." }]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Tente novamente.";
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Não consegui aplicar o ajuste: ${detail}` },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 max-h-80 overflow-y-auto py-1">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-xl px-4 py-2.5 text-sm leading-relaxed max-w-[88%] ${
              m.role === "assistant"
                ? "self-start bg-muted border border-border text-foreground"
                : "self-end bg-foreground text-background"
            }`}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="self-start rounded-xl border border-border bg-muted px-4 py-2.5">
            <span className="flex gap-1 items-center h-4">
              {[0, 200, 400].map((delay) => (
                <span
                  key={delay}
                  className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setInput(s)}
            className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary cursor-pointer"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={input}
          placeholder="Peça um ajuste no site..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={loading}
        />
        <Button onClick={send} disabled={loading || !input.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar"}
        </Button>
      </div>

      <Button variant="ghost" className="self-start text-muted-foreground" onClick={onViewPreview}>
        ← Ver preview atualizado
      </Button>
    </div>
  );
}

// ── RefineDialog ───────────────────────────────────────────────────────────────

function RefineDialog({ onRefine }: { onRefine: (msg: string) => Promise<string> }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function apply() {
    if (!input.trim() || loading) return;
    setLoading(true);
    try {
      await onRefine(input.trim());
      setDone(true);
      setInput("");
      setTimeout(() => { setDone(false); setOpen(false); }, 1400);
    } catch {
      // keep open on error
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          Ajustar com IA
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar site com IA</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          <Textarea
            rows={4}
            placeholder="Descreva a melhoria... Ex: Muda a cor principal para verde, adiciona seção de FAQ, deixa o hero mais urgente..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            autoFocus
          />
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setInput(s)}
                className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary cursor-pointer transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={apply} disabled={loading || !input.trim()} className="w-full">
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Aplicando…</> : done ? "✓ Aplicado!" : "Aplicar ajuste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── TestimonialsDialog ─────────────────────────────────────────────────────────

function TestimonialsDialog({ onRefine }: { onRefine: (msg: string) => Promise<string> }) {
  const [open, setOpen] = useState(false);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([
    { id: crypto.randomUUID(), name: "", company: "", text: "", photoUrl: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  function add() {
    setTestimonials((t) => [...t, { id: crypto.randomUUID(), name: "", company: "", text: "", photoUrl: "" }]);
  }
  function remove(id: string) {
    setTestimonials((t) => t.filter((x) => x.id !== id));
  }
  function update(id: string, field: keyof Testimonial, value: string) {
    setTestimonials((t) => t.map((x) => (x.id === id ? { ...x, [field]: value } : x)));
  }
  function handlePhoto(id: string, file: File) {
    const reader = new FileReader();
    reader.onload = (e) => update(id, "photoUrl", (e.target?.result as string) ?? "");
    reader.readAsDataURL(file);
  }

  async function apply() {
    const valid = testimonials.filter((t) => t.name.trim() && t.text.trim());
    if (!valid.length || loading) return;

    const list = valid.map((t, i) => {
      const company = t.company ? `, ${t.company}` : "";
      const photo = t.photoUrl
        ? t.photoUrl.startsWith("data:")
          ? `\n   Foto: [imagem enviada pelo usuário — use as iniciais "${t.name.split(" ").map((w) => w[0]).join("").toUpperCase()}" como avatar fallback]`
          : `\n   Foto: ${t.photoUrl}`
        : "";
      return `${i + 1}. **${t.name}**${company}\n   "${t.text}"${photo}`;
    }).join("\n\n");

    const prompt = `Substitua TODOS os depoimentos existentes no site pelos depoimentos reais abaixo. Mantenha exatamente o mesmo design, layout e estilo HTML da seção de depoimentos — apenas troque os textos, nomes e imagens. Se houver URL de foto, use-a no <img> do depoimento. Se não houver foto, crie um avatar circular com as iniciais do cliente em CSS.\n\nDepoimentos reais:\n\n${list}`;

    setLoading(true);
    try {
      await onRefine(prompt);
      setDone(true);
      setTimeout(() => { setDone(false); setOpen(false); }, 1500);
    } catch {
      // keep open
    } finally {
      setLoading(false);
    }
  }

  const hasValid = testimonials.some((t) => t.name.trim() && t.text.trim());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Quote className="h-3.5 w-3.5 mr-1.5" />
          Depoimentos reais
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Depoimentos reais de clientes</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[58vh] pr-2">
          <div className="flex flex-col gap-4 py-1">
            {testimonials.map((t, i) => (
              <div key={t.id} className="rounded-lg border p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                    Depoimento {i + 1}
                  </span>
                  {testimonials.length > 1 && (
                    <button type="button" onClick={() => remove(t.id)} className="text-destructive hover:opacity-70 cursor-pointer transition-opacity">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Nome do cliente *</Label>
                    <Input placeholder="Ex: João Silva" value={t.name} onChange={(e) => update(t.id, "name", e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Empresa (opcional)</Label>
                    <Input placeholder="Ex: Padaria Central" value={t.company} onChange={(e) => update(t.id, "company", e.target.value)} />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Depoimento *</Label>
                  <Textarea rows={2} placeholder="O que o cliente disse sobre você..." value={t.text} onChange={(e) => update(t.id, "text", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Foto do cliente (opcional)</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      placeholder="URL da foto"
                      value={t.photoUrl.startsWith("data:") ? "(imagem enviada)" : t.photoUrl}
                      onChange={(e) => update(t.id, "photoUrl", e.target.value)}
                      className="flex-1 text-sm"
                      readOnly={t.photoUrl.startsWith("data:")}
                    />
                    <label className="cursor-pointer shrink-0">
                      <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhoto(t.id, f); }} />
                      <Button variant="outline" size="icon" type="button" asChild>
                        <span><Upload className="h-4 w-4" /></span>
                      </Button>
                    </label>
                    {t.photoUrl && (
                      <img src={t.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover border shrink-0" />
                    )}
                  </div>
                </div>
              </div>
            ))}
            <Button type="button" variant="ghost" className="self-start text-primary text-sm" onClick={add}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar depoimento
            </Button>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button onClick={apply} disabled={loading || !hasValid} className="w-full">
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Aplicando depoimentos…</> : done ? "✓ Depoimentos aplicados!" : "Aplicar depoimentos ao site"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── PortfolioDialog ────────────────────────────────────────────────────────────

type PortfolioCard = { id: string; title: string; imageUrl: string; newImageUrl: string | null };

function parsePortfolioCards(html: string): PortfolioCard[] {
  const cards: PortfolioCard[] = [];

  // Strategy 1: find portfolio/gallery section and extract image+caption pairs
  const portfolioSectionMatch = html.match(
    /<(?:section|div)\b[^>]*(?:id|class)=["'][^"']*(?:portfolio|galeria|gallery|projetos)[^"']*["'][^>]*>([\s\S]*?)<\/(?:section|div)>/i
  );
  const scope = portfolioSectionMatch ? portfolioSectionMatch[1] : html;

  // Extract cards: look for wrapper divs/figures that contain both an img and a text element
  const cardRegex = /<(?:figure|div|article)\b[^>]*>([\s\S]*?)<\/(?:figure|div|article)>/gi;
  let cardMatch: RegExpExecArray | null;
  while ((cardMatch = cardRegex.exec(scope)) !== null) {
    const inner = cardMatch[1];
    const imgMatch = inner.match(/<img[^>]+src=["']([^"']+)["']/i);
    const textMatch = inner.match(/<(?:h[1-6]|figcaption|p|span|div)[^>]*>\s*([^<]{3,80})\s*<\/(?:h[1-6]|figcaption|p|span|div)>/i);
    if (imgMatch && textMatch) {
      const imageUrl = imgMatch[1];
      const title = textMatch[1].trim();
      if (!imageUrl.includes("data:") && title.length > 1) {
        cards.push({ id: crypto.randomUUID(), title, imageUrl, newImageUrl: null });
      }
    }
  }

  // Strategy 2: fallback — plain img+adjacent text combos anywhere in scope
  if (cards.length === 0) {
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>\s*(?:<[^>]+>)*([^<]{3,80})/gi;
    let m: RegExpExecArray | null;
    while ((m = imgRegex.exec(scope)) !== null) {
      const imageUrl = m[1];
      const title = m[2].trim();
      if (!imageUrl.includes("data:") && title.length > 1) {
        cards.push({ id: crypto.randomUUID(), title, imageUrl, newImageUrl: null });
      }
    }
  }

  // Deduplicate by imageUrl
  const seen = new Set<string>();
  return cards.filter((c) => {
    if (seen.has(c.imageUrl)) return false;
    seen.add(c.imageUrl);
    return true;
  }).slice(0, 20);
}

function PortfolioDialog({ html, onRefine, tenantId }: { html: string; onRefine: (msg: string) => Promise<string>; tenantId: string }) {
  const [open, setOpen] = useState(false);
  const [cards, setCards] = useState<PortfolioCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const { toast } = useToast();
  const requestUploadUrl = useRequestUploadUrl();

  useEffect(() => {
    if (!open) return;
    const parsed = parsePortfolioCards(html);
    setCards(parsed.length > 0 ? parsed : [
      { id: crypto.randomUUID(), title: "", imageUrl: "", newImageUrl: null }
    ]);
    setDone(false);
  }, [open, html]);

  function updateTitle(id: string, title: string) {
    setCards((prev) => prev.map((c) => c.id === id ? { ...c, title } : c));
  }

  function addCard() {
    setCards((prev) => [...prev, { id: crypto.randomUUID(), title: "", imageUrl: "", newImageUrl: null }]);
  }

  function removeCard(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }

  async function uploadImage(file: File, cardId: string): Promise<string> {
    setUploading(cardId);
    try {
      const result = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
        requestUploadUrl.mutate(
          { data: { name: file.name, size: file.size, contentType: file.type || "image/png" } },
          { onSuccess: resolve, onError: reject },
        );
      });
      const uploadRes = await fetch(result.uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "image/png" },
      });
      if (!uploadRes.ok) throw new Error("Upload falhou");
      return `/api/storage/${result.objectPath}`;
    } finally {
      setUploading(null);
    }
  }

  async function handleReplaceImage(cardId: string, file: File) {
    try {
      const url = await uploadImage(file, cardId);
      setCards((prev) => prev.map((c) => c.id === cardId ? { ...c, newImageUrl: url } : c));
    } catch {
      toast({ title: "Erro ao enviar imagem. Tente novamente.", variant: "destructive" });
    }
  }

  async function apply() {
    const valid = cards.filter((c) => c.title.trim() || c.imageUrl || c.newImageUrl);
    if (!valid.length || loading) return;
    setLoading(true);
    try {
      const list = valid.map((c, i) => {
        const imgInstruction = c.newImageUrl
          ? `Imagem: SUBSTITUIR por "${c.newImageUrl}"`
          : c.imageUrl
            ? `Imagem atual: "${c.imageUrl}" (manter)`
            : "Sem imagem";
        return `${i + 1}. Título/legenda: "${c.title}" | ${imgInstruction}`;
      }).join("\n");

      const prompt = `Atualize a seção de portfólio/galeria do site com os cards abaixo, na mesma ordem. Para cada card: substitua o título ou legenda pelo texto indicado; se houver instrução "SUBSTITUIR por", troque o src da imagem pela nova URL. Mantenha exatamente o mesmo design, layout e estrutura HTML da seção — apenas altere textos e src das imagens.\n\nCARDS DO PORTFÓLIO:\n${list}`;

      await onRefine(prompt);
      setDone(true);
      setTimeout(() => { setDone(false); setOpen(false); }, 1400);
    } catch {
      // keep open on error
    } finally {
      setLoading(false);
    }
  }

  const hasChanges = cards.some((c) => c.newImageUrl || c.title.trim());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <LayoutTemplate className="h-3.5 w-3.5 mr-1.5" />
          Portfólio
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar cards do portfólio</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Corrija títulos e substitua imagens de cada card. Clique em "Aplicar" para atualizar o site via IA.
        </p>
        <ScrollArea className="max-h-[60vh] pr-2">
          <div className="flex flex-col gap-4 py-1">
            {cards.map((card, i) => (
              <div key={card.id} className="rounded-lg border p-3 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Card {i + 1}</span>
                  {cards.length > 1 && (
                    <button type="button" onClick={() => removeCard(card.id)} className="text-destructive hover:opacity-70 cursor-pointer transition-opacity">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Título / Ambiente</Label>
                  <Input
                    placeholder="Ex: Quarto Master Casal"
                    value={card.title}
                    onChange={(e) => updateTitle(card.id, e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Imagem</Label>
                  <div className="flex gap-2 items-start">
                    {(card.newImageUrl || card.imageUrl) && (
                      <div className="relative shrink-0 w-20 h-16 rounded-md overflow-hidden border bg-muted/30">
                        <img
                          src={card.newImageUrl || card.imageUrl}
                          alt={card.title}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.2"; }}
                        />
                        {card.newImageUrl && (
                          <span className="absolute bottom-0 inset-x-0 bg-green-600/90 text-white text-[9px] text-center py-0.5 leading-none">
                            Nova
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex flex-col gap-1 flex-1">
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          disabled={!!uploading}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReplaceImage(card.id, f); e.target.value = ""; }}
                        />
                        <Button variant="outline" size="sm" type="button" asChild disabled={uploading === card.id} className="w-full">
                          <span>
                            {uploading === card.id
                              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Enviando…</>
                              : <><Upload className="h-3.5 w-3.5 mr-1.5" />{card.newImageUrl ? "Trocar imagem" : "Substituir imagem"}</>
                            }
                          </span>
                        </Button>
                      </label>
                      {card.newImageUrl && (
                        <button
                          type="button"
                          onClick={() => setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, newImageUrl: null } : c))}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors text-left cursor-pointer"
                        >
                          ✕ Desfazer troca
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <Button type="button" variant="ghost" className="self-start text-primary text-sm" onClick={addCard}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar card
            </Button>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button onClick={apply} disabled={loading || !hasChanges} className="w-full">
            {loading
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Aplicando portfólio…</>
              : done ? "✓ Portfólio atualizado!" : "Aplicar ao site"
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── MediaDialog ────────────────────────────────────────────────────────────────

type GalleryItem = { src: string; originalSrc: string };

function MediaDialog({ html, onSave, tenantId }: { html: string; onSave: (html: string) => Promise<void>; tenantId: string }) {
  const [open, setOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [heroUrl, setHeroUrl] = useState("");
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [initialSrcs, setInitialSrcs] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const { toast } = useToast();
  const requestUploadUrl = useRequestUploadUrl();

  useEffect(() => {
    if (!open) return;
    // Detect all <img> srcs, excluding those clearly inside nav/header (logo)
    // and small inline SVG data-URIs
    const allMatches = [...html.matchAll(/<img[^>]*?\ssrc=["']([^"']+)["'][^>]*>/gi)];
    const allSrcs = allMatches.map(m => m[1]!).filter(s => !s.startsWith('data:image/svg'));

    // Identify logo: first img inside nav or header, or with class containing logo/brand
    const logoMatch = /<(?:nav|header)\b[^>]*>[\s\S]{0,800}?<img[^>]*?\ssrc=["']([^"']+)["']/i.exec(html)
      ?? /<img[^>]*?class=["'][^"']*(?:logo|brand)[^"']*["'][^>]*?\ssrc=["']([^"']+)["']/i.exec(html);
    const detectedLogo = logoMatch ? logoMatch[1] : null;

    // Identify hero: img in section/div with id/class containing hero, or an unsplash URL
    const heroMatch = /<(?:section|div)\b[^>]*(?:id=["'][^"']*hero[^"']*["']|class=["'][^"']*hero[^"']*["'])[^>]*>[\s\S]{0,800}?<img[^>]*?\ssrc=["']([^"']+)["']/i.exec(html)
      ?? /(https?:\/\/images\.unsplash\.com[^"'\s)]*)/i.exec(html);
    const detectedHero = heroMatch ? heroMatch[1] : null;

    const excluded = new Set([detectedLogo, detectedHero].filter(Boolean) as string[]);
    const items = allSrcs
      .filter(s => !excluded.has(s) && !s.includes('data:'))
      .map(s => ({ src: s, originalSrc: s }));

    setGalleryItems(items);
    setInitialSrcs(items.map(i => i.originalSrc));
    setNewPhotos([]);
    setLogoUrl("");
    setHeroUrl("");
  }, [open, html]);

  async function uploadImage(file: File, key: string): Promise<string> {
    setUploading(key);
    try {
      const result = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
        requestUploadUrl.mutate(
          { data: { name: file.name, size: file.size, contentType: file.type || "image/png" } },
          { onSuccess: resolve, onError: reject },
        );
      });
      const uploadRes = await fetch(result.uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "image/png" },
      });
      if (!uploadRes.ok) throw new Error("Upload falhou");
      return `/api/storage/${result.objectPath}`;
    } finally {
      setUploading(null);
    }
  }

  async function handleLogoFile(file: File) {
    try { setLogoUrl(await uploadImage(file, "logo")); }
    catch { toast({ title: "Erro ao enviar logo. Tente novamente.", variant: "destructive" }); }
  }

  async function handleHeroFile(file: File) {
    try { setHeroUrl(await uploadImage(file, "hero")); }
    catch { toast({ title: "Erro ao enviar foto principal. Tente novamente.", variant: "destructive" }); }
  }

  async function handleReplaceGallery(index: number, file: File) {
    try {
      const url = await uploadImage(file, `gallery-${index}`);
      setGalleryItems(prev => prev.map((item, i) => i === index ? { ...item, src: url } : item));
    } catch { toast({ title: "Erro ao enviar foto. Tente novamente.", variant: "destructive" }); }
  }

  async function handleAddPhotos(files: File[]) {
    for (const file of files) {
      try {
        const url = await uploadImage(file, "gallery-new");
        setNewPhotos(prev => [...prev, url]);
      } catch { toast({ title: "Erro ao enviar foto. Tente novamente.", variant: "destructive" }); }
    }
  }

  function injectLogo(source: string, logoSrc: string): string {
    const navReplaced = source.replace(
      /(<(?:nav|header)\b[^>]*>[\s\S]*?)<img([^>]*?\s)src=["'][^"']*["']/i,
      (_, prefix, attrs) => `${prefix}<img${attrs}src="${logoSrc}"`
    );
    if (navReplaced !== source) return navReplaced;
    const logoClassReplaced = source.replace(
      /<img([^>]*?class=["'][^"']*(?:logo|brand)[^"']*["'][^>]*?)src=["'][^"']*["']/i,
      `<img$1src="${logoSrc}"`
    );
    if (logoClassReplaced !== source) return logoClassReplaced;
    return source.replace(/<img([^>]*?)src=["'][^"']*["']/, `<img$1src="${logoSrc}"`);
  }

  function injectHero(source: string, heroSrc: string): string {
    const heroSection = source.replace(
      /(<(?:section|div)\b[^>]*(?:id=["'][^"']*hero[^"']*["']|class=["'][^"']*hero[^"']*["'])[^>]*>[\s\S]{0,800}?)<img([^>]*?)src=["'][^"']*["']/i,
      (_, prefix, attrs) => `${prefix}<img${attrs}src="${heroSrc}"`
    );
    if (heroSection !== source) return heroSection;
    const unsplashReplaced = source.replace(/https?:\/\/images\.unsplash\.com[^"'\s)]*/g, heroSrc);
    if (unsplashReplaced !== source) return unsplashReplaced;
    let count = 0;
    return source.replace(/<img([^>]*?)src=["'][^"']*["']/g, (match, attrs) => {
      count++;
      return count === 2 ? `<img${attrs}src="${heroSrc}"` : match;
    });
  }

  async function apply() {
    const currentSrcs = new Set(galleryItems.map(g => g.originalSrc));
    const removedSrcs = initialSrcs.filter(s => !currentSrcs.has(s));
    const hasChanges = !!(logoUrl || heroUrl || galleryItems.some(g => g.src !== g.originalSrc) || newPhotos.length > 0 || removedSrcs.length > 0);
    if (!hasChanges || loading) return;
    setLoading(true);
    try {
      let updated = html;
      if (logoUrl) updated = injectLogo(updated, logoUrl);
      if (heroUrl) updated = injectHero(updated, heroUrl);
      // Remove deleted gallery photos
      for (const src of removedSrcs) {
        const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        updated = updated.replace(new RegExp(`<img[^>]*?src=["']${escaped}["'][^>]*?>`, "g"), '');
      }
      for (const item of galleryItems) {
        if (item.src !== item.originalSrc) {
          const escaped = item.originalSrc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          updated = updated.replace(new RegExp(`src=["']${escaped}["']`, "g"), `src="${item.src}"`);
        }
      }
      if (newPhotos.length > 0) {
        const newImgs = newPhotos
          .map(url => `<img src="${url}" alt="Foto" loading="lazy" style="width:100%;height:220px;object-fit:cover;border-radius:10px;display:block;" />`)
          .join("\n");
        const gridBlock = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;padding:24px 16px">\n${newImgs}\n</div>`;

        // Try to inject into any known gallery/grid/services/sobre/team section
        const sectionPattern = /(<(?:section|div)\b[^>]*class=["'][^"']*(?:gallery|galeria|fotos|grid|photos|portfolio|services|servic|sobre|about|team|equipe|trabalhos|projetos|cases)[^"']*["'][^>]*>)([\s\S]*?)(<\/(?:section|div)>)/i;
        const inSection = updated.replace(sectionPattern, (_, open, body, close) => `${open}${body}\n${newImgs}\n${close}`);
        if (inSection !== updated) { updated = inSection; }
        else {
          // Fallback: inject before footer, or before </main>, or before </body>
          const beforeFooter = updated.replace(/(<footer\b)/i, `${gridBlock}\n$1`);
          if (beforeFooter !== updated) { updated = beforeFooter; }
          else {
            const beforeMain = updated.replace(/<\/main>/i, `${gridBlock}\n</main>`);
            updated = beforeMain !== updated ? beforeMain : updated.replace(/<\/body>/i, `${gridBlock}\n</body>`);
          }
        }
      }
      await onSave(updated);
      setDone(true);
      setTimeout(() => { setDone(false); setOpen(false); }, 1200);
    } catch {
      // keep open
    } finally {
      setLoading(false);
    }
  }

  const hasChanges = !!(logoUrl || heroUrl || galleryItems.some(g => g.src !== g.originalSrc) || newPhotos.length > 0 || initialSrcs.some(s => !galleryItems.find(g => g.originalSrc === s)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
          Logo & Fotos
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Logo e fotos do site</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-5 py-1">
          {/* Logo */}
          <div className="flex flex-col gap-2">
            <div>
              <Label className="font-medium">Logotipo</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Inserido no cabeçalho/navegação do site</p>
            </div>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="Cole a URL do logo"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                className="flex-1"
              />
              <label className="cursor-pointer shrink-0">
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); }} />
                <Button variant="outline" size="icon" type="button" asChild disabled={uploading === "logo"}>
                  <span>{uploading === "logo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}</span>
                </Button>
              </label>
            </div>
            {logoUrl && (
              <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-center h-16">
                <img src={logoUrl} alt="Logo preview" className="max-h-full max-w-full object-contain" />
              </div>
            )}
          </div>

          <Separator />

          {/* Hero photo */}
          <div className="flex flex-col gap-2">
            <div>
              <Label className="font-medium">Foto principal (hero)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Imagem de destaque no topo do site</p>
            </div>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="Cole a URL da foto"
                value={heroUrl}
                onChange={(e) => setHeroUrl(e.target.value)}
                className="flex-1"
              />
              <label className="cursor-pointer shrink-0">
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleHeroFile(f); }} />
                <Button variant="outline" size="icon" type="button" asChild disabled={uploading === "hero"}>
                  <span>{uploading === "hero" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}</span>
                </Button>
              </label>
            </div>
            {heroUrl && (
              <div className="rounded-lg border overflow-hidden h-24">
                <img src={heroUrl} alt="Hero preview" className="w-full h-full object-cover" />
              </div>
            )}
          </div>

          <Separator />

          {/* Gallery */}
          <div className="flex flex-col gap-3">
            <div>
              <Label className="font-medium">Galeria de fotos</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Clique para substituir · ↑↓ reordenar · ✕ remover · adicione novas fotos ao site
              </p>
            </div>
            {galleryItems.length > 0 && (
              <div className="flex flex-col gap-2">
                {galleryItems.map((item, i) => (
                  <div key={`${item.originalSrc}-${i}`} className="flex items-center gap-2 rounded-lg border bg-muted/20 p-2">
                    {/* thumbnail */}
                    <label className="relative cursor-pointer group shrink-0 w-16 h-16 rounded-md overflow-hidden border bg-muted/30 block">
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        disabled={!!uploading}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReplaceGallery(i, f); e.target.value = ""; }}
                      />
                      <img
                        src={item.src}
                        alt={`Foto ${i + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.2"; }}
                      />
                      {uploading === `gallery-${i}` ? (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Loader2 className="h-4 w-4 text-white animate-spin" />
                        </div>
                      ) : (
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Upload className="h-3.5 w-3.5 text-white" />
                        </div>
                      )}
                    </label>
                    {/* info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground truncate">{`Foto ${i + 1}`}</p>
                      {item.src !== item.originalSrc && (
                        <span className="text-[10px] text-blue-500 font-medium">● alterada</span>
                      )}
                    </div>
                    {/* controls */}
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={i === 0}
                        className="w-6 h-6 rounded border border-border bg-background flex items-center justify-center text-[11px] text-muted-foreground hover:text-foreground hover:border-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        onClick={() => setGalleryItems(prev => {
                          const next = [...prev]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; return next;
                        })}
                        title="Subir"
                      >↑</button>
                      <button
                        type="button"
                        disabled={i === galleryItems.length - 1}
                        className="w-6 h-6 rounded border border-border bg-background flex items-center justify-center text-[11px] text-muted-foreground hover:text-foreground hover:border-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        onClick={() => setGalleryItems(prev => {
                          const next = [...prev]; [next[i], next[i + 1]] = [next[i + 1], next[i]]; return next;
                        })}
                        title="Descer"
                      >↓</button>
                    </div>
                    <button
                      type="button"
                      className="w-7 h-7 rounded border border-border bg-background flex items-center justify-center text-[13px] text-muted-foreground hover:text-destructive hover:border-destructive hover:bg-destructive/5 transition-colors shrink-0"
                      onClick={() => setGalleryItems(prev => prev.filter((_, j) => j !== i))}
                      title="Remover foto"
                    >✕</button>
                  </div>
                ))}
                {newPhotos.map((url, i) => (
                  <div key={`new-${i}`} className="flex items-center gap-2 rounded-lg border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 p-2">
                    <div className="shrink-0 w-16 h-16 rounded-md overflow-hidden border">
                      <img src={url} alt="Nova foto" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-semibold text-green-600">● nova foto</span>
                    </div>
                    <button
                      type="button"
                      className="w-7 h-7 rounded border border-border bg-background flex items-center justify-center text-[13px] text-muted-foreground hover:text-destructive hover:border-destructive hover:bg-destructive/5 transition-colors shrink-0"
                      onClick={() => setNewPhotos(prev => prev.filter((_, j) => j !== i))}
                      title="Remover foto"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
            {galleryItems.length === 0 && (
              <p className="text-xs text-muted-foreground py-1">Nenhuma foto de galeria detectada no site atual.</p>
            )}
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                disabled={!!uploading}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) handleAddPhotos(files);
                  e.target.value = "";
                }}
              />
              <Button variant="outline" size="sm" type="button" asChild disabled={uploading === "gallery-new"} className="w-full">
                <span className="flex items-center gap-2">
                  {uploading === "gallery-new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Adicionar fotos
                </span>
              </Button>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={apply} disabled={loading || !!uploading || !hasChanges} className="w-full">
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando…</> : done ? "✓ Aplicado!" : "Aplicar ao site"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── PersonalizePanel ───────────────────────────────────────────────────────────

const SITE_TYPE_LABELS: Record<string, string> = {
  landing:      "Landing Page",
  ecommerce:    "E-commerce",
  institutional: "Institucional",
  product:      "Produto",
};

const SITE_TYPE_ICONS: Record<string, React.ReactNode> = {
  landing:      <LayoutTemplate className="h-3.5 w-3.5" />,
  ecommerce:    <ShoppingCart className="h-3.5 w-3.5" />,
  institutional: <Globe className="h-3.5 w-3.5" />,
  product:      <Tag className="h-3.5 w-3.5" />,
};

function PersonalizePanel({
  html,
  isPublished,
  siteSlug,
  currentSiteType,
  tenantId,
  onRefine,
  onSave,
  onPublish,
  onGenerateEcommerce,
}: {
  html: string;
  isPublished: boolean;
  siteSlug: string | null;
  currentSiteType: string | null;
  tenantId: string;
  onRefine: (msg: string) => Promise<string>;
  onSave: (html: string) => Promise<void>;
  onPublish: () => Promise<void>;
  onGenerateEcommerce: () => void;
}) {
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);

  const siteUrl = siteSlug ? `https://${siteSlug}.appvendorai.com` : null;

  async function handlePublish() {
    setPublishing(true);
    try { await onPublish(); } finally { setPublishing(false); }
  }

  function handleCopy() {
    if (!siteUrl) return;
    navigator.clipboard.writeText(siteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${
      isPublished
        ? "border-green-200 bg-green-50/50 dark:border-green-900/40 dark:bg-green-950/20"
        : "border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20"
    }`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isPublished ? (
            <>
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="text-sm font-medium text-green-900 dark:text-green-300">
                Site publicado e visível ao público
              </span>
            </>
          ) : (
            <>
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
              <span className="text-sm font-medium text-amber-900 dark:text-amber-300">
                Rascunho — publique para deixar o site visível
              </span>
            </>
          )}
        </div>

        {!isPublished && (
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white shrink-0"
            onClick={handlePublish}
            disabled={publishing}
          >
            {publishing ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Publicando…</>
            ) : (
              <>🚀 Publicar site</>
            )}
          </Button>
        )}
      </div>

      {/* Subdomain URL row */}
      {siteUrl && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-xs text-muted-foreground flex-1 select-all">{siteUrl}</span>
          <button
            onClick={handleCopy}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            title="Copiar URL"
          >
            {copied ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-4 10h6a2 2 0 002-2v-8a2 2 0 00-2-2h-6a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
          {isPublished && (
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              title="Abrir site"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <RefineDialog onRefine={onRefine} />
        <TestimonialsDialog onRefine={onRefine} />
        <PortfolioDialog html={html} onRefine={onRefine} tenantId={tenantId} />
        <MediaDialog html={html} onSave={onSave} tenantId={tenantId} />
        {currentSiteType !== "ecommerce" && (
          <Button variant="outline" size="sm" onClick={onGenerateEcommerce} className="border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950/40">
            <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
            Gerar E-commerce
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Shared inner content (used by both standalone page and embedded tab) ────────

function SiteGeneratorInner({ tenantId, token }: { tenantId: string; token: string | null }) {
  const [activeTab, setActiveTab] = useState("config");
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [renamingSiteId, setRenamingSiteId] = useState<string | null>(null);
  const { toast } = useToast();
  const {
    status, html, siteId, siteSlug, isPublished, error,
    currentSiteType, currentConfig, sitesList,
    generate, generateBulk, bulkJobs, bulkRunning, clearBulk,
    refine, download, reset,
    loadLatest, loadAll, loadSite, saveHtml, publish, renameSite,
  } = useSiteGenerator(tenantId, token);

  // Auto-load latest site + list on mount
  useEffect(() => {
    if (tenantId) {
      loadLatest();
      loadAll();
    }
  }, [tenantId]);

  async function handleGenerate(config: SiteConfig) {
    setActiveTab("preview");
    await generate(config);
  }

  async function handleGenerateBulk(items: Array<{ key: string; label: string; config: SiteConfig }>) {
    // Fica na aba de configuração mostrando o progresso — não faz sentido
    // pular pro Preview de "um" site quando vários estão sendo gerados.
    await generateBulk(items);
  }

  async function handleGenerateEcommerce() {
    const base = currentConfig ?? { name: "", sector: "", desc: "", pain: "", tone: "profissional", cta: "", color: "#6366F1", products: [] };
    setActiveTab("preview");
    await generate({ ...base, type: "ecommerce" });
  }

  async function handleSwitchSite(id: string) {
    if (id === siteId) return;
    await loadSite(id);
    setActiveTab("preview");
  }

  const canPreview = status !== "idle";
  const canRefine = status === "ready";

  // Cada site publicado tem seu próprio endereço (mesmo vários do tipo
  // "product") — o switcher lista todos individualmente em vez de colapsar
  // por tipo, senão só o mais recente de cada tipo aparecia.
  const sortedSites = [...sitesList].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Sites switcher — lista cada site gerado individualmente */}
      {sortedSites.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium shrink-0">Meus sites:</span>
          {sortedSites.map((s) => {
            const isActive = s.id === siteId;
            const isEditing = editingSiteId === s.id;

            if (isEditing) {
              const saveRename = async () => {
                const trimmed = editingName.trim();
                if (!trimmed || trimmed === s.name) { setEditingSiteId(null); return; }
                setRenamingSiteId(s.id);
                try {
                  await renameSite(s.id, trimmed);
                } catch (err) {
                  toast({ title: "Erro ao renomear", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
                } finally {
                  setRenamingSiteId(null);
                  setEditingSiteId(null);
                }
              };
              return (
                <div key={s.id} className="flex items-center gap-1 rounded-full border border-primary bg-background px-2 py-1">
                  <Input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setEditingSiteId(null); }}
                    className="h-6 w-32 text-xs px-1.5 border-0 shadow-none focus-visible:ring-0"
                  />
                  <button onClick={saveRename} disabled={renamingSiteId === s.id} className="text-green-600 hover:text-green-700 shrink-0">
                    {renamingSiteId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => setEditingSiteId(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            }

            return (
              <div
                key={s.id}
                className={`group flex items-center gap-1.5 rounded-full border pl-3 pr-1.5 py-1 text-xs font-medium transition-all max-w-[240px] ${
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"
                }`}
              >
                <button
                  onClick={() => handleSwitchSite(s.id)}
                  title={s.name}
                  className="flex items-center gap-1.5 cursor-pointer min-w-0"
                >
                  {SITE_TYPE_ICONS[s.siteType]}
                  <span className="truncate">{s.name || SITE_TYPE_LABELS[s.siteType] || s.siteType}</span>
                  {isActive && <span className="ml-0.5 shrink-0">✓</span>}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingSiteId(s.id); setEditingName(s.name); }}
                  title="Renomear"
                  className={`shrink-0 ${isActive ? "text-primary-foreground/80 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Progresso da geração em massa (várias LPs de produto de uma vez) */}
      {bulkJobs.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              Gerando {bulkJobs.length} landing pages
              {" "}({bulkJobs.filter((j) => j.status !== "pending").length}/{bulkJobs.length})
            </span>
            {!bulkRunning && (
              <button type="button" onClick={clearBulk} className="text-[10px] text-muted-foreground underline underline-offset-2 hover:no-underline">
                Fechar
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
            {bulkJobs.map((j) => (
              <div key={j.key} className="flex items-center gap-2 text-xs">
                {j.status === "pending" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
                {j.status === "done" && <span className="shrink-0 text-green-600">✓</span>}
                {j.status === "error" && <span className="shrink-0 text-destructive">✕</span>}
                <span className="flex-1 truncate">{j.label}</span>
                {j.status === "done" && j.siteId && (
                  <button
                    type="button"
                    onClick={() => handleSwitchSite(j.siteId!)}
                    className="shrink-0 text-primary underline underline-offset-2 hover:no-underline"
                  >
                    Ver site
                  </button>
                )}
                {j.status === "error" && (
                  <span className="shrink-0 text-destructive" title={j.error}>{j.error}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Personalizar panel — always visible when a site exists */}
      {status === "ready" && (
        <PersonalizePanel
          html={html}
          isPublished={isPublished}
          siteSlug={siteSlug}
          currentSiteType={currentSiteType}
          tenantId={tenantId}
          onRefine={refine}
          onSave={saveHtml}
          onPublish={publish}
          onGenerateEcommerce={handleGenerateEcommerce}
        />
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          Crie landing pages, e-commerces e sites institucionais com IA em segundos.
        </p>
        {status === "ready" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { reset(); setActiveTab("config"); }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Gerar novo site
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="config" className="flex-1">
            ① Configurar
          </TabsTrigger>
          <TabsTrigger value="preview" className="flex-1" disabled={!canPreview}>
            ② Preview
            {status === "generating" && (
              <Loader2 className="h-3 w-3 ml-1.5 animate-spin" />
            )}
            {status === "ready" && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">
                Pronto
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="refine" className="flex-1" disabled={!canRefine}>
            ③ Chat IA
          </TabsTrigger>
        </TabsList>

        <Card className="mt-2">
          <CardContent className="pt-6">
            <TabsContent value="config" className="mt-0">
              <ConfigForm tenantId={tenantId} token={token} onGenerate={handleGenerate} onGenerateBulk={handleGenerateBulk} />
            </TabsContent>

            <TabsContent value="preview" className="mt-0">
              <SitePreview
                html={html}
                status={status}
                error={error}
                onDownload={() => download("site-gerado")}
                onRefine={(prompt) => {
                  if (prompt) { void refine(prompt); return; }
                  setActiveTab("refine");
                }}
                onSave={saveHtml}
                tenantId={tenantId}
              />
            </TabsContent>

            <TabsContent value="refine" className="mt-0">
              <RefinementChat
                onRefine={refine}
                onViewPreview={() => setActiveTab("preview")}
              />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}

// ── Embedded tab (used inside Configurações) ────────────────────────────────────

export function SiteGeneratorTab() {
  const { user, token } = useAuth();
  return <SiteGeneratorInner tenantId={user?.tenantId ?? ""} token={token} />;
}

// ── Main Component (standalone page — kept for direct navigation) ───────────────

export default function SiteGenerator() {
  const { user, token } = useAuth();

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6 p-6">
      <div className="flex items-center gap-2">
        <Globe className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Gerador de Sites</h1>
      </div>
      <SiteGeneratorInner tenantId={user?.tenantId ?? ""} token={token} />
    </div>
  );
}
