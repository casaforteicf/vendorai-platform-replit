import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  ChevronRight,
  SkipForward,
  Loader2,
  MessageCircle,
  QrCode,
  Calendar,
  Instagram,
  Megaphone,
  CreditCard,
  FileSignature,
  ExternalLink,
} from "lucide-react";
import logoLight from "/logo-full-light.svg";

function getToken() { return localStorage.getItem("vendorai_token"); }
function getBase()  { return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, ""); }

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${getBase()}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(opts?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data;
}

type IntegStatus = {
  step: number;
  concluido: boolean;
  whatsapp: { connected: boolean; phone: string | null };
  googleCalendar: { connected: boolean; agendaId: string | null };
  instagram: { connected: boolean; username: string | null };
  googleAds: { connected: boolean; pendingAccountSelection: boolean; customerId: string | null; descriptiveName: string | null };
  asaas: { connected: boolean };
  zapsign: { connected: boolean };
};

type StepKey = "whatsapp" | "googleCalendar" | "instagram" | "googleAds" | "asaas" | "zapsign";

type GoogleAdsAccount = { customerId: string; descriptiveName?: string | null };

const STEPS: { key: StepKey; label: string; shortLabel: string }[] = [
  { key: "whatsapp",      label: "WhatsApp",        shortLabel: "WhatsApp" },
  { key: "googleCalendar",label: "Google Calendar", shortLabel: "Calendar" },
  { key: "instagram",     label: "Instagram",       shortLabel: "Instagram" },
  { key: "googleAds",     label: "Google Ads",      shortLabel: "Ads" },
  { key: "asaas",         label: "Asaas",           shortLabel: "Asaas" },
  { key: "zapsign",       label: "ZapSign",         shortLabel: "ZapSign" },
];

