import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type Entry = { id: string; title: string; values: Record<string, string>; source: string; evidence: "declared" | "verified" | "hypothesis"; productIds: string[]; assetIds: string[] };
type Section = { draft: Entry[]; approved: Entry[]; approvedAt?: string; revision: number };
type Plan = { version: number; sections: Record<string, Section>; history: Array<{ version: number; section: string; action: string; at: string }> };
type Data = { plan: Plan; sections: Array<{ id: string; title: string; fields: string[] }>; sources: { profile: Record<string, unknown> | null; products: Array<{ id: string; nome: string; descricao?: string }>; assets: Array<{ id: string; title: string; url: string }> } };
type DiagnosticoInteligencia = {
  percentual: number;
  nivel: "inicial" | "parcial" | "bom" | "forte";
  itens: Array<{ id: string; titulo: string; concluido: boolean; peso: number; detalhe: string; acao?: string }>;
  lacunas: Array<{ id: string; titulo: string; acao: string }>;
};
type DiscoveryInteligente = {
  resumo: string;
  prioridades: Array<{
    secao: string;
    titulo: string;
    motivo: string;
    perguntas: string[];
    evidenciasNecessarias: string[];
    impacto: "alto" | "medio" | "baixo";
  }>;
  status: "rascunho";
  aviso: string;
};
type DiscoveryDocumentos = {
  extracao: Record<string, unknown>;
  sugestoes: Array<{ secao: string; records: Entry[] }>;
  status: "rascunho";
  aviso: string;
};
const selectClass = "w-full rounded-md border bg-background p-2 text-sm";
const roleLabels: Record<string, string> = { marketing: "Marketing", prospector: "Prospector", sdr: "SDR", closer: "Closer", agendamento: "Agendamento", suporte: "Suporte", pos_venda: "Pós-venda", financeiro: "Financeiro", cobranca: "Cobrança", scout: "Revenue Scout" };
export function BusinessPlanPanel() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId;
  const { toast } = useToast();
  const qc = useQueryClient();
  const queryKey = ["business-plan", tenantId];
  const base = `/api/tenants/${tenantId}/business-plan`;
  async function request(path: string, method = "GET", body?: unknown) {
    const res = await fetch(base + path, { method, credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Não foi possível concluir a operação");
    return data;
  }
  const query = useQuery<Data>({ queryKey, queryFn: () => request(""), enabled: !!tenantId, refetchOnWindowFocus: false });
  const diagnosticoQuery = useQuery<DiagnosticoInteligencia>({
    queryKey: ["diagnostico-inteligencia-negocio", tenantId, query.data?.plan.version],
    queryFn: () => request("/diagnostico-inteligencia"),
    enabled: !!tenantId,
    refetchOnWindowFocus: false,
  });
  const [tab, setTab] = useState("plan");
  const [sectionId, setSectionId] = useState("company");
  const [drafts, setDrafts] = useState<Record<string, Entry[]>>({});
  const [suggestion, setSuggestion] = useState<Entry[] | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState("");
  const busyRef = useRef(false);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const [role, setRole] = useState("marketing");
  const [agentContext, setAgentContext] = useState("");
  const [campaign, setCampaign] = useState({ segmentId: "", productId: "", goal: "", channel: "instagram", assetIds: [] as string[] });
  const [message, setMessage] = useState("");
  const [savedCampaign, setSavedCampaign] = useState("");
  const [discoveryInteligente, setDiscoveryInteligente] = useState<DiscoveryInteligente | null>(null);
  const [focoDiscovery, setFocoDiscovery] = useState("");
  const [discoveryDocumentos, setDiscoveryDocumentos] = useState<DiscoveryDocumentos | null>(null);
  const campaignId = useRef(crypto.randomUUID());
  const previewVersion = useRef<number | null>(null);
  const data = query.data;
  const spec = data?.sections.find(s => s.id === sectionId);
  const saved = data?.plan.sections[sectionId];
  const records = drafts[sectionId] ?? saved?.draft ?? [];
  const dirty = Object.keys(drafts).length > 0;
  useEffect(() => { setDrafts({}); setSuggestion(null); setMessage(""); setSavedCampaign(""); setAgentContext(""); }, [tenantId]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  async function run(label: string, action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(label);
    try { await action(); } catch (e) { toast({ title: e instanceof Error ? e.message : "Falha na operação", variant: "destructive" }); }
    finally { busyRef.current = false; setBusy(""); }
  }
  function update(index: number, patch: Partial<Entry>) { setDrafts(v => ({ ...v, [sectionId]: records.map((r, i) => i === index ? { ...r, ...patch } : r) })); }
  function newEntry(): Entry { return { id: crypto.randomUUID(), title: "Nova ficha", values: {}, evidence: "declared", source: "Informado pela empresa", productIds: [], assetIds: [] }; }
  async function analisarDocumentosDiscovery(files: FileList | null) {
    if (!files?.length || !tenantId) return;
    await run("Analisando documentos...", async () => {
      const body = new FormData();
      Array.from(files).slice(0, 5).forEach((file) => body.append("files", file));
      const response = await fetch(`${base}/discovery-documentos`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body,
      });
      const data = await response.json().catch(() => ({})) as DiscoveryDocumentos & { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível analisar os documentos.");
      setDiscoveryDocumentos(data);
      if (documentInputRef.current) documentInputRef.current.value = "";
    });
  }

  async function executarDiscoveryInteligente() {
    await run("Analisando inteligência do negócio...", async () => {
      const response = await request("/discovery-inteligente", "POST", { foco: focoDiscovery });
      setDiscoveryInteligente(response);
    });
  }

  async function save(action: "save" | "approve" | "revoke") {
    await run("Salvando...", async () => {
      const response = await request(`/sections/${sectionId}`, "PUT", { version: data!.plan.version, action, records });
      qc.setQueryData<Data>(queryKey, old => old ? { ...old, plan: response.plan } : old);
      setDrafts(v => { const next = { ...v }; delete next[sectionId]; return next; });
      setAgentContext("");
      toast({ title: action === "approve" ? "Bloco aprovado para os agentes" : action === "revoke" ? "Uso deste bloco nos agentes revogado" : "Rascunho salvo" });
    });
  }
  function patchCampaign(patch: Partial<typeof campaign>) { setCampaign(v => ({ ...v, ...patch })); setMessage(""); setSavedCampaign(""); previewVersion.current = null; campaignId.current = crypto.randomUUID(); }
  const mediaPicker = (selected: string[], change: (ids: string[]) => void) => <div className="space-y-2"><p className="text-sm font-medium">Imagens da biblioteca · {selected.length} selecionadas</p><div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">{data?.sources.assets.map(a => <label key={a.id} className={`cursor-pointer rounded-lg border p-2 ${selected.includes(a.id) ? "border-primary bg-primary/5" : ""}`}><img src={a.url} alt={a.title} loading="lazy" className="mb-2 h-24 w-full rounded object-cover" /><span className="flex items-start gap-2 text-xs"><input type="checkbox" checked={selected.includes(a.id)} onChange={e => change(e.target.checked ? [...selected, a.id].slice(0,10) : selected.filter(id => id !== a.id))} />{a.title}</span></label>)}</div>{!data?.sources.assets.length && <p className="text-sm text-muted-foreground">Cadastre imagens na Biblioteca de Mídias para utilizá-las aqui.</p>}</div>;
  if (query.isPending) return <p className="p-6">Carregando plano da empresa...</p>;
  if (query.isError || !data) return <div className="rounded-xl border p-6"><p>{query.error?.message || "Plano indisponível"}</p><Button onClick={() => query.refetch()}>Tentar novamente</Button></div>;
  function exportPlan() {
    const escape = (v: string) => v.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]!));
    const sections = data!.sections.map(s => `<section><h2>${escape(s.title)}</h2>${(data!.plan.sections[s.id]?.approved ?? []).map(r => `<article><h3>${escape(r.title)}</h3><p>${r.evidence === "hypothesis" ? "Hipótese a validar" : "Informação aprovada"}</p>${Object.entries(r.values).map(([k,v]) => `<h4>${escape(k)}</h4><p>${escape(v)}</p>`).join("")}<small>Fonte: ${escape(r.source)}</small></article>`).join("") || "<p>Pendente de desenvolvimento e aprovação.</p>"}</section>`).join("");
    const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Plano de Negócios</title><style>body{font:16px/1.6 system-ui;max-width:1000px;margin:40px auto;padding:24px;color:#172033}section{margin:32px 0;border-top:1px solid #ddd}article{padding:16px;background:#f7f8fa;margin:16px 0}p{white-space:pre-wrap}h4{margin-bottom:0}@media print{article{break-inside:avoid}}</style><h1>Plano de Negócios</h1><p>Versão ${data!.plan.version} · ${escape(String(data!.sources.profile?.nome_fantasia || data!.sources.profile?.razao_social || "Empresa"))}</p>${sections}</html>`;
    const url=URL.createObjectURL(new Blob([html],{type:"text/html;charset=utf-8"})); const a=document.createElement("a");a.href=url;a.download="Plano_de_Negocios.html";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const approvedCount = Object.values(data.plan.sections).filter(s => s.approved.length).length;
  return <fieldset disabled={!!busy} className="min-w-0 space-y-4">
    {diagnosticoQuery.data && (
      <section className="rounded-xl border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Inteligência do Negócio</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cobertura atual das informações que o Vendi e os agentes podem consultar.
            </p>
          </div>
          <div className="rounded-xl border bg-muted/30 px-4 py-3 text-center">
            <div className="text-2xl font-semibold">{diagnosticoQuery.data.percentual}%</div>
            <div className="text-xs capitalize text-muted-foreground">nível {diagnosticoQuery.data.nivel}</div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 rounded-lg border bg-muted/20 p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <p className="text-xs font-semibold">Importar documentos para Discovery</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Envie PDF, Word, texto ou imagem. O Vendi extrai fatos e propõe rascunhos nos blocos corretos; nada é aprovado automaticamente.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={documentInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.txt,.md,image/*"
              className="hidden"
              onChange={(event) => void analisarDocumentosDiscovery(event.target.files)}
            />
            <Button variant="outline" disabled={!!busy} onClick={() => documentInputRef.current?.click()}>
              Analisar documentos
            </Button>
          </div>
        </div>

        {discoveryDocumentos && (
          <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50/50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Sugestões extraídas dos documentos</p>
                <p className="mt-1 text-xs text-muted-foreground">{discoveryDocumentos.aviso}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setDiscoveryDocumentos(null)}>Fechar</Button>
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {discoveryDocumentos.sugestoes.map((grupo) => {
                const secao = data.sections.find((item) => item.id === grupo.secao);
                return (
                  <article key={grupo.secao} className="rounded-lg border bg-background p-3">
                    <p className="text-xs font-semibold">{secao?.title ?? grupo.secao}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{grupo.records.length} ficha(s) sugerida(s)</p>
                    <div className="mt-2 space-y-2">
                      {grupo.records.slice(0, 5).map((registro) => (
                        <details key={registro.id} className="rounded-md border bg-muted/20 px-2 py-1.5">
                          <summary className="cursor-pointer text-xs font-medium">{registro.title}</summary>
                          {Object.entries(registro.values).map(([chave, valor]) => (
                            <p key={chave} className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground"><strong>{chave}: </strong>{valor}</p>
                          ))}
                        </details>
                      ))}
                    </div>
                    <Button
                      className="mt-3"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const atuais = drafts[grupo.secao] ?? data.plan.sections[grupo.secao]?.draft ?? [];
                        setDrafts((value) => ({
                          ...value,
                          [grupo.secao]: [...atuais, ...grupo.records].slice(0, 30),
                        }));
                        setTab("plan");
                        setSectionId(grupo.secao);
                      }}
                    >
                      Adicionar ao rascunho deste bloco
                    </Button>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-xs font-medium">
            Foco opcional do Discovery
            <Input
              value={focoDiscovery}
              onChange={(event) => setFocoDiscovery(event.target.value)}
              placeholder="Ex.: melhorar abordagem comercial para construtoras"
              className="mt-1"
            />
          </label>
          <Button variant="outline" disabled={!!busy} onClick={() => void executarDiscoveryInteligente()}>
            Discovery Inteligente
          </Button>
        </div>

        {discoveryInteligente && (
          <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Prioridades sugeridas pelo Vendi</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{discoveryInteligente.resumo}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setDiscoveryInteligente(null)}>Fechar</Button>
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {discoveryInteligente.prioridades.map((prioridade, index) => (
                <article key={`${prioridade.secao}:${index}`} className="rounded-lg border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{prioridade.titulo}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${prioridade.impacto === "alto" ? "bg-red-50 text-red-700" : prioridade.impacto === "medio" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700"}`}>
                      impacto {prioridade.impacto}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{prioridade.motivo}</p>
                  {!!prioridade.perguntas.length && (
                    <div className="mt-2">
                      <p className="text-[11px] font-semibold">Perguntas para completar</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
                        {prioridade.perguntas.map((pergunta) => <li key={pergunta}>{pergunta}</li>)}
                      </ul>
                    </div>
                  )}
                  {!!prioridade.evidenciasNecessarias.length && (
                    <div className="mt-2">
                      <p className="text-[11px] font-semibold">Evidências necessárias</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{prioridade.evidenciasNecessarias.join(" · ")}</p>
                    </div>
                  )}
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTab("plan");
                      setSectionId(prioridade.secao);
                      setNotes([
                        prioridade.titulo,
                        prioridade.motivo,
                        prioridade.perguntas.length ? `Perguntas a responder: ${prioridade.perguntas.join(" | ")}` : "",
                        prioridade.evidenciasNecessarias.length ? `Evidências a buscar: ${prioridade.evidenciasNecessarias.join(" | ")}` : "",
                      ].filter(Boolean).join("\n"));
                    }}
                  >
                    Desenvolver este bloco
                  </Button>
                </article>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">{discoveryInteligente.aviso}</p>
          </div>
        )}

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {diagnosticoQuery.data.itens.map((item) => (
            <div key={item.id} className="rounded-lg border bg-background px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{item.titulo}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.concluido ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {item.concluido ? "Coberto" : "Melhorar"}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detalhe}</p>
              {!item.concluido && item.acao && <p className="mt-2 text-xs font-medium text-amber-800">{item.acao}</p>}
            </div>
          ))}
        </div>
      </section>
    )}

    <div className="rounded-xl border bg-card p-5"><h2 className="text-xl font-semibold">Plano de Negócios</h2><p className="mt-1 text-sm text-muted-foreground">Desenvolva sua estratégia com IA e transforme informações aprovadas em orientação para os agentes e campanhas.</p><p className="mt-3 text-sm">{approvedCount} de {data.sections.length} blocos aprovados · versão {data.plan.version}{dirty ? " · alterações não salvas" : ""}</p><div className="mt-4 flex flex-wrap gap-2">{[["plan", "Desenvolver plano"], ["agents", "Conexão com agentes"], ["campaign", "Criar campanha"], ["document", "Visualizar PN"]].map(([key, label]) => <Button key={key} variant={tab === key ? "default" : "outline"} onClick={() => setTab(key)}>{label}</Button>)}</div></div>
    {tab === "plan" && <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]"><nav className="flex gap-2 overflow-x-auto lg:flex-col" aria-label="Blocos do plano">{data.sections.map((s,i) => <button key={s.id} disabled={!!busy} onClick={() => { setSectionId(s.id); setSuggestion(null); setNotes(""); }} className={`shrink-0 rounded-lg border p-3 text-left text-sm ${sectionId === s.id ? "border-primary bg-primary/5 font-semibold" : "bg-card"}`}>{i+1}. {s.title}<span className="block text-xs font-normal text-muted-foreground">{drafts[s.id] ? "Alterações não salvas" : data.plan.sections[s.id]?.approved.length ? "Versão aprovada disponível" : "Em desenvolvimento"}</span></button>)}</nav>
      <div className="min-w-0 space-y-4"><div className="rounded-xl border bg-card p-4"><h3 className="font-semibold">{spec?.title}</h3><p className="mt-1 text-sm text-muted-foreground">Crie uma ficha por segmento, produto, oportunidade ou ação. Rascunhos e hipóteses não entram no atendimento dos agentes.</p><label className="mt-3 block text-sm">Como a IA pode ajudar?<Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex.: desenvolva oportunidades específicas para os públicos que atendemos" /></label><Button className="mt-2" disabled={!!busy} onClick={() => run("Desenvolvendo com IA...", async () => { const r = await request(`/sections/${sectionId}/suggest`, "POST", { records, notes }); setSuggestion(r.records); })}>Desenvolver com IA</Button></div>
      {suggestion && <div className="rounded-xl border border-primary bg-card p-4"><h4 className="font-semibold">Sugestão para revisão</h4>{suggestion.map(r => <details key={r.id} className="mt-2"><summary>{r.title}</summary>{Object.entries(r.values).map(([k,v]) => <p key={k} className="mt-2 whitespace-pre-wrap text-sm"><strong>{k}: </strong>{v}</p>)}</details>)}<div className="mt-3 flex gap-2"><Button onClick={() => { setDrafts(v => ({ ...v, [sectionId]: [...records, ...suggestion].slice(0,30) })); setSuggestion(null); }}>Adicionar ao rascunho</Button><Button variant="outline" onClick={() => setSuggestion(null)}>Descartar sugestão</Button></div></div>}
      {records.map((r,index) => <div key={r.id} className="space-y-4 rounded-xl border bg-card p-4"><div className="flex gap-2"><Input aria-label="Título da ficha" value={r.title} onChange={e => update(index, { title: e.target.value })} /><Button variant="outline" onClick={() => setDrafts(v => ({ ...v, [sectionId]: records.filter(x => x.id !== r.id) }))}>Remover</Button></div><div className="grid gap-4 xl:grid-cols-2">{spec?.fields.map(f => <label key={f} className="space-y-1 text-sm"><span>{f}</span><Textarea rows={3} value={r.values[f] ?? ""} onChange={e => update(index, { values: { ...r.values, [f]: e.target.value } })} /></label>)}</div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Situação da informação<select className={selectClass} value={r.evidence} onChange={e => update(index, { evidence: e.target.value as Entry["evidence"] })}><option value="declared">Informado pela empresa</option><option value="verified">Validado com evidência</option><option value="hypothesis">Hipótese a validar</option></select></label><label className="text-sm">Fonte ou evidência<Input value={r.source} onChange={e => update(index, { source: e.target.value })} placeholder="Documento, case, entrevista ou responsável" /></label></div><details><summary className="cursor-pointer text-sm font-medium">Vincular produtos e imagens</summary><label className="mt-3 block text-sm">Produtos do catálogo<select multiple className={selectClass} value={r.productIds} onChange={e => update(index, { productIds: Array.from(e.target.selectedOptions, o => o.value) })}>{data.sources.products.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label><div className="mt-3">{mediaPicker(r.assetIds, assetIds => update(index, { assetIds }))}</div></details></div>)}
      <Button variant="outline" disabled={!!busy || records.length >= 30} onClick={() => setDrafts(v => ({ ...v, [sectionId]: [...records, newEntry()] }))}>Adicionar ficha</Button>
      <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-4"><Button disabled={!!busy} onClick={() => save("save")}>Salvar e continuar</Button><Button variant="outline" disabled={!!busy || !records.length} onClick={() => save("approve")}>Aprovar bloco para uso</Button>{!!saved?.approved.length && <Button variant="outline" disabled={!!busy} onClick={() => save("revoke")}>Revogar uso nos agentes</Button>}<Button variant="ghost" disabled={!!busy} onClick={() => query.refetch()}>Recarregar versão salva</Button></div></div>
    </div>}
    {tab === "agents" && <div className="space-y-4 rounded-xl border bg-card p-5"><h3 className="font-semibold">Base compartilhada, agentes editáveis</h3><p className="text-sm text-muted-foreground">Cada agente consulta os blocos aprovados pertinentes à sua função. Seus prompts, restrições e configurações individuais são preservados. Financeiro interno, SWOT e riscos não são enviados aos agentes de atendimento.</p><label className="block text-sm">Agente<select className={selectClass} value={role} onChange={e => { setRole(e.target.value); setAgentContext(""); }}>{Object.entries(roleLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><Button disabled={!!busy} onClick={() => run("Consultando base...", async () => { const r = await request(`/agent/${role}`); setAgentContext(r.context || "Nenhum conteúdo aprovado para este agente. Desenvolva e aprove os blocos do plano."); })}>Visualizar base utilizada</Button><a className="ml-3 text-sm underline" href="/agents/config">Editar agentes</a>{agentContext && <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-4 text-xs">{agentContext}</pre>}</div>}
    {tab === "campaign" && <div className="space-y-4 rounded-xl border bg-card p-5"><h3 className="font-semibold">Campanha por público e produto</h3><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Segmento aprovado<select className={selectClass} value={campaign.segmentId} onChange={e => patchCampaign({ segmentId: e.target.value })}><option value="">Escolha um segmento</option>{data.plan.sections.segments?.approved.filter(r => r.evidence !== "hypothesis").map(r => <option key={r.id} value={r.id}>{r.title}</option>)}</select></label><label className="text-sm">Produto do catálogo<select className={selectClass} value={campaign.productId} onChange={e => { const productId=e.target.value; const recommended=Object.values(data.plan.sections).flatMap(s=>s.approved).filter(r=>r.productIds.includes(productId)).flatMap(r=>r.assetIds); patchCampaign({ productId, assetIds:[...new Set(recommended)].slice(0,10) }); }}><option value="">Escolha um produto</option>{data.sources.products.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label><label className="text-sm">Objetivo<Input value={campaign.goal} onChange={e => patchCampaign({ goal: e.target.value })} placeholder="Ex.: solicitar uma demonstração" /></label><label className="text-sm">Canal<select className={selectClass} value={campaign.channel} onChange={e => patchCampaign({ channel: e.target.value })}><option value="instagram">Instagram</option><option value="email">E-mail</option><option value="whatsapp">WhatsApp</option></select></label></div>{mediaPicker(campaign.assetIds, assetIds => patchCampaign({ assetIds }))}<p className="text-xs text-muted-foreground">A primeira imagem será a capa da campanha. As demais ficam vinculadas ao briefing para composição dos materiais.</p><Button disabled={!!busy || !campaign.segmentId || !campaign.productId || campaign.goal.trim().length<3} onClick={() => run("Criando campanha...", async () => { const r = await request("/campaign/preview", "POST", { ...campaign, version: data.plan.version, requestId: campaignId.current }); setMessage(r.message); previewVersion.current = data.plan.version; setSavedCampaign(""); })}>Gerar texto com a base da empresa</Button>{message && <div className="space-y-3"><label className="block text-sm">Revise e edite o texto<Textarea rows={10} value={message} onChange={e => { setMessage(e.target.value); setSavedCampaign(""); campaignId.current=crypto.randomUUID(); }} /></label><Button disabled={!!busy || !!savedCampaign || !message.trim()} onClick={() => run("Salvando campanha...", async () => { const r = await request("/campaign/save", "POST", { ...campaign, message, version: previewVersion.current, requestId: campaignId.current }); setSavedCampaign(r.id); toast({ title: "Campanha salva como rascunho" }); })}>Salvar rascunho em Campanhas</Button>{savedCampaign && <p className="text-sm">Campanha salva. Revise os destinatários e o agendamento em <a className="underline" href="/campanhas">Campanhas</a>.</p>}</div>}</div>}
    {tab === "document" && <article className="space-y-6 rounded-xl border bg-card p-5"><h3 className="text-xl font-semibold">Plano de Negócios · versão {data.plan.version}</h3><Button variant="outline" onClick={exportPlan}>Baixar PN em HTML</Button><p className="text-sm text-muted-foreground">Visualização dos blocos aprovados. Hipóteses permanecem identificadas e não alimentam os agentes.</p>{data.sections.map(s => <section key={s.id}><h4 className="font-semibold">{s.title}</h4>{!data.plan.sections[s.id]?.approved.length && <p className="text-sm text-muted-foreground">Pendente de desenvolvimento e aprovação.</p>}{data.plan.sections[s.id]?.approved.map(r => <div key={r.id} className="mt-3 border-l-2 pl-4"><h5 className="font-medium">{r.title} {r.evidence === "hypothesis" ? "· Hipótese a validar" : ""}</h5>{Object.entries(r.values).map(([k,v]) => v && <p key={k} className="mt-2 whitespace-pre-wrap text-sm"><strong>{k}: </strong>{v}</p>)}<p className="mt-2 text-xs text-muted-foreground">Fonte: {r.source}</p></div>)}</section>)}<details><summary>Histórico recente</summary>{data.plan.history.slice().reverse().map((h,i)=><p key={i} className="mt-1 text-sm">{new Date(h.at).toLocaleString("pt-BR")} · {data.sections.find(s=>s.id===h.section)?.title} · {h.action === "approve" ? "Aprovado" : h.action === "revoke" ? "Revogado" : "Rascunho salvo"}</p>)}</details></article>}
    {busy && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{busy}</p>}
  </fieldset>;
}
