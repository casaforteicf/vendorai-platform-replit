import { useState, useEffect, useCallback, useRef } from "react";
import "./planner5d-reference.css";
import { useRoute, Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { normalizeRenderMediaUrl } from "@/pages/arch/render-studio/renderStudioApi";
import { CatalogoModal } from "@/pages/Propostas";
import { ordenarArvoreCategorias } from "@/lib/categoriaTree";
import { useListCategoriasProduto, getListCategoriasProdutoQueryKey } from "@workspace/api-client-react";
import {
  ArrowLeft, Plus, Sparkles, Loader2, Pencil, Trash2, Link2,
  Search, LayoutGrid, DollarSign, Clock, Eye, ExternalLink,
  Copy, CheckCircle, XCircle, RefreshCw, Globe, Image,
  Download, AlertCircle, ClipboardList, Package, FileText, Upload,
  FolderOpen, Ruler, Camera,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type ProjetoArquivo = {
  id: string;
  nome: string;
  url: string;
  tipo: "skp" | "dxf" | "ifc" | "pdf" | "foto" | "imagem" | "documento" | "outro";
  mimeType?: string;
  size?: number;
  ambienteId?: string | null;
  createdAt?: string;
};

type ProjetoDossie = {
  briefing?: string;
  medidas?: Array<{
    id?: string;
    label: string;
    value: string;
    unit?: string;
    ambienteId?: string | null;
  }>;
  arquivos?: ProjetoArquivo[];
};

type Projeto = {
  id: string;
  titulo: string;
  clienteNome: string | null;
  status: string;
  tipoObra: string | null;
  descricao?: string | null;
  areaM2: string | null;
  orcamentoTotal: string | null;
  portalAtivo: boolean;
  portalToken: string | null;
  leadId: string | null;
  dealId: string | null;
  propostaId: string | null;
  obraId: string | null;
  dossieProjeto?: ProjetoDossie | null;
  escopoOrcamento?: {
    tipos: string[];
    observacoes?: string;
    tratamentoExistentes?: "avaliar_individualmente" | "manter" | "substituir";
  } | null;
};

type Cena = {
  id: string;
  projetoId: string;
  ambienteId: string | null;
  nome: string | null;
  renderUrl: string | null;
  thumbnailUrl: string | null;
  status: string | null;
  sceneData: Record<string, unknown> | null;
  createdAt: string;
};

type Ambiente = {
  id: string;
  nome: string;
  areaM2: string | null;
  descricao: string | null;
  ordem: number;
};

type ProjetoRender = {
  id: string;
  parentRenderId: string | null;
  ambiente: string | null;
  mode: string | null;
  status: string;
  versionTag: string | null;
  originalImageUrl: string | null;
  resultImageUrl: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  concluidoEm: string | null;
};

type OrcamentoItem = {
  id: string;
  ambienteId: string | null;
  categoria: string | null;
  descricao: string;
  quantidade: string;
  unidade: string | null;
  valorUnitario: string;
  valorTotal: string;
  fornecedor: string | null;
  geradoPorIa: boolean;
  produtoId: string | null;
};

type OrcamentoGrupo = {
  ambienteId: string | null;
  categoria: string | null;
  itens: OrcamentoItem[];
  totalCategoria: number;
};

type CatalogoProduto = {
  id: string;
  nome: string;
  categoria: string | null;
  precoBase: string | null;
  fornecedor: string | null;
};

type DealResumo = {
  id: string;
  titulo: string;
  valor: string | null;
  etapa: string;
  leadId: string | null;
  assignedTo: string | null;
  responsavelNome: string | null;
  active: boolean;
};

// ── Constants ──────────────────────────────────────────────────────────────
const ESCOPO_ORCAMENTO_OPTIONS = [
  { value: "completo", label: "Projeto completo", description: "Tudo o que estiver confirmado na especificação." },
  { value: "mobiliario", label: "Mobiliário", description: "Móveis soltos, estofados, mesas, cadeiras e similares." },
  { value: "marcenaria", label: "Marcenaria", description: "Planejados, painéis, cozinhas, closets e armários." },
  { value: "revestimentos", label: "Revestimentos", description: "Pisos, porcelanatos, pedras e acabamentos." },
  { value: "reforma", label: "Reforma", description: "Retiradas, preparação, alvenaria, gesso e mão de obra." },
  { value: "decoracao", label: "Decoração", description: "Objetos, tapetes, cortinas, quadros e acessórios." },
  { value: "iluminacao", label: "Iluminação", description: "Luminárias, perfis, spots, fitas LED e instalação." },
  { value: "eletrica", label: "Elétrica", description: "Pontos e adequações elétricas." },
  { value: "hidraulica", label: "Hidráulica", description: "Pontos, louças, metais e adequações hidráulicas." },
  { value: "pintura", label: "Pintura", description: "Preparação de superfícies e pintura." },
  { value: "outros", label: "Outros", description: "Itens adicionais confirmados no briefing." },
] as const;

type BudgetScopeValue = typeof ESCOPO_ORCAMENTO_OPTIONS[number]["value"];
type BudgetScopeForm = {
  tipos: BudgetScopeValue[];
  observacoes: string;
  tratamentoExistentes: "avaliar_individualmente" | "manter" | "substituir";
};

const STATUS_CLASS: Record<string, string> = {
  briefing:    "bg-gray-100 text-gray-700 border-gray-200",
  orcamento:   "bg-blue-50 text-blue-700 border-blue-200",
  aprovado:    "bg-green-50 text-green-700 border-green-200",
  em_execucao: "bg-amber-50 text-amber-700 border-amber-200",
  entregue:    "bg-emerald-50 text-emerald-800 border-emerald-200",
  cancelado:   "bg-red-50 text-red-700 border-red-200",
};

const STATUS_LABEL: Record<string, string> = {
  briefing: "Briefing", orcamento: "Orçamento", aprovado: "Aprovado",
  em_execucao: "Em Execução", entregue: "Entregue", cancelado: "Cancelado",
};

const EMPTY_ITEM = {
  ambienteId: "__none__", categoria: "", descricao: "",
  quantidade: "1", unidade: "un", valorUnitario: "0", fornecedor: "",
};

const EMPTY_AMB = { nome: "", areaM2: "", descricao: "" };

const ESTILOS = ["Moderno", "Minimalista", "Rústico", "Clássico", "Industrial"] as const;
const ILUMINACOES = ["Natural", "Artificial", "Mista"] as const;
const PALETA_CORES = [
  { label: "Branco",      hex: "#FFFFFF" },
  { label: "Cinza",       hex: "#9CA3AF" },
  { label: "Bege",        hex: "#D4B896" },
  { label: "Azul-escuro", hex: "#1E3A5F" },
  { label: "Verde-sage",  hex: "#7A9E7E" },
  { label: "Terracota",   hex: "#C1694F" },
];
const EMPTY_CENA = {
  nome: "",
  ambienteId: "__none__",
  estilo: "Moderno" as string,
  paleta: [] as string[],
  produtosIds: [] as string[],
  iluminacao: "Natural" as string,
  observacoes: "",
};

// ── Solicitação types & helpers ────────────────────────────────────────────
type SolicitacaoAdmin = {
  id: string;
  cenaId: string;
  cenaNome: string | null;
  clienteNome: string | null;
  status: string | null;
  itensAdicionados:  Array<{ tipo: string; cor: string; posicao: string }> | null;
  texturasAlteradas: Array<{ superficie: string; material: string; cor: string }> | null;
  observacoes: string | null;
  versaoGeradaId: string | null;
  versaoNum: number | null;
  imageUrl: string | null;
  createdAt: string;
  processadoEm: string | null;
};

const ITEM_LABELS: Record<string, string> = {
  sofa: "Sofá", mesa: "Mesa de centro", cadeira: "Cadeira", cama: "Cama",
  armario: "Armário", luminaria: "Luminária", janela: "Janela", porta: "Porta",
};
const MATERIAL_LABELS: Record<string, string> = {
  tinta: "Tinta lisa", madeira: "Madeira", marmore: "Mármore", cimento: "Cimento",
};
const SUPERFICIE_LABELS: Record<string, string> = {
  parede: "Parede", piso: "Piso", teto: "Teto",
};

function SolicitacaoBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string; pulse?: boolean }> = {
    pendente:    { cls: "bg-gray-100 text-gray-600 border-gray-200",          label: "Pendente" },
    processando: { cls: "bg-blue-50 text-blue-700 border-blue-200",           label: "Processando…", pulse: true },
    concluido:   { cls: "bg-emerald-50 text-emerald-700 border-emerald-200",  label: "Concluído" },
    erro:        { cls: "bg-red-50 text-red-700 border-red-200",              label: "Erro" },
  };
  const cfg = map[status] ?? { cls: "bg-gray-100 text-gray-600 border-gray-200", label: status };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.cls} ${cfg.pulse ? "animate-pulse" : ""}`}>
      {cfg.label}
    </span>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem("vendorai_token"); }
function getBase()  { return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, ""); }
function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fmtDealStage(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function authH(): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[status] ?? "bg-gray-100 text-gray-700"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function ProjetoDetalhe() {
  const [, params] = useRoute("/arch/projetos/:id");
  const [, navigate] = useLocation();
  const projetoId = params?.id ?? "";
  const { toast } = useToast();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  // ── Project data
  const [projeto, setProjeto]     = useState<Projeto | null>(null);
  const [ambientes, setAmbientes] = useState<Ambiente[]>([]);
  const [renders, setRenders]     = useState<ProjetoRender[]>([]);
  const [loading, setLoading]     = useState(true);
  const [projectTab, setProjectTab] = useState("orcamento");

  // ── Orçamento data
  const [grupos, setGrupos]         = useState<OrcamentoGrupo[]>([]);
  const [totalGeral, setTotalGeral] = useState(0);
  const [orcLoading, setOrcLoading] = useState(false);
  const [gerandoIA, setGerandoIA]   = useState(false);

  const { data: categoriasProduto = [] } = useListCategoriasProduto(tenantId, {
    query: {
      queryKey: getListCategoriasProdutoQueryKey(tenantId),
      enabled: !!tenantId,
      staleTime: 300_000,
    },
  });
  const categoriasOrdenadas = ordenarArvoreCategorias(categoriasProduto);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [savingScope, setSavingScope] = useState(false);
  const [scopeForm, setScopeForm] = useState<BudgetScopeForm>({
    tipos: [], observacoes: "", tratamentoExistentes: "avaliar_individualmente",
  });

  // ── Item dialog state
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OrcamentoItem | null>(null);
  const [itemForm, setItemForm]       = useState({ ...EMPTY_ITEM });
  const [savingItem, setSavingItem]   = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [catalogMasterOpen, setCatalogMasterOpen] = useState(false);
  const [catalogMasterProductId, setCatalogMasterProductId] = useState<string | null>(null);
  const [catalogMasterDraft, setCatalogMasterDraft] = useState<{
    nome?: string;
    unidade?: string;
    fornecedor?: string;
    precoBase?: number;
  } | null>(null);

  // ── Vincular dialog state
  const [vinculandoItem, setVinculandoItem]     = useState<OrcamentoItem | null>(null);
  const [catalogSearch, setCatalogSearch]       = useState("");
  const [catalogResults, setCatalogResults]     = useState<CatalogoProduto[]>([]);
  const [selectedProduto, setSelectedProduto]   = useState<CatalogoProduto | null>(null);
  const [vinculando, setVinculando]             = useState(false);

  // ── Negócio / pipeline state
  const [dealCurrent, setDealCurrent] = useState<DealResumo | null>(null);
  const [dealOptions, setDealOptions] = useState<DealResumo[]>([]);
  const [dealDialogOpen, setDealDialogOpen] = useState(false);
  const [dealBusy, setDealBusy] = useState(false);
  const [propostasContexto, setPropostasContexto] = useState<Array<{ id: string; titulo: string; numero: string | null; status: string; valorTotal: string | null; createdAt: string }>>([]);
  const [propostasLoading, setPropostasLoading] = useState(false);

  // ── Ambiente dialog state
  const [addAmbienteOpen, setAddAmbienteOpen]     = useState(false);
  const [editingAmbiente, setEditingAmbiente]     = useState<Ambiente | null>(null);
  const [ambienteForm, setAmbienteForm]           = useState({ ...EMPTY_AMB });
  const [savingAmbiente, setSavingAmbiente]       = useState(false);
  const [deletingAmbienteId, setDeletingAmbienteId] = useState<string | null>(null);
  const [viewingAmbiente, setViewingAmbiente]         = useState<Ambiente | null>(null);
  const [uploadingDossier, setUploadingDossier]       = useState(false);
  const dossierFileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Cenas state
  const [cenas, setCenas]                   = useState<Cena[]>([]);
  const [cenasLoading, setCenasLoading]     = useState(false);
  const [cenasLoaded, setCenasLoaded]       = useState(false);
  const [addCenaOpen, setAddCenaOpen]       = useState(false);
  const [cenaForm, setCenaForm]             = useState({ ...EMPTY_CENA });
  const [savingCena, setSavingCena]         = useState(false);
  const [renderingCenaId, setRenderingCenaId] = useState<string | null>(null);
  const [deletingCenaId, setDeletingCenaId] = useState<string | null>(null);
  const [viewingCena, setViewingCena]       = useState<Cena | null>(null);
  const [catalogBusca, setCatalogBusca]     = useState("");
  const [catalogCenas, setCatalogCenas]     = useState<CatalogoProduto[]>([]);
  const pollIntervalsRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const syncingRenderAmbientesRef = useRef(false);

  // ── Portal state
  const [portalUrl, setPortalUrl]           = useState<string | null>(null);
  const [ativandoPortal, setAtivandoPortal] = useState(false);
  const [copiedUrl, setCopiedUrl]           = useState(false);

  // ── Solicitações state
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoAdmin[]>([]);
  const [solLoading, setSolLoading]     = useState(false);
  const [solLoaded, setSolLoaded]       = useState(false);
  const [viewingSol, setViewingSol]     = useState<SolicitacaoAdmin | null>(null);
  const [retrying, setRetrying]         = useState(false);
  const solRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data loaders ───────────────────────────────────────────────────────
  const loadDealContext = useCallback(async (project?: Projeto | null, autoLink = true) => {
    if (!projetoId) return;
    const res = await fetch(`/api/arch/projetos/${projetoId}/negocios`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) return;

    const data = await res.json() as { current?: DealResumo | null; candidates?: DealResumo[] };
    const candidates = Array.isArray(data.candidates) ? data.candidates : [];
    setDealCurrent(data.current ?? null);
    setDealOptions(candidates);

    if (autoLink && project && !project.dealId) {
      const active = candidates.filter((deal) => deal.active);
      if (active.length === 1) {
        const linkRes = await fetch(`/api/arch/projetos/${projetoId}/negocio`, {
          method: "POST",
          headers: authH(),
          body: JSON.stringify({ dealId: active[0].id }),
        });
        if (!linkRes.ok) {
          const failure = await linkRes.json().catch(() => ({}));
          toast({
            title: "Não foi possível vincular automaticamente o negócio",
            description: typeof failure?.error === "string" ? failure.error : "Use “Vincular negócio” para selecionar manualmente.",
            variant: "destructive",
          });
          return;
        }

        const linked = await linkRes.json();
        setDealCurrent(linked.deal ?? active[0]);
        setProjeto((current) => current ? {
          ...current,
          dealId: linked.deal?.id ?? active[0].id,
          leadId: linked.projeto?.leadId ?? current.leadId,
        } : current);
      }
    }
  }, [projetoId, toast]);

  const loadPropostasContexto = useCallback(async (project?: Projeto | null) => {
    if (!tenantId || !project) { setPropostasContexto([]); return; }
    const query = project.leadId
      ? `leadId=${encodeURIComponent(project.leadId)}`
      : project.dealId
        ? `dealId=${encodeURIComponent(project.dealId)}`
        : "";
    if (!query) { setPropostasContexto([]); return; }
    setPropostasLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/propostas?${query}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const body = await response.json().catch(() => []);
      const proposals = Array.isArray(body) ? body : [];
      proposals.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setPropostasContexto(proposals);
    } finally { setPropostasLoading(false); }
  }, [tenantId]);

  const loadProjeto = useCallback(async () => {
    if (!projetoId) return;
    const res = await fetch(`/api/arch/projetos/${projetoId}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) return;

    const data = await res.json();
    const nextAmbientes: Ambiente[] = Array.isArray(data.ambientes) ? data.ambientes : [];
    const nextRenders: ProjetoRender[] = Array.isArray(data.renders) ? data.renders : [];

    setProjeto(data.projeto ?? null);
    setAmbientes(nextAmbientes);
    setRenders(nextRenders);
    void loadDealContext(data.projeto ?? null, true);
    void loadPropostasContexto(data.projeto ?? null);

    // Render e Ambiente representam o mesmo cômodo do projeto. Se um render antigo
    // possui o ambiente preenchido, mas o cadastro de Ambientes ainda não existe,
    // materializamos esse ambiente automaticamente para manter orçamento,
    // especificação e galeria trabalhando sobre a mesma fonte de verdade.
    if (!syncingRenderAmbientesRef.current && nextRenders.length > 0) {
      const normalize = (value: string) =>
        value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

      const existing = new Set(nextAmbientes.map((amb) => normalize(amb.nome)));
      const missingLabels = Array.from(
        new Map(
          nextRenders
            .map((render) => ambienteRenderLabel(render.ambiente))
            .filter((label) => label && label !== "Sem ambiente")
            .map((label) => [normalize(label), label] as const),
        ).entries(),
      )
        .filter(([key]) => !existing.has(key))
        .map(([, label]) => label);

      if (missingLabels.length > 0) {
        syncingRenderAmbientesRef.current = true;
        try {
          let createdAny = false;
          for (const nome of missingLabels) {
            const createRes = await fetch(`/api/arch/projetos/${projetoId}/ambientes`, {
              method: "POST",
              headers: authH(),
              body: JSON.stringify({
                nome,
                descricao: "Ambiente identificado automaticamente a partir dos renders do projeto.",
              }),
            });
            if (createRes.ok || createRes.status === 409) createdAny = true;
          }

          if (createdAny) {
            const refresh = await fetch(`/api/arch/projetos/${projetoId}`, {
              headers: { Authorization: `Bearer ${getToken()}` },
            });
            if (refresh.ok) {
              const refreshed = await refresh.json();
              setProjeto(refreshed.projeto ?? data.projeto ?? null);
              setAmbientes(Array.isArray(refreshed.ambientes) ? refreshed.ambientes : nextAmbientes);
              setRenders(Array.isArray(refreshed.renders) ? refreshed.renders : nextRenders);
            }
          }
        } finally {
          syncingRenderAmbientesRef.current = false;
        }
      }
    }
  }, [projetoId, loadDealContext, loadPropostasContexto]);

  const loadOrcamento = useCallback(async () => {
    if (!projetoId) return;
    setOrcLoading(true);
    const res = await fetch(`/api/arch/projetos/${projetoId}/orcamento`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) {
      const data = await res.json();
      setGrupos(data.grupos ?? []);
      setTotalGeral(Number(data.totalGeral ?? 0));
    }
    setOrcLoading(false);
  }, [projetoId]);

  useEffect(() => {
    if (!projetoId) return;
    setLoading(true);
    Promise.all([loadProjeto(), loadOrcamento()]).finally(() => setLoading(false));
  }, [projetoId]);

  // ── Helpers ────────────────────────────────────────────────────────────
  function nomeAmbiente(id: string | null): string {
    if (!id) return "Sem ambiente";
    return ambientes.find((a) => a.id === id)?.nome ?? "Ambiente";
  }

  function countItens(ambId: string): number {
    return grupos
      .filter((g) => g.ambienteId === ambId)
      .reduce((s, g) => s + g.itens.length, 0);
  }

  function ambienteRenderLabel(value: string | null | undefined): string {
    const normalized = String(value ?? "").trim().toLowerCase();
    const known: Record<string, string> = {
      cozinha: "Cozinha",
      sala: "Sala de Estar",
      sala_de_estar: "Sala de Estar",
      quarto: "Quarto",
      quarto_master: "Quarto Master",
      banheiro: "Banheiro",
      escritorio: "Escritório",
      varanda: "Varanda",
      hall_de_entrada: "Hall de Entrada",
      fachada: "Fachada",
      gourmet: "Área Gourmet",
      area_gourmet: "Área Gourmet",
    };
    return known[normalized] ?? (value
      ? String(value).replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())
      : "Sem ambiente");
  }

  function abrirRenderStudio(ambienteValue?: string | null) {
    const ambienteLabel = ambienteRenderLabel(ambienteValue);
    localStorage.setItem("arq_last_project_id", projetoId);
    sessionStorage.setItem("arq_studio_ambiente", ambienteLabel === "Sem ambiente" ? "" : ambienteLabel);
    navigate(
      `/arch/render?new=1&project_id=${encodeURIComponent(projetoId)}${ambienteLabel !== "Sem ambiente" ? `&ambiente=${encodeURIComponent(ambienteLabel)}` : ""}`,
    );
  }

  function abrirRenderExistente(render: ProjetoRender) {
    const ambienteLabel = ambienteRenderLabel(render.ambiente);
    localStorage.setItem("arq_last_project_id", projetoId);
    sessionStorage.setItem("arq_studio_ambiente", ambienteLabel === "Sem ambiente" ? "" : ambienteLabel);
    navigate(
      `/arch/render?project_id=${encodeURIComponent(projetoId)}&render_id=${encodeURIComponent(render.id)}${ambienteLabel !== "Sem ambiente" ? `&ambiente=${encodeURIComponent(ambienteLabel)}` : ""}`,
    );
  }

  const rendersPorAmbiente = renders.reduce<Record<string, ProjetoRender[]>>((acc, render) => {
    const key = ambienteRenderLabel(render.ambiente);
    if (!acc[key]) acc[key] = [];
    acc[key].push(render);
    return acc;
  }, {});

  function normalizeAmbienteName(value: string | null | undefined): string {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/_/g, " ");
  }

  function rendersDoAmbiente(amb: Ambiente): ProjetoRender[] {
    const target = normalizeAmbienteName(amb.nome);
    return renders.filter((render) => normalizeAmbienteName(ambienteRenderLabel(render.ambiente)) === target);
  }

  function arquivosDoAmbiente(amb: Ambiente): ProjetoArquivo[] {
    const arquivos = projeto?.dossieProjeto?.arquivos ?? [];
    return arquivos.filter((arquivo) => !arquivo.ambienteId || arquivo.ambienteId === amb.id);
  }

  function medidasDoAmbiente(amb: Ambiente) {
    const medidas = projeto?.dossieProjeto?.medidas ?? [];
    return medidas.filter((medida) => !medida.ambienteId || medida.ambienteId === amb.id);
  }

  function classificarArquivo(file: File): ProjetoArquivo["tipo"] {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "skp") return "skp";
    if (ext === "dxf" || ext === "dwg") return "dxf";
    if (ext === "ifc") return "ifc";
    if (ext === "pdf") return "pdf";
    if (file.type.startsWith("image/")) return "foto";
    if (["doc", "docx", "xls", "xlsx", "txt", "rtf"].includes(ext)) return "documento";
    return "outro";
  }

  async function handleDossierUpload(files: FileList | null, ambienteId?: string) {
    const selected = Array.from(files ?? []);
    if (!selected.length || !projeto) return;
    setUploadingDossier(true);
    try {
      const novos: ProjetoArquivo[] = [];
      for (const file of selected) {
        const request = await fetch("/api/storage/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
        });
        if (!request.ok) throw new Error(`Não foi possível preparar o upload de ${file.name}.`);
        const { uploadURL, objectPath } = await request.json() as { uploadURL: string; objectPath: string };
        const upload = await fetch(uploadURL, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!upload.ok) throw new Error(`Falha ao enviar ${file.name}.`);
        novos.push({
          id: crypto.randomUUID(),
          nome: file.name,
          url: `${window.location.origin}/api/storage${objectPath}`,
          tipo: classificarArquivo(file),
          mimeType: file.type || undefined,
          size: file.size,
          ambienteId: ambienteId ?? null,
          createdAt: new Date().toISOString(),
        });
      }

      const currentDossie = projeto.dossieProjeto ?? {};
      const nextDossie: ProjetoDossie = {
        ...currentDossie,
        arquivos: [...(currentDossie.arquivos ?? []), ...novos],
      };
      const save = await fetch(`/api/arch/projetos/${projetoId}`, {
        method: "PATCH",
        headers: authH(),
        body: JSON.stringify({ dossieProjeto: nextDossie }),
      });
      if (!save.ok) throw new Error("Arquivos enviados, mas não foi possível vinculá-los ao projeto.");
      await loadProjeto();
      toast({
        title: selected.length === 1 ? "Arquivo adicionado ao projeto" : "Arquivos adicionados ao projeto",
        description: "Eles ficam disponíveis dentro do ambiente e no dossiê central do projeto.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível salvar os arquivos",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setUploadingDossier(false);
      if (dossierFileInputRef.current) dossierFileInputRef.current.value = "";
    }
  }

  // Group orcamento itens by ambienteId
  const byAmbiente: Record<string, OrcamentoGrupo[]> = {};
  for (const g of grupos) {
    const key = g.ambienteId ?? "__sem__";
    if (!byAmbiente[key]) byAmbiente[key] = [];
    byAmbiente[key].push(g);
  }

  async function linkDeal(dealId: string) {
    setDealBusy(true);
    try {
      const res = await fetch(`/api/arch/projetos/${projetoId}/negocio`, {
        method: "POST",
        headers: authH(),
        body: JSON.stringify({ dealId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? "Não foi possível vincular o negócio.");
      setProjeto((current) => current ? {
        ...current,
        dealId: payload.deal?.id ?? dealId,
        leadId: payload.projeto?.leadId ?? current.leadId,
      } : current);
      setDealCurrent(payload.deal ?? null);
      setDealDialogOpen(false);
      await loadDealContext(payload.projeto ?? projeto, false);
      toast({ title: "Negócio vinculado ao projeto" });
    } catch (error) {
      toast({
        title: "Não foi possível vincular",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setDealBusy(false);
    }
  }

  async function createDealForProject() {
    setDealBusy(true);
    try {
      const res = await fetch(`/api/arch/projetos/${projetoId}/negocio`, {
        method: "POST",
        headers: authH(),
        body: JSON.stringify({ create: true }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? "Não foi possível criar o negócio.");
      setProjeto((current) => current ? {
        ...current,
        dealId: payload.deal?.id ?? current.dealId,
        leadId: payload.projeto?.leadId ?? current.leadId,
      } : current);
      setDealCurrent(payload.deal ?? null);
      setDealDialogOpen(false);
      await loadDealContext(payload.projeto ?? projeto, false);
      toast({ title: "Negócio criado e vinculado à pipeline" });
    } catch (error) {
      toast({
        title: "Não foi possível criar o negócio",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setDealBusy(false);
    }
  }

  // ── Escopo real do cliente ────────────────────────────────────────────
  function openBudgetScope() {
    const current = projeto?.escopoOrcamento;
    setScopeForm({
      tipos: (current?.tipos ?? []) as BudgetScopeValue[],
      observacoes: current?.observacoes ?? "",
      tratamentoExistentes: current?.tratamentoExistentes ?? "avaliar_individualmente",
    });
    setScopeOpen(true);
  }

  function toggleBudgetScope(value: BudgetScopeValue) {
    setScopeForm((current) => {
      if (value === "completo") {
        return { ...current, tipos: current.tipos.includes("completo") ? [] : ["completo"] };
      }
      const withoutComplete = current.tipos.filter((item) => item !== "completo");
      return {
        ...current,
        tipos: withoutComplete.includes(value)
          ? withoutComplete.filter((item) => item !== value)
          : [...withoutComplete, value],
      };
    });
  }

  async function saveBudgetScope() {
    if (scopeForm.tipos.length === 0) {
      toast({ title: "Selecione ao menos um escopo", variant: "destructive" });
      return;
    }
    setSavingScope(true);
    try {
      const res = await fetch(`/api/arch/projetos/${projetoId}`, {
        method: "PATCH",
        headers: authH(),
        body: JSON.stringify({ escopoOrcamento: scopeForm }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Falha ao salvar o escopo.");
      await loadProjeto();
      setScopeOpen(false);
      toast({ title: "Escopo deste cliente salvo" });
    } catch (error) {
      toast({ title: "Erro", description: error instanceof Error ? error.message : "Falha ao salvar o escopo.", variant: "destructive" });
    } finally {
      setSavingScope(false);
    }
  }

  // ── Gerar orçamento a partir da especificação confirmada ───────────────
  async function gerarIA() {
    if (!projeto?.escopoOrcamento?.tipos?.length) {
      openBudgetScope();
      toast({ title: "Defina primeiro o que este cliente quer orçar." });
      return;
    }
    setGerandoIA(true);
    try {
      const res = await fetch(`/api/arch/projetos/${projetoId}/orcamento/gerar-ia`, {
        method: "POST",
        headers: authH(),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error ?? "Falha ao gerar orçamento.");
      }
      await Promise.all([loadOrcamento(), loadProjeto()]);
      const semPreco = Number(payload?.semPreco ?? 0);
      const foraDoEscopo = Number(payload?.foraDoEscopo ?? 0);
      const partes: string[] = [];
      if (semPreco > 0) partes.push(`${semPreco} item(ns) com preço pendente`);
      if (foraDoEscopo > 0) partes.push(`${foraDoEscopo} item(ns) confirmados ignorados por estarem fora do escopo`);
      toast({
        title: "Orçamento atualizado pela especificação",
        description: partes.length
          ? `${partes.join(" · ")}. Nenhum valor foi inventado.`
          : "Todos os itens do escopo foram precificados com os dados cadastrados.",
      });
    } catch (e: any) {
      toast({ title: "Não foi possível gerar o orçamento", description: e.message, variant: "destructive" });
    } finally {
      setGerandoIA(false);
    }
  }

  // ── Item CRUD ──────────────────────────────────────────────────────────
  function openAddItem() {
    setItemForm({ ...EMPTY_ITEM });
    setEditingItem(null);
    setAddItemOpen(true);
  }

  function openEditItem(item: OrcamentoItem) {
    setItemForm({
      ambienteId:    item.ambienteId ?? "__none__",
      categoria:     item.categoria ?? "",
      descricao:     item.descricao,
      quantidade:    item.quantidade,
      unidade:       item.unidade ?? "un",
      valorUnitario: item.valorUnitario,
      fornecedor:    item.fornecedor ?? "",
    });
    setEditingItem(item);
    setAddItemOpen(true);
  }

  function openCatalogMasterForItem(item?: OrcamentoItem | null) {
    const target = item ?? editingItem;
    if (target?.produtoId) {
      setCatalogMasterProductId(target.produtoId);
      setCatalogMasterDraft(null);
    } else {
      setCatalogMasterProductId(null);
      setCatalogMasterDraft({
        nome: itemForm.descricao || target?.descricao || "",
        unidade: itemForm.unidade || target?.unidade || "un",
        fornecedor: itemForm.fornecedor || target?.fornecedor || "",
        precoBase: Number(itemForm.valorUnitario || target?.valorUnitario || 0),
      });
    }
    setCatalogMasterOpen(true);
  }

  async function handleCatalogProductSaved(product: any) {
    setItemForm((current) => ({
      ...current,
      descricao: product?.nome ?? current.descricao,
      unidade: product?.unidade ?? current.unidade,
      fornecedor: product?.fornecedor ?? current.fornecedor,
      valorUnitario: product?.precoBase != null ? String(product.precoBase) : current.valorUnitario,
      categoria: product?.categoriaNome ?? current.categoria,
    }));

    if (editingItem?.id && product?.id) {
      try {
        const res = await fetch(`/api/arch/orcamento/${editingItem.id}/vincular-produto`, {
          method: "POST",
          headers: authH(),
          body: JSON.stringify({ produtoId: product.id }),
        });
        if (res.ok) await loadOrcamento();
      } catch {
        // O cadastro mestre permanece salvo; o vínculo pode ser refeito pelo botão de catálogo.
      }
    }
  }

  async function handleSaveItem(e: React.FormEvent) {
    e.preventDefault();
    setSavingItem(true);
    try {
      const ambId = itemForm.ambienteId === "__none__" ? undefined : itemForm.ambienteId || undefined;
      const body = {
        ambienteId:    ambId,
        categoria:     itemForm.categoria || undefined,
        descricao:     itemForm.descricao,
        quantidade:    Number(itemForm.quantidade),
        unidade:       itemForm.unidade || undefined,
        valorUnitario: Number(itemForm.valorUnitario),
        fornecedor:    itemForm.fornecedor || undefined,
      };

      const url = editingItem
        ? `/api/arch/orcamento/${editingItem.id}`
        : `/api/arch/projetos/${projetoId}/orcamento`;

      const res = await fetch(url, {
        method: editingItem ? "PATCH" : "POST",
        headers: authH(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Falha ao salvar item.");
      }
      setAddItemOpen(false);
      await Promise.all([loadOrcamento(), loadProjeto()]);
      toast({ title: editingItem ? "Item atualizado!" : "Item adicionado!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSavingItem(false);
    }
  }

  async function deleteItem(id: string) {
    if (deletingItemId) return;
    setDeletingItemId(id);
    try {
      const res = await fetch(`/api/arch/orcamento/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Falha ao remover item.");
      }
      await Promise.all([loadOrcamento(), loadProjeto()]);
      toast({ title: "Item removido." });
    } catch (error) {
      toast({ title: "Não foi possível remover o item", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setDeletingItemId(null);
    }
  }

  // ── Vincular produto ───────────────────────────────────────────────────
  async function searchCatalogo(busca: string) {
    if (!busca.trim()) { setCatalogResults([]); return; }
    const res = await fetch(
      `/api/arch/catalogo?busca=${encodeURIComponent(busca)}&limit=10`,
      { headers: { Authorization: `Bearer ${getToken()}` } },
    );
    if (res.ok) setCatalogResults(await res.json());
  }

  function openVincular(item: OrcamentoItem) {
    setVinculandoItem(item);
    setCatalogSearch("");
    setCatalogResults([]);
    setSelectedProduto(null);
  }

  async function handleVincular() {
    if (!vinculandoItem || !selectedProduto) return;
    setVinculando(true);
    try {
      const res = await fetch(
        `/api/arch/orcamento/${vinculandoItem.id}/vincular-produto`,
        { method: "POST", headers: authH(), body: JSON.stringify({ produtoId: selectedProduto.id }) },
      );
      if (!res.ok) throw new Error("Falha ao vincular produto.");
      setVinculandoItem(null);
      await loadOrcamento();
      toast({ title: "Produto vinculado!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setVinculando(false);
    }
  }

  // ── Ambientes CRUD ─────────────────────────────────────────────────────
  function openAddAmbiente() {
    setAmbienteForm({ ...EMPTY_AMB });
    setEditingAmbiente(null);
    setAddAmbienteOpen(true);
  }

  function openEditAmbiente(amb: Ambiente) {
    setAmbienteForm({ nome: amb.nome, areaM2: amb.areaM2 ?? "", descricao: amb.descricao ?? "" });
    setEditingAmbiente(amb);
    setAddAmbienteOpen(true);
  }

  async function handleSaveAmbiente(e: React.FormEvent) {
    e.preventDefault();
    setSavingAmbiente(true);
    try {
      const body = {
        nome:      ambienteForm.nome,
        areaM2:    ambienteForm.areaM2 ? Number(ambienteForm.areaM2) : undefined,
        descricao: ambienteForm.descricao || undefined,
      };
      const url = editingAmbiente
        ? `/api/arch/projetos/${projetoId}/ambientes/${editingAmbiente.id}`
        : `/api/arch/projetos/${projetoId}/ambientes`;
      const res = await fetch(url, {
        method: editingAmbiente ? "PATCH" : "POST",
        headers: authH(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Falha ao salvar ambiente.");
      }
      setAddAmbienteOpen(false);
      await loadProjeto();
      toast({ title: editingAmbiente ? "Ambiente atualizado!" : "Ambiente adicionado!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSavingAmbiente(false);
    }
  }

  async function deleteAmbiente(id: string) {
    if (deletingAmbienteId) return;
    setDeletingAmbienteId(id);
    try {
      const res = await fetch(
        `/api/arch/projetos/${projetoId}/ambientes/${id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } },
      );
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Falha ao remover ambiente.");
      }
      await loadProjeto();
      toast({ title: "Ambiente removido." });
    } catch (error) {
      toast({ title: "Não foi possível remover o ambiente", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setDeletingAmbienteId(null);
    }
  }

  // ── Cenas ──────────────────────────────────────────────────────────────
  const loadCenas = useCallback(async () => {
    if (!projetoId) return;
    setCenasLoading(true);
    const res = await fetch(`/api/arch/projetos/${projetoId}/cenas`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) setCenas(await res.json());
    setCenasLoading(false);
    setCenasLoaded(true);
  }, [projetoId]);

  const loadSolicitacoes = useCallback(async () => {
    if (!projetoId) return;
    setSolLoading(true);
    const res = await fetch(`/api/arch/projetos/${projetoId}/solicitacoes`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) setSolicitacoes(await res.json());
    setSolLoading(false);
    setSolLoaded(true);
  }, [projetoId]);

  function stopPolling(cenaId: string) {
    if (pollIntervalsRef.current[cenaId]) {
      clearInterval(pollIntervalsRef.current[cenaId]);
      delete pollIntervalsRef.current[cenaId];
    }
  }

  function startPolling(cenaId: string) {
    stopPolling(cenaId);
    pollIntervalsRef.current[cenaId] = setInterval(async () => {
      const res = await fetch(`/api/arch/cenas/${cenaId}/render-status`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return;
      const data: { status: string; renderUrl: string | null } = await res.json();
      if (data.status === "concluido" || data.status === "erro") {
        stopPolling(cenaId);
        setCenas(prev => prev.map(c =>
          c.id === cenaId
            ? { ...c, status: data.status, renderUrl: data.renderUrl ?? c.renderUrl }
            : c,
        ));
        if (data.status === "concluido")
          toast({ title: "Render concluído!", description: "A cena 3D está pronta." });
        else
          toast({ title: "Falha no render.", variant: "destructive" });
      }
    }, 5000);
  }

  // Limpa polling ao desmontar
  useEffect(() => {
    return () => {
      Object.values(pollIntervalsRef.current).forEach(clearInterval);
    };
  }, []);

  // Inicializa portalUrl se projeto já tem portal ativo
  useEffect(() => {
    if (projeto?.portalAtivo && projeto.portalToken) {
      setPortalUrl(`${window.location.origin}${getBase()}/arch/portal/${projeto.portalToken}`);
    }
  }, [projeto]);

  // Auto-refresh de solicitações a cada 15s enquanto houver pendentes/processando
  useEffect(() => {
    if (solRefreshRef.current) { clearInterval(solRefreshRef.current); solRefreshRef.current = null; }
    const temAtivos = solLoaded && solicitacoes.some(s => s.status === "pendente" || s.status === "processando");
    if (temAtivos) {
      solRefreshRef.current = setInterval(() => { void loadSolicitacoes(); }, 15000);
    }
    return () => { if (solRefreshRef.current) { clearInterval(solRefreshRef.current); solRefreshRef.current = null; } };
  }, [solLoaded, solicitacoes, loadSolicitacoes]);

  async function searchCatalogoCenas(busca: string) {
    if (!busca.trim()) { setCatalogCenas([]); return; }
    const res = await fetch(
      `/api/arch/catalogo?busca=${encodeURIComponent(busca)}&limit=10`,
      { headers: { Authorization: `Bearer ${getToken()}` } },
    );
    if (res.ok) setCatalogCenas(await res.json());
  }

  async function handleSaveCena(e: React.FormEvent) {
    e.preventDefault();
    setSavingCena(true);
    try {
      const body = {
        nome: cenaForm.nome || undefined,
        ambienteId: cenaForm.ambienteId !== "__none__" ? cenaForm.ambienteId : undefined,
        sceneData: {
          estilo:      cenaForm.estilo,
          paleta:      cenaForm.paleta,
          produtosIds: cenaForm.produtosIds,
          iluminacao:  cenaForm.iluminacao,
          observacoes: cenaForm.observacoes || undefined,
        },
      };
      const res = await fetch(`/api/arch/projetos/${projetoId}/cenas`, {
        method: "POST",
        headers: authH(),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Falha ao criar cena.");
      setAddCenaOpen(false);
      await loadCenas();
      toast({ title: "Cena criada!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSavingCena(false);
    }
  }

  async function renderizarCena(cenaId: string) {
    if (renderingCenaId) return;
    setRenderingCenaId(cenaId);
    setCenas(prev => prev.map(c => c.id === cenaId ? { ...c, status: "renderizando" } : c));
    try {
      const res = await fetch(`/api/arch/cenas/${cenaId}/renderizar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Falha ao iniciar render.");
      }
      startPolling(cenaId);
    } catch (error) {
      setCenas(prev => prev.map(c => c.id === cenaId ? { ...c, status: "rascunho" } : c));
      toast({ title: "Erro ao iniciar render", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setRenderingCenaId(null);
    }
  }

  async function deleteCena(cenaId: string) {
    if (deletingCenaId) return;
    setDeletingCenaId(cenaId);
    try {
      stopPolling(cenaId);
      const res = await fetch(`/api/arch/cenas/${cenaId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Falha ao remover cena.");
      }
      setCenas(prev => prev.filter(c => c.id !== cenaId));
      toast({ title: "Cena removida." });
    } catch (error) {
      toast({ title: "Não foi possível remover a cena", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setDeletingCenaId(null);
    }
  }

  // ── Portal ─────────────────────────────────────────────────────────────
  async function handleActivatePortal() {
    setAtivandoPortal(true);
    try {
      const res = await fetch(`/api/arch/projetos/${projetoId}/portal/ativar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Falha ao ativar portal.");
      const data: { portalUrl: string } = await res.json();
      setPortalUrl(data.portalUrl);
      await loadProjeto();
      toast({ title: "Portal ativado!", description: "Compartilhe o link com o cliente." });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setAtivandoPortal(false);
    }
  }

  async function handleCopyUrl() {
    if (!portalUrl) return;
    await navigator.clipboard.writeText(portalUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  }

  async function handleRetrySol(sol: SolicitacaoAdmin) {
    setRetrying(true);
    try {
      const res = await fetch(
        `/api/arch/cenas/${sol.cenaId}/solicitacoes/${sol.id}/retry`,
        { method: "POST", headers: authH() },
      );
      if (!res.ok) throw new Error("Falha ao reprocessar.");
      setSolicitacoes(prev => prev.map(s =>
        s.id === sol.id ? { ...s, status: "pendente", imageUrl: null, versaoNum: null, versaoGeradaId: null } : s,
      ));
      setViewingSol(prev => prev?.id === sol.id
        ? { ...prev, status: "pendente", imageUrl: null, versaoNum: null, versaoGeradaId: null }
        : prev,
      );
      toast({ title: "Re-tentando…", description: "O render será gerado novamente." });
    } catch (e: unknown) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : "Erro.", variant: "destructive" });
    } finally {
      setRetrying(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-5 p-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!projeto) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <p className="text-destructive">Projeto não encontrado.</p>
        <Link href="/arch/projetos"><Button variant="outline" className="mt-4"><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button></Link>
      </div>
    );
  }

  return (
    <div className="arqdor-reference-ui max-w-6xl mx-auto space-y-5">
      {/* Back link */}
      <Link href="/arch/projetos">
        <Button variant="ghost" size="sm" className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> Projetos
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{projeto.titulo}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
            {projeto.clienteNome && <span>👤 {projeto.clienteNome}</span>}
            {projeto.tipoObra    && <span>🏗 {projeto.tipoObra}</span>}
            {projeto.areaM2      && <span>📐 {Number(projeto.areaM2).toFixed(0)} m²</span>}
            {projeto.orcamentoTotal && Number(projeto.orcamentoTotal) > 0 && (
              <span className="font-medium text-green-700">💰 {fmt(Number(projeto.orcamentoTotal))}</span>
            )}
          </div>
        </div>
        <StatusBadge status={projeto.status} />
      </div>

      {/* Atalhos principais do projeto — mantém o usuário dentro do mesmo contexto */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/20 p-3">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Continuar projeto</span>
        <Button type="button" size="sm" onClick={() => abrirRenderStudio(null)}>
          <Sparkles className="mr-1.5 h-4 w-4" /> Render
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => navigate(`/arch/studio?module=especificacao&project_id=${encodeURIComponent(projetoId)}`)}
        >
          <ClipboardList className="mr-1.5 h-4 w-4" /> Especificação
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setProjectTab("orcamento")}
        >
          <DollarSign className="mr-1.5 h-4 w-4" /> Orçamento
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => navigate(`/propostas?archProjectId=${encodeURIComponent(projetoId)}&returnTo=${encodeURIComponent(`/arch/projetos/${projetoId}`)}`)}
        >
          <ExternalLink className="mr-1.5 h-4 w-4" /> Proposta
        </Button>
      </div>

      {/* Fluxo integrado Vendor.ai */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Fluxo integrado Vendor.ai</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Cliente, negócio, proposta e obra usam os mesmos registros do Vendor.ai.
              </p>
            </div>
            <Link2 className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Cliente / CRM</p>
            <p className="mt-1 text-sm font-semibold truncate">{projeto.clienteNome || "Cliente"}</p>
            {projeto.leadId ? (
              <Link href={`/leads/${projeto.leadId}`}>
                <Button variant="outline" size="sm" className="mt-3 w-full">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Abrir cliente
                </Button>
              </Link>
            ) : (
              <p className="mt-3 text-xs text-amber-700">Ainda não vinculado ao CRM.</p>
            )}
          </div>

          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Negócio / Pipeline</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {dealCurrent?.titulo ?? (projeto.dealId ? "Negócio vinculado" : "Sem negócio")}
            </p>
            {dealCurrent ? (
              <>
                <p className="mt-1 text-xs text-muted-foreground">
                  {fmtDealStage(dealCurrent.etapa)}
                  {dealCurrent.valor && Number(dealCurrent.valor) > 0 ? ` · ${fmt(Number(dealCurrent.valor))}` : ""}
                </p>
                {dealCurrent.responsavelNome ? (
                  <p className="mt-1 truncate text-xs text-muted-foreground">Responsável: {dealCurrent.responsavelNome}</p>
                ) : null}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {projeto.leadId ? (
                    <Link href={`/trabalho/${projeto.leadId}?dealId=${dealCurrent.id}&from=arqdor`}>
                      <Button variant="outline" size="sm" className="w-full">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Abrir
                      </Button>
                    </Link>
                  ) : (
                    <Link href="/deals">
                      <Button variant="outline" size="sm" className="w-full">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Pipeline
                      </Button>
                    </Link>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setDealDialogOpen(true)}>
                    Trocar
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-xs text-muted-foreground">
                  Vincule este projeto ao negócio comercial do mesmo cliente.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => setDealDialogOpen(true)}
                >
                  <Link2 className="h-3.5 w-3.5 mr-1.5" /> Vincular negócio
                </Button>
              </>
            )}
          </div>

          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Propostas</p>
            {propostasLoading ? <p className="mt-1 text-sm text-muted-foreground">Carregando propostas...</p> : propostasContexto.length ? (
              <>
                <p className="mt-1 text-sm font-semibold">{propostasContexto.length} {propostasContexto.length === 1 ? "proposta disponível" : "propostas disponíveis"}</p>
                <div className="mt-2 max-h-28 space-y-1 overflow-y-auto">
                  {propostasContexto.map((p) => <button key={p.id} type="button" onClick={() => navigate(`/propostas?edit=${encodeURIComponent(p.id)}`)} className="w-full rounded-md border bg-background px-2 py-1.5 text-left hover:bg-muted/40"><p className="truncate text-xs font-medium">{p.numero ? `#${p.numero} · ` : ""}{p.titulo}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{p.status}{p.valorTotal ? ` · R$ ${Number(p.valorTotal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""}</p></button>)}
                </div>
                <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => navigate(`/propostas?${project.leadId ? `leadId=${encodeURIComponent(project.leadId)}` : `dealId=${encodeURIComponent(project.dealId ?? "")}`}`)}>Ver todas</Button>
              </>
            ) : <p className="mt-1 text-xs text-muted-foreground">Nenhuma proposta encontrada para este cliente/negócio.</p>}
          </div>

          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Obra / execução</p>
            <p className="mt-1 text-sm font-semibold">{projeto.obraId ? "Obra vinculada" : "Sem obra"}</p>
            {projeto.obraId ? (
              <Link href={`/obras/${projeto.obraId}`}>
                <Button variant="outline" size="sm" className="mt-3 w-full">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Abrir obra
                </Button>
              </Link>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">Quando aprovada, a execução pode continuar na Gestão de Obras.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <Tabs value={projectTab} onValueChange={setProjectTab}>
        <TabsList>
          <TabsTrigger value="orcamento">Orçamento</TabsTrigger>
          <TabsTrigger value="ambientes">Ambientes</TabsTrigger>
          <TabsTrigger value="renders">Renders ({renders.filter((render) => render.status === "concluido").length})</TabsTrigger>
          <TabsTrigger value="cenas">Cenas 3D</TabsTrigger>
          <TabsTrigger value="portal">Portal</TabsTrigger>
          <TabsTrigger
            value="solicitacoes"
            onClick={() => { if (!solLoaded) loadSolicitacoes(); }}
          >
            {(() => {
              const n = solicitacoes.filter(s => s.status === "pendente" || s.status === "processando").length;
              return n > 0 ? `Solicitações (${n})` : "Solicitações";
            })()}
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════
            ABA: ORÇAMENTO
        ════════════════════════════════════════════════════════════════ */}
        <TabsContent value="orcamento" className="space-y-4 mt-4">
          <div className="rounded-lg border bg-muted/20 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold">O que este cliente quer orçar?</p>
              {projeto?.escopoOrcamento?.tipos?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {projeto.escopoOrcamento.tipos.map((tipo) => (
                    <span key={tipo} className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium">
                      {ESCOPO_ORCAMENTO_OPTIONS.find((option) => option.value === tipo)?.label ?? tipo}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Defina o escopo antes de gerar o orçamento.</p>
              )}
              {projeto?.escopoOrcamento?.observacoes && (
                <p className="mt-2 text-xs text-muted-foreground">{projeto.escopoOrcamento.observacoes}</p>
              )}
            </div>
            <Button variant="outline" onClick={openBudgetScope} className="shrink-0">
              <Pencil className="h-4 w-4 mr-2" />
              {projeto?.escopoOrcamento?.tipos?.length ? "Editar escopo" : "Definir escopo"}
            </Button>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={gerarIA} disabled={gerandoIA}>
              {gerandoIA
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Atualizando orçamento...</>
                : <><Sparkles className="h-4 w-4 mr-2" />Gerar pela especificação</>}
            </Button>
            <Button onClick={openAddItem}>
              <Plus className="h-4 w-4 mr-2" /> Adicionar item
            </Button>
            <Button
              variant="secondary"
              disabled={grupos.length === 0}
              onClick={() => {
                const params = new URLSearchParams({
                  new: "1",
                  archProjectId: projetoId,
                  returnTo: `/arch/projetos/${projetoId}`,
                });
                if (projeto?.leadId) params.set("leadId", projeto.leadId);
                if (projeto?.dealId) params.set("dealId", projeto.dealId);
                navigate(`/propostas?${params.toString()}`);
              }}
            >
              <ClipboardList className="h-4 w-4 mr-2" /> Gerar proposta
            </Button>
          </div>

          {orcLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : grupos.length === 0 ? (
            <div className="rounded-lg border p-12 text-center">
              <DollarSign className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground font-medium">Nenhum item no orçamento ainda</p>
              <p className="text-sm text-muted-foreground mt-1">
                Primeiro confirme a especificação do projeto. Depois use "Gerar pela especificação" ou adicione um item manualmente.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(byAmbiente).map(([ambKey, cats]) => (
                <div key={ambKey}>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                    {ambKey === "__sem__" ? "Sem ambiente" : nomeAmbiente(cats[0].ambienteId)}
                  </h3>

                  <div className="space-y-3">
                    {cats.map((grupo) => (
                      <div key={`${grupo.ambienteId}-${grupo.categoria}`} className="rounded-lg border overflow-hidden">
                        <div className="bg-muted/40 px-4 py-2 flex items-center justify-between border-b">
                          <span className="text-sm font-medium">{grupo.categoria ?? "Sem categoria"}</span>
                          <span className="text-sm text-muted-foreground">{fmt(grupo.totalCategoria)}</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="text-muted-foreground bg-background border-b">
                              <tr>
                                <th className="px-4 py-2 text-left font-medium">Descrição</th>
                                <th className="px-4 py-2 text-right font-medium">Qtd</th>
                                <th className="px-4 py-2 text-left font-medium hidden sm:table-cell">Unidade</th>
                                <th className="px-4 py-2 text-right font-medium hidden md:table-cell">Valor Unit.</th>
                                <th className="px-4 py-2 text-right font-medium">Total</th>
                                <th className="px-4 py-2 text-left font-medium hidden lg:table-cell">Fornecedor</th>
                                <th className="px-4 py-2 text-center font-medium">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y bg-background">
                              {grupo.itens.map((item) => (
                                <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-2">
                                      <span>{item.descricao}</span>
                                      {item.geradoPorIa && (
                                        <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                                          IA
                                        </span>
                                      )}
                                      {item.produtoId && (
                                        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                                          Catálogo
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-right">{Number(item.quantidade)}</td>
                                  <td className="px-4 py-2.5 hidden sm:table-cell text-muted-foreground">{item.unidade ?? "—"}</td>
                                  <td className="px-4 py-2.5 text-right hidden md:table-cell">{fmt(Number(item.valorUnitario))}</td>
                                  <td className="px-4 py-2.5 text-right font-medium">{fmt(Number(item.valorTotal))}</td>
                                  <td className="px-4 py-2.5 hidden lg:table-cell text-muted-foreground text-xs">{item.fornecedor ?? "—"}</td>
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center justify-center gap-0.5">
                                      <Button
                                        variant="ghost" size="sm" className="h-7 w-7 p-0"
                                        title="Editar"
                                        onClick={() => openEditItem(item)}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600"
                                        title="Vincular produto do catálogo"
                                        onClick={() => openVincular(item)}
                                      >
                                        <Link2 className="h-3.5 w-3.5" />
                                      </Button>
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" title="Excluir">
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Excluir item?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              Esta ação não pode ser desfeita.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => deleteItem(item.id)} disabled={deletingItemId !== null}>
                                              {deletingItemId === item.id ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Excluindo...</> : "Excluir"}
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Total Geral */}
              <div className="flex justify-end pt-2">
                <div className="rounded-xl border bg-green-50 px-6 py-3.5 flex items-center gap-6">
                  <span className="text-sm font-medium text-muted-foreground">Total Geral</span>
                  <span className="text-2xl font-bold text-green-700">{fmt(totalGeral)}</span>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            ABA: AMBIENTES
        ════════════════════════════════════════════════════════════════ */}
        <TabsContent value="ambientes" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button onClick={openAddAmbiente}>
              <Plus className="h-4 w-4 mr-2" /> Adicionar ambiente
            </Button>
          </div>

          {ambientes.length === 0 ? (
            <div className="rounded-lg border p-12 text-center">
              <LayoutGrid className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground font-medium">Nenhum ambiente cadastrado</p>
              <p className="text-sm text-muted-foreground mt-1">Adicione ambientes para organizar o orçamento por cômodo.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ambientes.map((amb) => {
                const n = countItens(amb.id);
                return (
                  <Card key={amb.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base truncate">{amb.nome}</CardTitle>
                        <div className="flex gap-0.5 shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditAmbiente(amb)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir ambiente?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Os itens de orçamento vinculados a este ambiente perderão a referência.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteAmbiente(amb.id)} disabled={deletingAmbienteId !== null}>
                                  {deletingAmbienteId === amb.id ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Excluindo...</> : "Excluir"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-1">
                        {amb.areaM2 && (
                          <p className="text-sm text-muted-foreground">📐 {Number(amb.areaM2).toFixed(1)} m²</p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {n} {n === 1 ? "item" : "itens"} no orçamento
                        </p>
                        {amb.descricao && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{amb.descricao}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                        <span className="rounded-full border px-2 py-1">{rendersDoAmbiente(amb).length} renders</span>
                        <span className="rounded-full border px-2 py-1">{arquivosDoAmbiente(amb).length} arquivos</span>
                        {projeto?.dossieProjeto?.briefing || projeto?.descricao ? <span className="rounded-full border px-2 py-1">Briefing</span> : null}
                      </div>
                      <Button variant="outline" size="sm" className="w-full" onClick={() => setViewingAmbiente(amb)}>
                        <FolderOpen className="mr-2 h-4 w-4" /> Abrir ambiente
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            ABA: RENDERS
        ════════════════════════════════════════════════════════════════ */}
        <TabsContent value="renders" className="space-y-5 mt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold">Renders do projeto</h3>
              <p className="text-sm text-muted-foreground">
                Todo render gerado no Render IA fica salvo aqui e também na Biblioteca de Mídias.
              </p>
            </div>
            <Button onClick={() => abrirRenderStudio(null)}>
              <Sparkles className="h-4 w-4 mr-2" /> Novo render
            </Button>
          </div>

          {renders.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <Image className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="font-medium">Nenhum render salvo neste projeto</p>
              <p className="text-sm text-muted-foreground mt-1">
                Gere o primeiro render e ele será vinculado automaticamente ao projeto e ao ambiente.
              </p>
              <Button className="mt-4" onClick={() => abrirRenderStudio(null)}>
                <Sparkles className="h-4 w-4 mr-2" /> Gerar primeiro render
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(rendersPorAmbiente).map(([ambienteNome, ambienteRenders]) => {
                const concluidos = ambienteRenders.filter((render) => render.status === "concluido" && render.resultImageUrl);
                const latest = concluidos[0] ?? ambienteRenders[0];
                return (
                  <section key={ambienteNome} className="rounded-xl border bg-card overflow-hidden">
                    <div className="flex items-center justify-between gap-3 border-b px-4 py-3 bg-muted/20">
                      <div>
                        <h4 className="font-semibold">{ambienteNome}</h4>
                        <p className="text-xs text-muted-foreground">
                          {concluidos.length} {concluidos.length === 1 ? "render concluído" : "renders concluídos"} · {ambienteRenders.length} versões
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => abrirRenderStudio(latest?.ambiente ?? ambienteNome)}>
                        <Plus className="h-4 w-4 mr-1.5" /> Novo neste ambiente
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                      {ambienteRenders.map((render, index) => {
                        const imageUrl = normalizeRenderMediaUrl(render.resultImageUrl ?? render.originalImageUrl);
                        const aprovado = Boolean(render.approvedAt) || render.versionTag === "aprovado";
                        return (
                          <button
                            key={render.id}
                            type="button"
                            className="overflow-hidden rounded-lg border bg-background text-left hover:border-orange-300 hover:shadow-sm transition-all"
                            onClick={() => abrirRenderExistente(render)}
                          >
                            <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                              {imageUrl ? (
                                <img src={imageUrl} alt={`Render ${ambienteNome}`} className="h-full w-full object-cover" />
                              ) : (
                                <Image className="h-8 w-8 text-muted-foreground/30" />
                              )}
                            </div>
                            <div className="p-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium">Versão {ambienteRenders.length - index}</span>
                                <span className={`text-[11px] rounded-full px-2 py-0.5 ${aprovado ? "bg-green-50 text-green-700" : render.status === "concluido" ? "bg-blue-50 text-blue-700" : "bg-muted text-muted-foreground"}`}>
                                  {aprovado ? "Aprovado" : render.status === "concluido" ? "Concluído" : render.status}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {new Date(render.createdAt).toLocaleString("pt-BR")}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            ABA: CENAS 3D
        ════════════════════════════════════════════════════════════════ */}
        <TabsContent value="cenas" className="mt-4"
          onFocus={() => { if (!cenasLoaded) loadCenas(); }}
          onClick={() => { if (!cenasLoaded) loadCenas(); }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Cenas 3D</h3>
            <Button size="sm" onClick={() => { setCenaForm({ ...EMPTY_CENA }); setCatalogCenas([]); setCatalogBusca(""); setAddCenaOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Nova Cena
            </Button>
          </div>

          {cenasLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3].map(i => <Skeleton key={i} className="h-52 rounded-xl" />)}
            </div>
          )}

          {!cenasLoading && cenasLoaded && cenas.length === 0 && (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <Image className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="font-medium text-sm">Nenhuma cena ainda</p>
              <p className="text-xs text-muted-foreground mt-1">Clique em "Nova Cena" para gerar renders fotorrealistas com IA.</p>
            </div>
          )}

          {!cenasLoading && cenas.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {cenas.map(cena => {
                const st = cena.status ?? "rascunho";
                const badgeCls =
                  st === "concluido"    ? "bg-green-50 text-green-700 border-green-200" :
                  st === "renderizando" ? "bg-blue-50 text-blue-700 border-blue-200 animate-pulse" :
                  st === "erro"         ? "bg-red-50 text-red-700 border-red-200" :
                                          "bg-gray-100 text-gray-600 border-gray-200";
                const badgeLbl =
                  st === "concluido"    ? "Concluído" :
                  st === "renderizando" ? "Renderizando…" :
                  st === "erro"         ? "Erro" : "Rascunho";
                const ambNome = ambientes.find(a => a.id === cena.ambienteId)?.nome;

                return (
                  <Card key={cena.id} className="overflow-hidden">
                    {/* Thumbnail */}
                    <div className="relative h-40 bg-muted flex items-center justify-center">
                      {cena.renderUrl ? (
                        <img
                          src={cena.renderUrl}
                          alt={cena.nome ?? "Render"}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Image className="h-12 w-12 text-muted-foreground/30" />
                      )}
                      {st === "renderizando" && (
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <Loader2 className="h-8 w-8 text-white animate-spin" />
                        </div>
                      )}
                    </div>

                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{cena.nome ?? "Sem nome"}</p>
                          {ambNome && <p className="text-xs text-muted-foreground truncate">{ambNome}</p>}
                        </div>
                        <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badgeCls}`}>
                          {badgeLbl}
                        </span>
                      </div>

                      <div className="flex gap-1.5 flex-wrap">
                        {(st === "rascunho" || st === "erro") && (
                          <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => renderizarCena(cena.id)} disabled={renderingCenaId !== null}>
                            {renderingCenaId === cena.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                            {renderingCenaId === cena.id ? "Iniciando..." : "Renderizar"}
                          </Button>
                        )}
                        {st === "concluido" && cena.renderUrl && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setViewingCena(cena)}>
                            <Eye className="h-3 w-3 mr-1" /> Ver
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive">
                              <Trash2 className="h-3 w-3 mr-1" /> Excluir
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir cena?</AlertDialogTitle>
                              <AlertDialogDescription>
                                A cena e o render serão removidos permanentemente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteCena(cena.id)} disabled={deletingCenaId !== null} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                {deletingCenaId === cena.id ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Excluindo...</> : "Excluir"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            ABA: PORTAL
        ════════════════════════════════════════════════════════════════ */}
        <TabsContent value="portal" className="mt-4 space-y-5">
          {/* Toggle */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="font-semibold text-sm">Portal do Cliente</p>
                  <p className="text-xs text-muted-foreground">
                    Gere um link seguro onde o cliente pode acompanhar o projeto, ver renders e o orçamento aprovado.
                  </p>
                </div>
                <Switch
                  checked={!!(projeto?.portalAtivo)}
                  disabled={ativandoPortal || projeto?.portalAtivo}
                  onCheckedChange={(checked) => { if (checked && !projeto?.portalAtivo) handleActivatePortal(); }}
                />
              </div>

              {ativandoPortal && (
                <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Ativando portal…
                </div>
              )}

              {portalUrl && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <Globe className="h-4 w-4 shrink-0 text-green-600" />
                    <span className="text-xs font-mono break-all flex-1">{portalUrl}</span>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCopyUrl} title="Copiar link">
                        {copiedUrl ? <CheckCircle className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                      <a href={portalUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Abrir portal">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    </div>
                  </div>
                  <p className="text-xs text-green-700 font-medium flex items-center gap-1">
                    <CheckCircle className="h-3.5 w-3.5" /> Portal ativo — qualquer pessoa com o link pode acessar.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Preview do que o cliente verá */}
          <Card className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-medium">O que o cliente verá</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { icon: <LayoutGrid className="h-4 w-4 text-indigo-500" />, label: "Visão geral do projeto", desc: "Status, tipo de obra e metragem" },
                { icon: <Image className="h-4 w-4 text-violet-500" />,     label: "Renders 3D aprovados",   desc: "Cenas concluídas com visualização em tela cheia" },
                { icon: <DollarSign className="h-4 w-4 text-green-600" />, label: "Orçamento resumido",     desc: "Itens agrupados por ambiente, sem preços unitários" },
              ].map(({ icon, label, desc }) => (
                <div key={label} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <span className="mt-0.5">{icon}</span>
                  <div>
                    <p className="text-xs font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            ABA: SOLICITAÇÕES DE PERSONALIZAÇÃO
        ════════════════════════════════════════════════════════════════ */}
        <TabsContent
          value="solicitacoes"
          className="mt-4"
          onFocus={() => { if (!solLoaded) loadSolicitacoes(); }}
          onClick={() => { if (!solLoaded) loadSolicitacoes(); }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              Solicitações de personalização
            </h3>
            <Button variant="outline" size="sm" onClick={loadSolicitacoes} disabled={solLoading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${solLoading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          </div>

          {solLoading && !solLoaded && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}

          {solLoaded && solicitacoes.length === 0 && (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="font-medium text-sm">Nenhuma solicitação ainda</p>
              <p className="text-xs text-muted-foreground mt-1">
                Solicitações feitas pelo cliente no portal aparecerão aqui.
              </p>
            </div>
          )}

          {solLoaded && solicitacoes.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Cliente</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Cena</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">Itens</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden lg:table-cell">Texturas</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden sm:table-cell">Criado em</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden lg:table-cell">Versão</th>
                  </tr>
                </thead>
                <tbody className="divide-y bg-background">
                  {solicitacoes.map(sol => (
                    <tr
                      key={sol.id}
                      onClick={() => setViewingSol(sol)}
                      className="hover:bg-muted/20 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        {sol.clienteNome ?? <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {sol.cenaNome ?? sol.cenaId.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {sol.itensAdicionados && sol.itensAdicionados.length > 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {sol.itensAdicionados.map(i => ITEM_LABELS[i.tipo] ?? i.tipo).join(", ")}
                          </span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {sol.texturasAlteradas && sol.texturasAlteradas.length > 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {sol.texturasAlteradas.map(t => SUPERFICIE_LABELS[t.superficie] ?? t.superficie).join(", ")}
                          </span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <SolicitacaoBadge status={sol.status ?? "pendente"} />
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(sol.createdAt).toLocaleDateString("pt-BR", {
                          day: "2-digit", month: "2-digit", year: "2-digit",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                        {sol.versaoNum != null ? `Versão ${sol.versaoNum}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={scopeOpen} onOpenChange={setScopeOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>O que será orçado para este cliente?</DialogTitle></DialogHeader>
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">Selecione um ou mais escopos. O orçamento usa somente itens confirmados na especificação e pertencentes ao que foi contratado.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {ESCOPO_ORCAMENTO_OPTIONS.map((option) => {
                const selected = scopeForm.tipos.includes(option.value);
                return (
                  <button key={option.value} type="button" onClick={() => toggleBudgetScope(option.value)} className={`rounded-lg border p-3 text-left transition-colors ${selected ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold">{option.label}</span>
                      <span className={`h-4 w-4 rounded-full border ${selected ? "border-primary bg-primary" : "border-muted-foreground/40"}`} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                  </button>
                );
              })}
            </div>
            <div className="space-y-2">
              <Label>Itens existentes</Label>
              <Select value={scopeForm.tratamentoExistentes} onValueChange={(value) => setScopeForm((current) => ({ ...current, tratamentoExistentes: value as BudgetScopeForm["tratamentoExistentes"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="avaliar_individualmente">Avaliar item a item</SelectItem>
                  <SelectItem value="manter">Manter existentes — não orçar</SelectItem>
                  <SelectItem value="substituir">Substituir existentes dentro do escopo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Necessidades e observações do cliente</Label>
              <Textarea rows={4} value={scopeForm.observacoes} onChange={(event) => setScopeForm((current) => ({ ...current, observacoes: event.target.value }))} placeholder="Ex.: manter sofá e eletrodomésticos; trocar revestimentos; nova marcenaria da cozinha; não mexer na hidráulica..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setScopeOpen(false)} disabled={savingScope}>Cancelar</Button>
              <Button onClick={saveBudgetScope} disabled={savingScope || scopeForm.tipos.length === 0}>
                {savingScope && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar escopo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════
          DIALOG: Adicionar / Editar Item
      ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar item" : "Adicionar item"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveItem} className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Ambiente</Label>
                <Select value={itemForm.ambienteId} onValueChange={(v) => setItemForm((f) => ({ ...f, ambienteId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Sem ambiente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem ambiente</SelectItem>
                    {ambientes.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Select value={itemForm.categoria} onValueChange={(v) => setItemForm((f) => ({ ...f, categoria: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {categoriasOrdenadas.map(({ categoria: c, profundidade }) => (
                      <SelectItem key={c.id} value={c.nome}>
                        {"　".repeat(profundidade)}{profundidade > 0 ? "↳ " : ""}{c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1.5 text-xs"
                  onClick={() => openCatalogMasterForItem()}
                >
                  <Package className="mr-1.5 h-3.5 w-3.5" />
                  {editingItem?.produtoId ? "Editar no catálogo mestre" : "Cadastrar no catálogo mestre"}
                </Button>
              </div>

              <div className="col-span-2 space-y-1">
                <Label>Descrição *</Label>
                <Input
                  value={itemForm.descricao}
                  onChange={(e) => setItemForm((f) => ({ ...f, descricao: e.target.value }))}
                  placeholder="Ex: Sofá de 3 lugares"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label>Quantidade</Label>
                <Input type="number" min="0" step="0.01"
                  value={itemForm.quantidade}
                  onChange={(e) => setItemForm((f) => ({ ...f, quantidade: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Unidade</Label>
                <Input value={itemForm.unidade}
                  onChange={(e) => setItemForm((f) => ({ ...f, unidade: e.target.value }))}
                  placeholder="un, m², m, kg"
                />
              </div>

              <div className="space-y-1">
                <Label>Valor Unitário (R$)</Label>
                <Input type="number" min="0" step="0.01"
                  value={itemForm.valorUnitario}
                  onChange={(e) => setItemForm((f) => ({ ...f, valorUnitario: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Fornecedor</Label>
                <Input value={itemForm.fornecedor}
                  onChange={(e) => setItemForm((f) => ({ ...f, fornecedor: e.target.value }))}
                  placeholder="Nome do fornecedor"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddItemOpen(false)} disabled={savingItem}>Cancelar</Button>
              <Button type="submit" disabled={savingItem || !itemForm.descricao}>
                {savingItem ? "Salvando..." : editingItem ? "Salvar" : "Adicionar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {tenantId && (
        <CatalogoModal
          open={catalogMasterOpen}
          onClose={() => {
            setCatalogMasterOpen(false);
            setCatalogMasterProductId(null);
            setCatalogMasterDraft(null);
          }}
          tenantId={tenantId}
          initialProductId={catalogMasterProductId}
          initialCreateDraft={catalogMasterDraft}
          onProductSaved={(product) => void handleCatalogProductSaved(product)}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════
          DIALOG: Vincular Produto do Catálogo
      ═══════════════════════════════════════════════════════════════════ */}
      <Dialog
        open={!!vinculandoItem}
        onOpenChange={(o) => {
          if (!o) { setVinculandoItem(null); setCatalogResults([]); setSelectedProduto(null); setCatalogSearch(""); }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Vincular produto do catálogo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm text-muted-foreground">
              Item: <span className="font-medium text-foreground">{vinculandoItem?.descricao}</span>
            </p>

            <div className="flex gap-2">
              <Input
                placeholder="Buscar no catálogo..."
                value={catalogSearch}
                onChange={(e) => { setCatalogSearch(e.target.value); searchCatalogo(e.target.value); }}
              />
              <Button variant="outline" type="button" onClick={() => searchCatalogo(catalogSearch)}>
                <Search className="h-4 w-4" />
              </Button>
            </div>

            {catalogResults.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-lg border divide-y">
                {catalogResults.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => setSelectedProduto(p)}
                    className={`px-4 py-3 cursor-pointer flex items-center justify-between hover:bg-muted/50 transition-colors ${selectedProduto?.id === p.id ? "bg-primary/5 border-l-2 border-primary" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{p.nome}</p>
                      {(p.categoria || p.fornecedor) && (
                        <p className="text-xs text-muted-foreground">
                          {[p.categoria, p.fornecedor].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    {p.precoBase && (
                      <span className="text-sm font-medium text-green-700 ml-3 shrink-0">{fmt(Number(p.precoBase))}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {catalogSearch && catalogResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum produto encontrado no catálogo.</p>
            )}

            {selectedProduto && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
                <p className="text-sm font-medium text-green-800">✓ {selectedProduto.nome}</p>
                {selectedProduto.precoBase && (
                  <p className="text-xs text-green-700 mt-0.5">
                    O valor unitário será atualizado para {fmt(Number(selectedProduto.precoBase))}
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setVinculandoItem(null)} disabled={vinculando}>Cancelar</Button>
              <Button onClick={handleVincular} disabled={!selectedProduto || vinculando}>
                {vinculando ? "Vinculando..." : "Vincular"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingAmbiente} onOpenChange={(open) => { if (!open) setViewingAmbiente(null); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          {viewingAmbiente ? (() => {
            const ambRenders = rendersDoAmbiente(viewingAmbiente);
            const ambArquivos = arquivosDoAmbiente(viewingAmbiente);
            const ambMedidas = medidasDoAmbiente(viewingAmbiente);
            const briefing = projeto?.dossieProjeto?.briefing || projeto?.descricao || viewingAmbiente.descricao;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center justify-between gap-3 pr-8">
                    <span>{viewingAmbiente.nome}</span>
                    {viewingAmbiente.areaM2 ? <span className="text-sm font-normal text-muted-foreground">{Number(viewingAmbiente.areaM2).toFixed(1)} m²</span> : null}
                  </DialogTitle>
                </DialogHeader>

                <div className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
                  <div className="space-y-4">
                    <section className="rounded-xl border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">Projeto Arqdor</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            A abertura e edição do projeto começa por este ambiente, mantendo o mesmo projeto mestre.
                          </p>
                        </div>
                        <Button onClick={() => navigate(`/arch/studio?project_id=${encodeURIComponent(projetoId)}&ambiente_id=${encodeURIComponent(viewingAmbiente.id)}`)}>
                          <ExternalLink className="mr-2 h-4 w-4" /> Abrir projeto
                        </Button>
                      </div>
                    </section>

                    <section className="rounded-xl border p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">Renders do ambiente</p>
                          <p className="text-xs text-muted-foreground">As versões já geradas aparecem aqui automaticamente.</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => abrirRenderStudio(viewingAmbiente.nome)}>
                          <Sparkles className="mr-2 h-4 w-4" /> Novo render
                        </Button>
                      </div>
                      {ambRenders.length ? (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {ambRenders.map((render) => {
                            const src = normalizeRenderMediaUrl(render.resultImageUrl ?? render.originalImageUrl);
                            return (
                              <button key={render.id} type="button" onClick={() => abrirRenderExistente(render)} className="overflow-hidden rounded-lg border bg-muted/20 text-left hover:border-primary/40">
                                {src ? <img src={src} alt={viewingAmbiente.nome} className="aspect-[4/3] w-full object-cover" /> : <div className="flex aspect-[4/3] items-center justify-center text-muted-foreground"><Image className="h-8 w-8" /></div>}
                                <div className="p-2">
                                  <p className="text-xs font-medium">{render.versionTag || "Render"}</p>
                                  <p className="text-[11px] text-muted-foreground">{render.status}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum render vinculado a este ambiente.</div>
                      )}
                    </section>

                    <section className="rounded-xl border p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">Arquivos e anexos do projeto</p>
                          <p className="text-xs text-muted-foreground">SKP, DXF/DWG, IFC, PDF, fotos, documentos e outros arquivos ficam centralizados aqui.</p>
                        </div>
                        <div>
                          <input
                            ref={dossierFileInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            accept=".skp,.dxf,.dwg,.ifc,.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.txt"
                            onChange={(event) => void handleDossierUpload(event.target.files, viewingAmbiente.id)}
                          />
                          <Button size="sm" variant="outline" disabled={uploadingDossier} onClick={() => dossierFileInputRef.current?.click()}>
                            {uploadingDossier ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                            Adicionar arquivos
                          </Button>
                        </div>
                      </div>
                      {ambArquivos.length ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {ambArquivos.map((arquivo) => (
                            <a key={arquivo.id} href={arquivo.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/30">
                              {arquivo.tipo === "foto" || arquivo.tipo === "imagem" ? <Camera className="h-5 w-5 text-muted-foreground" /> : arquivo.tipo === "skp" || arquivo.tipo === "dxf" || arquivo.tipo === "ifc" ? <FileText className="h-5 w-5 text-muted-foreground" /> : <FileText className="h-5 w-5 text-muted-foreground" />}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{arquivo.nome}</p>
                                <p className="text-[11px] uppercase text-muted-foreground">{arquivo.tipo}{arquivo.size ? ` · ${(arquivo.size / 1024 / 1024).toFixed(1)} MB` : ""}</p>
                              </div>
                              <ExternalLink className="h-4 w-4 text-muted-foreground" />
                            </a>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Ainda não há arquivos anexados a este projeto/ambiente.</div>
                      )}
                    </section>
                  </div>

                  <div className="space-y-4">
                    <section className="rounded-xl border p-4">
                      <div className="mb-2 flex items-center gap-2"><ClipboardList className="h-4 w-4" /><p className="font-semibold">Briefing</p></div>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{briefing || "Briefing ainda não preenchido."}</p>
                    </section>
                    <section className="rounded-xl border p-4">
                      <div className="mb-2 flex items-center gap-2"><Ruler className="h-4 w-4" /><p className="font-semibold">Medidas</p></div>
                      <div className="space-y-2 text-sm">
                        {viewingAmbiente.areaM2 ? <div className="flex justify-between gap-3"><span className="text-muted-foreground">Área</span><strong>{Number(viewingAmbiente.areaM2).toFixed(2)} m²</strong></div> : null}
                        {ambMedidas.map((medida, index) => <div key={medida.id || `${medida.label}-${index}`} className="flex justify-between gap-3"><span className="text-muted-foreground">{medida.label}</span><strong>{medida.value}{medida.unit ? ` ${medida.unit}` : ""}</strong></div>)}
                        {!viewingAmbiente.areaM2 && ambMedidas.length === 0 ? <p className="text-muted-foreground">Nenhuma medida registrada.</p> : null}
                      </div>
                    </section>
                    <section className="rounded-xl border p-4">
                      <p className="font-semibold">Tudo do projeto, no mesmo lugar</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Arquivos gerais do projeto aparecem em todos os ambientes; arquivos enviados daqui ficam vinculados a este ambiente. Renders são associados automaticamente pelo nome do ambiente.
                      </p>
                    </section>
                  </div>
                </div>
              </>
            );
          })() : null}
        </DialogContent>
      </Dialog>

      <Dialog open={dealDialogOpen} onOpenChange={setDealDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Vincular à pipeline comercial</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Somente negócios do mesmo cliente e tenant podem ser vinculados a este projeto.
            </p>

            {dealOptions.length > 0 ? (
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {dealOptions.map((deal) => (
                  <button
                    key={deal.id}
                    type="button"
                    disabled={dealBusy}
                    onClick={() => void linkDeal(deal.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 ${dealCurrent?.id === deal.id ? "border-primary bg-primary/5" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{deal.titulo}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {fmtDealStage(deal.etapa)}
                          {deal.valor && Number(deal.valor) > 0 ? ` · ${fmt(Number(deal.valor))}` : ""}
                        </p>
                        {deal.responsavelNome ? (
                          <p className="mt-1 truncate text-xs text-muted-foreground">Responsável: {deal.responsavelNome}</p>
                        ) : null}
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${deal.active ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                        {deal.active ? "Ativo" : "Encerrado"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-5 text-center">
                <p className="text-sm font-medium">Nenhum negócio encontrado para este cliente.</p>
                <p className="mt-1 text-xs text-muted-foreground">Você pode criar um novo negócio já ligado a este projeto.</p>
              </div>
            )}

            <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-between">
              <Link href="/deals">
                <Button type="button" variant="ghost" className="w-full sm:w-auto">
                  <ExternalLink className="mr-1.5 h-4 w-4" /> Abrir pipeline
                </Button>
              </Link>
              <Button
                type="button"
                disabled={dealBusy || !projeto.leadId}
                onClick={() => void createDealForProject()}
              >
                {dealBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Criar negócio na pipeline
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════
          DIALOG: Adicionar / Editar Ambiente
      ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={addAmbienteOpen} onOpenChange={setAddAmbienteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAmbiente ? "Editar ambiente" : "Adicionar ambiente"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveAmbiente} className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input
                value={ambienteForm.nome}
                onChange={(e) => setAmbienteForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Sala de Estar"
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Área (m²)</Label>
              <Input type="number" min="0" step="0.01"
                value={ambienteForm.areaM2}
                onChange={(e) => setAmbienteForm((f) => ({ ...f, areaM2: e.target.value }))}
                placeholder="35"
              />
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea
                value={ambienteForm.descricao}
                onChange={(e) => setAmbienteForm((f) => ({ ...f, descricao: e.target.value }))}
                placeholder="Descrição do ambiente..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setAddAmbienteOpen(false)} disabled={savingAmbiente}>Cancelar</Button>
              <Button type="submit" disabled={savingAmbiente || !ambienteForm.nome}>
                {savingAmbiente ? "Salvando..." : editingAmbiente ? "Salvar" : "Adicionar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Nova Cena ─────────────────────────────────────────── */}
      <Dialog open={addCenaOpen} onOpenChange={setAddCenaOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Cena 3D</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveCena} className="space-y-4 mt-2">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label>Nome da cena</Label>
              <Input
                placeholder="Ex: Sala de Estar — Moderno"
                value={cenaForm.nome}
                onChange={e => setCenaForm(f => ({ ...f, nome: e.target.value }))}
              />
            </div>

            {/* Ambiente */}
            <div className="space-y-1.5">
              <Label>Ambiente</Label>
              <Select
                value={cenaForm.ambienteId}
                onValueChange={v => setCenaForm(f => ({ ...f, ambienteId: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Sem ambiente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem ambiente</SelectItem>
                  {ambientes.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Estilo */}
            <div className="space-y-1.5">
              <Label>Estilo</Label>
              <Select
                value={cenaForm.estilo}
                onValueChange={v => setCenaForm(f => ({ ...f, estilo: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESTILOS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Paleta de cores */}
            <div className="space-y-1.5">
              <Label>Paleta de cores <span className="text-muted-foreground text-xs">(selecione uma ou mais)</span></Label>
              <div className="flex gap-2 flex-wrap">
                {PALETA_CORES.map(cor => {
                  const sel = cenaForm.paleta.includes(cor.hex);
                  return (
                    <button
                      key={cor.hex}
                      type="button"
                      title={cor.label}
                      onClick={() => setCenaForm(f => ({
                        ...f,
                        paleta: sel
                          ? f.paleta.filter(h => h !== cor.hex)
                          : [...f.paleta, cor.hex],
                      }))}
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${sel ? "border-primary scale-110 shadow-md" : "border-gray-200"}`}
                      style={{ backgroundColor: cor.hex }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Iluminação */}
            <div className="space-y-1.5">
              <Label>Iluminação</Label>
              <Select
                value={cenaForm.iluminacao}
                onValueChange={v => setCenaForm(f => ({ ...f, iluminacao: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ILUMINACOES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Produtos do catálogo */}
            <div className="space-y-1.5">
              <Label>Produtos do catálogo <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Buscar produto..."
                  value={catalogBusca}
                  onChange={e => { setCatalogBusca(e.target.value); searchCatalogoCenas(e.target.value); }}
                />
              </div>
              {catalogCenas.length > 0 && (
                <div className="rounded-md border divide-y max-h-36 overflow-y-auto">
                  {catalogCenas.map(p => {
                    const chosen = cenaForm.produtosIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setCenaForm(f => ({
                          ...f,
                          produtosIds: chosen
                            ? f.produtosIds.filter(id => id !== p.id)
                            : [...f.produtosIds, p.id],
                        }))}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center gap-2 ${chosen ? "bg-primary/5" : ""}`}
                      >
                        {chosen
                          ? <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                          : <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground shrink-0" />}
                        <span className="flex-1 truncate">{p.nome}</span>
                        {p.categoria && <span className="text-muted-foreground">{p.categoria}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {cenaForm.produtosIds.length > 0 && (
                <p className="text-xs text-primary">{cenaForm.produtosIds.length} produto(s) selecionado(s)</p>
              )}
            </div>

            {/* Observações */}
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                placeholder="Descreva detalhes adicionais para o render..."
                rows={3}
                value={cenaForm.observacoes}
                onChange={e => setCenaForm(f => ({ ...f, observacoes: e.target.value }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddCenaOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={savingCena}>
                {savingCena ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando…</> : "Criar Cena"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Ver Render ────────────────────────────────────────── */}
      <Dialog open={!!viewingCena} onOpenChange={() => setViewingCena(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{viewingCena?.nome ?? "Render 3D"}</DialogTitle>
          </DialogHeader>
          {viewingCena?.renderUrl && (
            <div className="space-y-4">
              <img
                src={viewingCena.renderUrl}
                alt={viewingCena.nome ?? "Render"}
                className="w-full rounded-lg object-contain max-h-[60vh]"
              />
              <div className="flex justify-end gap-2">
                <a href={viewingCena.renderUrl} download target="_blank" rel="noopener noreferrer">
                  <Button variant="outline">
                    <ExternalLink className="h-4 w-4 mr-2" /> Download / Abrir
                  </Button>
                </a>
                <Button onClick={() => setViewingCena(null)}>Fechar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Detalhe de Solicitação ──────────────────────────────── */}
      <Dialog open={!!viewingSol} onOpenChange={o => { if (!o) setViewingSol(null); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Detalhes da Solicitação
            </DialogTitle>
          </DialogHeader>

          {viewingSol && (
            <div className="space-y-5 mt-2">
              {/* Meta */}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                {viewingSol.clienteNome && <span>👤 {viewingSol.clienteNome}</span>}
                <span>🎬 Cena: <strong className="text-foreground">{viewingSol.cenaNome ?? "—"}</strong></span>
                <span>📅 {new Date(viewingSol.createdAt).toLocaleString("pt-BR")}</span>
              </div>

              {/* Badge status */}
              <SolicitacaoBadge status={viewingSol.status ?? "pendente"} />

              {/* Itens adicionados */}
              {viewingSol.itensAdicionados && viewingSol.itensAdicionados.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Itens solicitados</p>
                  <div className="space-y-1.5">
                    {viewingSol.itensAdicionados.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
                        <span className="text-sm font-medium flex-1">{ITEM_LABELS[item.tipo] ?? item.tipo}</span>
                        <span className="text-xs text-muted-foreground">Posição: {item.posicao}</span>
                        <div className="flex items-center gap-1.5">
                          <div className="h-4 w-4 rounded-full border" style={{ backgroundColor: item.cor }} />
                          <span className="text-xs text-muted-foreground font-mono">{item.cor}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Texturas alteradas */}
              {viewingSol.texturasAlteradas && viewingSol.texturasAlteradas.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Texturas alteradas</p>
                  <div className="space-y-1.5">
                    {viewingSol.texturasAlteradas.map((tex, idx) => (
                      <div key={idx} className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
                        <span className="text-sm font-medium w-16">{SUPERFICIE_LABELS[tex.superficie] ?? tex.superficie}</span>
                        <span className="text-xs text-muted-foreground flex-1">{MATERIAL_LABELS[tex.material] ?? tex.material}</span>
                        <div className="flex items-center gap-1.5">
                          <div className="h-4 w-4 rounded-full border" style={{ backgroundColor: tex.cor }} />
                          <span className="text-xs text-muted-foreground font-mono">{tex.cor}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Observações */}
              {viewingSol.observacoes && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Observações</p>
                  <p className="text-sm bg-muted/40 rounded-lg px-3 py-2">{viewingSol.observacoes}</p>
                </div>
              )}

              {/* Imagem gerada */}
              {viewingSol.status === "concluido" && viewingSol.imageUrl && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Versão gerada {viewingSol.versaoNum != null ? `(v${viewingSol.versaoNum})` : ""}
                  </p>
                  <img
                    src={viewingSol.imageUrl.startsWith("/api")
                      ? `${getBase()}${viewingSol.imageUrl}`
                      : viewingSol.imageUrl}
                    alt="Render gerado"
                    className="w-full rounded-lg border object-contain max-h-64"
                  />
                  <div className="flex justify-end mt-2">
                    <a
                      href={viewingSol.imageUrl.startsWith("/api")
                        ? `${getBase()}${viewingSol.imageUrl}`
                        : viewingSol.imageUrl}
                      download={`render-v${viewingSol.versaoNum ?? "x"}.png`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="outline" size="sm">
                        <Download className="h-3.5 w-3.5 mr-1.5" /> Download
                      </Button>
                    </a>
                  </div>
                </div>
              )}

              {/* Erro + retry */}
              {viewingSol.status === "erro" && (
                <div className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-700">Falha no processamento</p>
                    <p className="text-xs text-red-600 mt-0.5">O render não pôde ser gerado. Tente novamente.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-300 text-red-700 hover:bg-red-50 shrink-0"
                    disabled={retrying}
                    onClick={() => handleRetrySol(viewingSol)}
                  >
                    {retrying
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <><RefreshCw className="h-3.5 w-3.5 mr-1" />Re-tentar</>
                    }
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
