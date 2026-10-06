import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";
import { useToast } from "@/hooks/use-toast";
import { TenantBrand } from "@/components/TenantBrand";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ChevronRight, Loader2 } from "lucide-react";

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
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data;
}

type IntegStatus = {
  step: number;
  concluido: boolean;
  whatsapp: { connected: boolean; phone: string | null };
  googleCalendar: { connected: boolean };
  instagram: { connected: boolean; username: string | null };
  googleAds: { connected: boolean; pendingAccountSelection: boolean };
  asaas: { connected: boolean };
  zapsign: { connected: boolean };
  site: { published: boolean };
  domain: { active: boolean };
  searchConsole: { verified: boolean };
  tracking: {
    googleAds: boolean;
    metaPixel: boolean;
    linkedinInsightTag: boolean;
    tiktokPixel: boolean;
  };
  social: { linkedin: boolean; tiktok: boolean };
};

type ActionItem = {
  key: string;
  integration: string;
  done: boolean;
  title: string;
  text: string;
  label: string;
};

export default function OnboardingIntegracoes() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<IntegStatus | null>(null);

  useEffect(() => {
    if (!user?.tenantId) return;

    void (async () => {
      try {
        const data = await apiFetch("/api/onboarding/integracoes") as IntegStatus;
        if (data.concluido) {
          setLocation("/guia-implantacao");
          return;
        }
        setStatus(data);
      } catch {
        setStatus({
          step: 0,
          concluido: false,
          whatsapp: { connected: false, phone: null },
          googleCalendar: { connected: false },
          instagram: { connected: false, username: null },
          googleAds: { connected: false, pendingAccountSelection: false },
          asaas: { connected: false },
          zapsign: { connected: false },
          site: { published: false },
          domain: { active: false },
          searchConsole: { verified: false },
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
  }, [user?.tenantId, setLocation]);

  async function complete() {
    setSubmitting(true);
    try {
      await apiFetch("/api/onboarding/integracoes/complete", { method: "POST" });
      setLocation("/guia-implantacao");
    } catch {
      toast({ title: t("onboarding.integrations.finishError"), variant: "destructive" });
      setSubmitting(false);
    }
  }

  function openCentral(integration?: string) {
    const suffix = integration ? `&integration=${encodeURIComponent(integration)}` : "";
    setLocation(`/configuracoes?tab=integracoes${suffix}`);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

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

  const actions: ActionItem[] = status ? [
    {
      key: "whatsapp",
      integration: "whatsapp",
      done: status.whatsapp.connected,
      title: t("onboarding.integrations.whatsapp.title"),
      text: t("onboarding.integrations.whatsapp.text"),
      label: status.whatsapp.connected ? "Gerenciar na Central" : "Conectar na Central",
    },
    {
      key: "calendar",
      integration: "google-calendar",
      done: status.googleCalendar.connected,
      title: t("onboarding.integrations.action.calendar.title"),
      text: t("onboarding.integrations.action.calendar.text"),
      label: "Gerenciar na Central",
    },
    {
      key: "instagram",
      integration: "instagram",
      done: status.instagram.connected,
      title: t("onboarding.integrations.action.instagram.title"),
      text: t("onboarding.integrations.action.instagram.text"),
      label: "Gerenciar na Central",
    },
    {
      key: "googleAds",
      integration: "google-ads",
      done: status.googleAds.connected && !status.googleAds.pendingAccountSelection,
      title: t("onboarding.integrations.action.googleAds.title"),
      text: t("onboarding.integrations.action.googleAds.text"),
      label: "Gerenciar na Central",
    },
    {
      key: "search",
      integration: "search-console",
      done: status.searchConsole.verified,
      title: t("onboarding.integrations.action.search.title"),
      text: t("onboarding.integrations.action.search.notConnectedText"),
      label: "Gerenciar na Central",
    },
    {
      key: "linkedin",
      integration: "linkedin",
      done: status.social.linkedin,
      title: t("onboarding.integrations.action.linkedin.title"),
      text: t("onboarding.integrations.action.linkedin.text"),
      label: "Gerenciar na Central",
    },
    {
      key: "tiktok",
      integration: "tiktok",
      done: status.social.tiktok,
      title: t("onboarding.integrations.action.tiktok.title"),
      text: t("onboarding.integrations.action.tiktok.text"),
      label: "Gerenciar na Central",
    },
    {
      key: "asaas",
      integration: "asaas",
      done: status.asaas.connected,
      title: t("onboarding.integrations.asaasTitle"),
      text: "A chave e a validação ficam exclusivamente na Central de Conexões.",
      label: "Gerenciar na Central",
    },
    {
      key: "zapsign",
      integration: "zapsign",
      done: status.zapsign.connected,
      title: t("onboarding.integrations.zapSignTitle"),
      text: "O token e a validação ficam exclusivamente na Central de Conexões.",
      label: "Gerenciar na Central",
    },
    {
      key: "domain",
      integration: "domain",
      done: status.domain.active,
      title: t("onboarding.integrations.action.domain.title"),
      text: t("onboarding.integrations.action.domain.notConfiguredText"),
      label: "Gerenciar na Central",
    },
    {
      key: "tracking",
      integration: "tracking",
      done: status.tracking.googleAds && status.tracking.metaPixel,
      title: "Tracking e conversões",
      text: "GA4, GTM, Google Ads Conversion, Meta Pixel, LinkedIn Insight Tag e TikTok Pixel ficam centralizados.",
      label: "Gerenciar na Central",
    },
  ].filter((item) => !item.done) : [];

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
            <p className="text-sm font-semibold text-primary">{t("onboarding.integrations.eyebrow")}</p>
            <h1 className="text-3xl font-bold">{t("onboarding.integrations.title")}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Todas as conexões são configuradas em um único lugar. Este onboarding mostra apenas o que falta e leva você à Central de Conexões.
            </p>
          </div>
          <div className="rounded-xl border bg-background px-5 py-3">
            <strong className="text-2xl">{done}/15</strong>
            <p className="text-xs text-muted-foreground">{t("onboarding.integrations.progress")}</p>
          </div>
        </div>

        <section className="rounded-2xl border bg-background p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Central de Conexões</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                QR Code, OAuth, tokens, API keys, reconexão, testes, saúde e tracking são administrados somente na Central.
              </p>
            </div>
            <Button onClick={() => openCentral()}>Abrir Central de Conexões</Button>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold">{t("onboarding.integrations.nextActions")}</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            {actions.length ? "Pendências encontradas. Cada ação abre a integração correspondente na Central." : t("onboarding.integrations.nextActionsSubtitle")}
          </p>

          {actions.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {actions.map((action, index) => (
                <article key={action.key} className="rounded-2xl border bg-background p-5">
                  <div className="flex gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm text-primary">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="font-semibold">{action.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{action.text}</p>
                    </div>
                  </div>
                  <Button className="mt-4" size="sm" onClick={() => openCentral(action.integration)}>
                    {action.label}
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
              <h2 className="mt-3 text-xl font-semibold">{t("onboarding.integrations.complete")}</h2>
            </div>
          )}
        </section>

        <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-2xl border bg-background/95 p-4 shadow-lg">
          <p className="text-sm text-muted-foreground">{t("onboarding.integrations.later")}</p>
          <Button onClick={complete} disabled={submitting}>
            {t("onboarding.integrations.enterVendorAI")}
          </Button>
        </div>
      </main>
    </div>
  );
}
