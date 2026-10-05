import { useState, useEffect, useRef } from "react";
import "./planner5d-reference.css";
import { useRoute } from "wouter";
import PortalOfficialRenderHistory from "./PortalOfficialRenderHistory";
import {
  MessageCircle, ImageIcon, DollarSign, Building2, ExternalLink,
  Download, ChevronDown, ChevronUp, Loader2, CheckCircle2, AlertCircle,
  Sparkles, HardHat, CalendarDays, Link2,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type Projeto = {
  id: string; titulo: string; clienteNome: string | null;
  tipoObra: string | null; areaM2: string | null;
  orcamentoTotal: string | null; arquitetoResponsavel: string | null;
  status: string;
  dealId?: string | null;
  pipelineStage?: string | null;
};
type Ambiente  = { id: string; nome: string; areaM2: string | null; ordem: number };
type OrcItem   = { id: string; ambienteId: string | null; categoria: string | null; descricao: string; quantidade: string | null; unidade: string | null; valorTotal: string | null };
type Cena      = { id: string; nome: string | null; renderUrl: string | null; status: string | null; ambienteId?: string | null };
type Tenant    = { name: string; nomeEmpresa: string | null; logoUrl: string | null; site: string | null };
type Obra = {
  id: string; nome: string; status: string;
  dataInicio: string | null; dataFimPrevista: string | null;
  orcamentoTotal: string | null; custoRealizado: string | null;
};
type EtapaObra = {
  id: string; nome: string; ordem: number; status: string;
  percentualExecutado: string | null;
  dataInicioPrevista: string | null; dataFimPrevista: string | null;
};
type PortalData = {
  projeto: Projeto; ambientes: Ambiente[]; orcamento: OrcItem[]; cenas: Cena[];
  tenant: Tenant | null; obra: Obra | null; etapas: EtapaObra[];
};

type LocalVersao = { id: string; imageUrl: string; versao: number; origem: "original" | "solicitacao" };
type ItemKey      = "sofa" | "mesa" | "cadeira" | "cama" | "armario" | "luminaria" | "janela" | "porta";
type SuperficieKey = "parede" | "piso" | "teto";
type MaterialKey  = "tinta" | "madeira" | "marmore" | "cimento";
type PosicaoKey   = "esquerda" | "centro" | "direita";
type SolStatus    = "idle" | "enviando" | "processando" | "concluido" | "erro";

// ── Config ─────────────────────────────────────────────────────────────────────
const ITENS_CONFIG: Array<{ key: ItemKey; label: string; emoji: string }> = [
  { key: "sofa",     label: "Sofá",          emoji: "🛋" },
  { key: "mesa",     label: "Mesa de centro", emoji: "☕" },
  { key: "cadeira",  label: "Cadeira",        emoji: "🪑" },
  { key: "cama",     label: "Cama",           emoji: "🛏" },
  { key: "armario",  label: "Armário",        emoji: "🗄" },
  { key: "luminaria",label: "Luminária",      emoji: "💡" },
  { key: "janela",   label: "Janela",         emoji: "🪟" },
  { key: "porta",    label: "Porta",          emoji: "🚪" },
];
const MATERIAIS: Array<{ key: MaterialKey; label: string }> = [
  { key: "tinta",   label: "Tinta lisa" },
  { key: "madeira", label: "Madeira"    },
  { key: "marmore", label: "Mármore"    },
  { key: "cimento", label: "Cimento"    },
];
const POSICOES: Array<{ key: PosicaoKey; label: string }> = [
  { key: "esquerda", label: "Esquerda" },
  { key: "centro",   label: "Centro"   },
  { key: "direita",  label: "Direita"  },
];
const SUPERFICIES: Array<{ key: SuperficieKey; label: string }> = [
  { key: "parede", label: "Parede" },
  { key: "piso",   label: "Piso"   },
  { key: "teto",   label: "Teto"   },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function getBase() { return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, ""); }
function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

async function downloadBlob(imageUrl: string, filename: string) {
  const base = getBase();
  const url = imageUrl.startsWith("http") ? imageUrl : `${base}${imageUrl}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(href);
  } catch {
    window.open(url, "_blank");
  }
}

const STATUS_LABEL: Record<string, string> = { briefing:"Briefing", orcamento:"Orçamento", aprovado:"Aprovado", em_execucao:"Em Execução", entregue:"Entregue", cancelado:"Cancelado" };
const STATUS_COLOR: Record<string, string> = { briefing:"bg-gray-100 text-gray-700", orcamento:"bg-blue-100 text-blue-700", aprovado:"bg-green-100 text-green-700", em_execucao:"bg-amber-100 text-amber-700", entregue:"bg-emerald-100 text-emerald-700", cancelado:"bg-red-100 text-red-700" };
const PIPELINE_LABEL: Record<string, string> = {
  lead: "Lead",
  qualificacao: "Qualificação",
  briefing: "Briefing",
  proposta: "Proposta",
  negociacao: "Negociação",
  fechado: "Fechado",
  ganho: "Ganho",
  execucao: "Execução",
  entregue: "Entregue",
};

// ── CenaCard ───────────────────────────────────────────────────────────────────
function CenaCard({ cena, projetoNome }: { cena: Cena; projetoNome: string }) {
  const base = getBase();

  const [versoes, setVersoes] = useState<LocalVersao[]>(() =>
    cena.renderUrl ? [{ id: "original", imageUrl: cena.renderUrl, versao: 1, origem: "original" }] : []
  );
  const [acordionOpen, setAcordionOpen] = useState(false);
  const [solStatus, setSolStatus] = useState<SolStatus>("idle");
  const [erroMsg, setErroMsg]     = useState<string | null>(null);
  const [novaImagem, setNovaImagem] = useState<string | null>(null);
  const [novaImagemVisible, setNovaImagemVisible] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [itens, setItens] = useState<Partial<Record<ItemKey, { posicao: PosicaoKey; cor: string }>>>({});
  const [texturas, setTexturas] = useState<Record<SuperficieKey, { material: MaterialKey; cor: string; ativo: boolean }>>({
    parede: { material: "tinta",   cor: "#F5F5F0", ativo: false },
    piso:   { material: "madeira", cor: "#8B6914", ativo: false },
    teto:   { material: "tinta",   cor: "#FFFFFF", ativo: false },
  });
  const [observacoes, setObservacoes] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  const versaoMaisRecente = versoes.length > 0
    ? versoes.reduce((acc, v) => v.versao > acc.versao ? v : acc)
    : null;

  function stopPolling() {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  }

  function startPolling(solId: string) {
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${base}/api/arch/cenas/${cena.id}/solicitacoes/${solId}/status`);
        if (!res.ok) return;
        const data = await res.json() as { status: string; imageUrl?: string };
        if (data.status === "concluido" && data.imageUrl) {
          stopPolling();
          const nextN = versoes.length + 1;
          const nova: LocalVersao = { id: `sol-${Date.now()}`, imageUrl: data.imageUrl, versao: nextN, origem: "solicitacao" };
          setVersoes(prev => [...prev, nova]);
          setNovaImagem(data.imageUrl);
          setSolStatus("concluido");
          setTimeout(() => setNovaImagemVisible(true), 50);
        } else if (data.status === "erro") {
          stopPolling();
          setSolStatus("erro");
          setErroMsg("Erro ao gerar o render. Tente novamente.");
        }
      } catch { /* ignore */ }
    }, 5000);
  }

  async function handleDownload(v: LocalVersao) {
    setDownloading(v.id);
    const slug = projetoNome.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    await downloadBlob(v.imageUrl, `render-${slug}-v${v.versao}.png`);
    setDownloading(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErroMsg(null);
    const itensAdicionados = (Object.entries(itens) as Array<[ItemKey, { posicao: PosicaoKey; cor: string }]>)
      .map(([tipo, v]) => ({ tipo, posicao: v.posicao, cor: v.cor }));
    const texturasAlteradas = (Object.entries(texturas) as Array<[SuperficieKey, { material: MaterialKey; cor: string; ativo: boolean }]>)
      .filter(([, v]) => v.ativo)
      .map(([superficie, v]) => ({ superficie, material: v.material, cor: v.cor }));

    if (itensAdicionados.length === 0 && texturasAlteradas.length === 0) {
      setErroMsg("Selecione pelo menos 1 item ou 1 textura para personalizar.");
      return;
    }

    setSolStatus("enviando");
    try {
      const res = await fetch(`${base}/api/arch/cenas/${cena.id}/solicitacoes`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itensAdicionados, texturasAlteradas, observacoes: observacoes.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Erro ao enviar solicitação");
      }
      const data = await res.json() as { solicitacaoId: string };
      setSolStatus("processando");
      setNovaImagemVisible(false);
      startPolling(data.solicitacaoId);
    } catch (err: unknown) {
      setSolStatus("erro");
      setErroMsg(err instanceof Error ? err.message : "Erro ao enviar.");
    }
  }

  function resetForm() {
    setSolStatus("idle"); setErroMsg(null); setNovaImagem(null); setNovaImagemVisible(false); setItens({});
    setTexturas({
      parede: { material: "tinta", cor: "#F5F5F0", ativo: false },
      piso: { material: "madeira", cor: "#8B6914", ativo: false },
      teto: { material: "tinta", cor: "#FFFFFF", ativo: false },
    });
    setObservacoes("");
  }

  const isProcessing = solStatus === "enviando" || solStatus === "processando";

  return (
    <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
      {cena.nome && (
        <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-violet-500 shrink-0" />
          <p className="font-semibold text-sm text-gray-700">{cena.nome}</p>
        </div>
      )}
      <div className="relative">
        {versaoMaisRecente ? (
          <img src={versaoMaisRecente.imageUrl.startsWith("/api") ? `${base}${versaoMaisRecente.imageUrl}` : versaoMaisRecente.imageUrl} alt={cena.nome ?? "Render"} className="w-full aspect-video object-cover" />
        ) : (
          <div className="w-full aspect-video bg-gray-100 flex flex-col items-center justify-center gap-2 text-gray-400">
            <ImageIcon className="h-10 w-10" /><p className="text-sm">Render ainda não disponível</p>
          </div>
        )}
        {versaoMaisRecente && (
          <span className="absolute top-3 left-3 bg-black/50 text-white text-xs rounded-full px-2.5 py-0.5 font-medium backdrop-blur-sm">
            {versaoMaisRecente.origem === "original" ? "Original" : `Versão ${versaoMaisRecente.versao}`}
          </span>
        )}
        {versaoMaisRecente && (
          <button onClick={() => handleDownload(versaoMaisRecente)} disabled={downloading === versaoMaisRecente.id} className="absolute top-3 right-3 inline-flex items-center gap-1.5 bg-white/90 hover:bg-white text-gray-800 text-xs font-medium rounded-lg px-3 py-1.5 shadow-sm transition-colors disabled:opacity-60 backdrop-blur-sm">
            {downloading === versaoMaisRecente.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Baixar
          </button>
        )}
      </div>

      {versoes.length > 1 && (
        <div className="border-t">
          <button onClick={() => setAcordionOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <span className="font-medium">Histórico de versões ({versoes.length})</span>
            {acordionOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {acordionOpen && (
            <div className="px-5 pb-4"><div className="flex gap-3 overflow-x-auto pb-1">
              {[...versoes].reverse().map(v => (
                <div key={v.id} className="shrink-0 w-32 group relative">
                  <img src={v.imageUrl.startsWith("/api") ? `${base}${v.imageUrl}` : v.imageUrl} alt={`Versão ${v.versao}`} className="w-32 h-20 object-cover rounded-lg border" />
                  <span className="absolute top-1.5 left-1.5 bg-black/50 text-white text-[10px] rounded-full px-1.5 py-0.5 font-medium">{v.versao === 1 ? "Original" : `V${v.versao}`}</span>
                  <button onClick={() => handleDownload(v)} disabled={downloading === v.id} className="absolute top-1.5 right-1.5 bg-white/80 hover:bg-white rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {downloading === v.id ? <Loader2 className="h-3 w-3 animate-spin text-gray-600" /> : <Download className="h-3 w-3 text-gray-600" />}
                  </button>
                  <p className="text-[11px] text-gray-500 mt-1 text-center truncate">{v.origem === "original" ? "Original" : `Versão ${v.versao}`}</p>
                </div>
              ))}
            </div></div>
          )}
        </div>
      )}

      {solStatus === "concluido" && novaImagem && (
        <div className={`border-t p-5 transition-opacity duration-700 ${novaImagemVisible ? "opacity-100" : "opacity-0"}`}>
          <div className="flex items-center gap-2 mb-3"><CheckCircle2 className="h-4 w-4 text-emerald-500" /><p className="font-semibold text-sm text-emerald-700">Seu render personalizado está pronto!</p></div>
          <img src={novaImagem.startsWith("/api") ? `${base}${novaImagem}` : novaImagem} alt="Nova versão" className="w-full rounded-xl border" />
          <div className="flex gap-3 mt-3">
            <button onClick={() => handleDownload(versoes[versoes.length - 1]!)} className="flex-1 inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"><Download className="h-4 w-4" /> Baixar nova versão</button>
            <button onClick={resetForm} className="inline-flex items-center gap-2 border rounded-lg px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Nova solicitação</button>
          </div>
        </div>
      )}

      {solStatus !== "concluido" && (
        <form onSubmit={handleSubmit} className="border-t p-5 space-y-6">
          <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-500" /><h3 className="font-semibold text-sm text-gray-800">Personalizar este ambiente</h3></div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">1. Adicionar itens</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ITENS_CONFIG.map(item => {
                const selecionado = !!itens[item.key];
                return (
                  <div key={item.key} className={`rounded-xl border p-2.5 transition-colors ${selecionado ? "border-violet-400 bg-violet-50" : "border-gray-200 bg-white"}`}>
                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                      <input type="checkbox" checked={selecionado} onChange={e => {
                        if (e.target.checked) setItens(prev => ({ ...prev, [item.key]: { posicao: "centro", cor: "#6B7280" } }));
                        else setItens(prev => { const next = { ...prev }; delete next[item.key]; return next; });
                      }} className="rounded text-violet-600 focus:ring-violet-500" />
                      <span className="text-sm">{item.emoji} {item.label}</span>
                    </label>
                    {selecionado && (
                      <div className="space-y-1.5 pl-5">
                        <select value={itens[item.key]!.posicao} onChange={e => setItens(prev => ({ ...prev, [item.key]: { ...prev[item.key]!, posicao: e.target.value as PosicaoKey } }))} className="w-full rounded-lg border border-gray-200 text-xs px-2 py-1 focus:ring-1 focus:ring-violet-400 outline-none">
                          {POSICOES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                        </select>
                        <div className="flex items-center gap-1.5">
                          <input type="color" value={itens[item.key]!.cor} onChange={e => setItens(prev => ({ ...prev, [item.key]: { ...prev[item.key]!, cor: e.target.value } }))} className="h-6 w-8 rounded border-0 cursor-pointer p-0" />
                          <span className="text-[11px] text-gray-400">{itens[item.key]!.cor}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">2. Alterar texturas</p>
            <div className="space-y-2">
              {SUPERFICIES.map(sup => {
                const t = texturas[sup.key];
                return (
                  <div key={sup.key} className={`rounded-xl border p-3 transition-colors ${t.ativo ? "border-violet-400 bg-violet-50" : "border-gray-200"}`}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={t.ativo} onChange={e => setTexturas(prev => ({ ...prev, [sup.key]: { ...prev[sup.key], ativo: e.target.checked } }))} className="rounded text-violet-600 focus:ring-violet-500" />
                      <span className="text-sm font-medium text-gray-700 w-16">{sup.label}</span>
                      {t.ativo && (
                        <div className="flex items-center gap-2 ml-auto">
                          <select value={t.material} onChange={e => setTexturas(prev => ({ ...prev, [sup.key]: { ...prev[sup.key], material: e.target.value as MaterialKey } }))} className="rounded-lg border border-gray-200 text-xs px-2 py-1 focus:ring-1 focus:ring-violet-400 outline-none">
                            {MATERIAIS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                          </select>
                          <input type="color" value={t.cor} onChange={e => setTexturas(prev => ({ ...prev, [sup.key]: { ...prev[sup.key], cor: e.target.value } }))} className="h-7 w-9 rounded border-0 cursor-pointer p-0" />
                        </div>
                      )}
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">3. Observações (opcional)</p>
            <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Ex: quero um estilo mais aconchegante, tons terrosos..." rows={3} className="w-full rounded-xl border border-gray-200 text-sm px-3 py-2.5 focus:ring-1 focus:ring-violet-400 outline-none resize-none" />
          </div>

          {erroMsg && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3"><AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" /><p className="text-sm text-red-700">{erroMsg}</p></div>
          )}
          {isProcessing && (
            <div className="flex items-center gap-3 rounded-xl bg-violet-50 border border-violet-200 px-4 py-4"><Loader2 className="h-5 w-5 text-violet-600 animate-spin shrink-0" /><div><p className="text-sm font-medium text-violet-700">Gerando seu render personalizado...</p><p className="text-xs text-violet-500 mt-0.5">Isso pode levar 1 minuto. Aguarde.</p></div></div>
          )}
          {!isProcessing && (
            <button type="submit" className="w-full inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl px-5 py-3 font-semibold text-sm transition-colors disabled:opacity-50"><Sparkles className="h-4 w-4" /> Gerar nova versão</button>
          )}
        </form>
      )}
    </div>
  );
}

export default function PortalCliente() {
  const [, params] = useRoute("/arch/portal/:token");
  const token = params?.token ?? "";
  const [data, setData]         = useState<PortalData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/arch/portal/${token}`)
      .then(async res => {
        if (!res.ok) { setNotFound(true); setLoading(false); return; }
        setData(await res.json()); setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [token]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin h-8 w-8 border-4 border-violet-600 border-t-transparent rounded-full" /></div>;
  if (notFound || !data) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <Building2 className="h-14 w-14 text-gray-300 mb-4" /><h1 className="text-xl font-bold text-gray-700">Projeto não disponível</h1>
      <p className="text-gray-500 mt-2 max-w-sm">Este link não está mais ativo ou o projeto foi desativado. Entre em contato com o arquiteto responsável.</p>
    </div>
  );

  const { projeto, ambientes, orcamento, cenas, tenant, obra, etapas } = data;
  const tenantNome = tenant?.nomeEmpresa ?? tenant?.name ?? "Arquiteto";
  const byAmbiente: Record<string, { nome: string; itens: OrcItem[]; total: number }> = {};
  for (const item of orcamento) {
    const key = item.ambienteId ?? "__sem__";
    const ambNome = ambientes.find(a => a.id === item.ambienteId)?.nome ?? "Geral";
    if (!byAmbiente[key]) byAmbiente[key] = { nome: ambNome, itens: [], total: 0 };
    byAmbiente[key].itens.push(item);
    byAmbiente[key].total += Number(item.valorTotal ?? 0);
  }
  const totalGeral = orcamento.reduce((acc, i) => acc + Number(i.valorTotal ?? 0), 0);

  return (
    <div className="arqdor-reference-ui min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {tenant?.logoUrl ? (
              <img src={tenant.logoUrl.startsWith("/api") ? `${getBase()}${tenant.logoUrl}` : tenant.logoUrl} alt={tenantNome} className="h-9 w-9 rounded-full object-cover border" />
            ) : (
              <div className="h-9 w-9 rounded-full bg-violet-100 flex items-center justify-center"><Building2 className="h-4 w-4 text-violet-600" /></div>
            )}
            <div>
              <p className="font-semibold text-sm leading-tight">{tenantNome}</p>
              {tenant?.site && <a href={tenant.site} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-600 hover:underline flex items-center gap-0.5">{tenant.site.replace(/^https?:\/\//, "")} <ExternalLink className="h-2.5 w-2.5" /></a>}
            </div>
          </div>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLOR[projeto.status] ?? "bg-gray-100 text-gray-700"}`}>{STATUS_LABEL[projeto.status] ?? projeto.status}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-10">
        <section>
          <h1 className="text-3xl font-bold tracking-tight">{projeto.titulo}</h1>
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm text-gray-600">
            {projeto.clienteNome && <span>👤 {projeto.clienteNome}</span>}
            {projeto.tipoObra && <span>🏗 {projeto.tipoObra}</span>}
            {projeto.areaM2 && <span>📐 {Number(projeto.areaM2).toFixed(0)} m²</span>}
            {projeto.arquitetoResponsavel && <span>🎨 {projeto.arquitetoResponsavel}</span>}
          </div>
        </section>

        {(projeto.dealId || projeto.pipelineStage) && (
          <section className="rounded-2xl border border-violet-100 bg-white p-4 sm:p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                  <Link2 className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Acompanhamento comercial</p>
                  <p className="text-sm font-semibold text-gray-900 mt-0.5">
                    {projeto.dealId ? "Projeto conectado ao seu atendimento" : "Acompanhamento do projeto"}
                  </p>
                </div>
              </div>
              {projeto.pipelineStage && (
                <span className="inline-flex items-center rounded-full bg-violet-50 text-violet-700 px-3 py-1 text-xs font-medium">
                  {PIPELINE_LABEL[projeto.pipelineStage] ?? projeto.pipelineStage}
                </span>
              )}
            </div>
            <p className="mt-3 text-xs sm:text-sm text-gray-500">
              Briefing, projeto, orçamento, proposta e execução permanecem vinculados ao mesmo atendimento, sem duplicar o cadastro do cliente.
            </p>
          </section>
        )}

        {obra && (
          <section className="rounded-2xl border bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                  <HardHat className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Execução da obra</p>
                  <h2 className="text-lg font-semibold text-gray-900 mt-0.5">{obra.nome}</h2>
                </div>
              </div>
              <span className="inline-flex rounded-full bg-amber-50 text-amber-700 px-3 py-1 text-xs font-medium">
                {obra.status === "em_andamento" ? "Em andamento" : obra.status === "concluida" ? "Concluída" : "Planejamento"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Progresso geral</p>
                <p className="text-xl font-bold text-gray-900 mt-1">
                  {etapas.length
                    ? Math.round(etapas.reduce((acc, etapa) => acc + Number(etapa.percentualExecutado ?? 0), 0) / etapas.length)
                    : 0}%
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Etapas</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{etapas.length}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Previsão</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">
                  {obra.dataFimPrevista ? new Date(`${obra.dataFimPrevista}T12:00:00`).toLocaleDateString("pt-BR") : "A definir"}
                </p>
              </div>
            </div>

            {etapas.length > 0 && (
              <div className="mt-5 space-y-3">
                {etapas.map((etapa) => {
                  const pct = Math.max(0, Math.min(100, Number(etapa.percentualExecutado ?? 0)));
                  return (
                    <div key={etapa.id}>
                      <div className="flex items-center justify-between gap-3 text-sm mb-1.5">
                        <span className="font-medium text-gray-700">{etapa.nome}</span>
                        <span className="text-gray-500">{Math.round(pct)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {(obra.dataInicio || obra.dataFimPrevista) && (
              <div className="mt-5 pt-4 border-t flex flex-wrap gap-4 text-xs text-gray-500">
                {obra.dataInicio && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Início {new Date(`${obra.dataInicio}T12:00:00`).toLocaleDateString("pt-BR")}
                  </span>
                )}
                {obra.dataFimPrevista && (
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Previsão {new Date(`${obra.dataFimPrevista}T12:00:00`).toLocaleDateString("pt-BR")}
                  </span>
                )}
              </div>
            )}
          </section>
        )}

        <PortalOfficialRenderHistory token={token} cenas={cenas} />

        {cenas.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5"><ImageIcon className="h-5 w-5 text-violet-600" /><h2 className="text-lg font-semibold">Renders 3D</h2><span className="text-sm text-gray-500">({cenas.length})</span></div>
            <div className="space-y-6">{cenas.map(cena => <CenaCard key={cena.id} cena={cena} projetoNome={projeto.titulo} />)}</div>
          </section>
        )}

        {orcamento.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4"><DollarSign className="h-5 w-5 text-violet-600" /><h2 className="text-lg font-semibold">Orçamento</h2></div>
            <div className="space-y-4">
              {Object.values(byAmbiente).map(grupo => (
                <div key={grupo.nome} className="rounded-xl border bg-white overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between"><p className="font-semibold text-sm">{grupo.nome}</p><p className="font-bold text-sm text-violet-700">{fmt(grupo.total)}</p></div>
                  <table className="w-full text-sm"><tbody className="divide-y divide-gray-50">
                    {grupo.itens.map(item => (
                      <tr key={item.id}><td className="px-4 py-2.5"><p className="font-medium text-gray-800">{item.descricao}</p>{item.categoria && <p className="text-xs text-gray-400">{item.categoria}</p>}</td><td className="px-4 py-2.5 text-right text-gray-500 text-xs whitespace-nowrap">{item.quantidade} {item.unidade}</td></tr>
                    ))}
                  </tbody></table>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl bg-violet-600 text-white px-6 py-4 flex items-center justify-between">
              <div><p className="text-violet-200 text-sm">Investimento total estimado</p><p className="text-3xl font-bold mt-0.5">{fmt(totalGeral)}</p></div>
              <DollarSign className="h-10 w-10 text-violet-300 opacity-60" />
            </div>
          </section>
        )}

        <section className="rounded-xl border bg-white p-6 text-center space-y-3">
          <MessageCircle className="h-10 w-10 mx-auto text-green-500" />
          <div><p className="font-semibold text-lg">Tem alguma dúvida?</p><p className="text-gray-500 text-sm mt-1">{projeto.arquitetoResponsavel ? `Entre em contato com ${projeto.arquitetoResponsavel}` : "Entre em contato com o arquiteto responsável"}</p></div>
          <a href={`https://wa.me/?text=${encodeURIComponent(`Olá! Tenho uma dúvida sobre o projeto "${projeto.titulo}". Pode me ajudar?`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-green-500 text-white rounded-lg px-5 py-2.5 font-medium hover:bg-green-600 transition-colors"><MessageCircle className="h-4 w-4" /> Falar com {projeto.arquitetoResponsavel ?? "o arquiteto"}</a>
        </section>

        <footer className="text-center text-xs text-gray-400 pb-4">Portal gerado por <span className="font-medium text-gray-500">VendorAI</span></footer>
      </main>
    </div>
  );
}
