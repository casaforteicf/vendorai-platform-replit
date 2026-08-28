from __future__ import annotations

import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Trecho não encontrado: {label}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# OAuth state: permite retornar ao onboarding sem quebrar fluxos existentes.
# ---------------------------------------------------------------------------
p = "artifacts/api-server/src/lib/oauth-state.ts"
s = read(p)
s = replace_once(
    s,
    "  provider: OAuthProvider;\n  nonce: string;",
    "  provider: OAuthProvider;\n  returnTo?: string;\n  nonce: string;",
    "oauth payload returnTo",
)
s = replace_once(
    s,
    "  provider: OAuthProvider,\n): string {",
    "  provider: OAuthProvider,\n  returnTo?: string,\n): string {",
    "oauth create returnTo arg",
)
s = replace_once(
    s,
    "    provider,\n    nonce: randomBytes(24).toString(\"base64url\"),",
    "    provider,\n    ...(returnTo ? { returnTo } : {}),\n    nonce: randomBytes(24).toString(\"base64url\"),",
    "oauth payload returnTo set",
)
write(p, s)


# ---------------------------------------------------------------------------
# Google Ads OAuth: returnTo assinado, onboarding e configurações coexistem.
# ---------------------------------------------------------------------------
p = "artifacts/api-server/src/routes/google-ads-auth.ts"
s = read(p)
s = replace_once(
    s,
    '    const state = createOAuthState(tenantId, userId, "google-ads");',
    '    const requestedReturnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : "";\n'
    '    const returnTo = requestedReturnTo === "/onboarding/integracoes" ? requestedReturnTo : "/configuracoes";\n'
    '    const state = createOAuthState(tenantId, userId, "google-ads", returnTo);',
    "google ads auth returnTo",
)
s = replace_once(
    s,
    '  const appUrl = getAppUrl();\n\n  if (error || !code || !state) {',
    '  const appUrl = getAppUrl();\n  let returnTo = "/configuracoes";\n\n  if (error || !code || !state) {',
    "google ads callback returnTo default",
)
s = replace_once(
    s,
    '    tenantId = decoded.tenantId;',
    '    tenantId = decoded.tenantId;\n    if (decoded.returnTo === "/onboarding/integracoes") returnTo = decoded.returnTo;',
    "google ads decoded returnTo",
)
s = s.replace('${appUrl}/configuracoes?googleAds', '${appUrl}${returnTo}?googleAds')
write(p, s)


# ---------------------------------------------------------------------------
# Onboarding backend: Google Ads entra no status real e suporta 6 etapas.
# ---------------------------------------------------------------------------
p = "artifacts/api-server/src/routes/onboarding.ts"
s = read(p)
s = replace_once(
    s,
    'import { encrypt } from "../lib/crypto.js";\n',
    'import { encrypt } from "../lib/crypto.js";\nimport { getGoogleAdsConnectionByTenantId } from "../services/google-ads-oauth.js";\n',
    "onboarding google ads import",
)
s = replace_once(
    s,
    '''  const [gcAgenda] = await db
    .select({ id: agendasTable.id, googleCalendarId: agendasTable.googleCalendarId })
    .from(agendasTable)
    .where(and(eq(agendasTable.tenantId, tenantId)));

  const [tenantData] = await db''',
    '''  const [gcAgenda] = await db
    .select({ id: agendasTable.id, googleCalendarId: agendasTable.googleCalendarId })
    .from(agendasTable)
    .where(and(eq(agendasTable.tenantId, tenantId)));

  const googleAdsConn = await getGoogleAdsConnectionByTenantId(tenantId);

  const [tenantData] = await db''',
    "onboarding google ads status query",
)
s = replace_once(
    s,
    '''    instagram: {
      connected: !!igConn?.username,
      username: igConn?.username ?? null,
    },
    asaas: { connected: !!tenantData?.asaasApiKey },''',
    '''    instagram: {
      connected: !!igConn?.username,
      username: igConn?.username ?? null,
    },
    googleAds: {
      connected: !!googleAdsConn && googleAdsConn.status !== "disconnected" && !googleAdsConn.disconnectedAt,
      pendingAccountSelection: googleAdsConn?.status === "pending_account_selection",
      customerId: googleAdsConn?.customerId ?? null,
      descriptiveName: googleAdsConn?.descriptiveName ?? null,
    },
    asaas: { connected: !!tenantData?.asaasApiKey },''',
    "onboarding google ads status response",
)
s = replace_once(
    s,
    'const { step } = z.object({ step: z.number().int().min(0).max(5) }).parse(req.body);',
    'const { step } = z.object({ step: z.number().int().min(0).max(6) }).parse(req.body);',
    "onboarding integration step max",
)
write(p, s)


