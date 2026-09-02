from pathlib import Path

path = Path("artifacts/frontend/src/pages/SiteGenerator.tsx")
text = path.read_text()

helper_and_core = r'''async function resilientFetch(url: string, init: RequestInit = {}, maxAttempts = 9): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, cache: init.cache ?? "no-store" });
      if (![429, 502, 503, 504].includes(response.status) || attempt === maxAttempts - 1) return response;
      const retryAfter = Number(response.headers.get("retry-after") ?? "");
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 15_000)
        : Math.min(1000 * (2 ** attempt), 12_000);
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts - 1) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(1000 * (2 ** attempt), 12_000)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Não foi possível conectar ao servidor");
}

function CoreEditor({ onNew, tenantId, token }: { onNew: () => void; tenantId: string; token?: string | null }) {
  const [html, setHtml] = useState("");
  const [siteName, setSiteName] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullEditor, setFullEditor] = useState(false);

  async function loadPreview() {
    if (!tenantId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const listRes = await resilientFetch(`/api/tenants/${tenantId}/site-generator`, { headers: headers(token) });
      if (!listRes.ok) {
        throw new Error(listRes.status === 429
          ? "O servidor está temporariamente limitando requisições. O VendorAI tentou novamente automaticamente."
          : `Não foi possível listar os sites (${listRes.status})`);
      }
      const rows = await listRes.json();
      if (!Array.isArray(rows) || !rows.length) throw new Error("Nenhum site criado ainda");
      const latest = [...rows].sort((a: any, b: any) =>
        new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime())[0];
      const siteRes = await resilientFetch(`/api/tenants/${tenantId}/site-generator/${latest.id}`, { headers: headers(token) });
      const site = await siteRes.json().catch(() => ({}));
      if (!siteRes.ok || !site.html) {
        throw new Error(site.error ?? (siteRes.status === 429
          ? "O servidor está temporariamente limitando requisições."
          : "Não foi possível carregar o site"));
      }
      setHtml(site.html);
      setSiteName(site.name ?? latest.name ?? "Site");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível abrir o preview");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadPreview(); }, [tenantId, token]);

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
      <div><p className="text-sm font-semibold">Site pronto para revisar{siteName ? ` — ${siteName}` : ""}</p><p className="text-xs text-muted-foreground">O preview abre direto do site salvo e não depende do carregamento do editor.</p></div>
      <div className="flex flex-wrap gap-2">
        {html && <Button size="sm" variant="outline" onClick={openInNewTab}><Globe className="mr-2 h-4 w-4" />Abrir em nova aba</Button>}
        <Button size="sm" variant="outline" onClick={() => void loadPreview()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Atualizar</Button>
        <Button size="sm" onClick={() => setFullEditor((v) => !v)} disabled={!html}>{fullEditor ? "Ocultar editor" : "Editar / SEO / Publicar"}</Button>
        <Button size="sm" variant="outline" onClick={onNew}><Plus className="mr-2 h-4 w-4" />Criar outro</Button>
      </div>
    </div>
    {loading && <Card><CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando o site salvo… se houver limitação 429, o VendorAI aguardará e tentará novamente.</CardContent></Card>}
    {!loading && loadError && <Card className="border-destructive/30"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-5"><div><p className="text-sm font-semibold text-destructive">Não foi possível abrir o preview agora</p><p className="text-xs text-muted-foreground">{loadError}</p></div><Button size="sm" variant="outline" onClick={() => void loadPreview()}>Tentar novamente</Button></CardContent></Card>}
    {!loading && html && <div className="overflow-hidden rounded-xl border bg-white"><iframe srcDoc={html} title={`Preview ${siteName || "do site"}`} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" className="block w-full border-0" style={{ height: 720 }} /></div>}
    {fullEditor && <div className="rounded-xl border p-3"><CoreSiteGeneratorTab /></div>}
  </div>;
}

'''

start = text.index("function CoreEditor(")
end = text.index("function Governance(", start)
text = text[:start] + helper_and_core + text[end:]

