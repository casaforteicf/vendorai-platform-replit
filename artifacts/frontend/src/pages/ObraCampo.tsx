import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  HardHat, LogIn, ShieldCheck, Target, ClipboardCheck, BookOpen, UserRound,
  Clock3, AlertTriangle, CheckCircle2, LogOut, RefreshCw, Send, LockKeyhole,
  Gauge, CalendarDays, Building2,
} from "lucide-react";

type Session = {
  obra: {
    id: string;
    nome: string;
    endereco?: string | null;
    status?: string | null;
    dataInicio?: string | null;
    dataFimPrevista?: string | null;
  };
  executor: {
    id: string;
    nome: string;
    funcao: string;
    especialidade?: string | null;
    empresa?: string | null;
    perfilAcesso: string;
    permissoes: string[];
    jornada?: string | null;
    tipoContratacao?: string | null;
  };
};

type Stage = {
  id: string;
  nome: string;
  descricao?: string | null;
  status: string;
  percentual_executado?: string | number | null;
  data_inicio_prevista?: string | null;
  data_fim_prevista?: string | null;
};

type Goal = {
  id: string;
  nome: string;
  tipo: string;
  valor_meta: string | number;
  unidade?: string | null;
  periodo: string;
  etapa_id?: string | null;
  etapa_nome?: string | null;
  executor_id?: string | null;
  executor_nome?: string | null;
  status: string;
};

type Production = {
  id: string;
  data: string;
  etapa_id?: string | null;
  etapa_nome?: string | null;
  executor_nome?: string | null;
  quantidade: string | number;
  unidade?: string | null;
  horas: string | number;
  custo_mao_obra: string | number;
  qualidade_nota?: string | number | null;
  bloqueio?: string | null;
  observacao?: string | null;
};

type Worksite = {
  obra: Session["obra"];
  executor: Session["executor"];
  metas: Goal[];
  etapas: Stage[];
  apontamentos: Production[];
  kpis: {
    producaoAcumulada: number;
    horasApontadas: number;
    custoMaoObra: number | null;
    bloqueios: number;
    qualidadeMedia: number | null;
  };
};

type Diary = {
  id: string;
  data: string;
  conteudo: string;
  responsavel_nome?: string | null;
  status: string;
  clima_tempo?: string | null;
  observacoes?: string | null;
  created_at?: string | null;
};

const fieldInput = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const iso = String(value).slice(0, 10);
  const [year, month, day] = iso.split("-");
  return day && month && year ? `${day}/${month}/${year}` : iso;
}

