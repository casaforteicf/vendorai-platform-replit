import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
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
import logoLight from "/logo-full-light.svg";

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
      toast({ title: "Google Calendar conectado!" });
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (urlParams.get("googleError")) {
      toast({
        title: "Erro ao conectar Google Calendar.",
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
            ? "Google Ads conectado — escolha a conta"
            : "Google Ads conectado!",
      });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (googleAdsError) {
      toast({
        title: "Erro ao conectar Google Ads.",
        description: googleAdsError,
        variant: "destructive",
      });
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
        phone_lookup:
          "Não foi possível consultar os números da conta WhatsApp.",
        exchange_failed: "A conexão falhou na etapa final. Tente novamente.",
      };
      toast({
        title: messages[whatsappError] ?? "Erro ao conectar WhatsApp.",
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
  }, [user?.tenantId]);

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
  }, [user?.tenantId, whatsappQrCode]);

  async function complete() {
    setSubmitting(true);
    try {
      await apiFetch("/api/onboarding/integracoes/complete", {
        method: "POST",
      });
      setLocation("/guia-implantacao");
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
          toast({ title: "WhatsApp já está conectado via QR Code." });
        return;
      }

      if (!data.qrCodeBase64)
        throw new Error("A Evolution API não retornou um QR Code.");
      setWhatsappQrCode(data.qrCodeBase64);
    } catch (error) {
      toast({
        title: "Não foi possível gerar o QR Code",
        description:
          error instanceof Error
            ? error.message
            : "Verifique a integração Evolution API.",
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
        title: "Erro ao iniciar conexão Google Calendar.",
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
        title: "Erro ao iniciar conexão Instagram.",
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
        title: "Erro ao iniciar conexão Google Ads.",
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
      toast({ title: "Conta Google Ads selecionada!" });
    } catch {
      toast({
        title: "Erro ao selecionar conta Google Ads.",
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
          title: `Asaas conectado${data.name ? ` — ${data.name}` : ""}!`,
        });
        setStatus((s) => (s ? { ...s, asaas: { connected: true } } : s));
      } else {
        toast({
          title: data.error ?? "Chave inválida.",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Erro ao validar chave Asaas.", variant: "destructive" });
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
          title: `ZapSign conectado${data.name ? ` — ${data.name}` : ""}!`,
        });
        setStatus((s) => (s ? { ...s, zapsign: { connected: true } } : s));
      } else {
        toast({
          title: data.error ?? "Chave inválida.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Erro ao validar chave ZapSign.",
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
          title: "Sincronizar Google Calendar",
          text: "Autorize a agenda usada nos compromissos e reuniões.",
          label: "Conectar Calendar",
          action: connectGoogleCalendar,
          link: "https://calendar.google.com/",
        },
        {
          key: "instagram",
          done: status.instagram.connected,
          title: "Conectar Instagram e Facebook",
          text: "Autorize a conta Business para mensagens e publicações.",
          label: "Conectar Instagram",
          action: connectInstagram,
          link: "https://business.facebook.com/settings/",
        },
        {
          key: "googleAds",
          done:
            status.googleAds.connected &&
            !status.googleAds.pendingAccountSelection,
          title: "Conectar a conta Google Ads",
          text: "Autorize a conta que receberá as campanhas criadas no VendorAI.",
          label: "Conectar Google Ads",
          action: connectGoogleAds,
          link: "https://ads.google.com/",
        },
        {
          key: "site",
          done: status.site.published,
          title: "Criar ou publicar o site",
          text: "Gere o site com IA, revise e clique em Publicar. Para HTML baixado, use a publicação do seu provedor.",
          label: "Ir para meu site",
          action: () => go("/configuracoes?tab=site&installation=1"),
          link: "https://developers.cloudflare.com/pages/get-started/direct-upload/",
        },
        {
          key: "domain",
          done: status.domain.active,
          title: "Usar domínio próprio",
          text: status.domain.configured
            ? `O domínio ${status.domain.name ?? "informado"} ainda precisa concluir DNS/SSL.`
            : "Adicione o domínio e copie o CNAME mostrado para o painel onde ele foi comprado.",
          label: status.domain.configured
            ? "Concluir domínio"
            : "Adicionar domínio",
          action: () => go("/configuracoes?tab=site&installation=1"),
          link: "https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/",
        },
        {
          key: "search",
          done: status.searchConsole.verified,
          title: "Ativar Google Search Console",
          text: status.searchConsole.connected
            ? "A conta está conectada; falta verificar a propriedade."
            : "Conecte a conta Google; o VendorAI verifica o site e envia o sitemap.",
          label: "Configurar Search Console",
          action: () => go("/configuracoes?tab=site&installation=1"),
          link: "https://search.google.com/search-console",
        },
        {
          key: "googleTag",
          done: status.tracking.googleAds,
          title: "ID de conversão do Google Ads",
          text: "Em Metas → Conversões → Configuração da tag, copie o ID AW-XXXXXXXXX.",
          label: "Colar ID",
          action: () => go("/configuracoes?tab=site&installation=1"),
          link: "https://ads.google.com/aw/conversions",
        },
        {
          key: "metaPixel",
          done: status.tracking.metaPixel,
          title: "ID do Meta Pixel",
          text: "No Gerenciador de Eventos, abra a fonte de dados e copie o ID do Pixel.",
          label: "Colar ID",
          action: () => go("/configuracoes?tab=site&installation=1"),
          link: "https://business.facebook.com/events_manager2/list/pixel/",
        },
        {
          key: "linkedinTag",
          done: status.tracking.linkedinInsightTag,
          title: "ID do LinkedIn Insight Tag",
          text: "No Campaign Manager, abra Insight Tag e copie o Partner ID.",
          label: "Colar Partner ID",
          action: () => go("/configuracoes?tab=site&installation=1"),
          link: "https://www.linkedin.com/campaignmanager/",
        },
        {
          key: "tiktokPixel",
          done: status.tracking.tiktokPixel,
          title: "ID do TikTok Pixel",
          text: "Em Ferramentas → Eventos → Fontes de dados → Web, copie o Pixel ID.",
          label: "Colar Pixel ID",
          action: () => go("/configuracoes?tab=site&installation=1"),
          link: "https://ads.tiktok.com/i18n/events_manager/",
        },
        {
          key: "linkedin",
          done: status.social.linkedin,
          title: "Conectar LinkedIn",
          text: "Autorize a conta usada para publicar conteúdo.",
          label: "Conectar LinkedIn",
          action: () => go("/configuracoes?tab=integracoes&installation=1"),
          link: "https://www.linkedin.com/help/linkedin/",
        },
        {
          key: "tiktok",
          done: status.social.tiktok,
          title: "Conectar TikTok",
          text: "Autorize a conta usada pela operação de conteúdo.",
          label: "Conectar TikTok",
          action: () => go("/configuracoes?tab=integracoes&installation=1"),
          link: "https://www.tiktok.com/business/",
        },
      ].filter((x) => !x.done)
    : [];
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <img src={logoLight} alt="VendorAI" className="h-7 dark:invert" />
          <Button variant="ghost" size="sm" onClick={complete}>
            Continuar depois
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">
              Instalação autônoma
            </p>
            <h1 className="text-3xl font-bold">
              Vamos colocar sua operação no ar
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Cada cartão explica uma ação e leva direto ao local correto.
              Quando funcionar, ele desaparece da lista.
            </p>
          </div>
          <div className="rounded-xl border bg-background px-5 py-3">
            <strong className="text-2xl">{done}/15</strong>
            <p className="text-xs text-muted-foreground">ações funcionando</p>
          </div>
        </div>
        {!status?.whatsapp.connected && (
          <section className="rounded-2xl border border-green-200 bg-background p-6">
            <div className="flex gap-4">
              <MessageCircle className="h-7 w-7 shrink-0 text-green-600" />
              <div className="flex-1">
                <h2 className="font-semibold">Conectar o primeiro WhatsApp</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use Meta oficial ou QR Code. Depois adicione vários números e
                  atribua cada um a um usuário.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={connectWhatsApp}>Meta oficial</Button>
                  <Button
                    variant="outline"
                    onClick={connectWhatsAppQr}
                    disabled={whatsappQrConnecting}
                  >
                    {whatsappQrConnecting && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Conectar por QR
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => go("/configuracoes?tab=integracoes&installation=1")}
                  >
                    Gerenciar números
                  </Button>
                </div>
                {qrSrc && (
                  <div className="mt-4 rounded-xl border p-4 text-center">
                    <p className="mb-2 text-sm">
                      WhatsApp → Aparelhos conectados → Conectar aparelho
                    </p>
                    <img
                      src={qrSrc}
                      alt="QR Code do WhatsApp"
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
            <h2 className="font-semibold">Escolha a conta Google Ads</h2>
            <div className="mt-3 flex gap-2">
              <select
                className="h-10 flex-1 rounded-md border bg-background px-3"
                value={selectedGoogleAdsAccount}
                onChange={(e) => setSelectedGoogleAdsAccount(e.target.value)}
              >
                <option value="">Selecione</option>
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
                Confirmar
              </Button>
            </div>
          </section>
        )}
        <section>
          <h2 className="text-lg font-semibold">Próximas ações</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Faça apenas as integrações que sua operação usa.
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
                        Abrir local oficial
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
                Instalação concluída
              </h2>
            </div>
          )}
        </section>
        <section className="grid gap-4 md:grid-cols-2">
          <CredentialCard
            title="Cobrança com Asaas"
            connected={status?.asaas.connected}
            value={asaasKey}
            setValue={setAsaasKey}
            placeholder="$aact_..."
            validate={validateAsaas}
            link="https://app.asaas.com"
            submitting={submitting}
          />
          <CredentialCard
            title="Assinatura com ZapSign"
            connected={status?.zapsign.connected}
            value={zapsignKey}
            setValue={setZapsignKey}
            placeholder="Token da API"
            validate={validateZapSign}
            link="https://app.zapsign.com.br"
            submitting={submitting}
          />
        </section>
        <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-2xl border bg-background/95 p-4 shadow-lg">
          <p className="text-sm text-muted-foreground">
            Você pode completar outras integrações depois.
          </p>
          <Button onClick={complete} disabled={submitting}>
            Entrar no VendorAI
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
  return (
    <div className="rounded-2xl border bg-background p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Opcional. Abra o serviço, copie a chave de API e valide.
      </p>
      {connected ? (
        <p className="mt-3 text-sm text-green-600">✓ Funcionando</p>
      ) : (
        <div className="mt-3 flex gap-2">
          <Input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
          />
          <Button onClick={validate} disabled={!value.trim() || submitting}>
            Validar
          </Button>
        </div>
      )}
      <a
        className="mt-3 inline-flex text-xs text-primary"
        href={link}
        target="_blank"
        rel="noreferrer"
      >
        Abrir serviço
        <ExternalLink className="ml-1 h-3 w-3" />
      </a>
    </div>
  );
}