old_bp = 'const { data: bp } = useGetBusinessProfileByTenant(tenantId, { query: { queryKey: getGetBusinessProfileByTenantQueryKey(tenantId), enabled: !!tenantId } });'
new_bp = 'const { data: bp } = useGetBusinessProfileByTenant(tenantId, { query: { queryKey: getGetBusinessProfileByTenantQueryKey(tenantId), enabled: !!tenantId && !editor } });'
if old_bp not in text:
    raise SystemExit("business profile query não encontrada")
text = text.replace(old_bp, new_bp, 1)

old_catalog = 'useEffect(() => { if (!tenantId) return; fetch(`/api/tenants/${tenantId}/produtos-catalogo`, { headers: headers(token), cache: "no-store" }).then((r) => r.ok ? r.json() : []).then((rows) => setCatalog(Array.isArray(rows) ? rows.filter((p: CatalogItem) => p.ativo !== false) : [])).catch(() => setCatalog([])); }, [tenantId, token]);'
new_catalog = 'useEffect(() => { if (!tenantId || editor) return; fetch(`/api/tenants/${tenantId}/produtos-catalogo`, { headers: headers(token), cache: "no-store" }).then((r) => r.ok ? r.json() : []).then((rows) => setCatalog(Array.isArray(rows) ? rows.filter((p: CatalogItem) => p.ativo !== false) : [])).catch(() => setCatalog([])); }, [tenantId, token, editor]);'
if old_catalog not in text:
    raise SystemExit("catalog effect não encontrado")
text = text.replace(old_catalog, new_catalog, 1)

start = text.index("  async function openSites()")
end = text.index("  async function upload(file: File)", start)
open_and_preview = r'''  async function openSites() {
    try {
      const r = await resilientFetch(`/api/tenants/${tenantId}/site-generator`, { headers: headers(token), cache: "no-store" });
      if (!r.ok) throw new Error(r.status === 429 ? "Servidor temporariamente ocupado. Aguarde alguns segundos." : `Erro ${r.status}`);
      const rows = await r.json();
      if (!Array.isArray(rows) || !rows.length) return toast({ title: "Nenhum site criado ainda" });
      setEditor(true);
    } catch (e) {
      toast({ title: "Não foi possível abrir seus sites", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  }

  async function previewLatest() {
    try {
      const listRes = await resilientFetch(`/api/tenants/${tenantId}/site-generator`, { headers: headers(token), cache: "no-store" });
      if (!listRes.ok) throw new Error(listRes.status === 429 ? "Servidor temporariamente ocupado. Aguarde alguns segundos." : `Erro ${listRes.status}`);
      const rows = await listRes.json();
      if (!Array.isArray(rows) || !rows.length) return toast({ title: "Nenhum site criado ainda" });
      const latest = [...rows].sort((a: any, b: any) => new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime())[0];
      const siteRes = await resilientFetch(`/api/tenants/${tenantId}/site-generator/${latest.id}`, { headers: headers(token), cache: "no-store" });
      const site = await siteRes.json().catch(() => ({}));
      if (!siteRes.ok || !site.html) throw new Error(site.error ?? "Não foi possível carregar o site");
      const blob = new Blob([site.html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast({ title: "Não foi possível visualizar o site", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  }
'''
text = text[:start] + open_and_preview + text[end:]

old_editor = 'if (editor) return <div className="space-y-5"><CoreEditor onNew={() => { setEditor(false); setChoosing(true); setError(null); }} /><Governance tenantId={tenantId} token={token} /></div>;'
new_editor = 'if (editor) return <div className="space-y-5"><CoreEditor tenantId={tenantId} token={token} onNew={() => { setEditor(false); setChoosing(true); setError(null); }} /><Governance tenantId={tenantId} token={token} /></div>;'
if old_editor not in text:
    raise SystemExit("render do editor não encontrado")
text = text.replace(old_editor, new_editor, 1)

path.write_text(text)
