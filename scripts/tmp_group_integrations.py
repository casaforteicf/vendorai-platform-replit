from pathlib import Path

path = Path("artifacts/frontend/src/pages/Configuracoes.tsx")
s = path.read_text()

if "Provider group — Google" in s:
    print("Already grouped; nothing to do.")
    raise SystemExit(0)

markers = {
    "cal": "            {/* Google Calendar — OAuth */}",
    "webhook_in": "            {/* Webhook de entrada — WhatsApp Omnichannel (integração técnica no final da aba) */}",
    "meta_hub": "            {/* Hub Meta Business — fluxo principal unificado; cards individuais abaixo preservam detalhes e manutenção */}",
    "wa": "            {/* WhatsApp — OAuth via Meta */}",
    "gads": "            {/* Google Ads — OAuth por tenant (cada lojista com a própria conta) */}",
    "social": "            <SocialIntegrationsPanel mode=\"connect\" />",
    "mads": "            {/* Meta Ads — OAuth por tenant, mesma estrutura do Google Ads acima */}",
    "meta_legacy": "            {/* Meta WhatsApp Cloud API — Legacy Manual */}",
    "evolution": "            {/* Evolution API — WhatsApp via QR Code (self-hosted, sem custo por cliente) */}",
    "messenger": "            {/* Messenger — Facebook Page Access Token */}",
    "instagram": "            {/* Instagram DM — OAuth via Meta */}",
    "webhook_out": "            {/* Webhook de saída */}",
}
for name, marker in markers.items():
    count = s.count(marker)
    if count != 1:
        raise RuntimeError(f"Marker {name!r} expected once, found {count}")

def get_chunk(text: str, start: str, end: str) -> str:
    i = text.index(start)
    j = text.index(end, i)
    return text[i:j]

cal = get_chunk(s, markers["cal"], markers["webhook_in"])
meta_hub = get_chunk(s, markers["meta_hub"], markers["wa"])
wa = get_chunk(s, markers["wa"], markers["gads"])
gads = get_chunk(s, markers["gads"], markers["social"])
mads_original = get_chunk(s, markers["mads"], markers["meta_legacy"])
mads = mads_original
meta_legacy = get_chunk(s, markers["meta_legacy"], markers["evolution"])
messenger = get_chunk(s, markers["messenger"], markers["instagram"])
instagram = get_chunk(s, markers["instagram"], markers["webhook_out"])

hidden = '!showMetaDetails && "hidden"'
replacement = '!showMetaDetails && !metaAdsConnection?.pendingAccountSelection && "hidden"'
if hidden not in mads:
    raise RuntimeError("Meta Ads hidden-state expression not found")
mads = mads.replace(hidden, replacement, 1)

for block in (cal, meta_hub, wa, gads, mads_original, meta_legacy, messenger, instagram):
    if s.count(block) != 1:
        raise RuntimeError("Expected provider block exactly once before moving it")
    s = s.replace(block, "", 1)

google_group = (
    '            {/* Provider group — Google */}\n'
    '            <section className="rounded-2xl border bg-muted/10 p-4 sm:p-5 space-y-4">\n'
    '              <div>\n'
    '                <p className="text-sm font-semibold">Google</p>\n'
    '                <p className="text-xs text-muted-foreground mt-0.5">\n'
    '                  Calendar e Google Ads agrupados no mesmo ecossistema.\n'
    '                </p>\n'
    '              </div>\n'
    '              <div className="space-y-4">\n'
    + cal
    + gads
    + '              </div>\n'
      '            </section>\n\n'
)

meta_group = (
    '            {/* Provider group — Meta */}\n'
    '            <section className="rounded-2xl border-2 border-blue-200/70 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-950/10 p-4 sm:p-5 space-y-4">\n'
    '              <div>\n'
    '                <p className="text-sm font-semibold">Meta</p>\n'
    '                <p className="text-xs text-muted-foreground mt-0.5">\n'
    '                  Instagram, Facebook, Meta Ads, WhatsApp e Messenger ficam juntos neste grupo.\n'
    '                </p>\n'
    '              </div>\n'
    '              <div className="space-y-4">\n'
    + meta_hub
    + mads
    + instagram
    + wa
    + messenger
    + meta_legacy
    + '              </div>\n'
      '            </section>\n\n'
)

anchor = markers["webhook_in"]
if s.count(anchor) != 1:
    raise RuntimeError("Integration group insertion anchor not found exactly once")
s = s.replace(anchor, google_group + meta_group + anchor, 1)

old_flow = '''  function onConnectMetaBusiness() {
    if (!igConnection.data?.connected) {
      void onConnectInstagram();
      return;
    }
    if (!metaAdsConnection?.connected || metaAdsConnection.pendingAccountSelection) {
      void onConnectMetaAds();
      return;
    }
    if (!waConnection.data?.connected) {
'''
new_flow = '''  function onConnectMetaBusiness() {
    if (!igConnection.data?.connected) {
      void onConnectInstagram();
      return;
    }
    if (metaAdsConnection?.pendingAccountSelection) {
      setShowMetaDetails(true);
      toast({
        title: "Escolha a conta Meta Ads",
        description: "A autorização já foi concluída. Selecione a Ad Account logo abaixo no grupo Meta.",
      });
      return;
    }
    if (!metaAdsConnection?.connected) {
      void onConnectMetaAds();
      return;
    }
    if (!waConnection.data?.connected) {
'''
if old_flow not in s:
    raise RuntimeError("Meta Business connect flow not found")
s = s.replace(old_flow, new_flow, 1)

old_label = '''                  {!igConnection.data?.connected
                    ? "Conectar Instagram — etapa 1"
                    : !metaAdsConnection?.connected || metaAdsConnection.pendingAccountSelection
                      ? "Conectar Meta Ads — etapa 2"
                      : !waConnection.data?.connected
                        ? "Conectar WhatsApp — etapa 3"
                        : "Gerenciar conexão Meta"}
'''
new_label = '''                  {!igConnection.data?.connected
                    ? "Conectar Instagram — etapa 1"
                    : metaAdsConnection?.pendingAccountSelection
                      ? "Escolher conta Meta Ads — etapa 2"
                      : !metaAdsConnection?.connected
                        ? "Conectar Meta Ads — etapa 2"
                        : !waConnection.data?.connected
                          ? "Conectar WhatsApp — etapa 3"
                          : "Gerenciar conexão Meta"}
'''
if old_label not in s:
    raise RuntimeError("Meta Business button label expression not found")
s = s.replace(old_label, new_label, 1)

path.write_text(s)
print("Integration grouping applied successfully.")
