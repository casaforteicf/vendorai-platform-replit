import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useListSegmentTemplates } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  UserSearch,
  Handshake,
  BarChart2,
  AlertCircle,
  Headphones,
  CalendarCheck,
  Star,
  Telescope,
  Check,
  Upload,
  X,
  ImageIcon,
  Wifi,
  WifiOff,
} from "lucide-react";
import logoLight from "/logo-full-light.svg";

// ── Types ────────────────────────────────────────────────────────────────────
type WizardStep = 1 | 2 | 3 | 4 | "done";

interface PlanFromApi {
  id: string;
  name: string;
  monthlyPriceCents: number | null;
  monthlyPriceAnnualCents: number | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const AGENT_CARDS = [
  { key: "sdr",          label: "SDR",          desc: "Qualificação de leads",        Icon: UserSearch },
  { key: "closer",       label: "Closer",        desc: "Fechamento de vendas",         Icon: Handshake },
  { key: "relacionamento", label: "Financeiro",  desc: "Relacionamento e finanças",    Icon: BarChart2 },
  { key: "reactivation", label: "Cobrança",      desc: "Reativação e cobrança",        Icon: AlertCircle },
  { key: "service",      label: "Suporte",       desc: "Atendimento ao cliente",       Icon: Headphones },
  { key: "scheduler",   label: "Agendamento",   desc: "Agenda e compromissos",        Icon: CalendarCheck },
  { key: "followup",    label: "Pós-venda",     desc: "Follow-up e fidelização",      Icon: Star },
  { key: "onboarding",  label: "Prospector",    desc: "Prospecção ativa de clientes", Icon: Telescope },
] as const;

const PLAN_DISPLAY = [
  { label: "Growth",     implantacao: 4900, quotaIA: "US$20", popular: false },
  { label: "PME+",       implantacao: 6900, quotaIA: "US$35", popular: true },
  { label: "Enterprise", implantacao: 8900, quotaIA: "US$50", popular: false },
];

const TOM_OPTIONS = [
  { value: "profissional", label: "Profissional" },
  { value: "amigavel",     label: "Amigável" },
  { value: "tecnico",      label: "Técnico" },
  { value: "vendedor",     label: "Vendedor" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem("vendorai_token"); }
function getBase()  { return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, ""); }

async function apiPatch(path: string, body: unknown) {
  const res = await fetch(`${getBase()}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data;
}

async function apiGet(path: string) {
  const res = await fetch(`${getBase()}${path}`, {
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Onboarding() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<WizardStep>(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 state
  const [s1NomeEmpresa, setS1NomeEmpresa] = useState("");
  const [s1Segmento,    setS1Segmento]    = useState("");
  const [s1Logo,        setS1Logo]        = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Step 2 state
  const [s2InstanceId,  setS2InstanceId]  = useState("");
  const [s2Token,       setS2Token]       = useState("");
  const [s2Numero,      setS2Numero]      = useState("");
  const [s2Testing,     setS2Testing]     = useState(false);
  const [s2Status,      setS2Status]      = useState<"idle" | "ok" | "fail">("idle");

  // Step 3 state
  const [s3AgentKey,    setS3AgentKey]    = useState<string>("sdr");
  const [s3NomePerfil,  setS3NomePerfil]  = useState("");
  const [s3Tom,         setS3Tom]         = useState("profissional");

  // Step 4 state
  const [s4Ciclo,       setS4Ciclo]       = useState<"mensal" | "anual">("mensal");
  const [s4PlanoId,     setS4PlanoId]     = useState<string | null>(null);
  const [plans,         setPlans]         = useState<PlanFromApi[]>([]);
  const [plansLoading,  setPlansLoading]  = useState(false);

  const { data: segments = [], isLoading: segmentsLoading } = useListSegmentTemplates();

  // ── Load progress on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.tenantId) return;
    (async () => {
      try {
        const data = await apiGet("/api/onboarding") as { stepAtual?: number; concluido?: boolean };
        if (data.concluido) {
          setLocation("/dashboard");
          return;
        }
        const s = data.stepAtual ?? 1;
        setStep(Math.min(Math.max(s, 1), 4) as WizardStep);
      } catch {
        // ignore — start at step 1
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.tenantId, setLocation]);

  // ── Load plans when reaching step 4 ────────────────────────────────────────
  useEffect(() => {
    if (step !== 4) return;
    setPlansLoading(true);
    apiGet("/api/onboarding/plans")
      .then((data) => {
        const arr = data as PlanFromApi[];
        setPlans(arr.slice(0, 3));
        if (arr.length > 0 && !s4PlanoId) setS4PlanoId(arr[0].id);
      })
      .catch(() => {/* ignore */})
      .finally(() => setPlansLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Logo upload ─────────────────────────────────────────────────────────────
  async function handleLogoUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Selecione um arquivo de imagem", variant: "destructive" });
      return;
    }
    setLogoUploading(true);
    try {
      const token = getToken();
      const base = getBase();
      const urlRes = await fetch(`${base}/api/storage/upload-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      const { uploadURL, objectPath } = await urlRes.json();
      await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      setS1Logo(objectPath);
      toast({ title: "Logo carregada!" });
    } catch {
      toast({ title: "Erro no upload. Tente novamente.", variant: "destructive" });
    } finally {
      setLogoUploading(false);
    }
  }

