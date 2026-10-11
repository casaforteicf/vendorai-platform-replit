import React, { lazy, Suspense, useCallback, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { getSegmentHints } from "@/lib/segmentHints";
import {
  useListTenantLeads,
  getListTenantLeadsQueryKey,
  getListDealsQueryKey,
  useListCustomerIntelligence,
  getListCustomerIntelligenceQueryKey,
  useListTenantBriefings,
  getListTenantBriefingsQueryKey,
  useListTenantUsers,
  getListTenantUsersQueryKey,
  useUpdateLead,
  Lead,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActiveWorkCard } from "@/components/ActiveLeadProcesses";
import {
  Search,
  ChevronRight,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Upload,
  FileDown,
  CheckCircle2,
  XCircle,
  Flame,
  Cloud,
  Snowflake,
  Trash2,
  UserRound,
  Tags,
  Pencil,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const ActiveLeadProcesses = lazy(() => import("@/components/ActiveLeadProcesses").then((m) => ({ default: m.ActiveLeadProcesses })));
const NewLeadDialog = lazy(() => import("@/components/NewLeadDialog").then((m) => ({ default: m.NewLeadDialog })));
const LeadQuickEditButton = lazy(() => import("@/components/LeadQuickEditButton").then((m) => ({ default: m.LeadQuickEditButton })));

const LEAD_STATUSES = [
  { value: "novo", label: "Novo" },
  { value: "qualificado", label: "Qualificado" },
  { value: "nao_qualificado", label: "Não qualificado" },
  { value: "convertido", label: "Convertido" },
  { value: "perdido", label: "Perdido" },
  { value: "quente", label: "Quente" },
];

const STATUS_STYLES: Record<string, string> = {
  novo: "bg-blue-100 text-blue-700 border-blue-200",
  qualificado: "bg-emerald-100 text-emerald-700 border-emerald-200",
  nao_qualificado: "bg-zinc-100 text-zinc-600 border-zinc-200",
  convertido: "bg-violet-100 text-violet-700 border-violet-200",
  perdido: "bg-red-100 text-red-600 border-red-200",
  quente: "bg-amber-100 text-amber-700 border-amber-200",
};

const NO_SEGMENT = "__sem_segmento__";

type ActiveProcess = {
  pipeline: string;
  etapa: string;
  label: string;
  id: string;
  codigo?: string;
};

type LeadsOverviewContext = {
  activeProcessesByLeadId: Record<string, ActiveProcess[]>;
  proposalTotalsByLeadId: Record<string, string>;
  userLabelsById: Record<string, string>;
};

type ParsedLeadRow = {
  nome: string;
  telefone: string;
  endereco: string;
  email: string;
  instagram: string;
  empresa: string;
  status: string;
  responsavel: string;
  camposExtras: Record<string, string>;
};

function getFirstChurnReason(reasons: unknown[] | null | undefined): string | null {
  if (!reasons || reasons.length === 0) return null;
  const first = reasons[0];
  if (typeof first === "string") return first;
  if (
    first &&
    typeof first === "object" &&
    "reason" in first &&
    typeof (first as Record<string, unknown>).reason === "string"
  ) {
    return (first as Record<string, unknown>).reason as string;
  }
  return null;
}

function BriefingBadge({ briefing }: { briefing: { needThermometer?: string | null } | undefined }) {
  if (!briefing?.needThermometer) return null;
  const t = briefing.needThermometer;

  if (t === "hot") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-red-50 text-red-600 border border-red-100">
        <Flame className="h-3 w-3" /> Hot
      </span>
    );
  }
  if (t === "warm") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-100">
        <Cloud className="h-3 w-3" /> Warm
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-slate-50 text-slate-500 border border-slate-100">
      <Snowflake className="h-3 w-3" /> Cold
    </span>
  );
}

function churnBadge(risk: number | null | undefined, reasons?: unknown[] | null) {
  if (risk === null || risk === undefined) return null;
  const firstReason = getFirstChurnReason(reasons);
  let badge: React.ReactNode;

  if (risk > 70) {
    badge = <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 font-mono text-xs">{risk}%</Badge>;
  } else if (risk >= 30) {
    badge = <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 font-mono text-xs">{risk}%</Badge>;
  } else {
    badge = <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 font-mono text-xs">{risk}%</Badge>;
  }

  if (!firstReason) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-[240px] text-center">{firstReason}</TooltipContent>
    </Tooltip>
  );
}

