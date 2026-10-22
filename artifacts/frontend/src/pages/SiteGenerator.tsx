import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { SiteGeneratorTab as CoreSiteGeneratorTab } from "./SiteGeneratorCore";
import { useRequestUploadUrl } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Building2, CheckCircle2, Copy, FileBox, Globe, ImageIcon, LayoutTemplate, Loader2, Lock, Megaphone, Package, Plus, Quote, RefreshCw, Search, ShieldCheck, ShoppingCart, Sparkles, Trash2, Unlock, Upload, Video, Wand2 } from "lucide-react";
import {
  CampaignSiteBriefingPicker,
  buildCampaignSiteContextText,
  inferCampaignSiteObjective,
  type SiteCampaignBriefing,
} from "@/components/marketing/CampaignSiteBriefingPicker";

type Mode = "new-site" | "remodel" | "landing" | "campaign" | "product" | "catalog" | "ecommerce";
type RemodelLevel = "visual" | "structural" | "complete";
type AssetKind = "image" | "video";
type MotionPreset = "auto" | "clean" | "cinematic" | "premium" | "dynamic" | "minimal";
type MotionSourceAsset = { assetId: string; url: string; kind: AssetKind; name: string };
type MotionJob = {
  id: string;
  operation: string;
  status: "running" | "done" | "error" | string;
  progress?: number | null;
  total?: number | null;
  error?: string | null;
  output?: { videoUrl?: string; videoAssetId?: string; duration?: number; aspectRatio?: "portrait" | "landscape" } | null;
};
type CatalogItem = { id: string; nome: string; precoBase?: string | number | null; descricao?: string | null; categoria?: string | null; marca?: string | null; imagemUrl?: string | null; imagens?: string[] | null; ativo?: boolean };
type Keyword = { termo: string; volumeBusca?: number | null; serpTop10?: unknown };
type Testimonial = { id: string; name: string; company: string; text: string; mediaUrl: string; mediaType: AssetKind | null };
type ExtraContent = { id: string; title: string; text: string; mediaUrl: string; mediaType: AssetKind | null };
type RemodelStructure = { sourceUrl: string; title: string; nav: string; images: string[]; sections: Array<{ title: string; excerpt: string }>; bodyExcerpt: string };
type GovernanceSite = { id: string; name: string };
type GovernanceSection = { index: number; key: string; title: string; locked: boolean };

type BriefingSuggestion = { value: string; source: "Perfil" | "Catálogo" | "Mercado" | "IA"; productId?: string };
type AiBusinessSuggestions = { audiences: Array<{ value: string; reason?: string }>; offers: Array<{ value: string; productId?: string; reason?: string }> };
type RevenueScoutLpDraft = {
  campaignId: string;
  audience?: string;
  offer?: string;
  objective?: string;
  notes?: string;
  productIds?: string[];
  headline?: string;
  subheadline?: string;
};

function normalizeSuggestion(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(normalizeSuggestion);
  if (typeof value !== "string") return [];
  return value
    .split(/\n|;|\||•/g)
    .map((item) => item.replace(/^[-–—\s]+/, "").trim())
    .filter((item) => item.length >= 2 && item.length <= 180);
}

function uniqueSuggestions(items: BriefingSuggestion[], limit = 8) {
  const seen = new Set<string>();
  const out: BriefingSuggestion[] = [];
  for (const item of items) {
    const key = item.value.trim().toLocaleLowerCase("pt-BR");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, value: item.value.trim() });
    if (out.length >= limit) break;
  }
  return out;
}

const MODES: Array<{ id: Mode; title: string; short: string; desc: string; icon: typeof Globe; type: "landing" | "ecommerce" | "institutional" | "product" }> = [
  { id: "new-site", title: "Criar novo site com IA", short: "Site completo com IA", desc: "Site completo orientado ao negócio, público, oferta e conversão.", icon: Sparkles, type: "institutional" },
  { id: "remodel", title: "Remodelar site existente", short: "Remodelar site", desc: "Analisa estrutura e conteúdo do site atual antes de criar a nova versão.", icon: RefreshCw, type: "institutional" },
  { id: "landing", title: "Criar Landing Page", short: "Landing Page", desc: "Página focada em uma oferta, público e conversão específica.", icon: LayoutTemplate, type: "landing" },
  { id: "campaign", title: "Página de campanha", short: "Página de campanha", desc: "Mensagem alinhada à campanha, anúncio, público, oferta e CTA.", icon: Megaphone, type: "landing" },
  { id: "product", title: "Página de produto ou serviço", short: "Produto ou serviço", desc: "Página especializada para um item real do catálogo ou serviço.", icon: Package, type: "product" },
  { id: "catalog", title: "Catálogo / vitrine", short: "Catálogo / vitrine", desc: "Organiza categorias, linhas, produtos e caminhos de conversão.", icon: FileBox, type: "institutional" },
  { id: "ecommerce", title: "Criar e-commerce", short: "E-commerce", desc: "Loja com produtos, carrinho e estrutura comercial integrada.", icon: ShoppingCart, type: "ecommerce" },
];
const OBJECTIVES = [
  { id: "leads", label: "Gerar leads", cta: "Falar com especialista" },
  { id: "quote", label: "Solicitar orçamento", cta: "Solicitar orçamento" },
  { id: "sales", label: "Vender", cta: "Comprar agora" },
  { id: "schedule", label: "Agendar", cta: "Agendar agora" },
  { id: "whatsapp", label: "Levar para o WhatsApp", cta: "Falar no WhatsApp" },
  { id: "brand", label: "Apresentar a empresa", cta: "Conhecer a empresa" },
] as const;
const STEPS = ["Contexto", "Público & Oferta", "Estratégia IA", "Conteúdo & Ativos", "Design & Geração", "Revisão & Otimização", "Publicação & Ativação"];

function headers(token?: string | null): Record<string, string> { return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" }; }
function price(v: string | number | null | undefined) { const n = Number(v ?? 0); return Number.isFinite(n) && n > 0 ? `R$ ${n.toFixed(2).replace(".", ",")}` : ""; }
function inferMediaKind(url: string): AssetKind { return /(?:youtube\.com|youtu\.be|vimeo\.com|\.(?:mp4|webm|mov|m4v)(?:$|\?))/i.test(url) ? "video" : "image"; }
function pendingJobKey(tenantId: string) { return `vendorai_site_generation_job:${tenantId}`; }
function competitorHosts(keywords: Keyword[]) {
  const out = new Set<string>();
  for (const k of keywords) for (const r of (Array.isArray(k.serpTop10) ? k.serpTop10 : []) as any[]) {
    const raw = r?.domain ?? r?.url ?? r?.link; if (!raw || typeof raw !== "string") continue;
    try { out.add((raw.includes("://") ? new URL(raw).hostname : raw).replace(/^www\./, "").split("/")[0]); } catch {}
    if (out.size >= 8) return [...out];
  }
  return [...out];
}

async function resilientFetch(url: string, init: RequestInit = {}, maxAttempts = 3): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, cache: init.cache ?? "no-store" });
      if (![429, 502, 503, 504].includes(response.status) || attempt === maxAttempts - 1) return response;
      const retryAfter = Number(response.headers.get("retry-after") ?? "");
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 15_000)
        : Math.min(1000 * (2 ** attempt), 12_000);
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts - 1) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(1000 * (2 ** attempt), 12_000)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Não foi possível conectar ao servidor");
}

