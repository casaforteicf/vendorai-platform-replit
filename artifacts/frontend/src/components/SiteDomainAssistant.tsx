import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Globe2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type DomainStatus = "pending_dns" | "pending_ssl" | "active" | "failed";
type DomainRow = {
  id: string;
  domain: string;
  status: DomainStatus;
  dnsRecordName?: string | null;
  dnsRecordValue?: string | null;
};

type DomainsResponse = {
  domains?: DomainRow[];
  subdomainUrl?: string | null;
};

type WebsiteConnection = {
  effectiveUrl?: string | null;
  hostname?: string | null;
  platform?: string | null;
  status?: "connected_native" | "detected_needs_auth" | "not_configured";
  canPublish?: boolean;
};

type WebsiteConnectionResponse = {
  connection?: WebsiteConnection | null;
};

type GeneratedSiteSummary = {
  id: string;
  name?: string | null;
  siteType?: string | null;
  published?: boolean;
  siteSlug?: string | null;
};

type DnsCheck = {
  checked?: boolean;
  matches?: boolean;
  expected?: string | null;
  answers?: string[];
  error?: string | null;
};

type DomainStatusResponse = {
  domain: DomainRow;
  dnsInstructions?: { recordType?: string; name?: string | null; value?: string | null };
  dnsCheck?: DnsCheck;
  provisioningAvailable?: boolean;
  infrastructure?: {
    apiConfigured?: boolean;
    originConfigured?: boolean;
    ready?: boolean;
  };
  cloudflareStatus?: string | null;
  cloudflareSslStatus?: string | null;
  message?: string;
};

type ProviderKey = "registro_br" | "cloudflare" | "hostinger" | "godaddy" | "locaweb" | "other";

const PROVIDERS: Record<ProviderKey, { label: string; url: string; steps: string[] }> = {
  registro_br: {
    label: "Registro.br",
    url: "https://registro.br/",
    steps: [
      "Abra o domínio no Registro.br e entre em DNS → Editar Zona.",
      "Adicione um registro CNAME. No campo Nome/Host use o prefixo mostrado pelo VendorAI (ex.: www ou lp) e no Destino cole o endereço informado.",
      "Salve a zona e volte ao VendorAI para verificar a propagação.",
    ],
  },
  cloudflare: {
    label: "Cloudflare",
    url: "https://dash.cloudflare.com/",
    steps: [
      "Abra o domínio no Cloudflare e acesse DNS → Records.",
      "Crie um CNAME com o nome e o destino exibidos pelo VendorAI. Não altere os nameservers do domínio só por causa desta LP.",
      "Salve e use Verificar DNS no VendorAI. O SSL só será marcado como ativo quando a infraestrutura confirmar a emissão.",
    ],
  },
  hostinger: {
    label: "Hostinger",
    url: "https://hpanel.hostinger.com/",
    steps: [
      "No hPanel, abra Domínios → Editor de Zona DNS.",
      "Adicione um CNAME com o host/nome e o destino informados pelo VendorAI.",
      "Salve e volte para Verificar DNS. Não remova registros do site ou e-mail existentes.",
    ],
  },
  godaddy: {
    label: "GoDaddy",
    url: "https://dcc.godaddy.com/",
    steps: [
      "Abra o domínio e escolha Gerenciar DNS.",
      "Adicione um CNAME usando o nome e o valor informados pelo VendorAI.",
      "Salve e verifique a propagação no VendorAI.",
    ],
  },
  locaweb: {
    label: "Locaweb",
    url: "https://painel.locaweb.com.br/",
    steps: [
      "Abra o domínio no painel Locaweb e entre na Zona de DNS.",
      "Crie um CNAME com o nome e o destino exibidos pelo VendorAI.",
      "Salve e use Verificar DNS. Preserve os demais registros do domínio.",
    ],
  },
  other: {
    label: "Outro provedor",
    url: "",
    steps: [
      "Abra o painel onde o DNS do domínio é administrado.",
      "Crie um registro CNAME usando exatamente o nome e o destino mostrados pelo VendorAI.",
      "Não troque nameservers nem apague registros existentes. Depois volte e clique em Verificar DNS.",
    ],
  },
};

