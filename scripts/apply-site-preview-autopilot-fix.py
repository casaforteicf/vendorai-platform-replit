from pathlib import Path

ROOT = Path('.')

# 1) Site Generator: make preview independent from the generic detail route and add site switcher.
site_path = ROOT / 'artifacts/frontend/src/pages/SiteGenerator.tsx'
site_text = site_path.read_text()
start = site_text.index('function CoreEditor(')
end = site_text.index('\nfunction Governance(', start)
new_core = r'''function CoreEditor({ onNew, tenantId, token }: { onNew: () => void; tenantId: string; token?: string | null }) {
  const [html, setHtml] = useState("");
  const [siteName, setSiteName] = useState("");
  const [sites, setSites] = useState<Array<{ id: string; name?: string; updatedAt?: string; createdAt?: string }>>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullEditor, setFullEditor] = useState(false);

  async function loadPreview(requestedSiteId?: string) {
    if (!tenantId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const listRes = await resilientFetch(`/api/tenants/${tenantId}/site-generator`, { headers: headers(token) }, 2);
      if (!listRes.ok) {
        throw new Error(listRes.status === 429
          ? "O servidor está temporariamente limitando requisições. O VendorAI tentou novamente automaticamente."
          : `Não foi possível listar os sites (${listRes.status})`);
      }
      const rows = await listRes.json();
      if (!Array.isArray(rows) || !rows.length) throw new Error("Nenhum site criado ainda");
      const sorted = [...rows].sort((a: any, b: any) =>
        new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime());
      setSites(sorted);

      const currentExists = selectedSiteId && sorted.some((site: any) => site.id === selectedSiteId);
      const requestedExists = requestedSiteId && sorted.some((site: any) => site.id === requestedSiteId);
      const targetId = requestedExists ? requestedSiteId! : currentExists ? selectedSiteId : sorted[0].id;

      let siteRes = await resilientFetch(`/api/tenants/${tenantId}/site-generator/${targetId}/preview`, { headers: headers(token) }, 2);
      if (siteRes.status === 404) {
        // Compatibilidade durante deploy escalonado: usa a rota legada se a rota dedicada ainda não chegou ao backend.
        siteRes = await resilientFetch(`/api/tenants/${tenantId}/site-generator/${targetId}`, { headers: headers(token) }, 2);
      }
      const body = await siteRes.json().catch(() => ({}));
      const site = body?.site ?? body;
      if (!siteRes.ok) {
        throw new Error(site?.error ?? `Não foi possível carregar o site (${siteRes.status})`);
      }
      if (typeof site?.html !== "string" || !site.html.trim()) {
        throw new Error("O projeto existe, mas o servidor não devolveu o HTML salvo. O VendorAI preservou o site e você pode tentar novamente.");
      }
      setSelectedSiteId(targetId);
      setHtml(site.html);
      setSiteName(site.name ?? sorted.find((item: any) => item.id === targetId)?.name ?? "Site");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível abrir o preview");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelectedSiteId("");
    void loadPreview();
  }, [tenantId, token]);

  function openInNewTab() {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (!popup) {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/20 px-4 py-3">
      <div><p className="text-sm font-semibold">Site pronto para revisar{siteName ? ` — ${siteName}` : ""}</p><p className="text-xs text-muted-foreground">O preview usa diretamente o HTML salvo. Você pode alternar entre todos os sites gerados sem depender do editor.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        {sites.length > 0 && <select aria-label="Selecionar site para visualizar" className="h-9 max-w-[260px] rounded-md border bg-background px-3 text-sm" value={selectedSiteId} onChange={(e) => void loadPreview(e.target.value)} disabled={loading}>
          {sites.map((site) => <option key={site.id} value={site.id}>{site.name || "Site"}{site.updatedAt || site.createdAt ? ` — ${new Date(site.updatedAt ?? site.createdAt ?? "").toLocaleDateString("pt-BR")}` : ""}</option>)}
        </select>}
        {html && <Button size="sm" variant="outline" onClick={openInNewTab}><Globe className="mr-2 h-4 w-4" />Abrir em nova aba</Button>}
        <Button size="sm" variant="outline" onClick={() => void loadPreview(selectedSiteId || undefined)} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Atualizar</Button>
        <Button size="sm" onClick={() => setFullEditor((v) => !v)} disabled={!html}>{fullEditor ? "Ocultar editor" : "Editar / SEO / Publicar"}</Button>
        <Button size="sm" variant="outline" onClick={onNew}><Plus className="mr-2 h-4 w-4" />Criar outro</Button>
      </div>
    </div>
    {loading && <Card><CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando o HTML salvo do site…</CardContent></Card>}
    {!loading && loadError && <Card className="border-destructive/30"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-5"><div><p className="text-sm font-semibold text-destructive">Não foi possível abrir o preview agora</p><p className="text-xs text-muted-foreground">{loadError}</p></div><Button size="sm" variant="outline" onClick={() => void loadPreview(selectedSiteId || undefined)}>Tentar novamente</Button></CardContent></Card>}
    {!loading && html && <div className="overflow-hidden rounded-xl border bg-white"><iframe srcDoc={html} title={`Preview ${siteName || "do site"}`} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" className="block w-full border-0" style={{ height: 720 }} /></div>}
    {fullEditor && <div className="rounded-xl border p-3"><CoreSiteGeneratorTab /></div>}
  </div>;
}
'''
site_text = site_text[:start] + new_core + site_text[end:]
site_path.write_text(site_text)

