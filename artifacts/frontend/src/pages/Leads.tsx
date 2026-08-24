import React, { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { getSegmentHints } from "@/lib/segmentHints";
import {
  useListTenantLeads,
  getListTenantLeadsQueryKey,
  useCreateLead,
  useCreateDeal,
  getListDealsQueryKey,
  useListCustomerIntelligence,
  getListCustomerIntelligenceQueryKey,
  useListPropostas,
  getListPropostasQueryKey,
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
import { Plus, Search, ChevronRight, AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Upload, FileDown, CheckCircle2, XCircle, Flame, Cloud, Snowflake, Trash2, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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

function getFirstChurnReason(reasons: unknown[] | null | undefined): string | null {
  if (!reasons || reasons.length === 0) return null;
  const first = reasons[0];
  if (typeof first === "string") return first;
  if (first && typeof first === "object" && "reason" in first && typeof (first as Record<string, unknown>).reason === "string") {
    return (first as Record<string, unknown>).reason as string;
  }
  return null;
}

function BriefingBadge({
  briefing,
}: {
  briefing: { needThermometer?: string | null } | undefined;
}) {
  if (!briefing?.needThermometer) return null;

  const t = briefing.needThermometer;
  if (t === "hot") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-red-50 text-red-600 border border-red-100">
        <Flame className="h-3 w-3" />
        Hot
      </span>
    );
  }
  if (t === "warm") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-100">
        <Cloud className="h-3 w-3" />
        Warm
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-slate-50 text-slate-500 border border-slate-100">
      <Snowflake className="h-3 w-3" />
      Cold
    </span>
  );
}

function churnBadge(risk: number | null | undefined, reasons?: unknown[] | null) {
  if (risk === null || risk === undefined) return null;

  const firstReason = getFirstChurnReason(reasons);

  let badge: React.ReactNode;
  if (risk > 70)
    badge = (
      <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 font-mono text-xs">
        {risk}%
      </Badge>
    );
  else if (risk >= 30)
    badge = (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 font-mono text-xs">
        {risk}%
      </Badge>
    );
  else
    badge = (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 font-mono text-xs">
        {risk}%
      </Badge>
    );

  if (!firstReason) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-[240px] text-center">{firstReason}</TooltipContent>
    </Tooltip>
  );
}

const formSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório"),
  telefone: z.string().optional().or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  empresa: z.string().optional().or(z.literal("")),
  objetivo: z.string().optional().or(z.literal("")),
});

interface ParsedLeadRow {
  nome: string;
  telefone: string;
  endereco: string;
  email: string;
  instagram: string;
  empresa: string;
  status: string;
  responsavel: string;
  // Colunas do CSV que não são nenhum campo padrão — nome da coluna
  // vira a chave, guardado no metadata do lead em vez de descartado.
  camposExtras: Record<string, string>;
}

const CSV_TEMPLATE = "nome,telefone,endereco,email,instagram,empresa,status,responsavel,cargo\nJoão Silva,(11) 99999-1111,Rua das Flores 123 São Paulo SP,joao@email.com,@joaosilva,Silva Materiais de Construção,novo,,Comprador\nMaria Souza,(21) 98888-2222,,maria@empresa.com.br,,,,Ana Paula,Gerente";

const KNOWN_LEAD_COLUMNS = new Set(["nome", "telefone", "endereco", "email", "instagram", "empresa", "status", "responsavel"]);

// Aspas-aware — mesma lógica já usada no import de catálogo (Propostas.tsx).
// Sem isso, qualquer célula com vírgula dentro (ex: endereço "Rua X, 123")
// quebra o alinhamento das colunas seguintes.
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      fields.push(cur.trim()); cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

function parseCsvRows(text: string): ParsedLeadRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const rawHeader = parseCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
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
  // Qualquer coluna do CSV que não seja um campo padrão (ex: "cargo",
  // "origem_lead", "aniversario") — guarda a posição + o nome original
  // (não normalizado) pra usar como chave no metadata do lead.
  const extraColumns = lines[0]!
    .split(",")
    .map((h, i) => ({ name: h.trim(), key: rawHeader[i] ?? "", index: i }))
    .filter((c) => c.name && !KNOWN_LEAD_COLUMNS.has(c.key));

  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const camposExtras: Record<string, string> = {};
    for (const col of extraColumns) {
      const value = (cols[col.index] ?? "").trim();
      if (value) camposExtras[col.name] = value;
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
  }).filter((r) => r.nome.length > 0);
}