function CoreEditor({ onNew, tenantId, token }: { onNew: () => void; tenantId: string; token?: string | null }) {
  const [html, setHtml] = useState("");
  const [siteName, setSiteName] = useState("");
  const [sites, setSites] = useState<Array<{ id: string; name?: string; html?: string; updatedAt?: string; createdAt?: string }>>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullEditor, setFullEditor] = useState(false);

  async function loadPreview(requestedSiteId?: string) {
    if (!tenantId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const listRes = await resilientFetch(`/api/tenants/${tenantId}/site-generator?includeHtml=0`, { headers: headers(token) }, 2);
      if (!listRes.ok) {
        throw new Error(listRes.status === 429
          ? "O servidor está temporariamente limitando requisições. O VendorAI tentou novamente automaticamente."
          : `Não foi possível listar os sites (${listRes.status})`);
      }
      const rows = await listRes.json();
      if (!Array.isArray(rows) || !rows.length) throw new Error("Nenhum site criado ainda");
      const sorted = [...rows].sort((a: any, b: any) =>
        new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime());
      setSites(sorted);

      const currentExists = selectedSiteId && sorted.some((site: any) => site.id === selectedSiteId);
      const requestedExists = requestedSiteId && sorted.some((site: any) => site.id === requestedSiteId);
      const targetId = requestedExists ? requestedSiteId! : currentExists ? selectedSiteId : sorted[0].id;
      const targetSite = sorted.find((site: any) => site.id === targetId);

      const previewRes = await resilientFetch(
        `/api/tenants/${tenantId}/site-generator/${targetId}/preview?format=html`,
        { headers: { ...headers(token), Accept: "text/html" }, cache: "no-store" },
        1,
      );
      const siteHtml = await previewRes.text();
      if (!previewRes.ok || !siteHtml.trim()) {
        throw new Error(`Não foi possível carregar o HTML salvo (${previewRes.status})`);
      }
      setSelectedSiteId(targetId);
      setHtml(siteHtml);
      setSiteName(targetSite?.name ?? sorted.find((item: any) => item.id === targetId)?.name ?? "Site");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível abrir o preview");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelectedSiteId("");
    void loadPreview();
  }, [tenantId, token]);

  function openInNewTab() {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (!popup) {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/20 px-4 py-3">
      <div><p className="text-sm font-semibold">Site pronto para revisar{siteName ? ` — ${siteName}` : ""}</p><p className="text-xs text-muted-foreground">O preview usa diretamente o HTML salvo. Você pode alternar entre todos os sites gerados sem depender do editor.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        {sites.length > 0 && <select aria-label="Selecionar site para visualizar" className="h-9 max-w-[260px] rounded-md border bg-background px-3 text-sm" value={selectedSiteId} onChange={(e) => void loadPreview(e.target.value)} disabled={loading}>
          {sites.map((site) => <option key={site.id} value={site.id}>{site.name || "Site"}{site.updatedAt || site.createdAt ? ` — ${new Date(site.updatedAt ?? site.createdAt ?? "").toLocaleDateString("pt-BR")}` : ""}</option>)}
        </select>}
        {html && <Button size="sm" variant="outline" onClick={openInNewTab}><Globe className="mr-2 h-4 w-4" />Abrir em nova aba</Button>}
        <Button size="sm" variant="outline" onClick={() => void loadPreview(selectedSiteId || undefined)} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Atualizar</Button>
        <Button size="sm" onClick={() => setFullEditor((v) => !v)} disabled={!html}>{fullEditor ? "Ocultar editor" : "Editar / SEO / Publicar"}</Button>
        <Button size="sm" variant="outline" onClick={onNew}><Plus className="mr-2 h-4 w-4" />Criar outro</Button>
      </div>
    </div>
    {loading && <Card><CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando o HTML salvo do site…</CardContent></Card>}
    {!loading && loadError && <Card className="border-destructive/30"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-5"><div><p className="text-sm font-semibold text-destructive">Não foi possível abrir o preview agora</p><p className="text-xs text-muted-foreground">{loadError}</p></div><Button size="sm" variant="outline" onClick={() => void loadPreview(selectedSiteId || undefined)}>Tentar novamente</Button></CardContent></Card>}
    {!loading && html && <div className="overflow-hidden rounded-xl border bg-white"><iframe srcDoc={html} title={`Preview ${siteName || "do site"}`} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" className="block w-full border-0" style={{ height: 720 }} /></div>}
    {fullEditor && <div className="rounded-xl border p-3"><CoreSiteGeneratorTab /></div>}
  </div>;
}

function Governance({ tenantId, token }: { tenantId: string; token?: string | null }) {
  const { toast } = useToast(); const [sites, setSites] = useState<GovernanceSite[]>([]); const [siteId, setSiteId] = useState(""); const [sections, setSections] = useState<GovernanceSection[]>([]); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!tenantId) return; fetch(`/api/tenants/${tenantId}/site-generator?includeHtml=0`, { headers: headers(token), cache: "no-store" }).then((r) => r.ok ? r.json() : []).then((rows) => { const a = Array.isArray(rows) ? rows : []; setSites(a); setSiteId((v) => v || a[0]?.id || ""); }); }, [tenantId, token]);
  useEffect(() => { if (!siteId) return setSections([]); fetch(`/api/tenants/${tenantId}/site-generator/${siteId}/sections`, { headers: headers(token), cache: "no-store" }).then((r) => r.ok ? r.json() : {}).then((b: any) => setSections(b.sections ?? [])); }, [siteId, tenantId, token]);
  async function save(next: GovernanceSection[]) { setBusy(true); try { const r = await fetch(`/api/tenants/${tenantId}/site-generator/${siteId}/protection`, { method: "PATCH", headers: headers(token), body: JSON.stringify({ lockedSectionKeys: next.filter((x) => x.locked).map((x) => x.key) }) }); if (!r.ok) throw new Error("Falha ao salvar proteção"); setSections(next); } catch (e) { toast({ title: "Erro ao salvar proteção", description: e instanceof Error ? e.message : undefined, variant: "destructive" }); } finally { setBusy(false); } }
  async function duplicate() { setBusy(true); try { const s = sites.find((x) => x.id === siteId); const r = await fetch(`/api/tenants/${tenantId}/site-generator/${siteId}/duplicate`, { method: "POST", headers: headers(token), body: JSON.stringify({ name: `${s?.name ?? "Site"} — nova versão` }) }); if (!r.ok) throw new Error("Falha ao criar versão"); toast({ title: "Nova versão criada", description: "A versão atual continua intacta." }); } catch (e) { toast({ title: "Erro", description: e instanceof Error ? e.message : undefined, variant: "destructive" }); } finally { setBusy(false); } }
  if (!sites.length) return null;
  return <Card className="border-primary/20"><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><div><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" />Governança</CardTitle><p className="mt-1 text-xs text-muted-foreground">Bloqueie seções aprovadas ou gere uma nova versão.</p></div><div className="flex gap-2"><select className="h-9 rounded-md border bg-background px-3 text-sm" value={siteId} onChange={(e) => setSiteId(e.target.value)}>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><Button size="sm" variant="outline" onClick={duplicate} disabled={busy}><Copy className="mr-2 h-4 w-4" />Nova versão</Button></div></div></CardHeader><CardContent><div className="grid gap-2 md:grid-cols-3">{sections.map((s) => <button type="button" key={s.key} disabled={busy} onClick={() => void save(sections.map((x) => x.key === s.key ? { ...x, locked: !x.locked } : x))} className={`flex items-center justify-between rounded-lg border p-3 text-left text-sm ${s.locked ? "border-primary/40 bg-primary/5" : ""}`}><span className="truncate">{s.title}</span>{s.locked ? <Lock className="h-4 w-4 text-primary" /> : <Unlock className="h-4 w-4 text-muted-foreground" />}</button>)}</div></CardContent></Card>;
}