# 2) API: dedicated preview endpoint with tenant access + no-store.
api_path = ROOT / 'artifacts/api-server/src/routes/site_generator.ts'
api_text = api_path.read_text()
marker = '''router.get("/tenants/:tenantId/site-generator/:siteId/sections", async (req, res) => {'''
preview_route = '''router.get("/tenants/:tenantId/site-generator/:siteId/preview", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, res, tenantId)) return;
  const [site] = await db
    .select({
      id: generatedSitesTable.id,
      name: generatedSitesTable.name,
      html: generatedSitesTable.html,
      siteType: generatedSitesTable.siteType,
      published: generatedSitesTable.published,
      siteSlug: generatedSitesTable.siteSlug,
      createdAt: generatedSitesTable.createdAt,
      updatedAt: generatedSitesTable.updatedAt,
    })
    .from(generatedSitesTable)
    .where(and(eq(generatedSitesTable.id, String(req.params.siteId)), eq(generatedSitesTable.tenantId, tenantId)))
    .limit(1);
  if (!site) {
    res.status(404).json({ error: "Site não encontrado" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ site });
});

'''
assert marker in api_text, 'site sections marker not found'
api_text = api_text.replace(marker, preview_route + marker, 1)
api_path.write_text(api_text)

# 3) Content Autopilot UI: never construct URL directly from an untrusted/scheme-less saved string.
legacy_path = ROOT / 'artifacts/frontend/src/pages/ContentAutopilotLegacyUI.tsx'
legacy_text = legacy_path.read_text()
auth_block = '''function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}
'''
helpers = '''function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function normalizeSiteUrlForBrowser(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const candidate = /^https?:\\/\\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) return null;
    return url.toString().replace(/\\/$/, "");
  } catch {
    return null;
  }
}

function displaySiteHostname(raw: string | null | undefined): string {
  const normalized = normalizeSiteUrlForBrowser(raw);
  if (!normalized) return "seu site";
  try { return new URL(normalized).hostname; } catch { return "seu site"; }
}
'''
assert auth_block in legacy_text, 'legacy auth block not found'
legacy_text = legacy_text.replace(auth_block, helpers, 1)
old_crash = 'config?.siteUrl ? new URL(config.siteUrl).hostname : "seu site"'
assert old_crash in legacy_text, 'unsafe hostname expression not found'
legacy_text = legacy_text.replace(old_crash, 'displaySiteHostname(config?.siteUrl)', 1)
old_save = 'onClick={() => saveConfigMutation.mutate({ siteUrl })}'
assert old_save in legacy_text, 'site URL save handler not found'
legacy_text = legacy_text.replace(old_save, 'onClick={() => saveConfigMutation.mutate({ siteUrl: normalizeSiteUrlForBrowser(siteUrl) })}', 1)
legacy_path.write_text(legacy_text)

