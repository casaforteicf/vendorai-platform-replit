from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"pattern not found: {label} in {path}")
    p.write_text(text.replace(old, new, 1))

cfg = "artifacts/frontend/src/pages/ConfiguracoesLegacy.tsx"

replace_once(
    cfg,
    'no_pages: "Nenhuma página encontrada. Verifique se sua conta tem uma página com Instagram Business.",',
    'no_pages: "Nenhuma conta profissional do Instagram foi encontrada. Confirme que a conta é profissional e tente novamente.",',
    "instagram error no_pages",
)

replace_once(
    cfg,
    '''                <p className="text-xs text-muted-foreground mt-0.5">\n                  Instagram, Facebook, Meta Ads, WhatsApp e Messenger ficam juntos neste grupo.\n                </p>''',
    '''                <p className="text-xs text-muted-foreground mt-0.5">\n                  Instagram profissional, anúncios Meta e WhatsApp oficial ficam organizados em um único lugar.\n                </p>''',
    "meta provider intro",
)

replace_once(
    cfg,
    '''                    Meta Business\n                  </h2>\n                  <p className="text-sm text-muted-foreground mt-1">\n                    Uma entrada para conectar e acompanhar Facebook, Instagram, anúncios e WhatsApp oficial.\n                    A Meta pode solicitar confirmações adicionais conforme cada produto.\n                  </p>''',
    '''                    Central Meta\n                  </h2>\n                  <p className="text-sm text-muted-foreground mt-1">\n                    Conecte os serviços que o VendorAI usa no dia a dia. Instagram cuida de conteúdo e mensagens; Meta Ads cuida do patrocínio; WhatsApp cuida do atendimento.\n                  </p>''',
    "meta hub title copy",
)

replace_once(
    cfg,
    '''              <div className="grid gap-3 sm:grid-cols-2">\n                {[\n                  { label: "Instagram profissional", connected: Boolean(igConnection.data?.connected) },\n                  { label: "Facebook / Página", connected: Boolean(igConnection.data?.connected && igConnection.data.pageId) },\n                  { label: "Meta Ads", connected: Boolean(metaAdsConnection?.connected && !metaAdsConnection.pendingAccountSelection) },\n                  { label: "WhatsApp oficial", connected: Boolean(waConnection.data?.connected) },\n                ].map((item) => (''',
    '''              <div className="grid gap-3 sm:grid-cols-3">\n                {[\n                  { label: "Instagram profissional", connected: Boolean(igConnection.data?.connected) },\n                  { label: "Meta Ads", connected: Boolean(metaAdsConnection?.connected && !metaAdsConnection.pendingAccountSelection) },\n                  { label: "WhatsApp oficial", connected: Boolean(waConnection.data?.connected) },\n                ].map((item) => (''',
    "meta hub status cards",
)

replace_once(
    cfg,
    '''                  <p className="text-sm text-muted-foreground mt-1">\n                    Conecte sua conta de anúncios da Meta (Facebook + Instagram) para publicar campanhas de imagem\n                    diretamente pelo VendorAI. Requer o Instagram já conectado (Integrações), pois o anúncio roda\n                    na mesma Página do Facebook vinculada lá. Nenhuma campanha é publicada sem sua confirmação manual.\n                  </p>''',
    '''                  <p className="text-sm text-muted-foreground mt-1">\n                    Conecte sua conta de anúncios da Meta para criar e patrocinar campanhas no Facebook e Instagram.\n                    Para patrocinar uma publicação existente, use a mesma conta profissional conectada no Instagram. Nenhuma campanha é ativada sem sua confirmação.\n                  </p>''',
    "meta ads description",
)

replace_once(
    cfg,
    '''            {/* Instagram DM — OAuth via Meta */}\n            <div className={cn("rounded-xl border bg-card p-6 space-y-5", !showMetaDetails && "hidden")}>''',
    '''            {/* Instagram profissional — conexão direta para conteúdo, DMs e insights */}\n            <div className="rounded-xl border bg-card p-6 space-y-5">''',
    "instagram card always visible",
)

