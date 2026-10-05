import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute, useSearch } from "wouter";
import {
  TAB_VALUES,
  type TabId,
  tokenStorageKey,
  obraStorageKey,
  resolveTabPreference,
  saveTabPreference,
} from "../lib/portalTabStorage";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Clock,
  FileText,
  HardHat,
  Layers,
  Loader2,
  MapPin,
  Sparkles,
  ThumbsUp,
} from "lucide-react";
import PortalClientDecisions from "./PortalClientDecisions";
import { PortalAgenda, PortalBriefing, PortalNextActions, PortalPostSale, PortalSearch, PortalVendi } from "./PortalObraJourneySuite";
import {
  PortalAuthGate,
  PortalCommercial,
  PortalDocumentLibrary,
  PortalExecutiveBalance,
  PortalSupportChat,
  portalSessionKey,
} from "./PortalObraPrivateSuite";

const API = "/api";

function fmt(d?: string | null) {
  if (!d) return "—";
  try {
    const value = String(d);
    return format(parseISO(value.includes("T") ? value : `${value}T12:00:00`), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return String(d);
  }
}

function fmtMoney(v?: string | number | null) {
  if (v == null || v === "") return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pct(a?: string | null, b?: string | null) {
  if (!a || !b) return null;
  const total = parseFloat(b);
  if (!total) return null;
  return Math.min(100, Math.round((parseFloat(a) / total) * 100));
}

type Decision = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  priority?: string | null;
  due_date?: string | null;
  options?: string[] | null;
  financial_impact?: string | number | null;
  schedule_impact_days?: number | null;
};

type Publication = {
  showOverview?: boolean;
  showSchedule?: boolean;
  showBudget?: boolean;
  showDiary?: boolean;
  showDiaryPhotos?: boolean;
  showFinancialSummary?: boolean;
  showFinancialDetails?: boolean;
  showClientDecisions?: boolean;
  showMeasurements?: boolean;
  showMilestones?: boolean;
  showDocuments?: boolean;
  showProcurementSummary?: boolean;
  showProjectGallery?: boolean;
  requireLogin?: boolean;
  allowSelfRegistration?: boolean;
  showExecutiveBalance?: boolean;
  showProposals?: boolean;
  showContracts?: boolean;
  showInvoices?: boolean;
  showManuals?: boolean;
  showSupport?: boolean;
  showChat?: boolean;
  showBriefing?: boolean;
  showAgenda?: boolean;
  showSearch?: boolean;
  showPostSale?: boolean;
  showVendi?: boolean;
};

interface PortalData {
  publication?: Publication;
  locked?: boolean;
  auth?: {
    required: boolean;
    authenticated: boolean;
    allowSelfRegistration: boolean;
    user?: { id: string; nome: string; email: string; telefone?: string | null } | null;
  };
  obra: {
    id: string;
    nome: string;
    descricao?: string | null;
    clienteNome?: string | null;
    endereco?: string | null;
    status: string;
    dataInicio?: string | null;
    dataFimPrevista?: string | null;
    dataFimReal?: string | null;
    orcamentoTotal?: string | null;
    custoRealizado?: string | null;
  };
  tenant: { id: string; name: string };
  orcamento: {
    id: string;
    status: string;
    versao: number;
    titulo?: string | null;
    propostaOrigemId?: string | null;
    linhaBaseSnapshot?: {
      propostaId?: string;
      numero?: string | null;
      acceptedAt?: string | null;
      valorTotal?: string | number | null;
      apresentacao?: {
        entradaPercentual?: number;
        amortizacaoEntradaPercentual?: number;
        mostrarAmortizacaoEntrada?: boolean;
        mostrarPortalCliente?: boolean;
        previsaoInicio?: string;
        mostrarCronogramaExecucao?: boolean;
        mostrarFisicoFinanceiro?: boolean;
      } | null;
    } | null;
    bdiGlobal: string;
    etapas: Array<{
      id: string;
      nome: string;
      ordem: number;
      itens: Array<{
        id: string;
        nome: string;
        unidade: string;
        quantidade: string;
        custoUnitario: string;
        bdi?: string | null;
        ordem: number;
      }>;
    }>;
  } | null;
  etapas: Array<{
    id: string;
    nome: string;
    ordem: number;
    status: string;
    percentualExecutado: string;
    responsavel?: string | null;
    dataInicioPrevista?: string | null;
    dataFimPrevista?: string | null;
    custoPrevisto?: string | null;
    pesoFisico?: string | null;
  }>;
  fases?: Array<{
    id: string;
    etapa_id: string;
    nome: string;
    ordem: number;
    status: string;
    percentual_etapa: string | number;
    percentual_executado: string | number;
    custo_previsto: string | number;
    data_inicio_prevista?: string | null;
    data_fim_prevista?: string | null;
  }>;
  diario: Array<{
    id: string;
    data: string;
    conteudo: string;
    responsavelNome?: string | null;
    climaTempo?: string | null;
    maoDeObra?: number | null;
    observacoes?: string | null;
    fotos?: Array<{ url: string; caption?: string; uploadedAt?: string }> | null;
    status: string;
  }>;
  ocorrencias: Array<{
    id: string;
    data: string;
    observacoes: string;
    status: string;
    responsavelNome?: string | null;
  }>;
  decisions?: Decision[];
  resumo?: {
    progressoGeral: number;
    etapaAtual?: any | null;
    proximasEtapas: any[];
    previsaoEntrega?: string | null;
    etapasConcluidas: number;
    totalEtapas: number;
    decisoesPendentes: number;
    ocorrenciasAbertas: number;
  } | null;
  marcos?: Array<any>;
  medicoes?: Array<{
    id: string;
    etapa_id: string;
    etapa_nome: string;
    data: string;
    percentual_anterior: string | number;
    percentual_novo: string | number;
    fase_id?: string | null;
    fase_nome?: string | null;
    valor_bruto?: string | number | null;
    amortizacao_entrada?: string | number | null;
    valor_liquido?: string | number | null;
    saldo_entrada_apos?: string | number | null;
    observacao?: string | null;
  }>;
  documentos?: Array<{ id: string; nome: string; url: string; mimeType?: string | null; data?: string | null; tipo?: string }>;
  compras?: Array<{
    id: string;
    descricao: string;
    fornecedor?: string | null;
    status: string;
    prioridade?: string | null;
    data_prevista?: string | null;
    data_efetuada?: string | null;
    data_necessidade?: string | null;
    prazo_fornecedor_dias?: number | null;
    valor_total?: string | number | null;
    etapa_nome?: string | null;
  }>;
  financeiro?: {
    orcamentoTotal: number;
    custoRealizado: number;
    percentualConsumido: number;
    totalLancado?: number | null;
    totalPago?: number | null;
    totalPendente?: number | null;
    lancamentos: Array<any>;
  } | null;
  galeriaProjeto?: Array<{
    id: string;
    ambiente?: string | null;
    material_name?: string | null;
    result_image_url: string;
    version_tag?: string | null;
    approved_at?: string | null;
    approval_note?: string | null;
    created_at?: string | null;
  }>;
  fotosRecentes?: Array<{ id: string; diarioId: string; data: string; url: string; caption?: string | null }>;
  executiveBalance?: any;
  commercial?: any;
  contracts?: any[];
  manuals?: any[];
  projectDocuments?: any[];
  invoices?: any[];
  supportTickets?: any[];
  chatMessages?: any[];
  briefing?: any | null;
  agenda?: any[];
  nextActions?: any[];
  postSale?: any | null;
}

const OBRA_STATUS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  planejamento: { label: "Planejamento", color: "bg-slate-100 text-slate-700", icon: <Clock className="h-4 w-4" /> },
  em_andamento: { label: "Em andamento", color: "bg-blue-100 text-blue-700", icon: <HardHat className="h-4 w-4" /> },
  concluida: { label: "Concluída", color: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 className="h-4 w-4" /> },
  suspensa: { label: "Suspensa", color: "bg-amber-100 text-amber-700", icon: <AlertTriangle className="h-4 w-4" /> },
};

