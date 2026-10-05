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
  | "google-ads"
  | "asaas"
  | "zapsign"
  | "search-console"
  | "linkedin"
  | "tiktok"
  | "domain";

type IntegrationRow = {
  key: IntegrationKey;
  label: string;
  description: string;
  connected: boolean;
  attention?: boolean;
  detail?: string;
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
  const [asaasKey, setAsaasKey] = useState("");
  const [zapsignKey, setZapsignKey] = useState("");
  const [emailConnections, setEmailConnections] = useState<Array<{ provider: "google" | "microsoft"; email?: string | null; accountName?: string | null }>>([]);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const [data, emailData] = await Promise.all([
        apiJson("/api/onboarding/integracoes"),
        tenantId ? apiJson(`/api/tenants/${encodeURIComponent(tenantId)}/email-connections`).catch(() => ({ connections: [] })) : Promise.resolve({ connections: [] }),
      ]);
      setStatus(data as IntegrationStatus);
      setEmailConnections(Array.isArray(emailData?.connections) ? emailData.connections : []);
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
      description: "Conexão padrão via QR Code para atendimento e automações.",
      connected: status?.whatsapp?.connected === true,
      detail: status?.whatsapp?.phone || undefined,
    },
    {
      key: "instagram",
      label: "Instagram",
      description: "Mensagens, perfil e conteúdo.",
      connected: status?.instagram?.connected === true,
      detail: status?.instagram?.username ? `@${status.instagram.username.replace(/^@/, "")}` : undefined,
    },
    {
      key: "google-calendar",
      label: "Google Calendar",
      description: "Agenda, compromissos e disponibilidade.",
      connected: status?.googleCalendar?.connected === true,
    },
    {
      key: "email-google",
      label: "Gmail / Google Workspace",
      description: "Caixa de entrada e saída integrada ao CRM e aos agentes.",
      connected: emailConnections.some((connection) => connection.provider === "google"),
      detail: emailConnections.find((connection) => connection.provider === "google")?.email || undefined,
    },
    {
      key: "email-microsoft",
      label: "Microsoft 365 / Outlook",
      description: "E-mail corporativo integrado ao CRM e aos agentes.",
      connected: emailConnections.some((connection) => connection.provider === "microsoft"),
      detail: emailConnections.find((connection) => connection.provider === "microsoft")?.email || undefined,
    },
    {
      key: "google-ads",
      label: "Google Ads",
      description: "Campanhas, mídia e conversões.",
      connected: status?.googleAds?.connected === true && status?.googleAds?.pendingAccountSelection !== true,
      attention: status?.googleAds?.pendingAccountSelection === true,
      detail: status?.googleAds?.pendingAccountSelection ? "Seleção de conta pendente" : status?.googleAds?.descriptiveName || undefined,
    },
    {
      key: "asaas",
      label: "Asaas",
      description: "Cobranças e pagamentos.",
      connected: status?.asaas?.connected === true,
    },
    {
      key: "zapsign",
      label: "ZapSign",
      description: "Assinatura eletrônica de documentos.",
      connected: status?.zapsign?.connected === true,
    },
    {
      key: "search-console",
      label: "Search Console",
      description: "SEO, indexação e desempenho orgânico.",
      connected: status?.searchConsole?.connected === true && status?.searchConsole?.verified === true,
      attention: status?.searchConsole?.connected === true && status?.searchConsole?.verified !== true,
      detail: status?.searchConsole?.connected && !status?.searchConsole?.verified ? "Conta autorizada · falta confirmar a propriedade" : undefined,
    },
    {
      key: "linkedin",
      label: "LinkedIn",
      description: "Publicações, métricas e presença social.",
      connected: status?.social?.linkedin === true,
    },
    {
      key: "tiktok",
      label: "TikTok",
      description: "Publicações, métricas e mídia social.",
      connected: status?.social?.tiktok === true,
    },
    {
      key: "domain",
      label: "Domínio",
      description: "Domínio personalizado do site.",
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
        const provider = key === "email-google" ? "google" : "microsoft";
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

  const syncEmail = async (key: "email-google" | "email-microsoft") => {
    if (!tenantId) return;
    setBusy(`${key}-sync`);
    try {
      const provider = key === "email-google" ? "google" : "microsoft";
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

  const connectedCount = rows.filter((row) => row.connected).length;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 pb-10 sm:px-6">
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Configurações</div>
          <h1 className="mt-1 text-2xl font-bold">Integrações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acesso protegido pela sua sessão de administrador. Não é necessário informar a senha novamente.
          </p>
          {user?.email && <p className="mt-1 text-xs text-muted-foreground">Sessão: {user.email}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.location.assign("/configuracoes")}>Voltar</Button>
          <Button variant="outline" onClick={() => void loadStatus()} disabled={loading}>Atualizar status</Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Saúde das integrações</h2>
            <p className="text-sm text-muted-foreground">
              {loading ? "Verificando conexões..." : `${connectedCount} de ${rows.length} conexões ativas`}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <div key={row.key} className="rounded-xl border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{row.label}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{row.description}</p>
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
              ) : row.connected && (row.key === "email-google" || row.key === "email-microsoft") ? (
                <div className="mt-4 flex flex-wrap gap-2">
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
      </div>
    </div>
  );
}
