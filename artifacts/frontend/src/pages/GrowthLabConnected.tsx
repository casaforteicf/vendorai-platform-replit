import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, FlaskConical, Plus, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type CapabilityStatus = "available" | "partial" | "missing";
type Capability = { id: string; name: string; module: string; status: CapabilityStatus; keywords: string[] };
type PromiseItem = { id: string; promise: string; capabilities: string[]; lp: string; source?: string };
type ApiPromise = { id: string; promise: string; lpName: string; source: string; capabilityIds: string[] };
type ApiBacklog = { id: string; capabilityId: string; capabilityName: string; module: string; affectedPromises: number; priorityScore: number };

const CAPABILITIES: Capability[] = [
  { id: "crm", name: "CRM e pipeline", module: "CRM", status: "available", keywords: ["crm", "pipeline", "oportunidade", "lead"] },
  { id: "visitor", name: "Visitor Intelligence", module: "Inteligência", status: "available", keywords: ["visitante", "origem", "cidade", "campanha", "sessao"] },
  { id: "revenue", name: "Revenue Scout", module: "Receita", status: "available", keywords: ["receita", "reativar", "cliente inativo"] },
  { id: "followup", name: "Follow-up com IA", module: "Agentes", status: "available", keywords: ["follow-up", "followup", "retomar"] },
  { id: "agenda", name: "Agenda inteligente", module: "Agenda", status: "available", keywords: ["agenda", "agendar", "reuniao"] },
  { id: "content", name: "Conteúdo e criativos", module: "Marketing", status: "available", keywords: ["conteudo", "criativo", "post", "imagem"] },
  { id: "ads", name: "Gestão de anúncios", module: "Marketing", status: "partial", keywords: ["anuncio", "meta ads", "google ads", "campanha paga"] },
  { id: "seo", name: "SEO e Search Console", module: "Marketing", status: "available", keywords: ["seo", "search console", "busca organica"] },
  { id: "lp", name: "Sites e landing pages", module: "Marketing", status: "available", keywords: ["landing page", "lp", "site", "pagina"] },
  { id: "whatsapp", name: "WhatsApp conectado ao CRM", module: "Conversas", status: "available", keywords: ["whatsapp", "mensagem", "conversa"] },
  { id: "social", name: "Publicação multicanal", module: "Marketing", status: "partial", keywords: ["instagram", "facebook", "tiktok", "publicar"] },
  { id: "payment", name: "Cobrança e pagamento", module: "Financeiro", status: "partial", keywords: ["cobranca", "pagamento", "pix", "cartao"] },
  { id: "proposal", name: "Orçamentos e propostas", module: "Comercial", status: "available", keywords: ["orcamento", "proposta", "cotacao"] },
  { id: "automation", name: "Automações por evento", module: "Automação", status: "partial", keywords: ["automatico", "automacao", "gatilho", "evento"] },
];

const CATALOG_PROMISES: PromiseItem[] = [
  { id: "catalog-visitor", promise: "Identifique visitantes, entenda a origem e transforme intenção em oportunidade comercial.", capabilities: ["visitor", "crm"], lp: "LP institucional", source: "catalog" },
  { id: "catalog-revenue", promise: "Encontre receita escondida na base e reative clientes com follow-up inteligente.", capabilities: ["revenue", "followup", "crm"], lp: "LP vendas", source: "catalog" },
  { id: "catalog-marketing", promise: "Crie campanhas, conteúdos e landing pages conectados ao CRM e aos resultados.", capabilities: ["content", "lp", "crm", "ads"], lp: "LP marketing", source: "catalog" },
  { id: "catalog-social", promise: "Publique automaticamente em todas as redes sociais.", capabilities: ["social", "automation"], lp: "LP marketing", source: "catalog" },
];

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const coverage = (ids: string[]) => ids.length ? Math.round(ids.reduce((sum, id) => { const c = CAPABILITIES.find(x => x.id === id); return sum + (c?.status === "available" ? 100 : c?.status === "partial" ? 50 : 0); }, 0) / ids.length) : 0;