function GeneratorWorkspace() {
  const { user, token, tenantOverride } = useAuth(); const tenantId = user?.tenantId ?? ""; const { toast } = useToast(); const uploadHook = useRequestUploadUrl();
  const [mode, setMode] = useState<Mode>(() => (sessionStorage.getItem("vendorai_site_creation_mode") as Mode | null) ?? "new-site"); const [choosing, setChoosing] = useState(true); const [editContext, setEditContext] = useState(false); const [assetsOpen, setAssetsOpen] = useState(false); const [editor, setEditor] = useState(false); const [generating, setGenerating] = useState(false); const [error, setError] = useState<string | null>(null);
  const [audience, setAudience] = useState(""); const [offer, setOffer] = useState(""); const [objectiveId, setObjectiveId] = useState<(typeof OBJECTIVES)[number]["id"]>("leads"); const [name, setName] = useState(""); const [sector, setSector] = useState(""); const [desc, setDesc] = useState(""); const [notes, setNotes] = useState(""); const [tone, setTone] = useState("profissional");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]); const [selected, setSelected] = useState<string[]>([]); const [images, setImages] = useState<string[]>([]); const [videos, setVideos] = useState<string[]>([]); const [videoUrl, setVideoUrl] = useState(""); const [testimonials, setTestimonials] = useState<Testimonial[]>([]); const [extras, setExtras] = useState<ExtraContent[]>([]); const [uploads, setUploads] = useState(0);
  const [motionAssets, setMotionAssets] = useState<MotionSourceAsset[]>([]);
  const [motionOpen, setMotionOpen] = useState(false);
  const [motionSourceUrl, setMotionSourceUrl] = useState("");
  const [motionPreset, setMotionPreset] = useState<MotionPreset>("auto");
  const [motionDuration, setMotionDuration] = useState("8");
  const [motionAspectRatio, setMotionAspectRatio] = useState<"landscape" | "portrait">("landscape");
  const [motionPrompt, setMotionPrompt] = useState("");
  const [motionPreserve, setMotionPreserve] = useState(true);
  const [motionLoop, setMotionLoop] = useState(true);
  const [motionBusy, setMotionBusy] = useState(false);
  const [motionProjectId, setMotionProjectId] = useState("");
  const [motionJobId, setMotionJobId] = useState("");
  const [motionJob, setMotionJob] = useState<MotionJob | null>(null);
  const [market, setMarket] = useState<{ tone?: string; keywords: Keyword[]; competitors: string[] } | null>(null); const [marketBusy, setMarketBusy] = useState(false); const [aiBusiness, setAiBusiness] = useState<AiBusinessSuggestions | null>(null); const [aiBusinessBusy, setAiBusinessBusy] = useState(false); const [bp, setBp] = useState<any>(null); const aiBusinessKey = useRef(""); const aiBusinessFailedUntil = useRef(0);
  const [siteUrl, setSiteUrl] = useState(""); const [remodelLevel, setRemodelLevel] = useState<RemodelLevel>("complete"); const [preserve, setPreserve] = useState("Logo, identidade visual, conteúdos aprovados, URLs importantes e informações comerciais verdadeiras"); const [structure, setStructure] = useState<RemodelStructure | null>(null); const [remodelTone, setRemodelTone] = useState<unknown>(null); const [analyzing, setAnalyzing] = useState(false);
  const [campaignBriefing, setCampaignBriefing] = useState<SiteCampaignBriefing | null>(null);
  const init = useRef(false); const defaults = useRef("");
  const revenueScoutHandoff = useRef<RevenueScoutLpDraft | null>(null);
  const revenueScoutProductsApplied = useRef(false);
  const campaignProductsApplied = useRef("");

  function applyCampaignBriefing(briefing: SiteCampaignBriefing | null) {
    setCampaignBriefing(briefing);
    campaignProductsApplied.current = "";
    if (!briefing) return;
    const context = briefing.marketingContext;
    setMode("campaign");
    setChoosing(false);
    setEditor(false);
    setAudience(context.audienceNiche || context.audienceSegment || "");
    setOffer(context.productNames.join(", "));
    setObjectiveId(inferCampaignSiteObjective(context.campaignGoal));
    sessionStorage.setItem("vendorai_site_creation_mode", "campaign");
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("from") !== "revenue-scout") return;
    try {
      const raw = sessionStorage.getItem("vendorai_lp_revenue_scout_draft_v1");
      if (!raw) return;
      const draft = JSON.parse(raw) as RevenueScoutLpDraft;
      if (!draft.campaignId) return;
      revenueScoutHandoff.current = draft;
      setCampaignBriefing(null);
      setMode("campaign");
      setChoosing(false);
      setEditor(false);
      setAudience(draft.audience ?? "");
      setOffer(draft.offer ?? "");
      setNotes([
        draft.objective ? `Objetivo da campanha: ${draft.objective}` : "",
        draft.headline ? `Headline sugerida: ${draft.headline}` : "",
        draft.subheadline ? `Subheadline sugerida: ${draft.subheadline}` : "",
        draft.notes ?? "",
        `Campanha de origem: ${draft.campaignId}`,
      ].filter(Boolean).join("\n"));
      setObjectiveId("leads");
      sessionStorage.setItem("vendorai_site_creation_mode", "campaign");
      sessionStorage.removeItem("vendorai_lp_revenue_scout_draft_v1");
      toast({ title: "LP preparada pelo Revenue Scout", description: "Público, oferta e objetivo já foram carregados com o contexto deste tenant." });
    } catch {
      sessionStorage.removeItem("vendorai_lp_revenue_scout_draft_v1");
    }
  }, []);

  useEffect(() => {
    if (!tenantId || editor) return;
    let cancelled = false;
    void resilientFetch(`/api/tenants/${tenantId}/site-generator/business-context`, { headers: headers(token), cache: "no-store" }, 2)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) setBp(body.profile ?? null);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [tenantId, token, editor]);
  const rawProfile = (bp ?? {}) as any; const profileName = bp?.nomeFantasia ?? bp?.razaoSocial ?? rawProfile.nome ?? tenantOverride?.name ?? ""; const profileSector = bp?.vertical ?? rawProfile.segmento ?? rawProfile.setor ?? tenantOverride?.vertical ?? ""; const profileDesc = rawProfile.descricaoNegocio ?? rawProfile.descricao ?? rawProfile.sobreEmpresa ?? bp?.diferenciais ?? bp?.publicoAlvo ?? ""; const phone = bp?.telefone ?? rawProfile.whatsapp ?? rawProfile.displayPhoneNumber ?? ""; const logo = bp?.logoUrl ?? tenantOverride?.logoUrl ?? ""; const logoForSite = logo ? (logo.startsWith("http://") || logo.startsWith("https://") ? logo : logo.startsWith("/objects/") ? `${window.location.origin}/api/storage${logo}` : logo.startsWith("/") ? `${window.location.origin}${logo}` : logo) : ""; const modeDef = MODES.find((m) => m.id === mode)!; const objective = OBJECTIVES.find((o) => o.id === objectiveId)!;
  useEffect(() => { if (!bp || init.current) return; init.current = true; setName(profileName); setSector(profileSector); setDesc(profileDesc); setAudience((current) => current.trim() ? current : (bp?.publicoAlvo ?? "")); if (bp?.site) setSiteUrl((current) => { if (current.trim()) return current; const raw = String(bp.site).trim(); return raw && !/^https?:\/\//i.test(raw) ? `https://${raw}` : raw; }); }, [bp, profileName, profileSector, profileDesc]);
  useEffect(() => { if (!tenantId || editor) return; fetch(`/api/tenants/${tenantId}/produtos-catalogo`, { headers: headers(token), cache: "no-store" }).then((r) => r.ok ? r.json() : []).then((rows) => setCatalog(Array.isArray(rows) ? rows.filter((p: CatalogItem) => p.ativo !== false) : [])).catch(() => setCatalog([])); }, [tenantId, token, editor]);
  useEffect(() => {
    if (!catalog.length || revenueScoutProductsApplied.current || !revenueScoutHandoff.current) return;
    const requested = revenueScoutHandoff.current.productIds ?? [];
    const valid = requested.filter((id) => catalog.some((product) => product.id === id));
    if (valid.length > 0) setSelected(valid);
    revenueScoutProductsApplied.current = true;
  }, [catalog]);
  useEffect(() => {
    if (!catalog.length || !campaignBriefing) return;
    const requested = campaignBriefing.marketingContext.productIds.filter((id) => !id.startsWith("custom:"));
    const key = `${campaignBriefing.campaignId}:${requested.join(",")}`;
    if (campaignProductsApplied.current === key) return;
    const valid = requested.filter((id) => catalog.some((product) => product.id === id));
    setSelected(valid);
    campaignProductsApplied.current = key;
  }, [catalog, campaignBriefing]);
  useEffect(() => { if (!catalog.length) return; const key = `${mode}:${catalog.length}`; if (defaults.current === key) return; defaults.current = key; if (mode === "catalog") { setSelected(catalog.slice(0, 30).map((p) => p.id)); setOffer((v) => v || "Catálogo de produtos e serviços"); } else if (mode === "new-site") setSelected(catalog.slice(0, 6).map((p) => p.id)); else if (mode === "product" || mode === "ecommerce") setSelected([]); }, [catalog, mode]);
  useEffect(() => {
    if (campaignBriefing && mode === "campaign") return;
    setObjectiveId(mode === "ecommerce" ? "sales" : mode === "product" || mode === "catalog" ? "quote" : "leads");
  }, [mode, campaignBriefing?.campaignId]);
  const selectedProducts = useMemo(() => catalog.filter((p) => selected.includes(p.id)), [catalog, selected]);
  const groups = useMemo(() => { const m = new Map<string, CatalogItem[]>(); catalog.forEach((p) => { const k = p.categoria?.trim() || p.marca?.trim() || "Produtos"; m.set(k, [...(m.get(k) ?? []), p]); }); return [...m.entries()]; }, [catalog]);
  const audienceSuggestions = useMemo(() => {
    const profileValues = [
      rawProfile.publicoAlvo,
      rawProfile.publicoPrioritario,
      rawProfile.clienteIdeal,
      rawProfile.icp,
      rawProfile.personas,
      rawProfile.perfisClientes,
      rawProfile.segmentosClientes,
    ].flatMap(normalizeSuggestion).map((value) => ({ value, source: "Perfil" as const }));
    const aiValues = aiBusiness?.audiences.map((item) => ({ value: item.value, source: "IA" as const })) ?? [];
    const marketValues = market?.keywords.slice(0, 3).map((keyword) => ({ value: `Pessoas buscando ${keyword.termo}`, source: "Mercado" as const })) ?? [];
    return uniqueSuggestions([...profileValues, ...aiValues, ...marketValues], 8);
  }, [rawProfile, market, aiBusiness]);
  const offerSuggestions = useMemo(() => {
    const profileValues = [
      rawProfile.ofertaPrincipal,
      rawProfile.produtosServicos,
      rawProfile.servicos,
      rawProfile.solucoes,
      rawProfile.linhasProduto,
    ].flatMap(normalizeSuggestion).map((value) => ({ value, source: "Perfil" as const }));
    const productValues = catalog.slice(0, 8).map((product) => ({ value: product.nome, source: "Catálogo" as const, productId: product.id }));
    const aiValues = aiBusiness?.offers.map((item) => ({ value: item.value, source: "IA" as const, productId: item.productId })) ?? [];
    const categoryValues = groups.slice(0, 5).map(([category]) => ({ value: category, source: "Catálogo" as const }));
    return uniqueSuggestions([...profileValues, ...productValues, ...aiValues, ...categoryValues], 10);
  }, [rawProfile, catalog, groups, aiBusiness]);
  const objectiveSuggestions = useMemo(() => {
    const preferred = mode === "ecommerce"
      ? ["sales", "whatsapp", "leads", "quote"]
      : mode === "product" || mode === "catalog"
        ? ["quote", "sales", "whatsapp", "leads"]
        : mode === "landing" || mode === "campaign"
          ? ["leads", "whatsapp", "quote", "schedule"]
          : ["brand", "leads", "whatsapp", "quote"];
    return preferred.map((id) => OBJECTIVES.find((item) => item.id === id)).filter((item): item is (typeof OBJECTIVES)[number] => Boolean(item));
  }, [mode]);
  const opportunities = useMemo(() => {
    const audiences = audienceSuggestions.length ? audienceSuggestions.slice(0, 3) : audience.trim() ? [{ value: audience.trim(), source: "Perfil" as const }] : [];
    const offers = offerSuggestions.length ? offerSuggestions.slice(0, 4) : offer.trim() ? [{ value: offer.trim(), source: "Perfil" as const }] : [];
    const result: Array<{ audience: BriefingSuggestion; offer: BriefingSuggestion; objectiveId: (typeof OBJECTIVES)[number]["id"] }> = [];
    for (let index = 0; index < Math.min(4, Math.max(audiences.length, offers.length)); index += 1) {
      const audienceItem = audiences[index % audiences.length]; const offerItem = offers[index % offers.length];
      if (!audienceItem || !offerItem) continue;
      result.push({ audience: audienceItem, offer: offerItem, objectiveId: objectiveSuggestions[index % objectiveSuggestions.length]?.id ?? objectiveId });
    }
    return result;
  }, [audienceSuggestions, offerSuggestions, objectiveSuggestions, audience, offer, objectiveId]);
  const contextSourceCount = [Boolean(bp), catalog.length > 0, Boolean(market)].filter(Boolean).length;
  const completeness = Math.round(([name || profileName, sector || profileSector, desc || profileDesc, audience, offer || selectedProducts.length || mode === "ecommerce", objectiveId, logo, phone, market].filter(Boolean).length / 9) * 100);

  async function loadAiBusinessSuggestions(force = false) {
    if (!tenantId || editor || aiBusinessBusy) return;
    const contextKey = `${tenantId}:${mode}:${profileName}:${profileSector}:${profileDesc}:${catalog.length}`;
    if (!force && (aiBusinessKey.current === contextKey || Date.now() < aiBusinessFailedUntil.current)) return;
    aiBusinessKey.current = contextKey;
    setAiBusinessBusy(true);
    try {
      const response = await resilientFetch(`/api/tenants/${tenantId}/site-generator/briefing-suggestions`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({ creationMode: mode }),
      }, 1);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Não foi possível analisar o perfil (${response.status})`);
      aiBusinessFailedUntil.current = 0;
      setAiBusiness({ audiences: Array.isArray(body.audiences) ? body.audiences : [], offers: Array.isArray(body.offers) ? body.offers : [] });
    } catch (error) {
      aiBusinessFailedUntil.current = Date.now() + 60_000;
      if (force) toast({ title: "Sugestões de IA temporariamente indisponíveis", description: "As sugestões do perfil e do catálogo continuam disponíveis e não bloqueiam a geração." });
    } finally {
      setAiBusinessBusy(false);
    }
  }

  useEffect(() => {
    if (editor || !tenantId || (!profileName && !profileSector && !catalog.length)) return;
    const timer = window.setTimeout(() => { void loadAiBusinessSuggestions(false); }, 900);
    return () => window.clearTimeout(timer);
  }, [tenantId, mode, profileName, profileSector, profileDesc, catalog.length, editor]);

  function applyBusinessDefaults() {
    let changed = false;
    if (!audience.trim() && audienceSuggestions[0]) { setAudience(audienceSuggestions[0].value); changed = true; }
    if (!offer.trim() && offerSuggestions[0]) { setOffer(offerSuggestions[0].value); changed = true; if (offerSuggestions[0].productId) setSelected([offerSuggestions[0].productId]); }
    if (!name.trim() && profileName) { setName(profileName); changed = true; }
    if (!sector.trim() && profileSector) { setSector(profileSector); changed = true; }
    if (!desc.trim() && profileDesc) { setDesc(profileDesc); changed = true; }
    toast({ title: changed ? "Briefing preenchido com o perfil" : "Briefing já está preenchido", description: changed ? "O VendorAI completou somente campos vazios com dados deste negócio." : "Nenhum campo preenchido pelo usuário foi alterado." });
  }

  function chooseAudience(item: BriefingSuggestion) { setAudience(item.value); setEditContext(false); }
  function chooseOffer(item: BriefingSuggestion) { setOffer(item.value); if (item.productId) setSelected([item.productId]); setEditContext(false); }
  function useOpportunity(item: { audience: BriefingSuggestion; offer: BriefingSuggestion; objectiveId: (typeof OBJECTIVES)[number]["id"] }) { setAudience(item.audience.value); setOffer(item.offer.value); setObjectiveId(item.objectiveId); if (item.offer.productId) setSelected([item.offer.productId]); setEditContext(false); }

  useEffect(() => {
    if (!tenantId) return;
    const jobId = sessionStorage.getItem(pendingJobKey(tenantId));
    if (!jobId) return;
    let cancelled = false;
    setGenerating(true);
    setError(null);
    void pollJob(jobId, 30 * 1000)
      .then(() => {
        if (cancelled) return;
        sessionStorage.removeItem(pendingJobKey(tenantId));
        setEditor(true);
        toast({ title: "Site recuperado", description: "A geração terminou no servidor. Abrindo o preview." });
      })
      .catch((e) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "Não foi possível recuperar a geração";
        if (!message.includes("continua em processamento")) setError(message);
      })
      .finally(() => { if (!cancelled) setGenerating(false); });
    return () => { cancelled = true; };
  }, [tenantId, token]);

  function choose(next: Mode) { setMode(next); setChoosing(false); setEditor(false); setError(null); if (next !== "campaign") setCampaignBriefing(null); sessionStorage.setItem("vendorai_site_creation_mode", next); }
  function toggleProduct(id: string) { if (mode === "product") { setSelected((v) => v.includes(id) ? [] : [id]); const p = catalog.find((x) => x.id === id); if (p) setOffer(p.nome); } else setSelected((v) => v.includes(id) ? v.filter((x) => x !== id) : [...v, id]); }
  function toggleGroup(items: CatalogItem[]) { const ids = items.map((x) => x.id); const all = ids.every((id) => selected.includes(id)); setSelected((v) => all ? v.filter((id) => !ids.includes(id)) : [...new Set([...v, ...ids])]); }
  async function openSites(): Promise<void> {
    try {
      const r = await resilientFetch(`/api/tenants/${tenantId}/site-generator?includeHtml=0`, { headers: headers(token), cache: "no-store" });
      if (!r.ok) throw new Error(r.status === 429 ? "Servidor temporariamente ocupado. Aguarde alguns segundos." : `Erro ${r.status}`);
      const rows = await r.json();
      if (!Array.isArray(rows) || !rows.length) { toast({ title: "Nenhum site criado ainda" }); return; }
      setEditor(true);
    } catch (e) {
      toast({ title: "Não foi possível abrir seus sites", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  }

  async function previewLatest(): Promise<void> {
    try {
      const listRes = await resilientFetch(`/api/tenants/${tenantId}/site-generator?includeHtml=0`, { headers: headers(token), cache: "no-store" });
      if (!listRes.ok) throw new Error(listRes.status === 429 ? "Servidor temporariamente ocupado. Aguarde alguns segundos." : `Erro ${listRes.status}`);
      const rows = await listRes.json();
      if (!Array.isArray(rows) || !rows.length) { toast({ title: "Nenhum site criado ainda" }); return; }
      const latest = [...rows].sort((a: any, b: any) => new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime())[0];
      const siteRes = await resilientFetch(`/api/tenants/${tenantId}/site-generator/${latest.id}/preview?format=html`, { headers: { ...headers(token), Accept: "text/html" }, cache: "no-store" });
      const siteHtml = await siteRes.text();
      if (!siteRes.ok || !siteHtml.trim()) throw new Error(`Não foi possível carregar o site (${siteRes.status})`);
      const blob = new Blob([siteHtml], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast({ title: "Não foi possível visualizar o site", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  }
  // ui-integrity: error-propagates-to-caller — todos os fluxos de upload exibem a falha no caller.
  async function upload(file: File) { const x = await uploadHook.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type || "application/octet-stream" } }) as { uploadURL: string; objectPath: string }; const r = await fetch(x.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } }); if (!r.ok) throw new Error(`Falha ao enviar ${file.name}`); return { url: `${window.location.origin}/api/storage${x.objectPath}`, objectPath: x.objectPath }; }
  async function registerMotionAsset(file: File, kind: AssetKind, objectPath: string, url: string) {
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/assets`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({
          type: kind,
          role: "source",
          source: "upload",
          storageUrl: objectPath,
          originalFilename: file.name,
          mimeType: file.type || null,
          fileSize: file.size,
          metadata: { uploadedFrom: "site_generator_motion_ai", siteGenerator: true },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.asset?.id) return;
      setMotionAssets((current) => current.some((item) => item.assetId === body.asset.id) ? current : [...current, { assetId: String(body.asset.id), url, kind, name: file.name }]);
      setMotionSourceUrl((current) => current || url);
    } catch {
      // O upload do site continua válido mesmo se o registro na Biblioteca falhar.
    }
  }
  async function uploadMany(files: File[], kind: AssetKind) { if (!files.length) return; setUploads((v) => v + files.length); await Promise.all(files.map(async (f) => { try { const uploaded = await upload(f); kind === "image" ? setImages((v) => [...v, uploaded.url]) : setVideos((v) => [...v, uploaded.url]); void registerMotionAsset(f, kind, uploaded.objectPath, uploaded.url); } catch (e) { toast({ title: "Erro no upload", description: e instanceof Error ? e.message : undefined, variant: "destructive" }); } finally { setUploads((v) => Math.max(0, v - 1)); } })); }
  async function uploadTestimonial(id: string, file: File) { setUploads((v) => v + 1); try { const uploaded = await upload(file); const mediaType: AssetKind = file.type.startsWith("video/") ? "video" : "image"; setTestimonials((v) => v.map((t) => t.id === id ? { ...t, mediaUrl: uploaded.url, mediaType } : t)); } catch (error) { toast({ title: "Não foi possível enviar a mídia do depoimento", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" }); } finally { setUploads((v) => Math.max(0, v - 1)); } }
  async function uploadExtra(id: string, file: File) { setUploads((v) => v + 1); try { const uploaded = await upload(file); const mediaType: AssetKind = file.type.startsWith("video/") ? "video" : "image"; setExtras((v) => v.map((x) => x.id === id ? { ...x, mediaUrl: uploaded.url, mediaType } : x)); } catch (error) { toast({ title: "Não foi possível enviar a mídia do conteúdo", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" }); } finally { setUploads((v) => Math.max(0, v - 1)); } }
  const selectedMotionAsset = motionAssets.find((asset) => asset.url === motionSourceUrl) ?? null;
  const motionProgress = (() => {
    const progress = Number(motionJob?.progress ?? 0);
    const total = Number(motionJob?.total ?? 100);
    if (!Number.isFinite(progress)) return 0;
    return total > 0 && total !== 100 ? Math.max(0, Math.min(100, Math.round((progress / total) * 100))) : Math.max(0, Math.min(100, Math.round(progress)));
  })();

  async function animateMedia() {
    if (!selectedMotionAsset || motionBusy) return;
    setMotionBusy(true);
    setMotionJob(null);
    setMotionProjectId("");
    setMotionJobId("");
    try {
      const preserveText = motionPreserve
        ? "Preservação máxima obrigatória: mantenha geometria, proporções, identidade visual, materiais, produto, fachada, móveis, pessoas e elementos originais. Não invente, remova nem redesenhe partes da imagem ou vídeo."
        : "";
      const effectsByPreset: Record<MotionPreset, Record<string, unknown>> = {
        auto: { preset: "auto", intensity: "soft", transition: "smooth", motion: "ken_burns", color: "clean", grain: false, vignette: false, sharpen: true, beatSync: false, bpm: 110, sfx: "none" },
        clean: { preset: "clean", intensity: "soft", transition: "fade", motion: "drift", color: "clean", grain: false, vignette: false, sharpen: true, beatSync: false, bpm: 110, sfx: "none" },
        cinematic: { preset: "cinematic", intensity: "soft", transition: "blur", motion: "ken_burns", color: "cinematic", grain: true, vignette: true, sharpen: false, beatSync: false, bpm: 100, sfx: "none" },
        premium: { preset: "premium", intensity: "soft", transition: "smooth", motion: "parallax", color: "product", grain: false, vignette: true, sharpen: true, beatSync: false, bpm: 105, sfx: "none" },
        dynamic: { preset: "dynamic", intensity: "medium", transition: "zoom", motion: "zoom_in", color: "vibrant", grain: false, vignette: false, sharpen: true, beatSync: false, bpm: 120, sfx: "none" },
        minimal: { preset: "minimal", intensity: "soft", transition: "fade", motion: "drift", color: "minimal", grain: false, vignette: false, sharpen: false, beatSync: false, bpm: 100, sfx: "none" },
      };
      const prompt = [
        selectedMotionAsset.kind === "image" ? "Anime esta foto para uso em site com movimento de câmera natural e sofisticado." : "Otimize este vídeo para uso em site, com movimento e acabamento profissional sem descaracterizar o material original.",
        preserveText,
        motionLoop ? "Crie uma saída visualmente adequada para loop suave em hero ou seção de site." : "",
        motionPrompt.trim(),
      ].filter(Boolean).join("\n");
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/jobs`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({
          operation: "video_generate",
          title: `Motion AI — ${selectedMotionAsset.name.slice(0, 60)}`,
          context: {
            prompt,
            style: motionPreset === "cinematic" ? "cinematic, photorealistic, premium commercial production" : "photorealistic, clean premium commercial production",
            aspectRatio: motionAspectRatio,
            duration: Number(motionDuration),
            effects: effectsByPreset[motionPreset],
            generationMode: "media_only",
            mediaInputs: [{ assetId: selectedMotionAsset.assetId, type: selectedMotionAsset.kind, role: "main_scene", importance: "required", order: 0, note: preserveText || undefined }],
          },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.projectId || !body.jobId) throw new Error(body.error ?? "Não foi possível iniciar a animação");
      setMotionProjectId(String(body.projectId));
      setMotionJobId(String(body.jobId));
      toast({ title: "Motion AI iniciado", description: "A mídia será animada pelo Media Engine e adicionada automaticamente aos vídeos do site." });
    } catch (e) {
      toast({ title: "Não foi possível animar a mídia", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
      setMotionBusy(false);
    }
  }

  useEffect(() => {
    if (!motionProjectId || !motionJobId) return;
    let cancelled = false;
    const check = async () => {
      try {
        const response = await fetch(`/api/tenants/${tenantId}/media/projects/${motionProjectId}`, { headers: headers(token), cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "Falha ao consultar Motion AI");
        const job = (Array.isArray(body.jobs) ? body.jobs : []).find((item: MotionJob) => item.id === motionJobId && item.operation === "video_generate") as MotionJob | undefined;
        if (!job || cancelled) return;
        setMotionJob(job);
        if (job.status === "done" && job.output?.videoUrl) {
          setVideos((current) => current.includes(job.output!.videoUrl!) ? current : [...current, job.output!.videoUrl!]);
          setMotionBusy(false);
          toast({ title: "Animação pronta", description: "O vídeo gerado já foi adicionado aos ativos deste site." });
          return;
        }
        if (job.status === "error") {
          setMotionBusy(false);
          toast({ title: "Falha na animação", description: job.error ?? "O Media Engine não conseguiu concluir esta mídia.", variant: "destructive" });
          return;
        }
        window.setTimeout(() => { if (!cancelled) void check(); }, 4_000);
      } catch (e) {
        if (!cancelled) {
          setMotionBusy(false);
          toast({ title: "Falha ao acompanhar animação", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
        }
      }
    };
    void check();
    return () => { cancelled = true; };
  }, [motionProjectId, motionJobId, tenantId, token]);

  async function intelligence() { setMarketBusy(true); try { const [cr, kr] = await Promise.all([fetch(`/api/tenants/${tenantId}/content-autopilot/config`, { headers: headers(token), cache: "no-store" }), fetch(`/api/tenants/${tenantId}/content-autopilot/keywords`, { headers: headers(token), cache: "no-store" })]); const c = cr.ok ? await cr.json() : {}; const k = kr.ok ? await kr.json() : {}; const keywords = Array.isArray(k.keywords) ? (k.keywords as Keyword[]).sort((a, b) => Number(b.volumeBusca ?? 0) - Number(a.volumeBusca ?? 0)).slice(0, 12) : []; const bt = c?.config?.brandTone; const data = { tone: bt?.tom as string | undefined, keywords, competitors: competitorHosts(keywords) }; setMarket(data); if (!audience && bt?.publicoAlvo) setAudience(bt.publicoAlvo); if (data.tone?.toLowerCase().includes("premium")) setTone("premium"); if (!bt && !keywords.length) toast({ title: "Ainda não há pesquisa no Content Autopilot", description: "Quando houver keywords e concorrentes pesquisados, eles entram aqui automaticamente." }); else toast({ title: "Contexto enriquecido", description: `${keywords.length} sinais de busca e ${data.competitors.length} referências públicas carregados.` }); } finally { setMarketBusy(false); } }
  async function analyzeSite() { if (!siteUrl.trim()) throw new Error("Informe a URL do site atual"); setAnalyzing(true); try { const save = await fetch(`/api/tenants/${tenantId}/content-autopilot/config`, { method: "PUT", headers: headers(token), body: JSON.stringify({ siteUrl: siteUrl.trim() }) }); if (!save.ok) throw new Error("Não foi possível conectar a URL"); const [tr, sr] = await Promise.all([fetch(`/api/tenants/${tenantId}/content-autopilot/analyze-site`, { method: "POST", headers: headers(token) }), fetch(`/api/tenants/${tenantId}/site-generator/remodel-analyze`, { method: "POST", headers: headers(token), body: JSON.stringify({ url: siteUrl.trim() }) })]); const tb = await tr.json().catch(() => ({})); const sb = await sr.json().catch(() => ({})); if (!tr.ok) throw new Error(tb.error ?? "Falha ao analisar tom"); if (!sr.ok) throw new Error(sb.error ?? "Falha ao analisar estrutura"); setRemodelTone(tb.brandTone ?? null); setStructure(sb); if (!audience && tb.brandTone?.publicoAlvo) setAudience(tb.brandTone.publicoAlvo); toast({ title: "Site analisado", description: `${sb.sections?.length ?? 0} seções mapeadas.` }); return sb as RemodelStructure; } finally { setAnalyzing(false); } }

  async function pollJob(jobId: string, timeoutMs = 2 * 60 * 1000) {
    const end = Date.now() + timeoutMs;
    let consecutiveFailures = 0;
    const check = async () => {
      const p = await fetch(`/api/tenants/${tenantId}/site-generator/jobs/${jobId}?t=${Date.now()}&includeHtml=0`, { headers: headers(token), cache: "no-store" });
      if (!p.ok) {
        if ([429, 502, 503, 504].includes(p.status) && consecutiveFailures < 5) {
          consecutiveFailures++;
          return null;
        }
        const b = await p.json().catch(() => ({}));
        throw new Error(b.error ?? "Falha ao acompanhar geração");
      }
      consecutiveFailures = 0;
      return p.json();
    };
    while (Date.now() < end) {
      await new Promise((r) => window.setTimeout(r, 3000));
      const b = await check();
      if (!b) continue;
      if (b.status === "done") return b.result;
      if (b.status === "error") throw new Error(b.error ?? "Erro na geração");
    }
    const final = await check();
    if (final?.status === "done") return final.result;
    if (final?.status === "error") throw new Error(final.error ?? "Erro na geração");
    throw new Error("A geração continua em processamento no servidor. Você pode abrir Meus sites depois; o resultado não será perdido.");
  }

  async function runJob(config: Record<string, unknown>) {
    const start = await fetch(`/api/tenants/${tenantId}/site-generator/generate`, { method: "POST", headers: headers(token), cache: "no-store", body: JSON.stringify(config) });
    const sb = await start.json().catch(() => ({}));
    if (!start.ok || !sb.jobId) throw new Error(sb.error ?? "Não foi possível iniciar a geração");
    sessionStorage.setItem(pendingJobKey(tenantId), sb.jobId);
    try {
      const result = await pollJob(sb.jobId);
      sessionStorage.removeItem(pendingJobKey(tenantId));
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erro na geração";
      if (!message.includes("continua em processamento")) sessionStorage.removeItem(pendingJobKey(tenantId));
      throw e;
    }
  }

  async function generate(): Promise<void> {
    const resolvedName = name.trim() || profileName; const resolvedSector = sector.trim() || profileSector; const resolvedDesc = desc.trim() || profileDesc;
    if (!resolvedName) { setEditContext(true); toast({ title: "Informe o nome do negócio", variant: "destructive" }); return; }
    if (!audience.trim()) { setEditContext(true); toast({ title: "Confirme o público do site", variant: "destructive" }); return; }
    if (mode === "product" && selected.length !== 1) { setAssetsOpen(true); toast({ title: "Selecione um produto do catálogo", variant: "destructive" }); return; }
    setGenerating(true); setError(null);
    try {
      let st = structure; if (mode === "remodel" && !st) st = await analyzeSite();
      const validTestimonials = testimonials.filter((t) => t.name.trim() && t.text.trim());
      const testimony = validTestimonials.length ? `DEPOIMENTOS REAIS:\n${validTestimonials.map((t, i) => `${i + 1}. ${t.name}${t.company ? ` — ${t.company}` : ""}: “${t.text}”${t.mediaUrl ? ` | mídia: ${t.mediaUrl}` : ""}`).join("\n")}` : "";
      const marketText = market ? [`Tom de marca analisado: ${market.tone ?? ""}`, `Sinais reais de busca: ${market.keywords.slice(0, 8).map((k) => k.termo).join(", ")}`, `Referências públicas de SERP, apenas para inteligência e nunca para copiar: ${market.competitors.join(", ")}`].filter((x) => !x.endsWith(": ")).join("\n") : "";
      const campaignContextText = buildCampaignSiteContextText(campaignBriefing);
      const remodelText = mode === "remodel" && st ? `REMODELAR ${siteUrl.trim()} | nível ${remodelLevel} | preservar: ${preserve}\nNavegação atual: ${st.nav}\nSeções atuais: ${st.sections.map((s) => s.title).join(" | ")}\nConteúdo atual: ${st.bodyExcerpt.slice(0, 3500)}\nTom atual: ${JSON.stringify(remodelTone).slice(0, 1500)}` : "";
      const productData = selectedProducts.map((p) => ({ name: p.nome, price: price(p.precoBase), description: p.descricao || undefined, imageUrl: p.imagens?.[0] || p.imagemUrl || undefined, marca: p.marca || undefined }));
      const validExtras = extras.filter((x) => x.title.trim() || x.text.trim()); const extraText = validExtras.length ? `CONTEÚDOS ADICIONAIS REAIS:\n${validExtras.map((x, i) => `${i + 1}. ${x.title || "Conteúdo"}: ${x.text}${x.mediaUrl ? ` | mídia: ${x.mediaUrl}` : ""}`).join("\n")}` : "";
      const testImages = validTestimonials.filter((t) => t.mediaType === "image").map((t) => t.mediaUrl); const testVideos = validTestimonials.filter((t) => t.mediaType === "video").map((t) => t.mediaUrl); const extraImages = validExtras.filter((x) => x.mediaType === "image").map((x) => x.mediaUrl); const extraVideos = validExtras.filter((x) => x.mediaType === "video").map((x) => x.mediaUrl);
      await runJob({ type: modeDef.type, creationMode: mode, name: resolvedName, sector: resolvedSector, desc: [resolvedDesc, `Público prioritário: ${audience}.`, `Oferta principal: ${offer || selectedProducts.map((p) => p.nome).join(", ") || "produtos e serviços da empresa"}.`, `Objetivo: ${objective.label}.`, campaignContextText, marketText, remodelText].filter(Boolean).join("\n\n"), pain: `O público ${audience} precisa compreender com clareza como ${offer || "a solução"} atende sua necessidade e avançar para ${objective.label.toLowerCase()}.`, tone, cta: objective.cta, color: "#6366F1", logoUrl: logoForSite, products: productData, whatsapp: phone, images: [...images, ...testImages, ...extraImages], videos: [...videos, ...testVideos, ...extraVideos], servicos: [selectedProducts.length ? `Produtos reais selecionados: ${selectedProducts.map((p) => p.nome).join(", ")}` : "", campaignContextText, testimony, extraText, notes ? `Orientação adicional do usuário:\n${notes}` : ""].filter(Boolean).join("\n\n"), nicheName: audience, productIds: selected, productNames: selectedProducts.map((p) => p.nome), produtoId: mode === "product" ? selected[0] : undefined, remodelContext: mode === "remodel" ? { siteUrl, remodelLevel, preserve, structure: st, brandTone: remodelTone } : undefined });
      setEditor(true); toast({ title: "Site gerado", description: "Abrindo o preview para revisão." });
    } catch (e) { const m = e instanceof Error ? e.message : "Não foi possível gerar"; if (m.includes("continua em processamento")) setError(null); else setError(m); toast({ title: m.includes("continua em processamento") ? "Geração continua no servidor" : "Erro na geração", description: m.includes("continua em processamento") ? "O processamento continua no servidor, mas o botão foi liberado. O resultado não será perdido." : m, variant: m.includes("continua em processamento") ? "default" : "destructive" }); } finally { setGenerating(false); }
  }

  if (editor) return <div className="space-y-5"><CoreEditor tenantId={tenantId} token={token} onNew={() => { setEditor(false); setChoosing(true); setError(null); }} /><Governance tenantId={tenantId} token={token} /></div>;
  return <div className="space-y-5">
    {choosing ? <Card><CardHeader><div className="flex items-center justify-between gap-2"><div><CardTitle className="flex items-center gap-2 text-base"><Wand2 className="h-4 w-4 text-primary" />O que você quer criar?</CardTitle><p className="mt-1 text-sm text-muted-foreground">Esta é a única escolha de tipo. Não será perguntada novamente abaixo.</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void previewLatest()}><Globe className="mr-2 h-4 w-4" />Visualizar site</Button><Button size="sm" variant="outline" onClick={() => void openSites()}>Meus sites</Button></div></div></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{MODES.map((m) => { const I = m.icon; return <button key={m.id} type="button" onClick={() => choose(m.id)} className={`rounded-xl border p-4 text-left transition-all ${mode === m.id ? "border-primary bg-primary/5" : "hover:border-primary/40"}`}><I className="h-5 w-5 text-primary" /><p className="mt-3 text-sm font-semibold">{m.title}</p><p className="mt-1 text-xs text-muted-foreground">{m.desc}</p></button>; })}</div></CardContent></Card> : <div className="flex items-center justify-between gap-2 rounded-xl border bg-muted/20 px-4 py-3"><div className="flex items-center gap-2"><Badge>{modeDef.short}</Badge><span className="text-xs text-muted-foreground">Modo definido. Sem segunda seleção de tipo.</span></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void previewLatest()}><Globe className="mr-2 h-4 w-4" />Visualizar site</Button><Button size="sm" variant="ghost" onClick={() => setChoosing(true)}>Trocar</Button></div></div>}
    {!choosing && <><div className="overflow-x-auto"><div className="flex min-w-max items-center gap-2 rounded-xl border bg-muted/20 p-3">{STEPS.map((s, i) => <div key={s} className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${i === 0 ? "bg-primary text-white" : "border bg-background"}`}>{i + 1}</span><span className={`text-xs ${i === 0 ? "font-semibold" : "text-muted-foreground"}`}>{s}</span>{i < STEPS.length - 1 && <span className="text-muted-foreground/40">→</span>}</div>)}</div></div>
      <Card className="border-primary/20"><CardHeader><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" />Briefing inteligente</CardTitle><p className="mt-1 text-sm text-muted-foreground">O VendorAI usa primeiro o que já conhece e só pede confirmação do que faltar.</p></div><div className="min-w-52 rounded-lg border p-3"><div className="mb-2 flex justify-between text-xs"><span>Contexto disponível</span><strong className="text-primary">{completeness}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${completeness}%` }} /></div></div></div></CardHeader><CardContent className="space-y-4">
        <CampaignSiteBriefingPicker tenantId={tenantId} token={token} value={campaignBriefing} onApply={applyCampaignBriefing} disabled={generating} />
        <div className="grid gap-3 lg:grid-cols-2"><div className="rounded-xl border bg-muted/20 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">O VendorAI já sabe</p><div className="mt-2 flex items-center gap-3">{logo ? <img src={logoForSite || logo} alt="Logo" className="h-10 w-10 rounded-lg border bg-white object-contain p-1" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <Building2 className="h-8 w-8 text-muted-foreground" />}<div><p className="text-sm font-semibold">{name || profileName || "Nome não informado"}</p><p className="text-xs text-muted-foreground">{sector || profileSector || "Segmento não informado"}</p></div></div><div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline">Catálogo: {catalog.length}</Badge><Badge variant="outline">Logo: {logo ? "✓" : "—"}</Badge><Badge variant="outline">WhatsApp: {phone ? "✓" : "—"}</Badge></div></div>
          <div className="rounded-xl border p-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Público + Oferta + Objetivo</p><Button size="sm" variant="ghost" onClick={() => setEditContext((v) => !v)}>{editContext ? "Concluir" : "Editar"}</Button></div>{!editContext ? <div className="mt-3 space-y-2 text-sm"><div><span className="text-xs text-muted-foreground">Público</span><p className="font-medium">{audience || "Confirmar público"}</p></div><div><span className="text-xs text-muted-foreground">Oferta</span><p className="font-medium">{offer || selectedProducts.map((p) => p.nome).join(", ") || "Confirmar oferta"}</p></div><div><span className="text-xs text-muted-foreground">Objetivo</span><p className="font-medium">{objective.label}</p></div></div> : <div className="mt-3 space-y-2"><Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Público prioritário" /><Input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="Produto, serviço ou oferta" /><Select value={objectiveId} onValueChange={(v) => setObjectiveId(v as any)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{OBJECTIVES.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent></Select>{(!profileName || !profileSector) && <div className="grid grid-cols-2 gap-2"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do negócio" /><Input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Segmento" /></div>}{!profileDesc && <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Descrição do negócio" />}</div>}</div></div>

        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm font-semibold">Sugestões do seu negócio</p><p className="text-xs text-muted-foreground">Usa apenas o perfil, catálogo e inteligência do tenant atual. Nada é compartilhado entre empresas.</p></div>
            <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{contextSourceCount}/3 fontes</Badge><Button size="sm" variant="outline" onClick={() => void loadAiBusinessSuggestions(true)} disabled={aiBusinessBusy}>{aiBusinessBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Atualizar sugestões com IA</Button><Button size="sm" variant="outline" onClick={applyBusinessDefaults}>Preencher campos vazios</Button></div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Públicos recomendados</p><div className="flex flex-wrap gap-2">{audienceSuggestions.length ? audienceSuggestions.map((item) => <button key={`${item.source}-${item.value}`} type="button" onClick={() => chooseAudience(item)} className={`rounded-full border px-3 py-1.5 text-left text-xs transition-colors ${audience === item.value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/50"}`} title={`Fonte: ${item.source}`}>{item.value}<span className="ml-1 opacity-60">· {item.source}</span></button>) : <span className="text-xs text-muted-foreground">Informe o público no Perfil do Negócio para o VendorAI sugerir opções reais.</span>}</div></div>
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ofertas recomendadas</p><div className="flex flex-wrap gap-2">{offerSuggestions.length ? offerSuggestions.map((item) => <button key={`${item.source}-${item.value}`} type="button" onClick={() => chooseOffer(item)} className={`rounded-full border px-3 py-1.5 text-left text-xs transition-colors ${offer === item.value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/50"}`} title={`Fonte: ${item.source}`}>{item.value}<span className="ml-1 opacity-60">· {item.source}</span></button>) : <span className="text-xs text-muted-foreground">Cadastre produtos, serviços ou ofertas no perfil/catálogo para receber sugestões.</span>}</div></div>
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Objetivos recomendados</p><div className="flex flex-wrap gap-2">{objectiveSuggestions.map((item) => <button key={item.id} type="button" onClick={() => setObjectiveId(item.id)} className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${objectiveId === item.id ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/50"}`}>{item.label}</button>)}</div></div>
          </div>
          {opportunities.length > 0 && <div className="mt-4 border-t border-primary/15 pt-4"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Oportunidades encontradas</p><span className="text-[11px] text-muted-foreground">Público + oferta + objetivo</span></div><div className="grid gap-2 md:grid-cols-2">{opportunities.map((item, index) => { const target = OBJECTIVES.find((option) => option.id === item.objectiveId); return <button key={`${item.audience.value}-${item.offer.value}-${index}`} type="button" onClick={() => useOpportunity(item)} className="rounded-lg border bg-background p-3 text-left transition-colors hover:border-primary/50"><p className="text-xs font-semibold">{item.audience.value}</p><p className="mt-1 text-xs text-muted-foreground">→ {item.offer.value}</p><p className="mt-1 text-[11px] font-medium text-primary">Objetivo: {target?.label ?? "Gerar leads"} · Usar esta oportunidade</p></button>; })}</div></div>}
        </div>
        {mode === "remodel" && <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2"><div className="flex items-center gap-2 text-sm font-semibold"><RefreshCw className="h-4 w-4" />Site atual</div><div className="grid gap-2 lg:grid-cols-[1.4fr_1fr]"><Input value={siteUrl} onChange={(e) => { setSiteUrl(e.target.value); setStructure(null); }} placeholder="https://www.suaempresa.com.br" /><Select value={remodelLevel} onValueChange={(v) => setRemodelLevel(v as RemodelLevel)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="visual">Visual</SelectItem><SelectItem value="structural">Estrutural</SelectItem><SelectItem value="complete">Completa com IA</SelectItem></SelectContent></Select></div><Input value={preserve} onChange={(e) => setPreserve(e.target.value)} /><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void analyzeSite()} disabled={analyzing || !siteUrl.trim()}>{analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Analisar site atual</Button>{structure && <Badge variant="secondary">{structure.sections.length} seções mapeadas</Badge>}</div></div>}
        <div className="rounded-xl border p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">Inteligência do negócio e mercado</p><p className="text-xs text-muted-foreground">Reaproveita tom de marca, keywords e concorrentes já pesquisados pelo Content Autopilot. Sem cobrança escondida.</p></div><Button size="sm" variant="outline" onClick={() => void intelligence()} disabled={marketBusy}>{marketBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{campaignBriefing?.marketingContext.researchEnabled ? "Carregar pesquisa solicitada" : "Completar automaticamente"}</Button></div>{market && <div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline">Tom: {market.tone || "—"}</Badge><Badge variant="outline">Keywords: {market.keywords.length}</Badge><Badge variant="outline">Referências públicas: {market.competitors.length}</Badge></div>}</div>
      </CardContent></Card>
      <Card><CardHeader><div className="flex items-center justify-between gap-2"><div><CardTitle className="flex items-center gap-2 text-base"><ImageIcon className="h-4 w-4 text-primary" />Conteúdo & ativos</CardTitle><p className="mt-1 text-sm text-muted-foreground">Opcional: produtos/categorias, fotos, vídeos, depoimentos e orientações reais.</p></div><Button size="sm" variant="outline" onClick={() => setAssetsOpen((v) => !v)}>{assetsOpen ? "Ocultar" : "Adicionar conteúdo"}</Button></div></CardHeader><CardContent>{!assetsOpen ? <div className="grid grid-cols-4 gap-2 text-xs"><div className="rounded-lg border p-3">Produtos <strong className="block text-base">{selectedProducts.length || (mode === "ecommerce" ? catalog.length : 0)}</strong></div><div className="rounded-lg border p-3">Fotos <strong className="block text-base">{images.length}</strong></div><div className="rounded-lg border p-3">Vídeos <strong className="block text-base">{videos.length}</strong></div><div className="rounded-lg border p-3">Depoimentos <strong className="block text-base">{testimonials.filter((t) => t.text).length}</strong></div></div> : <div className="space-y-5">
        {!!catalog.length && mode !== "ecommerce" && <div className="space-y-2"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Produtos e categorias</p><p className="text-xs text-muted-foreground">Escolha o que deve aparecer neste site.</p></div><Badge>{selected.length} selecionado{selected.length === 1 ? "" : "s"}</Badge></div><div className="flex flex-wrap gap-2">{groups.map(([g, items]) => <button key={g} type="button" onClick={() => toggleGroup(items)} className={`rounded-full border px-3 py-1 text-xs ${items.every((x) => selected.includes(x.id)) ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground"}`}>{g} ({items.length})</button>)}</div><div className="grid max-h-56 gap-2 overflow-y-auto rounded-xl border p-2 md:grid-cols-2 xl:grid-cols-3">{catalog.map((p) => <button key={p.id} type="button" onClick={() => toggleProduct(p.id)} className={`flex items-center gap-2 rounded-lg border p-2 text-left ${selected.includes(p.id) ? "border-primary bg-primary/5" : ""}`}><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{p.nome}</p><p className="text-[10px] text-muted-foreground">{price(p.precoBase) || p.categoria || "Catálogo"}</p></div>{selected.includes(p.id) && <CheckCircle2 className="h-4 w-4 text-primary" />}</button>)}</div></div>}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><div className="flex items-center gap-2"><Wand2 className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Animar com IA</p><Badge variant="secondary">Motion AI</Badge></div><p className="mt-1 text-xs text-muted-foreground">Transforme uma foto em vídeo ou dê acabamento a um vídeo usando o Media Engine. A saída entra automaticamente no site.</p></div>
            <Button size="sm" variant={motionOpen ? "secondary" : "outline"} onClick={() => setMotionOpen((value) => !value)} disabled={!motionAssets.length}>{motionOpen ? "Ocultar" : "Criar animação"}</Button>
          </div>
          {!motionAssets.length && <p className="mt-3 rounded-lg border border-dashed bg-background p-3 text-xs text-muted-foreground">Envie uma foto ou vídeo acima. Os novos uploads ficam registrados na Biblioteca e podem ser animados aqui.</p>}
          {motionOpen && motionAssets.length > 0 && <div className="mt-4 space-y-4">
            <div className="grid gap-3 lg:grid-cols-[1.4fr_.8fr_.8fr]">
              <div><Label>Mídia de origem</Label><Select value={motionSourceUrl || motionAssets[0]?.url || ""} onValueChange={setMotionSourceUrl}><SelectTrigger className="mt-1"><SelectValue placeholder="Selecione uma foto ou vídeo" /></SelectTrigger><SelectContent>{motionAssets.map((asset) => <SelectItem key={asset.assetId} value={asset.url}>{asset.kind === "image" ? "Foto" : "Vídeo"} · {asset.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Formato</Label><Select value={motionAspectRatio} onValueChange={(value) => setMotionAspectRatio(value as "landscape" | "portrait")}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="landscape">16:9 horizontal — site</SelectItem><SelectItem value="portrait">9:16 vertical</SelectItem></SelectContent></Select></div>
              <div><Label>Duração</Label><Select value={motionDuration} onValueChange={setMotionDuration}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="8">8 segundos</SelectItem><SelectItem value="12">12 segundos</SelectItem><SelectItem value="16">16 segundos</SelectItem><SelectItem value="20">20 segundos</SelectItem></SelectContent></Select></div>
            </div>
            <div><Label>Estilo de movimento</Label><div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{(["auto", "clean", "cinematic", "premium", "dynamic", "minimal"] as MotionPreset[]).map((preset) => <button key={preset} type="button" onClick={() => setMotionPreset(preset)} className={`rounded-lg border px-3 py-2 text-xs font-medium ${motionPreset === preset ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/40"}`}>{preset === "auto" ? "Automático" : preset === "clean" ? "Clean" : preset === "cinematic" ? "Cinematográfico" : preset === "premium" ? "Premium" : preset === "dynamic" ? "Dinâmico" : "Minimalista"}</button>)}</div></div>
            <div className="grid gap-3 lg:grid-cols-[1fr_auto]"><div><Label>Direção adicional</Label><Textarea className="mt-1" rows={2} value={motionPrompt} onChange={(e) => setMotionPrompt(e.target.value)} placeholder="Ex.: aproximação lenta na fachada, luz natural, movimento suave da esquerda para a direita..." /></div><div className="grid min-w-56 gap-2 pt-6"><label className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-xs"><span>Preservação máxima</span><input type="checkbox" checked={motionPreserve} onChange={(e) => setMotionPreserve(e.target.checked)} /></label><label className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-xs"><span>Preparar para loop</span><input type="checkbox" checked={motionLoop} onChange={(e) => setMotionLoop(e.target.checked)} /></label></div></div>
            {selectedMotionAsset && <div className="flex items-center gap-3 rounded-lg border bg-background p-3">{selectedMotionAsset.kind === "image" ? <img src={selectedMotionAsset.url} alt="" className="h-16 w-24 rounded-md object-cover" /> : <video src={selectedMotionAsset.url} className="h-16 w-24 rounded-md object-cover" muted playsInline />}<div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{selectedMotionAsset.name}</p><p className="text-[11px] text-muted-foreground">Origem preservada · saída {motionAspectRatio === "landscape" ? "16:9" : "9:16"} · {motionDuration}s</p></div><Button onClick={() => void animateMedia()} disabled={motionBusy}>{motionBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Animando {motionProgress}%</> : <><Sparkles className="mr-2 h-4 w-4" />Gerar animação</>}</Button></div>}
            {motionJob?.output?.videoUrl && <div className="grid gap-3 rounded-xl border border-green-500/20 bg-green-500/5 p-3 sm:grid-cols-[220px_1fr]"><video src={motionJob.output.videoUrl} controls loop={motionLoop} muted playsInline className="w-full rounded-lg bg-black" /><div className="self-center"><p className="text-sm font-semibold">Animação pronta</p><p className="mt-1 text-xs text-muted-foreground">O vídeo já foi adicionado em “Vídeos” e seguirá para a geração do site.</p></div></div>}
          </div>}
        </div>
        <div className="grid gap-4 lg:grid-cols-2"><div><p className="mb-2 text-sm font-semibold">Fotos</p><label className="block cursor-pointer"><input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void uploadMany(Array.from(e.target.files ?? []) as File[], "image"); e.target.value = ""; }} /><div className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-5 text-sm text-muted-foreground"><Upload className="h-4 w-4" />Adicionar fotos</div></label>{images.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{images.map((u, i) => <div key={u + i} className="group relative"><img src={u} alt="" className="h-14 w-14 rounded-md border object-cover" /><button type="button" onClick={() => setImages((v) => v.filter((_, x) => x !== i))} className="absolute -right-1 -top-1 hidden rounded-full bg-destructive px-1 text-white group-hover:block">×</button></div>)}</div>}</div><div><p className="mb-2 text-sm font-semibold">Vídeos</p><label className="block cursor-pointer"><input type="file" accept="video/*" multiple className="sr-only" onChange={(e) => { void uploadMany(Array.from(e.target.files ?? []) as File[], "video"); e.target.value = ""; }} /><div className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-5 text-sm text-muted-foreground"><Video className="h-4 w-4" />Fazer upload de vídeos</div></label><div className="mt-2 flex gap-2"><Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="ou cole a URL do vídeo" /><Button variant="outline" disabled={!videoUrl.trim()} onClick={() => { setVideos((v) => [...v, videoUrl.trim()]); setVideoUrl(""); }}><Plus className="h-4 w-4" /></Button></div>{videos.map((u, i) => <div key={u + i} className="mt-1 flex items-center gap-2 rounded-md border px-2 py-1 text-xs"><span className="min-w-0 flex-1 truncate">{u}</span><button type="button" onClick={() => setVideos((v) => v.filter((_, x) => x !== i))}><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div></div>
        <div className="rounded-xl border p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Depoimentos</p><p className="text-xs text-muted-foreground">Escreva o depoimento real e anexe foto ou vídeo se quiser.</p></div><Button size="sm" variant="outline" onClick={() => setTestimonials((v) => [...v, { id: crypto.randomUUID(), name: "", company: "", text: "", mediaUrl: "", mediaType: null }])}><Quote className="mr-2 h-4 w-4" />Adicionar</Button></div>{!testimonials.length && <p className="mt-3 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Nenhum depoimento adicionado. A IA não inventará depoimentos.</p>}{testimonials.map((t, i) => <div key={t.id} className="mt-3 space-y-2 rounded-lg border p-3"><div className="flex justify-between"><strong className="text-xs">Depoimento {i + 1}</strong><button type="button" onClick={() => setTestimonials((v) => v.filter((x) => x.id !== t.id))}><Trash2 className="h-4 w-4" /></button></div><div className="grid grid-cols-2 gap-2"><Input value={t.name} onChange={(e) => setTestimonials((v) => v.map((x) => x.id === t.id ? { ...x, name: e.target.value } : x))} placeholder="Nome do cliente" /><Input value={t.company} onChange={(e) => setTestimonials((v) => v.map((x) => x.id === t.id ? { ...x, company: e.target.value } : x))} placeholder="Empresa/cargo" /></div><Textarea rows={2} value={t.text} onChange={(e) => setTestimonials((v) => v.map((x) => x.id === t.id ? { ...x, text: e.target.value } : x))} placeholder="Depoimento real" /><div className="flex items-center gap-2"><label className="cursor-pointer"><input type="file" accept="image/*,video/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadTestimonial(t.id, f); e.target.value = ""; }} /><Button type="button" size="sm" variant="outline" asChild><span><Upload className="mr-2 h-4 w-4" />Foto/vídeo</span></Button></label><Input value={t.mediaUrl} onChange={(e) => setTestimonials((v) => v.map((x) => x.id === t.id ? { ...x, mediaUrl: e.target.value, mediaType: e.target.value ? inferMediaKind(e.target.value) : null } : x))} placeholder="ou URL da mídia" />{t.mediaUrl && <Badge variant="secondary">✓</Badge>}</div></div>)}</div>
        <div className="rounded-xl border p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Outros conteúdos</p><p className="text-xs text-muted-foreground">Cases, certificações, equipe, FAQ ou qualquer informação que mereça texto e mídia próprios.</p></div><Button size="sm" variant="outline" onClick={() => setExtras((v) => [...v, { id: crypto.randomUUID(), title: "", text: "", mediaUrl: "", mediaType: null }])}><Plus className="mr-2 h-4 w-4" />Adicionar</Button></div>{!extras.length && <p className="mt-3 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Opcional. Adicione somente informações reais que devam entrar no site.</p>}{extras.map((x, i) => <div key={x.id} className="mt-3 space-y-2 rounded-lg border p-3"><div className="flex justify-between"><strong className="text-xs">Conteúdo {i + 1}</strong><button type="button" onClick={() => setExtras((v) => v.filter((a) => a.id !== x.id))}><Trash2 className="h-4 w-4" /></button></div><Input value={x.title} onChange={(e) => setExtras((v) => v.map((a) => a.id === x.id ? { ...a, title: e.target.value } : a))} placeholder="Título — ex.: Case Hotel X, Certificação, FAQ técnico" /><Textarea rows={2} value={x.text} onChange={(e) => setExtras((v) => v.map((a) => a.id === x.id ? { ...a, text: e.target.value } : a))} placeholder="Escreva a informação real que deve ser usada" /><div className="flex items-center gap-2"><label className="cursor-pointer"><input type="file" accept="image/*,video/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadExtra(x.id, f); e.target.value = ""; }} /><Button type="button" size="sm" variant="outline" asChild><span><Upload className="mr-2 h-4 w-4" />Foto/vídeo</span></Button></label><Input value={x.mediaUrl} onChange={(e) => setExtras((v) => v.map((a) => a.id === x.id ? { ...a, mediaUrl: e.target.value, mediaType: e.target.value ? inferMediaKind(e.target.value) : null } : a))} placeholder="ou URL da mídia" />{x.mediaUrl && <Badge variant="secondary">✓</Badge>}</div></div>)}</div>
        <div><Label>Orientação adicional para a IA</Label><Textarea className="mt-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: não alterar determinada informação, dar mais destaque a uma categoria, usar linguagem mais técnica..." /></div>
      </div>}</CardContent></Card>
      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}
      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur"><div><p className="text-sm font-semibold">Pronto para gerar</p><p className="text-xs text-muted-foreground">Sem repetir perguntas: negócio + público + oferta + catálogo + ativos + inteligência disponível.</p></div><div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="outline" onClick={() => void previewLatest()}><Globe className="mr-2 h-4 w-4" />Visualizar site</Button><Button size="lg" onClick={() => void generate()} disabled={generating || uploads > 0}>{generating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Gerando...</> : uploads > 0 ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando mídia...</> : <><Sparkles className="mr-2 h-4 w-4" />Gerar site com IA</>}</Button></div></div>
    </>}
  </div>;
}

export function SiteGeneratorTab() { return <GeneratorWorkspace />; }
export default function SiteGenerator() { return <div className="mx-auto max-w-6xl space-y-6 p-6"><div className="flex items-center gap-2"><Building2 className="h-6 w-6 text-primary" /><div><h1 className="text-2xl font-bold tracking-tight">Gerador de Sites</h1><p className="text-sm text-muted-foreground">O VendorAI entende o negócio, organiza o briefing e só pergunta o que realmente estiver faltando.</p></div></div><GeneratorWorkspace /></div>; }
