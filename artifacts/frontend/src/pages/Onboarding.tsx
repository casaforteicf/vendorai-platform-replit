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

const PLANO_PARAM_INDEX: Record<string, number> = { growth: 0, pme: 1, enterprise: 2 };

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
  const { user, logout } = useAuth();
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
  const [s2PhoneNumberId, setS2PhoneNumberId] = useState("");
  const [s2AccessToken,   setS2AccessToken]   = useState("");
  const [s2WabaId,        setS2WabaId]        = useState("");
  const [s2Numero,        setS2Numero]        = useState("");

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

  // ── Persist ?plano= query param across login redirect ───────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const plano = params.get("plano")?.toLowerCase();
    if (plano && PLANO_PARAM_INDEX[plano] !== undefined) {
      sessionStorage.setItem("vendorai_selected_plano", plano);
    }
  }, []);

  // ── Load progress on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.tenantId) return;
    (async () => {
      try {
        const data = await apiGet("/api/onboarding") as { stepAtual?: number; concluido?: boolean };
        if (data.concluido) {
          window.location.replace("/dashboard");
          return;
        }
        const s = data.stepAtual ?? 1;
        if (s >= 4) {
          await apiPatch("/api/onboarding/step/4", {});
          setStep("done");
          return;
        }
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
        const arr = (data as PlanFromApi[]).slice(0, 3);
        setPlans(arr);
        if (arr.length > 0 && !s4PlanoId) {
          const stored = sessionStorage.getItem("vendorai_selected_plano");
          const idx = stored !== null ? (PLANO_PARAM_INDEX[stored] ?? 0) : 0;
          setS4PlanoId(arr[Math.min(idx, arr.length - 1)].id);
        }
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
      const requestRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      const payload = await requestRes.json().catch(() => ({})) as {
        uploadURL?: string;
        objectPath?: string;
        error?: string;
      };
      if (!requestRes.ok || !payload.uploadURL || !payload.objectPath) {
        throw new Error(payload.error || `Falha ao preparar upload (HTTP ${requestRes.status})`);
      }

      const uploadRes = await fetch(payload.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) {
        throw new Error(`Falha ao enviar arquivo (HTTP ${uploadRes.status})`);
      }

      setS1Logo(payload.objectPath);
      toast({ title: "Logo carregada!" });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Erro no upload. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLogoUploading(false);
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
    const phoneId = s2PhoneNumberId.trim();
    const token   = s2AccessToken.trim();

    // If no credentials provided, skip without calling the API
    if (!phoneId || !token) {
      setStep(3);
      return;
    }

    if (!s2Numero.trim()) {
      toast({ title: "Informe o número WhatsApp", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      await apiPatch("/api/onboarding/step/2", {
        metaPhoneNumberId: phoneId,
        metaAccessToken:   token,
        metaWabaId:        s2WabaId.trim() || undefined,
        numeroWhatsapp:    s2Numero.trim(),
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
      await apiPatch("/api/onboarding/step/4", {});
      setStep("done");
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

  async function goToDashboard() {
    setSubmitting(true);
    try {
      const progress = await apiGet("/api/onboarding") as { concluido?: boolean };
      if (!progress.concluido) {
        await apiPatch("/api/onboarding/step/4", {});
      }
      // Full navigation intentionally clears stale tenant cache used by ProtectedRoute.
      window.location.assign("/dashboard");
    } catch (err) {
      toast({
        title: String(err instanceof Error ? err.message : "Erro ao concluir onboarding"),
        variant: "destructive",
      });
      setSubmitting(false);
    }
  }

  // ── Progress bar ─────────────────────────────────────────────────────────────
  const stepNum = step === "done" ? 3 : Math.min(step as number, 3);
  const progressPct = step === "done" ? 100 : ((stepNum - 1) / 3) * 100;

  const STEP_LABELS = ["Empresa", "WhatsApp", "Primeiro Agente"];

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
        <div className="flex items-center gap-4">
          {step !== "done" && (
            <span className="text-sm text-muted-foreground">
              Etapa {stepNum} de 4
            </span>
          )}
          <button
            type="button"
            onClick={() => { logout(); setLocation("/"); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar e sair
          </button>
        </div>
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
                  <div>
                    <h2 className="text-xl font-bold">Vamos começar!</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Conta-nos um pouco sobre a sua empresa.
                    </p>
                  </div>
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
                  <select
                    value={s1Segmento}
                    onChange={(event) => setS1Segmento(event.target.value)}
                    disabled={segmentsLoading}
                    aria-label="Segmento da empresa"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm outline-none ring-offset-background focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                  >
                    <option value="">{segmentsLoading ? "Carregando segmentos..." : "Selecione o segmento..."}</option>
                    {segments.map((segment) => (
                      <option key={segment.id} value={segment.nome}>{segment.nome}</option>
                    ))}
                    <option value="Outro">Outro</option>
                  </select>
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
                    Informe as credenciais da API Oficial Meta (WhatsApp Business Platform).{" "}
                    <span className="text-muted-foreground/70">(pode pular e configurar depois)</span>
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="metaPhoneNumberId">Phone Number ID</Label>
                  <Input
                    id="metaPhoneNumberId"
                    placeholder="Ex: 123456789012345"
                    value={s2PhoneNumberId}
                    onChange={(e) => setS2PhoneNumberId(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Encontrado no Meta Business Manager → WhatsApp → Configuração</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="metaAccessToken">Access Token</Label>
                  <Input
                    id="metaAccessToken"
                    type="password"
                    placeholder="Token de acesso permanente"
                    value={s2AccessToken}
                    onChange={(e) => setS2AccessToken(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="metaWabaId">WABA ID <span className="text-muted-foreground/60">(opcional)</span></Label>
                  <Input
                    id="metaWabaId"
                    placeholder="Ex: 987654321098765"
                    value={s2WabaId}
                    onChange={(e) => setS2WabaId(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="waNumero">Número WhatsApp</Label>
                  <Input
                    id="waNumero"
                    placeholder="5511999999999 (apenas números, com DDI)"
                    value={s2Numero}
                    onChange={(e) => setS2Numero(e.target.value)}
                  />
                </div>

                <div className="flex gap-3 pt-1">
                  <Button variant="ghost" onClick={() => setStep(1)} className="gap-1.5">
                    <ChevronLeft className="h-4 w-4" /> Voltar
                  </Button>
                  <Button className="flex-1 gap-2" disabled={submitting} onClick={handleStep2}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {s2PhoneNumberId && s2AccessToken ? "Salvar e continuar" : "Pular por agora"}
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

                <Button
                  size="lg"
                  className="w-full gap-2"
                  onClick={() => setLocation("/onboarding/integracoes")}
                >
                  Configurar integrações
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={goToDashboard}
                  disabled={submitting}
                >
                  {submitting ? "Concluindo..." : "Pular e ir direto para o dashboard"}
                </button>
              </div>
            </>
          )}

        </div>
      </main>
    </div>
  );
}
