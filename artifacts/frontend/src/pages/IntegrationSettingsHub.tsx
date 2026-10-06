import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type IntegrationStatus = {
  whatsapp?: { connected?: boolean; phone?: string | null };
  googleCalendar?: { connected?: boolean };
  instagram?: { connected?: boolean; username?: string | null };
  googleAds?: { connected?: boolean; pendingAccountSelection?: boolean; descriptiveName?: string | null };
  asaas?: { connected?: boolean };
  zapsign?: { connected?: boolean };
  domain?: { configured?: boolean; active?: boolean; name?: string | null };
  searchConsole?: { connected?: boolean; verified?: boolean };
  social?: { linkedin?: boolean; tiktok?: boolean };
  email?: {
    google?: { connected?: boolean; address?: string | null };
    microsoft?: { connected?: boolean; address?: string | null };
  };
};

type IntegrationKey =
  | "whatsapp"
  | "instagram"
  | "google-calendar"
  | "email-google"
  | "email-microsoft"
  | "email-webmail"
  | "google-ads"
  | "asaas"
  | "zapsign"
  | "search-console"
  | "linkedin"
  | "tiktok"
  | "domain";

type IntegrationCategory = "Essenciais" | "Google" | "Marketing e social" | "Pagamentos e contratos" | "Domínio e web";

type IntegrationRow = {
  key: IntegrationKey;
  label: string;
  description: string;
  category: IntegrationCategory;
  usedBy?: string;
  connected: boolean;
  attention?: boolean;
  detail?: string;
};

type CatalogIntegration = {
  providerKey: string;
  name: string;
  category: string;
  authType: string;
  capabilities?: string[];
  status?: string;
  overallHealthPercent?: number;
  lastErrorMessage?: string | null;
};

type CustomIntegration = {
  id: string;
  name: string;
  kind: "api" | "webhook" | "n8n";
  status: "connected" | "attention" | "error" | "disabled" | "not_configured";
  baseUrl?: string | null;
  authType: "none" | "api_key" | "bearer" | "basic";
  hasCredential?: boolean;
  hasWebhookSecret?: boolean;
  lastTestAt?: string | null;
  lastSuccessAt?: string | null;
  lastEventAt?: string | null;
  lastError?: string | null;
};

const OAUTH_ENDPOINTS: Partial<Record<IntegrationKey, string>> = {
  instagram: "/api/auth/instagram",
  "google-calendar": "/api/onboarding/integracoes/google-url",
  "google-ads": "/api/auth/google-ads",
  "search-console": "/api/auth/search-console",
  linkedin: "/api/auth/linkedin",
  tiktok: "/api/auth/tiktok",
};

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

