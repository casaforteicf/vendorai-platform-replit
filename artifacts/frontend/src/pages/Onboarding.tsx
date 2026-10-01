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
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  ImageIcon,
  Upload,
  FileText,
  Sparkles,
  Building2,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
type WizardStep = 1 | 2 | 3 | "done";

type BusinessDocumentAnalysis = {
  nomeFantasia?: string | null;
  vertical?: string | null;
  produtos?: Array<{ nome: string; descricao?: string | null; preco?: number | null }> | null;
  diferenciais?: string | null;
  publicoAlvo?: string | null;
  concorrentes?: string[] | null;
  canaisVenda?: string[] | null;
  missao?: string | null;
  visao?: string | null;
  valores?: string[] | null;
  historia?: string | null;
  confianca?: number | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────
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

  // Step 1 state
  const [s1NomeEmpresa, setS1NomeEmpresa] = useState("");
  const [s1Segmento,    setS1Segmento]    = useState("");
  const [s1Logo,        setS1Logo]        = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const [documentAnalyzing, setDocumentAnalyzing] = useState(false);
  const [documentNames, setDocumentNames] = useState<string[]>([]);
  const [businessAnalysis, setBusinessAnalysis] = useState<BusinessDocumentAnalysis | null>(null);

  const { data: segments = [], isLoading: segmentsLoading } = useListSegmentTemplates();

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
        // Resume the assisted discovery instead of silently finishing onboarding.
        // Existing tenants that saved step 1 should continue at document import.
        setStep(s >= 2 ? 2 : 1);
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
      setBusinessAnalysis((current) => ({ ...(current ?? {}),
        nomeFantasia: current?.nomeFantasia || companyName,
        vertical: current?.vertical || s1Segmento,
      }));
      setStep(2);
    } catch (err) {
      toast({ title: String(err instanceof Error ? err.message : t("onboarding.error.save")), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }


  async function analyzeBusinessDocuments(files: FileList | null) {
    if (!user?.tenantId || !files?.length) return;
    const selected = Array.from(files).slice(0, 3);
    setDocumentNames(selected.map((file) => file.name));
    setDocumentAnalyzing(true);
    try {
      const body = new FormData();
      for (const file of selected) body.append("files", file);
      const res = await fetch(`/api/tenants/${user.tenantId}/onboarding/analyze-documents`, {
        method: "POST",
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
        body,
      });
      const data = await res.json().catch(() => ({})) as BusinessDocumentAnalysis & { error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setBusinessAnalysis({
        ...data,
        nomeFantasia: data.nomeFantasia || s1NomeEmpresa,
        vertical: data.vertical || s1Segmento,
      });
      toast({
        title: typeof data.confianca === "number"
          ? `Vendi analisou seus materiais · confiança ${Math.round(data.confianca * 100)}%`
          : "Vendi analisou seus materiais.",
      });
      setStep(3);
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Não foi possível analisar os documentos.",
        variant: "destructive",
      });
    } finally {
      setDocumentAnalyzing(false);
      if (documentInputRef.current) documentInputRef.current.value = "";
    }
  }

  function continueWithoutDocuments() {
    setBusinessAnalysis((current) => ({ ...(current ?? {}),
      nomeFantasia: current?.nomeFantasia || s1NomeEmpresa,
      vertical: current?.vertical || s1Segmento,
    }));
    setStep(3);
  }

  async function finalizeAssistedOnboarding() {
    if (!user?.tenantId) return;
    const analysis = businessAnalysis ?? {};
    const products = (analysis.produtos ?? [])
      .filter((item) => item?.nome?.trim())
      .map((item) => ({
        nome: item.nome.trim(),
        ...(item.descricao?.trim() ? { descricao: item.descricao.trim() } : {}),
        ...(typeof item.preco === "number" && item.preco >= 0 ? { preco: item.preco } : {}),
      }));

    setSubmitting(true);
    try {
      await apiPost(`/api/tenants/${user.tenantId}/onboarding/complete`, {
        nomeFantasia: analysis.nomeFantasia?.trim() || s1NomeEmpresa.trim(),
        vertical: analysis.vertical?.trim() || s1Segmento,
        ...(s1Logo ? { logoUrl: s1Logo } : {}),
        ...(products.length ? { produtos: products } : {}),
        ...(analysis.diferenciais?.trim() ? { diferenciais: analysis.diferenciais.trim() } : {}),
        ...(analysis.publicoAlvo?.trim() ? { publicoAlvo: analysis.publicoAlvo.trim() } : {}),
        ...(analysis.concorrentes?.length ? { concorrentes: analysis.concorrentes } : {}),
        ...(analysis.canaisVenda?.length ? { canaisVenda: analysis.canaisVenda } : {}),
        discoveryData: {
          ...(analysis.missao ? { missao: analysis.missao } : {}),
          ...(analysis.visao ? { visao: analysis.visao } : {}),
          ...(analysis.valores?.length ? { valores: analysis.valores } : {}),
          ...(analysis.historia ? { historia: analysis.historia } : {}),
          onboardingSource: documentNames.length ? "vendi_document_assisted" : "vendi_guided",
          importedDocuments: documentNames,
          extractionConfidence: analysis.confianca ?? null,
        },
      });

      await apiPatch("/api/onboarding/step/4", {});
      setStep("done");
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Não foi possível concluir a implantação.",
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
      window.location.assign("/dashboard");
    } catch (err) {
      toast({
        title: String(err instanceof Error ? err.message : t("onboarding.error.finish")),
        variant: "destructive",
      });
      setSubmitting(false);
    }
  }

  // ── Progress bar ─────────────────────────────────────────────────────────────
  const stepNum = typeof step === "number" ? step : 3;
  const progressPct = step === "done" ? 100 : Math.max(0, Math.min(100, ((stepNum - 1) / 2) * 100));

  const STEP_LABELS = ["Empresa", "Materiais", "Revisar"];

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
          {step !== "done" ? (
            <span className="text-sm text-muted-foreground">
              Etapa {stepNum} de 3
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
        <div className="w-full max-w-lg space-y-6">

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
                  Continuar com Vendi
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* ═══════════════════════════════════════════════════════
              STEP 2 — MATERIAIS DA EMPRESA
          ═══════════════════════════════════════════════════════ */}
          {step === 2 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary/10 p-2.5">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Deixe o Vendi conhecer sua empresa</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Envie o que você já tem. O Vendi organiza as informações e você revisa antes de salvar.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-sm font-medium">Você pode importar</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PDF, Word, texto, imagem, catálogo, apresentação comercial, proposta, tabela ou manual.
                    Até 3 arquivos por análise.
                  </p>
                </div>

                <input
                  ref={documentInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.md,image/*"
                  className="hidden"
                  onChange={(event) => void analyzeBusinessDocuments(event.target.files)}
                />

                <button
                  type="button"
                  disabled={documentAnalyzing}
                  onClick={() => documentInputRef.current?.click()}
                  className="w-full rounded-xl border-2 border-dashed border-muted-foreground/30 p-8 text-center transition hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
                >
                  {documentAnalyzing ? (
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                  ) : (
                    <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                  )}
                  <div className="mt-3 text-sm font-semibold">
                    {documentAnalyzing ? "Vendi está analisando os materiais..." : "Importar documentos"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    O agente extrai negócio, público, produtos, diferenciais, missão, valores e contexto comercial.
                  </div>
                </button>

                {documentNames.length > 0 && (
                  <div className="space-y-2">
                    {documentNames.map((name) => (
                      <div key={name} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="truncate">{name}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <Button variant="ghost" onClick={() => setStep(1)} className="gap-1.5">
                    <ChevronLeft className="h-4 w-4" /> Voltar
                  </Button>
                  <Button variant="outline" className="flex-1" disabled={documentAnalyzing} onClick={continueWithoutDocuments}>
                    Não tenho documentos agora
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ═══════════════════════════════════════════════════════
              STEP 3 — REVISÃO COM O VENDI
          ═══════════════════════════════════════════════════════ */}
          {step === 3 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary/10 p-2.5">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Revise o que o Vendi entendeu</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Nada vira informação oficial sem sua confirmação.
                    </p>
                  </div>
                </div>

                {typeof businessAnalysis?.confianca === "number" && (
                  <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    Confiança da leitura: <strong className="text-foreground">{Math.round(businessAnalysis.confianca * 100)}%</strong>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Empresa</Label>
                  <Input
                    value={businessAnalysis?.nomeFantasia ?? s1NomeEmpresa}
                    onChange={(event) => setBusinessAnalysis((current) => ({ ...(current ?? {}), nomeFantasia: event.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Segmento</Label>
                  <Input
                    value={businessAnalysis?.vertical ?? s1Segmento}
                    onChange={(event) => setBusinessAnalysis((current) => ({ ...(current ?? {}), vertical: event.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Público principal</Label>
                  <textarea
                    rows={3}
                    value={businessAnalysis?.publicoAlvo ?? ""}
                    onChange={(event) => setBusinessAnalysis((current) => ({ ...(current ?? {}), publicoAlvo: event.target.value }))}
                    placeholder="Quem compra, influencia ou especifica sua oferta?"
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Diferenciais</Label>
                  <textarea
                    rows={3}
                    value={businessAnalysis?.diferenciais ?? ""}
                    onChange={(event) => setBusinessAnalysis((current) => ({ ...(current ?? {}), diferenciais: event.target.value }))}
                    placeholder="Por que clientes escolhem sua empresa?"
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background focus:ring-1 focus:ring-ring"
                  />
                </div>

                {(businessAnalysis?.produtos?.length ?? 0) > 0 && (
                  <div className="rounded-xl border p-4">
                    <p className="text-sm font-semibold">Produtos e serviços identificados</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {businessAnalysis!.produtos!.slice(0, 12).map((product, index) => (
                        <span key={`${product.nome}-${index}`} className="rounded-full bg-muted px-3 py-1 text-xs">
                          {product.nome}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <p className="text-sm font-medium">Ao confirmar, o Vendor.ai prepara automaticamente</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Perfil da empresa, base inicial de conhecimento, produtos/serviços encontrados, contexto comercial e configuração inicial dos agentes.
                  </p>
                </div>

                <div className="flex gap-3 pt-1">
                  <Button variant="ghost" onClick={() => setStep(2)} className="gap-1.5">
                    <ChevronLeft className="h-4 w-4" /> Voltar
                  </Button>
                  <Button className="flex-1 gap-2" disabled={submitting} onClick={finalizeAssistedOnboarding}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Aprovar e preparar minha empresa
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
