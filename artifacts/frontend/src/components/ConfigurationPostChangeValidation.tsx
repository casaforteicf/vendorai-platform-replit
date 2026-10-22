import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ConfigurationChangeKind } from "@/components/ConfigurationImpactSimulator";

export const CONFIGURATION_POST_CHANGE_EVENT = "vendorai:configuration-post-change";

type ValidationStatus = "idle" | "validating" | "ok" | "warning" | "failed" | "manual";

type PostChangeDetail = {
  section?: string;
  changeKind?: ConfigurationChangeKind;
  actionLabel?: string;
};

type ValidationResult = {
  status: Exclude<ValidationStatus, "idle" | "validating">;
  title: string;
  message: string;
  provider?: string;
};

type ConfigurationHealth = {
  overall: "ok" | "warning" | "failed";
  checks: {
    asaas: { status: string; message: string; configured: boolean; reachable: boolean | null };
    zapsign: { status: string; message: string; configured: boolean; reachable: boolean | null };
    stock: { status: string; message: string; configured: boolean; ready: boolean };
    documents: { status: string; message: string; contractRequired: boolean; templateConfigured: boolean };
    commercial: { status: string; message: string; closureType: string };
  };
};

const STATUS_STYLE: Record<ValidationStatus, string> = {
  idle: "border-muted bg-muted/20 text-muted-foreground",
  validating: "border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-300",
  ok: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
  warning: "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-200",
  failed: "border-destructive/30 bg-destructive/5 text-destructive",
  manual: "border-muted bg-muted/20 text-muted-foreground",
};

function tokenHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function providerFromAction(label: string) {
  const normalized = label.toLowerCase();
  if (/google\s*ads|data\s*manager/.test(normalized)) return "google_ads";
  if (/meta\s*ads|facebook\s*ads/.test(normalized)) return "meta_ads";
  if (/search\s*console/.test(normalized)) return "search_console";
  if (/google\s*(calendar|agenda)|calendar\s*google|agenda\s*google/.test(normalized)) return "google_calendar";
  if (/whats\s*app/.test(normalized)) return "whatsapp";
  if (/instagram/.test(normalized)) return "instagram";
  if (/you\s*tube/.test(normalized)) return "youtube";
  if (/linked\s*in/.test(normalized)) return "linkedin";
  if (/tik\s*tok/.test(normalized)) return "tiktok";
  if (/asaas|zapsign|estoque|webhook|contrato|documento|proposta|fechamento|fatur|cobran|pagamento/.test(normalized)) return "configuration_health";
  return null;
}

function providerLabel(provider: string) {
  return ({
    google_ads: "Google Ads",
    meta_ads: "Meta Ads",
    search_console: "Search Console",
    google_calendar: "Google Calendar",
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    youtube: "YouTube",
    linkedin: "LinkedIn",
    tiktok: "TikTok",
    configuration_health: "Configuração crítica",
  } as Record<string, string>)[provider] ?? provider;
}

async function fetchJson(route: string) {
  const response = await fetch(route, { headers: tokenHeaders() });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json() as any;
}

async function readConnection(tenantId: string, provider: string): Promise<Record<string, unknown>> {
  const directRoute = ({
    google_ads: `/api/tenants/${tenantId}/google-ads-connection`,
    meta_ads: `/api/tenants/${tenantId}/meta-ads-connection`,
    search_console: `/api/tenants/${tenantId}/search-console-connection`,
    whatsapp: `/api/tenants/${tenantId}/whatsapp-connection`,
    instagram: `/api/tenants/${tenantId}/instagram-connection`,
  } as Record<string, string>)[provider];

  if (directRoute) return await fetchJson(directRoute) as Record<string, unknown>;

  if (provider === "google_calendar") {
    const agendas = await fetchJson(`/api/tenants/${tenantId}/agendas`) as Array<Record<string, unknown>>;
    const connected = agendas.filter((agenda) => Boolean(agenda.googleCalendarId));
    return {
      connected: connected.length > 0,
      connectedCount: connected.length,
      totalAgendas: agendas.length,
      accounts: connected.map((agenda) => agenda.googleEmail).filter(Boolean),
    };
  }

  if (["youtube", "linkedin", "tiktok"].includes(provider)) {
    const data = await fetchJson(`/api/tenants/${tenantId}/social-connections`) as { connections?: Array<Record<string, unknown>> };
    const connection = data.connections?.find((item) => item.provider === provider);
    return {
      connected: Boolean(connection?.connected),
      accountName: connection?.accountName ?? null,
      configured: connection?.configured ?? null,
    };
  }

  throw new Error("Provider sem teste automático");
}

