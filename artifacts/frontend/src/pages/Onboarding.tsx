import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useListSegmentTemplates } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";
import { useToast } from "@/hooks/use-toast";
import { TenantBrand, normalizeTenantLogoUrl } from "@/components/TenantBrand";
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
import OnboardingPlanStep, { type TrialPlanMode } from "./OnboardingPlanStep";
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
  X,
  ImageIcon,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
type WizardStep = 1 | 2 | 3 | "plan" | "done";

// ── Constants ─────────────────────────────────────────────────────────────────
const AGENT_CARDS = [
  { key: "sdr",            labelKey: "onboarding.agent.label.sdr",        descKey: "onboarding.agent.sdr",        Icon: UserSearch },
  { key: "closer",         labelKey: "onboarding.agent.label.closer",     descKey: "onboarding.agent.closer",     Icon: Handshake },
  { key: "relacionamento", labelKey: "onboarding.agent.label.finance",    descKey: "onboarding.agent.finance",    Icon: BarChart2 },
  { key: "reactivation",   labelKey: "onboarding.agent.label.collection", descKey: "onboarding.agent.collection", Icon: AlertCircle },
  { key: "service",        labelKey: "onboarding.agent.label.support",    descKey: "onboarding.agent.support",    Icon: Headphones },
  { key: "scheduler",      labelKey: "onboarding.agent.label.scheduler",  descKey: "onboarding.agent.scheduler",  Icon: CalendarCheck },
  { key: "followup",       labelKey: "onboarding.agent.label.afterSales", descKey: "onboarding.agent.afterSales", Icon: Star },
  { key: "onboarding",     labelKey: "onboarding.agent.label.prospector", descKey: "onboarding.agent.prospector", Icon: Telescope },
] as const;

const TOM_OPTIONS = [
  { value: "profissional", labelKey: "onboarding.tone.professional" },
  { value: "amigavel",     labelKey: "onboarding.tone.friendly" },
  { value: "tecnico",      labelKey: "onboarding.tone.technical" },
  { value: "vendedor",     labelKey: "onboarding.tone.sales" },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem("vendorai_token"); }
function getBase()  { return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, ""); }

