import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";
import { useToast } from "@/hooks/use-toast";
import { TenantBrand } from "@/components/TenantBrand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function getToken() {
  return localStorage.getItem("vendorai_token");
}
function getBase() {
  return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
}

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
  if (!res.ok)
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data;
}

type GoogleAdsAccount = { customerId: string; descriptiveName?: string | null };

type IntegStatus = {
  step: number;
  concluido: boolean;
  whatsapp: { connected: boolean; phone: string | null };
  googleCalendar: { connected: boolean; agendaId: string | null };
  instagram: { connected: boolean; username: string | null };
  googleAds: {
    connected: boolean;
    pendingAccountSelection: boolean;
    customerId: string | null;
    descriptiveName: string | null;
  };
  asaas: { connected: boolean };
  zapsign: { connected: boolean };
  site: { published: boolean };
  domain: {
    configured: boolean;
    active: boolean;
    name: string | null;
    status: string | null;
  };
  searchConsole: { connected: boolean; verified: boolean };
  tracking: {
    googleAds: boolean;
    metaPixel: boolean;
    linkedinInsightTag: boolean;
    tiktokPixel: boolean;
  };
  social: { linkedin: boolean; tiktok: boolean };
};

export default function OnboardingIntegracoes() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<IntegStatus | null>(null);

  const [asaasKey, setAsaasKey] = useState("");
  const [zapsignKey, setZapsignKey] = useState("");
  const [googleAdsAccounts, setGoogleAdsAccounts] = useState<
    GoogleAdsAccount[]
  >([]);
  const [selectedGoogleAdsAccount, setSelectedGoogleAdsAccount] = useState("");
  const [whatsappQrCode, setWhatsappQrCode] = useState<string | null>(null);
  const [whatsappQrConnecting, setWhatsappQrConnecting] = useState(false);

  useEffect(() => {
    if (!user?.tenantId) return;

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("googleConnected")) {
      toast({ title: t("onboarding.integrations.googleCalendarConnected") });
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (urlParams.get("googleError")) {
      toast({
        title: t("onboarding.integrations.googleCalendarConnectError"),
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
    const googleAdsConnected = urlParams.get("googleAdsConnected");
    const googleAdsError = urlParams.get("googleAdsError");
    if (googleAdsConnected) {
      toast({
        title:
          googleAdsConnected === "pending"
            ? t("onboarding.integrations.googleAdsConnectedPending")
            : t("onboarding.integrations.googleAdsConnected"),
      });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (googleAdsError) {
      toast({
        title: t("onboarding.integrations.googleAdsConnectError"),
        description: googleAdsError,
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (urlParams.get("whatsappConnected") === "1") {
      toast({ title: t("onboarding.integrations.whatsappConnected") });
      window.history.replaceState({}, "", window.location.pathname);
    }
    const whatsappError = urlParams.get("whatsappError");
    if (whatsappError) {
      const messages: Record<string, string> = {
        access_denied: t("onboarding.integrations.whatsappError.permissionDenied"),
        invalid_state: t("onboarding.integrations.whatsappError.sessionExpired"),
        no_waba: t("onboarding.integrations.whatsappError.noWaba"),
        no_phone: t("onboarding.integrations.whatsappError.noPhone"),
        token_exchange: t("onboarding.integrations.whatsappError.tokenExchange"),
        token_extension: t("onboarding.integrations.whatsappError.tokenExtension"),
        waba_lookup: t("onboarding.integrations.whatsappError.wabaLookup"),
        phone_lookup: t("onboarding.integrations.whatsappError.phoneLookup"),
        exchange_failed: t("onboarding.integrations.whatsappError.exchangeFailed"),
      };
      toast({
        title: messages[whatsappError] ?? t("onboarding.integrations.whatsappConnectError"),
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }

    (async () => {
      try {
        const data = (await apiFetch(
          "/api/onboarding/integracoes",
        )) as IntegStatus;
        if (data.concluido) {
          setLocation("/guia-implantacao");
          return;
        }
        setStatus(data);
        if (data.googleAds?.pendingAccountSelection)
          void loadGoogleAdsAccounts();
      } catch {
        setStatus({
          step: 0,
          concluido: false,
          whatsapp: { connected: false, phone: null },
          googleCalendar: { connected: false, agendaId: null },
          instagram: { connected: false, username: null },
          googleAds: {
            connected: false,
            pendingAccountSelection: false,
            customerId: null,
            descriptiveName: null,
          },
          asaas: { connected: false },
          zapsign: { connected: false },
          site: { published: false },
          domain: {
            configured: false,
            active: false,
            name: null,
            status: null,
          },
          searchConsole: { connected: false, verified: false },
          tracking: {
            googleAds: false,
            metaPixel: false,
            linkedinInsightTag: false,
            tiktokPixel: false,
          },
          social: { linkedin: false, tiktok: false },
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.tenantId, t]);

  useEffect(() => {
    if (!user?.tenantId || !whatsappQrCode) return;
    let active = true;

    const checkEvolution = async () => {
      try {
        const evo = (await apiFetch(
          `/api/tenants/${user.tenantId}/evolution-whatsapp/status`,
        )) as { connected: boolean; phone: string | null };
        if (active && evo.connected) {
          setStatus((current) =>
            current
              ? { ...current, whatsapp: { connected: true, phone: evo.phone } }
              : current,
          );
          setWhatsappQrCode(null);
          toast({ title: t("onboarding.integrations.whatsappQrConnected") });
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
  }, [user?.tenantId, whatsappQrCode, t]);

  async function complete() {
    setSubmitting(true);
    try {
      await apiFetch("/api/onboarding/integracoes/complete", {
        method: "POST",
      });
      setLocation("/guia-implantacao");
    } catch {
      toast({ title: t("onboarding.integrations.finishError"), variant: "destructive" });
      setSubmitting(false);
    }
  }

  async function connectWhatsApp() {
    try {
      const data = (await apiFetch("/api/auth/whatsapp")) as { url?: string };
      if (!data.url) {
        throw new Error(t("onboarding.integrations.metaUrlMissing"));
      }
      window.location.assign(data.url);
    } catch (error) {
      toast({
        title: t("onboarding.integrations.whatsappConnectFailed"),
        description:
          error instanceof Error && error.message === t("onboarding.integrations.metaUrlMissing")
            ? error.message
            : t("onboarding.integrations.metaConfigCheck"),
        variant: "destructive",
      });
    }
  }

  async function connectWhatsAppQr() {
    if (!user?.tenantId) return;
    setWhatsappQrConnecting(true);
    try {
      const data = (await apiFetch(
        `/api/tenants/${user.tenantId}/evolution-whatsapp/connect`,
        { method: "POST" },
      )) as {
        qrCodeBase64: string | null;
        alreadyConnected: boolean;
      };

      if (data.alreadyConnected) {
        const evo = (await apiFetch(
          `/api/tenants/${user.tenantId}/evolution-whatsapp/status`,
        )) as { connected: boolean; phone: string | null };
        setStatus((current) =>
          current
            ? {
                ...current,
                whatsapp: { connected: evo.connected, phone: evo.phone },
              }
            : current,
        );
        setWhatsappQrCode(null);
        if (evo.connected)
          toast({ title: t("onboarding.integrations.whatsappAlreadyQr") });
        return;
      }

      if (!data.qrCodeBase64)
        throw new Error(t("onboarding.integrations.qrMissing"));
      setWhatsappQrCode(data.qrCodeBase64);
    } catch (error) {
      toast({
        title: t("onboarding.integrations.qrGenerateFailed"),
        description:
          error instanceof Error && error.message === t("onboarding.integrations.qrMissing")
            ? error.message
            : t("onboarding.integrations.evolutionConfigCheck"),
        variant: "destructive",
      });
    } finally {
      setWhatsappQrConnecting(false);
    }
  }

  async function connectGoogleCalendar() {
    try {
      const data = (await apiFetch(
        "/api/onboarding/integracoes/google-url",
      )) as { url: string };
      window.location.href = data.url;
    } catch {
      toast({
        title: t("onboarding.integrations.googleCalendarStartError"),
        variant: "destructive",
      });
    }
  }

  async function connectInstagram() {
    try {
      const data = (await apiFetch("/api/auth/instagram")) as { url: string };
      window.location.href = data.url;
    } catch {
      toast({
        title: t("onboarding.integrations.instagramStartError"),
        variant: "destructive",
      });
    }
  }

  async function connectGoogleAds() {
    try {
      const data = (await apiFetch(
        "/api/auth/google-ads?returnTo=/onboarding/integracoes",
      )) as { url: string };
      window.location.href = data.url;
    } catch {
      toast({
        title: t("onboarding.integrations.googleAdsStartError"),
        variant: "destructive",
      });
    }
  }

  async function loadGoogleAdsAccounts() {
    if (!user?.tenantId) return;
    try {
      const data = (await apiFetch(
        `/api/tenants/${user.tenantId}/google-ads-connection/accounts`,
      )) as { accounts?: GoogleAdsAccount[] };
      const accounts = data.accounts ?? [];
      setGoogleAdsAccounts(accounts);
      if (accounts.length === 1 && accounts[0])
        setSelectedGoogleAdsAccount(accounts[0].customerId);
    } catch {
      setGoogleAdsAccounts([]);
    }
  }

  async function selectGoogleAdsAccount() {
    if (!user?.tenantId || !selectedGoogleAdsAccount) return;
    setSubmitting(true);
    try {
      const data = (await apiFetch(
        `/api/tenants/${user.tenantId}/google-ads-connection/select-account`,
        {
          method: "POST",
          body: JSON.stringify({ customerId: selectedGoogleAdsAccount }),
        },
      )) as { customerId?: string; descriptiveName?: string };
      setStatus((current) =>
        current
          ? {
              ...current,
              googleAds: {
                connected: true,
                pendingAccountSelection: false,
                customerId: data.customerId ?? selectedGoogleAdsAccount,
                descriptiveName: data.descriptiveName ?? null,
              },
            }
          : current,
      );
      toast({ title: t("onboarding.integrations.googleAdsAccountSelected") });
    } catch {
      toast({
        title: t("onboarding.integrations.googleAdsAccountSelectError"),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function validateAsaas() {
    if (!asaasKey.trim()) return;
    setSubmitting(true);
    try {
      const data = (await apiFetch(
        "/api/onboarding/integracoes/validate-asaas",
        {
          method: "POST",
          body: JSON.stringify({ apiKey: asaasKey.trim() }),
        },
      )) as { valid: boolean; error?: string; name?: string };
      if (data.valid) {
        toast({
          title: t("onboarding.integrations.asaasConnected", {
            name: data.name ? ` — ${data.name}` : "",
          }),
        });
        setStatus((s) => (s ? { ...s, asaas: { connected: true } } : s));
      } else {
        toast({
          title: t("onboarding.integrations.invalidKey"),
          description: data.error,
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: t("onboarding.integrations.asaasValidateError"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function validateZapSign() {
    if (!zapsignKey.trim()) return;
    setSubmitting(true);
    try {
      const data = (await apiFetch(
        "/api/onboarding/integracoes/validate-zapsign",
        {
          method: "POST",
          body: JSON.stringify({ apiKey: zapsignKey.trim() }),
        },
      )) as { valid: boolean; error?: string; name?: string };
      if (data.valid) {
        toast({
          title: t("onboarding.integrations.zapSignConnected", {
            name: data.name ? ` — ${data.name}` : "",
          }),
        });
        setStatus((s) => (s ? { ...s, zapsign: { connected: true } } : s));
      } else {
        toast({
          title: t("onboarding.integrations.invalidKey"),
          description: data.error,
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: t("onboarding.integrations.zapSignValidateError"),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  const qrSrc = whatsappQrCode
    ? whatsappQrCode.startsWith("data:")
      ? whatsappQrCode
      : `data:image/png;base64,${whatsappQrCode}`
    : null;
  const done = status
    ? [
        status.whatsapp.connected,
        status.googleCalendar.connected,
        status.instagram.connected,
        status.googleAds.connected && !status.googleAds.pendingAccountSelection,
        status.site.published,
        status.domain.active,
        status.searchConsole.verified,
        status.tracking.googleAds,
        status.tracking.metaPixel,
        status.tracking.linkedinInsightTag,
        status.tracking.tiktokPixel,
        status.social.linkedin,
        status.social.tiktok,
        status.asaas.connected,
        status.zapsign.connected,
      ].filter(Boolean).length
    : 0;
  const go = (href: string) => setLocation(href);
  const actions = status
    ? [
        {
          key: "calendar",
          done: status.googleCalendar.connected,
          title: t("onboarding.integrations.action.calendar.title"),
          text: t("onboarding.integrations.action.calendar.text"),
          label: t("onboarding.integrations.action.calendar.label"),
          action: connectGoogleCalendar,
          link: "https://calendar.google.com/",
        },
        {
          key: "instagram",
          done: status.instagram.connected,
          title: t("onboarding.integrations.action.instagram.title"),
          text: t("onboarding.integrations.action.instagram.text"),
          label: t("onboarding.integrations.action.instagram.label"),
          action: connectInstagram,
          link: "https://business.facebook.com/settings/",
        },
        {
          key: "googleAds",
          done:
            status.googleAds.connected &&
            !status.googleAds.pendingAccountSelection,
          title: t("onboarding.integrations.action.googleAds.title"),
          text: t("onboarding.integrations.action.googleAds.text"),
          label: t("onboarding.integrations.action.googleAds.label"),
          action: connectGoogleAds,
          link: "https://ads.google.com/",
        },
        {
          key: "site",
          done: status.site.published,
          title: t("onboarding.integrations.action.site.title"),
          text: t("onboarding.integrations.action.site.text"),
          label: t("onboarding.integrations.action.site.label"),
          action: () => go("/configuracoes?tab=site&installation=1"),
          link: "https://developers.cloudflare.com/pages/get-started/direct-upload/",
        },
        {
          key: "domain",
          done: status.domain.active,
          title: t("onboarding.integrations.action.domain.title"),
          text: status.domain.configured
            ? t("onboarding.integrations.action.domain.configuredText", {
                domain:
                  status.domain.name ??
                  t("onboarding.integrations.action.domain.fallbackName"),
              })
            : t("onboarding.integrations.action.domain.notConfiguredText"),
          label: status.domain.configured
            ? t("onboarding.integrations.action.domain.configuredLabel")
            : t("onboarding.integrations.action.domain.notConfiguredLabel"),
          action: () => go("/configuracoes?tab=site&installation=1"),
          link: "https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/",
        },
        {
          key: "search",
          done: status.searchConsole.verified,
          title: t("onboarding.integrations.action.search.title"),
          text: status.searchConsole.connected
            ? t("onboarding.integrations.action.search.connectedText")
            : t("onboarding.integrations.action.search.notConnectedText"),
          label: t("onboarding.integrations.action.search.label"),
          action: () => go("/configuracoes?tab=site&installation=1"),
          link: "https://search.google.com/search-console",
        },
        {
          key: "googleTag",
          done: status.tracking.googleAds,
          title: t("onboarding.integrations.action.googleTag.title"),
          text: t("onboarding.integrations.action.googleTag.text"),
          label: t("onboarding.integrations.action.googleTag.label"),
          action: () => go("/configuracoes?tab=site&installation=1"),
          link: "https://ads.google.com/aw/conversions",
        },
        {
          key: "metaPixel",
          done: status.tracking.metaPixel,
          title: t("onboarding.integrations.action.metaPixel.title"),
          text: t("onboarding.integrations.action.metaPixel.text"),
          label: t("onboarding.integrations.action.metaPixel.label"),
          action: () => go("/configuracoes?tab=site&installation=1"),
          link: "https://business.facebook.com/events_manager2/list/pixel/",
        },
        {
          key: "linkedinTag",
          done: status.tracking.linkedinInsightTag,
          title: t("onboarding.integrations.action.linkedinTag.title"),
          text: t("onboarding.integrations.action.linkedinTag.text"),
          label: t("onboarding.integrations.action.linkedinTag.label"),
          action: () => go("/configuracoes?tab=site&installation=1"),
          link: "https://www.linkedin.com/campaignmanager/",
        },
        {
          key: "tiktokPixel",
          done: status.tracking.tiktokPixel,
          title: t("onboarding.integrations.action.tiktokPixel.title"),
          text: t("onboarding.integrations.action.tiktokPixel.text"),
          label: t("onboarding.integrations.action.tiktokPixel.label"),
          action: () => go("/configuracoes?tab=site&installation=1"),
          link: "https://ads.tiktok.com/i18n/events_manager/",
        },
        {
          key: "linkedin",
          done: status.social.linkedin,
          title: t("onboarding.integrations.action.linkedin.title"),
          text: t("onboarding.integrations.action.linkedin.text"),
          label: t("onboarding.integrations.action.linkedin.label"),
          action: () => go("/configuracoes?tab=integracoes&installation=1"),
          link: "https://www.linkedin.com/help/linkedin/",
        },
        {
          key: "tiktok",
          done: status.social.tiktok,
          title: t("onboarding.integrations.action.tiktok.title"),
          text: t("onboarding.integrations.action.tiktok.text"),
          label: t("onboarding.integrations.action.tiktok.label"),
          action: () => go("/configuracoes?tab=integracoes&installation=1"),
          link: "https://www.tiktok.com/business/",
        },
      ].filter((x) => !x.done)
    : [];
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <TenantBrand />
          <Button variant="ghost" size="sm" onClick={complete}>
            {t("onboarding.integrations.continueLater")}
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">
              {t("onboarding.integrations.eyebrow")}
            </p>
            <h1 className="text-3xl font-bold">
              {t("onboarding.integrations.title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {t("onboarding.integrations.subtitle")}
            </p>
          </div>
          <div className="rounded-xl border bg-background px-5 py-3">
            <strong className="text-2xl">{done}/15</strong>
            <p className="text-xs text-muted-foreground">{t("onboarding.integrations.progress")}</p>
          </div>
        </div>
        {!status?.whatsapp.connected && (
          <section className="rounded-2xl border border-green-200 bg-background p-6">
            <div className="flex gap-4">
              <MessageCircle className="h-7 w-7 shrink-0 text-green-600" />
              <div className="flex-1">
                <h2 className="font-semibold">{t("onboarding.integrations.whatsapp.title")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("onboarding.integrations.whatsapp.text")}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={connectWhatsApp}>{t("onboarding.integrations.whatsapp.metaOfficial")}</Button>
                  <Button
                    variant="outline"
                    onClick={connectWhatsAppQr}
                    disabled={whatsappQrConnecting}
                  >
                    {whatsappQrConnecting && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {t("onboarding.integrations.whatsapp.connectQr")}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => go("/configuracoes?tab=integracoes&installation=1")}
                  >
                    {t("onboarding.integrations.whatsapp.manageNumbers")}
                  </Button>
                </div>
                {qrSrc && (
                  <div className="mt-4 rounded-xl border p-4 text-center">
                    <p className="mb-2 text-sm">
                      {t("onboarding.integrations.whatsapp.qrInstructions")}
                    </p>
                    <img
                      src={qrSrc}
                      alt={t("onboarding.integrations.whatsapp.qrAlt")}
                      className="mx-auto h-56 w-56 bg-white p-2"
                    />
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
        {status?.googleAds.pendingAccountSelection && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="font-semibold">{t("onboarding.integrations.googleAdsAccount.title")}</h2>
            <div className="mt-3 flex gap-2">
              <select
                className="h-10 flex-1 rounded-md border bg-background px-3"
                value={selectedGoogleAdsAccount}
                onChange={(e) => setSelectedGoogleAdsAccount(e.target.value)}
              >
                <option value="">{t("onboarding.integrations.googleAdsAccount.select")}</option>
                {googleAdsAccounts.map((a) => (
                  <option key={a.customerId} value={a.customerId}>
                    {a.descriptiveName
                      ? `${a.descriptiveName} — ${a.customerId}`
                      : a.customerId}
                  </option>
                ))}
              </select>
              <Button
                onClick={selectGoogleAdsAccount}
                disabled={!selectedGoogleAdsAccount || submitting}
              >
                {t("common.confirm")}
              </Button>
            </div>
          </section>
        )}
        <section>
          <h2 className="text-lg font-semibold">{t("onboarding.integrations.nextActions")}</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            {t("onboarding.integrations.nextActionsSubtitle")}
          </p>
          {actions.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {actions.map((a, i) => (
                <article
                  key={a.key}
                  className="rounded-2xl border bg-background p-5"
                >
                  <div className="flex gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm text-primary">
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="font-semibold">{a.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {a.text}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={a.action}>
                      {a.label}
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={a.link} target="_blank" rel="noreferrer">
                        {t("onboarding.integrations.openOfficial")}
                        <ExternalLink className="ml-1 h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
              <h2 className="mt-3 text-xl font-semibold">
                {t("onboarding.integrations.complete")}
              </h2>
            </div>
          )}
        </section>
        <section className="grid gap-4 md:grid-cols-2">
          <CredentialCard
            title={t("onboarding.integrations.asaasTitle")}
            connected={status?.asaas.connected}
            value={asaasKey}
            setValue={setAsaasKey}
            placeholder="$aact_..."
            validate={validateAsaas}
            link="https://app.asaas.com"
            submitting={submitting}
          />
          <CredentialCard
            title={t("onboarding.integrations.zapSignTitle")}
            connected={status?.zapsign.connected}
            value={zapsignKey}
            setValue={setZapsignKey}
            placeholder={t("onboarding.integrations.apiToken")}
            validate={validateZapSign}
            link="https://app.zapsign.com.br"
            submitting={submitting}
          />
        </section>
        <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-2xl border bg-background/95 p-4 shadow-lg">
          <p className="text-sm text-muted-foreground">
            {t("onboarding.integrations.later")}
          </p>
          <Button onClick={complete} disabled={submitting}>
            {t("onboarding.integrations.enterVendorAI")}
          </Button>
        </div>
      </main>
    </div>
  );
}

function CredentialCard({
  title,
  connected,
  value,
  setValue,
  placeholder,
  validate,
  link,
  submitting,
}: {
  title: string;
  connected?: boolean;
  value: string;
  setValue: (v: string) => void;
  placeholder: string;
  validate: () => void;
  link: string;
  submitting: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="rounded-2xl border bg-background p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("onboarding.integrations.credentialHelp")}
      </p>
      {connected ? (
        <p className="mt-3 text-sm text-green-600">{t("onboarding.integrations.working")}</p>
      ) : (
        <div className="mt-3 flex gap-2">
          <Input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
          />
          <Button onClick={validate} disabled={!value.trim() || submitting}>
            {t("onboarding.integrations.validate")}
          </Button>
        </div>
      )}
      <a
        className="mt-3 inline-flex text-xs text-primary"
        href={link}
        target="_blank"
        rel="noreferrer"
      >
        {t("onboarding.integrations.openService")}
        <ExternalLink className="ml-1 h-3 w-3" />
      </a>
    </div>
  );
}