# ---------------------------------------------------------------------------
# Onboarding frontend: Google Ads real, com seleção de conta quando necessário.
# ---------------------------------------------------------------------------
p = "artifacts/frontend/src/pages/OnboardingIntegracoes.tsx"
s = read(p)
s = replace_once(
    s,
    "  Instagram,\n  CreditCard,",
    "  Instagram,\n  Megaphone,\n  CreditCard,",
    "onboarding megaphone import",
)
s = replace_once(
    s,
    '''  instagram: { connected: boolean; username: string | null };
  asaas: { connected: boolean };''',
    '''  instagram: { connected: boolean; username: string | null };
  googleAds: { connected: boolean; pendingAccountSelection: boolean; customerId: string | null; descriptiveName: string | null };
  asaas: { connected: boolean };''',
    "onboarding status type google ads",
)
s = replace_once(
    s,
    'type StepKey = "whatsapp" | "googleCalendar" | "instagram" | "asaas" | "zapsign";',
    'type StepKey = "whatsapp" | "googleCalendar" | "instagram" | "googleAds" | "asaas" | "zapsign";\n\ntype GoogleAdsAccount = { customerId: string; descriptiveName?: string | null };',
    "onboarding step type google ads",
)
s = replace_once(
    s,
    '''  { key: "instagram",     label: "Instagram",       shortLabel: "Instagram" },
  { key: "asaas",         label: "Asaas",           shortLabel: "Asaas" },''',
    '''  { key: "instagram",     label: "Instagram",       shortLabel: "Instagram" },
  { key: "googleAds",     label: "Google Ads",      shortLabel: "Ads" },
  { key: "asaas",         label: "Asaas",           shortLabel: "Asaas" },''',
    "onboarding steps google ads",
)
s = replace_once(
    s,
    '  const [zapsignKey, setZapsignKey] = useState("");\n',
    '  const [zapsignKey, setZapsignKey] = useState("");\n  const [googleAdsAccounts, setGoogleAdsAccounts] = useState<GoogleAdsAccount[]>([]);\n  const [selectedGoogleAdsAccount, setSelectedGoogleAdsAccount] = useState("");\n',
    "onboarding google ads account states",
)
s = replace_once(
    s,
    '''    if (urlParams.get("googleError")) {
      toast({ title: "Erro ao conectar Google Calendar.", variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (urlParams.get("whatsappConnected") === "1") {''',
    '''    if (urlParams.get("googleError")) {
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
    if (urlParams.get("whatsappConnected") === "1") {''',
    "onboarding google ads callback messages",
)
s = replace_once(
    s,
    '''        setStatus(data);
        setStep(data.step ?? 0);''',
    '''        setStatus(data);
        setStep(data.step ?? 0);
        if (data.googleAds?.pendingAccountSelection) void loadGoogleAdsAccounts();''',
    "onboarding load google ads accounts",
)
s = replace_once(
    s,
    '''        setStatus({ step: 0, concluido: false, whatsapp: { connected: false, phone: null }, googleCalendar: { connected: false, agendaId: null }, instagram: { connected: false, username: null }, asaas: { connected: false }, zapsign: { connected: false } });''',
    '''        setStatus({ step: 0, concluido: false, whatsapp: { connected: false, phone: null }, googleCalendar: { connected: false, agendaId: null }, instagram: { connected: false, username: null }, googleAds: { connected: false, pendingAccountSelection: false, customerId: null, descriptiveName: null }, asaas: { connected: false }, zapsign: { connected: false } });''',
    "onboarding fallback google ads",
)
s = replace_once(
    s,
    '''  async function connectInstagram() {
    try {
      const data = await apiFetch("/api/auth/instagram") as { url: string };
      window.location.href = data.url;
    } catch {
      toast({ title: "Erro ao iniciar conexão Instagram.", variant: "destructive" });
    }
  }

  async function validateAsaas() {''',
    '''  async function connectInstagram() {
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

  async function validateAsaas() {''',
    "onboarding google ads functions",
)
# Shift existing Asaas/ZapSign rendered steps.
s = s.replace("{/* STEP 3 — Asaas */}\n          {step === 3 && (", "{/* STEP 4 — Asaas */}\n          {step === 4 && (", 1)
s = s.replace("{/* STEP 4 — ZapSign */}\n          {step === 4 && (", "{/* STEP 5 — ZapSign */}\n          {step === 5 && (", 1)
# Insert Google Ads step immediately before Asaas.
marker = '''          {/* STEP 4 — Asaas */}
          {step === 4 && ('''