async function apiRequest(path: string, method: "POST" | "PATCH", body: unknown) {
  const res = await fetch(`${getBase()}${path}`, {
    method,
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

async function apiPatch(path: string, body: unknown) {
  return apiRequest(path, "PATCH", body);
}

async function apiPost(path: string, body: unknown) {
  return apiRequest(path, "POST", body);
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
  const { t } = useI18n();

  const [step, setStep] = useState<WizardStep>(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isTrial, setIsTrial] = useState(false);

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

  const { data: segments = [], isLoading: segmentsLoading } = useListSegmentTemplates();

  // ── Load progress on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.tenantId) return;
    (async () => {
      try {
        const data = await apiGet("/api/onboarding") as { stepAtual?: number; concluido?: boolean };
        let trialActive = false;
        try {
          const trial = await apiGet("/api/trial/status") as { isTrial?: boolean };
          trialActive = trial.isTrial === true;
        } catch {
          // Compatibilidade com ambientes ainda sem a rota de jornada de trial.
        }
        setIsTrial(trialActive);

        if (data.concluido) {
          window.location.replace("/dashboard");
          return;
        }
        const s = data.stepAtual ?? 1;
        if (s >= 2) {
          await apiPatch("/api/onboarding/step/4", {});
          window.location.replace("/dashboard");
          return;
        }
        setStep(1);
      } catch {
        // ignore — start at step 1
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.tenantId, setLocation]);

  // ── Logo upload ─────────────────────────────────────────────────────────────
  async function handleLogoUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast({ title: t("onboarding.error.selectImage"), variant: "destructive" });
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
        throw new Error(payload.error || `HTTP ${requestRes.status}`);
      }

      const uploadRes = await fetch(payload.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) {
        throw new Error(`HTTP ${uploadRes.status}`);
      }

      setS1Logo(payload.objectPath);
      toast({ title: t("onboarding.success.logoLoaded") });
    } catch (err) {
      toast({
        title: err instanceof Error && !err.message.startsWith("HTTP ") ? err.message : t("onboarding.error.logoUpload"),
        variant: "destructive",
      });
    } finally {
      setLogoUploading(false);
    }
  }

  async function saveCanonicalBusinessBrand(nomeEmpresa: string, logoUrl?: string) {
    if (!user?.tenantId) return;

    const profile = await apiGet(`/api/tenants/${user.tenantId}/business-profile`) as {
      id?: string;
    } | null;
    const normalizedLogoUrl = normalizeTenantLogoUrl(logoUrl);
    const brandPayload = {
      nomeFantasia: nomeEmpresa,
      ...(normalizedLogoUrl ? { logoUrl: normalizedLogoUrl } : {}),
    };

    if (profile?.id) {
      await apiPatch(`/api/business-profiles/${profile.id}`, brandPayload);
      return;
    }

    await apiPost("/api/business-profiles", {
      tenantId: user.tenantId,
      razaoSocial: nomeEmpresa,
      ...brandPayload,
    });
  }

  // ── Step handlers ───────────────────────────────────────────────────────────
  async function handleStep1() {
    if (!s1NomeEmpresa.trim()) {
      toast({ title: t("onboarding.error.companyName"), variant: "destructive" });
      return;
    }
    if (!s1Segmento) {
      toast({ title: t("onboarding.error.segment"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const companyName = s1NomeEmpresa.trim();
      await apiPatch("/api/onboarding/step/1", {
        nomeEmpresa: companyName,
        segmento: s1Segmento,
      });
      await saveCanonicalBusinessBrand(companyName, s1Logo || undefined);
      await apiPatch("/api/onboarding/step/4", {});
      window.location.assign("/diagnostico-planejamento?source=onboarding");
    } catch (err) {
      toast({ title: String(err instanceof Error ? err.message : t("onboarding.error.save")), variant: "destructive" });
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
      toast({ title: t("onboarding.error.whatsappNumber"), variant: "destructive" });
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
      toast({ title: String(err instanceof Error ? err.message : t("onboarding.error.save")), variant: "destructive" });
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
      if (isTrial) {
        setStep("plan");
      } else {
        await apiPatch("/api/onboarding/step/4", {});
        setStep("done");
      }
    } catch (err) {
      toast({ title: String(err instanceof Error ? err.message : t("onboarding.error.save")), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePlanSelection(mode: TrialPlanMode) {
    setSubmitting(true);
    try {
      await apiPost("/api/trial/select-plan", { mode });
      await apiPatch("/api/onboarding/step/4", {});
      setStep("done");
    } catch (err) {
      toast({
        title: String(err instanceof Error ? err.message : "Não foi possível selecionar o plano."),
        variant: "destructive",
      });
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
      window.location.assign("/diagnostico-planejamento?source=onboarding");
    } catch (err) {
      toast({
        title: String(err instanceof Error ? err.message : t("onboarding.error.finish")),
        variant: "destructive",
      });
      setSubmitting(false);
    }
  }

  // ── Progress bar ─────────────────────────────────────────────────────────────
  const stepNum = 1;
  const progressPct = step === "done" ? 100 : 0;

  const STEP_LABELS = [t("onboarding.progress.company")];

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
        <TenantBrand pendingName={s1NomeEmpresa} pendingLogoUrl={s1Logo} />
        <div className="flex items-center gap-4">
          {step === "plan" ? (
            <span className="text-sm font-medium text-primary">Escolha seu plano</span>
          ) : step !== "done" ? (
            <span className="text-sm text-muted-foreground">
              {t("onboarding.header.step", { current: 1, total: 1 })}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => { logout(); setLocation("/"); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("onboarding.header.cancelExit")}
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
      {step !== "done" && step !== "plan" && (
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
        <div className={`w-full space-y-6 ${step === "plan" ? "max-w-4xl" : "max-w-lg"}`}>

          {/* ═══════════════════════════════════════════════════════
              STEP 1 — EMPRESA
          ═══════════════════════════════════════════════════════ */}
          {step === 1 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">{t("onboarding.company.title")}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{t("onboarding.company.subtitle")}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nomeEmpresa">
                    {t("onboarding.company.name")} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="nomeEmpresa"
                    placeholder={t("onboarding.company.namePlaceholder")}
                    value={s1NomeEmpresa}
                    onChange={(e) => setS1NomeEmpresa(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>
                    {t("onboarding.company.segment")} <span className="text-destructive">*</span>
                  </Label>
                  <select
                    value={s1Segmento}
                    onChange={(event) => setS1Segmento(event.target.value)}
                    disabled={segmentsLoading}
                    aria-label={t("onboarding.company.segment")}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm outline-none ring-offset-background focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                  >
                    <option value="">{segmentsLoading ? t("onboarding.company.loadingSegments") : t("onboarding.company.selectSegment")}</option>
                    {segments.map((segment) => (
                      <option key={segment.id} value={segment.nome}>{segment.nome}</option>
                    ))}
                    <option value="Outro">{t("onboarding.company.other")}</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>{t("onboarding.company.logo")} <span className="text-xs text-muted-foreground">({t("onboarding.optional")})</span></Label>
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
                        src={normalizeTenantLogoUrl(s1Logo)}
                        alt="Logo preview"
                        className="h-12 w-auto max-w-[160px] rounded object-contain"
                        onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                      />
                      <span className="flex-1 text-xs text-muted-foreground">{t("onboarding.company.logoLoaded")}</span>
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
                          <span className="text-sm font-medium">{t("onboarding.company.selectLogo")}</span>
                          <span className="text-xs text-muted-foreground">{t("onboarding.company.logoFormats")}</span>
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
                  Criar e entrar no VendorAI
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
                  <h2 className="text-xl font-bold">{t("onboarding.whatsapp.title")}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("onboarding.whatsapp.subtitle")}{" "}
                    <span className="text-muted-foreground/70">({t("onboarding.whatsapp.skipHint")})</span>
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
                  <p className="text-xs text-muted-foreground">{t("onboarding.whatsapp.phoneIdHelp")}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="metaAccessToken">Access Token</Label>
                  <Input
                    id="metaAccessToken"
                    type="password"
                    placeholder={t("onboarding.whatsapp.tokenPlaceholder")}
                    value={s2AccessToken}
                    onChange={(e) => setS2AccessToken(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="metaWabaId">WABA ID <span className="text-muted-foreground/60">({t("onboarding.optional")})</span></Label>
                  <Input
                    id="metaWabaId"
                    placeholder="Ex: 987654321098765"
                    value={s2WabaId}
                    onChange={(e) => setS2WabaId(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="waNumero">{t("onboarding.whatsapp.number")}</Label>
                  <Input
                    id="waNumero"
                    placeholder={t("onboarding.whatsapp.numberPlaceholder")}
                    value={s2Numero}
                    onChange={(e) => setS2Numero(e.target.value)}
                  />
                </div>

                <div className="flex gap-3 pt-1">
                  <Button variant="ghost" onClick={() => setStep(1)} className="gap-1.5">
                    <ChevronLeft className="h-4 w-4" /> {t("common.back")}
                  </Button>
                  <Button className="flex-1 gap-2" disabled={submitting} onClick={handleStep2}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {s2PhoneNumberId && s2AccessToken ? t("onboarding.whatsapp.saveContinue") : t("onboarding.whatsapp.skipNow")}
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
                  <h2 className="text-xl font-bold">{t("onboarding.agent.title")}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{t("onboarding.agent.subtitle")}</p>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {AGENT_CARDS.map(({ key, labelKey, descKey, Icon }) => {
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
                          {t(labelKey)}
                        </span>
                        <span className="text-[11px] text-muted-foreground leading-snug">{t(descKey)}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-4 pt-1 border-t">
                  <div className="space-y-2">
                    <Label htmlFor="nomePerfil">{t("onboarding.agent.name")}</Label>
                    <Input
                      id="nomePerfil"
                      placeholder={t("onboarding.agent.namePlaceholder")}
                      value={s3NomePerfil}
                      onChange={(e) => setS3NomePerfil(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("onboarding.agent.tone")}</Label>
                    <Select value={s3Tom} onValueChange={setS3Tom}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TOM_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{t(o.labelKey)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <Button variant="ghost" onClick={() => setStep(2)} className="gap-1.5">
                    <ChevronLeft className="h-4 w-4" /> {t("common.back")}
                  </Button>
                  <Button className="flex-1 gap-2" disabled={submitting} onClick={handleStep3}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {t("onboarding.agent.activateContinue")}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ═══════════════════════════════════════════════════════
              PLAN — ESCOLHA COMERCIAL DO TRIAL
          ═══════════════════════════════════════════════════════ */}
          {step === "plan" && (
            <OnboardingPlanStep
              submitting={submitting}
              onBack={() => setStep(3)}
              onSelect={handlePlanSelection}
            />
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
                  <h2 className="text-2xl font-bold">{t("onboarding.done.title")}</h2>
                  <p className="text-muted-foreground mt-2 text-sm">{t("onboarding.done.subtitle")}</p>
                </div>

                <Button
                  size="lg"
                  className="w-full gap-2"
                  onClick={() => setLocation("/onboarding/integracoes")}
                >
                  {t("onboarding.done.integrations")}
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={goToDashboard}
                  disabled={submitting}
                >
                  {submitting ? t("onboarding.done.finishing") : t("onboarding.done.skipDashboard")}
                </button>
              </div>
            </>
          )}

        </div>
      </main>
    </div>
  );
}