# 4) Content Autopilot API: normalize scheme-less domains at the boundary and reject malformed URLs.
core_path = ROOT / 'artifacts/api-server/src/routes/content_autopilot_core.ts'
core_text = core_path.read_text()
access_end = '''  return true;
}

// ── GET /tenants/:tenantId/content-autopilot/config ─────────────────────────
'''
url_helper = '''  return true;
}

function normalizeHttpSiteUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const candidate = /^https?:\\/\\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || !url.hostname.includes(".")) return null;
    return url.toString().replace(/\\/$/, "");
  } catch {
    return null;
  }
}

// ── GET /tenants/:tenantId/content-autopilot/config ─────────────────────────
'''
assert access_end in core_text, 'content autopilot access marker not found'
core_text = core_text.replace(access_end, url_helper, 1)
old_get = '''  const config = await getConfig(tenantId);
  res.json({ config, dataForSeoConfigured: isDataForSeoConfigured() });
'''
new_get = '''  const config = await getConfig(tenantId);
  const normalizedConfig = config?.siteUrl
    ? { ...config, siteUrl: normalizeHttpSiteUrl(config.siteUrl) ?? config.siteUrl }
    : config;
  res.json({ config: normalizedConfig, dataForSeoConfigured: isDataForSeoConfigured() });
'''
assert old_get in core_text, 'content autopilot GET block not found'
core_text = core_text.replace(old_get, new_get, 1)
old_put = '''  const parsed = updateContentAutopilotConfigSchema.safeParse(req.body);
  if (!parsed.success) {
'''
new_put = '''  let payload = req.body;
  if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "siteUrl")) {
    const rawSiteUrl = (payload as { siteUrl?: unknown }).siteUrl;
    if (rawSiteUrl !== null && rawSiteUrl !== undefined && typeof rawSiteUrl !== "string") {
      res.status(422).json({ error: "URL do site inválida" });
      return;
    }
    const normalizedSiteUrl = normalizeHttpSiteUrl(rawSiteUrl as string | null | undefined);
    if (typeof rawSiteUrl === "string" && rawSiteUrl.trim() && !normalizedSiteUrl) {
      res.status(422).json({ error: "Informe uma URL pública válida, por exemplo https://seusite.com" });
      return;
    }
    payload = { ...(payload as Record<string, unknown>), siteUrl: normalizedSiteUrl };
  }

  const parsed = updateContentAutopilotConfigSchema.safeParse(payload);
  if (!parsed.success) {
'''
assert old_put in core_text, 'content autopilot PUT parse marker not found'
core_text = core_text.replace(old_put, new_put, 1)
old_analyze = '''  try {
    const brandTone = await analyzeSiteTone(tenantId, config.siteUrl);
    res.json({ brandTone });
'''
new_analyze = '''  const normalizedSiteUrl = normalizeHttpSiteUrl(config.siteUrl);
  if (!normalizedSiteUrl) {
    res.status(422).json({ error: "A URL configurada é inválida. Salve novamente usando um domínio válido." });
    return;
  }

  try {
    const brandTone = await analyzeSiteTone(tenantId, normalizedSiteUrl);
    res.json({ brandTone });
'''
assert old_analyze in core_text, 'content autopilot analyze marker not found'
core_text = core_text.replace(old_analyze, new_analyze, 1)
core_path.write_text(core_text)

print('patched site preview + content autopilot URL handling')