export default function GrowthLabConnected() {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const [serverPromises, setServerPromises] = useState<PromiseItem[]>([]);
  const [backlog, setBacklog] = useState<ApiBacklog[]>([]);
  const [query, setQuery] = useState("");
  const [newPromise, setNewPromise] = useState("");
  const [newLp, setNewLp] = useState("Nova promessa");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);
  const promises = useMemo(() => [...CATALOG_PROMISES, ...serverPromises], [serverPromises]);
  const detected = useMemo(() => { const text = normalize(newPromise); return CAPABILITIES.filter(c => c.keywords.some(k => text.includes(normalize(k)))); }, [newPromise]);
  const filtered = useMemo(() => { const q = normalize(query.trim()); return q ? promises.filter(p => normalize(p.promise).includes(q) || normalize(p.lp).includes(q)) : promises; }, [promises, query]);
  const overallCoverage = useMemo(() => promises.length ? Math.round(promises.reduce((sum, item) => sum + coverage(item.capabilities), 0) / promises.length) : 0, [promises]);

  async function load() {
    if (!tenantId || !token) return;
    try {
      const [pRes, bRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/growth-lab/promises`, { headers }),
        fetch(`/api/tenants/${tenantId}/growth-lab/backlog`, { headers }),
      ]);
      if (!pRes.ok || !bRes.ok) throw new Error("Não foi possível carregar o Growth Lab.");
      const pJson = await pRes.json() as ApiPromise[];
      setServerPromises(pJson.map(item => ({ id: item.id, promise: item.promise, capabilities: item.capabilityIds ?? [], lp: item.lpName, source: item.source })));
      setBacklog(await bRes.json() as ApiBacklog[]);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar o Growth Lab.");
    }
  }

  useEffect(() => { void load(); }, [tenantId, token]);

  async function addPromise() {
    const text = newPromise.trim();
    if (!text || !tenantId || !token) return;
    setSaving(true);
    setError("");
    try {
      const ids = detected.map(item => item.id);
      const response = await fetch(`/api/tenants/${tenantId}/growth-lab/promises`, {
        method: "POST",
        headers,
        body: JSON.stringify({ promise: text, lpName: newLp.trim() || "Nova promessa", source: "manual", capabilityIds: ids, coverage: coverage(ids), status: coverage(ids) === 100 ? "ready" : "gap" }),
      });
      if (!response.ok) throw new Error("Não foi possível registrar a promessa.");

      for (const capability of detected.filter(item => item.status !== "available")) {
        const affected = promises.filter(p => p.capabilities.includes(capability.id)).length + 1;
        const priority = Math.min(100, (capability.status === "missing" ? 60 : 35) + affected * 12);
        const backlogResponse = await fetch(`/api/tenants/${tenantId}/growth-lab/backlog/upsert`, {
          method: "POST",
          headers,
          body: JSON.stringify({ capabilityId: capability.id, capabilityName: capability.name, module: capability.module, currentStatus: capability.status, affectedPromises: affected, priorityScore: priority, action: "complete_product", state: "open" }),
        });
        if (!backlogResponse.ok) throw new Error("Não foi possível atualizar o backlog da promessa.");
      }

      setNewPromise("");
      setNewLp("Nova promessa");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/20 p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl border bg-background p-5 shadow-sm">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"><FlaskConical className="h-3.5 w-3.5" /> Growth Lab</div>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><h1 className="text-2xl font-bold md:text-3xl">Promessa comercial só entra na LP se o produto sustentar.</h1><p className="mt-2 text-sm text-muted-foreground">Promessas e lacunas persistidas por tenant na base central.</p></div><div className="rounded-xl border bg-muted/30 p-4"><div className="text-xs uppercase text-muted-foreground">Cobertura média</div><div className="text-3xl font-bold">{overallCoverage}%</div></div></div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border bg-background p-4"><div className="text-2xl font-bold">{promises.length}</div><div className="text-sm text-muted-foreground">promessas</div></div>
          <div className="rounded-xl border bg-background p-4"><CheckCircle2 className="mb-2 h-5 w-5"/><div className="text-2xl font-bold">{promises.filter(p => coverage(p.capabilities) === 100).length}</div><div className="text-sm text-muted-foreground">podem anunciar</div></div>
          <div className="rounded-xl border bg-background p-4"><AlertTriangle className="mb-2 h-5 w-5"/><div className="text-2xl font-bold">{promises.filter(p => coverage(p.capabilities) > 0 && coverage(p.capabilities) < 100).length}</div><div className="text-sm text-muted-foreground">com lacunas</div></div>
          <div className="rounded-xl border bg-background p-4"><ClipboardList className="mb-2 h-5 w-5"/><div className="text-2xl font-bold">{backlog.length}</div><div className="text-sm text-muted-foreground">backlog central</div></div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          <div className="space-y-4">
            <div className="rounded-xl border bg-background p-5">
              <h2 className="font-semibold">Já temos isso?</h2>
              <input value={newLp} onChange={e => setNewLp(e.target.value)} className="mt-4 w-full rounded-lg border px-3 py-2 text-sm" placeholder="Nome da LP" />
              <textarea value={newPromise} onChange={e => setNewPromise(e.target.value)} className="mt-3 min-h-32 w-full rounded-lg border p-3 text-sm" placeholder="Descreva a promessa..." />
              <div className="mt-4 space-y-2">{detected.map(c => <div key={c.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"><span>{c.name}</span><span className="text-xs text-muted-foreground">{c.status === "available" ? "Disponível" : c.status === "partial" ? "Parcial" : "Ausente"}</span></div>)}</div>
              <button onClick={addPromise} disabled={saving || !newPromise.trim()} className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Plus className="mr-2 inline h-4 w-4"/>{saving ? "Salvando..." : "Registrar promessa"}</button>
            </div>

            <div className="rounded-xl border bg-background p-5"><h2 className="font-semibold">Backlog central</h2><div className="mt-4 space-y-3">{backlog.map(item => <div key={item.id} className="rounded-lg border p-3"><div className="flex justify-between gap-3"><div><div className="font-medium">{item.capabilityName}</div><div className="text-xs text-muted-foreground">{item.module} · {item.affectedPromises} promessa(s)</div></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">P{item.priorityScore}</span></div></div>)}{!backlog.length && <div className="text-sm text-muted-foreground">Nenhuma lacuna persistida.</div>}</div></div>
          </div>

          <div className="rounded-xl border bg-background p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h2 className="font-semibold">Registro de Promessas</h2><p className="text-sm text-muted-foreground">Catálogo + registros persistidos do tenant.</p></div><div className="relative md:w-72"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar promessa ou LP" className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm"/></div></div>
            <div className="mt-5 space-y-3">{filtered.map(item => { const pct = coverage(item.capabilities); return <div key={item.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><div><div className="text-xs uppercase text-muted-foreground">{item.lp}</div><div className="mt-1 font-semibold">{item.promise}</div></div><div className={`h-fit rounded-full px-3 py-1 text-xs font-semibold ${pct === 100 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{pct === 100 ? "Pode anunciar" : "Completar produto"}</div></div><div className="mt-4 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div><div className="w-12 text-right text-sm font-semibold">{pct}%</div></div></div>; })}</div>
          </div>
        </div>
      </div>
    </div>
  );
}