function getLeadSegment(lead: Lead): string {
  const direct = typeof lead.mercadoSegmento === "string" ? lead.mercadoSegmento.trim() : "";
  if (direct) return direct;

  const anyLead = lead as any;
  const candidates = [
    anyLead?.dadosPj?.segmento,
    anyLead?.metadata?.segmento,
    anyLead?.metadata?.Segmento,
    anyLead?.metadata?.setor,
    anyLead?.metadata?.nicho,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

function SegmentBadge({ segment }: { segment: string }) {
  if (!segment) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge
      variant="secondary"
      className="max-w-[220px] truncate bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-50"
      title={segment}
    >
      <Tags className="h-3 w-3 mr-1 shrink-0" />
      <span className="truncate">{segment}</span>
    </Badge>
  );
}

function EditableSegmentBadge({ lead }: { lead: Lead }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateSegment = useUpdateLead();
  const segment = getLeadSegment(lead);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(segment);

  function openEditor(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setDraft(segment);
    setOpen(true);
  }

  function saveSegment() {
    const nextSegment = draft.trim();
    const currentDadosPj = (lead as any).dadosPj;
    const data: Record<string, unknown> = { mercadoSegmento: nextSegment || null };

    if (currentDadosPj && typeof currentDadosPj === "object") {
      data.dadosPj = { ...currentDadosPj, segmento: nextSegment || null };
    }

    updateSegment.mutate(
      { id: lead.id, data: data as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTenantLeadsQueryKey(lead.tenantId) });
          queryClient.invalidateQueries({ queryKey: ["leads-overview-context", lead.tenantId] });
          setOpen(false);
          toast({
            title: nextSegment ? "Segmento atualizado" : "Segmento removido",
            description: nextSegment ? `${lead.nome} · ${nextSegment}` : `${lead.nome} ficou sem segmento definido.`,
          });
        },
        onError: () => toast({ title: "Não foi possível atualizar o segmento", variant: "destructive" }),
      },
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={openEditor}
        className="group inline-flex max-w-full items-center gap-1 rounded-md p-1 -m-1 text-left hover:bg-muted/70 transition-colors"
        title={segment ? "Clique para editar o segmento" : "Clique para informar o segmento"}
        data-testid={`edit-segment-${lead.id}`}
      >
        <SegmentBadge segment={segment} />
        <Pencil className="h-3 w-3 shrink-0 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) setDraft(segment);
        }}
      >
        <DialogContent className="max-w-sm" onClick={(event) => event.stopPropagation()}>
          <DialogHeader><DialogTitle>Segmento do lead</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Segmento</label>
              <Input
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ex.: Clínica odontológica"
                data-testid={`input-segment-${lead.id}`}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !updateSegment.isPending) saveSegment();
                  if (event.key === "Escape") setOpen(false);
                }}
              />
              <p className="text-xs text-muted-foreground">Use a atividade principal do cliente. Essa informação alimenta filtros e regras comerciais.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="button" onClick={saveSegment} disabled={updateSegment.isPending}>
                {updateSegment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const CSV_TEMPLATE =
  "nome,telefone,endereco,email,instagram,empresa,status,responsavel,cargo\nJoão Silva,(11) 99999-1111,Rua das Flores 123 São Paulo SP,joao@email.com,@joaosilva,Silva Materiais de Construção,novo,,Comprador\nMaria Souza,(21) 98888-2222,,maria@empresa.com.br,,,,Ana Paula,Gerente";

const KNOWN_LEAD_COLUMNS = new Set([
  "nome",
  "telefone",
  "endereco",
  "email",
  "instagram",
  "empresa",
  "status",
  "responsavel",
]);

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

function parseCsvRows(text: string): ParsedLeadRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const rawHeader = parseCsvLine(lines[0]!).map((header) => header.trim().toLowerCase());
  const idx = {
    nome: rawHeader.indexOf("nome"),
    telefone: rawHeader.indexOf("telefone"),
    endereco: rawHeader.indexOf("endereco"),
    email: rawHeader.indexOf("email"),
    instagram: rawHeader.indexOf("instagram"),
    empresa: rawHeader.indexOf("empresa"),
    status: rawHeader.indexOf("status"),
    responsavel: rawHeader.indexOf("responsavel"),
  };

  const extraColumns = lines[0]!
    .split(",")
    .map((header, index) => ({ name: header.trim(), key: rawHeader[index] ?? "", index }))
    .filter((column) => column.name && !KNOWN_LEAD_COLUMNS.has(column.key));

  return lines
    .slice(1)
    .map((line) => {
      const cols = parseCsvLine(line);
      const camposExtras: Record<string, string> = {};
      for (const column of extraColumns) {
        const value = (cols[column.index] ?? "").trim();
        if (value) camposExtras[column.name] = value;
      }
      return {
        nome: (idx.nome >= 0 ? cols[idx.nome] : cols[0] ?? "")?.trim() ?? "",
        telefone: (idx.telefone >= 0 ? cols[idx.telefone] : cols[1] ?? "")?.trim() ?? "",
        endereco: (idx.endereco >= 0 ? cols[idx.endereco] : cols[2] ?? "")?.trim() ?? "",
        email: (idx.email >= 0 ? cols[idx.email] : cols[3] ?? "")?.trim() ?? "",
        instagram: (idx.instagram >= 0 ? cols[idx.instagram] : cols[4] ?? "")?.trim() ?? "",
        empresa: (idx.empresa >= 0 ? cols[idx.empresa] ?? "" : "")?.trim() ?? "",
        status: (idx.status >= 0 ? cols[idx.status] ?? "" : "")?.trim() ?? "",
        responsavel: (idx.responsavel >= 0 ? cols[idx.responsavel] ?? "" : "")?.trim() ?? "",
        camposExtras,
      };
    })
    .filter((row) => row.nome.length > 0);
}

