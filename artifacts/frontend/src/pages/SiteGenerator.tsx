import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGetBusinessProfileByTenant, getGetBusinessProfileByTenantQueryKey, useRequestUploadUrl } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Loader2, Download, MessageSquare, RotateCcw, Globe, Sparkles, Quote, ImageIcon, Plus, Trash2, Upload, ShoppingCart, LayoutTemplate } from "lucide-react";

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
] as const;

const SUGGESTIONS = [
  "Muda a cor principal para verde",
  "Adiciona seção de depoimentos",
  "Reescreve o hero com mais urgência",
  "Adiciona uma seção de FAQ",
  "Deixa os textos mais curtos e diretos",
  "Adiciona um WhatsApp flutuante",
];

type SiteType = "landing" | "ecommerce" | "institutional";
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

function useSiteGenerator(tenantId: string, token: string | null) {
  const [status, setStatus] = useState<GeneratorStatus>("idle");
  const [html, setHtml] = useState("");
  const [siteId, setSiteId] = useState<string | null>(null);
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
    if (!siteId) return;
    setHtml(newHtml);
    await fetch(`/api/tenants/${tenantId}/site-generator/${siteId}/html`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ html: newHtml }),
    });
  }, [siteId, tenantId, token]);

  const generate = useCallback(async (config: SiteConfig) => {
    setStatus("generating");
    setError(null);
    setHtml("");
    setSiteId(null);
    setHistory([]);
    setCurrentSiteType(config.type);
    setCurrentConfig(config);

    try {
      const res = await fetch(`/api/tenants/${tenantId}/site-generator/generate`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Erro ${res.status}`);
      }
      const site = await res.json();
      setHtml(site.html);
      setSiteId(site.id);
      setCurrentSiteType(site.siteType ?? config.type);
      setCurrentConfig(site.config ?? config);
      setHistory([
        { role: "user", content: `Gerar site para: ${config.name}` },
        { role: "assistant", content: site.html },
      ]);
      setStatus("ready");
      // Refresh sites list
      setSitesList((prev) => {
        const filtered = prev.filter((s) => s.id !== site.id);
        return [{ id: site.id, name: site.name, siteType: site.siteType, updatedAt: site.updatedAt }, ...filtered];
      });
    } catch (err: any) {
      setStatus("error");
      setError(err.message ?? "Erro desconhecido");
    }
  }, [tenantId, token]);

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

  const download = useCallback((filename = "site") => {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename.toLowerCase().replace(/\s+/g, "-") + ".html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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

  return { status, html, siteId, isPublished, error, currentSiteType, currentConfig, sitesList, generate, refine, download, reset, loadLatest, loadAll, loadSite, saveHtml, publish };
}

// ── ConfigForm ─────────────────────────────────────────────────────────────────

function ConfigForm({ tenantId, onGenerate }: { tenantId: string; onGenerate: (config: SiteConfig) => void }) {
  const [siteType, setSiteType] = useState<SiteType>("landing");
  const [color, setColor] = useState("#6366F1");
  const [tone, setTone] = useState("profissional");
  const [products, setProducts] = useState<Product[]>([{ name: "", price: "" }]);

  const { data: bp } = useGetBusinessProfileByTenant(tenantId, {
    query: { queryKey: getGetBusinessProfileByTenantQueryKey(tenantId), enabled: !!tenantId },
  });

  const nomeNegocio = bp?.nomeFantasia ?? bp?.razaoSocial ?? "";
  const setor = bp?.vertical ?? "";
  const descricao = bp?.diferenciais ?? "";
  const publico = bp?.publicoAlvo ?? "";
  const descNegocio = descricao || publico || "";

  function addProduct() { setProducts((p) => [...p, { name: "", price: "" }]); }
  function removeProduct(i: number) { setProducts((p) => p.filter((_, idx) => idx !== i)); }
  function updateProduct(i: number, field: keyof Product, value: string) {
    setProducts((p) => p.map((prod, idx) => (idx === i ? { ...prod, [field]: value } : prod)));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onGenerate({
      type: siteType,
      name: (fd.get("name") as string) || nomeNegocio || "",
      sector: (fd.get("sector") as string) || setor || "",
      desc: (fd.get("desc") as string) || descNegocio || "",
      pain: fd.get("pain") as string,
      tone,
      cta: fd.get("cta") as string,
      color,
      products: products.filter((p) => p.name.trim()),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Tipo de site */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Tipo de site
        </Label>
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

      {/* Dados básicos */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sg-name">Nome do negócio *</Label>
          <Input
            id="sg-name"
            name="name"
            required
            placeholder="Ex: Floricultura Primavera"
            defaultValue={nomeNegocio}
            readOnly={!!nomeNegocio}
            className={nomeNegocio ? "bg-muted/50" : ""}
          />
          {nomeNegocio && (
            <span className="text-[10px] text-muted-foreground">Preenchido automaticamente do cadastro da empresa</span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sg-sector">Setor / nicho</Label>
          <Input
            id="sg-sector"
            name="sector"
            placeholder="Ex: floricultura, consultoria"
            defaultValue={setor}
            readOnly={!!setor}
            className={setor ? "bg-muted/50" : ""}
          />
          {setor && (
            <span className="text-[10px] text-muted-foreground">Preenchido automaticamente do cadastro da empresa</span>
          )}
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="sg-desc">O que o negócio faz *</Label>
          <Textarea
            id="sg-desc"
            name="desc"
            rows={3}
            required
            placeholder="Descreva em 1-2 frases o que o negócio faz e para quem..."
            defaultValue={descNegocio}
            readOnly={!!descNegocio}
            className={descNegocio ? "bg-muted/50" : ""}
          />
          {descNegocio && (
            <span className="text-[10px] text-muted-foreground">Preenchido automaticamente do cadastro da empresa</span>
          )}
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="sg-pain">Maior dor do cliente (SPIN — Implicação)</Label>
          <Input
            id="sg-pain"
            name="pain"
            placeholder="Ex: difícil encontrar flores frescas de qualidade na cidade"
          />
        </div>
      </div>

      {/* Produtos — só e-commerce */}
      {siteType === "ecommerce" && (
        <div className="flex flex-col gap-2">
          <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Produtos
          </Label>
          <p className="text-xs text-muted-foreground rounded-md bg-muted/60 border border-dashed px-3 py-2">
            🛒 Os produtos do seu <strong>Catálogo de Produtos</strong> serão incluídos automaticamente no site (com imagens, preços e estoque real). Você pode adicionar produtos extras abaixo se quiser.
          </p>
          {products.map((p, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                placeholder="Nome do produto"
                value={p.name}
                onChange={(e) => updateProduct(i, "name", e.target.value)}
              />
              <Input
                placeholder="R$ 0,00"
                value={p.price}
                onChange={(e) => updateProduct(i, "price", e.target.value)}
                className="w-28"
              />
              {products.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => removeProduct(i)}
                  className="shrink-0 text-destructive hover:border-destructive hover:text-destructive"
                >
                  ✕
                </Button>
              )}
            </div>
          ))}
          <Button type="button" variant="ghost" className="self-start text-primary" onClick={addProduct}>
            + Adicionar produto extra
          </Button>
        </div>
      )}

      {/* Aparência e tom */}
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
                className={`w-7 h-7 rounded-full border-2 transition-all cursor-pointer ${
                  color === c.hex ? "border-foreground scale-110" : "border-transparent"
                }`}
                style={{ background: c.hex }}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sg-tone">Tom de voz</Label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger id="sg-tone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="profissional">Profissional e confiável</SelectItem>
              <SelectItem value="amigavel">Amigável e próximo</SelectItem>
              <SelectItem value="urgente">Urgente e direto</SelectItem>
              <SelectItem value="premium">Premium e sofisticado</SelectItem>
              <SelectItem value="descontraido">Descontraído e criativo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="sg-cta">CTA principal</Label>
          <Input
            id="sg-cta"
            name="cta"
            placeholder="Ex: Solicitar orçamento, Comprar agora, Agendar visita"
          />
        </div>
      </div>

      <Button type="submit" size="lg" className="mt-1 w-full font-semibold">
        ✦ Gerar site com IA
      </Button>
    </form>
  );
}

// ── SitePreview ────────────────────────────────────────────────────────────────

function SitePreview({
  html,
  status,
  error,
  onDownload,
  onRefine,
}: {
  html: string;
  status: GeneratorStatus;
  error: string | null;
  onDownload: () => void;
  onRefine: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {status === "generating" && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          Gerando site com IA… isso pode levar 20-40 segundos
        </div>
      )}
      {status === "error" && error && (
        <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
        {html ? (
          <iframe
            srcDoc={html}
            title="Preview do site gerado"
            sandbox="allow-scripts allow-same-origin"
            className="w-full border-none block"
            style={{ height: 520 }}
          />
        ) : (
          <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
            Configure o site e clique em "Gerar" para ver o preview aqui.
          </div>
        )}
      </div>

      {html && (
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={onDownload}>
            <Download className="h-4 w-4 mr-2" />
            Baixar HTML
          </Button>
          <Button onClick={onRefine}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Refinar com chat
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
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Não consegui aplicar o ajuste. Tente novamente." },
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

// ── MediaDialog ────────────────────────────────────────────────────────────────

function MediaDialog({ html, onSave, tenantId }: { html: string; onSave: (html: string) => Promise<void>; tenantId: string }) {
  const [open, setOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [heroUrl, setHeroUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "hero" | null>(null);
  const [done, setDone] = useState(false);
  const { toast } = useToast();
  const requestUploadUrl = useRequestUploadUrl();

  async function uploadFile(file: File, field: "logo" | "hero") {
    setUploading(field);
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
      const permanentUrl = `/api/storage/public-objects/${result.objectPath}`;
      if (field === "logo") setLogoUrl(permanentUrl);
      else setHeroUrl(permanentUrl);
    } catch {
      toast({ title: "Erro ao fazer upload da imagem. Tente novamente.", variant: "destructive" });
    } finally {
      setUploading(null);
    }
  }

  function injectLogo(source: string, logoSrc: string): string {
    // Replace first <img> inside nav or header
    const navReplaced = source.replace(
      /(<(?:nav|header)\b[^>]*>[\s\S]*?)<img([^>]*?\s)src=["'][^"']*["']/i,
      (_, prefix, attrs) => `${prefix}<img${attrs}src="${logoSrc}"`
    );
    if (navReplaced !== source) return navReplaced;
    // Fallback: first img with class containing logo
    const logoClassReplaced = source.replace(
      /<img([^>]*?class=["'][^"']*(?:logo|brand)[^"']*["'][^>]*?)src=["'][^"']*["']/i,
      `<img$1src="${logoSrc}"`
    );
    if (logoClassReplaced !== source) return logoClassReplaced;
    // Last fallback: very first img in document
    return source.replace(/<img([^>]*?)src=["'][^"']*["']/, `<img$1src="${logoSrc}"`);
  }

  function injectHero(source: string, heroSrc: string): string {
    // Try hero section img
    const heroSection = source.replace(
      /(<(?:section|div)\b[^>]*(?:id=["'][^"']*hero[^"']*["']|class=["'][^"']*hero[^"']*["'])[^>]*>[\s\S]{0,800}?)<img([^>]*?)src=["'][^"']*["']/i,
      (_, prefix, attrs) => `${prefix}<img${attrs}src="${heroSrc}"`
    );
    if (heroSection !== source) return heroSection;
    // Replace Unsplash URLs
    const unsplashReplaced = source.replace(/https?:\/\/images\.unsplash\.com[^"'\s)]*/g, heroSrc);
    if (unsplashReplaced !== source) return unsplashReplaced;
    // Fallback: second img in document (first is usually logo)
    let count = 0;
    return source.replace(/<img([^>]*?)src=["'][^"']*["']/g, (match, attrs) => {
      count++;
      return count === 2 ? `<img${attrs}src="${heroSrc}"` : match;
    });
  }

  async function apply() {
    if ((!logoUrl && !heroUrl) || loading) return;
    setLoading(true);
    try {
      let updated = html;
      if (logoUrl) updated = injectLogo(updated, logoUrl);
      if (heroUrl) updated = injectHero(updated, heroUrl);
      await onSave(updated);
      setDone(true);
      setTimeout(() => { setDone(false); setOpen(false); }, 1200);
    } catch {
      // keep open
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
          Logo & Fotos
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
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
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, "logo"); }} />
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
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, "hero"); }} />
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
        </div>
        <DialogFooter>
          <Button onClick={apply} disabled={loading || !!uploading || (!logoUrl && !heroUrl)} className="w-full">
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando…</> : done ? "✓ Aplicado!" : "Aplicar mídia ao site"}
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
};

const SITE_TYPE_ICONS: Record<string, React.ReactNode> = {
  landing:      <LayoutTemplate className="h-3.5 w-3.5" />,
  ecommerce:    <ShoppingCart className="h-3.5 w-3.5" />,
  institutional: <Globe className="h-3.5 w-3.5" />,
};

function PersonalizePanel({
  html,
  isPublished,
  currentSiteType,
  tenantId,
  onRefine,
  onSave,
  onPublish,
  onGenerateEcommerce,
}: {
  html: string;
  isPublished: boolean;
  currentSiteType: string | null;
  tenantId: string;
  onRefine: (msg: string) => Promise<string>;
  onSave: (html: string) => Promise<void>;
  onPublish: () => Promise<void>;
  onGenerateEcommerce: () => void;
}) {
  const [publishing, setPublishing] = useState(false);

  async function handlePublish() {
    setPublishing(true);
    try { await onPublish(); } finally { setPublishing(false); }
  }

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${
      isPublished
        ? "border-green-200 bg-green-50/50 dark:border-green-900/40 dark:bg-green-950/20"
        : "border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20"
    }`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {isPublished ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="text-sm font-medium text-green-900 dark:text-green-300">
                Site publicado e visível ao público
              </span>
            </>
          ) : (
            <>
              <span className="relative flex h-2 w-2">
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

      <div className="flex flex-wrap gap-2">
        <RefineDialog onRefine={onRefine} />
        <TestimonialsDialog onRefine={onRefine} />
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
  const {
    status, html, siteId, isPublished, error,
    currentSiteType, currentConfig, sitesList,
    generate, refine, download, reset,
    loadLatest, loadAll, loadSite, saveHtml, publish,
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

  // Group sites by type for the switcher
  const sitesByType = sitesList.reduce<Record<string, SiteSummary>>((acc, s) => {
    // Keep most recent per type
    if (!acc[s.siteType] || new Date(s.updatedAt) > new Date(acc[s.siteType].updatedAt)) {
      acc[s.siteType] = s;
    }
    return acc;
  }, {});
  const switcherTypes = Object.keys(sitesByType);

  return (
    <div className="flex flex-col gap-4">
      {/* Sites switcher — shown when more than one type exists */}
      {switcherTypes.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium shrink-0">Meus sites:</span>
          {switcherTypes.map((type) => {
            const s = sitesByType[type];
            const isActive = s.id === siteId;
            return (
              <button
                key={type}
                onClick={() => handleSwitchSite(s.id)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"
                }`}
              >
                {SITE_TYPE_ICONS[type]}
                {SITE_TYPE_LABELS[type] ?? type}
                {isActive && <span className="ml-0.5">✓</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Personalizar panel — always visible when a site exists */}
      {status === "ready" && (
        <PersonalizePanel
          html={html}
          isPublished={isPublished}
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
              <ConfigForm tenantId={tenantId} onGenerate={handleGenerate} />
            </TabsContent>

            <TabsContent value="preview" className="mt-0">
              <SitePreview
                html={html}
                status={status}
                error={error}
                onDownload={() => download("site-gerado")}
                onRefine={() => setActiveTab("refine")}
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
