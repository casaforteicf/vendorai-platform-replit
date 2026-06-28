import { useEffect, useState } from "react";
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
import { Plus, ExternalLink, FolderOpen } from "lucide-react";

function getToken() { return localStorage.getItem("vendorai_token"); }
function getBase()  { return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, ""); }

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Projeto = {
  id: string;
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
  createdAt: string;
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

  // Dialog
  const autoOpen = location.endsWith("/novo");
  const [dialogOpen, setDialogOpen] = useState(autoOpen);
  const [form, setForm]             = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);

  function load() {
    if (!tenantId) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus && filterStatus !== "all") params.set("status", filterStatus);
    if (filterBusca) params.set("clienteNome", filterBusca);
    fetch(`${getBase()}/api/arch/projetos?${params}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((data) => { setProjetos(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError("Erro ao carregar projetos."); setLoading(false); });
  }

  useEffect(() => { load(); }, [tenantId, filterStatus, filterBusca]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        titulo:    form.titulo,
        tipoObra:  form.tipoObra,
      };
      if (form.clienteNome)     body.clienteNome     = form.clienteNome;
      if (form.clienteEmail)    body.clienteEmail    = form.clienteEmail;
      if (form.clienteTelefone) body.clienteTelefone = form.clienteTelefone;
      if (form.areaM2)          body.areaM2          = Number(form.areaM2);
      if (form.prazoEstimado)   body.prazoEstimado   = Number(form.prazoEstimado);

      const res = await fetch(`${getBase()}/api/arch/projetos`, {
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
      setForm(EMPTY_FORM);
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
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projetos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{projetos.length} projeto{projetos.length !== 1 ? "s" : ""} encontrado{projetos.length !== 1 ? "s" : ""}</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Novo Projeto</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Novo Projeto</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
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
                  <Label>Nome do cliente</Label>
                  <Input value={form.clienteNome} onChange={(e) => setF("clienteNome", e.target.value)} placeholder="João Silva" />
                </div>
                <div className="space-y-1">
                  <Label>Telefone</Label>
                  <Input value={form.clienteTelefone} onChange={(e) => setF("clienteTelefone", e.target.value)} placeholder="(11) 99999-9999" />
                </div>

                <div className="col-span-2 space-y-1">
                  <Label>E-mail do cliente</Label>
                  <Input type="email" value={form.clienteEmail} onChange={(e) => setF("clienteEmail", e.target.value)} placeholder="cliente@email.com" />
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
                <Button type="submit" disabled={saving || !form.titulo}>
                  {saving ? "Criando..." : "Criar Projeto"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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

      {/* Tabela */}
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Cliente</th>
                <th className="px-4 py-3 text-left font-medium">Título</th>
                <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Tipo</th>
                <th className="px-4 py-3 text-right font-medium hidden lg:table-cell">Área m²</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium hidden sm:table-cell">Orçamento</th>
                <th className="px-4 py-3 text-center font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y bg-background">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-destructive">{error}</td>
                </tr>
              ) : projetos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground">Nenhum projeto encontrado</p>
                  </td>
                </tr>
              ) : (
                projetos.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{p.clienteNome ?? "—"}</td>
                    <td className="px-4 py-3 max-w-[180px]">
                      <span className="truncate block">{p.titulo}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{p.tipoObra ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden lg:table-cell">
                      {p.areaM2 ? `${Number(p.areaM2).toFixed(0)} m²` : "—"}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-right font-medium text-green-700 hidden sm:table-cell">
                      {p.orcamentoTotal ? fmt(Number(p.orcamentoTotal)) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => navigate(`/arch/projetos/${p.id}`)}
                        >
                          Abrir
                        </Button>
                        {p.portalAtivo && p.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-blue-600"
                            onClick={() => {
                              const base = window.location.origin;
                              window.open(`${base}/arch/portal/${p.id}`, "_blank");
                            }}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" /> Portal
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
