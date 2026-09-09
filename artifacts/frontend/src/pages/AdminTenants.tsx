import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useListTenants, getListTenantsQueryKey, type Tenant } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Plus, Copy, Check, Mail, Loader2, RefreshCw, UserCheck, Clock,
  HardHat, Stethoscope, Car, Warehouse, Shirt, UtensilsCrossed, Briefcase, Cpu,
  Trash2, Upload, Pencil, WalletCards, FlaskConical,
} from "lucide-react";

interface VerticalDef {
  key: string;
  label: string;
  icon: React.ElementType;
  status: "ativo" | "em_breve";
}

type TenantAdmin = Tenant & {
  tenantCode?: string | null;
  isDemo?: boolean | null;
  demoStartedAt?: string | Date | null;
  demoExpiresAt?: string | Date | null;
  demoConvertedAt?: string | Date | null;
  mensalidadeValor?: string | number | null;
  statusPagamento?: string | null;
  formaPagamento?: string | null;
  programaMarca?: string | null;
  vertical?: string | null;
};

const VERTICAIS: VerticalDef[] = [
  { key: "Construção & Reforma", label: "Construção Civil", icon: HardHat, status: "ativo" },
  { key: "Saúde e Beleza", label: "Saúde e Beleza", icon: Stethoscope, status: "em_breve" },
  { key: "Auto Peças e Distribuidores", label: "Auto Peças e Distribuidores", icon: Car, status: "em_breve" },
  { key: "Materiais de Construção", label: "Materiais de Construção", icon: Warehouse, status: "em_breve" },
  { key: "Moda e Vestuário", label: "Moda e Vestuário", icon: Shirt, status: "em_breve" },
  { key: "Alimentação e Restaurantes", label: "Alimentação e Restaurantes", icon: UtensilsCrossed, status: "em_breve" },
  { key: "Serviços Profissionais", label: "Serviços Profissionais", icon: Briefcase, status: "em_breve" },
  { key: "Tecnologia e SaaS", label: "Tecnologia e SaaS", icon: Cpu, status: "em_breve" },
];

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  suspended: "bg-orange-100 text-orange-700 border-orange-200",
  cancelled: "bg-red-100 text-red-600 border-red-200",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  suspended: "Suspenso",
  cancelled: "Cancelado",
};

const PROV_LABELS: Record<string, string> = {
  manual: "Manual",
  self_service: "Self-service",
  trial: "Trial",
};

const COUNTRY_OPTIONS = {
  BR: { label: "Brasil", taxLabel: "CNPJ", taxPlaceholder: "00.000.000/0001-00" },
  PY: { label: "Paraguai", taxLabel: "RUC", taxPlaceholder: "Ex: 80012345-6" },
  AR: { label: "Argentina", taxLabel: "CUIT", taxPlaceholder: "Ex: 30-12345678-9" },
  UY: { label: "Uruguai", taxLabel: "RUT", taxPlaceholder: "Ex: 21XXXXXXXXXX" },
  CL: { label: "Chile", taxLabel: "RUT", taxPlaceholder: "Ex: 76.123.456-7" },
} as const;

type CountryCode = keyof typeof COUNTRY_OPTIONS;

function normalizeConfirmation(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function shortDate(value?: string | Date | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(value));
  } catch {
    return "—";
  }
}

function money(value?: string | number | null) {
  if (value == null || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number);
}

interface ProvisionResult {
  tenant: Tenant;
  user: { id: string; name: string; email: string };
  tempPassword: string;
  emailSent: boolean;
}

interface AvailablePlan {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
}