async function apiJson(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      ...(authHeaders() ?? {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : typeof data?.error === "string" ? data.error : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

export default function IntegrationSettingsHub() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [catalogIntegrations, setCatalogIntegrations] = useState<CatalogIntegration[]>([]);
  const [showCustomGuide, setShowCustomGuide] = useState<"api" | "webhook" | "n8n" | null>(null);
  const [customIntegrations, setCustomIntegrations] = useState<CustomIntegration[]>([]);
  const [customDraft, setCustomDraft] = useState({
    name: "",
    baseUrl: "",
    authType: "none" as "none" | "api_key" | "bearer" | "basic",
    credential: "",
    apiKeyHeader: "X-API-Key",
    healthPath: "/",
  });
  const [lastWebhookSetup, setLastWebhookSetup] = useState<{ path: string; secret: string; secretHeader: string } | null>(null);
  const [asaasKey, setAsaasKey] = useState("");
  const [zapsignKey, setZapsignKey] = useState("");
  const [emailConnections, setEmailConnections] = useState<Array<{
    provider: "google" | "microsoft" | "webmail";
    email?: string | null;
    accountName?: string | null;
    signature?: string | null;
    username?: string | null;
    imapHost?: string | null;
    imapPort?: number | null;
    imapSecure?: boolean | null;
    smtpHost?: string | null;
    smtpPort?: number | null;
    smtpSecure?: boolean | null;
    smtpStartTls?: boolean | null;
  }>>([]);
  const [emailSignatures, setEmailSignatures] = useState<Record<"google" | "microsoft" | "webmail", string>>({ google: "", microsoft: "", webmail: "" });
  const [webmail, setWebmail] = useState({
    email: "",
    username: "",
    password: "",
    imapHost: "",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "",
    smtpPort: 465,
    smtpSecure: true,
    smtpStartTls: false,
    signature: "",
  });

  const loadStatus = async () => {
    setLoading(true);
    try {
      const [data, emailData, financeData, customData] = await Promise.all([
        apiJson("/api/onboarding/integracoes"),
        tenantId ? apiJson(`/api/tenants/${encodeURIComponent(tenantId)}/email-connections`).catch(() => ({ connections: [] })) : Promise.resolve({ connections: [] }),
        tenantId ? apiJson(`/api/tenants/${encodeURIComponent(tenantId)}/finance-integrations`).catch(() => ({ integrations: [] })) : Promise.resolve({ integrations: [] }),
        tenantId ? apiJson(`/api/tenants/${encodeURIComponent(tenantId)}/custom-integrations`).catch(() => ({ integrations: [] })) : Promise.resolve({ integrations: [] }),
      ]);
      setStatus(data as IntegrationStatus);
      const hiddenTenantInfrastructure = new Set([
        "cloudflare", "railway", "supabase", "openai",
        "whatsapp", "email", "meta", "google-ads", "asaas", "zapsign",
        "n8n", "public-api",
      ]);
      const financeCatalog = Array.isArray(financeData?.integrations) ? financeData.integrations : [];
      setCatalogIntegrations(financeCatalog.filter((item: CatalogIntegration) => !hiddenTenantInfrastructure.has(item.providerKey)));
      setCustomIntegrations(Array.isArray(customData?.integrations) ? customData.integrations : []);
      const connections = Array.isArray(emailData?.connections) ? emailData.connections : [];
      setEmailConnections(connections);
      setEmailSignatures({
        google: connections.find((connection: any) => connection.provider === "google")?.signature ?? "",
        microsoft: connections.find((connection: any) => connection.provider === "microsoft")?.signature ?? "",
        webmail: connections.find((connection: any) => connection.provider === "webmail")?.signature ?? "",
      });
      const webmailConnection = connections.find((connection: any) => connection.provider === "webmail");
      if (webmailConnection) {
        setWebmail((current) => ({
          ...current,
          email: webmailConnection.email ?? "",
          username: webmailConnection.username ?? webmailConnection.email ?? "",
          password: "",
          imapHost: webmailConnection.imapHost ?? "",
          imapPort: Number(webmailConnection.imapPort ?? 993),
          imapSecure: webmailConnection.imapSecure !== false,
          smtpHost: webmailConnection.smtpHost ?? "",
          smtpPort: Number(webmailConnection.smtpPort ?? 465),
          smtpSecure: webmailConnection.smtpSecure !== false,
          smtpStartTls: webmailConnection.smtpStartTls === true,
          signature: webmailConnection.signature ?? "",
        }));
      }
    } catch (error) {
      toast({
        title: "Não foi possível carregar as integrações",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const rows = useMemo<IntegrationRow[]>(() => [
    {
      key: "whatsapp",
      label: "WhatsApp",
      description: "Atendimento, conversas, automações e vínculo com o CRM.",
      category: "Essenciais",
      usedBy: "Omnichannel · CRM · Agentes",
      connected: status?.whatsapp?.connected === true,
      detail: status?.whatsapp?.phone || undefined,
    },
    {
      key: "instagram",
      label: "Instagram",
      description: "Mensagens, perfil, conteúdo e publicação no Instagram.",
      category: "Marketing e social",
      usedBy: "Marketing · Omnichannel · CRM",
      connected: status?.instagram?.connected === true,
      detail: status?.instagram?.username ? `@${status.instagram.username.replace(/^@/, "")}` : undefined,
    },
    {
      key: "google-calendar",
      label: "Google Calendar",
      description: "Sincroniza agenda, compromissos, reuniões e disponibilidade.",
      category: "Google",
      usedBy: "Agenda · CRM · Agente de Agendamento",
      connected: status?.googleCalendar?.connected === true,
    },
    {
      key: "email-google",
      label: "Gmail / Google Workspace",
      description: "Envia e recebe e-mails pelo Google Workspace dentro do Vendor.ai.",
      category: "Google",
      usedBy: "Omnichannel · CRM · Agentes",
      connected: emailConnections.some((connection) => connection.provider === "google"),
      detail: emailConnections.find((connection) => connection.provider === "google")?.email || undefined,
    },
    {
      key: "email-microsoft",
      label: "Microsoft 365 / Outlook",
      description: "Conecta Outlook/Microsoft 365 ao e-mail, CRM e agentes.",
      category: "Essenciais",
      usedBy: "Omnichannel · CRM · Agentes",
      connected: emailConnections.some((connection) => connection.provider === "microsoft"),
      detail: emailConnections.find((connection) => connection.provider === "microsoft")?.email || undefined,
    },
    {
      key: "email-webmail",
      label: "Webmail / Outro provedor",
      description: "Conecta e-mail de domínio próprio via IMAP/SMTP.",
      category: "Essenciais",
      usedBy: "Omnichannel · CRM · Agentes",
      connected: emailConnections.some((connection) => connection.provider === "webmail"),
      detail: emailConnections.find((connection) => connection.provider === "webmail")?.email || undefined,
    },
    {
      key: "google-ads",
      label: "Google Ads",
      description: "Campanhas, mídia, performance e conversões do Google.",
      category: "Google",
      usedBy: "Marketing · BI · CRM",
      connected: status?.googleAds?.connected === true && status?.googleAds?.pendingAccountSelection !== true,
      attention: status?.googleAds?.pendingAccountSelection === true,
      detail: status?.googleAds?.pendingAccountSelection ? "Seleção de conta pendente" : status?.googleAds?.descriptiveName || undefined,
    },
    {
      key: "asaas",
      label: "Asaas",
      description: "Pix, boleto, cartão, recorrência e confirmação de pagamentos.",
      category: "Pagamentos e contratos",
      usedBy: "Financeiro · Propostas · CRM",
      connected: status?.asaas?.connected === true,
    },
    {
      key: "zapsign",
      label: "ZapSign",
      description: "Envia contratos e documentos para assinatura eletrônica.",
      category: "Pagamentos e contratos",
      usedBy: "Contratos · CRM · Portal",
      connected: status?.zapsign?.connected === true,
    },
    {
      key: "search-console",
      label: "Search Console",
      description: "SEO, indexação, pesquisas no Google e saúde orgânica do site.",
      category: "Google",
      usedBy: "Marketing · Site · BI",
      connected: status?.searchConsole?.connected === true && status?.searchConsole?.verified === true,
      attention: status?.searchConsole?.connected === true && status?.searchConsole?.verified !== true,
      detail: status?.searchConsole?.connected && !status?.searchConsole?.verified ? "Conta autorizada · falta confirmar a propriedade" : undefined,
    },
    {
      key: "linkedin",
      label: "LinkedIn",
      description: "Publicações, presença profissional, métricas e recursos B2B.",
      category: "Marketing e social",
      usedBy: "Marketing · Prospecção · BI",
      connected: status?.social?.linkedin === true,
    },
    {
      key: "tiktok",
      label: "TikTok",
      description: "Publicações, métricas, presença social e recursos de mídia TikTok.",
      category: "Marketing e social",
      usedBy: "Marketing · Conteúdo · BI",
      connected: status?.social?.tiktok === true,
    },
    {
      key: "domain",
      label: "Domínio próprio",
      description: "Usa o domínio da empresa no site, portal, landing pages e links públicos.",
      category: "Domínio e web",
      usedBy: "Site · Portal · Landing pages",
      connected: status?.domain?.active === true,
      attention: status?.domain?.configured === true && status?.domain?.active !== true,
      detail: status?.domain?.name || undefined,
    },
  ], [status, emailConnections]);

  const startConnection = async (key: IntegrationKey) => {
    if (key === "domain") {
      window.location.assign("/content-autopilot?view=settings");
      return;
    }
    if (key === "whatsapp") {
      window.location.assign("/configuracoes?integration=whatsapp");
      return;
    }
    if (key === "asaas" || key === "zapsign") return;

    if (key === "email-google" || key === "email-microsoft") {
      if (!tenantId) return;
      setBusy(key);
      try {
        const provider = key === "email-google" ? "google" : key === "email-microsoft" ? "microsoft" : "webmail";
        const data = await apiJson(`/api/tenants/${encodeURIComponent(tenantId)}/email-connections/${provider}/auth-url`);
        if (!data?.url || typeof data.url !== "string") throw new Error("URL de autorização não retornada.");
        window.location.assign(data.url);
      } catch (error) {
        toast({
          title: "Não foi possível conectar o e-mail",
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        });
        setBusy(null);
      }
      return;
    }

    const endpoint = OAUTH_ENDPOINTS[key];
    if (!endpoint) return;
    setBusy(key);
    try {
      const data = await apiJson(endpoint);
      if (!data?.url || typeof data.url !== "string") throw new Error("URL de autorização não retornada.");
      window.location.assign(data.url);
    } catch (error) {
      toast({
        title: `Não foi possível abrir ${rows.find((row) => row.key === key)?.label ?? "a integração"}`,
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
      setBusy(null);
    }
  };

  const verifySearchConsole = async () => {
    if (!tenantId) {
      toast({ title: "Não foi possível identificar o tenant para verificar o Search Console.", variant: "destructive" });
      return;
    }

    setBusy("search-console");
    try {
      const data = await apiJson(`/api/tenants/${encodeURIComponent(tenantId)}/search-console-connection/verify`, {
        method: "POST",
      });
      if (data?.verified === true) {
        toast({ title: "Search Console confirmado e sitemap enviado ao Google com sucesso." });
      } else {
        toast({
          title: "O Google ainda está processando a verificação.",
          description: "Aguarde de 2 a 5 minutos e clique novamente em “Verificar agora”. Não é necessário reconectar a conta.",
        });
      }
      await loadStatus();
    } catch (error) {
      toast({
        title: "Não foi possível verificar o Search Console agora",
        description: error instanceof Error ? error.message : "Tente novamente em alguns instantes.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const validateCredential = async (provider: "asaas" | "zapsign") => {
    const value = provider === "asaas" ? asaasKey.trim() : zapsignKey.trim();
    if (!value) return;
    setBusy(provider);
    try {
      const path = provider === "asaas"
        ? "/api/onboarding/integracoes/validate-asaas"
        : "/api/onboarding/integracoes/validate-zapsign";
      const data = await apiJson(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: value }),
      });
      if (data?.valid !== true) throw new Error(data?.error || "Credencial inválida.");
      toast({ title: `${provider === "asaas" ? "Asaas" : "ZapSign"} conectado com sucesso.` });
      if (provider === "asaas") setAsaasKey("");
      else setZapsignKey("");
      await loadStatus();
    } catch (error) {
      toast({
        title: "Não foi possível validar a credencial",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const syncEmail = async (key: "email-google" | "email-microsoft" | "email-webmail") => {
    if (!tenantId) return;
    setBusy(`${key}-sync`);
    try {
      const provider = key === "email-google" ? "google" : key === "email-microsoft" ? "microsoft" : "webmail";
      const result = await apiJson(`/api/tenants/${encodeURIComponent(tenantId)}/email-connections/${provider}/sync`, { method: "POST" });
      toast({
        title: "E-mails sincronizados",
        description: `${result.imported ?? 0} vinculados ao CRM · ${result.unmatched ?? 0} contatos ainda não classificados.`,
      });
      await loadStatus();
    } catch (error) {
      toast({
        title: "Não foi possível sincronizar o e-mail",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const saveEmailSignature = async (key: "email-google" | "email-microsoft" | "email-webmail") => {
    if (!tenantId) return;
    const provider = key === "email-google" ? "google" : key === "email-microsoft" ? "microsoft" : "webmail";
    setBusy(`${key}-signature`);
    try {
      await apiJson(`/api/tenants/${encodeURIComponent(tenantId)}/email-connections/${provider}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: emailSignatures[provider] }),
      });
      toast({ title: "Assinatura de e-mail salva." });
      await loadStatus();
    } catch (error) {
      toast({
        title: "Não foi possível salvar a assinatura",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const saveWebmail = async () => {
    if (!tenantId) return;
    setBusy("email-webmail");
    try {
      await apiJson(`/api/tenants/${encodeURIComponent(tenantId)}/email-connections/webmail`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(webmail),
      });
      toast({ title: "Webmail conectado com sucesso", description: "IMAP e SMTP foram validados antes de salvar." });
      setWebmail((current) => ({ ...current, password: "" }));
      await loadStatus();
    } catch (error) {
      toast({
        title: "Não foi possível conectar o Webmail",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const testWebmail = async () => {
    if (!tenantId) return;
    setBusy("email-webmail-test");
    try {
      await apiJson(`/api/tenants/${encodeURIComponent(tenantId)}/email-connections/webmail/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(webmail),
      });
      toast({ title: "Conexão Webmail validada", description: "IMAP e SMTP responderam corretamente." });
    } catch (error) {
      toast({
        title: "Falha ao testar Webmail",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const testConnectedWebmail = async () => {
    if (!tenantId) return;
    setBusy("email-webmail-connected-test");
    try {
      await apiJson(`/api/tenants/${encodeURIComponent(tenantId)}/email-connections/webmail/test`, { method: "POST" });
      toast({ title: "Webmail operacional", description: "IMAP e SMTP responderam corretamente." });
    } catch (error) {
      toast({ title: "Falha na conexão Webmail", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const disconnectWebmail = async () => {
    if (!tenantId) return;
    setBusy("email-webmail-disconnect");
    try {
      await apiJson(`/api/tenants/${encodeURIComponent(tenantId)}/email-connections/webmail`, { method: "DELETE" });
      toast({ title: "Webmail desconectado." });
      await loadStatus();
    } catch (error) {
      toast({ title: "Não foi possível desconectar o Webmail", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleRowAction = async (row: IntegrationRow) => {
    if (row.key === "search-console" && (row.attention || row.connected)) {
      await verifySearchConsole();
      return;
    }
    await startConnection(row.key);
  };

  const rowActionLabel = (row: IntegrationRow) => {
    if (busy === row.key) {
      if (row.key === "search-console") return row.connected ? "Enviando sitemap..." : "Verificando...";
      return "Abrindo...";
    }
    if (row.key === "search-console" && row.attention) return "Verificar agora";
    if (row.key === "search-console" && row.connected) return "Reenviar sitemap";
    if (row.key === "domain") return "Configurar domínio";
    if (row.connected) return "Reconectar / gerenciar";
    if (row.attention) return "Revisar integração";
    return "Conectar agora";
  };

  const createCustomIntegration = async (kind: "api" | "webhook" | "n8n") => {
    if (!tenantId || !customDraft.name.trim()) {
      toast({ title: "Informe um nome para a conexão.", variant: "destructive" });
      return;
    }
    if (kind !== "webhook" && !customDraft.baseUrl.trim()) {
      toast({ title: "Informe a URL HTTPS do serviço.", variant: "destructive" });
      return;
    }
    setBusy(`custom-${kind}`);
    try {
      const data = await apiJson(`/api/tenants/${encodeURIComponent(tenantId)}/custom-integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customDraft.name.trim(),
          kind,
          baseUrl: kind === "webhook" ? null : customDraft.baseUrl.trim(),
          authType: kind === "webhook" ? "none" : customDraft.authType,
          credential: kind === "webhook" || customDraft.authType === "none" ? null : customDraft.credential,
          apiKeyHeader: customDraft.apiKeyHeader,
          healthPath: customDraft.healthPath || "/",
        }),
      });
      setLastWebhookSetup(data?.webhook || null);
      setCustomDraft({ name: "", baseUrl: "", authType: "none", credential: "", apiKeyHeader: "X-API-Key", healthPath: "/" });
      toast({
        title: kind === "webhook" ? "Webhook criado" : "Conexão salva",
        description: kind === "webhook" ? "Copie a URL e o segredo agora; o segredo não será exibido novamente." : "Use “Testar conexão” para validar o endpoint.",
      });
      await loadStatus();
    } catch (error) {
      toast({ title: "Não foi possível criar a conexão", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const testCustomIntegration = async (connection: CustomIntegration) => {
    if (!tenantId) return;
    setBusy(`custom-test-${connection.id}`);
    try {
      const result = await apiJson(`/api/tenants/${encodeURIComponent(tenantId)}/custom-integrations/${encodeURIComponent(connection.id)}/test`, { method: "POST" });
      toast({ title: result.ok ? "Conexão validada" : "Conexão precisa de atenção", description: result.message });
      await loadStatus();
    } catch (error) {
      toast({ title: "Teste falhou", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
      await loadStatus();
    } finally {
      setBusy(null);
    }
  };

  const removeCustomIntegration = async (connection: CustomIntegration) => {
    if (!tenantId) return;
    setBusy(`custom-delete-${connection.id}`);
    try {
      await apiJson(`/api/tenants/${encodeURIComponent(tenantId)}/custom-integrations/${encodeURIComponent(connection.id)}`, { method: "DELETE" });
      toast({ title: "Conexão removida." });
      await loadStatus();
    } catch (error) {
      toast({ title: "Não foi possível remover", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const visibleRows = rows.filter((row) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [row.label, row.description, row.category, row.usedBy, row.detail].filter(Boolean).join(" ").toLowerCase().includes(term);
  });
  const groupedRows = visibleRows.reduce<Record<string, IntegrationRow[]>>((acc, row) => {
    (acc[row.category] ||= []).push(row);
    return acc;
  }, {});
  const tenantCatalog = catalogIntegrations.filter((item) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [item.name, item.category, ...(item.capabilities || [])].join(" ").toLowerCase().includes(term);
  });
  const connectedCount = rows.filter((row) => row.connected).length;
  const attentionCount = rows.filter((row) => row.attention).length;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 pb-10 sm:px-6">
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Configurações</div>
          <h1 className="mt-1 text-2xl font-bold">Central de Conexões</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Todas as conexões externas da empresa ficam aqui. O Vendor.ai orienta login, permissões, ativos e etapas adicionais.
          </p>
          {user?.email && <p className="mt-1 text-xs text-muted-foreground">Sessão: {user.email}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.location.assign("/configuracoes")}>Voltar</Button>
          <Button variant="outline" onClick={() => void loadStatus()} disabled={loading}>Atualizar status</Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-semibold">Saúde das conexões</h2>
            <p className="text-sm text-muted-foreground">
              {loading ? "Verificando conexões..." : `${connectedCount} conectadas · ${attentionCount} precisam de atenção · ${tenantCatalog.length} opções no catálogo`}
            </p>
          </div>
          <div className="w-full lg:max-w-sm">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar Google, ERP, Pix, API..." />
          </div>
        </div>

        <div className="mt-5 space-y-6">
          {Object.entries(groupedRows).map(([category, categoryRows]) => (
            <section key={category}>
              <div className="mb-2">
                <h3 className="text-sm font-semibold">{category}</h3>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {categoryRows.map((row) => (
            <div key={row.key} className="rounded-xl border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{row.label}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{row.description}</p>
                  {row.usedBy && <p className="mt-2 text-[11px] text-muted-foreground"><span className="font-medium">Usado por:</span> {row.usedBy}</p>}
                </div>
                <span className={row.connected ? "text-xs font-semibold text-emerald-600" : row.attention ? "text-xs font-semibold text-amber-600" : "text-xs font-semibold text-muted-foreground"}>
                  {row.connected ? "Conectado" : row.attention ? "Atenção" : "Desconectado"}
                </span>
              </div>
              {row.detail && <p className="mt-3 text-sm">{row.detail}</p>}

              {row.key === "asaas" && !row.connected ? (
                <div className="mt-4 flex gap-2">
                  <Input type="password" value={asaasKey} onChange={(event) => setAsaasKey(event.target.value)} placeholder="Chave da API Asaas" />
                  <Button disabled={!asaasKey.trim() || busy === "asaas"} onClick={() => void validateCredential("asaas")}>Validar</Button>
                </div>
              ) : row.key === "zapsign" && !row.connected ? (
                <div className="mt-4 flex gap-2">
                  <Input type="password" value={zapsignKey} onChange={(event) => setZapsignKey(event.target.value)} placeholder="Token da API ZapSign" />
                  <Button disabled={!zapsignKey.trim() || busy === "zapsign"} onClick={() => void validateCredential("zapsign")}>Validar</Button>
                </div>
              ) : row.key === "email-webmail" && !row.connected ? (
                <div className="mt-4 space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input value={webmail.email} onChange={(e) => setWebmail((v) => ({ ...v, email: e.target.value }))} placeholder="E-mail (ex.: contato@empresa.com.br)" />
                    <Input value={webmail.username} onChange={(e) => setWebmail((v) => ({ ...v, username: e.target.value }))} placeholder="Usuário do e-mail" />
                    <Input type="password" value={webmail.password} onChange={(e) => setWebmail((v) => ({ ...v, password: e.target.value }))} placeholder="Senha ou senha de aplicativo" />
                    <div />
                    <Input value={webmail.imapHost} onChange={(e) => setWebmail((v) => ({ ...v, imapHost: e.target.value }))} placeholder="Servidor IMAP" />
                    <Input type="number" value={webmail.imapPort} onChange={(e) => setWebmail((v) => ({ ...v, imapPort: Number(e.target.value) || 993 }))} placeholder="Porta IMAP" />
                    <Input value={webmail.smtpHost} onChange={(e) => setWebmail((v) => ({ ...v, smtpHost: e.target.value }))} placeholder="Servidor SMTP" />
                    <Input type="number" value={webmail.smtpPort} onChange={(e) => setWebmail((v) => ({ ...v, smtpPort: Number(e.target.value) || 465 }))} placeholder="Porta SMTP" />
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={webmail.imapSecure} onChange={(e) => setWebmail((v) => ({ ...v, imapSecure: e.target.checked }))} />
                      IMAP SSL/TLS
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={webmail.smtpSecure} onChange={(e) => setWebmail((v) => ({ ...v, smtpSecure: e.target.checked }))} />
                      SMTP SSL/TLS
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={webmail.smtpStartTls} onChange={(e) => setWebmail((v) => ({ ...v, smtpStartTls: e.target.checked }))} />
                      SMTP STARTTLS
                    </label>
                  </div>
                  <textarea
                    value={webmail.signature}
                    onChange={(e) => setWebmail((v) => ({ ...v, signature: e.target.value }))}
                    placeholder="Assinatura automática (opcional)"
                    rows={3}
                    className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" disabled={!webmail.password || busy === "email-webmail-test"} onClick={() => void testWebmail()}>
                      {busy === "email-webmail-test" ? "Testando..." : "Testar conexão"}
                    </Button>
                    <Button disabled={!webmail.password || busy === "email-webmail"} onClick={() => void saveWebmail()}>
                      {busy === "email-webmail" ? "Conectando..." : "Conectar Webmail"}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">A senha é criptografada no servidor e nunca é devolvida pela API.</p>
                </div>
              ) : row.connected && (row.key === "email-google" || row.key === "email-microsoft" || row.key === "email-webmail") ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Assinatura automática</label>
                    <textarea
                      value={emailSignatures[row.key === "email-google" ? "google" : row.key === "email-microsoft" ? "microsoft" : "webmail"]}
                      onChange={(event) => {
                        const provider = row.key === "email-google" ? "google" : row.key === "email-microsoft" ? "microsoft" : "webmail";
                        setEmailSignatures((current) => ({ ...current, [provider]: event.target.value }));
                      }}
                      placeholder={"Ex.: Marcos\nVendor.ai\n(49) ..."}
                      rows={4}
                      className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {row.key === "email-webmail" ? (
                      <>
                        <Button
                          variant="outline"
                          disabled={busy === "email-webmail-connected-test"}
                          onClick={() => void testConnectedWebmail()}
                        >
                          {busy === "email-webmail-connected-test" ? "Testando..." : "Testar conexão"}
                        </Button>
                        <Button
                          disabled={busy === "email-webmail-sync"}
                          onClick={() => void syncEmail("email-webmail")}
                        >
                          {busy === "email-webmail-sync" ? "Sincronizando..." : "Sincronizar agora"}
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy === "email-webmail-disconnect"}
                          onClick={() => void disconnectWebmail()}
                        >
                          Desconectar
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          disabled={busy === row.key}
                          onClick={() => void handleRowAction(row)}
                        >
                          Reconectar
                        </Button>
                        <Button
                          disabled={busy === `${row.key}-sync`}
                          onClick={() => void syncEmail(row.key)}
                        >
                          {busy === `${row.key}-sync` ? "Sincronizando..." : "Sincronizar agora"}
                        </Button>
                      </>
                    )}
                    <Button
                      variant="outline"
                      disabled={busy === `${row.key}-signature`}
                      onClick={() => void saveEmailSignature(row.key)}
                    >
                      {busy === `${row.key}-signature` ? "Salvando..." : "Salvar assinatura"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  className="mt-4"
                  variant={row.connected ? "outline" : "default"}
                  disabled={busy === row.key}
                  onClick={() => void handleRowAction(row)}
                >
                  {rowActionLabel(row)}
                </Button>
              )}
            </div>
          ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <div>
          <h2 className="font-semibold">Adicionar conexão</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Conectores de negócio disponíveis para o tenant. Infraestrutura interna do Vendor.ai não aparece aqui.
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tenantCatalog.slice(0, 18).map((item) => {
            const configured = item.status && !["not_configured", "disabled"].includes(item.status);
            const healthy = item.status === "connected" && Number(item.overallHealthPercent || 0) >= 80;
            return (
              <div key={item.providerKey} className="rounded-xl border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{item.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{(item.capabilities || []).slice(0, 5).join(" · ") || item.category}</p>
                  </div>
                  <span className={healthy ? "text-xs font-semibold text-emerald-600" : configured ? "text-xs font-semibold text-amber-600" : "text-xs font-semibold text-muted-foreground"}>
                    {healthy ? "Conectado" : configured ? "Revisar" : "Disponível"}
                  </span>
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">Autenticação: {item.authType.replaceAll("_", " ")}</p>
                {item.lastErrorMessage && <p className="mt-2 text-xs text-destructive">{item.lastErrorMessage}</p>}
                <Button className="mt-4" variant="outline" onClick={() => toast({
                  title: configured ? `${item.name}: revisar conexão` : `${item.name}: configuração assistida`,
                  description: configured
                    ? "Use o health check da integração para validar autenticação, sincronização e webhooks."
                    : "O conector está catalogado. A conexão só deve ser marcada como ativa depois de autenticação e teste real.",
                })}>
                  {configured ? "Revisar conexão" : "Configurar"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <div>
          <h2 className="font-semibold">Integrações personalizadas</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Para sistemas sem conector nativo, use API direta, webhook ou n8n. Segredos nunca devem ser salvos sem criptografia e teste real.
          </p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            { key: "api" as const, title: "API personalizada", text: "Conecte ERP, sistema legado ou serviço próprio por HTTPS com autenticação segura." },
            { key: "webhook" as const, title: "Webhook", text: "Gere uma URL exclusiva do tenant e valide eventos assinados em tempo real." },
            { key: "n8n" as const, title: "n8n", text: "Conecte uma instância n8n e use workflows para orquestrar sistemas sem conector nativo." },
          ].map((item) => (
            <div key={item.key} className="rounded-xl border bg-background p-4">
              <h3 className="font-semibold">{item.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{item.text}</p>
              <Button className="mt-4" variant="outline" onClick={() => {
                setShowCustomGuide(showCustomGuide === item.key ? null : item.key);
                setLastWebhookSetup(null);
              }}>
                {showCustomGuide === item.key ? "Fechar configuração" : "Configurar"}
              </Button>

              {showCustomGuide === item.key && (
                <div className="mt-4 space-y-3 rounded-lg border bg-muted/30 p-3">
                  <Input value={customDraft.name} onChange={(e) => setCustomDraft((v) => ({ ...v, name: e.target.value }))} placeholder="Nome da conexão" />

                  {item.key !== "webhook" && (
                    <>
                      <Input value={customDraft.baseUrl} onChange={(e) => setCustomDraft((v) => ({ ...v, baseUrl: e.target.value }))} placeholder={item.key === "n8n" ? "https://n8n.suaempresa.com" : "https://api.sistema.com"} />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <select
                          value={customDraft.authType}
                          onChange={(e) => setCustomDraft((v) => ({ ...v, authType: e.target.value as typeof v.authType }))}
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="none">Sem autenticação</option>
                          <option value="api_key">API Key</option>
                          <option value="bearer">Bearer Token</option>
                          <option value="basic">Basic Auth</option>
                        </select>
                        <Input value={customDraft.healthPath} onChange={(e) => setCustomDraft((v) => ({ ...v, healthPath: e.target.value }))} placeholder="/health" />
                      </div>
                      {customDraft.authType === "api_key" && (
                        <Input value={customDraft.apiKeyHeader} onChange={(e) => setCustomDraft((v) => ({ ...v, apiKeyHeader: e.target.value }))} placeholder="Header da API Key, ex.: X-API-Key" />
                      )}
                      {customDraft.authType !== "none" && (
                        <Input type="password" value={customDraft.credential} onChange={(e) => setCustomDraft((v) => ({ ...v, credential: e.target.value }))} placeholder={customDraft.authType === "basic" ? "usuario:senha" : "Credencial"} />
                      )}
                    </>
                  )}

                  {item.key === "webhook" && (
                    <p className="text-xs text-muted-foreground">O Vendor.ai gerará uma URL exclusiva e um segredo. O sistema externo deverá enviar esse segredo no header indicado.</p>
                  )}

                  <Button disabled={busy === `custom-${item.key}`} onClick={() => void createCustomIntegration(item.key)}>
                    {busy === `custom-${item.key}` ? "Salvando..." : item.key === "webhook" ? "Gerar webhook seguro" : "Salvar conexão"}
                  </Button>

                  {item.key === "webhook" && lastWebhookSetup && (
                    <div className="rounded-md border bg-background p-3 text-xs">
                      <p className="font-medium">Copie estes dados agora</p>
                      <p className="mt-2 break-all"><strong>URL:</strong> {window.location.origin}{lastWebhookSetup.path}</p>
                      <p className="mt-2 break-all"><strong>Header:</strong> {lastWebhookSetup.secretHeader}</p>
                      <p className="mt-2 break-all"><strong>Segredo:</strong> {lastWebhookSetup.secret}</p>
                      <p className="mt-2 text-muted-foreground">O segredo não será exibido novamente.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {customIntegrations.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold">Conexões personalizadas salvas</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {customIntegrations.map((connection) => (
                <div key={connection.id} className="rounded-xl border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-semibold">{connection.name}</h4>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {connection.kind.toUpperCase()} {connection.baseUrl ? `· ${connection.baseUrl}` : "· webhook de entrada"}
                      </p>
                    </div>
                    <span className={connection.status === "connected" ? "text-xs font-semibold text-emerald-600" : connection.status === "error" ? "text-xs font-semibold text-red-600" : "text-xs font-semibold text-amber-600"}>
                      {connection.status === "connected" ? "Conectado" : connection.status === "error" ? "Erro" : "Atenção"}
                    </span>
                  </div>
                  {connection.lastError && <p className="mt-3 text-xs text-destructive">{connection.lastError}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="outline" disabled={busy === `custom-test-${connection.id}`} onClick={() => void testCustomIntegration(connection)}>
                      {busy === `custom-test-${connection.id}` ? "Testando..." : "Testar conexão"}
                    </Button>
                    <Button variant="outline" disabled={busy === `custom-delete-${connection.id}`} onClick={() => void removeCustomIntegration(connection)}>
                      Remover
                    </Button>
                  </div>
                  {connection.kind === "webhook" && !connection.lastEventAt && (
                    <p className="mt-3 text-[11px] text-muted-foreground">Aguardando o primeiro evento assinado para confirmar a conexão.</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
