import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGetBusinessProfileByTenant, getGetBusinessProfileByTenantQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Globe, Wand2, Loader2, ExternalLink, LayoutTemplate,
  ShoppingCart, Eye, CheckCircle2, ChevronRight, ChevronLeft,
  Palette, MessageSquare, Sparkles, AlertCircle, RefreshCw,
  Plus, Trash2,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SiteConfig {
  id: string;
  tenantId: string;
  tipo: string;
  status: string;
  ativo: boolean;
  heroImageUrl: string | null;
  tagline: string | null;
  corPrimaria: string | null;
  generatedContent: Record<string, unknown> | null;
  updatedAt: string;
}

type WizardStep = "tipo" | "aparencia" | "contexto" | "gerando" | "preview";

const TIPO_OPTIONS = [
  {
    id: "landing_page",
    icon: LayoutTemplate,
    label: "Landing Page",
    desc: "Apresentação profissional com serviços, depoimentos e formulário de contato.",
    tag: "Mais popular",
  },
  {
    id: "ecommerce",
    icon: ShoppingCart,
    label: "E-commerce",
    desc: "Loja virtual com catálogo de produtos, preços e botão de compra pelo WhatsApp.",
    tag: "Venda online",
  },
] as const;

const CORES = [
  { hex: "#1e3a5f", label: "Azul Marinho" },
  { hex: "#6366F1", label: "Indigo" },
  { hex: "#0EA5E9", label: "Azul Céu" },
  { hex: "#10B981", label: "Verde" },
  { hex: "#F59E0B", label: "Âmbar" },
  { hex: "#EF4444", label: "Vermelho" },
  { hex: "#EC4899", label: "Rosa" },
  { hex: "#8B5CF6", label: "Roxo" },
  { hex: "#14B8A6", label: "Teal" },
  { hex: "#D97706", label: "Laranja" },
];

const TOM_OPTIONS = [
  { value: "profissional", label: "Profissional e confiável", emoji: "🤝" },
  { value: "amigavel", label: "Amigável e próximo", emoji: "😊" },
  { value: "urgente", label: "Urgente e direto", emoji: "⚡" },
  { value: "premium", label: "Premium e sofisticado", emoji: "💎" },
  { value: "descontraido", label: "Descontraído e criativo", emoji: "🎨" },
];

// ── Step components ────────────────────────────────────────────────────────────