google_ads_step = '''          {/* STEP 3 — Google Ads */}
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

'''
if marker not in s:
    raise RuntimeError("Trecho não encontrado: inserir step Google Ads")
s = s.replace(marker, google_ads_step + marker, 1)
s = replace_once(
    s,
    '''                    : s.key === "instagram" ? status.instagram.connected
                    : s.key === "asaas" ? status.asaas.connected''',
    '''                    : s.key === "instagram" ? status.instagram.connected
                    : s.key === "googleAds" ? status.googleAds.connected && !status.googleAds.pendingAccountSelection
                    : s.key === "asaas" ? status.asaas.connected''',
    "onboarding done google ads",
)
s = replace_once(
    s,
    'As integrações puladas podem ser configuradas depois em <strong>Configurações → Integrações</strong>',
    'As integrações puladas podem ser retomadas depois pelo fluxo de integrações do perfil',
    "onboarding integrations copy",
)
write(p, s)


# ---------------------------------------------------------------------------
# Gerador real -> Anúncios: envia a variação selecionada como criativo real.
# ---------------------------------------------------------------------------
p = "artifacts/frontend/src/pages/Content.tsx"
s = read(p)
s = replace_once(
    s,
    '  Pencil, Check, X, Wand2, Download, Archive, Eye, RefreshCw,\n',
    '  Pencil, Check, X, Wand2, Download, Archive, Eye, RefreshCw, Megaphone,\n',
    "content megaphone import",
)
s = replace_once(
    s,
    '  const qc = useQueryClient();\n\n  const effectiveVariation =',
    '  const qc = useQueryClient();\n  const [, setLocation] = useLocation();\n\n  const effectiveVariation =',
    "variation navigation hook",
)
insert_after = '''  const captionOverride: string | undefined = (() => {
    if (!hasEdits) return undefined;
    if (type === "feed") {
      const v = displayVariation as FeedVariation;
      return `${v.caption}\n\n${v.hashtags.join(" ")}`;
    }
    return undefined;
  })();
'''
promote_fn = insert_after + '''

  function sendToSponsoredAds() {
    if (!contentId) return;

    let headlines: string[] = [];
    let descriptions: string[] = [];
    let imagens: string[] = [];

    if (type === "feed") {
      const v = displayVariation as FeedVariation;
      headlines = [(theme || v.caption || "Conteúdo patrocinado").slice(0, 80)];
      descriptions = [`${v.caption}${v.hashtags.length ? `\n\n${v.hashtags.join(" ")}` : ""}`];
      imagens = v.imageUrls?.length ? v.imageUrls : v.imageUrl ? [v.imageUrl] : [];
    } else if (type === "stories") {
      const v = displayVariation as StoriesVariation;
      headlines = [(theme || v.text || "Story patrocinado").slice(0, 80)];
      descriptions = [`${v.text}${v.cta ? `\n\nCTA: ${v.cta}` : ""}`];
      imagens = v.imageUrls?.length ? v.imageUrls : v.imageUrl ? [v.imageUrl] : [];
    } else {
      const v = displayVariation as ReelsVariation;
      headlines = [(v.title || theme || "Reel patrocinado").slice(0, 80)];
      descriptions = [
        [...v.scenes.map((scene) => scene.fala).filter(Boolean), v.cta].filter(Boolean).join(" ").slice(0, 4000),
      ];
    }

    sessionStorage.setItem("vendorai_ads_content_draft_v1", JSON.stringify({
      contentGenerationId: contentId,
      variationIndex: index,
      theme: theme || "Conteúdo do Marketing",
      sourceType: type,
      suggestedPlatform: imagens.length > 0 ? "meta" : "google",
      creativeDraft: { headlines, descriptions, imagens },
    }));
    setLocation("/ads?from=content");
  }
'''
s = replace_once(s, insert_after, promote_fn, "content send to ads function")
action_marker = '''            {improvedVariation && (
              <Button'''