export default function AdminTenants() {
  const [, setLocation] = useLocation();
  const { token } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: rawTenants = [], isLoading } = useListTenants();
  const tenants = rawTenants as TenantAdmin[];
  const { data: brandPrograms = [] } = useQuery<Array<{ id: string; nomeExibicao: string }>>({
    queryKey: ["brand-programs"],
    queryFn: () => fetch("/api/brand-programs", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
  });
  const { data: availablePlans = [], isLoading: plansLoading } = useQuery<AvailablePlan[]>({
    queryKey: ["admin-plans", "active"],
    queryFn: async () => {
      const response = await fetch("/api/admin/plans", { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar os planos");
      return data as AvailablePlan[];
    },
    enabled: Boolean(token),
  });

  const [filterStatus, setFilterStatus] = useState("all");
  const [filterKind, setFilterKind] = useState("all");
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    companyName: "", responsibleName: "", email: "", phone: "",
    countryCode: "BR" as CountryCode, taxIdentifier: "",
    planId: "", billingCycle: "monthly" as "monthly" | "annual", internalNotes: "",
  });

  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [copiedWa, setCopiedWa] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [updatingVertical, setUpdatingVertical] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantAdmin | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importCsv, setImportCsv] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    total: number; criados: number; comErro: number;
    results: Array<{ linha: number; empresa: string; email: string; countryCode?: CountryCode; status: "criado" | "erro"; emailEnviado?: boolean; erro?: string }>;
  } | null>(null);

  const selectedCountry = COUNTRY_OPTIONS[form.countryCode];
  const activeCount = tenants.filter((t) => t.status === "active").length;
  const suspendedCount = tenants.filter((t) => t.status === "suspended").length;
  const demoCount = tenants.filter((t) => t.isDemo).length;
  const neverAccessedCount = tenants.filter((t) => !t.firstLoginAt).length;

  const IMPORT_TEMPLATE =
    "empresa,responsavel,email,telefone,pais,documento_fiscal\n" +
    "Materiais Chapecó Ltda,João Silva,joao@materiaischapeco.com.br,5549999998888,BR,12.345.678/0001-99\n" +
    "Comercial Asunción,Ana Gómez,ana@comercial.com.py,595981234567,PY,80012345-6\n";

  const VERTICAL_OPTIONS = [
    { value: "__none__", label: "— CRM Geral —" },
    { value: "Construção & Reforma", label: "Construção & Reforma" },
    { value: "Arquitetura & Design", label: "Arquitetura & Design" },
    { value: "Varejo de Roupas & Acessórios", label: "Varejo de Roupas & Acessórios" },
    { value: "Supermercado", label: "Supermercado" },
    { value: "Salão de Beleza", label: "Salão de Beleza" },
    { value: "Clínica", label: "Clínica" },
    { value: "Restaurante", label: "Restaurante" },
    { value: "Imóveis", label: "Imóveis" },
    { value: "Veículos", label: "Veículos" },
    { value: "Autopeças", label: "Autopeças" },
    { value: "Fretes & Logística", label: "Fretes & Logística" },
    { value: "Viagens & Hotelaria", label: "Viagens & Hotelaria" },
    { value: "Farmácia", label: "Farmácia" },
    { value: "Piscinas & Spas", label: "Piscinas & Spas" },
    { value: "Seguros Corporativos", label: "Seguros Corporativos" },
    { value: "Distribuidoras", label: "Distribuidoras" },
    { value: "Agropecuária", label: "Agropecuária" },
  ];

  const filtered = tenants.filter((t) => {
    const matchStatus = filterStatus === "all" || t.status === filterStatus
      || (filterStatus === "manual" && t.provisioningMethod === "manual");
    const matchKind = filterKind === "all"
      || (filterKind === "demo" && !!t.isDemo)
      || (filterKind === "client" && !t.isDemo);
    const q = search.trim().toLowerCase();
    const matchSearch = !q
      || t.name.toLowerCase().includes(q)
      || t.slug.toLowerCase().includes(q)
      || (t.tenantCode ?? "").toLowerCase().includes(q);
    return matchStatus && matchKind && matchSearch;
  });

  async function handleImport() {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/superadmin/tenants/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ csv: importCsv }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error ?? "Erro ao importar", variant: "destructive" }); return; }
      setImportResult(data);
      void qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
    } finally {
      setImporting(false);
    }
  }

  function closeImport() {
    setImportOpen(false);
    setImportCsv("");
    setImportResult(null);
  }

  function resetForm() {
    setForm({
      companyName: "", responsibleName: "", email: "", phone: "",
      countryCode: "BR", taxIdentifier: "",
      planId: "", billingCycle: "monthly", internalNotes: "",
    });
  }

  async function handleProvision(sendEmail: boolean) {
    setSaving(true);
    try {
      const res = await fetch("/api/superadmin/tenants/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, sendWelcomeEmailFlag: sendEmail }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error ?? "Erro ao criar tenant", variant: "destructive" }); return; }
      setResult(data as ProvisionResult);
      setFormOpen(false);
      resetForm();
      void qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
    } finally {
      setSaving(false);
    }
  }

  async function handleSendEmail() {
    if (!result) return;
    setSendingEmail(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${result.tenant.id}/resend-access`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        if (data.tempPassword) setResult((prev) => prev ? { ...prev, tempPassword: data.tempPassword } : prev);
        toast({ title: data.emailSent ? "E-mail enviado com sucesso!" : "E-mail não pôde ser enviado (RESEND_API_KEY não configurada)" });
        void qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
      } else {
        toast({ title: data.error ?? "Erro ao enviar e-mail", variant: "destructive" });
      }
    } finally {
      setSendingEmail(false);
    }
  }

  async function handleUpdateVertical(tenantId: string, vertical: string) {
    setUpdatingVertical(tenantId);
    try {
      const body = vertical === "__none__" ? { vertical: null } : { vertical };
      const res = await fetch(`/api/tenants/${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        toast({ title: data.error ?? "Erro ao atualizar segmento", variant: "destructive" });
      } else {
        void qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
      }
    } finally {
      setUpdatingVertical(null);
    }
  }

  async function handleUpdateProgramaMarca(tenantId: string, programaMarca: string) {
    setUpdatingVertical(tenantId);
    try {
      const body = programaMarca === "__none__" ? { programaMarca: null } : { programaMarca };
      const res = await fetch(`/api/tenants/${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        toast({ title: data.error ?? "Erro ao atualizar programa de marca", variant: "destructive" });
      } else {
        void qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
        toast({ title: "Programa de marca atualizado." });
      }
    } finally {
      setUpdatingVertical(null);
    }
  }

  async function handleResend(tenantId: string) {
    setResendingId(tenantId);
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenantId}/resend-access`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: data.emailSent ? `E-mail reenviado para ${data.email}` : `Nova senha: ${data.tempPassword}` });
        void qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
      } else {
        toast({ title: data.error ?? "Erro ao reenviar acesso", variant: "destructive" });
      }
    } finally {
      setResendingId(null);
    }
  }

  async function handleDeleteTenant() {
    if (!deleteTarget || normalizeConfirmation(deleteConfirmation) !== normalizeConfirmation(deleteTarget.name)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/tenants/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: data.error ?? "Erro ao excluir tenant", variant: "destructive" });
        return;
      }
      toast({ title: `Tenant ${deleteTarget.name} excluído com sucesso` });
      setDeleteTarget(null);
      setDeleteConfirmation("");
      await qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
    } finally {
      setDeleting(false);
    }
  }

  function buildWhatsAppText() {
    if (!result) return "";
    const loginUrl = window.location.origin + "/";
    return `Olá ${result.user.name}! Seu acesso ao Vendor.ai está pronto.\n🔗 ${loginUrl}\n📧 Login: ${result.user.email}\n🔑 Senha: ${result.tempPassword}\nTroque a senha no primeiro acesso!`;
  }

  function copyWhatsApp() {
    void navigator.clipboard.writeText(buildWhatsAppText());
    setCopiedWa(true);
    setTimeout(() => setCopiedWa(false), 2000);
  }

  const tenantCountByVertical = (key: string) =>
    tenants.filter((t) => t.vertical === key && t.status === "active").length;

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-5 w-5 sm:h-6 sm:w-6" /> Tenants
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{tenants.length} tenant(s) cadastrado(s)</p>
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2 min-w-0 px-3">
            <Upload className="h-4 w-4 shrink-0" /><span className="truncate">Importar CSV</span>
          </Button>
          <Button onClick={() => setFormOpen(true)} className="gap-2 min-w-0 px-3">
            <Plus className="h-4 w-4 shrink-0" /><span className="truncate">Novo Tenant</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
        {[
          ["Tenants", tenants.length],
          ["Ativos", activeCount],
          ["Demos", demoCount],
          ["Suspensos", suspendedCount],
          ["Sem 1º acesso", neverAccessedCount],
        ].map(([label, value]) => (
          <Card key={String(label)} className="min-w-0">
            <CardContent className="p-3 sm:p-4">
              <p className="text-[11px] sm:text-xs text-muted-foreground truncate">{label}</p>
              <p className="text-xl sm:text-2xl font-semibold tabular-nums mt-1">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-slate-900">Segmentos do Mercado</h2>
            <p className="text-xs sm:text-sm mt-0.5 text-slate-500">Módulos especializados disponíveis na plataforma VendorAI</p>
          </div>
          <div className="text-xs font-semibold px-3 py-1 rounded-full shrink-0" style={{ background: "linear-gradient(90deg,#A78BFA22,#22D3EE22)", color: "#A78BFA", border: "1px solid #A78BFA44" }}>
            {VERTICAIS.filter((v) => v.status === "ativo").length} ativa
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          {VERTICAIS.map((v) => {
            const Icon = v.icon;
            const count = tenantCountByVertical(v.key);
            const isAtivo = v.status === "ativo";
            return (
              <div key={v.key} className="relative rounded-xl p-3 sm:p-4 flex flex-col gap-2 sm:gap-3 transition-all min-w-0" style={{ background: isAtivo ? "linear-gradient(135deg,#A78BFA18,#22D3EE18)" : "#F8FAFC", border: isAtivo ? "1px solid #A78BFA44" : "1px solid #E2E8F0" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: isAtivo ? "linear-gradient(135deg,#A78BFA33,#22D3EE33)" : "#F1F5F9" }}>
                    <Icon className="h-4 w-4" style={{ color: isAtivo ? "#7C3AED" : "#94A3B8" }} />
                  </div>
                  <span className="text-[9px] sm:text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={isAtivo ? { background: "#A78BFA22", color: "#A78BFA", border: "1px solid #A78BFA55" } : { background: "#F1F5F9", color: "#64748B", border: "1px solid #E2E8F0" }}>
                    {isAtivo ? "Ativo" : "Em breve"}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium leading-tight" style={{ color: isAtivo ? "#0F172A" : "#64748B" }}>{v.label}</p>
                  <p className="text-[11px] sm:text-xs mt-1.5 text-slate-500">{isAtivo ? `${count} tenant${count !== 1 ? "s" : ""} ativo${count !== 1 ? "s" : ""}` : "—"}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Card>
        <CardHeader className="p-3 sm:p-6 sm:pb-3">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(220px,1fr)_180px_180px] gap-2 sm:gap-3">
            <Input placeholder="Buscar por nome, código VAI ou slug..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full" />
            <Select value={filterKind} onValueChange={setFilterKind}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Clientes + demos</SelectItem>
                <SelectItem value="client">Somente clientes</SelectItem>
                <SelectItem value="demo">Somente demos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="suspended">Suspensos</SelectItem>
                <SelectItem value="cancelled">Cancelados</SelectItem>
                <SelectItem value="manual">Criados manualmente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">Nenhum tenant encontrado</p>
          ) : (
            <>
              <div className="divide-y sm:hidden">
                {filtered.map((t) => (
                  <div key={t.id} className="px-3 py-3 space-y-3 cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => setLocation(`/admin/tenants/${t.id}`)}>
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm truncate max-w-full">{t.name}</p>
                          {t.isDemo ? (
                            <Badge variant="outline" className="text-[10px] h-5 gap-1 text-violet-700 border-violet-200 bg-violet-50"><FlaskConical className="h-3 w-3" />Demo</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] h-5 text-slate-600">Cliente</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <code className="text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-100 rounded px-1.5 py-0.5">{t.tenantCode ?? "VAI —"}</code>
                          <span className="text-[11px] text-muted-foreground truncate max-w-[180px]">{t.slug}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${STATUS_COLORS[t.status] ?? ""}`}>{STATUS_LABELS[t.status] ?? t.status}</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-muted/40 p-2 min-w-0">
                        <p className="text-[10px] text-muted-foreground">Segmento</p>
                        <p className="font-medium truncate">{t.vertical ?? "CRM Geral"}</p>
                      </div>
                      <div className="rounded-md bg-muted/40 p-2 min-w-0">
                        <p className="text-[10px] text-muted-foreground">Mensalidade</p>
                        <p className="font-medium truncate">{money(t.mensalidadeValor)}</p>
                      </div>
                      <div className="rounded-md bg-muted/40 p-2 min-w-0">
                        <p className="text-[10px] text-muted-foreground">Primeiro acesso</p>
                        <p className="font-medium truncate">{t.firstLoginAt ? shortDate(t.firstLoginAt) : "Nunca"}</p>
                      </div>
                      <div className="rounded-md bg-muted/40 p-2 min-w-0">
                        <p className="text-[10px] text-muted-foreground">Pagamento</p>
                        <p className="font-medium truncate capitalize">{t.statusPagamento ?? "—"}</p>
                      </div>
                    </div>

                    {t.isDemo && (
                      <div className="flex items-center justify-between gap-2 rounded-md border border-violet-100 bg-violet-50/60 px-2.5 py-2 text-xs">
                        <span className="text-violet-700">Validade da demo</span>
                        <strong className="text-violet-900">{shortDate(t.demoExpiresAt)}</strong>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="outline" className="h-8 text-[11px] gap-1 px-2" onClick={() => setLocation(`/admin/tenants/${t.id}`)}><Pencil className="h-3 w-3" />Editar</Button>
                      <Button size="sm" variant="outline" className="h-8 text-[11px] gap-1 px-2" onClick={() => setLocation(`/admin/tenants/${t.id}`)}><WalletCards className="h-3 w-3" />Financeiro</Button>
                      <Button size="sm" variant="outline" className="h-8 text-[11px] gap-1 px-2" onClick={() => handleResend(t.id)} disabled={resendingId === t.id}>{resendingId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}Acesso</Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden sm:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Identidade</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Segmento</TableHead>
                      <TableHead>Primeiro acesso</TableHead>
                      <TableHead>Demo até</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((t) => (
                      <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setLocation(`/admin/tenants/${t.id}`)}>
                        <TableCell><code className="text-xs font-semibold text-violet-700">{t.tenantCode ?? "—"}</code></TableCell>
                        <TableCell><div className="font-medium">{t.name}</div><div className="text-xs text-muted-foreground">{t.slug}</div></TableCell>
                        <TableCell>{t.isDemo ? <Badge variant="outline" className="text-violet-700 border-violet-200 bg-violet-50">Demo</Badge> : <Badge variant="outline">Cliente</Badge>}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-xs ${STATUS_COLORS[t.status] ?? ""}`}>{STATUS_LABELS[t.status] ?? t.status}</Badge></TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Select value={t.vertical ?? "__none__"} onValueChange={(v) => handleUpdateVertical(t.id, v)} disabled={updatingVertical === t.id}>
                            <SelectTrigger className="h-7 text-xs w-44 border-dashed"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>{VERTICAL_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>{t.firstLoginAt ? <span className="flex items-center gap-1 text-xs text-emerald-600"><UserCheck className="h-3.5 w-3.5" />{shortDate(t.firstLoginAt)}</span> : <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" />Nunca</span>}</TableCell>
                        <TableCell className="text-xs">{t.isDemo ? shortDate(t.demoExpiresAt) : "—"}</TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setLocation(`/admin/tenants/${t.id}`)}><Pencil className="h-3 w-3" />Editar</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 ml-2" onClick={() => handleResend(t.id)} disabled={resendingId === t.id}>{resendingId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}Reenviar</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 ml-2 text-red-600 border-red-200 hover:bg-red-50" onClick={() => setDeleteTarget(t)}><Trash2 className="h-3 w-3" />Excluir</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo Tenant</DialogTitle><DialogDescription>Cria a empresa e o usuário admin já com o perfil regional correto. Sem cobrança no Asaas.</DialogDescription></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 space-y-1.5"><Label>Nome da empresa *</Label><Input value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} placeholder="Ex: Confecções Silva" /></div>
              <div className="sm:col-span-2 space-y-1.5"><Label>Nome do responsável *</Label><Input value={form.responsibleName} onChange={(e) => setForm((f) => ({ ...f, responsibleName: e.target.value }))} placeholder="João Silva" /></div>
              <div className="sm:col-span-2 space-y-1.5"><Label>E-mail *</Label><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="joao@empresa.com" /></div>
              <div className="space-y-1.5">
                <Label>País *</Label>
                <Select value={form.countryCode} onValueChange={(value) => setForm((current) => ({ ...current, countryCode: value as CountryCode, taxIdentifier: "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(COUNTRY_OPTIONS).map(([code, country]) => <SelectItem key={code} value={code}>{country.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Telefone com DDD/código local" /></div>
              <div className="sm:col-span-2 space-y-1.5"><Label>{selectedCountry.taxLabel} (opcional)</Label><Input value={form.taxIdentifier} onChange={(e) => setForm((f) => ({ ...f, taxIdentifier: e.target.value }))} placeholder={selectedCountry.taxPlaceholder} /><p className="text-xs text-muted-foreground">O país define automaticamente idioma, fuso horário, moeda principal e tipo de documento fiscal.</p></div>
              <div className="space-y-1.5">
                <Label>Plano</Label>
                <Select value={form.planId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, planId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Sem plano</SelectItem>{availablePlans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}</SelectContent>
                </Select>
                {plansLoading ? <p className="text-xs text-muted-foreground">Carregando planos ativos...</p> : null}
              </div>
              <div className="space-y-1.5"><Label>Ciclo</Label><Select value={form.billingCycle} onValueChange={(v) => setForm((f) => ({ ...f, billingCycle: v as "monthly" | "annual" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">Mensal</SelectItem><SelectItem value="annual">Anual</SelectItem></SelectContent></Select></div>
              <div className="sm:col-span-2 space-y-1.5"><Label>Observações internas</Label><Textarea value={form.internalNotes} onChange={(e) => setForm((f) => ({ ...f, internalNotes: e.target.value }))} rows={2} placeholder="Notas visíveis apenas para o super admin..." /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              <Button onClick={() => handleProvision(false)} disabled={saving || !form.companyName || !form.responsibleName || !form.email}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Criar (sem e-mail)</Button>
              <Button variant="secondary" onClick={() => handleProvision(true)} disabled={saving || !form.companyName || !form.responsibleName || !form.email}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}Criar e enviar e-mail</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) { setDeleteTarget(null); setDeleteConfirmation(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-red-600">Excluir tenant definitivamente</DialogTitle><DialogDescription>Esta ação apaga a empresa, seus usuários e todos os dados vinculados. Não pode ser desfeita.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <Label>Digite <strong>{deleteTarget?.name}</strong> para confirmar</Label>
            <Input value={deleteConfirmation} onChange={(e) => setDeleteConfirmation(e.target.value)} autoComplete="off" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={deleting} onClick={() => { setDeleteTarget(null); setDeleteConfirmation(""); }}>Cancelar</Button>
              <Button variant="destructive" disabled={deleting || !deleteTarget || normalizeConfirmation(deleteConfirmation) !== normalizeConfirmation(deleteTarget.name)} onClick={() => void handleDeleteTenant()}>{deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}Excluir definitivamente</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!result} onOpenChange={(o) => { if (!o) setResult(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-emerald-600"><Check className="h-5 w-5" /> Tenant criado com sucesso!</DialogTitle><DialogDescription>{result?.tenant.name} — usuário admin criado.{result?.emailSent && " E-mail de boas-vindas enviado."}</DialogDescription></DialogHeader>
          {result && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-4 space-y-2 text-sm"><div><span className="text-muted-foreground">Login:</span> <strong>{result.user.email}</strong></div><div className="flex items-center gap-2"><span className="text-muted-foreground">Senha temporária:</span><code className="bg-white border rounded px-2 py-0.5 font-mono text-base tracking-widest">{result.tempPassword}</code></div><p className="text-xs text-amber-600">⚠️ Copie agora — não será exibida novamente.</p></div>
              <div className="flex flex-col gap-2"><Button variant="outline" className="w-full gap-2" onClick={copyWhatsApp}>{copiedWa ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}{copiedWa ? "Copiado!" : "Copiar mensagem WhatsApp"}</Button>{!result.emailSent && <Button className="w-full gap-2" onClick={handleSendEmail} disabled={sendingEmail}>{sendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}Enviar e-mail de boas-vindas</Button>}<Button variant="ghost" className="w-full" onClick={() => setResult(null)}>Fechar</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={(o) => { if (!o) closeImport(); else setImportOpen(true); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Importar lojistas em massa</DialogTitle><DialogDescription>Cole um CSV com <code>empresa,responsavel,email</code> e, opcionalmente, <code>telefone,pais,documento_fiscal</code>. Se <code>pais</code> estiver vazio, o sistema usa Brasil.</DialogDescription></DialogHeader>
          {!importResult ? (
            <div className="space-y-3"><Textarea value={importCsv} onChange={(e) => setImportCsv(e.target.value)} placeholder={IMPORT_TEMPLATE} className="font-mono text-xs h-48" /><Button variant="ghost" size="sm" className="text-xs" onClick={() => setImportCsv(IMPORT_TEMPLATE)}>Usar modelo internacional de exemplo</Button><div className="flex justify-end gap-2"><Button variant="outline" onClick={closeImport}>Cancelar</Button><Button onClick={handleImport} disabled={importing || !importCsv.trim()} className="gap-2">{importing && <Loader2 className="h-4 w-4 animate-spin" />}Importar e enviar acessos</Button></div></div>
          ) : (
            <div className="space-y-3"><div className="flex gap-4 text-sm"><span className="text-emerald-600 font-semibold">{importResult.criados} criado(s)</span>{importResult.comErro > 0 && <span className="text-red-600 font-semibold">{importResult.comErro} com erro</span>}</div><div className="max-h-80 overflow-y-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Linha</TableHead><TableHead>Empresa</TableHead><TableHead>País</TableHead><TableHead>E-mail</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{importResult.results.map((r) => <TableRow key={r.linha}><TableCell className="text-xs text-muted-foreground">{r.linha}</TableCell><TableCell className="text-sm">{r.empresa || "—"}</TableCell><TableCell className="text-xs text-muted-foreground">{r.countryCode ?? "—"}</TableCell><TableCell className="text-xs text-muted-foreground">{r.email || "—"}</TableCell><TableCell>{r.status === "criado" ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{r.emailEnviado ? "Criado + e-mail enviado" : "Criado (e-mail falhou)"}</Badge> : <Badge className="bg-red-100 text-red-600 border-red-200">{r.erro}</Badge>}</TableCell></TableRow>)}</TableBody></Table></div><div className="flex justify-end"><Button onClick={closeImport}>Fechar</Button></div></div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
