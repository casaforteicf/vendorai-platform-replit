import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { SiteGeneratorTab as CoreSiteGeneratorTab } from "./SiteGeneratorCore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  CheckCircle2,
  Copy,
  FileBox,
  Globe,
  LayoutTemplate,
  Loader2,
  Lock,
  Megaphone,
  Package,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Unlock,
  Wand2,
} from "lucide-react";

type CreationMode =
  | "new-site"
  | "remodel"
  | "landing"
  | "campaign"
  | "product"
  | "catalog"
  | "ecommerce";

type RemodelLevel = "visual" | "structural" | "complete";

type RemodelStructure = {
  sourceUrl: string;
  title: string;
  metaDescription: string;
  nav: string;
  headings: Array<{ level: number; text: string }>;
  links: Array<{ href: string; label: string }>;
  images: string[];
  sections: Array<{ index: number; key: string; title: string; excerpt: string }>;
  bodyExcerpt: string;
};

type GovernanceSite = {
  id: string;
  name: string;
  siteType: string;
  updatedAt: string;
  published?: boolean;
};

type GovernanceSection = {
  index: number;
  key: string;
  title: string;
  locked: boolean;
};

const CREATION_MODES: Array<{
  id: CreationMode;
  title: string;
  description: string;
  icon: typeof Globe;
  coreType: string;
}> = [
  { id: "new-site", title: "Criar novo site com IA", description: "Site completo orientado ao negócio, público, oferta e conversão.", icon: Sparkles, coreType: "Institucional" },
  { id: "remodel", title: "Remodelar site existente", description: "Analise estrutura, conteúdo e identidade do site atual antes de criar a nova versão.", icon: RefreshCw, coreType: "Institucional" },
  { id: "landing", title: "Criar Landing Page", description: "Página focada em uma oferta, público e conversão específica.", icon: LayoutTemplate, coreType: "Landing page" },
  { id: "campaign", title: "Página de campanha", description: "Mensagem alinhada à campanha, anúncio, público, oferta e CTA.", icon: Megaphone, coreType: "Landing page" },
  { id: "product", title: "Página de produto ou serviço", description: "Página especializada para um item real do catálogo ou serviço.", icon: Package, coreType: "Produto específico" },
  { id: "catalog", title: "Catálogo / vitrine", description: "Organize categorias, linhas, produtos, mídia e caminhos de conversão.", icon: FileBox, coreType: "Catálogo" },
  { id: "ecommerce", title: "Criar e-commerce", description: "Loja com produtos, carrinho e estrutura comercial integrada.", icon: ShoppingCart, coreType: "E-commerce" },
];

const CORE_TYPE_BY_MODE: Record<CreationMode, "landing" | "ecommerce" | "institutional" | "product"> = {
  "new-site": "institutional",
  remodel: "institutional",
  landing: "landing",
  campaign: "landing",
  product: "product",
  catalog: "institutional",
  ecommerce: "ecommerce",
};