button = '''            {contentId && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1 h-7"
                onClick={sendToSponsoredAds}
                title="Leva este conteúdo para Anúncios Patrocinados como criativo de uma nova campanha"
              >
                <Megaphone className="h-3 w-3" />
                Ir para Anúncios Patrocinados
              </Button>
            )}
            {improvedVariation && (
              <Button'''
if action_marker not in s:
    raise RuntimeError("Trecho não encontrado: botão sponsored ads")
s = s.replace(action_marker, button, 1)
write(p, s)


# ---------------------------------------------------------------------------
# Ads frontend: consome o conteúdo selecionado e cria campanha + criativo.
# ---------------------------------------------------------------------------
p = "artifacts/frontend/src/pages/Ads.tsx"
s = read(p)
s = replace_once(s, 'import { useState } from "react";', 'import { useEffect, useState } from "react";', "ads useEffect import")
interface_marker = 'interface ItemBusca { id: string; label: string; imagens?: string[] }\n'
interface_add = interface_marker + '''
interface ImportedContentDraft {
  contentGenerationId: string;
  variationIndex: number;
  theme: string;
  sourceType: string;
  suggestedPlatform: "google" | "meta";
  creativeDraft: { headlines: string[]; descriptions: string[]; imagens: string[] };
}
'''
s = replace_once(s, interface_marker, interface_add, "ads source draft interface")
s = replace_once(
    s,
    '  imagemEscolhidaUrl: "" as string, // vazio = gera com IA; preenchido = usa essa foto real do item\n};',
    '  imagemEscolhidaUrl: "" as string, // vazio = gera com IA; preenchido = usa essa foto real do item\n  contentGenerationId: "" as string,\n};',
    "ads contentGenerationId form",
)
s = replace_once(
    s,
    '  const [justification, setJustification] = useState("");\n\n  const { data: campaigns',
    '''  const [justification, setJustification] = useState("");
  const [sourceDraft, setSourceDraft] = useState<ImportedContentDraft | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("from") !== "content") return;
    try {
      const raw = sessionStorage.getItem("vendorai_ads_content_draft_v1");
      if (!raw) return;
      const draft = JSON.parse(raw) as ImportedContentDraft;
      if (!draft.contentGenerationId || !draft.creativeDraft) return;
      setSourceDraft(draft);
      setForm({
        ...EMPTY_FORM,
        plataforma: draft.suggestedPlatform,
        tipoAnuncio: draft.suggestedPlatform === "meta" ? "imagem" : "rsa_pmax",
        itemTipo: "livre",
        itemLabel: draft.theme || "Conteúdo do Marketing",
        destinoClique: "whatsapp",
        imagemEscolhidaUrl: draft.creativeDraft.imagens[0] ?? "",
        contentGenerationId: draft.contentGenerationId,
      });
      setOpen(true);
      sessionStorage.removeItem("vendorai_ads_content_draft_v1");
      toast({ title: "Conteúdo carregado", description: "A variação escolhida já está anexada como criativo deste rascunho." });
    } catch {
      sessionStorage.removeItem("vendorai_ads_content_draft_v1");
    }
  }, []); // Executa só ao entrar em Anúncios vindo do gerador.

  const { data: campaigns''',
    "ads source draft state/effect",
)
s = replace_once(
    s,
    '        itemLabel: form.modo === "unico" && form.itemTipo !== "livre" ? form.itemLabel : null,',
    '        itemLabel: form.itemLabel || null,\n        contentGenerationId: form.contentGenerationId || null,',
    "ads preserve imported label/id",
)
s = replace_once(
    s,
    '        imagemEscolhidaUrl: form.tipoAnuncio === "imagem" && form.imagemEscolhidaUrl ? form.imagemEscolhidaUrl : null,\n      };',
    '        imagemEscolhidaUrl: form.tipoAnuncio === "imagem" && form.imagemEscolhidaUrl ? form.imagemEscolhidaUrl : null,\n        creativeDraft: sourceDraft?.creativeDraft ?? null,\n      };',
    "ads submit creative draft",
)
s = replace_once(
    s,
    '''      toast({ title: "Campanha criada", description: "Agora gere o criativo antes de aprovar." });
      setOpen(false);
      setForm({ ...EMPTY_FORM });''',
    '''      toast({
        title: "Campanha criada",
        description: sourceDraft ? "O conteúdo do Marketing foi anexado como criativo. Revise e aprove antes de publicar." : "Agora gere o criativo antes de aprovar.",
      });
      setOpen(false);
      setForm({ ...EMPTY_FORM });
      setSourceDraft(null);''',
    "ads source success",
)
# Clear imported source if the user explicitly switches to another item type.
s = replace_once(
    s,
    '                setForm((f) => ({ ...f, itemTipo, itemId: "", itemLabel: "", destinoClique }));',
    '                setSourceDraft(null);\n                setForm((f) => ({ ...f, itemTipo, itemId: "", itemLabel: "", destinoClique, contentGenerationId: "" }));',
    "ads clear imported source",
)
# Banner in campaign dialog.
s = replace_once(
    s,
    '''          <TooltipProvider delayDuration={300}>
          <div className="space-y-4">
            <div>''',
    '''          <TooltipProvider delayDuration={300}>
          <div className="space-y-4">
            {sourceDraft && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4 text-primary" />Conteúdo do Marketing carregado</div>
                <p className="text-xs text-muted-foreground mt-1">{sourceDraft.theme} · variação {sourceDraft.variationIndex + 1}. O texto e a mídia escolhidos serão salvos como o primeiro criativo da campanha.</p>
              </div>
            )}
            <div>''',
    "ads imported source banner",
)
write(p, s)