async function validateConfigurationHealth(tenantId: string, label: string, section?: string): Promise<ValidationResult> {
  const health = await fetchJson(`/api/tenants/${tenantId}/configuration-health`) as ConfigurationHealth;
  const normalized = label.toLowerCase();

  const pick = (() => {
    if (/asaas/.test(normalized)) return { name: "Asaas", ...health.checks.asaas };
    if (/zapsign/.test(normalized)) return { name: "ZapSign", ...health.checks.zapsign };
    if (/estoque|webhook/.test(normalized)) return { name: "Estoque / Webhook", ...health.checks.stock };
    if (/contrato|documento|proposta/.test(normalized) || section === "Documentos") return { name: "Documentos", ...health.checks.documents };
    if (/fechamento|comercial/.test(normalized)) return { name: "Comercial", ...health.checks.commercial };
    return null;
  })();

  if (pick) {
    const nextStatus: ValidationResult["status"] = pick.status === "ok" ? "ok" : pick.status === "failed" ? "failed" : "warning";
    return {
      status: nextStatus,
      title: `${pick.name}: ${nextStatus === "ok" ? "configuração validada" : nextStatus === "failed" ? "correção necessária" : "revisão recomendada"}`,
      message: pick.message,
      provider: pick.name,
    };
  }

  const problems = Object.entries(health.checks)
    .filter(([, value]) => value.status === "failed")
    .map(([key]) => key);
  const warnings = Object.entries(health.checks)
    .filter(([, value]) => value.status === "warning" || value.status === "not_configured")
    .map(([key]) => key);

  if (health.overall === "failed") {
    return {
      status: "failed",
      title: "A configuração crítica ainda possui pendências",
      message: `Falhas detectadas em: ${problems.join(", ") || "configuração crítica"}. Corrija antes de considerar a mudança concluída.`,
      provider: "Saúde da configuração",
    };
  }
  if (health.overall === "warning") {
    return {
      status: "warning",
      title: "Configuração salva com pontos de atenção",
      message: `Itens opcionais ou incompletos: ${warnings.join(", ") || "configuração crítica"}. O fluxo principal foi preservado, mas vale revisar esses pontos.`,
      provider: "Saúde da configuração",
    };
  }
  return {
    status: "ok",
    title: "Configuração crítica validada",
    message: "Pagamentos, documentos, regra comercial e integração de estoque estão coerentes com a configuração persistida.",
    provider: "Saúde da configuração",
  };
}

async function validateIntegration(
  tenantId: string,
  provider: string,
  changeKind: ConfigurationChangeKind,
): Promise<ValidationResult> {
  const data = await readConnection(tenantId, provider);
  const connected = Boolean(data.connected);
  const expectedDisconnected = changeKind === "desconectar";
  const label = providerLabel(provider);

  if (expectedDisconnected) {
    if (!connected) {
      return {
        status: "ok",
        title: `${label} desconectado conforme esperado`,
        message: "A leitura pós-mudança confirmou que a conexão foi removida.",
        provider: label,
      };
    }

    if (provider === "google_calendar" && Number(data.totalAgendas ?? 0) > 1) {
      return {
        status: "warning",
        title: "Ainda existem agendas conectadas ao Google Calendar",
        message: `${Number(data.connectedCount ?? 0)} agenda(s) continuam conectadas. Isso pode ser esperado quando apenas uma agenda foi desconectada; confirme a agenda alterada.`,
        provider: label,
      };
    }

    return {
      status: "failed",
      title: `${label} ainda aparece conectado`,
      message: "A desconexão foi executada, mas a leitura de estado ainda indica conexão ativa. Revise antes de continuar.",
      provider: label,
    };
  }

  if (!connected) {
    const configuredHint = data.configured === false
      ? " O provider também aparece como não configurado no servidor."
      : "";
    return {
      status: "failed",
      title: `${label} não confirmou conexão ativa`,
      message: `A validação pós-mudança encontrou a integração desconectada. Revise credenciais, permissões e a ação executada.${configuredHint}`,
      provider: label,
    };
  }

  if (Boolean(data.pendingAccountSelection)) {
    return {
      status: "warning",
      title: `${label} conectado, aguardando seleção de conta`,
      message: "A autenticação está válida, mas a integração ainda não está totalmente operacional até selecionar a conta correta.",
      provider: label,
    };
  }

  if (provider === "search_console" && data.verified === false) {
    return {
      status: "warning",
      title: "Search Console conectado, verificação pendente",
      message: "A conta Google já está autorizada. Aguarde de 2 a 5 minutos e clique em “Verificar agora”. Não é necessário reconectar a conta.",
      provider: label,
    };
  }

  if (provider === "google_calendar" && Number(data.connectedCount ?? 0) > 1) {
    return {
      status: "ok",
      title: `Google Calendar operacional em ${Number(data.connectedCount)} agendas`,
      message: "A leitura pós-mudança confirmou que há agendas com calendário Google vinculado.",
      provider: label,
    };
  }

  return {
    status: "ok",
    title: `${label} respondeu corretamente após a mudança`,
    message: "O estado da integração foi relido no backend e permanece coerente com a alteração executada.",
    provider: label,
  };
}

