import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useListTenants, getListTenantsQueryKey, type Tenant } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";

interface VerticalDef {
  key: string;
  label: string;
  icon: React.ElementType;
  status: "ativo" | "em_breve";
}

const VERTICAIS: VerticalDef[] = [
  { key: "Construção & Reforma",          label: "Construção Civil",                icon: HardHat,        status: "ativo"    },
  { key: "Saúde e Beleza",                label: "Saúde e Beleza",                  icon: Stethoscope,    status: "em_breve" },
  { key: "Auto Peças e Distribuidores",   label: "Auto Peças e Distribuidores",     icon: Car,            status: "em_breve" },
  { key: "Materiais de Construção",       label: "Materiais de Construção",         icon: Warehouse,      status: "em_breve" },
  { key: "Moda e Vestuário",              label: "Moda e Vestuário",                icon: Shirt,          status: "em_breve" },
  { key: "Alimentação e Restaurantes",    label: "Alimentação e Restaurantes",      icon: UtensilsCrossed,status: "em_breve" },
  { key: "Serviços Profissionais",        label: "Serviços Profissionais",          icon: Briefcase,      status: "em_breve" },
  { key: "Tecnologia e SaaS",             label: "Tecnologia e SaaS",               icon: Cpu,            status: "em_breve" },
];

const STATUS_COLORS: Record<string, string> = {
  active:    "bg-emerald-100 text-emerald-700 border-emerald-200",
  suspended: "bg-orange-100 text-orange-700 border-orange-200",
  cancelled: "bg-red-100 text-red-600 border-red-200",
};

const PROV_LABELS: Record<string, string> = {
  manual:       "Manual",
  self_service: "Self-service",
  trial:        "Trial",
};

interface ProvisionResult {
  tenant: Tenant;
  user: { id: string; name: string; email: string };
  tempPassword: string;
  emailSent: boolean;
}