# ---------------------------------------------------------------------------
# Ads backend: valida a origem e grava a variação escolhida como criativo real.
# ---------------------------------------------------------------------------
p = "artifacts/api-server/src/routes/ads.ts"
s = read(p)
s = replace_once(
    s,
    'import { and, desc, eq, inArray, sql } from "drizzle-orm";\n',
    'import { and, desc, eq, inArray, sql } from "drizzle-orm";\nimport { z } from "zod/v4";\n',
    "ads zod import",
)
s = replace_once(
    s,
    '  generatedSitesTable,\n} from "@workspace/db";',
    '  generatedSitesTable,\n  contentGenerationsTable,\n} from "@workspace/db";',
    "ads content generations import",
)
router_marker = 'const router: IRouter = Router();\n'
router_add = router_marker + '''
const importedCreativeSchema = z.object({
  headlines: z.array(z.string().min(1).max(500)).max(15).default([]),
  descriptions: z.array(z.string().min(1).max(5000)).max(4).default([]),
  imagens: z.array(z.string().min(1).max(4000)).max(10).default([]),
});
'''
s = replace_once(s, router_marker, router_add, "ads imported creative schema")
# Add source content to free/LP summary so later regeneration stays grounded.
source_marker = '''  const partes: string[] = [];
  const nomeNegocio = perfil?.nomeFantasia || perfil?.razaoSocial;'''
source_add = '''  const partes: string[] = [];

  if (campanha.contentGenerationId) {
    const [sourceContent] = await db
      .select({ theme: contentGenerationsTable.theme, type: contentGenerationsTable.type, result: contentGenerationsTable.result })
      .from(contentGenerationsTable)
      .where(and(eq(contentGenerationsTable.id, campanha.contentGenerationId), eq(contentGenerationsTable.tenantId, tenantId)));
    if (sourceContent) {
      partes.push(`Conteúdo de origem do Marketing: ${sourceContent.theme}`);
      partes.push(`Formato original: ${sourceContent.type}`);
      const firstVariation = sourceContent.result?.variations?.[0];
      if (firstVariation) partes.push(`Variação de referência: ${JSON.stringify(firstVariation).slice(0, 5000)}`);
    }
  }

  const nomeNegocio = perfil?.nomeFantasia || perfil?.razaoSocial;'''
s = replace_once(s, source_marker, source_add, "ads source content summary")
old_create = '''  const parsed = insertAdCampaignSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // Código curto e único pra usar como utm_campaign em qualquer link de
  // divulgação dessa campanha (ver adAttribution.ts).
  const utmCode = `vai_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;

  const [row] = await db.insert(adCampaignsTable).values({ ...parsed.data, utmCode }).returning();
  return res.status(201).json(row);'''
