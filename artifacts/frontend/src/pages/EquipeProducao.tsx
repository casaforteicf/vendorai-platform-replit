import { useEffect, useMemo, useState } from "react";
import { useListTenantUsers, getListTenantUsersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Target, Gauge, Clock3, DollarSign, AlertTriangle, ShieldCheck,
  Plus, UserPlus, ClipboardCheck, HardHat, RefreshCw, Ban, CheckCircle2,
  KeyRound, Copy, MessageCircle, MailCheck,
} from "lucide-react";

type Etapa = { id: string; nome: string; percentualExecutado?: string | number | null };

type Executor = {
  id: string;
  user_id?: string | null;
  tipo: string;
  nome: string;
  funcao: string;
  especialidade?: string | null;
  empresa?: string | null;
  telefone?: string | null;
  email?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  tipo_contratacao: string;
  valor_contratado: string | number;
  jornada?: string | null;
  centro_custo?: string | null;
  acesso_sistema: boolean;
  perfil_acesso: string;
  permissoes?: string[];
  status: string;
  linked_user_name?: string | null;
  linked_user_email?: string | null;
  access_status?: string | null;
  access_login?: string | null;
  access_last_login_at?: string | null;
};

type Meta = {
  id: string;
  executor_id?: string | null;
  etapa_id?: string | null;
  executor_nome?: string | null;
  etapa_nome?: string | null;
  nome: string;
  tipo: string;
  valor_meta: string | number;
  unidade?: string | null;
  periodo: string;
  data_inicio?: string | null;
  data_fim?: string | null;
  status: string;
  realizado: number;
  atingimento_pct: number;
};

type Apontamento = {
  id: string;
  data: string;
  executor_id?: string | null;
  executor_nome?: string | null;
  etapa_id?: string | null;
  etapa_nome?: string | null;
  quantidade: string | number;
  unidade?: string | null;
  horas: string | number;
  custo_mao_obra: string | number;
  retrabalho_quantidade: string | number;
  qualidade_nota?: string | number | null;
  bloqueio?: string | null;
  observacao?: string | null;
};

type Bundle = {
  executores: Executor[];
  metas: Meta[];
  apontamentos: Apontamento[];
  rolePermissions: Record<string, string[]>;
  kpis: {
    executoresAtivos: number;
    metasAtivas: number;
    metasAtingidas: number;
    atingimentoMedioPct: number;
    horasApontadas: number;
    custoMaoObra: number;
    retrabalho: number;
    qualidadeMedia: number | null;
    bloqueiosAbertos: number;
  };
};

const FUNCOES = [
  ["engenheiro", "Engenheiro"],
  ["arquiteto", "Arquiteto"],
  ["mestre_obras", "Mestre de obras"],
  ["pedreiro", "Pedreiro"],
  ["eletricista", "Eletricista"],
  ["encanador", "Encanador"],
  ["pintor", "Pintor"],
  ["gesseiro", "Gesseiro / Drywall"],
  ["carpinteiro", "Carpinteiro"],
  ["armador", "Armador"],
  ["terceiro", "Terceiro"],
  ["outro", "Outro"],
] as const;

const PERFIS = [
  ["proprietario", "Proprietário / gestor"],
  ["administrador", "Administrador da obra"],
  ["engenheiro", "Engenheiro"],
  ["arquiteto", "Arquiteto"],
  ["mestre_obras", "Mestre de obras"],
  ["pedreiro", "Pedreiro"],
  ["eletricista", "Eletricista"],
  ["encanador", "Encanador"],
  ["terceiro", "Terceiro"],
  ["campo", "Campo — acesso mínimo"],
  ["cliente", "Cliente — somente portal"],
] as const;

const inputClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function token() {
  return localStorage.getItem("vendorai_token") ?? "";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as any)?.error ?? `Erro ${response.status}`);
  return data as T;
}

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function number(value: unknown, digits = 1) {
  return Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

function roleLabel(value: string) {
  return PERFIS.find(([key]) => key === value)?.[1] ?? value.replaceAll("_", " ");
}

function statusBadge(status: string) {
  if (status === "ativo" || status === "atingida") return "bg-emerald-100 text-emerald-700";
  if (status === "convidado" || status === "ativa") return "bg-blue-100 text-blue-700";
  if (status === "bloqueado" || status === "pausada") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export default function EquipeProducao({
  tenantId,
  obraId,
  etapas,
}: {
  tenantId: string;
  obraId: string;
  etapas: Etapa[];
}) {
  const { toast } = useToast();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"visao" | "equipe" | "metas" | "apontamentos">("visao");
  const [executorOpen, setExecutorOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [apontamentoOpen, setApontamentoOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLoadingId, setInviteLoadingId] = useState<string | null>(null);
  const [inviteData, setInviteData] = useState<{
    executorName: string;
    loginIdentifier: string;
    inviteUrl: string;
    emailSent: boolean;
    whatsappText: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: tenantUsers = [] } = useListTenantUsers(tenantId, {
    query: { enabled: !!tenantId && executorOpen, queryKey: getListTenantUsersQueryKey(tenantId) },
  });

  const [executorForm, setExecutorForm] = useState({
    nome: "", tipo: "pessoa", funcao: "pedreiro", especialidade: "", empresa: "", telefone: "", email: "",
    userId: "", dataInicio: todayLocal(), dataFim: "", tipoContratacao: "hora", valorContratado: "",
    jornada: "07:30–17:30", centroCusto: "Mão de obra", acessoSistema: false, perfilAcesso: "pedreiro",
  });
  const [metaForm, setMetaForm] = useState({
    nome: "", executorId: "", etapaId: "", tipo: "quantidade", valorMeta: "", unidade: "m²",
    periodo: "diaria", dataInicio: todayLocal(), dataFim: "",
  });
  const [apontamentoForm, setApontamentoForm] = useState({
    data: todayLocal(), executorId: "", etapaId: "", quantidade: "", unidade: "m²", horas: "8",
    custoMaoObra: "", retrabalhoQuantidade: "0", qualidadeNota: "", bloqueio: "", observacao: "",
  });

  async function load() {
    setLoading(true);
    try {
      const data = await api<Bundle>(`/api/arch/construction/${obraId}/workforce`);
      setBundle(data);
    } catch (error) {
      toast({ title: "Equipe & Produção", description: error instanceof Error ? error.message : "Falha ao carregar dados.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [obraId]);

  const activeExecutors = bundle?.executores.filter((item) => item.status === "ativo") ?? [];
  const latest = bundle?.apontamentos.slice(0, 8) ?? [];
  const metasCriticas = useMemo(
    () => (bundle?.metas ?? []).filter((m) => m.status === "ativa" && Number(m.atingimento_pct) < 80).slice(0, 6),
    [bundle],
  );

  async function createExecutor(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api(`/api/arch/construction/${obraId}/workforce/executores`, {
        method: "POST",
        body: JSON.stringify({ ...executorForm, userId: executorForm.userId || null, valorContratado: Number(executorForm.valorContratado || 0) }),
      });
      setExecutorOpen(false);
      setExecutorForm({
        nome: "", tipo: "pessoa", funcao: "pedreiro", especialidade: "", empresa: "", telefone: "", email: "",
        userId: "", dataInicio: todayLocal(), dataFim: "", tipoContratacao: "hora", valorContratado: "",
        jornada: "07:30–17:30", centroCusto: "Mão de obra", acessoSistema: false, perfilAcesso: "pedreiro",
      });
      await load();
      toast({ title: "Executor adicionado", description: "O profissional já está vinculado a esta obra." });
    } catch (error) {
      toast({ title: "Não foi possível adicionar", description: error instanceof Error ? error.message : "Erro ao salvar executor.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function createMeta(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api(`/api/arch/construction/${obraId}/workforce/metas`, {
        method: "POST",
        body: JSON.stringify({
          ...metaForm,
          executorId: metaForm.executorId || null,
          etapaId: metaForm.etapaId || null,
          valorMeta: Number(metaForm.valorMeta || 0),
        }),
      });
      setMetaOpen(false);
      setMetaForm({ nome: "", executorId: "", etapaId: "", tipo: "quantidade", valorMeta: "", unidade: "m²", periodo: "diaria", dataInicio: todayLocal(), dataFim: "" });
      await load();
      toast({ title: "Meta criada", description: "Ela já entrou no painel de produtividade." });
    } catch (error) {
      toast({ title: "Não foi possível criar a meta", description: error instanceof Error ? error.message : "Erro ao salvar meta.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function createApontamento(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api(`/api/arch/construction/${obraId}/workforce/apontamentos`, {
        method: "POST",
        body: JSON.stringify({
          ...apontamentoForm,
          etapaId: apontamentoForm.etapaId || null,
          quantidade: Number(apontamentoForm.quantidade || 0),
          horas: Number(apontamentoForm.horas || 0),
          custoMaoObra: Number(apontamentoForm.custoMaoObra || 0),
          retrabalhoQuantidade: Number(apontamentoForm.retrabalhoQuantidade || 0),
          qualidadeNota: apontamentoForm.qualidadeNota === "" ? null : Number(apontamentoForm.qualidadeNota),
        }),
      });
      setApontamentoOpen(false);
      setApontamentoForm({ data: todayLocal(), executorId: "", etapaId: "", quantidade: "", unidade: "m²", horas: "8", custoMaoObra: "", retrabalhoQuantidade: "0", qualidadeNota: "", bloqueio: "", observacao: "" });
      await load();
      toast({ title: "Produção registrada", description: "Metas e KPIs foram recalculados." });
    } catch (error) {
      toast({ title: "Não foi possível registrar", description: error instanceof Error ? error.message : "Erro no apontamento.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function createInvite(executor: Executor) {
    setInviteLoadingId(executor.id);
    try {
      const result = await api<{
        access: { loginIdentifier: string };
        inviteUrl: string;
        emailSent: boolean;
        whatsappText: string;
      }>(`/api/arch/construction/${obraId}/workforce/executores/${executor.id}/invite`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setInviteData({
        executorName: executor.nome,
        loginIdentifier: result.access.loginIdentifier,
        inviteUrl: result.inviteUrl,
        emailSent: result.emailSent,
        whatsappText: result.whatsappText,
      });
      setInviteOpen(true);
      await load();
    } catch (error) {
      toast({
        title: "Não foi possível gerar o acesso",
        description: error instanceof Error ? error.message : "Verifique e-mail/telefone do executor.",
        variant: "destructive",
      });
    } finally {
      setInviteLoadingId(null);
    }
  }

  async function copyInvite(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copiado` });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  }

  async function toggleExecutor(executor: Executor) {
    const next = executor.status === "ativo" ? "bloqueado" : "ativo";
    try {
      await api(`/api/arch/construction/${obraId}/workforce/executores/${executor.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      await load();
    } catch (error) {
      toast({ title: "Falha ao alterar acesso", description: error instanceof Error ? error.message : "Erro.", variant: "destructive" });
    }
  }

  async function closeMeta(meta: Meta) {
    try {
      await api(`/api/arch/construction/${obraId}/workforce/metas/${meta.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: Number(meta.atingimento_pct) >= 100 ? "atingida" : "encerrada" }),
      });
      await load();
    } catch (error) {
      toast({ title: "Falha ao atualizar meta", description: error instanceof Error ? error.message : "Erro.", variant: "destructive" });
    }
  }

  if (loading && !bundle) {
    return <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>;
  }

  const k = bundle?.kpis ?? {
    executoresAtivos: 0, metasAtivas: 0, metasAtingidas: 0, atingimentoMedioPct: 0, horasApontadas: 0,
    custoMaoObra: 0, retrabalho: 0, qualidadeMedia: null, bloqueiosAbertos: 0,
  };

  const tabs = [
    ["visao", "Visão geral"],
    ["equipe", `Equipe (${bundle?.executores.length ?? 0})`],
    ["metas", `Metas (${bundle?.metas.length ?? 0})`],
    ["apontamentos", "Produção"],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><HardHat className="h-5 w-5 text-blue-500" />Equipe & Produção</h2>
          <p className="text-sm text-muted-foreground">Executores, acessos por obra, metas, apontamentos e KPIs operacionais.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="mr-1.5 h-4 w-4" />Atualizar</Button>
          <Dialog open={executorOpen} onOpenChange={setExecutorOpen}>
            <DialogTrigger asChild><Button size="sm" variant="outline"><UserPlus className="mr-1.5 h-4 w-4" />Adicionar à obra</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Adicionar profissional, empresa ou equipe</DialogTitle></DialogHeader>
              <form className="space-y-4" onSubmit={createExecutor}>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div><Label>Nome *</Label><Input required value={executorForm.nome} onChange={(e) => setExecutorForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Nome do profissional ou equipe" /></div>
                  <div><Label>Tipo</Label><select className={inputClass} value={executorForm.tipo} onChange={(e) => setExecutorForm((f) => ({ ...f, tipo: e.target.value }))}><option value="pessoa">Pessoa</option><option value="empresa">Empresa</option><option value="equipe">Equipe</option></select></div>
                  <div><Label>Função</Label><select className={inputClass} value={executorForm.funcao} onChange={(e) => setExecutorForm((f) => ({ ...f, funcao: e.target.value, perfilAcesso: ["pedreiro","eletricista","encanador","engenheiro","arquiteto","mestre_obras","terceiro"].includes(e.target.value) ? e.target.value : f.perfilAcesso }))}>{FUNCOES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                  <div><Label>Especialidade</Label><Input value={executorForm.especialidade} onChange={(e) => setExecutorForm((f) => ({ ...f, especialidade: e.target.value }))} placeholder="Ex.: alvenaria, baixa tensão..." /></div>
                  <div><Label>Empresa</Label><Input value={executorForm.empresa} onChange={(e) => setExecutorForm((f) => ({ ...f, empresa: e.target.value }))} /></div>
                  <div><Label>Telefone / WhatsApp</Label><Input value={executorForm.telefone} onChange={(e) => setExecutorForm((f) => ({ ...f, telefone: e.target.value }))} /></div>
                  <div><Label>E-mail</Label><Input type="email" value={executorForm.email} onChange={(e) => setExecutorForm((f) => ({ ...f, email: e.target.value }))} /></div>
                  <div>
                    <Label>Usuário do Vendor.ai</Label>
                    <select className={inputClass} value={executorForm.userId} onChange={(e) => {
                      const user = (tenantUsers as any[]).find((item) => item.id === e.target.value);
                      setExecutorForm((f) => ({ ...f, userId: e.target.value, nome: user?.name || f.nome, email: user?.email || f.email, acessoSistema: Boolean(e.target.value) }));
                    }}>
                      <option value="">Executor externo — sem usuário vinculado</option>
                      {(tenantUsers as any[]).map((user) => <option key={user.id} value={user.id}>{user.name || user.email} — {user.email}</option>)}
                    </select>
                  </div>
                  <div><Label>Perfil de acesso na obra</Label><select className={inputClass} value={executorForm.perfilAcesso} onChange={(e) => setExecutorForm((f) => ({ ...f, perfilAcesso: e.target.value }))}>{PERFIS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                  <div className="flex items-center gap-2 pt-6"><input id="acesso-sistema" type="checkbox" checked={executorForm.acessoSistema} onChange={(e) => setExecutorForm((f) => ({ ...f, acessoSistema: e.target.checked }))} /><Label htmlFor="acesso-sistema" className="mb-0">Permitir acesso ao sistema</Label></div>
                  <div><Label>Início</Label><Input type="date" value={executorForm.dataInicio} onChange={(e) => setExecutorForm((f) => ({ ...f, dataInicio: e.target.value }))} /></div>
                  <div><Label>Fim previsto</Label><Input type="date" value={executorForm.dataFim} onChange={(e) => setExecutorForm((f) => ({ ...f, dataFim: e.target.value }))} /></div>
                  <div><Label>Contratação</Label><select className={inputClass} value={executorForm.tipoContratacao} onChange={(e) => setExecutorForm((f) => ({ ...f, tipoContratacao: e.target.value }))}><option value="hora">Por hora</option><option value="dia">Por dia</option><option value="mes">Mensal</option><option value="empreita">Empreita</option><option value="m2">Por m²</option><option value="unidade">Por unidade</option></select></div>
                  <div><Label>Valor contratado</Label><Input type="number" min="0" step="0.01" value={executorForm.valorContratado} onChange={(e) => setExecutorForm((f) => ({ ...f, valorContratado: e.target.value }))} /></div>
                  <div><Label>Jornada</Label><Input value={executorForm.jornada} onChange={(e) => setExecutorForm((f) => ({ ...f, jornada: e.target.value }))} /></div>
                  <div><Label>Centro de custo</Label><Input value={executorForm.centroCusto} onChange={(e) => setExecutorForm((f) => ({ ...f, centroCusto: e.target.value }))} /></div>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />As permissões são aplicadas somente nesta obra. O mesmo usuário pode ter outro papel em outra obra.</div>
                <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setExecutorOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Adicionar"}</Button></div>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={metaOpen} onOpenChange={setMetaOpen}>
            <DialogTrigger asChild><Button size="sm" variant="outline"><Target className="mr-1.5 h-4 w-4" />Nova meta</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Nova meta de execução</DialogTitle></DialogHeader>
              <form className="space-y-4" onSubmit={createMeta}>
                <div><Label>Nome *</Label><Input required value={metaForm.nome} onChange={(e) => setMetaForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex.: Alvenaria pavimento térreo" /></div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div><Label>Executor / equipe</Label><select className={inputClass} value={metaForm.executorId} onChange={(e) => setMetaForm((f) => ({ ...f, executorId: e.target.value }))}><option value="">Meta geral da obra</option>{activeExecutors.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div>
                  <div><Label>Etapa</Label><select className={inputClass} value={metaForm.etapaId} onChange={(e) => setMetaForm((f) => ({ ...f, etapaId: e.target.value }))}><option value="">Todas / sem etapa</option>{etapas.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div>
                  <div><Label>Tipo</Label><select className={inputClass} value={metaForm.tipo} onChange={(e) => setMetaForm((f) => ({ ...f, tipo: e.target.value }))}><option value="quantidade">Quantidade</option><option value="produtividade">Produtividade</option><option value="prazo">Prazo</option><option value="custo">Custo</option><option value="qualidade">Qualidade</option></select></div>
                  <div><Label>Período</Label><select className={inputClass} value={metaForm.periodo} onChange={(e) => setMetaForm((f) => ({ ...f, periodo: e.target.value }))}><option value="diaria">Diária</option><option value="semanal">Semanal</option><option value="mensal">Mensal</option><option value="etapa">Por etapa</option><option value="obra">Obra inteira</option></select></div>
                  <div><Label>Meta *</Label><Input required type="number" min="0" step="0.001" value={metaForm.valorMeta} onChange={(e) => setMetaForm((f) => ({ ...f, valorMeta: e.target.value }))} /></div>
                  <div><Label>Unidade</Label><Input value={metaForm.unidade} onChange={(e) => setMetaForm((f) => ({ ...f, unidade: e.target.value }))} placeholder="m², m³, pontos, un..." /></div>
                  <div><Label>Início</Label><Input type="date" value={metaForm.dataInicio} onChange={(e) => setMetaForm((f) => ({ ...f, dataInicio: e.target.value }))} /></div>
                  <div><Label>Fim</Label><Input type="date" value={metaForm.dataFim} onChange={(e) => setMetaForm((f) => ({ ...f, dataFim: e.target.value }))} /></div>
                </div>
                <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setMetaOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Criar meta"}</Button></div>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={apontamentoOpen} onOpenChange={setApontamentoOpen}>
            <DialogTrigger asChild><Button size="sm"><ClipboardCheck className="mr-1.5 h-4 w-4" />Registrar produção</Button></DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Apontamento de produção</DialogTitle></DialogHeader>
              <form className="space-y-4" onSubmit={createApontamento}>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div><Label>Data *</Label><Input required type="date" value={apontamentoForm.data} onChange={(e) => setApontamentoForm((f) => ({ ...f, data: e.target.value }))} /></div>
                  <div><Label>Executor *</Label><select required className={inputClass} value={apontamentoForm.executorId} onChange={(e) => setApontamentoForm((f) => ({ ...f, executorId: e.target.value }))}><option value="">Selecione</option>{activeExecutors.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div>
                  <div><Label>Etapa</Label><select className={inputClass} value={apontamentoForm.etapaId} onChange={(e) => setApontamentoForm((f) => ({ ...f, etapaId: e.target.value }))}><option value="">Sem etapa</option>{etapas.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div>
                  <div><Label>Quantidade executada</Label><Input type="number" min="0" step="0.001" value={apontamentoForm.quantidade} onChange={(e) => setApontamentoForm((f) => ({ ...f, quantidade: e.target.value }))} /></div>
                  <div><Label>Unidade</Label><Input value={apontamentoForm.unidade} onChange={(e) => setApontamentoForm((f) => ({ ...f, unidade: e.target.value }))} /></div>
                  <div><Label>Horas trabalhadas</Label><Input type="number" min="0" max="24" step="0.25" value={apontamentoForm.horas} onChange={(e) => setApontamentoForm((f) => ({ ...f, horas: e.target.value }))} /></div>
                  <div><Label>Custo mão de obra</Label><Input type="number" min="0" step="0.01" value={apontamentoForm.custoMaoObra} onChange={(e) => setApontamentoForm((f) => ({ ...f, custoMaoObra: e.target.value }))} /></div>
                  <div><Label>Retrabalho</Label><Input type="number" min="0" step="0.001" value={apontamentoForm.retrabalhoQuantidade} onChange={(e) => setApontamentoForm((f) => ({ ...f, retrabalhoQuantidade: e.target.value }))} /></div>
                  <div><Label>Qualidade (0–10)</Label><Input type="number" min="0" max="10" step="0.1" value={apontamentoForm.qualidadeNota} onChange={(e) => setApontamentoForm((f) => ({ ...f, qualidadeNota: e.target.value }))} /></div>
                </div>
                <div><Label>Bloqueio / impedimento</Label><Input value={apontamentoForm.bloqueio} onChange={(e) => setApontamentoForm((f) => ({ ...f, bloqueio: e.target.value }))} placeholder="Ex.: aguardando argamassa, projeto, material..." /></div>
                <div><Label>Observação</Label><Textarea rows={3} value={apontamentoForm.observacao} onChange={(e) => setApontamentoForm((f) => ({ ...f, observacao: e.target.value }))} /></div>
                <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setApontamentoOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Registrar"}</Button></div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-blue-500" />Acesso de campo</DialogTitle></DialogHeader>
          {inviteData ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="font-medium">{inviteData.executorName}</p>
                <p className="mt-1 text-xs text-muted-foreground">Login: {inviteData.loginIdentifier}</p>
                <div className={`mt-3 flex items-center gap-2 rounded-lg p-2 text-xs ${inviteData.emailSent ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  <MailCheck className="h-4 w-4" />
                  {inviteData.emailSent ? "Convite enviado por e-mail." : "E-mail não enviado automaticamente. Compartilhe o link por WhatsApp ou outro canal."}
                </div>
              </div>
              <div>
                <Label>Link de ativação</Label>
                <div className="mt-1 flex gap-2"><Input readOnly value={inviteData.inviteUrl} /><Button type="button" variant="outline" onClick={() => void copyInvite(inviteData.inviteUrl, "Link")}><Copy className="h-4 w-4" /></Button></div>
              </div>
              <div>
                <Label>Mensagem para WhatsApp</Label>
                <Textarea readOnly rows={5} value={inviteData.whatsappText} />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button type="button" variant="outline" onClick={() => void copyInvite(inviteData.whatsappText, "Mensagem")}><MessageCircle className="mr-2 h-4 w-4" />Copiar mensagem</Button>
                <Button type="button" onClick={() => void copyInvite(inviteData.inviteUrl, "Link")}><Copy className="mr-2 h-4 w-4" />Copiar link</Button>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 flex gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                O executor criará a própria senha. O login gerado é restrito a esta obra e não abre CRM, configurações ou outras obras.
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="flex gap-1 overflow-x-auto border-b">
        {tabs.map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${tab === value ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{label}</button>)}
      </div>

      {tab === "visao" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
            {[
              { label: "Executores ativos", value: String(k.executoresAtivos), icon: Users },
              { label: "Metas ativas", value: String(k.metasAtivas), icon: Target },
              { label: "Metas atingidas", value: String(k.metasAtingidas), icon: CheckCircle2 },
              { label: "Atingimento médio", value: `${number(k.atingimentoMedioPct)}%`, icon: Gauge },
              { label: "Horas apontadas", value: number(k.horasApontadas), icon: Clock3 },
              { label: "Custo M.O.", value: money(k.custoMaoObra), icon: DollarSign },
              { label: "Qualidade", value: k.qualidadeMedia === null ? "—" : `${number(k.qualidadeMedia)}/10`, icon: ShieldCheck },
              { label: "Bloqueios", value: String(k.bloqueiosAbertos), icon: AlertTriangle },
            ].map((item) => <Card key={item.label}><CardContent className="p-3"><item.icon className="h-4 w-4 text-muted-foreground mb-2" /><p className="text-[11px] text-muted-foreground">{item.label}</p><p className="mt-1 text-lg font-semibold">{item.value}</p></CardContent></Card>)}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Metas que exigem atenção</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {metasCriticas.length === 0 ? <p className="text-sm text-muted-foreground py-5 text-center">Nenhuma meta crítica no momento.</p> : metasCriticas.map((meta) => (
                  <div key={meta.id} className="space-y-1.5">
                    <div className="flex justify-between gap-3 text-sm"><span className="font-medium truncate">{meta.nome}</span><span className="text-muted-foreground">{number(meta.atingimento_pct)}%</span></div>
                    <Progress value={Math.min(100, Number(meta.atingimento_pct))} className="h-2" />
                    <p className="text-xs text-muted-foreground">{number(meta.realizado, 2)} / {number(meta.valor_meta, 2)} {meta.unidade || ""} · {meta.executor_nome || meta.etapa_nome || "Obra"}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Últimos apontamentos</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {latest.length === 0 ? <p className="text-sm text-muted-foreground py-5 text-center">Ainda não há produção apontada.</p> : latest.map((row) => (
                  <div key={row.id} className="flex items-start justify-between gap-3 border-b last:border-0 pb-2 last:pb-0">
                    <div><p className="text-sm font-medium">{row.executor_nome || "Executor"}</p><p className="text-xs text-muted-foreground">{row.etapa_nome || "Sem etapa"} · {String(row.data).slice(0, 10).split("-").reverse().join("/")}</p>{row.bloqueio ? <p className="text-xs text-amber-700 mt-1">Bloqueio: {row.bloqueio}</p> : null}</div>
                    <div className="text-right"><p className="text-sm font-semibold">{number(row.quantidade, 2)} {row.unidade || ""}</p><p className="text-xs text-muted-foreground">{number(row.horas)} h</p></div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {tab === "equipe" && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead><tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><th className="px-4 py-3">Executor</th><th className="px-4 py-3">Função</th><th className="px-4 py-3">Perfil / acesso</th><th className="px-4 py-3">Contratação</th><th className="px-4 py-3">Período</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ação</th></tr></thead>
              <tbody>
                {(bundle?.executores ?? []).map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-4 py-3"><p className="font-medium">{item.nome}</p><p className="text-xs text-muted-foreground">{item.empresa || item.linked_user_email || item.email || "—"}</p></td>
                    <td className="px-4 py-3 capitalize">{item.funcao.replaceAll("_", " ")}{item.especialidade ? <p className="text-xs text-muted-foreground">{item.especialidade}</p> : null}</td>
                    <td className="px-4 py-3">
                      <p>{roleLabel(item.perfil_acesso)}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.access_status === "active" ? "Acesso ativo" : item.access_status === "invited" ? "Convite pendente" : item.acesso_sistema ? "Acesso ainda não ativado" : "Somente executor"} · {Array.isArray(item.permissoes) ? item.permissoes.length : 0} permissões
                      </p>
                      {item.access_login ? <p className="mt-0.5 text-[11px] text-muted-foreground">Login: {item.access_login}</p> : null}
                    </td>
                    <td className="px-4 py-3 capitalize">{item.tipo_contratacao} · {money(item.valor_contratado)}</td>
                    <td className="px-4 py-3 text-xs">{item.data_inicio ? String(item.data_inicio).slice(0,10).split("-").reverse().join("/") : "—"} → {item.data_fim ? String(item.data_fim).slice(0,10).split("-").reverse().join("/") : "aberto"}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs ${statusBadge(item.status)}`}>{item.status}</span></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {item.status === "ativo" ? (
                          <Button size="sm" variant="outline" disabled={inviteLoadingId === item.id} onClick={() => void createInvite(item)}>
                            <KeyRound className="mr-1 h-3.5 w-3.5" />
                            {inviteLoadingId === item.id ? "Gerando..." : item.access_status === "active" ? "Compartilhar" : item.access_status === "invited" ? "Reenviar" : "Convidar"}
                          </Button>
                        ) : null}
                        <Button size="sm" variant="ghost" onClick={() => void toggleExecutor(item)}>
                          {item.status === "ativo" ? <><Ban className="mr-1 h-3.5 w-3.5" />Bloquear</> : <><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Ativar</>}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(bundle?.executores.length ?? 0) === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Nenhum executor cadastrado nesta obra.</td></tr> : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {tab === "metas" && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {(bundle?.metas ?? []).map((meta) => (
            <Card key={meta.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2"><div><p className="font-medium">{meta.nome}</p><p className="text-xs text-muted-foreground">{meta.executor_nome || "Meta geral"}{meta.etapa_nome ? ` · ${meta.etapa_nome}` : ""}</p></div><Badge variant="secondary" className={statusBadge(meta.status)}>{meta.status}</Badge></div>
                <div><div className="mb-1 flex justify-between text-xs"><span>{number(meta.realizado, 2)} {meta.unidade || ""}</span><span>Meta {number(meta.valor_meta, 2)} {meta.unidade || ""}</span></div><Progress value={Math.min(100, Number(meta.atingimento_pct))} className="h-2" /></div>
                <div className="flex justify-between text-xs text-muted-foreground"><span>{meta.periodo}</span><strong className={Number(meta.atingimento_pct) >= 100 ? "text-emerald-600" : Number(meta.atingimento_pct) < 80 ? "text-amber-600" : ""}>{number(meta.atingimento_pct)}%</strong></div>
                {meta.status === "ativa" ? <Button size="sm" variant="outline" className="w-full" onClick={() => void closeMeta(meta)}>{Number(meta.atingimento_pct) >= 100 ? "Marcar como atingida" : "Encerrar meta"}</Button> : null}
              </CardContent>
            </Card>
          ))}
          {(bundle?.metas.length ?? 0) === 0 ? <div className="md:col-span-2 xl:col-span-3 rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">Nenhuma meta cadastrada. Use <strong>Nova meta</strong> para começar.</div> : null}
        </div>
      )}

      {tab === "apontamentos" && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead><tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><th className="px-4 py-3">Data</th><th className="px-4 py-3">Executor</th><th className="px-4 py-3">Etapa</th><th className="px-4 py-3 text-right">Produção</th><th className="px-4 py-3 text-right">Horas</th><th className="px-4 py-3 text-right">Custo</th><th className="px-4 py-3 text-right">Qualidade</th><th className="px-4 py-3">Bloqueio</th></tr></thead>
              <tbody>
                {(bundle?.apontamentos ?? []).map((row) => <tr key={row.id} className="border-b last:border-0"><td className="px-4 py-3">{String(row.data).slice(0,10).split("-").reverse().join("/")}</td><td className="px-4 py-3 font-medium">{row.executor_nome || "—"}</td><td className="px-4 py-3">{row.etapa_nome || "—"}</td><td className="px-4 py-3 text-right font-medium">{number(row.quantidade, 2)} {row.unidade || ""}</td><td className="px-4 py-3 text-right">{number(row.horas)}</td><td className="px-4 py-3 text-right">{money(row.custo_mao_obra)}</td><td className="px-4 py-3 text-right">{row.qualidade_nota == null ? "—" : `${number(row.qualidade_nota)}/10`}</td><td className="px-4 py-3 max-w-[260px] truncate">{row.bloqueio || "—"}</td></tr>)}
                {(bundle?.apontamentos.length ?? 0) === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">Nenhum apontamento de produção registrado.</td></tr> : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