export default function Leads() {
  const { user, token, isEffectiveAdmin: isAdmin } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const hints = getSegmentHints(user?.tenantVertical);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const urlParams = new URLSearchParams(window.location.search);
  const urlFiltro = urlParams.get("filtro");
  const urlSearch = urlParams.get("search")?.trim() ?? "";
  const isChurnUrl = urlFiltro === "churn";
  const isQuenteUrl = urlFiltro === "quente";

  const [search, setSearch] = useState(urlSearch);
  const [segmentFilter, setSegmentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>(
    isChurnUrl ? "high_risk" : isQuenteUrl ? "quente" : "all",
  );
  const [churnSort, setChurnSort] = useState<"desc" | "asc" | null>(isChurnUrl ? "desc" : null);
  const [budgetSort, setBudgetSort] = useState<"desc" | "asc" | null>(null);
  const [maturityFilter, setMaturityFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"ativos" | "excluidos">("ativos");

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedLeadRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    errors: { row: number; message: string }[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [assignDialog, setAssignDialog] = useState<{
    open: boolean;
    leadId: string;
    currentAssignedTo: string | null;
  }>({ open: false, leadId: "", currentAssignedTo: null });
  const [assignSelectedUser, setAssignSelectedUser] = useState<string>("");
  const updateLead = useUpdateLead();

  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; lead: Lead | null }>({ open: false, lead: null });
  const [deleteMotivo, setDeleteMotivo] = useState("");

  // CRM-22: reaproveita o endpoint de listagem, com filtros processados no servidor.
  // "high_risk" e "quente" são categorias calculadas na tela, não status persistidos.
  const backendStatus = statusFilter !== "all" && statusFilter !== "high_risk" && statusFilter !== "quente"
    ? statusFilter : "";
  const backendSearch = search.trim();
  const { data: leads, isLoading: leadsLoading } = useQuery<Lead[]>({
    queryKey: [...getListTenantLeadsQueryKey(tenantId), "crm-22", backendStatus, backendSearch],
    enabled: !!tenantId && viewMode === "ativos",
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (backendStatus) params.set("status", backendStatus);
      if (backendSearch) params.set("busca", backendSearch);
      const response = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/leads?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Não foi possível carregar os leads");
      return response.json() as Promise<Lead[]>;
    },
  });

  const { data: excludedLeads, isLoading: excludedLoading } = useListTenantLeads(
    tenantId,
    { incluirExcluidos: "apenas" },
    {
      query: {
        enabled: !!tenantId && isAdmin && viewMode === "excluidos",
        queryKey: getListTenantLeadsQueryKey(tenantId, { incluirExcluidos: "apenas" }),
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  );

  const { data: ciList } = useListCustomerIntelligence(tenantId, {
    query: { enabled: !!tenantId, queryKey: getListCustomerIntelligenceQueryKey(tenantId), staleTime: 30_000, refetchOnWindowFocus: false },
  });

  const { data: overview } = useQuery<LeadsOverviewContext>({
    queryKey: ["leads-overview-context", tenantId],
    enabled: !!tenantId && viewMode === "ativos",
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/leads-overview-context`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`Erro ${response.status}`);
      return response.json();
    },
  });

  const { data: activeWorkCards = [] } = useQuery<ActiveWorkCard[]>({
    queryKey: ["leads-active-work-cards", tenantId],
    enabled: !!tenantId && viewMode === "ativos",
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/work-cards`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`Erro ${response.status}`);
      return response.json();
    },
  });

  const { data: briefings = [] } = useListTenantBriefings(tenantId, {
    query: { enabled: !!tenantId, queryKey: getListTenantBriefingsQueryKey(tenantId), staleTime: 30_000, refetchOnWindowFocus: false },
  });

  const { data: tenantUsers = [] } = useListTenantUsers(tenantId, {
    query: {
      enabled: !!tenantId && assignDialog.open,
      queryKey: getListTenantUsersQueryKey(tenantId),
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  });

  const userMap = new Map(Object.entries(overview?.userLabelsById ?? {}));
  const ciMap = new Map(ciList?.map((ci) => [ci.leadId, ci]) ?? []);
  const briefingMap = new Map(briefings.map((briefing) => [briefing.leadId, briefing]));
  const leadValorMap = new Map<string, string>(Object.entries(overview?.proposalTotalsByLeadId ?? {}));

  const segmentOptions = Array.from(
    new Map(
      (leads ?? [])
        .map((lead) => getLeadSegment(lead))
        .filter(Boolean)
        .map((segment) => [segment.toLocaleLowerCase("pt-BR"), segment]),
    ).values(),
  ).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));

  const deleteLead = useMutation({
    mutationFn: async ({ lead, motivo }: { lead: Lead; motivo: string }) => {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? "Não foi possível excluir o lead.");
      }
      return lead;
    },
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: getListTenantLeadsQueryKey(tenantId) });
      queryClient.invalidateQueries({ queryKey: getListTenantLeadsQueryKey(tenantId, { incluirExcluidos: "apenas" }) });
      queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) });
      toast({ title: "Lead excluído", description: `${lead.nome} foi movido pra aba Excluídos.` });
      setDeleteDialog({ open: false, lead: null });
      setDeleteMotivo("");
    },
    onError: (error: Error) => toast({ title: "Não foi possível excluir", description: error.message, variant: "destructive" }),
  });

  const restoreLead = useMutation({
    mutationFn: async (lead: Lead) => {
      const response = await fetch(`/api/leads/${lead.id}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? "Não foi possível restaurar o lead.");
      }
      return lead;
    },
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: getListTenantLeadsQueryKey(tenantId) });
      queryClient.invalidateQueries({ queryKey: getListTenantLeadsQueryKey(tenantId, { incluirExcluidos: "apenas" }) });
      queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) });
      toast({ title: "Lead restaurado", description: `${lead.nome} voltou pra lista ativa.` });
    },
    onError: (error: Error) => toast({ title: "Não foi possível restaurar", description: error.message, variant: "destructive" }),
  });

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const text = loadEvent.target?.result as string;
      setParsedRows(parseCsvRows(text));
      setImportResult(null);
    };
    reader.readAsText(file, "UTF-8");
  }, []);

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "template_leads.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (!parsedRows.length || !tenantId) return;
    setImporting(true);
    setImportResult(null);
    try {
      const response = await fetch(`${base}/api/tenants/${tenantId}/leads/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ leads: parsedRows }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast({ title: data.error ?? "Erro na importação", variant: "destructive" });
        return;
      }
      setImportResult(data);
      if (data.imported > 0) {
        queryClient.invalidateQueries({ queryKey: getListTenantLeadsQueryKey(tenantId) });
        toast({ title: `${data.imported} lead(s) importado(s) com sucesso!` });
      }
    } finally {
      setImporting(false);
    }
  }

  function resetImport() {
    setParsedRows([]);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function formatCurrency(value: string | null | undefined): string {
    if (!value) return "";
    const num = parseFloat(value);
    if (Number.isNaN(num)) return "";
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function confirmDeleteLead(lead: Lead) {
    setDeleteMotivo("");
    setDeleteDialog({ open: true, lead });
  }

  const filteredLeads = (leads ?? [])
    .filter((lead) => {
      const q = search.toLocaleLowerCase("pt-BR");
      const segment = getLeadSegment(lead);
      const normalizedSegment = segment.toLocaleLowerCase("pt-BR");

      const matchesSearch =
        !q ||
        lead.nome.toLocaleLowerCase("pt-BR").includes(q) ||
        lead.documento?.toLocaleLowerCase("pt-BR").includes(q) ||
        lead.email?.toLocaleLowerCase("pt-BR").includes(q) ||
        lead.empresa?.toLocaleLowerCase("pt-BR").includes(q) ||
        lead.telefone?.toLocaleLowerCase("pt-BR").includes(q) ||
        lead.endereco?.toLocaleLowerCase("pt-BR").includes(q) ||
        normalizedSegment.includes(q);

      const matchesSegment =
        segmentFilter === "all"
          ? true
          : segmentFilter === NO_SEGMENT
            ? !segment
            : normalizedSegment === segmentFilter.toLocaleLowerCase("pt-BR");

      const ci = ciMap.get(lead.id);
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "high_risk"
            ? typeof ci?.churnRisk === "number" && (ci?.churnRisk ?? 0) > 70
            : statusFilter === "quente"
              ? lead.status === "qualificado" || lead.status === "novo"
              : lead.status === statusFilter;

      const matchesMaturity =
        maturityFilter === "all"
          ? true
          : maturityFilter === "sem_resposta"
            ? !(lead as any).maturidadeIA
            : String((lead as any).maturidadeIA) === maturityFilter;

      return matchesSearch && matchesSegment && matchesStatus && matchesMaturity;
    })
    .sort((a, b) => {
      if (budgetSort) {
        const budgetA = Number.parseFloat(leadValorMap.get(a.id) ?? "");
        const budgetB = Number.parseFloat(leadValorMap.get(b.id) ?? "");
        const hasBudgetA = Number.isFinite(budgetA);
        const hasBudgetB = Number.isFinite(budgetB);

        if (!hasBudgetA && !hasBudgetB) return 0;
        if (!hasBudgetA) return 1;
        if (!hasBudgetB) return -1;
        return budgetSort === "desc" ? budgetB - budgetA : budgetA - budgetB;
      }
      if (isQuenteUrl) {
        const scoreA = a.status === "qualificado" ? 2 : a.status === "novo" ? 1 : 0;
        const scoreB = b.status === "qualificado" ? 2 : b.status === "novo" ? 1 : 0;
        return scoreB - scoreA;
      }
      if (!churnSort) return 0;
      const riskA = ciMap.get(a.id)?.churnRisk ?? null;
      const riskB = ciMap.get(b.id)?.churnRisk ?? null;
      if (riskA === null && riskB === null) return 0;
      if (riskA === null) return 1;
      if (riskB === null) return -1;
      return churnSort === "desc" ? riskB - riskA : riskA - riskB;
    });

  function toggleBudgetSort() {
    setBudgetSort((previous) => (previous === "desc" ? "asc" : "desc"));
    setChurnSort(null);
  }

  function toggleChurnSort() {
    setChurnSort((previous) => (previous === "desc" ? "asc" : "desc"));
    setBudgetSort(null);
  }

  return (
    <div className="vendor-product-page vendor-page-canvas vendor-leads-page space-y-5">
      <div className="vendor-product-hero flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="vendor-product-title">Leads</h1>
          <p className="vendor-product-subtitle">{leads?.length ?? 0} contatos cadastrados · visualize primeiro o que exige ação</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setLocation("/contacts-nonleads")}>Outros contatos</Button>

          <Dialog
            open={isImportOpen}
            onOpenChange={(open) => {
              setIsImportOpen(open);
              if (!open) resetImport();
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline"><Upload className="h-4 w-4 mr-2" /> Importar CSV</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Importar Leads via CSV</DialogTitle></DialogHeader>

              {!importResult ? (
                <div className="space-y-4">
                  <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-1">
                    <p className="font-medium">Formato esperado (colunas em ordem):</p>
                    <p className="font-mono text-xs text-muted-foreground">nome, telefone, endereco, email, instagram, empresa, status, responsavel</p>
                    <p className="text-xs text-muted-foreground">A primeira linha deve ser o cabeçalho. Colunas empresa/status/responsavel são opcionais. Máximo 500 leads por importação.</p>
                    <p className="text-xs text-muted-foreground">Colunas extras são preservadas no cadastro. Se a planilha tiver uma coluna segmento, ela também poderá ser exibida como tag.</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" size="sm" className="gap-2 text-primary" onClick={downloadTemplate}>
                      <FileDown className="h-4 w-4" /> Baixar planilha modelo
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsImportOpen(false);
                        setLocation("/leads/import-config");
                      }}
                    >
                      Mapeamento avançado
                    </Button>
                  </div>

                  <div
                    className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-sm font-medium">Clique para selecionar o arquivo CSV</p>
                    <p className="text-xs text-muted-foreground mt-1">ou arraste e solte aqui</p>
                    <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
                  </div>

                  {parsedRows.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-emerald-700">{parsedRows.length} lead(s) detectado(s) — prévia (primeiros 5):</p>
                      {(() => {
                        const extraKeys = Array.from(new Set(parsedRows.flatMap((row) => Object.keys(row.camposExtras))));
                        return extraKeys.length > 0 ? (
                          <p className="text-xs text-muted-foreground">Colunas extras detectadas: <span className="font-medium text-foreground">{extraKeys.join(", ")}</span></p>
                        ) : null;
                      })()}
                      <div className="overflow-x-auto rounded-lg border text-xs">
                        <table className="w-full">
                          <thead className="bg-muted/50">
                            <tr>
                              {["Nome", "Telefone", "Endereço", "Email", "Instagram", "Empresa", "Status", "Responsável"].map((header) => (
                                <th key={header} className="px-3 py-2 text-left font-medium">{header}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {parsedRows.slice(0, 5).map((row, index) => (
                              <tr key={index} className="hover:bg-muted/30">
                                <td className="px-3 py-1.5 font-medium">{row.nome}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{row.telefone || "—"}</td>
                                <td className="px-3 py-1.5 text-muted-foreground max-w-[120px] truncate">{row.endereco || "—"}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{row.email || "—"}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{row.instagram || "—"}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{row.empresa || "—"}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{row.status || "novo"}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{row.responsavel || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {parsedRows.length > 5 && <p className="text-xs text-muted-foreground text-center">… e mais {parsedRows.length - 5} lead(s)</p>}
                      <Button className="w-full gap-2" onClick={handleImport} disabled={importing}>
                        {importing ? (
                          <><Upload className="h-4 w-4 animate-bounce" /> Importando…</>
                        ) : (
                          <><Upload className="h-4 w-4" /> Importar {parsedRows.length} lead(s)</>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4 py-2">
                  <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-semibold text-emerald-800">{importResult.imported} lead(s) importado(s)</p>
                      {importResult.errors.length > 0 && <p className="text-xs text-emerald-700">{importResult.errors.length} linha(s) com erro ignorada(s)</p>}
                    </div>
                  </div>
                  {importResult.errors.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-sm font-medium flex items-center gap-1.5 text-red-600"><XCircle className="h-4 w-4" /> Erros:</p>
                      {importResult.errors.map((error) => (
                        <p key={error.row} className="text-xs text-muted-foreground">Linha {error.row}: {error.message}</p>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={resetImport}>Importar outro arquivo</Button>
                    <Button className="flex-1" onClick={() => { setIsImportOpen(false); resetImport(); }}>Fechar</Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Suspense fallback={null}>
            <NewLeadDialog
              tenantId={tenantId}
              token={token}
              isAdmin={isAdmin}
              leads={leads ?? []}
              companyPlaceholder={hints.leadEmpresaPlaceholder}
              objectivePlaceholder={hints.leadObjetivoPlaceholder}
              onNavigate={setLocation}
            />
          </Suspense>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant={viewMode === "ativos" ? "default" : "outline"} size="sm" onClick={() => setViewMode("ativos")}>Ativos</Button>
        {isAdmin && <Button
          variant={viewMode === "excluidos" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("excluidos")}
          className="gap-1.5"
        >
          <Trash2 className="h-3.5 w-3.5" /> Excluídos
          {excludedLeads && excludedLeads.length > 0 && <Badge variant="secondary" className="ml-0.5">{excludedLeads.length}</Badge>}
        </Button>}
      </div>

      {viewMode === "excluidos" ? (
        <Card>
          <CardContent className="p-0 divide-y">
            {excludedLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Carregando...</div>
            ) : !excludedLeads || excludedLeads.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Nenhum lead excluído.</div>
            ) : (
              excludedLeads.map((lead) => (
                <div key={lead.id} className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{lead.nome}</p>
                      <SegmentBadge segment={getLeadSegment(lead)} />
                    </div>
                    {lead.telefone && <p className="text-xs text-muted-foreground">{lead.telefone}</p>}
                    <p className="text-sm text-muted-foreground mt-1"><span className="font-medium text-foreground">Motivo:</span> {lead.motivoExclusao || "Não informado"}</p>
                    {lead.excluidoEm && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Excluído em {new Date(lead.excluidoEm).toLocaleDateString("pt-BR")} às {new Date(lead.excluidoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => restoreLead.mutate(lead)} disabled={restoreLead.isPending} className="shrink-0">Restaurar</Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="p-4 border-b flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="relative flex-1 min-w-[220px] lg:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                data-testid="input-search-leads"
                placeholder="Buscar por nome ou documento..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={segmentFilter} onValueChange={setSegmentFilter}>
              <SelectTrigger className="w-full sm:w-56" data-testid="select-segment-filter"><SelectValue placeholder="Filtrar por segmento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os segmentos</SelectItem>
                <SelectItem value={NO_SEGMENT}>Sem segmento</SelectItem>
                {segmentOptions.map((segment) => <SelectItem key={segment} value={segment}>{segment}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48" data-testid="select-status-filter"><SelectValue placeholder="Filtrar por status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="high_risk" data-testid="filter-high-risk">Alto risco (&gt;70)</SelectItem>
                <SelectItem value="quente">Quente</SelectItem>
                {LEAD_STATUSES.filter((status) => status.value !== "quente").map((status) => (
                  <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={maturityFilter} onValueChange={setMaturityFilter}>
              <SelectTrigger className="w-full sm:w-52" data-testid="select-maturity-filter"><SelectValue placeholder="Maturidade IA" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toda maturidade</SelectItem>
                <SelectItem value="1">✋ Manual, sem sistema</SelectItem>
                <SelectItem value="2">⚙️ Tem sistema, sem IA</SelectItem>
                <SelectItem value="3">🤖 Já usa IA/automação</SelectItem>
                <SelectItem value="sem_resposta">Sem resposta</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <CardContent className="p-0">
            <div className="md:hidden divide-y">
              {leadsLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="p-4 space-y-2 animate-pulse">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                ))
              ) : filteredLeads.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  {leads?.length === 0 ? "Nenhum lead cadastrado ainda." : "Nenhum resultado para os filtros aplicados."}
                </p>
              ) : (
                filteredLeads.map((lead) => {
                  const ci = ciMap.get(lead.id);
                  const isHighRisk = typeof ci?.churnRisk === "number" && ci.churnRisk > 70;
                  return (
                    <div
                      key={lead.id}
                      className={`flex items-center gap-2 p-4 cursor-pointer hover:bg-muted/50 active:bg-muted/80 transition-colors min-h-[72px] ${isHighRisk ? "border-l-4 border-l-red-500" : ""}`}
                      onClick={() => setLocation(`/leads/${lead.id}`)}
                      data-testid={`row-lead-${lead.id}`}
                    >
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          {isHighRisk && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                          <p className="font-medium text-sm truncate">{lead.nome}</p>
                        </div>
                        {lead.empresa && <p className="text-xs text-muted-foreground truncate">{lead.empresa}</p>}
                        <div><EditableSegmentBadge lead={lead} /></div>
                        <div className="flex items-center gap-1.5">
                          {lead.assignedTo && userMap.get(lead.assignedTo) && <p className="text-xs text-muted-foreground truncate">👤 {userMap.get(lead.assignedTo)}</p>}
                          {(lead as typeof lead & { representativeFunctionId?: string | null }).representativeFunctionId && <p className="text-xs text-muted-foreground truncate">🏢 Empresa representante</p>}
                          {isAdmin && (
                            <button
                              title="Atribuir responsável"
                              className="text-muted-foreground/50 hover:text-primary transition-colors shrink-0"
                              onClick={(event) => {
                                event.stopPropagation();
                                setAssignSelectedUser(lead.assignedTo ?? "");
                                setAssignDialog({ open: true, leadId: lead.id, currentAssignedTo: lead.assignedTo ?? null });
                              }}
                            >
                              <UserRound className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap pt-0.5">
                          <Badge variant="outline" className={`text-xs ${STATUS_STYLES[lead.status] ?? ""}`}>
                            {LEAD_STATUSES.find((status) => status.value === lead.status)?.label ?? lead.status}
                          </Badge>
                          <BriefingBadge briefing={briefingMap.get(lead.id)} />
                          {churnBadge(ci?.churnRisk, ci?.churnReasons)}
                          <Suspense fallback={null}>
                            <ActiveLeadProcesses
                              processes={overview?.activeProcessesByLeadId?.[lead.id]}
                              workCards={activeWorkCards}
                              onOpenDeal={(dealId) => setLocation(`/trabalho/${lead.id}?dealId=${encodeURIComponent(dealId)}`)}
                            />
                          </Suspense>
                          {leadValorMap.get(lead.id) && (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs font-mono">{formatCurrency(leadValorMap.get(lead.id))}</Badge>
                          )}
                        </div>
                      </div>

                      <Suspense fallback={null}><LeadQuickEditButton lead={lead} isAdmin={isAdmin} compact /></Suspense>
                      {isAdmin && (
                        <button
                          type="button"
                          title="Excluir lead"
                          aria-label={`Excluir ${lead.nome}`}
                          className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          disabled={deleteLead.isPending}
                          onClick={(event) => {
                            event.stopPropagation();
                            confirmDeleteLead(lead);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  );
                })
              )}
            </div>

            <div className="hidden md:block max-h-[calc(100dvh-22rem)] min-h-[320px] overflow-auto overscroll-contain">
              <TooltipProvider delayDuration={300}>
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_hsl(var(--border))]">
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Segmento</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Status do contato</TableHead>
                      <TableHead title="Um contato pode ter vários negócios simultâneos, e cada negócio pode ter vários processos operacionais.">Negócios / processos ativos</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead className="text-right" title="Maior valor de orçamento registrado para este contato.">
                        <button
                          type="button"
                          data-testid="sort-largest-budget"
                          onClick={toggleBudgetSort}
                          className="flex w-full items-center justify-end gap-1 hover:text-foreground transition-colors"
                          aria-label="Ordenar por maior orçamento"
                          title={budgetSort === "desc" ? "Ordenado do maior para o menor" : budgetSort === "asc" ? "Ordenado do menor para o maior" : "Ordenar por orçamento"}
                        >
                          Maior orçamento
                          {budgetSort === "desc" ? (
                            <ArrowDown className="h-3.5 w-3.5" />
                          ) : budgetSort === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                          )}
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          data-testid="sort-churn-risk"
                          onClick={toggleChurnSort}
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                          Churn Risk
                          {churnSort === "desc" ? (
                            <ArrowDown className="h-3.5 w-3.5" />
                          ) : churnSort === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                          )}
                        </button>
                      </TableHead>
                      <TableHead className="w-24 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leadsLoading ? (
                      Array.from({ length: 5 }).map((_, rowIndex) => (
                        <TableRow key={rowIndex}>
                          {Array.from({ length: 10 }).map((__, columnIndex) => (
                            <TableCell key={columnIndex}><div className="h-4 bg-muted animate-pulse rounded w-full max-w-[120px]" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : filteredLeads.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                          {leads?.length === 0 ? "Nenhum lead cadastrado ainda." : "Nenhum resultado para os filtros aplicados."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLeads.map((lead) => {
                        const ci = ciMap.get(lead.id);
                        const isHighRisk = typeof ci?.churnRisk === "number" && ci.churnRisk > 70;
                        return (
                          <TableRow
                            key={lead.id}
                            className={`cursor-pointer hover:bg-muted/50 ${isHighRisk ? "border-l-4 border-l-red-500" : ""}`}
                            onClick={() => setLocation(`/leads/${lead.id}`)}
                            data-testid={`row-lead-${lead.id}`}
                          >
                            <TableCell className="font-medium">
                              <span className="flex items-center gap-1.5">
                                {isHighRisk && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                                {lead.nome}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{lead.empresa || "—"}</TableCell>
                            <TableCell className="min-w-[150px] max-w-[240px]"><EditableSegmentBadge lead={lead} /></TableCell>
                            <TableCell className="text-muted-foreground font-mono text-sm">{lead.telefone || "—"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={STATUS_STYLES[lead.status] ?? ""}>
                                {LEAD_STATUSES.find((status) => status.value === lead.status)?.label ?? lead.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="min-w-[240px]">
                              <ActiveLeadProcesses
                                processes={overview?.activeProcessesByLeadId?.[lead.id]}
                                workCards={activeWorkCards}
                                onOpenDeal={(dealId) => setLocation(`/trabalho/${lead.id}?dealId=${encodeURIComponent(dealId)}`)}
                              />
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              <span className="flex items-center gap-2">
                                <span>{lead.assignedTo ? userMap.get(lead.assignedTo) ?? "—" : (lead as typeof lead & { representativeFunctionId?: string | null }).representativeFunctionId ? "Empresa representante" : "—"}</span>
                                {isAdmin && (
                                  <button
                                    title="Atribuir responsável"
                                    className="text-muted-foreground/50 hover:text-primary transition-colors shrink-0"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setAssignSelectedUser(lead.assignedTo ?? "");
                                      setAssignDialog({ open: true, leadId: lead.id, currentAssignedTo: lead.assignedTo ?? null });
                                    }}
                                  >
                                    <UserRound className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-emerald-700">{formatCurrency(leadValorMap.get(lead.id)) || "—"}</TableCell>
                            <TableCell>
                              <span className="flex items-center gap-1">
                                <BriefingBadge briefing={briefingMap.get(lead.id)} />
                                {churnBadge(ci?.churnRisk, ci?.churnReasons)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="flex items-center justify-end gap-1">
                                <Suspense fallback={null}><LeadQuickEditButton lead={lead} isAdmin={isAdmin} compact /></Suspense>
                                {isAdmin && (
                                  <button
                                    type="button"
                                    title="Excluir lead"
                                    aria-label={`Excluir ${lead.nome}`}
                                    className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    disabled={deleteLead.isPending}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      confirmDeleteLead(lead);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </TooltipProvider>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={assignDialog.open}
        onOpenChange={(open) => {
          if (!open) setAssignDialog({ open: false, leadId: "", currentAssignedTo: null });
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><UserRound className="h-4 w-4" /> Atribuir responsável</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <Select value={assignSelectedUser} onValueChange={setAssignSelectedUser}>
              <SelectTrigger><SelectValue placeholder="Selecionar vendedor..." /></SelectTrigger>
              <SelectContent>
                {tenantUsers.map((tenantUser) => (
                  <SelectItem key={tenantUser.id} value={tenantUser.id}>{tenantUser.name || tenantUser.email || tenantUser.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setAssignDialog({ open: false, leadId: "", currentAssignedTo: null })}>Cancelar</Button>
              <Button
                size="sm"
                disabled={updateLead.isPending || !assignSelectedUser}
                onClick={() => {
                  const newAssignedTo = assignSelectedUser;
                  updateLead.mutate(
                    { id: assignDialog.leadId, data: { assignedTo: newAssignedTo } },
                    {
                      onSuccess: () => {
                        queryClient.invalidateQueries({ queryKey: getListTenantLeadsQueryKey(tenantId) });
                        toast({ title: "Responsável atribuído com sucesso." });
                        setAssignDialog({ open: false, leadId: "", currentAssignedTo: null });
                      },
                      onError: () => toast({ title: "Erro ao atribuir responsável", variant: "destructive" }),
                    },
                  );
                }}
              >
                {updateLead.isPending ? "Salvando..." : "Confirmar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, lead: null })}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><Trash2 className="h-4 w-4" /> Excluir lead</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              {deleteDialog.lead?.nome} vai pra aba "Excluídos" — não é apagado de verdade, pode ser restaurado a qualquer momento.
            </p>
            <div>
              <label className="text-sm font-medium">Motivo (opcional)</label>
              <Input
                autoFocus
                placeholder="Ex: número inválido, contato pessoal, duplicado..."
                value={deleteMotivo}
                onChange={(event) => setDeleteMotivo(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && deleteDialog.lead) deleteLead.mutate({ lead: deleteDialog.lead, motivo: deleteMotivo });
                }}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteDialog({ open: false, lead: null })}>Cancelar</Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteLead.isPending}
                onClick={() => {
                  if (deleteDialog.lead) deleteLead.mutate({ lead: deleteDialog.lead, motivo: deleteMotivo });
                }}
              >
                {deleteLead.isPending ? "Excluindo..." : "Excluir"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
