import { useEffect, useState } from "react";
// Deploy marker: refresh Projetos lead picker build.
import "./planner5d-reference.css";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, ExternalLink, FolderOpen, Search, UserRound, UserPlus, Pencil, X, Loader2, Image } from "lucide-react";

function getToken() { return localStorage.getItem("vendorai_token"); }

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Projeto = {
  id: string;
  leadId?: string | null;
  titulo: string;
  clienteNome: string | null;
  clienteEmail: string | null;
  clienteTelefone: string | null;
  status: string;
  tipoObra: string | null;
  areaM2: string | null;
  orcamentoTotal: string | null;
  portalAtivo: boolean;
  portalToken?: string | null;
  totalAmbientes: number;
  totalRenders: number;
  totalRenderAmbientes: number;
  thumbnailUrl?: string | null;
  createdAt: string;
  updatedAt?: string | null;
};

type Lead = {
  id: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  status?: string | null;
  fonte?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  briefing:    "Briefing",
  orcamento:   "Orçamento",
  aprovado:    "Aprovado",
  em_execucao: "Em Execução",
  entregue:    "Entregue",
  cancelado:   "Cancelado",
};

const STATUS_CLASS: Record<string, string> = {
  briefing:    "bg-gray-100 text-gray-700 border-gray-200",
  orcamento:   "bg-blue-50 text-blue-700 border-blue-200",
  aprovado:    "bg-green-50 text-green-700 border-green-200",
  em_execucao: "bg-amber-50 text-amber-700 border-amber-200",
  entregue:    "bg-emerald-50 text-emerald-800 border-emerald-200",
  cancelado:   "bg-red-50 text-red-700 border-red-200",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status] ?? "bg-gray-100 text-gray-700"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

const TIPOS_OBRA = ["Residencial", "Comercial", "Corporativo", "Reforma"];
const STATUS_OPTIONS = ["briefing", "orcamento", "aprovado", "em_execucao", "entregue", "cancelado"];

type FormData = {
  clienteNome: string;
  clienteEmail: string;
  clienteTelefone: string;
  titulo: string;
  tipoObra: string;
  areaM2: string;
  prazoEstimado: string;
};

const EMPTY_FORM: FormData = {
  clienteNome: "", clienteEmail: "", clienteTelefone: "",
  titulo: "", tipoObra: "Residencial", areaM2: "", prazoEstimado: "",
};