const STEPS = [
  "Contexto",
  "Público & Oferta",
  "Estratégia IA",
  "Conteúdo & Ativos",
  "Design & Geração",
  "Revisão & Otimização",
  "Publicação & Ativação",
];

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function SiteGovernance({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const [sites, setSites] = useState<GovernanceSite[]>([]);
  const [siteId, setSiteId] = useState("");
  const [sections, setSections] = useState<GovernanceSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  async function loadSites(preferredId?: string) {
    if (!tenantId) return;
    const response = await fetch(`/api/tenants/${tenantId}/site-generator`, { headers: authHeaders() });
    if (!response.ok) return;
    const data = await response.json();
    const rows = Array.isArray(data) ? data as GovernanceSite[] : [];
    setSites(rows);
    const nextId = preferredId && rows.some((site) => site.id === preferredId)
      ? preferredId
      : siteId && rows.some((site) => site.id === siteId)
        ? siteId
        : rows[0]?.id ?? "";
    setSiteId(nextId);
  }

  async function loadSections(id: string) {
    if (!id) {
      setSections([]);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/site-generator/${id}/sections`, { headers: authHeaders() });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar as seções");
      setSections(body.sections ?? []);
    } catch (error: any) {
      toast({ title: "Erro ao carregar governança", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    void loadSections(siteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  async function toggleSection(section: GovernanceSection) {
    if (!siteId || saving) return;
    const next = sections.map((item) => item.key === section.key ? { ...item, locked: !item.locked } : item);
    setSections(next);
    setSaving(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/site-generator/${siteId}/protection`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ lockedSectionKeys: next.filter((item) => item.locked).map((item) => item.key) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível salvar a proteção");
      toast({
        title: section.locked ? "Seção liberada para IA" : "Seção protegida",
        description: section.locked ? "A IA poderá alterar esta seção novamente." : "Refinamentos por IA preservarão esta seção exatamente como está.",
      });
    } catch (error: any) {
      setSections(sections);
      toast({ title: "Erro ao salvar proteção", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function duplicateVersion() {
    if (!siteId || duplicating) return;
    const source = sites.find((site) => site.id === siteId);
    setDuplicating(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/site-generator/${siteId}/duplicate`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name: `${source?.name ?? "Site"} — nova versão` }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível criar a nova versão");
      await loadSites(body.id);
      toast({ title: "Nova versão criada", description: "Foi criada uma cópia não publicada para evoluir sem alterar a versão atual." });
    } catch (error: any) {
      toast({ title: "Erro ao criar versão", description: error.message, variant: "destructive" });
    } finally {
      setDuplicating(false);
    }
  }

  if (sites.length === 0) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" /> Governança do Site</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Proteja conteúdo aprovado contra alterações da IA e crie novas versões sem mexer no site atual.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className="h-9 min-w-56 rounded-md border bg-background px-3 text-sm"
              value={siteId}
              onChange={(event) => setSiteId(event.target.value)}
            >
              {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={duplicateVersion} disabled={duplicating || !siteId}>
              {duplicating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
              Gerar novo modelo desta versão
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lendo estrutura do site...</div>
        ) : sections.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">A estrutura deste site não possui seções identificáveis para bloqueio automático.</div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {sections.map((section) => (
              <button
                type="button"
                key={section.key}
                disabled={saving}
                onClick={() => toggleSection(section)}
                className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${section.locked ? "border-primary/40 bg-primary/5" : "hover:border-primary/30"}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{section.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Seção {section.index + 1}</p>
                </div>
                {section.locked ? <Lock className="h-4 w-4 shrink-0 text-primary" /> : <Unlock className="h-4 w-4 shrink-0 text-muted-foreground" />}
              </button>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">🔒 Bloqueada = refinamentos por IA restauram o HTML aprovado dessa seção. Edição manual continua sob controle do usuário.</p>
      </CardContent>
    </Card>
  );
}

function GeneratorWorkspace() {
  const { user } = useAuth();
  const tenantId = (user as any)?.tenantId ?? "";
  const { toast } = useToast();
  const [mode, setMode] = useState<CreationMode>(() => {
    return (sessionStorage.getItem("vendorai_site_creation_mode") as CreationMode | null) ?? "new-site";
  });
  const [showGenerator, setShowGenerator] = useState(false);
  const [siteUrl, setSiteUrl] = useState("");
  const [objective, setObjective] = useState("");
  const [preserve, setPreserve] = useState("Logo, identidade visual, conteúdos aprovados, URLs importantes e informações comerciais verdadeiras");
  const [remodelLevel, setRemodelLevel] = useState<RemodelLevel>("complete");
  const [analyzing, setAnalyzing] = useState(false);
  const [brandTone, setBrandTone] = useState<unknown>(null);
  const [structure, setStructure] = useState<RemodelStructure | null>(null);

  const selected = useMemo(() => CREATION_MODES.find((item) => item.id === mode)!, [mode]);

  function chooseMode(next: CreationMode) {
    setMode(next);
    setShowGenerator(false);
    sessionStorage.setItem("vendorai_site_creation_mode", next);
  }

  async function analyzeExistingSite() {
    if (!tenantId || !siteUrl.trim()) {
      toast({ title: "Informe a URL do site atual", variant: "destructive" });
      return;
    }
    setAnalyzing(true);
    try {
      const save = await fetch(`/api/tenants/${tenantId}/content-autopilot/config`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ siteUrl: siteUrl.trim() }),
      });
      if (!save.ok) {
        const body = await save.json().catch(() => ({}));
        throw new Error(body.error ?? "Não foi possível conectar a URL");
      }

      const [toneResponse, structureResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/content-autopilot/analyze-site`, { method: "POST", headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/site-generator/remodel-analyze`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ url: siteUrl.trim() }),
        }),
      ]);
      const toneBody = await toneResponse.json().catch(() => ({}));
      const structureBody = await structureResponse.json().catch(() => ({}));
      if (!toneResponse.ok) throw new Error(toneBody.error ?? "Não foi possível analisar o tom da marca");
      if (!structureResponse.ok) throw new Error(structureBody.error ?? "Não foi possível analisar a estrutura do site");

      const nextStructure = structureBody as RemodelStructure;
      setBrandTone(toneBody.brandTone ?? true);
      setStructure(nextStructure);
      sessionStorage.setItem(
        "vendorai_site_remodel_context",
        JSON.stringify({
          siteUrl: siteUrl.trim(),
          objective,
          preserve,
          remodelLevel,
          brandTone: toneBody.brandTone ?? null,
          structure: nextStructure,
        }),
      );
      toast({ title: "Site analisado por completo", description: `Estrutura, tom da marca, ${nextStructure.sections?.length ?? 0} seções e hierarquia de conteúdo foram mapeados.` });
    } catch (error: any) {
      toast({ title: "Erro ao analisar site", description: error.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  }

  useEffect(() => {
    if (!showGenerator || !tenantId) return;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const target = `/api/tenants/${tenantId}/site-generator/generate`;
      if (method === "POST" && url.includes(target) && typeof init?.body === "string") {
        try {
          const body = JSON.parse(init.body);
          body.creationMode = mode;
          body.type = CORE_TYPE_BY_MODE[mode];
          if (mode === "remodel") {
            const stored = sessionStorage.getItem("vendorai_site_remodel_context");
            if (stored) body.remodelContext = JSON.parse(stored);
          }
          return originalFetch(input, { ...init, body: JSON.stringify(body) });
        } catch {
          return originalFetch(input, init);
        }
      }
      return originalFetch(input, init);
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, [showGenerator, tenantId, mode]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><Wand2 className="h-4 w-4 text-primary" /> O que você quer criar?</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Escolha o ponto de partida. Todas as opções usam o mesmo motor do Gerador e os dados reais do tenant.</p>
            </div>
            <Badge variant="secondary">7 modos</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {CREATION_MODES.map((item) => {
              const Icon = item.icon;
              const active = mode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => chooseMode(item.id)}
                  className={`rounded-xl border p-4 text-left transition-all ${active ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "hover:border-primary/40 hover:bg-muted/30"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                    {active && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="mt-3 text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto">
        <div className="flex min-w-max items-center gap-2 rounded-xl border bg-muted/20 p-3">
          {STEPS.map((step, index) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${index === 0 ? "bg-primary text-primary-foreground" : "bg-background border"}`}>{index + 1}</div>
              <span className={`text-xs ${index === 0 ? "font-semibold" : "text-muted-foreground"}`}>{step}</span>
              {index < STEPS.length - 1 && <span className="mx-1 text-muted-foreground/40">→</span>}
            </div>
          ))}
        </div>
      </div>

      {mode === "remodel" && !showGenerator && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><RefreshCw className="h-4 w-4" /> Diagnóstico estrutural do site existente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="remodel-url">URL do site atual</Label>
                <Input id="remodel-url" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://www.suaempresa.com.br" />
                <p className="text-xs text-muted-foreground">A análise lê a página pública, hierarquia, navegação, headings, seções, imagens e tom da marca.</p>
              </div>
              <div className="space-y-2">
                <Label>Nível de remodelação</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["visual", "structural", "complete"] as RemodelLevel[]).map((level) => (
                    <Button key={level} type="button" size="sm" variant={remodelLevel === level ? "default" : "outline"} onClick={() => setRemodelLevel(level)}>
                      {level === "visual" ? "Visual" : level === "structural" ? "Estrutural" : "Completa IA"}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="remodel-objective">Objetivo da remodelação</Label>
                <Textarea id="remodel-objective" value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Ex.: modernizar o visual, aumentar pedidos de orçamento e criar páginas por público." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="remodel-preserve">O que deve ser preservado</Label>
                <Textarea id="remodel-preserve" value={preserve} onChange={(e) => setPreserve(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={analyzeExistingSite} disabled={analyzing}>
                {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
                Analisar site atual
              </Button>
              {brandTone && structure && <Badge variant="secondary"><CheckCircle2 className="mr-1 h-3 w-3" /> Estrutura e marca analisadas</Badge>}
              <Button type="button" variant="outline" onClick={() => setShowGenerator(true)} disabled={!brandTone || !structure}>
                Continuar para estratégia e geração
              </Button>
            </div>
            {structure && (
              <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-4">
                <div><p className="text-[10px] uppercase text-muted-foreground">Título atual</p><p className="mt-1 line-clamp-2 text-xs font-medium">{structure.title || "Não identificado"}</p></div>
                <div><p className="text-[10px] uppercase text-muted-foreground">Seções</p><p className="mt-1 text-lg font-bold">{structure.sections.length}</p></div>
                <div><p className="text-[10px] uppercase text-muted-foreground">Headings</p><p className="mt-1 text-lg font-bold">{structure.headings.length}</p></div>
                <div><p className="text-[10px] uppercase text-muted-foreground">Imagens mapeadas</p><p className="mt-1 text-lg font-bold">{structure.images.length}</p></div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {mode !== "remodel" && !showGenerator && (
        <Card className="border-primary/20">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{selected.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">O motor existente será usado com foco em <strong>{selected.coreType}</strong>. Público, oferta, catálogo e produtos continuam separados no contexto de Marketing.</p>
            </div>
            <Button onClick={() => setShowGenerator(true)}>Continuar <Sparkles className="ml-2 h-4 w-4" /></Button>
          </CardContent>
        </Card>
      )}

      {showGenerator && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <Badge>{selected.title}</Badge>
              <span className="text-muted-foreground">O contexto deste modo será enviado automaticamente ao motor de geração.</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowGenerator(false)}>Trocar modo</Button>
          </div>
          <CoreSiteGeneratorTab />
          <SiteGovernance tenantId={tenantId} />
        </div>
      )}
    </div>
  );
}

export function SiteGeneratorTab() {
  return <GeneratorWorkspace />;
}

export default function SiteGenerator() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Building2 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gerador de Sites</h1>
          <p className="text-sm text-muted-foreground">Criação, remodelação, proteção, versionamento e evolução de ativos digitais com IA.</p>
        </div>
      </div>
      <GeneratorWorkspace />
    </div>
  );
}