replace_once(
    cfg,
    '''                    Instagram DM — Omnichannel\n                  </h2>\n                  <p className="text-sm text-muted-foreground mt-1">\n                    Conecte sua página do Instagram Business via Meta OAuth para enviar e receber DMs diretamente pelo VendorAI.\n                  </p>''',
    '''                    Instagram profissional\n                  </h2>\n                  <p className="text-sm text-muted-foreground mt-1">\n                    Uma única conexão para publicar conteúdo, receber DMs e acompanhar insights. Para patrocinar publicações, conecte também o Meta Ads.\n                  </p>''',
    "instagram card title description",
)

old_connected = '''                  <div className="rounded-lg bg-muted/30 border p-4 space-y-2">\n                    <div className="flex items-center gap-2">\n                      <span className="text-sm font-medium">Conta:</span>\n                      <span className="text-sm font-semibold text-foreground">@{igConnection.data.username}</span>\n                    </div>\n                    <div className="flex items-center gap-2">\n                      <span className="text-sm font-medium">Page ID:</span>\n                      <code className="text-sm font-mono text-muted-foreground">{igConnection.data.pageId}</code>\n                    </div>\n                    {igConnection.data.tokenExpiresAt && (\n                      <div className="flex items-center gap-2">\n                        <span className="text-sm font-medium">Token expira em:</span>\n                        <span className="text-sm text-muted-foreground">\n                          {format(new Date(igConnection.data.tokenExpiresAt), "dd/MM/yyyy HH:mm")}\n                        </span>\n                      </div>\n                    )}\n                  </div>\n\n                  <div className="flex items-center gap-3">\n                    <Button\n                      onClick={onConnectInstagram}\n                      variant="outline"\n                      className="gap-2"\n                    >\n                      <RefreshCw className="h-4 w-4" />\n                      Reconectar\n                    </Button>\n                    <Button\n                      onClick={onRefreshInstagram}\n                      variant="outline"\n                      disabled={refreshIg.isPending}\n                      className="gap-2"\n                    >\n                      <RefreshCw className="h-4 w-4" />\n                      {refreshIg.isPending ? "Renovando…" : "Renovar token"}\n                    </Button>\n                    <Button\n                      variant="outline"\n                      onClick={onDisconnectInstagramOAuth}\n                      disabled={disconnectIg.isPending}\n                      className="gap-2 text-destructive hover:text-destructive"\n                    >\n                      <Trash2 className="h-4 w-4" />\n                      {disconnectIg.isPending ? "Desconectando…" : "Desconectar"}\n                    </Button>\n                  </div>\n\n                  <div className="rounded-lg bg-muted/50 border p-4 space-y-2">\n                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Webhook de entrada — DMs recebidas</p>\n                    <p className="text-xs text-muted-foreground">Configure o n8n para encaminhar DMs recebidas do Instagram para:</p>\n                    <code className="text-xs block text-muted-foreground">\n                      POST /api/tenants/{tenantId}/webhooks/instagram\n                    </code>\n                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap mt-1">\n{`Headers:\n  X-Webhook-Secret: <seu-webhook-secret>\n  Content-Type: application/json\n\nBody:\n{\n  "igsid": "123456789",\n  "mensagem": "Olá, quero saber mais",\n  "nome": "João Silva"\n}`}\n                    </pre>\n                  </div>'''