const STATUS_LABEL: Record<DomainStatus, string> = {
  pending_dns: "Aguardando DNS",
  pending_ssl: "DNS OK · aguardando SSL",
  active: "Ativo",
  failed: "Erro",
};

function authHeaders(json = false) {
  const token = localStorage.getItem("vendorai_token");
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function suggestLpDomain(connection: WebsiteConnection | null): string {
  const raw = connection?.hostname || (() => {
    try { return connection?.effectiveUrl ? new URL(connection.effectiveUrl).hostname : ""; } catch { return ""; }
  })();
  const hostname = String(raw ?? "").toLowerCase().replace(/^www\./, "");
  if (!hostname || hostname.endsWith(".appvendorai.com")) return "";
  return `lp.${hostname}`;
}

function isRegistroBrApex(domain: string): boolean {
  const labels = domain.toLowerCase().split(".").filter(Boolean);
  if (!domain.toLowerCase().endsWith(".br")) return false;
  // A maioria dos domínios do Registro.br usa <nome>.<categoria>.br.
  // Nesse caso 3 labels representam a raiz (ex.: empresa.com.br), que não
  // deve receber CNAME. Para o fluxo automático usamos www/lp/site.
  return labels.length <= 3;
}

function registroBrRecordName(fqdn: string): string {
  const labels = fqdn.toLowerCase().split(".").filter(Boolean);
  if (fqdn.toLowerCase().endsWith(".br") && labels.length > 3) {
    return labels.slice(0, -3).join(".");
  }
  return fqdn;
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export function SiteDomainAssistant({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const [provider, setProvider] = useState<ProviderKey>("registro_br");
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [sites, setSites] = useState<GeneratedSiteSummary[]>([]);
  const [connection, setConnection] = useState<WebsiteConnection | null>(null);
  const [statusById, setStatusById] = useState<Record<string, DomainStatusResponse>>({});
  const [domainInput, setDomainInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const selectedProvider = PROVIDERS[provider];
  const suggested = useMemo(() => suggestLpDomain(connection), [connection]);
  const publishedSites = useMemo(
    () => sites.filter((site) => site.published && site.siteSlug),
    [sites],
  );

  async function load() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [domainsRes, connectionRes, sitesRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/domains`, { headers: authHeaders(), cache: "no-store" }),
        fetch(`/api/tenants/${tenantId}/content-autopilot/website-connection`, { headers: authHeaders(), cache: "no-store" }),
        fetch(`/api/tenants/${tenantId}/site-generator?includeHtml=0`, { headers: authHeaders(), cache: "no-store" }),
      ]);
      const domainsBody = await domainsRes.json().catch(() => ({})) as DomainsResponse;
      const connectionBody = await connectionRes.json().catch(() => ({})) as WebsiteConnectionResponse;
      const sitesBody = await sitesRes.json().catch(() => ([])) as GeneratedSiteSummary[];
      if (!domainsRes.ok) throw new Error("Não foi possível carregar os domínios deste cliente.");
      const resolvedConnection = connectionRes.ok ? connectionBody.connection ?? null : null;
      setDomains(Array.isArray(domainsBody.domains) ? domainsBody.domains : []);
      setSites(sitesRes.ok && Array.isArray(sitesBody) ? sitesBody : []);
      setConnection(resolvedConnection);
      if (!domainInput && resolvedConnection) {
        const next = suggestLpDomain(resolvedConnection);
        if (next) setDomainInput(next);
      }
    } catch (error) {
      toast({
        title: "Não foi possível carregar Domínio & DNS",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [tenantId]);

  async function registerDomain() {
    const domain = domainInput.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!domain) return;
    if (provider === "registro_br" && isRegistroBrApex(domain)) {
      const suggestedDomain = `www.${domain}`;
      toast({
        title: "Use www ou outro subdomínio",
        description: `No DNS do Registro.br, o fluxo automático usa CNAME e não deve ser aplicado na raiz. Cadastre ${suggestedDomain}, site.${domain} ou lp.${domain}.`,
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/domains`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ domain }),
      });
      const body = await response.json().catch(() => ({})) as DomainRow & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível registrar o domínio.");
      setDomainInput("");
      toast({ title: "Domínio adicionado", description: "Agora configure somente o CNAME indicado. O VendorAI verificará DNS e SSL." });
      await load();
    } catch (error) {
      toast({ title: "Não foi possível adicionar o domínio", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function verify(domain: DomainRow) {
    setCheckingId(domain.id);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/domains/${domain.id}/verify`, {
        method: "POST",
        headers: authHeaders(true),
      });
      const body = await response.json().catch(() => ({})) as DomainStatusResponse & { error?: string };
      if (!response.ok && !body.dnsCheck) throw new Error(body.error ?? "Não foi possível verificar o domínio.");
      setStatusById((current) => ({ ...current, [domain.id]: body }));
      setDomains((current) => current.map((item) => item.id === domain.id && body.domain ? body.domain : item));
      if (body.domain?.status === "active") {
        toast({ title: "Domínio ativo", description: `${domain.domain} está com DNS e SSL confirmados.` });
      } else if (body.dnsCheck?.matches) {
        toast({ title: "DNS encontrado", description: "O CNAME está correto. Agora aguardamos a confirmação do SSL/provisionamento." });
      } else {
        toast({ title: "DNS ainda não encontrado", description: "Confira o CNAME abaixo. A propagação também pode levar algum tempo." });
      }
    } catch (error) {
      toast({ title: "Falha ao verificar DNS", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setCheckingId(null);
    }
  }

  if (!tenantId) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Globe2 className="h-4 w-4 text-primary" />Domínio & publicação automática</CardTitle>
        <p className="text-sm text-muted-foreground">O VendorAI orienta a configuração, verifica o CNAME e só considera a publicação pronta quando DNS e SSL estiverem confirmados.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando destino e domínios...</div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Site atual do cliente</p>
                <p className="mt-2 break-all text-sm font-semibold">{connection?.effectiveUrl || "Nenhum site identificado"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{connection?.platform ? `Plataforma: ${connection.platform}` : "O Website Connector usa os dados do tenant."}</p>
                {connection?.status === "detected_needs_auth" && <Badge variant="secondary" className="mt-2">CMS externo · autenticação necessária</Badge>}
                {connection?.canPublish && <Badge className="mt-2">Publicação nativa disponível</Badge>}
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Regra de DNS</p>
                <p className="mt-2 text-sm">Para hospedar o site no VendorAI sem mexer no e-mail ou nos demais serviços, use <strong>www</strong> ou um subdomínio dedicado, como <strong>{suggested || "www.suaempresa.com.br"}</strong>.</p>
                <p className="mt-2 text-xs text-muted-foreground">No Registro.br, não usamos CNAME na raiz do domínio. Não trocamos nameservers e não apagamos MX, SPF, DKIM ou outros registros existentes.</p>
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="grid gap-3 lg:grid-cols-[1fr_220px_auto] lg:items-end">
                <div>
                  <Label>Domínio personalizado do site</Label>
                  <Input className="mt-1" value={domainInput} onChange={(event) => setDomainInput(event.target.value)} placeholder={suggested || "www.suaempresa.com.br"} />
                </div>
                <div>
                  <Label>Onde seu DNS é gerenciado?</Label>
                  <Select value={provider} onValueChange={(value) => setProvider(value as ProviderKey)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(PROVIDERS).map(([key, item]) => <SelectItem key={key} value={key}>{item.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button onClick={() => void registerDomain()} disabled={saving || !domainInput.trim()}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Preparar domínio</Button>
              </div>
              <div className="mt-3 rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
                <strong className="text-foreground">Como será:</strong> preparar domínio → criar 1 CNAME → verificar DNS → emitir/confirmar SSL → liberar publicação automática.
              </div>
            </div>

            {domains.length === 0 ? (
              <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Nenhum domínio personalizado preparado ainda. O site existente continua funcionando normalmente.</div>
            ) : (
              <div className="space-y-4">
                {domains.map((domain) => {
                  const live = statusById[domain.id];
                  const recordName = live?.dnsInstructions?.name ?? domain.dnsRecordName ?? domain.domain;
                  const recordValue = live?.dnsInstructions?.value ?? domain.dnsRecordValue ?? "";
                  const dnsCheck = live?.dnsCheck;
                  const status = live?.domain?.status ?? domain.status;
                  const displayedRecordName = provider === "registro_br"
                    ? registroBrRecordName(String(recordName))
                    : String(recordName);
                  return (
                    <div key={domain.id} className="rounded-xl border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{domain.domain}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Badge variant={status === "active" ? "default" : "secondary"}>{STATUS_LABEL[status]}</Badge>
                            {dnsCheck?.matches && <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3.5 w-3.5" />CNAME encontrado</span>}
                            {dnsCheck?.checked && !dnsCheck.matches && <span className="inline-flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="h-3.5 w-3.5" />Aguardando propagação</span>}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => void verify(domain)} disabled={checkingId === domain.id}>{checkingId === domain.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Verificar DNS agora</Button>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-lg border bg-muted/20 p-3">
                          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Tipo / Nome</p>
                          <div className="mt-1 flex items-center gap-2"><code className="min-w-0 flex-1 break-all text-xs">CNAME · {displayedRecordName}</code><Button size="icon" variant="ghost" onClick={() => void copyText(displayedRecordName).then(() => toast({ title: "Nome copiado" }))}><Copy className="h-3.5 w-3.5" /></Button></div>
                          {provider === "registro_br" && displayedRecordName !== recordName && <p className="mt-1 text-[11px] text-muted-foreground">Zona completa: {recordName}</p>}
                        </div>
                        <div className="rounded-lg border bg-muted/20 p-3">
                          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Destino</p>
                          <div className="mt-1 flex items-center gap-2"><code className="min-w-0 flex-1 break-all text-xs">{recordValue || "Preparando destino..."}</code>{recordValue && <Button size="icon" variant="ghost" onClick={() => void copyText(recordValue).then(() => toast({ title: "Destino copiado" }))}><Copy className="h-3.5 w-3.5" /></Button>}</div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-lg border border-primary/15 bg-primary/5 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold">Passo a passo — {selectedProvider.label}</p>
                          {selectedProvider.url && <a href={selectedProvider.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Abrir painel {selectedProvider.label}<ExternalLink className="h-3 w-3" /></a>}
                        </div>
                        <ol className="mt-2 space-y-1 text-xs text-muted-foreground">{selectedProvider.steps.map((step, index) => <li key={step}>{index + 1}. {step}</li>)}</ol>
                      </div>

                      {dnsCheck?.error && <p className="mt-2 text-xs text-destructive">Verificação DNS: {dnsCheck.error}</p>}
                      {live?.infrastructure?.originConfigured === false && <p className="mt-2 text-xs text-amber-700">A infraestrutura ainda não definiu o destino CNAME do VendorAI. Não altere o DNS até aparecer um Destino válido acima.</p>}
                      {live && live.provisioningAvailable === false && dnsCheck?.matches && <p className="mt-2 text-xs text-amber-700">O CNAME está correto, mas o provisionamento de hostname/SSL do VendorAI ainda não está disponível neste ambiente. Por segurança, a publicação continua bloqueada.</p>}
                      {status === "active" && (
                        <div className="mt-3 space-y-2 rounded-lg border border-green-200 bg-green-50/60 p-3 dark:border-green-900/40 dark:bg-green-950/20">
                          <p className="text-xs font-semibold text-green-800 dark:text-green-300">DNS + SSL confirmados · publicação automática liberada</p>
                          <p className="text-xs text-muted-foreground">A raiz <strong>https://{domain.domain}</strong> abre a página publicada mais recente. Cada site/LP publicado também recebe um endereço próprio neste domínio.</p>
                          {publishedSites.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Ainda não há site ou LP publicado. Gere o conteúdo e clique em Publicar no Gerador de Sites.</p>
                          ) : (
                            <div className="space-y-1.5 pt-1">
                              {publishedSites.map((site) => {
                                const url = `https://${domain.domain}/${site.siteSlug}`;
                                return (
                                  <div key={`${domain.id}-${site.id}`} className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-2.5 py-2 text-xs">
                                    <span className="min-w-0 flex-1 truncate"><strong>{site.name || site.siteSlug}</strong> · {url}</span>
                                    <Button size="icon" variant="ghost" onClick={() => void copyText(url).then(() => toast({ title: "URL copiada" }))}><Copy className="h-3.5 w-3.5" /></Button>
                                    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Abrir<ExternalLink className="h-3 w-3" /></a>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default SiteDomainAssistant;
