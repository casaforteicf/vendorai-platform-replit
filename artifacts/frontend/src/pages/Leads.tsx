import React, { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListTenantLeads,
  getListTenantLeadsQueryKey,
  useCreateLead,
  useListCustomerIntelligence,
  getListCustomerIntelligenceQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Search, ChevronRight, AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Upload, FileDown, CheckCircle2, XCircle } from "lucide-react";
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
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const LEAD_STATUSES = [
  { value: "novo", label: "Novo" },
  { value: "qualificado", label: "Qualificado" },
  { value: "nao_qualificado", label: "Não qualificado" },
  { value: "convertido", label: "Convertido" },
  { value: "perdido", label: "Perdido" },
];

const STATUS_STYLES: Record<string, string> = {
  novo: "bg-blue-100 text-blue-700 border-blue-200",
  qualificado: "bg-emerald-100 text-emerald-700 border-emerald-200",
  nao_qualificado: "bg-zinc-100 text-zinc-600 border-zinc-200",
  convertido: "bg-violet-100 text-violet-700 border-violet-200",
  perdido: "bg-red-100 text-red-600 border-red-200",
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
}

const CSV_TEMPLATE = "nome,telefone,endereco,email,instagram\nJoão Silva,(11) 99999-1111,Rua das Flores 123 São Paulo SP,joao@email.com,@joaosilva\nMaria Souza,(21) 98888-2222,,maria@empresa.com.br,";

function parseCsvRows(text: string): ParsedLeadRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
  const idx = {
    nome: header.indexOf("nome"),
    telefone: header.indexOf("telefone"),
    endereco: header.indexOf("endereco"),
    email: header.indexOf("email"),
    instagram: header.indexOf("instagram"),
  };

  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    return {
      nome: (idx.nome >= 0 ? cols[idx.nome] : cols[0] ?? "").trim(),
      telefone: (idx.telefone >= 0 ? cols[idx.telefone] : cols[1] ?? "").trim(),
      endereco: (idx.endereco >= 0 ? cols[idx.endereco] : cols[2] ?? "").trim(),
      email: (idx.email >= 0 ? cols[idx.email] : cols[3] ?? "").trim(),
      instagram: (idx.instagram >= 0 ? cols[idx.instagram] : cols[4] ?? "").trim(),
    };
  }).filter((r) => r.nome.length > 0);
}

export default function Leads() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [churnSort, setChurnSort] = useState<"desc" | "asc" | null>(null);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedLeadRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: { row: number; message: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const ciMap = new Map(ciList?.map((ci) => [ci.leadId, ci]) ?? []);

  const createLead = useCreateLead();

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
        onSuccess: () => {
          toast({ title: "Lead criado com sucesso." });
          queryClient.invalidateQueries({ queryKey: getListTenantLeadsQueryKey(tenantId) });
          setIsDialogOpen(false);
          form.reset();
        },
        onError: () => {
          toast({ title: "Erro ao criar lead", variant: "destructive" });
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
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "high_risk"
            ? typeof ciMap.get(lead.id)?.churnRisk === "number" &&
              (ciMap.get(lead.id)?.churnRisk ?? 0) > 70
            : lead.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
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
                    <p className="font-mono text-xs text-muted-foreground">nome, telefone, endereco, email, instagram</p>
                    <p className="text-xs text-muted-foreground">A primeira linha deve ser o cabeçalho. Máximo 500 leads por importação.</p>
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
                      <div className="overflow-x-auto rounded-lg border text-xs">
                        <table className="w-full">
                          <thead className="bg-muted/50">
                            <tr>
                              {["Nome", "Telefone", "Endereço", "Email", "Instagram"].map((h) => (
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
                          <Input data-testid="input-telefone" placeholder="(11) 99999-9999" {...field} />
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
                        <Input data-testid="input-empresa" placeholder="Nome da empresa" {...field} />
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
                        <Input data-testid="input-objetivo" placeholder="O que o lead quer alcançar?" {...field} />
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
              {LEAD_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
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
                      <div className="flex items-center gap-2 flex-wrap pt-0.5">
                        <Badge variant="outline" className={`text-xs ${STATUS_STYLES[lead.status] ?? ""}`}>
                          {LEAD_STATUSES.find((s) => s.value === lead.status)?.label ?? lead.status}
                        </Badge>
                        {churnBadge(ci?.churnRisk, ci?.churnReasons)}
                      </div>
                    </div>
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
                      {Array.from({ length: 6 }).map((__, j) => (
                        <TableCell key={j}>
                          <div className="h-4 bg-muted animate-pulse rounded w-full max-w-[120px]" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredLeads.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
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
                        <TableCell>{churnBadge(ci?.churnRisk, ci?.churnReasons)}</TableCell>
                        <TableCell>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
    </div>
  );
}