export default function Leads() {
  const { user, token, isEffectiveAdmin: isAdmin } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const hints = getSegmentHints(user?.tenantVertical);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [duplicateDialog, setDuplicateDialog] = useState<{ open: boolean; lead: Lead | null; matchBy: string }>({ open: false, lead: null, matchBy: "" });
  const urlParams = new URLSearchParams(window.location.search);
  const urlFiltro = urlParams.get("filtro");
  const isChurnUrl = urlFiltro === "churn";
  const isQuenteUrl = urlFiltro === "quente";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(isChurnUrl ? "high_risk" : isQuenteUrl ? "quente" : "all");
  const [churnSort, setChurnSort] = useState<"desc" | "asc" | null>(isChurnUrl ? "desc" : null);
  const [maturityFilter, setMaturityFilter] = useState<string>("all");

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedLeadRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: { row: number; message: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [assignDialog, setAssignDialog] = useState<{ open: boolean; leadId: string; currentAssignedTo: string | null }>({ open: false, leadId: "", currentAssignedTo: null });
  const [assignSelectedUser, setAssignSelectedUser] = useState<string>("");
  const updateLead = useUpdateLead();
  const deleteLead = useMutation({
    mutationFn: async (lead: Lead) => {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? "Não foi possível excluir o lead.");
      }
      return lead;
    },
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: getListTenantLeadsQueryKey(tenantId) });
      queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) });
      toast({ title: "Lead excluído", description: `${lead.nome} foi removido.` });
    },
    onError: (error: Error) => toast({ title: "Não foi possível excluir", description: error.message, variant: "destructive" }),
  });

  function confirmDeleteLead(lead: Lead) {
    if (window.confirm(`Excluir definitivamente o lead ${lead.nome}? Esta ação não pode ser desfeita.`)) deleteLead.mutate(lead);
  }

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setParsedRows(parseCsvRows(text));
      setImportResult(null);
    };
    reader.readAsText(file, "UTF-8");
  }, []);

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template_leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (!parsedRows.length || !tenantId) return;
    setImporting(true);
    setImportResult(null);
    try {
      const r = await fetch(`${base}/api/tenants/${tenantId}/leads/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ leads: parsedRows }),
      });
      const data = await r.json();
      if (!r.ok) {
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

  const { data: leads, isLoading: leadsLoading } = useListTenantLeads(tenantId, {
    query: {
      enabled: !!tenantId,
      queryKey: getListTenantLeadsQueryKey(tenantId),
    },
  });

  const { data: ciList } = useListCustomerIntelligence(tenantId, {
    query: {
      enabled: !!tenantId,
      queryKey: getListCustomerIntelligenceQueryKey(tenantId),
    },
  });

  const { data: propostas } = useListPropostas(tenantId, undefined, {
    query: {
      enabled: !!tenantId,
      queryKey: getListPropostasQueryKey(tenantId),
    },
  });

  const { data: briefings = [] } = useListTenantBriefings(tenantId, {
    query: {
      enabled: !!tenantId,
      queryKey: getListTenantBriefingsQueryKey(tenantId),
    },
  });

  const { data: tenantUsers = [] } = useListTenantUsers(tenantId, {
    query: { enabled: !!tenantId, queryKey: getListTenantUsersQueryKey(tenantId) },
  });

  const userMap = new Map(tenantUsers.map((u) => [u.id, u.name || u.email || u.id]));

  const ciMap = new Map(ciList?.map((ci) => [ci.leadId, ci]) ?? []);

  const briefingMap = new Map(briefings.map((b) => [b.leadId, b]));

  // Map: leadId → maior valor total de proposta
  const leadValorMap = new Map<string, string>();
  for (const p of propostas ?? []) {
    if (!p.leadId || !p.valorTotal) continue;
    const current = leadValorMap.get(p.leadId);
    if (!current || parseFloat(p.valorTotal) > parseFloat(current)) {
      leadValorMap.set(p.leadId, p.valorTotal);
    }
  }

  function formatCurrency(value: string | null | undefined): string {
    if (!value) return "";
    const num = parseFloat(value);
    if (isNaN(num)) return "";
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  const createLead = useCreateLead();
  const createDeal = useCreateDeal();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { nome: "", telefone: "", email: "", empresa: "", objetivo: "" },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createLead.mutate(
      {
        data: {
          tenantId,
          nome: values.nome,
          telefone: values.telefone || null,
          email: values.email || null,
          empresa: values.empresa || null,
          objetivo: values.objetivo || null,
        },
      },
      {
        onSuccess: (newLead: any) => {
          const leadId = newLead?.id;
          createDeal.mutate(
            {
              data: {
                tenantId,
                titulo: values.empresa ? `${values.empresa} — ${values.nome}` : values.nome,
                etapa: "novo",
                leadId: leadId || undefined,
              },
            },
            {
              onSettled: () => {
                queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) });
              },
            }
          );
          toast({ title: "Lead criado e adicionado à pipeline." });
          queryClient.invalidateQueries({ queryKey: getListTenantLeadsQueryKey(tenantId) });
          setIsDialogOpen(false);
          form.reset();
        },
        onError: (err: any) => {
          if (err?.status === 409 && err?.data?.isDuplicate) {
            setDuplicateDialog({
              open: true,
              lead: err.data.lead ?? null,
              matchBy: err.data.matchBy ?? "",
            });
            return;
          }
          toast({ title: err?.data?.error ?? "Erro ao criar lead", variant: "destructive" });
        },
      }
    );
  }

  const filteredLeads = (leads ?? [])
    .filter((lead) => {
      const matchesSearch =
        lead.nome.toLowerCase().includes(search.toLowerCase()) ||
        lead.email?.toLowerCase().includes(search.toLowerCase()) ||
        lead.empresa?.toLowerCase().includes(search.toLowerCase());
      const ci = ciMap.get(lead.id);
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "high_risk"
            ? typeof ci?.churnRisk === "number" &&
              (ci?.churnRisk ?? 0) > 70
            : statusFilter === "quente"
              ? (lead.status === "qualificado" || lead.status === "novo")
              : lead.status === statusFilter;
      const matchesMaturity =
        maturityFilter === "all"
          ? true
          : maturityFilter === "sem_resposta"
            ? !(lead as any).maturidadeIA
            : String((lead as any).maturidadeIA) === maturityFilter;
      return matchesSearch && matchesStatus && matchesMaturity;
    })
    .sort((a, b) => {
      if (isQuenteUrl) {
        // Quente leads: prioritize qualificado over novo
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

  function toggleChurnSort() {
    setChurnSort((prev) => (prev === "desc" ? "asc" : "desc"));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {leads?.length ?? 0} contatos cadastrados
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* Import button + dialog */}
          <Dialog open={isImportOpen} onOpenChange={(v) => { setIsImportOpen(v); if (!v) resetImport(); }}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Importar CSV
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Importar Leads via CSV</DialogTitle>
              </DialogHeader>

              {!importResult ? (
                <div className="space-y-4">
                  {/* Instructions */}
                  <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-1">
                    <p className="font-medium">Formato esperado (colunas em ordem):</p>
                    <p className="font-mono text-xs text-muted-foreground">nome, telefone, endereco, email, instagram, empresa, status, responsavel</p>
                    <p className="text-xs text-muted-foreground">A primeira linha deve ser o cabeçalho. Colunas empresa/status/responsavel são opcionais — responsavel busca pelo nome do vendedor no seu time; se não achar ou ficar em branco, distribui automaticamente. Máximo 500 leads por importação.</p>
                    <p className="text-xs text-muted-foreground">Pode adicionar qualquer coluna extra (ex: cargo, origem, data de nascimento) — elas são guardadas no cadastro do lead e aparecem na ficha dele.</p>
                  </div>

                  {/* Template download */}
                  <Button variant="ghost" size="sm" className="gap-2 text-primary" onClick={downloadTemplate}>
                    <FileDown className="h-4 w-4" />
                    Baixar planilha modelo
                  </Button>

                  {/* File upload */}
                  <div
                    className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-sm font-medium">Clique para selecionar o arquivo CSV</p>
                    <p className="text-xs text-muted-foreground mt-1">ou arraste e solte aqui</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>

                  {/* Preview table */}
                  {parsedRows.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-emerald-700">
                        {parsedRows.length} lead(s) detectado(s) — prévia (primeiros 5):
                      </p>
                      {(() => {
                        const extraKeys = Array.from(new Set(parsedRows.flatMap((r) => Object.keys(r.camposExtras))));
                        return extraKeys.length > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Colunas extras detectadas (guardadas no cadastro do lead): <span className="font-medium text-foreground">{extraKeys.join(", ")}</span>
                          </p>
                        ) : null;
                      })()}
                      <div className="overflow-x-auto rounded-lg border text-xs">
                        <table className="w-full">
                          <thead className="bg-muted/50">
                            <tr>
                              {["Nome", "Telefone", "Endereço", "Email", "Instagram", "Empresa", "Status", "Responsável"].map((h) => (
                                <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {parsedRows.slice(0, 5).map((row, i) => (
                              <tr key={i} className="hover:bg-muted/30">
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
                      {parsedRows.length > 5 && (
                        <p className="text-xs text-muted-foreground text-center">… e mais {parsedRows.length - 5} lead(s)</p>
                      )}
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
                /* Result screen */
                <div className="space-y-4 py-2">
                  <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-semibold text-emerald-800">{importResult.imported} lead(s) importado(s)</p>
                      {importResult.errors.length > 0 && (
                        <p className="text-xs text-emerald-700">{importResult.errors.length} linha(s) com erro ignorada(s)</p>
                      )}
                    </div>
                  </div>
                  {importResult.errors.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-sm font-medium flex items-center gap-1.5 text-red-600">
                        <XCircle className="h-4 w-4" /> Erros:
                      </p>
                      {importResult.errors.map((e) => (
                        <p key={e.row} className="text-xs text-muted-foreground">Linha {e.row}: {e.message}</p>
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

          {/* New lead button + dialog */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-novo-lead">
                <Plus className="h-4 w-4 mr-2" />
                Novo Lead
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Novo Lead</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome *</FormLabel>
                      <FormControl>
                        <Input data-testid="input-nome" placeholder="Nome completo" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="telefone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefone</FormLabel>
                        <FormControl>
                          <PhoneInput data-testid="input-telefone" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input data-testid="input-email" placeholder="email@empresa.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="empresa"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Empresa</FormLabel>
                      <FormControl>
                        <Input data-testid="input-empresa" placeholder={hints.leadEmpresaPlaceholder} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="objetivo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Objetivo</FormLabel>
                      <FormControl>
                        <Input data-testid="input-objetivo" placeholder={hints.leadObjetivoPlaceholder} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createLead.isPending}
                  data-testid="button-submit-lead"
                >
                  {createLead.isPending ? "Salvando..." : "Salvar Lead"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card>
        <div className="p-4 border-b flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              data-testid="input-search-leads"
              placeholder="Buscar por nome, email ou empresa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48" data-testid="select-status-filter">
              <SelectValue placeholder="Filtrar por status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="high_risk" data-testid="filter-high-risk">
                Alto risco (&gt;70)
              </SelectItem>
              <SelectItem value="quente">
                Quente
              </SelectItem>
              {LEAD_STATUSES.filter((s) => s.value !== "quente").map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={maturityFilter} onValueChange={setMaturityFilter}>
            <SelectTrigger className="w-52" data-testid="select-maturity-filter">
              <SelectValue placeholder="Maturidade IA" />
            </SelectTrigger>
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
          {/* Mobile card list */}
          <div className="md:hidden divide-y">
            {leadsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 space-y-2 animate-pulse">
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
                    className={`flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50 active:bg-muted/80 transition-colors min-h-[72px] ${isHighRisk ? "border-l-4 border-l-red-500" : ""}`}
                    onClick={() => setLocation(`/leads/${lead.id}`)}
                    data-testid={`row-lead-${lead.id}`}
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5">
                        {isHighRisk && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                        <p className="font-medium text-sm truncate">{lead.nome}</p>
                      </div>
                      {lead.empresa && <p className="text-xs text-muted-foreground truncate">{lead.empresa}</p>}
                      <div className="flex items-center gap-1.5">
                        {lead.assignedTo && userMap.get(lead.assignedTo) && (
                          <p className="text-xs text-muted-foreground truncate">
                            👤 {userMap.get(lead.assignedTo)}
                          </p>
                        )}
                        {isAdmin && (
                          <button
                            title="Atribuir responsável"
                            className="text-muted-foreground/50 hover:text-primary transition-colors shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
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
                          {LEAD_STATUSES.find((s) => s.value === lead.status)?.label ?? lead.status}
                        </Badge>
                        <BriefingBadge briefing={briefingMap.get(lead.id)} />
                        {churnBadge(ci?.churnRisk, ci?.churnReasons)}
                        {leadValorMap.get(lead.id) && (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs font-mono">
                            {formatCurrency(leadValorMap.get(lead.id))}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {isAdmin && <button
                      type="button"
                      title="Excluir lead"
                      aria-label={`Excluir ${lead.nome}`}
                      className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      disabled={deleteLead.isPending}
                      onClick={(event) => { event.stopPropagation(); confirmDeleteLead(lead); }}
                    ><Trash2 className="h-4 w-4" /></button>}
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <TooltipProvider delayDuration={300}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="text-right">Orçamento</TableHead>
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
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {leadsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <TableCell key={j}>
                          <div className="h-4 bg-muted animate-pulse rounded w-full max-w-[120px]" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredLeads.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-12 text-muted-foreground"
                    >
                      {leads?.length === 0
                        ? "Nenhum lead cadastrado ainda."
                        : "Nenhum resultado para os filtros aplicados."}
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
                            {isHighRisk && (
                              <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                            )}
                            {lead.nome}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {lead.empresa || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-sm">
                          {lead.telefone || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={STATUS_STYLES[lead.status] ?? ""}
                          >
                            {LEAD_STATUSES.find((s) => s.value === lead.status)?.label ??
                              lead.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <span className="flex items-center gap-2">
                            <span>{lead.assignedTo ? (userMap.get(lead.assignedTo) ?? "—") : "—"}</span>
                            {isAdmin && (
                              <button
                                title="Atribuir responsável"
                                className="text-muted-foreground/50 hover:text-primary transition-colors shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAssignSelectedUser(lead.assignedTo ?? "");
                                  setAssignDialog({ open: true, leadId: lead.id, currentAssignedTo: lead.assignedTo ?? null });
                                }}
                              >
                                <UserRound className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-emerald-700">
                          {formatCurrency(leadValorMap.get(lead.id)) || "—"}
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1">
                            <BriefingBadge briefing={briefingMap.get(lead.id)} />
                            {churnBadge(ci?.churnRisk, ci?.churnReasons)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center justify-end gap-1">
                            {isAdmin && <button
                              type="button"
                              title="Excluir lead"
                              aria-label={`Excluir ${lead.nome}`}
                              className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              disabled={deleteLead.isPending}
                              onClick={(event) => { event.stopPropagation(); confirmDeleteLead(lead); }}
                            ><Trash2 className="h-4 w-4" /></button>}
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

      {/* Assign lead dialog */}
      <Dialog
        open={assignDialog.open}
        onOpenChange={(v) => {
          if (!v) setAssignDialog({ open: false, leadId: "", currentAssignedTo: null });
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRound className="h-4 w-4" />
              Atribuir responsável
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <Select value={assignSelectedUser} onValueChange={setAssignSelectedUser}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar vendedor..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem responsável</SelectItem>
                {tenantUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name || u.email || u.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAssignDialog({ open: false, leadId: "", currentAssignedTo: null })}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={updateLead.isPending}
                onClick={() => {
                  const newAssignedTo = assignSelectedUser === "__none__" ? null : (assignSelectedUser || null);
                  updateLead.mutate(
                    { id: assignDialog.leadId, data: { assignedTo: newAssignedTo } },
                    {
                      onSuccess: () => {
                        queryClient.invalidateQueries({ queryKey: getListTenantLeadsQueryKey(tenantId) });
                        toast({ title: "Responsável atribuído com sucesso." });
                        setAssignDialog({ open: false, leadId: "", currentAssignedTo: null });
                      },
                      onError: () => {
                        toast({ title: "Erro ao atribuir responsável", variant: "destructive" });
                      },
                    }
                  );
                }}
              >
                {updateLead.isPending ? "Salvando..." : "Confirmar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Duplicate merge dialog */}
      <Dialog open={duplicateDialog.open} onOpenChange={(v) => !v && setDuplicateDialog({ open: false, lead: null, matchBy: "" })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Lead duplicado detectado
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              Já existe um lead com o mesmo {duplicateDialog.matchBy === "telefone" ? "telefone" : "dado"}.
            </p>
            {duplicateDialog.lead && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                <p className="font-medium">{duplicateDialog.lead.nome}</p>
                {duplicateDialog.lead.telefone && (
                  <p className="text-muted-foreground">{duplicateDialog.lead.telefone}</p>
                )}
                {duplicateDialog.lead.email && (
                  <p className="text-muted-foreground">{duplicateDialog.lead.email}</p>
                )}
              </div>
            )}
            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setDuplicateDialog({ open: false, lead: null, matchBy: "" })}>
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (duplicateDialog.lead) {
                    setLocation(`/leads/${duplicateDialog.lead.id}`);
                  }
                  setDuplicateDialog({ open: false, lead: null, matchBy: "" });
                }}
              >
                Ver lead existente
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
