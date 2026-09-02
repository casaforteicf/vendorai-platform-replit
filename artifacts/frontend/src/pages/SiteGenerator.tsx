import { useMemo, useState } from "react";
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
  FileBox,
  Globe,
  LayoutTemplate,
  Loader2,
  Megaphone,
  Package,
  RefreshCw,
  ShoppingCart,
  Sparkles,
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

const CREATION_MODES: Array<{
  id: CreationMode;
  title: string;
  description: string;
  icon: typeof Globe;
  coreType: string;
}> = [
  { id: "new-site", title: "Criar novo site com IA", description: "Site completo orientado ao negócio, público, oferta e conversão.", icon: Sparkles, coreType: "Institucional" },
  { id: "remodel", title: "Remodelar site existente", description: "Analise o site atual, preserve o que funciona e gere uma nova direção.", icon: RefreshCw, coreType: "Institucional" },
  { id: "landing", title: "Criar Landing Page", description: "Página focada em uma oferta, público e conversão específica.", icon: LayoutTemplate, coreType: "Landing page" },
  { id: "campaign", title: "Página de campanha", description: "Mensagem alinhada à campanha, anúncio, público, oferta e CTA.", icon: Megaphone, coreType: "Landing page" },
  { id: "product", title: "Página de produto ou serviço", description: "Página especializada para um item real do catálogo ou serviço.", icon: Package, coreType: "Produto específico" },
  { id: "catalog", title: "Catálogo / vitrine", description: "Organize categorias, linhas, produtos, mídia e caminhos de conversão.", icon: FileBox, coreType: "E-commerce ou Institucional" },
  { id: "ecommerce", title: "Criar e-commerce", description: "Loja com produtos, carrinho e estrutura comercial integrada.", icon: ShoppingCart, coreType: "E-commerce" },
];

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
  const [preserve, setPreserve] = useState("Logo, identidade visual, conteúdos aprovados e URLs importantes");
  const [remodelLevel, setRemodelLevel] = useState<RemodelLevel>("complete");
  const [analyzing, setAnalyzing] = useState(false);
  const [brandTone, setBrandTone] = useState<unknown>(null);

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

      const analyze = await fetch(`/api/tenants/${tenantId}/content-autopilot/analyze-site`, {
        method: "POST",
        headers: authHeaders(),
      });
      const body = await analyze.json().catch(() => ({}));
      if (!analyze.ok) throw new Error(body.error ?? "Não foi possível analisar o site");
      setBrandTone(body.brandTone ?? true);
      sessionStorage.setItem(
        "vendorai_site_remodel_context",
        JSON.stringify({ siteUrl: siteUrl.trim(), objective, preserve, remodelLevel, brandTone: body.brandTone ?? null }),
      );
      toast({ title: "Site analisado", description: "O tom da marca foi extraído e o contexto de remodelação foi preservado para esta sessão." });
    } catch (error: any) {
      toast({ title: "Erro ao analisar site", description: error.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><Wand2 className="h-4 w-4 text-primary" /> O que você quer criar?</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Escolha o ponto de partida. Todas as opções continuam usando o mesmo Gerador de Sites e os dados reais do tenant.</p>
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
            <CardTitle className="flex items-center gap-2 text-base"><RefreshCw className="h-4 w-4" /> Diagnóstico do site existente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="remodel-url">URL do site atual</Label>
                <Input id="remodel-url" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://www.suaempresa.com.br" />
                <p className="text-xs text-muted-foreground">O VendorAI acessa a página pública para analisar o tom atual da marca antes da nova geração.</p>
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
              {brandTone && <Badge variant="secondary"><CheckCircle2 className="mr-1 h-3 w-3" /> Site analisado</Badge>}
              <Button type="button" variant="outline" onClick={() => setShowGenerator(true)} disabled={!brandTone}>
                Continuar para estratégia e geração
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {mode !== "remodel" && !showGenerator && (
        <Card className="border-primary/20">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{selected.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">O fluxo atual do gerador será usado com foco em <strong>{selected.coreType}</strong>. Público, oferta, catálogo e produtos continuam separados no contexto de Marketing.</p>
            </div>
            <Button onClick={() => setShowGenerator(true)}>Continuar <Sparkles className="ml-2 h-4 w-4" /></Button>
          </CardContent>
        </Card>
      )}

      {showGenerator && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <Badge>{selected.title}</Badge>
              <span className="text-muted-foreground">Use o editor abaixo para concluir contexto, ativos, design, revisão e publicação.</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowGenerator(false)}>Trocar modo</Button>
          </div>
          <CoreSiteGeneratorTab />
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
          <p className="text-sm text-muted-foreground">Criação, remodelação e evolução de ativos digitais com IA.</p>
        </div>
      </div>
      <GeneratorWorkspace />
    </div>
  );
}