  // ── WhatsApp test ───────────────────────────────────────────────────────────
  async function handleWaTest() {
    setS2Testing(true);
    setS2Status("idle");
    try {
      const res = await fetch(`${getBase()}/api/onboarding/whatsapp/test`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      });
      const data = await res.json().catch(() => ({})) as { conectado?: boolean };
      setS2Status(data.conectado ? "ok" : "fail");
    } catch {
      setS2Status("fail");
    } finally {
      setS2Testing(false);
    }
  }

  // ── Step handlers ───────────────────────────────────────────────────────────
  async function handleStep1() {
    if (!s1NomeEmpresa.trim()) {
      toast({ title: "Informe o nome da empresa", variant: "destructive" });
      return;
    }
    if (!s1Segmento) {
      toast({ title: "Selecione o segmento", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await apiPatch("/api/onboarding/step/1", {
        nomeEmpresa: s1NomeEmpresa.trim(),
        segmento: s1Segmento,
        ...(s1Logo ? { logoUrl: s1Logo } : {}),
      });
      setStep(2);
    } catch (err) {
      toast({ title: String(err instanceof Error ? err.message : "Erro ao salvar"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStep2() {
    setSubmitting(true);
    try {
      await apiPatch("/api/onboarding/step/2", {
        zapiInstanceId: s2InstanceId.trim() || undefined,
        zapiToken: s2Token.trim() || undefined,
        numeroWhatsapp: s2Numero.trim() || undefined,
      });
      setStep(3);
    } catch (err) {
      toast({ title: String(err instanceof Error ? err.message : "Erro ao salvar"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStep3() {
    setSubmitting(true);
    try {
      await apiPatch("/api/onboarding/step/3", {
        agentKey: s3AgentKey,
        nomePerfil: s3NomePerfil.trim() || undefined,
        tom: s3Tom || undefined,
      });
      setStep(4);
    } catch (err) {
      toast({ title: String(err instanceof Error ? err.message : "Erro ao salvar"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStep4() {
    if (!s4PlanoId) {
      toast({ title: "Selecione um plano", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await apiPatch("/api/onboarding/step/4", { planoId: s4PlanoId, ciclo: s4Ciclo });
      setStep("done");
    } catch (err) {
      toast({ title: String(err instanceof Error ? err.message : "Erro ao confirmar plano"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Progress bar ─────────────────────────────────────────────────────────────
  const stepNum = step === "done" ? 4 : (step as number);
  const progressPct = step === "done" ? 100 : ((stepNum - 1) / 4) * 100;

  const STEP_LABELS = ["Empresa", "WhatsApp", "Primeiro Agente", "Plano"];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Header ── */}
      <header className="border-b bg-card px-6 py-3 flex items-center justify-between shrink-0">
        <img src={logoLight} alt="VendorAI" className="h-7" />
        {step !== "done" && (
          <span className="text-sm text-muted-foreground">
            Etapa {stepNum} de 4
          </span>
        )}
      </header>

      {/* ── Progress bar ── */}
      {step !== "done" && (
        <div className="w-full bg-muted h-1.5">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* ── Step indicators ── */}
      {step !== "done" && (
        <div className="flex justify-center gap-0 pt-6 pb-2">
          {STEP_LABELS.map((label, i) => {
            const idx = i + 1;
            const done = idx < stepNum;
            const active = idx === stepNum;
            return (
              <div key={label} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all ${
                      done
                        ? "bg-primary border-primary text-primary-foreground"
                        : active
                        ? "border-primary text-primary bg-primary/10"
                        : "border-muted-foreground/30 text-muted-foreground/50"
                    }`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : idx}
                  </div>
                  <span
                    className={`text-[10px] mt-1 ${
                      active ? "text-primary font-medium" : "text-muted-foreground/60"
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div
                    className={`w-12 h-0.5 mb-5 mx-1 transition-colors ${
                      done ? "bg-primary" : "bg-muted-foreground/20"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Content ── */}
      <main className="flex-1 flex flex-col items-center py-8 px-4">
        <div className="w-full max-w-lg space-y-6">

          {/* ═══════════════════════════════════════════════════════
              STEP 1 — EMPRESA
          ═══════════════════════════════════════════════════════ */}
          {step === 1 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Vamos começar!</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Conta-nos um pouco sobre a sua empresa.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nomeEmpresa">
                    Nome da empresa <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="nomeEmpresa"
                    placeholder="Ex: Clínica da Ana, Distribuidora Silva..."
                    value={s1NomeEmpresa}
                    onChange={(e) => setS1NomeEmpresa(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>
                    Segmento <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={s1Segmento}
                    onValueChange={setS1Segmento}
                    disabled={segmentsLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o segmento..." />
                    </SelectTrigger>
                    <SelectContent>
                      {segments.map((s) => (
                        <SelectItem key={s.id} value={s.nome}>{s.nome}</SelectItem>
                      ))}
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Logo da empresa <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoUpload(file);
                      e.target.value = "";
                    }}
                  />
                  {s1Logo ? (
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                      <img
                        src={s1Logo.startsWith("/objects/") ? `/api/storage${s1Logo}` : s1Logo}
                        alt="Logo preview"
                        className="h-12 w-auto max-w-[160px] rounded object-contain"
                        onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                      />
                      <span className="flex-1 text-xs text-muted-foreground">Logo carregada</span>
                      <Button
                        type="button" variant="ghost" size="sm"
                        onClick={() => setS1Logo("")}
                        className="text-muted-foreground hover:text-destructive h-7 w-7 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={logoUploading}
                      className="w-full flex flex-col items-center gap-2 p-6 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {logoUploading ? (
                        <Loader2 className="h-7 w-7 animate-spin text-primary" />
                      ) : (
                        <>
                          <ImageIcon className="h-7 w-7 text-muted-foreground/50" />
                          <span className="text-sm font-medium">Clique para selecionar a logo</span>
                          <span className="text-xs text-muted-foreground">PNG, JPG, SVG ou WebP</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <Button
                  className="w-full gap-2"
                  disabled={submitting || !s1NomeEmpresa.trim() || !s1Segmento}
                  onClick={handleStep1}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Próximo
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* ═══════════════════════════════════════════════════════
              STEP 2 — WHATSAPP
          ═══════════════════════════════════════════════════════ */}
          {step === 2 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Conecte seu WhatsApp</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Informe as credenciais Z-API para ativar o canal de mensagens.{" "}
                    <span className="text-muted-foreground/70">(pode pular e configurar depois)</span>
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="zapiInstance">ID da instância Z-API</Label>
                  <Input
                    id="zapiInstance"
                    placeholder="Ex: 3D6B1A..."
                    value={s2InstanceId}
                    onChange={(e) => setS2InstanceId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zapiToken">Token da instância</Label>
                  <Input
                    id="zapiToken"
                    type="password"
                    placeholder="Token Z-API"
                    value={s2Token}
                    onChange={(e) => setS2Token(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="waNumero">Número WhatsApp</Label>
                  <Input
                    id="waNumero"
                    placeholder="5511999999999 (apenas números)"
                    value={s2Numero}
                    onChange={(e) => setS2Numero(e.target.value)}
                  />
                </div>

                {s2InstanceId && s2Token && (
                  <div className="flex items-center gap-3">
                    <Button
                      type="button" variant="outline" size="sm"
                      onClick={handleWaTest}
                      disabled={s2Testing}
                      className="gap-2"
                    >
                      {s2Testing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Testar conexão
                    </Button>
                    {s2Status === "ok" && (
                      <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                        <Wifi className="h-4 w-4" /> Conectado
                      </span>
                    )}
                    {s2Status === "fail" && (
                      <span className="flex items-center gap-1.5 text-sm text-destructive font-medium">
                        <WifiOff className="h-4 w-4" /> Não conectado
                      </span>
                    )}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <Button variant="ghost" onClick={() => setStep(1)} className="gap-1.5">
                    <ChevronLeft className="h-4 w-4" /> Voltar
                  </Button>
                  <Button className="flex-1 gap-2" disabled={submitting} onClick={handleStep2}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {s2InstanceId && s2Token ? "Salvar e continuar" : "Pular por agora"}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ═══════════════════════════════════════════════════════
              STEP 3 — PRIMEIRO AGENTE
          ═══════════════════════════════════════════════════════ */}
          {step === 3 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Ative seu primeiro agente de IA</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Escolha o agente que vai trabalhar para você desde o primeiro dia.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {AGENT_CARDS.map(({ key, label, desc, Icon }) => {
                    const selected = s3AgentKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setS3AgentKey(key)}
                        className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all hover:shadow-sm ${
                          selected
                            ? "border-transparent ring-2 ring-primary bg-primary/5"
                            : "border-border hover:border-primary/40"
                        }`}
                        style={
                          selected
                            ? {
                                borderImage:
                                  "linear-gradient(135deg, #6366f1, #8b5cf6) 1",
                                borderImageSlice: 1,
                              }
                            : {}
                        }
                      >
                        {selected && (
                          <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-2.5 w-2.5 text-white" />
                          </span>
                        )}
                        <Icon className={`h-6 w-6 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                        <span className={`text-sm font-semibold leading-tight ${selected ? "text-primary" : ""}`}>
                          {label}
                        </span>
                        <span className="text-[11px] text-muted-foreground leading-snug">{desc}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-4 pt-1 border-t">
                  <div className="space-y-2">
                    <Label htmlFor="nomePerfil">Nome do agente</Label>
                    <Input
                      id="nomePerfil"
                      placeholder="Ex: Clara, Max, Ana..."
                      value={s3NomePerfil}
                      onChange={(e) => setS3NomePerfil(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tom de comunicação</Label>
                    <Select value={s3Tom} onValueChange={setS3Tom}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TOM_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <Button variant="ghost" onClick={() => setStep(2)} className="gap-1.5">
                    <ChevronLeft className="h-4 w-4" /> Voltar
                  </Button>
                  <Button className="flex-1 gap-2" disabled={submitting} onClick={handleStep3}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Ativar e continuar
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ═══════════════════════════════════════════════════════
              STEP 4 — PLANO
          ═══════════════════════════════════════════════════════ */}
          {step === 4 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Escolha seu plano</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Sem taxas surpresa. Cancele quando quiser.
                  </p>
                </div>

                {/* Ciclo toggle */}
                <div className="flex items-center gap-0 rounded-lg border p-1 w-fit mx-auto">
                  <button
                    type="button"
                    onClick={() => setS4Ciclo("mensal")}
                    className={`px-5 py-1.5 rounded-md text-sm font-medium transition-all ${
                      s4Ciclo === "mensal"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Mensal
                  </button>
                  <button
                    type="button"
                    onClick={() => setS4Ciclo("anual")}
                    className={`px-5 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                      s4Ciclo === "anual"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Anual
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      s4Ciclo === "anual"
                        ? "bg-white/20 text-white"
                        : "bg-green-100 text-green-700"
                    }`}>
                      2 meses grátis
                    </span>
                  </button>
                </div>

                {plansLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : plans.length === 0 ? (
                  <div className="rounded-lg border border-muted p-6 text-center text-sm text-muted-foreground">
                    Nenhum plano disponível no momento.
                    <br />
                    Entre em contato com o suporte.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {plans.map((plan, i) => {
                      const display = PLAN_DISPLAY[i] ?? {
                        label: plan.name,
                        implantacao: 0,
                        quotaIA: "—",
                        popular: false,
                      };
                      const priceCents =
                        s4Ciclo === "anual" && plan.monthlyPriceAnnualCents
                          ? plan.monthlyPriceAnnualCents
                          : (plan.monthlyPriceCents ?? 0);
                      const priceReal = Math.round(priceCents / 100);
                      const selected = s4PlanoId === plan.id;

                      return (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={() => setS4PlanoId(plan.id)}
                          className={`relative w-full text-left rounded-xl border-2 p-4 transition-all hover:shadow-sm ${
                            selected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/40"
                          }`}
                        >
                          {display.popular && (
                            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[11px] font-bold px-3 py-0.5 rounded-full">
                              Mais popular
                            </span>
                          )}
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-base">{display.label}</span>
                              </div>
                              <div className="text-2xl font-bold mt-1">
                                R$ {priceReal.toLocaleString("pt-BR")}
                                <span className="text-sm font-normal text-muted-foreground">/mês</span>
                              </div>
                            </div>
                            <div
                              className={`mt-1 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                selected ? "border-primary bg-primary" : "border-muted-foreground/40"
                              }`}
                            >
                              {selected && <Check className="h-3 w-3 text-white" />}
                            </div>
                          </div>
                          <div className="mt-3 pt-3 border-t flex gap-6 text-xs text-muted-foreground">
                            <span>
                              Implantação{" "}
                              <strong className="text-foreground">
                                R$ {display.implantacao.toLocaleString("pt-BR")}
                              </strong>
                            </span>
                            <span>
                              Quota IA{" "}
                              <strong className="text-foreground">{display.quotaIA}/mês</strong>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <Button variant="ghost" onClick={() => setStep(3)} className="gap-1.5">
                    <ChevronLeft className="h-4 w-4" /> Voltar
                  </Button>
                  <Button
                    className="flex-1 gap-2"
                    disabled={submitting || !s4PlanoId || plans.length === 0}
                    onClick={handleStep4}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Configurando sua conta...
                      </>
                    ) : (
                      <>
                        Confirmar e começar
                        <ChevronRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ═══════════════════════════════════════════════════════
              DONE — CONCLUSÃO
          ═══════════════════════════════════════════════════════ */}
          {step === "done" && (
            <>
              <style>{`
                @keyframes check-pop {
                  0%   { transform: scale(0); opacity: 0; }
                  60%  { transform: scale(1.15); opacity: 1; }
                  100% { transform: scale(1); opacity: 1; }
                }
                .check-pop { animation: check-pop 0.5s cubic-bezier(.175,.885,.32,1.275) both; }
              `}</style>

              <div className="flex flex-col items-center text-center gap-6 py-6">
                <div className="check-pop flex items-center justify-center h-20 w-20 rounded-full bg-green-100">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                </div>

                <div>
                  <h2 className="text-2xl font-bold">Tudo pronto!</h2>
                  <p className="text-muted-foreground mt-2 text-sm">
                    Sua conta está configurada e seus agentes de IA já podem trabalhar.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 w-full">
                  {[
                    { label: "Adicionar leads", path: "/leads/new" },
                    { label: "Ver agentes", path: "/agents/config" },
                    { label: "Ir para o dashboard", path: "/dashboard" },
                  ].map(({ label, path }) => (
                    <button
                      key={path}
                      type="button"
                      onClick={() => setLocation(path)}
                      className="flex flex-col items-center gap-2 rounded-xl border p-4 hover:border-primary/60 hover:bg-muted/40 transition-all text-sm font-medium text-center"
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <Button
                  size="lg"
                  className="w-full gap-2"
                  onClick={() => setLocation("/dashboard")}
                >
                  Ir para o dashboard
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}

        </div>
      </main>
    </div>
  );
}