new_create = '''  const parsed = insertAdCampaignSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const creativeDraft = req.body?.creativeDraft
    ? importedCreativeSchema.safeParse(req.body.creativeDraft)
    : null;
  if (creativeDraft && !creativeDraft.success) {
    return res.status(400).json({ error: creativeDraft.error.flatten() });
  }

  if (parsed.data.contentGenerationId) {
    const [sourceContent] = await db.select({ id: contentGenerationsTable.id })
      .from(contentGenerationsTable)
      .where(and(eq(contentGenerationsTable.id, parsed.data.contentGenerationId), eq(contentGenerationsTable.tenantId, tenantId)));
    if (!sourceContent) return res.status(422).json({ error: "Conteúdo de origem não encontrado neste tenant" });
  }

  // Código curto e único pra usar como utm_campaign em qualquer link de
  // divulgação dessa campanha (ver adAttribution.ts).
  const utmCode = `vai_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;

  const [row] = await db.insert(adCampaignsTable).values({ ...parsed.data, utmCode }).returning();
  let importedCreative = null;
  if (row && creativeDraft?.success) {
    const draft = creativeDraft.data;
    if (draft.headlines.length || draft.descriptions.length || draft.imagens.length) {
      [importedCreative] = await db.insert(adCreativesTable).values({
        campaignId: row.id,
        headlines: draft.headlines,
        descriptions: draft.descriptions,
        imagens: draft.imagens,
      }).returning();
    }
  }
  return res.status(201).json({ ...row, latestCreative: importedCreative });'''
s = replace_once(s, old_create, new_create, "ads create imported creative")
write(p, s)


# ---------------------------------------------------------------------------
# Conversas real: mantém backend e recursos, melhora UX tipo mensageiro.
# ---------------------------------------------------------------------------
p = "artifacts/frontend/src/pages/Conversations.tsx"
s = read(p)
s = replace_once(
    s,
    '  UserX,\n} from "lucide-react";',
    '  UserX,\n  Search,\n} from "lucide-react";',
    "conversations search icon",
)
s = replace_once(
    s,
    '  const [channelFilter, setChannelFilter] = useState<string>("all");\n',
    '  const [channelFilter, setChannelFilter] = useState<string>("all");\n  const [searchQuery, setSearchQuery] = useState("");\n',
    "conversations search state",
)
s = replace_once(
    s,
    '''    })
    .filter((c) => channelFilter === "all" || c.channel === channelFilter);''',
    '''    })
    .filter((c) => channelFilter === "all" || c.channel === channelFilter)
    .filter((c) => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      const lead = c.leadId ? leadMap.get(c.leadId) : undefined;
      return [lead?.nome, lead?.telefone, lead?.email, channelLabel(c.channel)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });''',
    "conversations search filter",
)
s = replace_once(
    s,
    '<div className="flex flex-col h-full -mx-4 -my-4 md:-mx-8 md:-my-8 overflow-hidden">',
    '<div className="flex flex-col h-full -mx-4 -my-4 md:-mx-8 md:-my-8 overflow-hidden bg-muted/20">',
    "conversations page background",
)
s = replace_once(s, '>\n          WhatsApp\n        </button>', '>\n          Conversas\n        </button>', "conversations tab label")
s = replace_once(
    s,
    'flex-col border-r border-border bg-background w-full md:w-80 md:shrink-0',
    'flex-col border-r border-border bg-background w-full md:w-[360px] md:shrink-0',
    "conversations sidebar width",
)
old_header = '''        <div className="px-4 py-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold">Conversas</h1>
            {totalUnread > 0 && (
              <Badge variant="default" className="text-xs">
                {totalUnread} não lidas
              </Badge>
            )}
          </div>
        </div>'''
new_header = '''        <div className="px-4 py-3 border-b border-border shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-semibold">Conversas</h1>
              <p className="text-[11px] text-muted-foreground">WhatsApp, Instagram, e-mail e chat em uma caixa de entrada</p>
            </div>
            {totalUnread > 0 && (
              <Badge variant="default" className="text-xs">
                {totalUnread} não lidas
              </Badge>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar contato, telefone ou e-mail..."
              className="h-9 pl-9 rounded-full bg-muted/60 border-0 focus-visible:ring-1"
            />
          </div>
        </div>'''
s = replace_once(s, old_header, new_header, "conversations search header")
s = replace_once(
    s,
    '<ScrollArea className="flex-1 px-6 py-4">',
    '<ScrollArea className="flex-1 px-4 md:px-8 py-4 bg-muted/25">',
    "conversations messages background",
)
s = replace_once(
    s,
    '<div className="flex flex-col gap-1">\n            {(() => {',
    '<div className="flex flex-col gap-1 max-w-4xl mx-auto">\n            {(() => {',
    "conversations message max width",
)
s = replace_once(
    s,
    '<div className="px-4 py-3 border-t border-border shrink-0 bg-background">',
    '<div className="px-4 py-3 border-t border-border shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">',
    "conversations composer background",
)
write(p, s)

print("Fase 2 da especificação original aplicada com sucesso.")