new_connected = '''                  <div className="rounded-xl bg-muted/30 border p-4 space-y-4">\n                    <div className="flex flex-wrap items-center justify-between gap-3">\n                      <div>\n                        <p className="text-xs text-muted-foreground">Conta conectada</p>\n                        <p className="text-base font-semibold text-foreground">@{igConnection.data.username}</p>\n                      </div>\n                      {igConnection.data.tokenExpiresAt && (\n                        <div className="text-right">\n                          <p className="text-xs text-muted-foreground">Acesso válido até</p>\n                          <p className="text-sm font-medium">{format(new Date(igConnection.data.tokenExpiresAt), "dd/MM/yyyy")}</p>\n                        </div>\n                      )}\n                    </div>\n\n                    <div>\n                      <p className="text-xs font-medium text-muted-foreground mb-2">O que já está disponível</p>\n                      <div className="flex flex-wrap gap-2">\n                        <Badge variant="secondary"><CheckCircle2 className="h-3 w-3 mr-1" /> Publicar conteúdo</Badge>\n                        <Badge variant="secondary"><CheckCircle2 className="h-3 w-3 mr-1" /> DMs</Badge>\n                        <Badge variant="secondary"><CheckCircle2 className="h-3 w-3 mr-1" /> Insights</Badge>\n                        {metaAdsConnection?.connected && !metaAdsConnection.pendingAccountSelection ? (\n                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">\n                            <CheckCircle2 className="h-3 w-3 mr-1" /> Patrocínio disponível\n                          </Badge>\n                        ) : (\n                          <Badge variant="outline">Patrocínio: conecte Meta Ads</Badge>\n                        )}\n                      </div>\n                    </div>\n                  </div>\n\n                  <div className="flex flex-wrap items-center gap-2">\n                    <Button type="button" onClick={() => window.location.assign("/content")} className="gap-2">\n                      <Wand2 className="h-4 w-4" /> Criar conteúdo\n                    </Button>\n                    <Button type="button" variant="outline" onClick={() => window.location.assign("/ads")} className="gap-2">\n                      <TrendingUp className="h-4 w-4" /> Anúncios patrocinados\n                    </Button>\n                  </div>\n\n                  <div className="flex flex-wrap items-center gap-2 border-t pt-4">\n                    <Button onClick={onConnectInstagram} variant="ghost" size="sm" className="gap-2">\n                      <RefreshCw className="h-4 w-4" /> Reconectar\n                    </Button>\n                    <Button\n                      onClick={onRefreshInstagram}\n                      variant="ghost"\n                      size="sm"\n                      disabled={refreshIg.isPending}\n                      className="gap-2"\n                    >\n                      <RefreshCw className="h-4 w-4" />\n                      {refreshIg.isPending ? "Renovando…" : "Renovar acesso"}\n                    </Button>\n                    <Button\n                      variant="ghost"\n                      size="sm"\n                      onClick={onDisconnectInstagramOAuth}\n                      disabled={disconnectIg.isPending}\n                      className="gap-2 text-destructive hover:text-destructive"\n                    >\n                      <Trash2 className="h-4 w-4" />\n                      {disconnectIg.isPending ? "Desconectando…" : "Desconectar"}\n                    </Button>\n                  </div>\n\n                  {showMetaDetails && (\n                    <div className="rounded-lg bg-muted/50 border p-4 space-y-3">\n                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Detalhes técnicos</p>\n                      {igConnection.data.pageId && (\n                        <div className="flex items-center gap-2">\n                          <span className="text-xs text-muted-foreground">ID técnico:</span>\n                          <code className="text-xs font-mono text-muted-foreground">{igConnection.data.pageId}</code>\n                        </div>\n                      )}\n                      <p className="text-xs text-muted-foreground">Webhook interno para DMs recebidas:</p>\n                      <code className="text-xs block text-muted-foreground">POST /api/tenants/{tenantId}/webhooks/instagram</code>\n                    </div>\n                  )}'''
replace_once(cfg, old_connected, new_connected, "instagram connected experience")

replace_once(
    cfg,
    '''                  <p className="text-sm text-muted-foreground">\n                    Clique no botão abaixo para autorizar a conexão com sua conta do Instagram Business via Meta.\n                  </p>''',
    '''                  <div className="rounded-lg border bg-muted/20 p-4 space-y-2">\n                    <p className="text-sm font-medium">Conecte sua conta profissional do Instagram</p>\n                    <p className="text-sm text-muted-foreground">\n                      O VendorAI solicitará acesso para publicar conteúdo, receber mensagens e acompanhar insights. Depois, você poderá conectar o Meta Ads separadamente para patrocinar.\n                    </p>\n                  </div>''',
    "instagram disconnected copy",
)

content = "artifacts/frontend/src/pages/Content.tsx"
replace_once(
    content,
    '''          description: isNotConnected\n            ? "Configure o Page Access Token e o Page ID em Configurações para publicar no Instagram."\n            : (data.error ?? "Erro desconhecido"),''',
    '''          description: isNotConnected\n            ? "Conecte ou reconecte sua conta profissional do Instagram em Configurações → Integrações."\n            : (data.error ?? "Erro desconhecido"),''',
    "content instagram error copy",
)

print("Instagram UX patch applied")