export default function AdminTenants() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: tenants = [], isLoading } = useListTenants();

  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    companyName: "", responsibleName: "", email: "", phone: "", cnpj: "",
    planId: "", billingCycle: "monthly" as "monthly" | "annual", internalNotes: "",
  });

  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [copiedWa, setCopiedWa] = useState(false);

  const [resendingId, setResendingId] = useState<string | null>(null);
  const [updatingVertical, setUpdatingVertical] = useState<string | null>(null);

  const VERTICAL_OPTIONS = [
    { value: "__none__",                        label: "— CRM Geral —" },
    { value: "Construção & Reforma",            label: "Construção & Reforma" },
    { value: "Varejo de Roupas & Acessórios",   label: "Varejo de Roupas & Acessórios" },
    { value: "Supermercado",                    label: "Supermercado" },
    { value: "Salão de Beleza",                 label: "Salão de Beleza" },
    { value: "Clínica",                         label: "Clínica" },
  ];

  const filtered = tenants.filter((t) => {
    const matchStatus = filterStatus === "all" || t.status === filterStatus
      || (filterStatus === "manual" && t.provisioningMethod === "manual");
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  function resetForm() {
    setForm({ companyName: "", responsibleName: "", email: "", phone: "", cnpj: "", planId: "", billingCycle: "monthly", internalNotes: "" });
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
        if (data.tempPassword) {
          setResult(prev => prev ? { ...prev, tempPassword: data.tempPassword } : prev);
        }
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
        toast({ title: data.error ?? "Erro ao atualizar vertical", variant: "destructive" });
      } else {
        void qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
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

  function buildWhatsAppText() {
    if (!result) return "";
    const loginUrl = window.location.origin + "/login";
    return `Olá ${result.user.name}! Seu acesso ao Vendor.ai está pronto.\n🔗 ${loginUrl}\n📧 Login: ${result.user.email}\n🔑 Senha: ${result.tempPassword}\nTroque a senha no primeiro acesso!`;
  }

  function copyWhatsApp() {
    void navigator.clipboard.writeText(buildWhatsAppText());
    setCopiedWa(true);
    setTimeout(() => setCopiedWa(false), 2000);
  }

  const tenantCountByVertical = (key: string) =>
    tenants.filter((t) => (t as any).vertical === key && t.status === "active").length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" /> Tenants
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{tenants.length} tenant(s) cadastrado(s)</p>
        </div>
        <Button onClick={() => setFormOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Tenant
        </Button>
      </div>

      {/* Verticais do Mercado */}
      <div
        className="rounded-2xl p-6 space-y-5"
        style={{ background: "#1B1438" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Verticais do Mercado</h2>
            <p className="text-sm mt-0.5" style={{ color: "#A78BFA99" }}>
              Módulos especializados disponíveis na plataforma VendorAI
            </p>
          </div>
          <div
            className="text-xs font-semibold px-3 py-1 rounded-full"
            style={{ background: "linear-gradient(90deg,#A78BFA22,#22D3EE22)", color: "#A78BFA", border: "1px solid #A78BFA44" }}
          >
            {VERTICAIS.filter((v) => v.status === "ativo").length} ativa
            {VERTICAIS.filter((v) => v.status === "ativo").length !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {VERTICAIS.map((v) => {
            const Icon = v.icon;
            const count = tenantCountByVertical(v.key);
            const isAtivo = v.status === "ativo";
            return (
              <div
                key={v.key}
                className="relative rounded-xl p-4 flex flex-col gap-3 transition-all"
                style={{
                  background: isAtivo
                    ? "linear-gradient(135deg,#A78BFA18,#22D3EE18)"
                    : "#ffffff08",
                  border: isAtivo
                    ? "1px solid #A78BFA44"
                    : "1px solid #ffffff12",
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: isAtivo
                        ? "linear-gradient(135deg,#A78BFA33,#22D3EE33)"
                        : "#ffffff10",
                    }}
                  >
                    <Icon
                      className="h-4 w-4"
                      style={{ color: isAtivo ? "#A78BFA" : "#ffffff40" }}
                    />
                  </div>
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                    style={
                      isAtivo
                        ? { background: "#A78BFA22", color: "#A78BFA", border: "1px solid #A78BFA55" }
                        : { background: "#ffffff10", color: "#ffffff40", border: "1px solid #ffffff18" }
                    }
                  >
                    {isAtivo ? "Ativo" : "Em breve"}
                  </span>
                </div>

                <div>
                  <p
                    className="text-sm font-medium leading-tight"
                    style={{ color: isAtivo ? "#fff" : "#ffffff60" }}
                  >
                    {v.label}
                  </p>
                  <p
                    className="text-xs mt-1.5"
                    style={{
                      background: isAtivo
                        ? "linear-gradient(90deg,#A78BFA,#22D3EE)"
                        : "none",
                      WebkitBackgroundClip: isAtivo ? "text" : undefined,
                      WebkitTextFillColor: isAtivo ? "transparent" : undefined,
                      color: isAtivo ? undefined : "#ffffff30",
                    }}
                  >
                    {isAtivo
                      ? `${count} tenant${count !== 1 ? "s" : ""} ativo${count !== 1 ? "s" : ""}`
                      : "—"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex gap-3 flex-wrap">
            <Input
              placeholder="Buscar por nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56"
            />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="manual">Criados manualmente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Vertical</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Primeiro acesso</TableHead>
                  <TableHead>Acesso enviado</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhum tenant encontrado
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.slug}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${STATUS_COLORS[t.status] ?? ""}`}>
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={(t as any).vertical ?? "__none__"}
                        onValueChange={(v) => handleUpdateVertical(t.id, v)}
                        disabled={updatingVertical === t.id}
                      >
                        <SelectTrigger className="h-7 text-xs w-44 border-dashed">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {VERTICAL_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value} className="text-xs">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {t.provisioningMethod ? PROV_LABELS[t.provisioningMethod] ?? t.provisioningMethod : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {t.firstLoginAt ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-600">
                          <UserCheck className="h-3.5 w-3.5" />
                          {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(t.firstLoginAt))}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" /> nunca
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {t.accessSentAt
                          ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(t.accessSentAt))
                          : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => handleResend(t.id)}
                        disabled={resendingId === t.id}
                      >
                        {resendingId === t.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <RefreshCw className="h-3 w-3" />}
                        Reenviar acesso
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Tenant</DialogTitle>
            <DialogDescription>Cria a empresa e o usuário admin com senha temporária. Sem cobrança no Asaas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Nome da empresa *</Label>
                <Input value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} placeholder="Ex: Confecções Silva" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Nome do responsável *</Label>
                <Input value={form.responsibleName} onChange={(e) => setForm((f) => ({ ...f, responsibleName: e.target.value }))} placeholder="João Silva" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>E-mail *</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="joao@empresa.com.br" />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="(47) 99999-9999" />
              </div>
              <div className="space-y-1.5">
                <Label>CNPJ (opcional)</Label>
                <Input value={form.cnpj} onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))} placeholder="00.000.000/0001-00" />
              </div>
              <div className="space-y-1.5">
                <Label>Plano</Label>
                <Select value={form.planId} onValueChange={(v) => setForm((f) => ({ ...f, planId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem plano</SelectItem>
                    <SelectItem value="growth">Growth</SelectItem>
                    <SelectItem value="pme_plus">PME+</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ciclo</Label>
                <Select value={form.billingCycle} onValueChange={(v) => setForm((f) => ({ ...f, billingCycle: v as "monthly" | "annual" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="annual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Observações internas</Label>
                <Textarea value={form.internalNotes} onChange={(e) => setForm((f) => ({ ...f, internalNotes: e.target.value }))} rows={2} placeholder="Notas visíveis apenas para o super admin..." />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                className="flex-1"
                onClick={() => handleProvision(false)}
                disabled={saving || !form.companyName || !form.responsibleName || !form.email}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Criar (sem e-mail)
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => handleProvision(true)}
                disabled={saving || !form.companyName || !form.responsibleName || !form.email}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                Criar e enviar e-mail
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={!!result} onOpenChange={(o) => { if (!o) setResult(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <Check className="h-5 w-5" /> Tenant criado com sucesso!
            </DialogTitle>
            <DialogDescription>
              {result?.tenant.name} — usuário admin criado.
              {result?.emailSent && " E-mail de boas-vindas enviado."}
            </DialogDescription>
          </DialogHeader>

          {result && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                <div><span className="text-muted-foreground">Login:</span> <strong>{result.user.email}</strong></div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Senha temporária:</span>
                  <code className="bg-white border rounded px-2 py-0.5 font-mono text-base tracking-widest">{result.tempPassword}</code>
                </div>
                <p className="text-xs text-amber-600">⚠️ Copie agora — não será exibida novamente.</p>
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={copyWhatsApp}
                >
                  {copiedWa ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  {copiedWa ? "Copiado!" : "Copiar mensagem WhatsApp"}
                </Button>
                {!result.emailSent && (
                  <Button
                    className="w-full gap-2"
                    onClick={handleSendEmail}
                    disabled={sendingEmail}
                  >
                    {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    Enviar e-mail de boas-vindas
                  </Button>
                )}
                <Button variant="ghost" className="w-full" onClick={() => setResult(null)}>
                  Fechar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