function number(value: unknown, digits = 1) {
  return Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusLabel(status: string) {
  if (status === "concluida") return "Concluída";
  if (status === "em_andamento") return "Em andamento";
  if (status === "aprovado") return "Aprovado";
  if (status === "revisao") return "Em revisão";
  if (status === "rascunho") return "Rascunho";
  return status.replaceAll("_", " ");
}

function statusClass(status: string) {
  if (status === "concluida" || status === "aprovado") return "bg-emerald-100 text-emerald-700";
  if (status === "em_andamento" || status === "revisao") return "bg-blue-100 text-blue-700";
  if (status === "rascunho") return "bg-slate-100 text-slate-600";
  return "bg-amber-100 text-amber-700";
}

async function request<T>(path: string, token?: string | null, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error((data as any)?.message ?? (data as any)?.error ?? `Erro ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return data as T;
}

export default function ObraCampo() {
  const [, params] = useRoute("/obra/campo/:obraId");
  const obraId = params?.obraId ?? "";
  const storageKey = `vendorai_obra_field_token:${obraId}`;
  const inviteToken = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("convite") ?? "" : "";

  const [token, setToken] = useState(() => localStorage.getItem(storageKey) ?? "");
  const [session, setSession] = useState<Session | null>(null);
  const [worksite, setWorksite] = useState<Worksite | null>(null);
  const [diary, setDiary] = useState<Diary[]>([]);
  const [tab, setTab] = useState<"hoje" | "producao" | "diario" | "perfil">("hoje");
  const [loading, setLoading] = useState(Boolean(token));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [loginForm, setLoginForm] = useState({ login: "", password: "" });
  const [activateForm, setActivateForm] = useState({ password: "", confirm: "" });
  const [passwordForm, setPasswordForm] = useState({ password: "", confirm: "" });
  const [profileMessage, setProfileMessage] = useState("");
  const [productionForm, setProductionForm] = useState({
    data: todayLocal(),
    etapaId: "",
    quantidade: "",
    unidade: "m²",
    horas: "8",
    retrabalhoQuantidade: "0",
    qualidadeNota: "",
    bloqueio: "",
    observacao: "",
  });
  const [diaryForm, setDiaryForm] = useState({
    data: todayLocal(),
    etapaId: "",
    quantidade: "",
    unidade: "m²",
    climaTempo: "",
    conteudo: "",
    observacoes: "",
  });

  const permissions = session?.executor.permissoes ?? [];
  const canProduction = permissions.includes("producao.write_own") || permissions.includes("producao.write");
  const canDiaryWrite = permissions.includes("diario.write_own") || permissions.includes("diario.write");
  const canDiaryRead = canDiaryWrite || permissions.includes("diario.read") || permissions.includes("diario.read_approved");
  const canApproveDiary = permissions.includes("aprovacoes.manage");

  async function refresh(activeToken = token) {
    if (!activeToken) return;
    setLoading(true);
    setError("");
    try {
      const [sessionData, worksiteData] = await Promise.all([
        request<Session>("/api/auth/obra/session", activeToken),
        request<Worksite>("/api/arch/worksite/me", activeToken),
      ]);
      setSession(sessionData);
      setWorksite(worksiteData);
      const perms = sessionData.executor.permissoes ?? [];
      if (
        perms.includes("diario.write_own")
        || perms.includes("diario.write")
        || perms.includes("diario.read")
        || perms.includes("diario.read_approved")
      ) {
        try {
          const diaryData = await request<{ diario: Diary[] }>("/api/arch/worksite/diario", activeToken);
          setDiary(diaryData.diario ?? []);
        } catch {
          setDiary([]);
        }
      }
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 401 || status === 403) {
        localStorage.removeItem(storageKey);
        setToken("");
        setSession(null);
        setWorksite(null);
      }
      setError(err instanceof Error ? err.message : "Não foi possível carregar a obra.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) void refresh(token);
  }, [token, obraId]);

  async function activate(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (activateForm.password !== activateForm.confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setSaving(true);
    try {
      const result = await request<{ token: string }>("/api/auth/obra/activate", null, {
        method: "POST",
        body: JSON.stringify({ token: inviteToken, password: activateForm.password }),
      });
      localStorage.setItem(storageKey, result.token);
      setToken(result.token);
      window.history.replaceState({}, "", `/obra/campo/${encodeURIComponent(obraId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível ativar o acesso.");
    } finally {
      setSaving(false);
    }
  }

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const result = await request<{ token: string }>("/api/auth/obra/login", null, {
        method: "POST",
        body: JSON.stringify({ obraId, login: loginForm.login, password: loginForm.password }),
      });
      localStorage.setItem(storageKey, result.token);
      setToken(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login inválido.");
    } finally {
      setSaving(false);
    }
  }

  function logout() {
    localStorage.removeItem(storageKey);
    setToken("");
    setSession(null);
    setWorksite(null);
    setDiary([]);
    setTab("hoje");
  }

  async function saveProduction(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      await request("/api/arch/worksite/producao", token, {
        method: "POST",
        body: JSON.stringify({
          ...productionForm,
          etapaId: productionForm.etapaId || null,
          quantidade: Number(productionForm.quantidade || 0),
          horas: Number(productionForm.horas || 0),
          retrabalhoQuantidade: Number(productionForm.retrabalhoQuantidade || 0),
          qualidadeNota: productionForm.qualidadeNota === "" ? null : Number(productionForm.qualidadeNota),
        }),
      });
      setProductionForm({
        data: todayLocal(),
        etapaId: productionForm.etapaId,
        quantidade: "",
        unidade: productionForm.unidade,
        horas: "8",
        retrabalhoQuantidade: "0",
        qualidadeNota: "",
        bloqueio: "",
        observacao: "",
      });
      await refresh(token);
      setTab("hoje");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível registrar a produção.");
    } finally {
      setSaving(false);
    }
  }

  async function saveDiary(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      await request("/api/arch/worksite/diario", token, {
        method: "POST",
        body: JSON.stringify({
          ...diaryForm,
          etapaId: diaryForm.etapaId || null,
          quantidade: diaryForm.quantidade === "" ? null : Number(diaryForm.quantidade),
        }),
      });
      setDiaryForm({
        data: todayLocal(),
        etapaId: diaryForm.etapaId,
        quantidade: "",
        unidade: diaryForm.unidade,
        climaTempo: "",
        conteudo: "",
        observacoes: "",
      });
      await refresh(token);
      setTab("diario");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o diário.");
    } finally {
      setSaving(false);
    }
  }

  async function updateDiaryStatus(entryId: string, status: "aprovado" | "revisao") {
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      await request(`/api/arch/worksite/diario/${entryId}/status`, token, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await refresh(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar o diário.");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setProfileMessage("");
    setError("");
    if (passwordForm.password !== passwordForm.confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setSaving(true);
    try {
      await request("/api/auth/obra/change-password", token, {
        method: "POST",
        body: JSON.stringify({ password: passwordForm.password }),
      });
      setPasswordForm({ password: "", confirm: "" });
      setProfileMessage("Senha alterada com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar a senha.");
    } finally {
      setSaving(false);
    }
  }

  const activeGoals = worksite?.metas.filter((goal) => goal.status === "ativa") ?? [];
  const todayStages = useMemo(
    () => (worksite?.etapas ?? []).filter((stage) => stage.status !== "concluida").slice(0, 8),
    [worksite],
  );

  if (!token) {
    const activationMode = Boolean(inviteToken);
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-md">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500 text-white shadow-sm"><HardHat className="h-6 w-6" /></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">VendorAI Obras</p><h1 className="text-xl font-semibold text-slate-950">Acesso de campo</h1></div>
          </div>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                {activationMode ? <LockKeyhole className="h-5 w-5 text-blue-500" /> : <LogIn className="h-5 w-5 text-blue-500" />}
                {activationMode ? "Ativar seu acesso" : "Entrar na obra"}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {activationMode
                  ? "Crie sua senha. Seu perfil ficará restrito somente às informações liberadas para você nesta obra."
                  : "Use o e-mail ou telefone informado no convite."}
              </p>
            </CardHeader>
            <CardContent>
              {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
              {activationMode ? (
                <form onSubmit={activate} className="space-y-4">
                  <div><Label>Nova senha</Label><Input type="password" required minLength={8} value={activateForm.password} onChange={(e) => setActivateForm((f) => ({ ...f, password: e.target.value }))} placeholder="Mínimo 8 caracteres" /></div>
                  <div><Label>Confirmar senha</Label><Input type="password" required minLength={8} value={activateForm.confirm} onChange={(e) => setActivateForm((f) => ({ ...f, confirm: e.target.value }))} /></div>
                  <Button type="submit" className="w-full" disabled={saving}>{saving ? "Ativando..." : "Ativar e entrar"}</Button>
                </form>
              ) : (
                <form onSubmit={login} className="space-y-4">
                  <div><Label>E-mail ou telefone</Label><Input required value={loginForm.login} onChange={(e) => setLoginForm((f) => ({ ...f, login: e.target.value }))} placeholder="seu@email.com ou telefone" /></div>
                  <div><Label>Senha</Label><Input type="password" required value={loginForm.password} onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))} /></div>
                  <Button type="submit" className="w-full" disabled={saving}>{saving ? "Entrando..." : "Entrar na obra"}</Button>
                </form>
              )}
              <div className="mt-5 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                Este login não dá acesso ao CRM completo. Ele funciona somente para a obra e permissões definidas pelo gestor.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (loading && !session) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="h-9 w-9 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>;
  }

  if (!session || !worksite) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-md rounded-xl border bg-white p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
          <h1 className="mt-3 font-semibold">Acesso indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error || "Entre novamente para acessar esta obra."}</p>
          <Button className="mt-5" onClick={logout}>Voltar ao login</Button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "hoje" as const, label: "Hoje", icon: Gauge, show: true },
    { id: "producao" as const, label: "Produção", icon: ClipboardCheck, show: canProduction },
    { id: "diario" as const, label: "Diário", icon: BookOpen, show: canDiaryRead },
    { id: "perfil" as const, label: "Perfil", icon: UserRound, show: true },
  ].filter((item) => item.show);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><HardHat className="h-5 w-5 shrink-0 text-blue-500" /><p className="truncate font-semibold text-slate-950">{session.obra.nome}</p></div>
              <p className="mt-1 truncate text-xs text-slate-500">{session.obra.endereco || "Obra em execução"}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white border font-semibold text-slate-700">{session.executor.nome.charAt(0).toUpperCase()}</div>
            <div className="min-w-0"><p className="truncate text-sm font-medium">{session.executor.nome}</p><p className="truncate text-xs capitalize text-slate-500">{session.executor.funcao.replaceAll("_", " ")}{session.executor.especialidade ? ` · ${session.executor.especialidade}` : ""}</p></div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-4">
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        {tab === "hoje" ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {[
                { label: "Metas ativas", value: String(activeGoals.length), icon: Target },
                { label: "Produção", value: number(worksite.kpis.producaoAcumulada, 2), icon: ClipboardCheck },
                { label: "Horas", value: number(worksite.kpis.horasApontadas), icon: Clock3 },
                { label: "Qualidade", value: worksite.kpis.qualidadeMedia == null ? "—" : `${number(worksite.kpis.qualidadeMedia)}/10`, icon: CheckCircle2 },
                { label: "Bloqueios", value: String(worksite.kpis.bloqueios), icon: AlertTriangle },
              ].map((item) => <Card key={item.label}><CardContent className="p-3"><item.icon className="mb-2 h-4 w-4 text-slate-500" /><p className="text-[11px] text-slate-500">{item.label}</p><p className="mt-1 text-lg font-semibold">{item.value}</p></CardContent></Card>)}
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4 text-blue-500" />Minhas metas / atividades</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {activeGoals.length === 0 ? <p className="py-5 text-center text-sm text-muted-foreground">Nenhuma meta atribuída no momento.</p> : activeGoals.map((goal) => (
                  <div key={goal.id} className="rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{goal.nome}</p><p className="mt-1 text-xs text-muted-foreground">{goal.etapa_nome || "Obra"} · {goal.periodo}</p></div><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">Meta {number(goal.valor_meta, 2)} {goal.unidade || ""}</span></div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4 text-blue-500" />Etapas liberadas</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {todayStages.length === 0 ? <p className="py-5 text-center text-sm text-muted-foreground">Nenhuma etapa pendente atribuída.</p> : todayStages.map((stage) => {
                  const pct = Number(stage.percentual_executado ?? 0);
                  return <div key={stage.id} className="space-y-2 rounded-xl border p-3"><div className="flex justify-between gap-3"><div><p className="text-sm font-medium">{stage.nome}</p><p className="text-xs text-muted-foreground">{formatDate(stage.data_inicio_prevista)} → {formatDate(stage.data_fim_prevista)}</p></div><span className={`h-fit rounded-full px-2 py-1 text-[11px] ${statusClass(stage.status)}`}>{statusLabel(stage.status)}</span></div><Progress value={pct} className="h-2" /><p className="text-right text-xs font-medium text-slate-500">{number(pct)}%</p></div>;
                })}
              </CardContent>
            </Card>

            {canProduction || canDiaryWrite ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {canProduction ? <Button className="h-12" onClick={() => setTab("producao")}><ClipboardCheck className="mr-2 h-4 w-4" />Registrar produção</Button> : null}
                {canDiaryWrite ? <Button className="h-12" variant="outline" onClick={() => setTab("diario")}><BookOpen className="mr-2 h-4 w-4" />Registrar diário</Button> : null}
              </div>
            ) : null}
          </>
        ) : null}

        {tab === "producao" && canProduction ? (
          <Card>
            <CardHeader><CardTitle className="text-base">Registrar produção</CardTitle><p className="text-sm text-muted-foreground">Informe o que foi executado. O custo de mão de obra é calculado conforme o contrato do executor quando aplicável.</p></CardHeader>
            <CardContent>
              <form onSubmit={saveProduction} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><Label>Data *</Label><Input type="date" required value={productionForm.data} onChange={(e) => setProductionForm((f) => ({ ...f, data: e.target.value }))} /></div>
                  <div><Label>Etapa</Label><select className={fieldInput} value={productionForm.etapaId} onChange={(e) => setProductionForm((f) => ({ ...f, etapaId: e.target.value }))}><option value="">Selecione</option>{worksite.etapas.map((stage) => <option key={stage.id} value={stage.id}>{stage.nome}</option>)}</select></div>
                  <div><Label>Quantidade executada</Label><Input type="number" min="0" step="0.001" value={productionForm.quantidade} onChange={(e) => setProductionForm((f) => ({ ...f, quantidade: e.target.value }))} /></div>
                  <div><Label>Unidade</Label><Input value={productionForm.unidade} onChange={(e) => setProductionForm((f) => ({ ...f, unidade: e.target.value }))} placeholder="m², m³, un, pontos..." /></div>
                  <div><Label>Horas trabalhadas</Label><Input type="number" min="0" max="24" step="0.25" value={productionForm.horas} onChange={(e) => setProductionForm((f) => ({ ...f, horas: e.target.value }))} /></div>
                  <div><Label>Retrabalho</Label><Input type="number" min="0" step="0.001" value={productionForm.retrabalhoQuantidade} onChange={(e) => setProductionForm((f) => ({ ...f, retrabalhoQuantidade: e.target.value }))} /></div>
                  <div><Label>Qualidade (0–10)</Label><Input type="number" min="0" max="10" step="0.1" value={productionForm.qualidadeNota} onChange={(e) => setProductionForm((f) => ({ ...f, qualidadeNota: e.target.value }))} /></div>
                </div>
                <div><Label>Bloqueio / impedimento</Label><Input value={productionForm.bloqueio} onChange={(e) => setProductionForm((f) => ({ ...f, bloqueio: e.target.value }))} placeholder="Ex.: falta de material, aguardando projeto..." /></div>
                <div><Label>Observação</Label><Textarea rows={3} value={productionForm.observacao} onChange={(e) => setProductionForm((f) => ({ ...f, observacao: e.target.value }))} /></div>
                <Button type="submit" className="w-full sm:w-auto" disabled={saving}><Send className="mr-2 h-4 w-4" />{saving ? "Registrando..." : "Registrar produção"}</Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {tab === "diario" && canDiaryRead ? (
          <div className="space-y-4">
            {canDiaryWrite ? (
              <Card>
                <CardHeader><CardTitle className="text-base">Nova entrada no diário</CardTitle><p className="text-sm text-muted-foreground">Seu registro será enviado para revisão da gestão da obra.</p></CardHeader>
                <CardContent>
                  <form onSubmit={saveDiary} className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><Label>Data *</Label><Input type="date" required value={diaryForm.data} onChange={(e) => setDiaryForm((f) => ({ ...f, data: e.target.value }))} /></div>
                      <div><Label>Etapa</Label><select className={fieldInput} value={diaryForm.etapaId} onChange={(e) => setDiaryForm((f) => ({ ...f, etapaId: e.target.value }))}><option value="">Sem etapa</option>{worksite.etapas.map((stage) => <option key={stage.id} value={stage.id}>{stage.nome}</option>)}</select></div>
                      <div><Label>Quantidade</Label><Input type="number" min="0" step="0.001" value={diaryForm.quantidade} onChange={(e) => setDiaryForm((f) => ({ ...f, quantidade: e.target.value }))} /></div>
                      <div><Label>Unidade</Label><Input value={diaryForm.unidade} onChange={(e) => setDiaryForm((f) => ({ ...f, unidade: e.target.value }))} /></div>
                      <div><Label>Clima / condição</Label><Input value={diaryForm.climaTempo} onChange={(e) => setDiaryForm((f) => ({ ...f, climaTempo: e.target.value }))} placeholder="Ensolarado, chuva..." /></div>
                    </div>
                    <div><Label>Atividades realizadas *</Label><Textarea required rows={5} value={diaryForm.conteudo} onChange={(e) => setDiaryForm((f) => ({ ...f, conteudo: e.target.value }))} placeholder="Descreva o que foi executado, onde e eventuais problemas." /></div>
                    <div><Label>Observações</Label><Textarea rows={2} value={diaryForm.observacoes} onChange={(e) => setDiaryForm((f) => ({ ...f, observacoes: e.target.value }))} /></div>
                    <Button type="submit" disabled={saving}><Send className="mr-2 h-4 w-4" />{saving ? "Enviando..." : "Enviar para revisão"}</Button>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader><CardTitle className="text-base">Registros do diário</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {diary.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum registro disponível.</p> : diary.map((entry) => (
                  <div key={entry.id} className="rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{formatDate(entry.data)}</p><p className="text-xs text-muted-foreground">{entry.responsavel_nome || session.executor.nome}</p></div><span className={`rounded-full px-2 py-1 text-[11px] ${statusClass(entry.status)}`}>{statusLabel(entry.status)}</span></div>
                    <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{entry.conteudo}</p>
                    {entry.observacoes ? <p className="mt-2 text-xs text-slate-500">{entry.observacoes}</p> : null}
                    {canApproveDiary && entry.status === "revisao" ? (
                      <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                        <Button size="sm" disabled={saving} onClick={() => void updateDiaryStatus(entry.id, "aprovado")}><CheckCircle2 className="mr-1.5 h-4 w-4" />Aprovar</Button>
                        <Button size="sm" variant="outline" disabled={saving} onClick={() => void updateDiaryStatus(entry.id, "revisao")}><RefreshCw className="mr-1.5 h-4 w-4" />Manter em revisão</Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        ) : null}

        {tab === "perfil" ? (
          <Card>
            <CardHeader><CardTitle className="text-base">Meu acesso</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border p-3"><UserRound className="mb-2 h-4 w-4 text-slate-500" /><p className="text-xs text-muted-foreground">Profissional</p><p className="font-medium">{session.executor.nome}</p><p className="text-xs capitalize text-muted-foreground">{session.executor.funcao.replaceAll("_", " ")}</p></div>
                <div className="rounded-xl border p-3"><Building2 className="mb-2 h-4 w-4 text-slate-500" /><p className="text-xs text-muted-foreground">Empresa</p><p className="font-medium">{session.executor.empresa || "—"}</p><p className="text-xs text-muted-foreground">{session.executor.jornada || "Jornada não informada"}</p></div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Permissões nesta obra</p>
                <div className="flex flex-wrap gap-2">{permissions.map((permission) => <span key={permission} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{permission}</span>)}</div>
              </div>
              <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />Seu acesso é isolado por obra. Outras obras, CRM, financeiro geral e configurações do tenant permanecem bloqueados.</div>
              <form onSubmit={changePassword} className="space-y-3 rounded-xl border p-4">
                <div><p className="text-sm font-medium">Alterar senha</p><p className="text-xs text-muted-foreground">Use no mínimo 8 caracteres.</p></div>
                {profileMessage ? <div className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700">{profileMessage}</div> : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><Label>Nova senha</Label><Input type="password" required minLength={8} value={passwordForm.password} onChange={(e) => setPasswordForm((f) => ({ ...f, password: e.target.value }))} /></div>
                  <div><Label>Confirmar senha</Label><Input type="password" required minLength={8} value={passwordForm.confirm} onChange={(e) => setPasswordForm((f) => ({ ...f, confirm: e.target.value }))} /></div>
                </div>
                <Button type="submit" size="sm" disabled={saving}><LockKeyhole className="mr-2 h-4 w-4" />{saving ? "Salvando..." : "Alterar senha"}</Button>
              </form>
              <Button variant="outline" onClick={logout}><LogOut className="mr-2 h-4 w-4" />Sair desta obra</Button>
            </CardContent>
          </Card>
        ) : null}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 backdrop-blur">
        <div className="mx-auto grid max-w-5xl px-2" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`flex flex-col items-center gap-1 px-2 py-3 text-[11px] font-medium ${tab === item.id ? "text-blue-600" : "text-slate-500"}`}><item.icon className="h-5 w-5" />{item.label}</button>)}
        </div>
      </nav>
    </div>
  );
}