export default function OnboardingIntegracoes() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<number>(0);
  const [status, setStatus] = useState<IntegStatus | null>(null);

  const [asaasKey, setAsaasKey] = useState("");
  const [zapsignKey, setZapsignKey] = useState("");
  const [googleAdsAccounts, setGoogleAdsAccounts] = useState<GoogleAdsAccount[]>([]);
  const [selectedGoogleAdsAccount, setSelectedGoogleAdsAccount] = useState("");
  const [whatsappQrCode, setWhatsappQrCode] = useState<string | null>(null);
  const [whatsappQrConnecting, setWhatsappQrConnecting] = useState(false);

  useEffect(() => {
    if (!user?.tenantId) return;

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("googleConnected")) {
      toast({ title: "Google Calendar conectado!" });
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (urlParams.get("googleError")) {
      toast({ title: "Erro ao conectar Google Calendar.", variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
    const googleAdsConnected = urlParams.get("googleAdsConnected");
    const googleAdsError = urlParams.get("googleAdsError");
    if (googleAdsConnected) {
      toast({ title: googleAdsConnected === "pending" ? "Google Ads conectado — escolha a conta" : "Google Ads conectado!" });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (googleAdsError) {
      toast({ title: "Erro ao conectar Google Ads.", description: googleAdsError, variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (urlParams.get("whatsappConnected") === "1") {
      toast({ title: "WhatsApp conectado com sucesso!" });
      window.history.replaceState({}, "", window.location.pathname);
    }
    const whatsappError = urlParams.get("whatsappError");
    if (whatsappError) {
      const messages: Record<string, string> = {
        access_denied: "Permissão negada pela Meta.",
        invalid_state: "A sessão de conexão expirou. Tente novamente.",
        no_waba: "Nenhuma conta WhatsApp Business foi encontrada.",
        no_phone: "Nenhum número foi encontrado na conta WhatsApp Business.",
        token_exchange: "A Meta não autorizou a troca do código de acesso.",
        token_extension: "Não foi possível validar o token do WhatsApp.",
        waba_lookup: "Não foi possível consultar sua conta WhatsApp Business.",
        phone_lookup: "Não foi possível consultar os números da conta WhatsApp.",
        exchange_failed: "A conexão falhou na etapa final. Tente novamente.",
      };
      toast({ title: messages[whatsappError] ?? "Erro ao conectar WhatsApp.", variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }

    (async () => {
      try {
        const data = await apiFetch("/api/onboarding/integracoes") as IntegStatus;
        if (data.concluido) { setLocation("/dashboard"); return; }
        setStatus(data);
        setStep(data.step ?? 0);
        if (data.googleAds?.pendingAccountSelection) void loadGoogleAdsAccounts();
      } catch {
        setStatus({ step: 0, concluido: false, whatsapp: { connected: false, phone: null }, googleCalendar: { connected: false, agendaId: null }, instagram: { connected: false, username: null }, googleAds: { connected: false, pendingAccountSelection: false, customerId: null, descriptiveName: null }, asaas: { connected: false }, zapsign: { connected: false } });
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.tenantId]);

  useEffect(() => {
    if (!user?.tenantId || step !== 0 || !whatsappQrCode) return;
    let active = true;

    const checkEvolution = async () => {
      try {
        const evo = await apiFetch(`/api/tenants/${user.tenantId}/evolution-whatsapp/status`) as { connected: boolean; phone: string | null };
        if (active && evo.connected) {
          setStatus((current) => current ? { ...current, whatsapp: { connected: true, phone: evo.phone } } : current);
          setWhatsappQrCode(null);
          toast({ title: "WhatsApp conectado via QR Code!" });
        }
      } catch {
        // mantém o QR aberto; uma falha transitória não interrompe o onboarding
      }
    };

    void checkEvolution();
    const timer = window.setInterval(() => void checkEvolution(), 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [user?.tenantId, step, whatsappQrCode]);

  async function saveStep(newStep: number) {
    setStep(newStep);
    try {
      await apiFetch("/api/onboarding/integracoes/step", {
        method: "PATCH",
        body: JSON.stringify({ step: newStep }),
      });
    } catch { /* ignore */ }
  }

  async function advance() {
    const next = step + 1;
    if (next >= STEPS.length) {
      await complete();
    } else {
      await saveStep(next);
    }
  }

  async function skip() {
    await advance();
  }

  async function complete() {
    setSubmitting(true);
    try {
      await apiFetch("/api/onboarding/integracoes/complete", { method: "POST" });
      setLocation("/dashboard");
    } catch {
      toast({ title: "Erro ao finalizar onboarding.", variant: "destructive" });
      setSubmitting(false);
    }
  }

  async function connectWhatsApp() {
    try {
      const data = (await apiFetch("/api/auth/whatsapp")) as { url?: string };
      if (!data.url) {
        throw new Error("O servidor não retornou a URL de conexão da Meta.");
      }
      window.location.assign(data.url);
    } catch (error) {
      toast({
        title: "Não foi possível conectar o WhatsApp",
        description:
          error instanceof Error
            ? error.message
            : "Verifique a configuração da Meta e tente novamente.",
        variant: "destructive",
      });
    }
  }

  async function connectWhatsAppQr() {
    if (!user?.tenantId) return;
    setWhatsappQrConnecting(true);
    try {
      const data = await apiFetch(`/api/tenants/${user.tenantId}/evolution-whatsapp/connect`, { method: "POST" }) as {
        qrCodeBase64: string | null;
        alreadyConnected: boolean;
      };

      if (data.alreadyConnected) {
        const evo = await apiFetch(`/api/tenants/${user.tenantId}/evolution-whatsapp/status`) as { connected: boolean; phone: string | null };
        setStatus((current) => current ? { ...current, whatsapp: { connected: evo.connected, phone: evo.phone } } : current);
        setWhatsappQrCode(null);
        if (evo.connected) toast({ title: "WhatsApp já está conectado via QR Code." });
        return;
      }

      if (!data.qrCodeBase64) throw new Error("A Evolution API não retornou um QR Code.");
      setWhatsappQrCode(data.qrCodeBase64);
    } catch (error) {
      toast({
        title: "Não foi possível gerar o QR Code",
        description: error instanceof Error ? error.message : "Verifique a integração Evolution API.",
        variant: "destructive",
      });
    } finally {
      setWhatsappQrConnecting(false);
    }
  }

  async function connectGoogleCalendar() {
    try {
      const data = await apiFetch("/api/onboarding/integracoes/google-url") as { url: string };
      window.location.href = data.url;
    } catch {
      toast({ title: "Erro ao iniciar conexão Google Calendar.", variant: "destructive" });
    }
  }

  async function connectInstagram() {
    try {
      const data = await apiFetch("/api/auth/instagram") as { url: string };
      window.location.href = data.url;
    } catch {
      toast({ title: "Erro ao iniciar conexão Instagram.", variant: "destructive" });
    }
  }

  async function connectGoogleAds() {
    try {
      const data = await apiFetch("/api/auth/google-ads?returnTo=/onboarding/integracoes") as { url: string };
      window.location.href = data.url;
    } catch {
      toast({ title: "Erro ao iniciar conexão Google Ads.", variant: "destructive" });
    }
  }

  async function loadGoogleAdsAccounts() {
    if (!user?.tenantId) return;
    try {
      const data = await apiFetch(`/api/tenants/${user.tenantId}/google-ads-connection/accounts`) as { accounts?: GoogleAdsAccount[] };
      const accounts = data.accounts ?? [];
      setGoogleAdsAccounts(accounts);
      if (accounts.length === 1 && accounts[0]) setSelectedGoogleAdsAccount(accounts[0].customerId);
    } catch {
      setGoogleAdsAccounts([]);
    }
  }

  async function selectGoogleAdsAccount() {
    if (!user?.tenantId || !selectedGoogleAdsAccount) return;
    setSubmitting(true);
    try {
      const data = await apiFetch(`/api/tenants/${user.tenantId}/google-ads-connection/select-account`, {
        method: "POST",
        body: JSON.stringify({ customerId: selectedGoogleAdsAccount }),
      }) as { customerId?: string; descriptiveName?: string };
      setStatus((current) => current ? {
        ...current,
        googleAds: {
          connected: true,
          pendingAccountSelection: false,
          customerId: data.customerId ?? selectedGoogleAdsAccount,
          descriptiveName: data.descriptiveName ?? null,
        },
      } : current);
      toast({ title: "Conta Google Ads selecionada!" });
    } catch {
      toast({ title: "Erro ao selecionar conta Google Ads.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function validateAsaas() {
    if (!asaasKey.trim()) return;
    setSubmitting(true);
    try {
      const data = await apiFetch("/api/onboarding/integracoes/validate-asaas", {
        method: "POST",
        body: JSON.stringify({ apiKey: asaasKey.trim() }),
      }) as { valid: boolean; error?: string; name?: string };
      if (data.valid) {
        toast({ title: `Asaas conectado${data.name ? ` — ${data.name}` : ""}!` });
        setStatus(s => s ? { ...s, asaas: { connected: true } } : s);
        await advance();
      } else {
        toast({ title: data.error ?? "Chave inválida.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao validar chave Asaas.", variant: "destructive" });
    } finally { setSubmitting(false); }
  }

  async function validateZapSign() {
    if (!zapsignKey.trim()) return;
    setSubmitting(true);
    try {
      const data = await apiFetch("/api/onboarding/integracoes/validate-zapsign", {
        method: "POST",
        body: JSON.stringify({ apiKey: zapsignKey.trim() }),
      }) as { valid: boolean; error?: string; name?: string };
      if (data.valid) {
        toast({ title: `ZapSign conectado${data.name ? ` — ${data.name}` : ""}!` });
        setStatus(s => s ? { ...s, zapsign: { connected: true } } : s);
        await advance();
      } else {
        toast({ title: data.error ?? "Chave inválida.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao validar chave ZapSign.", variant: "destructive" });
    } finally { setSubmitting(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isDone = step >= STEPS.length;
  const whatsappQrSrc = whatsappQrCode
    ? (whatsappQrCode.startsWith("data:") ? whatsappQrCode : `data:image/png;base64,${whatsappQrCode}`)
    : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b px-6 py-4 flex items-center justify-between shrink-0">
        <img src={logoLight} alt="VendorAI" className="h-7 dark:invert" />
        {!isDone && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={complete}
          >
            Pular configuração de integrações
          </button>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center justify-start py-10 px-4">
        <div className="w-full max-w-lg">

          {/* Progress bar */}
          {!isDone && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                {STEPS.map((s, i) => (
                  <div key={s.key} className="flex-1 flex flex-col items-center gap-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all ${
                      i < step
                        ? "bg-primary border-primary text-primary-foreground"
                        : i === step
                        ? "border-primary text-primary bg-background"
                        : "border-muted-foreground/30 text-muted-foreground/50 bg-background"
                    }`}>
                      {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`absolute hidden`} />
                    )}
                  </div>
                ))}
              </div>
              <div className="relative h-1 bg-muted rounded-full mt-1">
                <div
                  className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                {STEPS.map((s) => (
                  <span key={s.key} className="text-[10px] text-muted-foreground text-center flex-1">{s.shortLabel}</span>
                ))}
              </div>
            </div>
          )}

          {/* STEP 0 — WhatsApp */}
          {step === 0 && (
            <div className="space-y-6">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-green-50">
                  <MessageCircle className="h-8 w-8 text-green-600" />
                </div>
                <h2 className="text-xl font-bold">Conecte seu WhatsApp</h2>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Escolha a conexão oficial via Meta ou conecte rapidamente escaneando um QR Code.
                </p>
              </div>

              {status?.whatsapp?.connected ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {status.whatsapp.phone ? `WhatsApp — ${status.whatsapp.phone}` : "WhatsApp conectado"}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Button onClick={connectWhatsApp} className="gap-2" disabled={whatsappQrConnecting}>
                      <MessageCircle className="h-4 w-4" />
                      Meta oficial
                    </Button>
                    <Button variant="outline" onClick={connectWhatsAppQr} className="gap-2" disabled={whatsappQrConnecting}>
                      {whatsappQrConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                      {whatsappQrCode ? "Gerar novo QR" : "Conectar por QR Code"}
                    </Button>
                  </div>

                  {whatsappQrSrc && (
                    <div className="rounded-xl border bg-card p-5 space-y-4 text-center">
                      <div>
                        <p className="font-medium text-sm">Escaneie com o WhatsApp</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho.
                        </p>
                      </div>
                      <img src={whatsappQrSrc} alt="QR Code para conectar WhatsApp" className="w-56 h-56 mx-auto rounded-lg border bg-white p-2" />
                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Aguardando leitura do QR Code…
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 gap-2" onClick={skip} disabled={submitting}>
                  <SkipForward className="h-4 w-4" /> Pular
                </Button>
                {status?.whatsapp?.connected && (
                  <Button className="flex-1 gap-2" onClick={advance} disabled={submitting}>
                    Continuar <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* STEP 1 — Google Calendar */}
          {step === 1 && (
            <StepCard
              icon={<Calendar className="h-8 w-8 text-blue-500" />}
              title="Sincronize sua agenda"
              subtitle="Agendamentos feitos na plataforma aparecem automaticamente no seu Google Calendar"
              connected={status?.googleCalendar?.connected}
              connectedLabel="Google Calendar conectado"
              onSkip={skip}
              onConnect={connectGoogleCalendar}
              connectLabel="Conectar Google Calendar"
              advancing={submitting}
              onAdvance={advance}
            />
          )}

          {/* STEP 2 — Instagram */}
          {step === 2 && (
            <StepCard
              icon={<Instagram className="h-8 w-8 text-purple-500" />}
              title="Conecte seu Instagram Business"
              subtitle="Receba DMs e gere conteúdo para o Instagram direto pela Vendor.ai"
              connected={status?.instagram?.connected}
              connectedLabel={status?.instagram?.username ? `Instagram — @${status.instagram.username}` : "Instagram conectado"}
              onSkip={skip}
              onConnect={connectInstagram}
              connectLabel="Conectar Instagram"
              advancing={submitting}
              onAdvance={advance}
            />
          )}

          {/* STEP 3 — Google Ads */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-blue-50">
                  <Megaphone className="h-8 w-8 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold">Conecte seu Google Ads</h2>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Vincule a conta que receberá as campanhas patrocinadas criadas no Vendor.ai
                </p>
              </div>

              {status?.googleAds?.connected && !status.googleAds.pendingAccountSelection && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {status.googleAds.descriptiveName || status.googleAds.customerId
                    ? `Google Ads — ${status.googleAds.descriptiveName || status.googleAds.customerId}`
                    : "Google Ads conectado"}
                </div>
              )}

              {status?.googleAds?.pendingAccountSelection && (
                <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm text-amber-800">Sua conta Google foi autorizada. Escolha qual conta do Google Ads será usada pelo Vendor.ai.</p>
                  {googleAdsAccounts.length === 0 ? (
                    <Button variant="outline" className="w-full" onClick={loadGoogleAdsAccounts}>Carregar contas disponíveis</Button>
                  ) : (
                    <>
                      <Select value={selectedGoogleAdsAccount} onValueChange={setSelectedGoogleAdsAccount}>
                        <SelectTrigger><SelectValue placeholder="Selecione uma conta" /></SelectTrigger>
                        <SelectContent>
                          {googleAdsAccounts.map((account) => (
                            <SelectItem key={account.customerId} value={account.customerId}>
                              {account.descriptiveName ? `${account.descriptiveName} — ${account.customerId}` : account.customerId}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button className="w-full" onClick={selectGoogleAdsAccount} disabled={!selectedGoogleAdsAccount || submitting}>
                        {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Usar esta conta
                      </Button>
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 gap-2" onClick={skip} disabled={submitting}>
                  <SkipForward className="h-4 w-4" /> Pular
                </Button>
                {status?.googleAds?.connected && !status.googleAds.pendingAccountSelection ? (
                  <Button className="flex-1 gap-2" onClick={advance} disabled={submitting}>
                    Continuar <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : status?.googleAds?.pendingAccountSelection ? null : (
                  <Button className="flex-1 gap-2" onClick={connectGoogleAds} disabled={submitting}>
                    Conectar Google Ads <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* STEP 4 — Asaas */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-blue-50">
                  <CreditCard className="h-8 w-8 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold">Ative a cobrança automática</h2>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Gere boletos, Pix e cobranças recorrentes automaticamente quando fechar uma venda
                </p>
              </div>

              {status?.asaas?.connected ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Asaas — conta verificada
                </div>
              ) : (
                <div className="space-y-3">
                  <Label>Chave de API do Asaas</Label>
                  <Input
                    placeholder="$aact_..."
                    value={asaasKey}
                    onChange={e => setAsaasKey(e.target.value)}
                    type="password"
                  />
                  <p className="text-xs text-muted-foreground">
                    Acesse <a href="https://app.asaas.com" target="_blank" rel="noreferrer" className="underline hover:text-foreground">app.asaas.com</a> → Minha conta → Integrações → Chave de API
                    <a href="https://app.asaas.com" target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 gap-2" onClick={skip} disabled={submitting}>
                  <SkipForward className="h-4 w-4" /> Pular
                </Button>
                {status?.asaas?.connected ? (
                  <Button className="flex-1 gap-2" onClick={advance} disabled={submitting}>
                    Continuar <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button className="flex-1 gap-2" onClick={validateAsaas} disabled={submitting || !asaasKey.trim()}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Verificar e salvar
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* STEP 5 — ZapSign */}
          {step === 5 && (
            <div className="space-y-6">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-violet-50">
                  <FileSignature className="h-8 w-8 text-violet-600" />
                </div>
                <h2 className="text-xl font-bold">Ative contratos digitais</h2>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Envie contratos para assinatura eletrônica automaticamente quando fechar uma venda
                </p>
              </div>

              {status?.zapsign?.connected ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ZapSign — conta verificada
                </div>
              ) : (
                <div className="space-y-3">
                  <Label>Token de API do ZapSign</Label>
                  <Input
                    placeholder="Seu token..."
                    value={zapsignKey}
                    onChange={e => setZapsignKey(e.target.value)}
                    type="password"
                  />
                  <p className="text-xs text-muted-foreground">
                    Acesse <a href="https://app.zapsign.com.br" target="_blank" rel="noreferrer" className="underline hover:text-foreground">app.zapsign.com.br</a> → Configurações → API Token
                    <a href="https://app.zapsign.com.br" target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 gap-2" onClick={skip} disabled={submitting}>
                  <SkipForward className="h-4 w-4" /> Pular
                </Button>
                {status?.zapsign?.connected ? (
                  <Button className="flex-1 gap-2" onClick={advance} disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Finalizar <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button className="flex-1 gap-2" onClick={validateZapSign} disabled={submitting || !zapsignKey.trim()}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Verificar e salvar
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* DONE */}
          {isDone && (
            <div className="flex flex-col items-center text-center gap-6 py-6">
              <style>{`
                @keyframes check-pop {
                  0%   { transform: scale(0); opacity: 0; }
                  60%  { transform: scale(1.15); opacity: 1; }
                  100% { transform: scale(1); opacity: 1; }
                }
                .check-pop { animation: check-pop 0.5s cubic-bezier(.175,.885,.32,1.275) both; }
              `}</style>
              <div className="check-pop flex items-center justify-center h-20 w-20 rounded-full bg-green-100">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
              </div>

              <div>
                <h2 className="text-2xl font-bold">🎉 Tudo pronto!</h2>
                <p className="text-muted-foreground mt-2 text-sm">Sua plataforma está configurada e pronta para usar.</p>
              </div>

              <div className="w-full space-y-2 text-sm text-left">
                {status && STEPS.map((s) => {
                  const conn = s.key === "whatsapp" ? status.whatsapp.connected
                    : s.key === "googleCalendar" ? status.googleCalendar.connected
                    : s.key === "instagram" ? status.instagram.connected
                    : s.key === "googleAds" ? status.googleAds.connected && !status.googleAds.pendingAccountSelection
                    : s.key === "asaas" ? status.asaas.connected
                    : status.zapsign.connected;
                  return (
                    <div key={s.key} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${conn ? "border-green-200 bg-green-50 text-green-700" : "border-muted bg-muted/40 text-muted-foreground"}`}>
                      {conn ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <SkipForward className="h-4 w-4 shrink-0" />}
                      {conn ? s.label : `${s.label} (pulado)`}
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground">
                As integrações puladas podem ser retomadas depois pelo fluxo de integrações do perfil
              </p>

              <Button size="lg" className="w-full gap-2" onClick={complete} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Ir para o Dashboard
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StepCard({
  icon,
  title,
  subtitle,
  connected,
  connectedLabel,
  onSkip,
  onConnect,
  connectLabel,
  advancing,
  onAdvance,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  connected?: boolean;
  connectedLabel: string;
  onSkip: () => void;
  onConnect: () => void;
  connectLabel: string;
  advancing: boolean;
  onAdvance: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center gap-3">
        <div className="flex items-center justify-center h-16 w-16 rounded-full bg-muted">
          {icon}
        </div>
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-muted-foreground text-sm max-w-sm">{subtitle}</p>
      </div>

      {connected && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {connectedLabel}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1 gap-2" onClick={onSkip} disabled={advancing}>
          <SkipForward className="h-4 w-4" /> Pular
        </Button>
        {connected ? (
          <Button className="flex-1 gap-2" onClick={onAdvance} disabled={advancing}>
            {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Continuar <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button className="flex-1 gap-2" onClick={onConnect} disabled={advancing}>
            {connectLabel} <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