const ETAPA_STATUS: Record<string, { label: string; color: string; bar: string }> = {
  pendente: { label: "Não iniciada", color: "bg-slate-100 text-slate-600", bar: "#94a3b8" },
  em_andamento: { label: "Em andamento", color: "bg-indigo-100 text-indigo-700", bar: "#6366f1" },
  concluida: { label: "Concluída", color: "bg-emerald-100 text-emerald-700", bar: "#10b981" },
  pausada: { label: "Pausada", color: "bg-amber-100 text-amber-700", bar: "#f59e0b" },
};

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 flex items-center gap-2 border-b border-gray-200 pb-2 text-lg font-semibold text-gray-800">
        <span className="text-indigo-600">{icon}</span>{title}
      </h2>
      {children}
    </section>
  );
}

function InfoGrid({ items }: { items: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      {items.map(({ label, value }) => (
        <div key={label} className="rounded-lg bg-gray-50 p-3">
          <p className="mb-0.5 text-xs text-gray-500">{label}</p>
          <p className="text-sm font-medium text-gray-900">{value || "—"}</p>
        </div>
      ))}
    </div>
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }} /></div>;
}

function tabFromSearch(search: string): TabId {
  const t = new URLSearchParams(search).get("tab");
  return TAB_VALUES.includes(t as TabId) ? (t as TabId) : "dados";
}

