import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
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
import { Loader2, Download, MessageSquare, RotateCcw, Globe } from "lucide-react";

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

// ── Hook ───────────────────────────────────────────────────────────────────────

function useSiteGenerator(tenantId: string) {
  const [status, setStatus] = useState<GeneratorStatus>("idle");
  const [html, setHtml] = useState("");
  const [siteId, setSiteId] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (config: SiteConfig) => {
    setStatus("generating");
    setError(null);
    setHtml("");
    setSiteId(null);
    setHistory([]);

    try {
      const res = await fetch(`/api/tenants/${tenantId}/site-generator/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Erro ${res.status}`);
      }
      const site = await res.json();
      setHtml(site.html);
      setSiteId(site.id);
      setHistory([
        { role: "user", content: `Gerar site para: ${config.name}` },
        { role: "assistant", content: site.html },
      ]);
      setStatus("ready");
    } catch (err: any) {
      setStatus("error");
      setError(err.message ?? "Erro desconhecido");
    }
  }, [tenantId]);

  const refine = useCallback(async (message: string): Promise<string> => {
    if (!siteId) throw new Error("Nenhum site gerado");

    const res = await fetch(`/api/tenants/${tenantId}/site-generator/${siteId}/refine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
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
  }, [siteId, tenantId, history]);

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
  }, []);

  return { status, html, siteId, error, generate, refine, download, reset };
}

// ── ConfigForm ─────────────────────────────────────────────────────────────────

function ConfigForm({ onGenerate }: { onGenerate: (config: SiteConfig) => void }) {
  const [siteType, setSiteType] = useState<SiteType>("landing");
  const [color, setColor] = useState("#6366F1");
  const [tone, setTone] = useState("profissional");
  const [products, setProducts] = useState<Product[]>([{ name: "", price: "" }]);

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
      name: fd.get("name") as string,
      sector: fd.get("sector") as string,
      desc: fd.get("desc") as string,
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
          <Input id="sg-name" name="name" required placeholder="Ex: Floricultura Primavera" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sg-sector">Setor / nicho</Label>
          <Input id="sg-sector" name="sector" placeholder="Ex: floricultura, consultoria" />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="sg-desc">O que o negócio faz *</Label>
          <Textarea
            id="sg-desc"
            name="desc"
            rows={3}
            required
            placeholder="Descreva em 1-2 frases o que o negócio faz e para quem..."
          />
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
            + Adicionar produto
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

// ── Main Component ─────────────────────────────────────────────────────────────

export default function SiteGenerator() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  const [activeTab, setActiveTab] = useState("config");
  const { status, html, error, generate, refine, download, reset } = useSiteGenerator(tenantId);

  async function handleGenerate(config: SiteConfig) {
    setActiveTab("preview");
    await generate(config);
  }

  const canPreview = status !== "idle";
  const canRefine = status === "ready";

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Globe className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Gerador de Sites</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Crie landing pages, e-commerces e sites institucionais com IA em segundos.
          </p>
        </div>
        {status === "ready" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { reset(); setActiveTab("config"); }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Novo site
          </Button>
        )}
      </div>

      {/* Tabs */}
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
            ③ Refinar
          </TabsTrigger>
        </TabsList>

        <Card className="mt-2">
          <CardContent className="pt-6">
            <TabsContent value="config" className="mt-0">
              <ConfigForm onGenerate={handleGenerate} />
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