export default function Projetos() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const tenantId = user?.tenantId ?? "";

  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterBusca,  setFilterBusca]  = useState("");
  const [filterBuscaDebounced, setFilterBuscaDebounced] = useState("");

  // Dialog
  const autoOpen = location.split("?")[0].endsWith("/novo");
  const requestedTitle = new URLSearchParams(window.location.search).get("titulo")?.trim() ?? "";
  const [dialogOpen, setDialogOpen] = useState(autoOpen);
  const [form, setForm]             = useState<FormData>(() => ({ ...EMPTY_FORM, titulo: requestedTitle }));
  const [saving, setSaving]         = useState(false);

  // Cliente / lead existente
  const [leadSearch, setLeadSearch] = useState("");
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [leadResults, setLeadResults] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadPickerOpen, setLeadPickerOpen] = useState(false);

  // Cadastro / edição rápida de lead sem sair de Projetos
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [leadEditing, setLeadEditing] = useState<Lead | null>(null);
  const [leadForm, setLeadForm] = useState({ nome: "", telefone: "", email: "" });
  const [leadSaving, setLeadSaving] = useState(false);
  const [leadProjectId, setLeadProjectId] = useState<string | null>(null);
  const [selectLeadAfterSave, setSelectLeadAfterSave] = useState(true);

  function openCreateLead(selectAfterSave = true) {
    setSelectLeadAfterSave(selectAfterSave);
    setLeadProjectId(null);
    setLeadEditing(null);
    setLeadForm({
      nome: leadSearch.trim(),
      telefone: "",
      email: "",
    });
    setLeadDialogOpen(true);
  }

  function openEditLead(lead: Lead, projectId: string | null = null) {
    setSelectLeadAfterSave(projectId === null);
    setLeadProjectId(projectId);
    setLeadEditing(lead);
    setLeadForm({
      nome: lead.nome ?? "",
      telefone: lead.telefone ?? "",
      email: lead.email ?? "",
    });
    setLeadDialogOpen(true);
  }

  async function saveLead(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId || !leadForm.nome.trim()) return;

    setLeadSaving(true);
    try {
      const payload = {
        ...(leadEditing ? {} : { tenantId }),
        nome: leadForm.nome.trim(),
        telefone: leadForm.telefone.trim() || null,
        email: leadForm.email.trim() || null,
        ...(leadEditing ? {} : { source: "manual" }),
      };

      const res = await fetch(leadEditing ? `/api/leads/${leadEditing.id}` : "/api/leads", {
        method: leadEditing ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && data?.lead) {
          selectLead(data.lead);
          setLeadDialogOpen(false);
          toast({
            title: "Lead já cadastrado",
            description: "O cadastro existente foi selecionado para este projeto.",
          });
          return;
        }
        throw new Error(data?.error ?? "Não foi possível salvar o lead.");
      }

      const savedLead: Lead = data;

      if (leadEditing && leadProjectId) {
        const projectRes = await fetch(`/api/arch/projetos/${leadProjectId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            clienteNome: savedLead.nome,
            clienteEmail: savedLead.email ?? null,
            clienteTelefone: savedLead.telefone ?? null,
          }),
        });
        if (!projectRes.ok) {
          throw new Error("Lead atualizado, mas não foi possível sincronizar os dados no projeto.");
        }
        load();
      }

      if (selectLeadAfterSave) selectLead(savedLead);
      setLeadDialogOpen(false);
      toast({
        title: leadEditing ? "Lead atualizado" : "Lead cadastrado",
        description: savedLead.nome,
      });
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err?.message ?? "Falha ao salvar lead.",
        variant: "destructive",
      });
    } finally {
      setLeadSaving(false);
    }
  }

  function load() {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filterStatus && filterStatus !== "all") params.set("status", filterStatus);
    if (filterBuscaDebounced) params.set("clienteNome", filterBuscaDebounced);
    fetch(`/api/arch/projetos?${params}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("Erro ao carregar projetos.");
        return r.json();
      })
      .then((data) => { setProjetos(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError("Erro ao carregar projetos."); setLoading(false); });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setFilterBuscaDebounced(filterBusca.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [filterBusca]);

  useEffect(() => { load(); }, [tenantId, filterStatus, filterBuscaDebounced]);

  useEffect(() => {
    if (!dialogOpen || !tenantId) {
      setAllLeads([]);
      setLeadResults([]);
      setLeadPickerOpen(false);
      return;
    }

    const controller = new AbortController();
    setLeadsLoading(true);

    fetch(`/api/tenants/${tenantId}/leads?incluirNaoLeads=incluir`, {
      headers: { Authorization: `Bearer ${getToken()}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Erro ao carregar leads");
        const data = await res.json();
        return Array.isArray(data) ? data : Array.isArray(data?.leads) ? data.leads : [];
      })
      .then((items: Lead[]) => {
        const sorted = [...items].sort((a, b) =>
          (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR", { sensitivity: "base" }),
        );
        setAllLeads(sorted);
        setLeadResults(sorted);
      })
      .catch((err: any) => {
        if (err?.name !== "AbortError") {
          setAllLeads([]);
          setLeadResults([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLeadsLoading(false);
      });

    return () => controller.abort();
  }, [dialogOpen, tenantId]);

  useEffect(() => {
    if (selectedLead) {
      setLeadResults([]);
      return;
    }

    const q = leadSearch.trim().toLocaleLowerCase("pt-BR");
    if (!q) {
      setLeadResults(allLeads);
      return;
    }

    const onlyDigits = q.replace(/\D/g, "");
    setLeadResults(
      allLeads.filter((lead) => {
        const nome = (lead.nome ?? "").toLocaleLowerCase("pt-BR");
        const email = (lead.email ?? "").toLocaleLowerCase("pt-BR");
        const telefone = lead.telefone ?? "";
        const telefoneDigits = telefone.replace(/\D/g, "");
        return (
          nome.includes(q) ||
          email.includes(q) ||
          telefone.toLocaleLowerCase("pt-BR").includes(q) ||
          (onlyDigits.length > 0 && telefoneDigits.includes(onlyDigits))
        );
      }),
    );
  }, [allLeads, leadSearch, selectedLead]);

  function selectLead(lead: Lead) {
    setSelectedLead(lead);
    setLeadSearch("");
    setLeadResults([]);
    setLeadPickerOpen(false);
    setForm((f) => ({
      ...f,
      clienteNome: lead.nome ?? "",
      clienteEmail: lead.email ?? "",
      clienteTelefone: lead.telefone ?? "",
    }));
  }

  function clearLead() {
    setSelectedLead(null);
    setLeadSearch("");
    setLeadResults(allLeads);
    setLeadPickerOpen(true);
    setForm((f) => ({ ...f, clienteNome: "", clienteEmail: "", clienteTelefone: "" }));
  }

  function resetDialog() {
    setForm(EMPTY_FORM);
    setSelectedLead(null);
    setLeadSearch("");
    setLeadResults([]);
    setLeadPickerOpen(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedLead && !form.clienteNome.trim()) {
      toast({ title: "Informe o cliente", description: "Selecione um cliente existente ou informe o nome para cadastrá-lo automaticamente.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      let projectLead = selectedLead;

      if (!projectLead) {
        const leadRes = await fetch("/api/leads", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            tenantId,
            nome: form.clienteNome.trim(),
            telefone: form.clienteTelefone.trim() || null,
            email: form.clienteEmail.trim() || null,
            source: "manual",
          }),
        });
        const leadData = await leadRes.json().catch(() => ({}));
        if (leadRes.status === 409 && leadData?.lead) {
          projectLead = leadData.lead as Lead;
        } else if (!leadRes.ok) {
          throw new Error(leadData?.error ?? "Não foi possível cadastrar o cliente.");
        } else {
          projectLead = leadData as Lead;
        }
      }

      const body: Record<string, unknown> = {
        leadId:    projectLead.id,
        titulo:    form.titulo,
        tipoObra:  form.tipoObra,
      };
      if (form.clienteNome)     body.clienteNome     = form.clienteNome;
      if (form.clienteEmail)    body.clienteEmail    = form.clienteEmail;
      if (form.clienteTelefone) body.clienteTelefone = form.clienteTelefone;
      if (form.areaM2)          body.areaM2          = Number(form.areaM2);
      if (form.prazoEstimado)   body.prazoEstimado   = Number(form.prazoEstimado);

      const res = await fetch(`/api/arch/projetos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Erro ao criar projeto");
      }

      const projeto = await res.json();
      toast({ title: "Projeto criado!", description: projeto.titulo });
      setDialogOpen(false);
      resetDialog();
      navigate(`/arch/projetos/${projeto.id}`);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message ?? "Falha ao criar projeto", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function setF(key: keyof FormData, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  return (
    <div className="arqdor-reference-ui max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projetos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{projetos.length} projeto{projetos.length !== 1 ? "s" : ""} encontrado{projetos.length !== 1 ? "s" : ""}</p>
        </div>

        <div className="flex items-center gap-2">
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetDialog();
          }}
        >
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Novo Projeto</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Novo Projeto</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label>Cliente *</Label>

                  {selectedLead ? (
                    <div className="rounded-lg border bg-muted/30 px-3 py-3 flex items-start gap-3">
                      <div className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary">
                        <UserRound className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{selectedLead.nome}</p>
                        <div className="mt-0.5 text-xs text-muted-foreground space-y-0.5">
                          {selectedLead.telefone && <p>{selectedLead.telefone}</p>}
                          {selectedLead.email && <p className="truncate">{selectedLead.email}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditLead(selectedLead)}
                          aria-label="Editar lead"
                          title="Editar lead"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={clearLead} aria-label="Trocar cliente" title="Trocar cliente">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={leadSearch}
                        onChange={(e) => {
                          setLeadSearch(e.target.value);
                          setLeadPickerOpen(true);
                        }}
                        onFocus={() => setLeadPickerOpen(true)}
                        placeholder="Buscar por nome, telefone ou e-mail..."
                        className="pl-9 pr-9"
                        autoComplete="new-password"
                        name="project-lead-search"
                      />
                      {leadsLoading && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                      )}

                      {leadPickerOpen && !leadsLoading && (
                        <div className="absolute z-50 left-0 right-0 top-full mt-1 rounded-md border bg-popover shadow-lg max-h-72 overflow-y-auto">
                          <div className="sticky top-0 z-10 border-b bg-popover px-3 py-2 text-xs text-muted-foreground">
                            {leadSearch.trim()
                              ? `${leadResults.length} lead(s) encontrado(s)`
                              : `Todos os leads cadastrados (${leadResults.length})`}
                          </div>
                          {leadResults.length > 0 ? (
                            leadResults.map((lead) => (
                              <button
                                key={lead.id}
                                type="button"
                                className="w-full px-3 py-2.5 text-left hover:bg-muted transition-colors border-b last:border-b-0"
                                onClick={() => selectLead(lead)}
                              >
                                <p className="text-sm font-medium">{lead.nome}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {[lead.telefone, lead.email].filter(Boolean).join(" · ") || "Sem telefone/e-mail"}
                                </p>
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-3 text-sm">
                              <p className="font-medium">Nenhum lead encontrado</p>
                              <p className="text-xs text-muted-foreground mt-1 mb-2">Busque por nome, telefone ou e-mail, ou cadastre um novo lead.</p>
                              <Button type="button" size="sm" variant="outline" className="w-full" onClick={openCreateLead}>
                                <UserPlus className="h-4 w-4 mr-2" />
                                Cadastrar novo lead
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      Busque um cliente existente. Se for novo, informe os dados abaixo e o VendorAI cadastra automaticamente ao criar o projeto.
                    </p>
                  </div>

                  {!selectedLead && (
                    <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3">
                      <div className="col-span-2 space-y-1">
                        <Label>Nome do cliente *</Label>
                        <Input
                          value={form.clienteNome}
                          onChange={(e) => setF("clienteNome", e.target.value)}
                          placeholder="Nome do cliente"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Telefone</Label>
                        <Input
                          value={form.clienteTelefone}
                          onChange={(e) => setF("clienteTelefone", e.target.value)}
                          placeholder="(49) 99999-9999"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>E-mail</Label>
                        <Input
                          type="email"
                          value={form.clienteEmail}
                          onChange={(e) => setF("clienteEmail", e.target.value)}
                          placeholder="cliente@email.com"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="col-span-2 space-y-1">
                  <Label>Título do projeto *</Label>
                  <Input
                    value={form.titulo}
                    onChange={(e) => setF("titulo", e.target.value)}
                    placeholder="Ex: Apartamento Moema"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label>Tipo de obra *</Label>
                  <Select value={form.tipoObra} onValueChange={(v) => setF("tipoObra", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_OBRA.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Área (m²)</Label>
                  <Input type="number" min="0" step="0.01" value={form.areaM2} onChange={(e) => setF("areaM2", e.target.value)} placeholder="120" />
                </div>

                <div className="col-span-2 space-y-1">
                  <Label>Prazo estimado (dias)</Label>
                  <Input type="number" min="0" value={form.prazoEstimado} onChange={(e) => setF("prazoEstimado", e.target.value)} placeholder="90" />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
                <Button type="submit" disabled={saving || !form.titulo || (!selectedLead && !form.clienteNome.trim())}>
                  {saving ? "Criando..." : "Criar e abrir projeto"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>


      <Dialog open={leadDialogOpen} onOpenChange={(open) => {
        setLeadDialogOpen(open);
        if (!open) {
          setLeadEditing(null);
          setLeadProjectId(null);
          setSelectLeadAfterSave(true);
          setLeadForm({ nome: "", telefone: "", email: "" });
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{leadEditing ? "Editar lead" : "Cadastrar lead"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveLead} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                value={leadForm.nome}
                onChange={(e) => setLeadForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Nome do cliente"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input
                value={leadForm.telefone}
                onChange={(e) => setLeadForm((f) => ({ ...f, telefone: e.target.value }))}
                placeholder="(49) 99999-9999"
              />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={leadForm.email}
                onChange={(e) => setLeadForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="cliente@email.com"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setLeadDialogOpen(false)} disabled={leadSaving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={leadSaving || !leadForm.nome.trim()}>
                {leadSaving ? "Salvando..." : leadEditing ? "Salvar alterações" : selectLeadAfterSave ? "Cadastrar e selecionar" : "Cadastrar lead"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Buscar por cliente..."
          value={filterBusca}
          onChange={(e) => setFilterBusca(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Visão visual de projetos — ARQ-PROJ */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border bg-background">
              <Skeleton className="h-40 w-full rounded-none" />
              <div className="space-y-3 p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-9 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-5 py-8 text-center text-sm text-destructive">{error}</div>
      ) : projetos.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-5 py-14 text-center">
          <FolderOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium">Nenhum projeto encontrado</p>
          <p className="mt-1 text-sm text-muted-foreground">Crie um projeto ou ajuste os filtros.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projetos.map((p) => {
            const progressIndex = ["briefing", "orcamento", "aprovado", "em_execucao", "entregue"].indexOf(p.status);
            const progress = p.status === "cancelado" ? 0 : Math.max(12, Math.min(100, ((progressIndex + 1) / 5) * 100));
            const nextAction =
              p.status === "briefing" ? "Continuar briefing"
                : p.status === "orcamento" ? "Revisar orçamento"
                  : p.status === "aprovado" ? "Preparar execução"
                    : p.status === "em_execucao" ? "Acompanhar execução"
                      : p.status === "entregue" ? "Abrir pós-venda"
                        : "Abrir projeto";
            return (
              <article key={p.id} className="group overflow-hidden rounded-2xl border bg-background shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <button type="button" onClick={() => navigate(`/arch/projetos/${p.id}`)} className="block w-full text-left">
                  <div className="relative h-40 overflow-hidden bg-muted">
                    {p.thumbnailUrl ? (
                      <img src={p.thumbnailUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" loading="lazy" />
                    ) : (
                      <div className="grid h-full place-items-center bg-gradient-to-br from-slate-50 to-slate-100 text-slate-400">
                        <FolderOpen className="h-9 w-9" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
                      <StatusBadge status={p.status} />
                      <span className="rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-700">
                        {p.totalRenders ?? 0} render{(p.totalRenders ?? 0) === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-bold">{p.titulo}</h2>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.clienteNome ?? "Cliente não vinculado"}</p>
                      </div>
                      {p.tipoObra && <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-semibold">{p.tipoObra}</span>}
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-muted/50 p-2">
                        <div className="text-[10px] text-muted-foreground">Área</div>
                        <div className="mt-0.5 text-xs font-bold">{p.areaM2 ? `${Number(p.areaM2).toFixed(0)} m²` : "—"}</div>
                      </div>
                      <div className="rounded-xl bg-muted/50 p-2">
                        <div className="text-[10px] text-muted-foreground">Ambientes</div>
                        <div className="mt-0.5 text-xs font-bold">{p.totalAmbientes ?? 0}</div>
                      </div>
                      <div className="rounded-xl bg-muted/50 p-2">
                        <div className="text-[10px] text-muted-foreground">Orçamento</div>
                        <div className="mt-0.5 truncate text-xs font-bold text-emerald-700">{p.orcamentoTotal ? fmt(Number(p.orcamentoTotal)) : "—"}</div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
                        <span>Progresso</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-primary">{nextAction}</span>
                      {p.updatedAt && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(p.updatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-1 border-t px-3 py-2">
                  {p.leadId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      onClick={() => openEditLead({
                        id: p.leadId!,
                        nome: p.clienteNome ?? "",
                        email: p.clienteEmail,
                        telefone: p.clienteTelefone,
                      }, p.id)}
                    >
                      <Pencil className="mr-1 h-3 w-3" /> Lead
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="ml-auto h-8 text-xs" onClick={() => navigate(`/arch/projetos/${p.id}`)}>
                    Abrir
                  </Button>
                  {p.portalAtivo && p.portalToken && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-blue-600"
                      onClick={() => window.open(`${window.location.origin}/arch/portal/${encodeURIComponent(p.portalToken!)}`, "_blank", "noopener,noreferrer")}
                    >
                      <ExternalLink className="mr-1 h-3 w-3" /> Portal
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