export function ConfigurationPostChangeValidation() {
  const { user } = useAuth();
  const [detail, setDetail] = useState<PostChangeDetail | null>(null);
  const [status, setStatus] = useState<ValidationStatus>("idle");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const runValidation = async (nextDetail: PostChangeDetail) => {
    setDetail(nextDetail);
    setResult(null);
    setCheckedAt(null);
    setStatus("validating");

    await new Promise((resolve) => window.setTimeout(resolve, 1800));

    const label = nextDetail.actionLabel?.trim() || "Alteração crítica";
    const provider = providerFromAction(label);
    const tenantId = user?.tenantId;
    const changeKind = nextDetail.changeKind ?? "editar";
    const shouldUseHealth = provider === "configuration_health" || (!provider && ["Documentos", "Faturamento", "Integrações"].includes(nextDetail.section ?? ""));

    if (!tenantId) {
      const manualResult: ValidationResult = {
        status: "manual",
        title: "Alteração concluída; tenant não identificado para validação",
        message: "A mudança foi executada, mas não foi possível reler o estado do tenant nesta sessão.",
      };
      setStatus(manualResult.status);
      setResult(manualResult);
      setCheckedAt(new Date());
      return;
    }

    try {
      const nextResult = shouldUseHealth
        ? await validateConfigurationHealth(tenantId, label, nextDetail.section)
        : provider
          ? await validateIntegration(tenantId, provider, changeKind)
          : {
              status: "manual" as const,
              title: "Alteração concluída; validação funcional necessária",
              message: "Esta ação não possui teste automático específico. Confira o módulo dependente e o Histórico de Configurações.",
            };
      setStatus(nextResult.status);
      setResult(nextResult);
    } catch (error) {
      setStatus("failed");
      setResult({
        status: "failed",
        title: "Não foi possível confirmar o estado pós-mudança",
        message: error instanceof Error
          ? `A leitura automática falhou (${error.message}). Revise a integração manualmente antes de seguir.`
          : "A leitura automática falhou. Revise a integração manualmente antes de seguir.",
      });
    } finally {
      setCheckedAt(new Date());
    }
  };

  useEffect(() => {
    const listener = (event: Event) => {
      const nextDetail = (event as CustomEvent<PostChangeDetail>).detail ?? {};
      void runValidation(nextDetail);
    };
    window.addEventListener(CONFIGURATION_POST_CHANGE_EVENT, listener as EventListener);
    return () => window.removeEventListener(CONFIGURATION_POST_CHANGE_EVENT, listener as EventListener);
  }, [user?.tenantId]);

  const statusLabel = useMemo(() => ({
    idle: "Sem validação",
    validating: "Validando",
    ok: "Confirmado",
    warning: "Atenção",
    failed: "Falha",
    manual: "Revisão manual",
  } as Record<ValidationStatus, string>)[status], [status]);

  if (!detail && status === "idle") return null;

  return (
    <section className={`mb-4 rounded-xl border p-3 sm:p-4 ${STATUS_STYLE[status]}`} aria-label="Validação pós-mudança de configurações">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2.5">
          {status === "validating" ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin" /> :
            status === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4" /> :
            status === "failed" ? <XCircle className="mt-0.5 h-4 w-4" /> :
            status === "warning" ? <AlertTriangle className="mt-0.5 h-4 w-4" /> :
            <ShieldCheck className="mt-0.5 h-4 w-4" />}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm">Validação pós-mudança</strong>
              <Badge variant="outline" className="text-[10px]">{statusLabel}</Badge>
              {result?.provider && <Badge variant="secondary" className="text-[10px]">{result.provider}</Badge>}
            </div>
            <p className="mt-1 text-xs font-medium">{result?.title || "Verificando se a mudança crítica permaneceu operacional..."}</p>
            <p className="mt-1 text-xs leading-5 opacity-80">{result?.message || `Ação: ${detail?.actionLabel || "alteração crítica"}`}</p>
            {checkedAt && <p className="mt-1 text-[10px] opacity-70">Verificado às {checkedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>}
          </div>
        </div>
        {detail && status !== "validating" && (
          <Button type="button" variant="outline" size="sm" onClick={() => void runValidation(detail)}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Validar novamente
          </Button>
        )}
      </div>
    </section>
  );
}