function StepTipo({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Que tipo de site você quer criar?</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Escolha o formato que melhor representa o seu negócio</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TIPO_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`text-left p-5 rounded-2xl border-2 transition-all cursor-pointer ${
                isSelected
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-xl ${isSelected ? "bg-primary text-white" : "bg-gray-100 text-gray-500"}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-sm">{opt.label}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${isSelected ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-500"}`}>
                      {opt.tag}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{opt.desc}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepAparencia({
  cor, onCorChange,
  tom, onTomChange,
}: {
  cor: string; onCorChange: (v: string) => void;
  tom: string; onTomChange: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Como o site deve parecer e soar?</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Defina a identidade visual e o tom de comunicação</p>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium">Cor principal da marca</Label>
        <div className="flex flex-wrap gap-2">
          {CORES.map((c) => (
            <button
              key={c.hex}
              type="button"
              title={c.label}
              aria-label={c.label}
              onClick={() => onCorChange(c.hex)}
              className={`w-9 h-9 rounded-full border-4 transition-all cursor-pointer ${
                cor === c.hex ? "border-foreground scale-110 shadow-md" : "border-transparent hover:scale-105"
              }`}
              style={{ background: c.hex }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-4 h-4 rounded-full border" style={{ background: cor }} />
          <span>{CORES.find((c) => c.hex === cor)?.label ?? cor}</span>
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium">Tom de voz</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TOM_OPTIONS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => onTomChange(t.value)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm text-left transition-all cursor-pointer ${
                tom === t.value
                  ? "border-primary bg-primary/5 text-primary font-medium"
                  : "border-border hover:border-muted-foreground text-foreground"
              }`}
            >
              <span className="text-lg leading-none">{t.emoji}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepContexto({
  tipo,
  painPoint, onPainPointChange,
  ctaText, onCtaChange,
  produtos, onProdutosChange,
  nomeNegocio, segmento,
}: {
  tipo: string;
  painPoint: string; onPainPointChange: (v: string) => void;
  ctaText: string; onCtaChange: (v: string) => void;
  produtos: Array<{ nome: string; preco: string }>;
  onProdutosChange: (p: Array<{ nome: string; preco: string }>) => void;
  nomeNegocio: string;
  segmento: string;
}) {
  function addProduto() {
    onProdutosChange([...produtos, { nome: "", preco: "" }]);
  }
  function removeProduto(i: number) {
    onProdutosChange(produtos.filter((_, idx) => idx !== i));
  }
  function updateProduto(i: number, field: "nome" | "preco", value: string) {
    onProdutosChange(produtos.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));
  }

  const ctaPlaceholder =
    tipo === "ecommerce" ? "Ex: Comprar pelo WhatsApp, Ver catálogo" : "Ex: Solicitar orçamento, Agendar visita";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">Detalhes do conteúdo</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Essas informações deixam a IA gerar textos muito mais persuasivos
        </p>
      </div>

      {(nomeNegocio || segmento) && (
        <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2.5 text-xs text-primary">
          <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Perfil encontrado: <strong>{nomeNegocio}</strong>{segmento ? ` · ${segmento}` : ""}. Os dados serão usados automaticamente.
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Qual a maior dor do seu cliente?</Label>
        <p className="text-[11px] text-muted-foreground">O problema que faz ele buscar o que você oferece</p>
        <Input
          value={painPoint}
          onChange={(e) => onPainPointChange(e.target.value)}
          placeholder={
            segmento
              ? `Ex: Dificuldade em ${segmento.toLowerCase()} sem perder qualidade`
              : "Ex: Perder tempo com processos manuais e sem resultado"
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">O que você quer que o visitante faça? (CTA)</Label>
        <p className="text-[11px] text-muted-foreground">A ação principal do botão de destaque</p>
        <Input
          value={ctaText}
          onChange={(e) => onCtaChange(e.target.value)}
          placeholder={ctaPlaceholder}
        />
      </div>

      {tipo === "ecommerce" && (
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium">Principais produtos / serviços</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Já importamos do catálogo — adicione extras se quiser destacar outros
            </p>
          </div>
          {produtos.map((p, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                value={p.nome}
                onChange={(e) => updateProduto(i, "nome", e.target.value)}
                placeholder="Nome do produto"
                className="flex-1"
              />
              <Input
                value={p.preco}
                onChange={(e) => updateProduto(i, "preco", e.target.value)}
                placeholder="R$ 0,00"
                className="w-28"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeProduto(i)}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addProduto} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Adicionar produto
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Preview card ───────────────────────────────────────────────────────────────

function SitePreviewCard({
  siteConfig,
  publicUrl,
  onAccept,
  onRedo,
  accepting,
}: {
  siteConfig: SiteConfig;
  publicUrl: string;
  onAccept: () => void;
  onRedo: () => void;
  accepting: boolean;
}) {
  const content = siteConfig.generatedContent ?? {};
  const hero = content["hero"] as Record<string, string> | undefined;
  const cores = content["cores"] as Record<string, string> | undefined;
  const servicos = content["servicos"] as Array<{ titulo: string; descricao: string; emoji?: string }> | undefined;
  const depoimentos = content["depoimentos"] as Array<{ nome: string; texto: string }> | undefined;
  const faq = content["faq"] as Array<{ pergunta: string }> | undefined;
  const primaryColor = cores?.primaria ?? siteConfig.corPrimaria ?? "#1e3a5f";

  const sections = [
    hero ? "Hero" : null,
    servicos?.length ? `Serviços (${servicos.length})` : null,
    content["diferenciais"] ? "Diferenciais" : null,
    depoimentos?.length ? `Depoimentos (${depoimentos.length})` : null,
    faq?.length ? `FAQ (${faq.length})` : null,
    content["cta_final"] ? "CTA final" : null,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
        <Sparkles className="h-4 w-4 shrink-0" />
        <span>Site gerado! Revise e decida se quer publicar.</span>
      </div>

      {/* Visual preview strip */}
      <div className="rounded-2xl overflow-hidden border shadow-sm">
        {siteConfig.heroImageUrl && (
          <div
            className="h-36 bg-cover bg-center relative"
            style={{ backgroundImage: `url(${siteConfig.heroImageUrl})` }}
          >
            <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white text-center px-6 gap-1">
              <p className="font-bold text-lg leading-tight">{hero?.headline ?? siteConfig.tagline ?? "Seu Site"}</p>
              {hero?.subheadline && (
                <p className="text-xs opacity-80 max-w-xs">{hero.subheadline}</p>
              )}
              {(hero?.cta || hero?.cta2) && (
                <div className="flex gap-2 mt-2">
                  {hero.cta && (
                    <span className="text-[11px] px-3 py-1 rounded-full text-white font-semibold" style={{ background: primaryColor }}>
                      {hero.cta}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: primaryColor }} />
          </div>
        )}
        {!siteConfig.heroImageUrl && hero?.headline && (
          <div className="h-24 flex flex-col items-center justify-center text-center px-4 gap-1" style={{ background: primaryColor }}>
            <p className="font-bold text-white text-base">{hero.headline}</p>
            {hero.subheadline && <p className="text-white/80 text-xs">{hero.subheadline}</p>}
          </div>
        )}

        {/* Sections summary */}
        <div className="p-4 bg-gray-50 border-t">
          <p className="text-xs text-muted-foreground font-medium mb-2">Seções geradas:</p>
          <div className="flex flex-wrap gap-1.5">
            {sections.map((s) => (
              <span key={s} className="text-[11px] bg-white border rounded-full px-2.5 py-0.5 text-foreground">
                {s}
              </span>
            ))}
          </div>
        </div>

        {/* Color palette preview */}
        <div className="px-4 py-3 bg-white border-t flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Cores:</span>
          <div className="flex gap-1.5">
            {[primaryColor, cores?.secundaria, cores?.acento].filter(Boolean).map((c, i) => (
              <div key={i} className="w-5 h-5 rounded-full border" style={{ background: c as string }} title={c as string} />
            ))}
          </div>
          {depoimentos?.[0] && (
            <p className="ml-auto text-[11px] text-muted-foreground italic truncate max-w-[180px]">
              "{depoimentos[0].texto.slice(0, 60)}…"
            </p>
          )}
        </div>
      </div>

      {/* CTA buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          onClick={onRedo}
          disabled={accepting}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refazer
        </Button>
        <Button
          onClick={onAccept}
          disabled={accepting}
          className="gap-2"
        >
          {accepting ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Publicando…</>
          ) : (
            <><CheckCircle2 className="h-4 w-4" /> Aceitar e publicar</>
          )}
        </Button>
      </div>

      <a href={publicUrl} target="_blank" rel="noreferrer">
        <Button variant="ghost" size="sm" className="w-full gap-1.5 text-muted-foreground text-xs">
          <Eye className="h-3.5 w-3.5" />
          Abrir prévia em nova aba (pode levar instantes para carregar)
        </Button>
      </a>
    </div>
  );
}

// ── Published card ─────────────────────────────────────────────────────────────

function PublishedCard({
  siteConfig,
  publicUrl,
  onTogglePublish,
  onRegenerate,
}: {
  siteConfig: SiteConfig;
  publicUrl: string;
  onTogglePublish: () => void;
  onRegenerate: () => void;
}) {
  const hero = siteConfig.generatedContent?.["hero"] as Record<string, string> | undefined;
  const cores = siteConfig.generatedContent?.["cores"] as Record<string, string> | undefined;
  const primaryColor = cores?.primaria ?? siteConfig.corPrimaria ?? "#1e3a5f";

  return (
    <Card className="overflow-hidden">
      {siteConfig.heroImageUrl && (
        <div
          className="h-24 w-full bg-cover bg-center relative"
          style={{ backgroundImage: `url(${siteConfig.heroImageUrl})` }}
        >
          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white text-center px-4">
            <p className="font-bold text-sm leading-tight">{hero?.headline ?? "Seu Site"}</p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: primaryColor }} />
        </div>
      )}
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Site publicado
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
              Ativo
            </Badge>
            <Badge variant="outline" className="text-xs">
              {siteConfig.tipo === "ecommerce" ? "E-commerce" : "Landing Page"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm">
          <Globe className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-muted-foreground truncate flex-1 font-mono text-xs">{publicUrl}</span>
          <a href={publicUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5 text-primary" />
          </a>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href={publicUrl} target="_blank" rel="noreferrer" className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-2">
              <Eye className="h-4 w-4" /> Ver site
            </Button>
          </a>
          <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={onTogglePublish}>
            <Globe className="h-4 w-4" /> Ocultar
          </Button>
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={onRegenerate}>
            <Wand2 className="h-3.5 w-3.5" /> Refazer
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Publicado em {new Date(siteConfig.updatedAt).toLocaleString("pt-BR")}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Progress bar ───────────────────────────────────────────────────────────────

const STEPS: { id: WizardStep; label: string; icon: React.ReactNode }[] = [
  { id: "tipo", label: "Tipo", icon: <LayoutTemplate className="h-3.5 w-3.5" /> },
  { id: "aparencia", label: "Aparência", icon: <Palette className="h-3.5 w-3.5" /> },
  { id: "contexto", label: "Contexto", icon: <MessageSquare className="h-3.5 w-3.5" /> },
];

function WizardProgress({ current }: { current: WizardStep }) {
  const stepIds = STEPS.map((s) => s.id);
  const currentIdx = stepIds.indexOf(current as any);
  if (currentIdx < 0) return null;
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              active ? "bg-primary text-white" : done ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              {step.icon}
              <span className="hidden sm:inline">{step.label}</span>
              <span className="sm:hidden">{i + 1}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 ${done ? "bg-primary/40" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function MeuSite() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const tenantSlug = (user as any)?.tenantSlug ?? tenantId;
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const { data: bp } = useGetBusinessProfileByTenant(tenantId, {
    query: { queryKey: getGetBusinessProfileByTenantQueryKey(tenantId), enabled: !!tenantId },
  });

  const nomeNegocio = bp?.nomeFantasia ?? bp?.razaoSocial ?? "";
  const segmento = bp?.vertical ?? "";

  // Wizard state
  const [step, setStep] = useState<WizardStep>("tipo");
  const [tipo, setTipo] = useState("landing_page");
  const [cor, setCor] = useState("#1e3a5f");
  const [tom, setTom] = useState("profissional");
  const [painPoint, setPainPoint] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [produtos, setProdutos] = useState<Array<{ nome: string; preco: string }>>([]);

  // Remote state
  const [siteConfig, setSiteConfig] = useState<SiteConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
  }

  const fetchConfig = useCallback(async () => {
    if (!tenantId) return;
    try {
      const r = await fetch(`${base}/api/tenants/${tenantId}/site-config`, {
        headers: authHeaders(),
      });
      if (r.ok) {
        const data: SiteConfig = await r.json();
        setSiteConfig(data);
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, base, token]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  // Sync cor from brand colors if available
  useEffect(() => {
    const disc = (bp as any)?.discoveryData ?? {};
    const brandColors = Array.isArray(disc.coresBrand) ? disc.coresBrand : [];
    if (brandColors[0]) setCor(brandColors[0]);
  }, [bp]);

  async function handleGenerate() {
    if (!tenantId) return;
    setStep("gerando");
    setGenerating(true);
    setError(null);
    try {
      const r = await fetch(`${base}/api/tenants/${tenantId}/site-config/generate`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ tipo, tom, corPrimaria: cor, painPoint, ctaText }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "Erro ao gerar site");
        setStep("contexto");
        return;
      }
      setSiteConfig(data.siteConfig);
      setStep("preview");
    } finally {
      setGenerating(false);
    }
  }

  async function handleAccept() {
    if (!siteConfig) return;
    setAccepting(true);
    try {
      const r = await fetch(`${base}/api/site-config/${siteConfig.id}`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ativo: true, status: "published" }),
      });
      if (r.ok) {
        const updated: SiteConfig = await r.json();
        setSiteConfig(updated);
        setShowWizard(false);
      }
    } finally {
      setAccepting(false);
    }
  }

  async function handleTogglePublish() {
    if (!siteConfig) return;
    const r = await fetch(`${base}/api/site-config/${siteConfig.id}`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ ativo: !siteConfig.ativo }),
    });
    if (r.ok) {
      const updated: SiteConfig = await r.json();
      setSiteConfig(updated);
    }
  }

  const publicUrl = `${window.location.origin}${base}/site/${tenantSlug}`;

  function startWizard() {
    setStep("tipo");
    setError(null);
    setShowWizard(true);
  }

  function goNext() {
    if (step === "tipo") setStep("aparencia");
    else if (step === "aparencia") setStep("contexto");
    else if (step === "contexto") handleGenerate();
  }

  function goPrev() {
    if (step === "aparencia") setStep("tipo");
    else if (step === "contexto") setStep("aparencia");
    else if (step === "preview" || step === "gerando") {
      setStep("contexto");
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Globe className="h-6 w-6 text-primary" />
          Meu Site
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          A IA cria um site profissional completo — texto, estrutura e imagens — em segundos.
        </p>
      </div>

      {/* Published site — shown when site is published and wizard not open */}
      {siteConfig?.ativo && !showWizard && (
        <PublishedCard
          siteConfig={siteConfig}
          publicUrl={publicUrl}
          onTogglePublish={handleTogglePublish}
          onRegenerate={startWizard}
        />
      )}

      {/* Wizard */}
      {(showWizard || !siteConfig?.ativo) && (
        <Card>
          <CardContent className="pt-6 space-y-5">
            {/* Progress */}
            {(step === "tipo" || step === "aparencia" || step === "contexto") && (
              <WizardProgress current={step} />
            )}

            {/* Step: tipo */}
            {step === "tipo" && (
              <>
                <StepTipo value={tipo} onChange={setTipo} />
                <div className="flex justify-end">
                  <Button onClick={goNext} className="gap-2">
                    Próximo <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {/* Step: aparencia */}
            {step === "aparencia" && (
              <>
                <StepAparencia
                  cor={cor} onCorChange={setCor}
                  tom={tom} onTomChange={setTom}
                />
                <div className="flex justify-between">
                  <Button variant="outline" onClick={goPrev} className="gap-2">
                    <ChevronLeft className="h-4 w-4" /> Voltar
                  </Button>
                  <Button onClick={goNext} className="gap-2">
                    Próximo <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {/* Step: contexto */}
            {step === "contexto" && (
              <>
                <StepContexto
                  tipo={tipo}
                  painPoint={painPoint} onPainPointChange={setPainPoint}
                  ctaText={ctaText} onCtaChange={setCtaText}
                  produtos={produtos} onProdutosChange={setProdutos}
                  nomeNegocio={nomeNegocio} segmento={segmento}
                />
                {error && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}
                <div className="flex justify-between">
                  <Button variant="outline" onClick={goPrev} className="gap-2">
                    <ChevronLeft className="h-4 w-4" /> Voltar
                  </Button>
                  <Button onClick={goNext} className="gap-2">
                    <Wand2 className="h-4 w-4" /> Gerar site
                  </Button>
                </div>
              </>
            )}

            {/* Generating */}
            {step === "gerando" && (
              <div className="py-10 flex flex-col items-center gap-4 text-center">
                <div className="relative">
                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-7 w-7 text-primary" />
                  </div>
                  <Loader2 className="h-14 w-14 animate-spin text-primary absolute inset-0" />
                </div>
                <div>
                  <p className="font-semibold">Criando seu site com IA…</p>
                  <p className="text-sm text-muted-foreground mt-1">Isso pode levar 20–40 segundos</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                  {["Analisando perfil", "Criando textos persuasivos", "Montando seções", "Escolhendo imagens"].map((t) => (
                    <span key={t} className="px-2.5 py-1 bg-muted rounded-full">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Preview */}
            {step === "preview" && siteConfig && (
              <SitePreviewCard
                siteConfig={siteConfig}
                publicUrl={publicUrl}
                onAccept={handleAccept}
                onRedo={() => setStep("contexto")}
                accepting={accepting}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty state when no site at all */}
      {!siteConfig?.generatedContent && !showWizard && step === "tipo" && (
        <div className="text-center py-6">
          <Button onClick={startWizard} size="lg" className="gap-2">
            <Wand2 className="h-5 w-5" />
            Criar meu site agora
          </Button>
        </div>
      )}
    </div>
  );
}