export default function PortalObra() {
  const [, params] = useRoute("/portal/obra/:token");
  const token = params?.token ?? "";
  const [, navigate] = useLocation();
  const search = useSearch();
  const tokenKey = tokenStorageKey(token);

  const [data, setData] = useState<PortalData | null>(null);
  const [portalSession, setPortalSession] = useState<string>(() => {
    try { return localStorage.getItem(portalSessionKey(token)) ?? ""; } catch { return ""; }
  });
  const [forceAuth, setForceAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [expandedDiario, setExpandedDiario] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [activeObraKey, setActiveObraKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const fromUrl = tabFromSearch(search);
    if (fromUrl !== "dados") return fromUrl;
    try {
      const saved = localStorage.getItem(tokenKey);
      return TAB_VALUES.includes(saved as TabId) ? (saved as TabId) : "dados";
    } catch { return "dados"; }
  });

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (!params.has("tab")) return;
    const tab = tabFromSearch(search);
    setActiveTab(tab);
    saveTabPreference(activeObraKey ?? tokenKey, tab);
  }, [search, activeObraKey, tokenKey]);

  function handleTabChange(tab: TabId) {
    if (tab === activeTab) return;
    saveTabPreference(activeObraKey ?? tokenKey, tab);
    const p = new URLSearchParams(search);
    p.set("tab", tab);
    navigate(`/portal/obra/${token}?${p.toString()}`);
  }

  async function loadPortal(sessionToken = portalSession) {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/portal/obra/${token}`, {
        headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : undefined,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "Erro ao carregar o portal.");
      setData(d);
      const obraKey = obraStorageKey(d.obra.id);
      setActiveObraKey(obraKey);
      const migratedTab = resolveTabPreference(token, d.obra.id);
      if (migratedTab && !new URLSearchParams(search).has("tab")) {
        setActiveTab(migratedTab);
        const p = new URLSearchParams(search);
        p.set("tab", migratedTab);
        navigate(`/portal/obra/${token}?${p.toString()}`, { replace: true });
      }
    } catch (e: any) {
      setError(e instanceof Error ? e.message : "Erro ao carregar o portal.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPortal(portalSession);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAprovar() {
    setApproving(true);
    try {
      const r = await fetch(`${API}/portal/obra/${token}/aprovar-orcamento`, { method: "POST" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setApproved(true);
      setData((d) => d ? { ...d, orcamento: d.orcamento ? { ...d.orcamento, status: "aprovado" } : null } : d);
    } catch (e: any) {
      alert(e.message ?? "Erro ao aprovar orçamento.");
    } finally { setApproving(false); }
  }

  const visibleTabs = useMemo(() => {
    const p = data?.publication ?? {};
    return [
      p.showOverview !== false ? { id: "dados" as const, label: "Visão Geral", icon: <Building2 className="h-4 w-4" /> } : null,
      p.showBriefing !== false ? { id: "briefing" as const, label: "Briefing", icon: <FileText className="h-4 w-4" /> } : null,
      p.showAgenda !== false ? { id: "agenda" as const, label: "Agenda", icon: <Calendar className="h-4 w-4" /> } : null,
      p.showExecutiveBalance !== false ? { id: "executivo" as const, label: "Balanço Executivo", icon: <CircleDollarSign className="h-4 w-4" /> } : null,
      p.showSchedule !== false ? { id: "cronograma" as const, label: "Cronograma", icon: <Layers className="h-4 w-4" /> } : null,
      p.showMeasurements !== false && p.showSchedule !== false ? { id: "medicoes" as const, label: "Medições", icon: <CheckCircle2 className="h-4 w-4" /> } : null,
      p.showProposals !== false ? { id: "propostas" as const, label: "Propostas", icon: <CircleDollarSign className="h-4 w-4" /> } : null,
      p.showDiary !== false ? { id: "diario" as const, label: "Diário", icon: <FileText className="h-4 w-4" /> } : null,
      p.showProjectGallery !== false || p.showDiaryPhotos !== false ? { id: "galeria" as const, label: "Fotos", icon: <Camera className="h-4 w-4" /> } : null,
      p.showDocuments !== false ? { id: "projetos" as const, label: "Projetos", icon: <FileText className="h-4 w-4" /> } : null,
      p.showContracts !== false ? { id: "contratos" as const, label: "Contratos", icon: <FileText className="h-4 w-4" /> } : null,
      p.showDocuments !== false ? { id: "documentos" as const, label: "Anexos", icon: <FileText className="h-4 w-4" /> } : null,
      p.showManuals !== false ? { id: "manuais" as const, label: "Manuais", icon: <FileText className="h-4 w-4" /> } : null,
      p.showInvoices !== false ? { id: "notas" as const, label: "Notas Fiscais", icon: <FileText className="h-4 w-4" /> } : null,
      p.showProcurementSummary !== false ? { id: "compras" as const, label: "Compras", icon: <Layers className="h-4 w-4" /> } : null,
      p.showFinancialSummary === true ? { id: "financeiro" as const, label: "Financeiro", icon: <CircleDollarSign className="h-4 w-4" /> } : null,
      p.showBudget !== false ? { id: "orcamento" as const, label: "Orçamento", icon: <CircleDollarSign className="h-4 w-4" /> } : null,
      p.showPostSale !== false ? { id: "entrega" as const, label: "Entrega & Pós-venda", icon: <CheckCircle2 className="h-4 w-4" /> } : null,
      p.showVendi !== false ? { id: "vendi" as const, label: "Vendi", icon: <Sparkles className="h-4 w-4" /> } : null,
      p.showSupport !== false ? { id: "suporte" as const, label: "Suporte", icon: <FileText className="h-4 w-4" /> } : null,
      p.showChat !== false ? { id: "chat" as const, label: "Chat", icon: <FileText className="h-4 w-4" /> } : null,
    ].filter(Boolean) as Array<{ id: TabId; label: string; icon: React.ReactNode }>;
  }, [data?.publication]);

  useEffect(() => {
    if (!data || visibleTabs.some((tab) => tab.id === activeTab)) return;
    const next = visibleTabs[0]?.id ?? "dados";
    setActiveTab(next);
  }, [data, visibleTabs, activeTab]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-gray-50"><div className="text-center"><Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-indigo-600" /><p className="text-sm text-gray-500">Carregando portal…</p></div></div>;
  if (data?.locked || forceAuth) return <PortalAuthGate
    token={token}
    tenantName={data.tenant?.name ?? "Empresa"}
    obraName={data.obra?.nome ?? "Portal do Cliente"}
    allowRegistration={data.auth?.allowSelfRegistration !== false}
    onAuthenticated={(sessionToken) => {
      setPortalSession(sessionToken);
      setForceAuth(false);
      void loadPortal(sessionToken);
    }}
  />;
  if (error || !data) return <div className="flex min-h-screen items-center justify-center bg-gray-50"><div className="max-w-sm text-center"><Building2 className="mx-auto mb-4 h-12 w-12 text-gray-300" /><h1 className="mb-2 text-xl font-semibold text-gray-700">Portal não encontrado</h1><p className="text-sm text-gray-500">{error ?? "Verifique o link enviado pela construtora."}</p></div></div>;

  const { obra, tenant, orcamento, etapas, diario, ocorrencias } = data;
  const fases = data.fases ?? [];
  const decisions = data.decisions ?? [];
  const resumo = data.resumo;
  const marcos = data.marcos ?? [];
  const medicoes = data.medicoes ?? [];
  const documentos = data.documentos ?? [];
  const compras = data.compras ?? [];
  const financeiro = data.financeiro;
  const galeriaProjeto = data.galeriaProjeto ?? [];
  const fotosRecentes = data.fotosRecentes ?? [];
  const executiveBalance = data.executiveBalance;
  const commercial = data.commercial;
  const contracts = data.contracts ?? [];
  const manuals = data.manuals ?? [];
  const projectDocuments = data.projectDocuments ?? [];
  const invoices = data.invoices ?? [];
  const supportTickets = data.supportTickets ?? [];
  const chatMessages = data.chatMessages ?? [];
  const briefing = data.briefing ?? null;
  const agenda = data.agenda ?? [];
  const nextActions = data.nextActions ?? [];
  const postSale = data.postSale ?? null;
  const obraStatus = OBRA_STATUS[obra.status] ?? { label: obra.status, color: "bg-gray-100 text-gray-600", icon: null };
  const totalEtapas = etapas.length;
  const avgProgress = Math.round(resumo?.progressoGeral ?? (totalEtapas > 0 ? etapas.reduce((s, e) => s + parseFloat(e.percentualExecutado ?? "0"), 0) / totalEtapas : 0));
  const bdiGlobal = orcamento ? parseFloat(orcamento.bdiGlobal ?? "0") : 0;
  const itemTotal = (item: NonNullable<PortalData["orcamento"]>["etapas"][0]["itens"][0]) => parseFloat(item.quantidade) * parseFloat(item.custoUnitario) * (1 + (item.bdi != null ? parseFloat(item.bdi) : bdiGlobal) / 100);
  const etapaTotal = (etapa: NonNullable<PortalData["orcamento"]>["etapas"][0]) => etapa.itens.reduce((s, i) => s + itemTotal(i), 0);
  const orcamentoTotalCalc = orcamento ? orcamento.etapas.reduce((s, e) => s + etapaTotal(e), 0) : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {lightbox ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setLightbox(null)}><img src={lightbox} alt="Foto da obra" className="max-h-[85vh] max-w-full rounded-lg shadow-2xl" /></div> : null}

      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3"><div className="rounded-lg bg-indigo-600 p-2 text-white"><Building2 className="h-5 w-5" /></div><div><p className="text-xs leading-none text-gray-500">Portal do Cliente</p><p className="text-sm font-semibold leading-snug text-gray-900">{tenant.name}</p></div></div>
          <div className="flex items-center gap-2">
            {!data.auth?.authenticated ? <button type="button" onClick={() => setForceAuth(true)} className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">Entrar na área privada</button> : <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">{data.auth.user?.nome ?? "Cliente conectado"}</span>}
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${obraStatus.color}`}>{obraStatus.icon}{obraStatus.label}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {data.publication?.showSearch !== false ? <div className="mb-5"><PortalSearch data={data} onNavigate={(tab) => handleTabChange(tab as TabId)} /></div> : null}
        <div className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h1 className="mb-1 text-2xl font-bold text-gray-900">{obra.nome}</h1>
          {obra.clienteNome ? <p className="mb-3 text-sm text-gray-500">Cliente: <span className="font-medium text-gray-700">{obra.clienteNome}</span></p> : null}
          {obra.descricao ? <p className="mb-4 text-sm text-gray-600">{obra.descricao}</p> : null}
          {obra.endereco ? <div className="mb-4 flex items-center gap-1.5 text-sm text-gray-500"><MapPin className="h-4 w-4 shrink-0 text-indigo-400" />{obra.endereco}</div> : null}
          {totalEtapas > 0 ? <div className="mt-4 rounded-xl bg-indigo-50 p-4"><div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium text-indigo-800">Progresso geral da obra</span><span className="text-lg font-bold text-indigo-700">{avgProgress}%</span></div><ProgressBar value={avgProgress} color="#6366f1" /></div> : null}
        </div>

        {resumo ? (
          <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">Etapa atual</p>
              <p className="mt-1 text-base font-semibold text-gray-900">{resumo.etapaAtual?.nome ?? (avgProgress >= 100 ? "Obra concluída" : "Aguardando início")}</p>
              <p className="mt-1 text-xs text-gray-400">{resumo.etapaAtual ? `${Math.round(Number(resumo.etapaAtual.percentualExecutado ?? resumo.etapaAtual.percentual_executado ?? 0))}% executado` : "—"}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">Previsão de entrega</p>
              <p className="mt-1 text-base font-semibold text-gray-900">{fmt(resumo.previsaoEntrega)}</p>
              <p className="mt-1 text-xs text-gray-400">{resumo.etapasConcluidas}/{resumo.totalEtapas} etapas concluídas</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">Próximas etapas</p>
              <p className="mt-1 text-base font-semibold text-gray-900">{resumo.proximasEtapas[0]?.nome ?? "Nenhuma pendente"}</p>
              <p className="mt-1 text-xs text-gray-400">{resumo.proximasEtapas.slice(1, 3).map((item: any) => item.nome).join(" · ") || "—"}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">Pendências</p>
              <p className="mt-1 text-base font-semibold text-gray-900">{resumo.decisoesPendentes} decisão(ões)</p>
              <p className="mt-1 text-xs text-gray-400">{resumo.ocorrenciasAbertas} ocorrência(s) publicada(s)</p>
            </div>
          </div>
        ) : null}

        <PortalNextActions actions={nextActions} onNavigate={(tab) => handleTabChange(tab as TabId)} />

        <PortalClientDecisions token={token} decisions={decisions} onResolved={(decisionId) => setData((current) => current ? { ...current, decisions: (current.decisions ?? []).filter((item) => item.id !== decisionId) } : current)} />

        {ocorrencias.length > 0 ? <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="mb-3 flex items-center gap-2 font-semibold text-amber-800"><AlertTriangle className="h-5 w-5" />Ocorrências em aberto ({ocorrencias.length})</h2><div className="space-y-3">{ocorrencias.map((oc) => <div key={oc.id} className="rounded-lg border border-amber-100 bg-white p-3"><div className="mb-1 flex items-center justify-between text-xs text-gray-500"><span>{fmt(oc.data)}</span>{oc.responsavelNome ? <span>{oc.responsavelNome}</span> : null}</div><p className="text-sm text-gray-700">{oc.observacoes}</p></div>)}</div></div> : null}

        {visibleTabs.length > 0 ? <div className="mb-6"><div className="sm:hidden"><select value={activeTab} onChange={(e) => handleTabChange(e.target.value as TabId)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700">{visibleTabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.label}</option>)}</select></div><div className="hidden overflow-x-auto border-b border-gray-200 sm:flex">{visibleTabs.map((tab) => <button key={tab.id} onClick={() => handleTabChange(tab.id)} className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-5 py-3 text-sm font-medium transition-colors ${activeTab === tab.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"}`}>{tab.icon}{tab.label}</button>)}</div></div> : null}

        {activeTab === "dados" && data.publication?.showOverview !== false ? (
          <Section title="Visão Geral da Obra" icon={<Building2 className="h-5 w-5" />}>
            <InfoGrid items={[
              { label: "Início", value: fmt(obra.dataInicio) },
              { label: "Conclusão prevista", value: fmt(resumo?.previsaoEntrega ?? obra.dataFimPrevista) },
              { label: "Conclusão real", value: fmt(obra.dataFimReal) },
              { label: "Progresso físico", value: `${avgProgress}%` },
              { label: "Etapas concluídas", value: `${resumo?.etapasConcluidas ?? etapas.filter((item) => Number(item.percentualExecutado) >= 100).length}/${resumo?.totalEtapas ?? etapas.length}` },
              { label: "Etapa atual", value: resumo?.etapaAtual?.nome ?? "—" },
              ...(data.publication?.showFinancialSummary === true ? [
                { label: "Orçamento total", value: fmtMoney(obra.orcamentoTotal) },
                { label: "Custo realizado", value: fmtMoney(obra.custoRealizado) },
                { label: "% consumido", value: obra.orcamentoTotal && obra.custoRealizado ? `${pct(obra.custoRealizado, obra.orcamentoTotal) ?? "—"}%` : "—" },
              ] : []),
            ]} />
            {resumo?.proximasEtapas?.length ? (
              <div className="mt-6">
                <p className="mb-3 text-sm font-semibold text-gray-800">Próximas etapas</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {resumo.proximasEtapas.map((item: any) => (
                    <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{item.nome}</p>
                          <p className="mt-1 text-xs text-gray-400">{fmt(item.dataInicioPrevista ?? item.data_inicio_prevista)} → {fmt(item.dataFimPrevista ?? item.data_fim_prevista)}</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">Próxima</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {data.publication?.showMilestones !== false && marcos.length ? (
              <div className="mt-6">
                <p className="mb-3 text-sm font-semibold text-gray-800">Marcos principais</p>
                <div className="space-y-2">
                  {marcos.slice(0, 8).map((marco: any) => (
                    <div key={marco.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{marco.nome}</p>
                        <p className="text-xs text-gray-400">{fmt(marco.dataFimPrevista ?? marco.dataFimReal)}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${Number(marco.percentualExecutado ?? 0) >= 100 ? "bg-emerald-100 text-emerald-700" : "bg-indigo-50 text-indigo-700"}`}>
                        {Number(marco.percentualExecutado ?? 0) >= 100 ? "Concluído" : "Previsto"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Section>
        ) : null}

        {activeTab === "briefing" && data.publication?.showBriefing !== false ? (
          <Section title="Briefing do Cliente" icon={<FileText className="h-5 w-5" />}>
            <PortalBriefing token={token} sessionToken={portalSession} briefing={briefing} authenticated={Boolean(data.auth?.authenticated)} onRefresh={() => void loadPortal(portalSession)} />
          </Section>
        ) : null}

        {activeTab === "agenda" && data.publication?.showAgenda !== false ? (
          <Section title="Agenda e Próximos Compromissos" icon={<Calendar className="h-5 w-5" />}>
            <PortalAgenda agenda={agenda} />
          </Section>
        ) : null}

        {activeTab === "orcamento" && data.publication?.showBudget !== false ? <Section title="Orçamento" icon={<CircleDollarSign className="h-5 w-5" />}>{!orcamento ? <div className="py-8 text-center text-gray-400"><FileText className="mx-auto mb-2 h-8 w-8 opacity-40" /><p className="text-sm">Nenhum orçamento disponível ainda.</p></div> : <><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-gray-500">{orcamento.titulo ?? `Orçamento v${orcamento.versao}`}{orcamento.bdiGlobal !== "0" ? ` · BDI ${orcamento.bdiGlobal}%` : ""}</span><div className="flex items-center gap-2">{orcamento.status === "aprovado" ? <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Aprovado pelo cliente</span> : null}{orcamento.status === "enviado" && !approved ? <button onClick={handleAprovar} disabled={approving} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}Aprovar Orçamento</button> : null}</div></div><div className="space-y-3">{orcamento.etapas.map((etapa) => <div key={etapa.id} className="overflow-hidden rounded-xl border border-gray-200"><div className="flex items-center justify-between bg-gray-50 px-4 py-3"><span className="text-sm font-medium text-gray-800">{etapa.nome}</span><span className="text-sm font-semibold text-gray-900">{fmtMoney(etapaTotal(etapa))}</span></div>{etapa.itens.length > 0 ? <div className="divide-y divide-gray-100">{etapa.itens.map((item) => <div key={item.id} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm"><div className="min-w-0 flex-1"><p className="text-gray-700">{item.nome}</p><p className="text-xs text-gray-400">{item.quantidade} {item.unidade} × {fmtMoney(item.custoUnitario)}</p></div><span className="whitespace-nowrap font-medium text-gray-900">{fmtMoney(itemTotal(item))}</span></div>)}</div> : null}</div>)}</div><div className="mt-4 flex items-center justify-between rounded-xl bg-indigo-50 px-5 py-4"><span className="font-semibold text-indigo-800">Total do Orçamento</span><span className="text-xl font-bold text-indigo-700">{fmtMoney(orcamentoTotalCalc)}</span></div></>}</Section> : null}

        {activeTab === "cronograma" && data.publication?.showSchedule !== false ? <Section title="Cronograma Executivo e Financeiro" icon={<Layers className="h-5 w-5" />}>
          {orcamento?.propostaOrigemId ? <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Linha de base contratada</p><p className="text-sm font-medium text-indigo-900">Versão {orcamento.versao}{orcamento.linhaBaseSnapshot?.numero ? ` · Proposta ${orcamento.linhaBaseSnapshot.numero}` : ""}</p></div>{orcamento.linhaBaseSnapshot?.acceptedAt ? <span className="text-xs text-indigo-600">Contratada em {fmt(orcamento.linhaBaseSnapshot.acceptedAt)}</span> : null}</div> : null}

          {orcamento?.linhaBaseSnapshot?.apresentacao?.mostrarPortalCliente !== false ? (
            <div className="mb-4 grid gap-3 rounded-xl border border-gray-200 bg-white p-4 md:grid-cols-3">
              <div><p className="text-xs text-gray-500">Valor contratado</p><p className="text-sm font-semibold">{fmtMoney(orcamento?.linhaBaseSnapshot?.valorTotal ?? obra.orcamentoTotal)}</p></div>
              <div><p className="text-xs text-gray-500">Entrada / adiantamento</p><p className="text-sm font-semibold">{Number(orcamento?.linhaBaseSnapshot?.apresentacao?.entradaPercentual ?? 0).toFixed(2)}% · {fmtMoney(Number(orcamento?.linhaBaseSnapshot?.valorTotal ?? obra.orcamentoTotal ?? 0) * Number(orcamento?.linhaBaseSnapshot?.apresentacao?.entradaPercentual ?? 0) / 100)}</p></div>
              <div><p className="text-xs text-gray-500">Amortização por medição</p><p className="text-sm font-semibold">{Number(orcamento?.linhaBaseSnapshot?.apresentacao?.amortizacaoEntradaPercentual ?? orcamento?.linhaBaseSnapshot?.apresentacao?.entradaPercentual ?? 0).toFixed(2)}%</p><p className="text-[11px] text-gray-400">Até quitar o saldo do adiantamento</p></div>
            </div>
          ) : null}

          {etapas.length === 0 ? <div className="py-8 text-center text-gray-400"><Calendar className="mx-auto mb-2 h-8 w-8 opacity-40" /><p className="text-sm">Nenhuma etapa cadastrada.</p></div> : (
            <div className="space-y-3">{etapas.map((etapa) => {
              const p = parseFloat(etapa.percentualExecutado ?? "0");
              const st = ETAPA_STATUS[etapa.status] ?? { label: etapa.status, color: "bg-gray-100 text-gray-600", bar: "#94a3b8" };
              const dias = etapa.dataInicioPrevista && etapa.dataFimPrevista ? Math.max(1, differenceInCalendarDays(parseISO(`${etapa.dataFimPrevista}T12:00:00`), parseISO(`${etapa.dataInicioPrevista}T12:00:00`))) + 1 : null;
              const stagePhases = fases.filter((fase) => fase.etapa_id === etapa.id).sort((a,b) => Number(a.ordem)-Number(b.ordem));
              return <div key={etapa.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="mb-3 flex items-start justify-between gap-2"><div className="flex-1"><p className="text-sm font-medium text-gray-900">{etapa.nome}</p>{etapa.responsavel ? <p className="mt-0.5 text-xs text-gray-400">{etapa.responsavel}</p> : null}{data.publication?.showBudget !== false && Number(etapa.custoPrevisto ?? 0) > 0 ? <p className="mt-1 text-xs font-medium text-indigo-600">Contratado na etapa: {fmtMoney(etapa.custoPrevisto)}{Number(etapa.pesoFisico ?? 0) > 0 ? ` · peso físico ${Number(etapa.pesoFisico).toFixed(1)}%` : ""}</p> : null}</div><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>{st.label}</span></div>
                <div className="mb-2 flex items-center gap-3"><ProgressBar value={p} color={st.bar} /><span className="w-10 text-right text-sm font-bold text-gray-700">{Math.round(p)}%</span></div>
                <div className="mt-1 flex items-center gap-4 text-xs text-gray-400">{etapa.dataInicioPrevista ? <span>{fmt(etapa.dataInicioPrevista)} → {fmt(etapa.dataFimPrevista)}</span> : null}{dias ? <span>{dias} dias</span> : null}</div>
                {stagePhases.length ? <div className="mt-4 space-y-2 border-t border-gray-100 pt-3">
                  {stagePhases.map((fase) => {
                    const fp = Number(fase.percentual_executado ?? 0);
                    const fst = ETAPA_STATUS[fase.status] ?? { label: fase.status, color: "bg-gray-100 text-gray-600", bar: "#94a3b8" };
                    return <div key={fase.id} className="rounded-lg bg-gray-50 p-3">
                      <div className="mb-2 flex items-start justify-between gap-2"><div><p className="text-xs font-semibold text-gray-800">{fase.nome}</p><p className="text-[11px] text-gray-500">{fmt(fase.data_inicio_prevista)} → {fmt(fase.data_fim_prevista)} · {Number(fase.percentual_etapa ?? 0).toFixed(2)}% da etapa · {fmtMoney(fase.custo_previsto)}</p></div><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${fst.color}`}>{fst.label}</span></div>
                      <div className="flex items-center gap-3"><ProgressBar value={fp} color={fst.bar} /><span className="w-10 text-right text-xs font-bold">{fp.toFixed(0)}%</span></div>
                    </div>;
                  })}
                </div> : null}
              </div>;
            })}</div>
          )}
        </Section> : null}

        {activeTab === "diario" && data.publication?.showDiary !== false ? <Section title="Diário da Obra" icon={<FileText className="h-5 w-5" />}>{diario.length === 0 ? <div className="py-8 text-center text-gray-400"><FileText className="mx-auto mb-2 h-8 w-8 opacity-40" /><p className="text-sm">Nenhuma entrada aprovada no diário ainda.</p></div> : <div className="space-y-3">{diario.map((entry) => { const isOpen = expandedDiario === entry.id; const hasFotos = (entry.fotos?.length ?? 0) > 0; return <div key={entry.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white"><button className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-gray-50" onClick={() => setExpandedDiario(isOpen ? null : entry.id)}><div className="flex items-center gap-3"><span className="text-sm font-semibold text-gray-700">{format(parseISO(`${entry.data}T12:00:00`), "dd 'de' MMMM", { locale: ptBR })}</span>{hasFotos ? <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600"><Camera className="h-3 w-3" />{entry.fotos!.length} foto{entry.fotos!.length > 1 ? "s" : ""}</span> : null}{entry.responsavelNome ? <span className="text-xs text-gray-400">{entry.responsavelNome}</span> : null}</div>{isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}</button>{isOpen ? <div className="border-t border-gray-100 px-4 pb-4"><p className="mt-3 text-sm leading-relaxed text-gray-700">{entry.conteudo}</p>{entry.climaTempo || entry.maoDeObra != null ? <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">{entry.climaTempo ? <span>🌤 {entry.climaTempo}</span> : null}{entry.maoDeObra != null ? <span>👷 {entry.maoDeObra} trabalhadores</span> : null}</div> : null}{hasFotos ? <div className="mt-4 grid grid-cols-3 gap-2">{entry.fotos!.map((foto, i) => <button key={i} onClick={() => setLightbox(foto.url)} className="aspect-square overflow-hidden rounded-lg border border-gray-200"><img src={foto.url} alt={foto.caption ?? `Foto ${i + 1}`} className="h-full w-full object-cover" /></button>)}</div> : null}{entry.observacoes ? <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 p-3"><p className="mb-1 text-xs font-medium text-amber-700">Observações</p><p className="text-sm text-amber-800">{entry.observacoes}</p></div> : null}</div> : null}</div>; })}</div>}</Section> : null}

        {activeTab === "medicoes" && data.publication?.showMeasurements !== false ? (
          <Section title="Medições e Evolução Física" icon={<CheckCircle2 className="h-5 w-5" />}>
            {medicoes.length === 0 ? <div className="py-8 text-center text-sm text-gray-400">Nenhuma medição publicada ainda.</div> : (
              <div className="space-y-3">
                {medicoes.map((medicao) => {
                  const anterior = Number(medicao.percentual_anterior ?? 0);
                  const atual = Number(medicao.percentual_novo ?? 0);
                  return <div key={medicao.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div><p className="text-sm font-semibold text-gray-900">{medicao.etapa_nome}{medicao.fase_nome ? ` · ${medicao.fase_nome}` : ""}</p><p className="text-xs text-gray-400">{fmt(medicao.data)}</p></div>
                      <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{anterior.toFixed(0)}% → {atual.toFixed(0)}%</span>
                    </div>
                    <ProgressBar value={atual} color="#6366f1" />
                    {medicao.fase_id && medicao.valor_bruto != null ? <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-3 text-xs md:grid-cols-4">
                      <div><p className="text-gray-400">Medição bruta</p><p className="font-semibold text-gray-800">{fmtMoney(medicao.valor_bruto)}</p></div>
                      <div><p className="text-gray-400">Amortização entrada</p><p className="font-semibold text-amber-700">-{fmtMoney(medicao.amortizacao_entrada)}</p></div>
                      <div><p className="text-gray-400">Valor líquido</p><p className="font-semibold text-indigo-700">{fmtMoney(medicao.valor_liquido)}</p></div>
                      <div><p className="text-gray-400">Saldo da entrada</p><p className="font-semibold text-gray-800">{fmtMoney(medicao.saldo_entrada_apos)}</p></div>
                    </div> : null}
                    {medicao.observacao ? <p className="mt-3 text-sm text-gray-600">{medicao.observacao}</p> : null}
                  </div>;
                })}
              </div>
            )}
          </Section>
        ) : null}

        {activeTab === "galeria" ? (
          <Section title="Fotos e Galeria do Projeto" icon={<Camera className="h-5 w-5" />}>
            {galeriaProjeto.length === 0 && fotosRecentes.length === 0 ? <div className="py-8 text-center text-sm text-gray-400">Nenhuma imagem publicada ainda.</div> : (
              <div className="space-y-6">
                {galeriaProjeto.length ? <div><p className="mb-3 text-sm font-semibold text-gray-800">Projeto e renders</p><div className="grid grid-cols-2 gap-3 md:grid-cols-3">{galeriaProjeto.map((img) => <button key={img.id} onClick={() => setLightbox(img.result_image_url)} className="overflow-hidden rounded-xl border border-gray-200 bg-white text-left"><img src={img.result_image_url} alt={img.ambiente ?? "Render"} className="aspect-[4/3] w-full object-cover" /><div className="p-2"><p className="truncate text-xs font-medium text-gray-800">{img.ambiente ?? "Projeto"}</p><p className="text-[10px] text-gray-400">{img.approved_at ? "Aprovado" : img.version_tag ?? "Render"}</p></div></button>)}</div></div> : null}
                {fotosRecentes.length ? <div><p className="mb-3 text-sm font-semibold text-gray-800">Evolução da obra</p><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{fotosRecentes.map((foto) => <button key={foto.id} onClick={() => setLightbox(foto.url)} className="overflow-hidden rounded-xl border border-gray-200"><img src={foto.url} alt={foto.caption ?? "Foto da obra"} className="aspect-square w-full object-cover" /><div className="bg-white px-2 py-1.5 text-left"><p className="truncate text-[10px] text-gray-500">{foto.caption ?? fmt(foto.data)}</p></div></button>)}</div></div> : null}
              </div>
            )}
          </Section>
        ) : null}

        {activeTab === "documentos" && data.publication?.showDocuments !== false ? (
          <Section title="Documentos e Anexos" icon={<FileText className="h-5 w-5" />}>
            {documentos.length === 0 ? <div className="py-8 text-center text-sm text-gray-400">Nenhum documento publicado ainda.</div> : (
              <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
                {documentos.map((doc) => <a key={doc.id} href={doc.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50"><div className="min-w-0"><p className="truncate text-sm font-medium text-gray-800">{doc.nome}</p><p className="text-xs text-gray-400">{fmt(doc.data)} · {doc.mimeType ?? "arquivo"}</p></div><span className="text-xs font-semibold text-indigo-600">Abrir</span></a>)}
              </div>
            )}
          </Section>
        ) : null}

        {activeTab === "compras" && data.publication?.showProcurementSummary !== false ? (
          <Section title="Compras e Suprimentos" icon={<Layers className="h-5 w-5" />}>
            {compras.length === 0 ? <div className="py-8 text-center text-sm text-gray-400">Nenhuma compra vinculada à obra.</div> : (
              <div className="space-y-3">
                {compras.map((compra) => {
                  const status = String(compra.status ?? "pendente").toLowerCase();
                  const entregue = ["recebido","concluido","efetuada"].includes(status);
                  return <div key={compra.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div><p className="text-sm font-semibold text-gray-900">{compra.descricao}</p><p className="mt-0.5 text-xs text-gray-400">{compra.etapa_nome ?? "Sem etapa"}{compra.fornecedor ? ` · ${compra.fornecedor}` : ""}</p></div>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${entregue ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{entregue ? "Recebido" : status}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-gray-500 md:grid-cols-4"><div><span className="block text-[10px] uppercase text-gray-400">Necessidade</span>{fmt(compra.data_necessidade)}</div><div><span className="block text-[10px] uppercase text-gray-400">Prev. entrega</span>{fmt(compra.data_prevista)}</div><div><span className="block text-[10px] uppercase text-gray-400">Prazo fornecedor</span>{Number(compra.prazo_fornecedor_dias ?? 0)} dias</div><div><span className="block text-[10px] uppercase text-gray-400">Valor</span>{fmtMoney(compra.valor_total)}</div></div>
                  </div>;
                })}
              </div>
            )}
          </Section>
        ) : null}

        {activeTab === "financeiro" && data.publication?.showFinancialSummary === true ? (
          <Section title="Resumo Financeiro" icon={<CircleDollarSign className="h-5 w-5" />}>
            {!financeiro ? <div className="py-8 text-center text-sm text-gray-400">Resumo financeiro indisponível.</div> : (
              <>
                <InfoGrid items={[
                  { label: "Orçamento", value: fmtMoney(financeiro.orcamentoTotal) },
                  { label: "Custo realizado", value: fmtMoney(financeiro.custoRealizado) },
                  { label: "% consumido", value: `${financeiro.percentualConsumido.toFixed(1)}%` },
                  ...(data.publication?.showFinancialDetails === true ? [
                    { label: "Total lançado", value: fmtMoney(financeiro.totalLancado) },
                    { label: "Pago/recebido", value: fmtMoney(financeiro.totalPago) },
                    { label: "Pendente", value: fmtMoney(financeiro.totalPendente) },
                  ] : []),
                ]} />
                <div className="mt-4"><ProgressBar value={financeiro.percentualConsumido} color={financeiro.percentualConsumido > 100 ? "#e11d48" : "#6366f1"} /></div>
                {data.publication?.showFinancialDetails === true && financeiro.lancamentos.length ? (
                  <div className="mt-6 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
                    {financeiro.lancamentos.map((item: any) => <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-gray-800">{item.descricao ?? item.tipo}</p><p className="text-xs text-gray-400">{item.fornecedor ?? "—"} · vence {fmt(item.data_vencimento)}</p></div><div className="text-right"><p className="text-sm font-semibold text-gray-900">{fmtMoney(item.valor)}</p><p className="text-[10px] text-gray-400">{item.status}</p>{item.documento_url ? <a href={item.documento_url} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-indigo-600">Documento</a> : null}</div></div>)}
                  </div>
                ) : null}
              </>
            )}
          </Section>
        ) : null}

        {activeTab === "executivo" && data.publication?.showExecutiveBalance !== false ? (
          <Section title="Balanço Executivo — Planejado × Executado" icon={<CircleDollarSign className="h-5 w-5" />}>
            <PortalExecutiveBalance balance={executiveBalance} />
          </Section>
        ) : null}

        {activeTab === "propostas" && data.publication?.showProposals !== false ? (
          <Section title="Propostas e Orçamentos Comerciais" icon={<CircleDollarSign className="h-5 w-5" />}>
            <PortalCommercial commercial={commercial} />
          </Section>
        ) : null}

        {activeTab === "projetos" && data.publication?.showDocuments !== false ? (
          <Section title="Projetos e Arquivos Técnicos" icon={<FileText className="h-5 w-5" />}>
            <PortalDocumentLibrary title="Projetos" items={projectDocuments} />
          </Section>
        ) : null}

        {activeTab === "contratos" && data.publication?.showContracts !== false ? (
          <Section title="Contratos e Termos" icon={<FileText className="h-5 w-5" />}>
            <PortalDocumentLibrary title="Contratos" items={contracts} />
          </Section>
        ) : null}

        {activeTab === "manuais" && data.publication?.showManuals !== false ? (
          <Section title="Manuais, Garantias e Entrega" icon={<FileText className="h-5 w-5" />}>
            <PortalDocumentLibrary title="Manuais" items={manuals} />
          </Section>
        ) : null}

        {activeTab === "notas" && data.publication?.showInvoices !== false ? (
          <Section title="Notas Fiscais" icon={<FileText className="h-5 w-5" />}>
            <PortalDocumentLibrary title="Notas fiscais" items={invoices} />
          </Section>
        ) : null}

        {activeTab === "entrega" && data.publication?.showPostSale !== false ? (
          <Section title="Entrega e Pós-venda" icon={<CheckCircle2 className="h-5 w-5" />}>
            <PortalPostSale token={token} sessionToken={portalSession} postSale={postSale} onRefresh={() => void loadPortal(portalSession)} />
          </Section>
        ) : null}

        {activeTab === "vendi" && data.publication?.showVendi !== false ? (
          <Section title="Vendi — Assistente do Projeto" icon={<Sparkles className="h-5 w-5" />}>
            <PortalVendi data={data} onNavigate={(tab) => handleTabChange(tab as TabId)} />
          </Section>
        ) : null}

        {activeTab === "suporte" && data.publication?.showSupport !== false ? (
          <Section title="Solicitações de Suporte" icon={<FileText className="h-5 w-5" />}>
            {data.auth?.authenticated ? (
              <PortalSupportChat token={token} sessionToken={portalSession} tickets={supportTickets} messages={[]} mode="support" onRefresh={() => void loadPortal(portalSession)} />
            ) : <div className="rounded-2xl border border-dashed bg-gray-50 py-10 text-center text-sm text-gray-500">Entre com sua conta para abrir e acompanhar solicitações.</div>}
          </Section>
        ) : null}

        {activeTab === "chat" && data.publication?.showChat !== false ? (
          <Section title="Chat com a Equipe da Obra" icon={<FileText className="h-5 w-5" />}>
            {data.auth?.authenticated ? (
              <PortalSupportChat token={token} sessionToken={portalSession} tickets={[]} messages={chatMessages} mode="chat" onRefresh={() => void loadPortal(portalSession)} />
            ) : <div className="rounded-2xl border border-dashed bg-gray-50 py-10 text-center text-sm text-gray-500">Entre com sua conta para conversar com a equipe responsável.</div>}
          </Section>
        ) : null}

        <footer className="mt-4 border-t border-gray-200 py-6 text-center text-xs text-gray-400">Portal do Cliente — {tenant.name} · Este link é exclusivo para o acompanhamento desta obra.</footer>
      </main>
    </div>
  );
}
