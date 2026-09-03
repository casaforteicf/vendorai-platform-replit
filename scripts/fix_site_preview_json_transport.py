from pathlib import Path
import re
from textwrap import dedent

core = Path("artifacts/api-server/src/routes/site_generator_core.ts")
text = core.read_text(encoding="utf-8")

list_block = dedent('''
// GET /tenants/:tenantId/site-generator — list generated sites
router.get("/tenants/:tenantId/site-generator", async (req, res) => {
  const { tenantId } = req.params;

  if (req.query.includeHtml === "0") {
    const rows = await db
      .select({
        id: generatedSitesTable.id,
        name: generatedSitesTable.name,
        siteType: generatedSitesTable.siteType,
        config: generatedSitesTable.config,
        published: generatedSitesTable.published,
        siteSlug: generatedSitesTable.siteSlug,
        createdAt: generatedSitesTable.createdAt,
        updatedAt: generatedSitesTable.updatedAt,
      })
      .from(generatedSitesTable)
      .where(eq(generatedSitesTable.tenantId, tenantId))
      .orderBy(desc(generatedSitesTable.createdAt));
    return res.json(rows);
  }

  const rows = await db
    .select({
      id: generatedSitesTable.id,
      name: generatedSitesTable.name,
      siteType: generatedSitesTable.siteType,
      config: generatedSitesTable.config,
      html: generatedSitesTable.html,
      published: generatedSitesTable.published,
      siteSlug: generatedSitesTable.siteSlug,
      createdAt: generatedSitesTable.createdAt,
      updatedAt: generatedSitesTable.updatedAt,
    })
    .from(generatedSitesTable)
    .where(eq(generatedSitesTable.tenantId, tenantId))
    .orderBy(desc(generatedSitesTable.createdAt));
  return res.json(rows);
});
''').strip()
pattern = re.compile(r'// GET /tenants/:tenantId/site-generator — list generated sites\nrouter\.get\("/tenants/:tenantId/site-generator", async \(req, res\) => \{[\s\S]*?\n\}\);\n\n(?=// GET /tenants/:tenantId/site-generator/:siteId)')
text, count = pattern.subn(list_block + "\n\n", text, count=1)
assert count == 1, f"list route replacements={count}"

detail_block = dedent('''
// GET /tenants/:tenantId/site-generator/:siteId — get single site with html
router.get("/tenants/:tenantId/site-generator/:siteId", async (req, res) => {
  const { tenantId, siteId } = req.params;

  if (req.query.includeHtml === "0") {
    const [row] = await db
      .select({
        id: generatedSitesTable.id,
        tenantId: generatedSitesTable.tenantId,
        name: generatedSitesTable.name,
        siteType: generatedSitesTable.siteType,
        config: generatedSitesTable.config,
        published: generatedSitesTable.published,
        siteSlug: generatedSitesTable.siteSlug,
        seoScore: generatedSitesTable.seoScore,
        seoChecklist: generatedSitesTable.seoChecklist,
        createdAt: generatedSitesTable.createdAt,
        updatedAt: generatedSitesTable.updatedAt,
      })
      .from(generatedSitesTable)
      .where(eq(generatedSitesTable.id, siteId));

    if (!row || row.tenantId !== tenantId) {
      res.status(404).json({ error: "Site not found" });
      return;
    }
    return res.json(row);
  }

  const [row] = await db
    .select()
    .from(generatedSitesTable)
    .where(eq(generatedSitesTable.id, siteId));

  if (!row || row.tenantId !== tenantId) {
    res.status(404).json({ error: "Site not found" });
    return;
  }
  return res.json(row);
});
''').strip()
pattern = re.compile(r'// GET /tenants/:tenantId/site-generator/:siteId — get single site with html\nrouter\.get\("/tenants/:tenantId/site-generator/:siteId", async \(req, res\) => \{[\s\S]*?\n\}\);\n\n(?=// ─── Async generation logic)')
text, count = pattern.subn(detail_block + "\n\n", text, count=1)
assert count == 1, f"detail route replacements={count}"

old = '  return res.json({ status: job.status, result: job.result, error: job.error });'
new = dedent('''
  const result = req.query.includeHtml === "0" && job.result && typeof job.result === "object" && !Array.isArray(job.result)
    ? Object.fromEntries(Object.entries(job.result as Record<string, unknown>).filter(([key]) => key !== "html"))
    : job.result;
  return res.json({ status: job.status, result, error: job.error });
''').strip("\n")
assert old in text, "job response anchor not found"
text = text.replace(old, new, 1)
core.write_text(text, encoding="utf-8")

routes = Path("artifacts/api-server/src/routes/site_generator.ts")
text = routes.read_text(encoding="utf-8")
preview_block = dedent('''
router.get("/tenants/:tenantId/site-generator/:siteId/preview", async (req, res) => {
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
  if (req.query.format === "html") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(site.html);
    return;
  }
  res.json({ site });
});
''').strip()
pattern = re.compile(r'router\.get\("/tenants/:tenantId/site-generator/:siteId/preview", async \(req, res\) => \{[\s\S]*?\n\}\);\n\n(?=router\.get\("/tenants/:tenantId/site-generator/:siteId/sections")')
text, count = pattern.subn(preview_block + "\n\n", text, count=1)
assert count == 1, f"preview route replacements={count}"
routes.write_text(text, encoding="utf-8")

frontend = Path("artifacts/frontend/src/pages/SiteGenerator.tsx")
text = frontend.read_text(encoding="utf-8")
text = text.replace('`/api/tenants/${tenantId}/site-generator`', '`/api/tenants/${tenantId}/site-generator?includeHtml=0`')
text = text.replace('`/api/tenants/${tenantId}/site-generator/jobs/${jobId}?t=${Date.now()}`', '`/api/tenants/${tenantId}/site-generator/jobs/${jobId}?t=${Date.now()}&includeHtml=0`')

pattern = re.compile(r'      // O endpoint de listagem já devolve o HTML salvo\.[\s\S]*?      setSiteName\(site\.name \?\? sorted\.find\(\(item: any\) => item\.id === targetId\)\?\.name \?\? "Site"\);')
replacement = dedent('''
      // HTML grande segue como texto puro; o JSON fica restrito a metadados.
      const previewRes = await resilientFetch(
        `/api/tenants/${tenantId}/site-generator/${targetId}/preview?format=html`,
        { headers: { ...headers(token), Accept: "text/html" }, cache: "no-store" },
        1,
      );
      const siteHtml = await previewRes.text();
      if (!previewRes.ok || !siteHtml.trim()) {
        throw new Error(`Não foi possível carregar o HTML salvo (${previewRes.status})`);
      }
      setSelectedSiteId(targetId);
      setHtml(siteHtml);
      setSiteName(targetSite?.name ?? sorted.find((item: any) => item.id === targetId)?.name ?? "Site");
''').rstrip()
text, count = pattern.subn(replacement, text, count=1)
assert count == 1, f"CoreEditor replacements={count}"

pattern = re.compile(r'      const siteRes = await resilientFetch\(`/api/tenants/\$\{tenantId\}/site-generator/\$\{latest\.id\}`, \{ headers: headers\(token\), cache: "no-store" \}\);\n      const site = await siteRes\.json\(\)\.catch\(\(\) => \(\{\}\)\);\n      if \(!siteRes\.ok \|\| !site\.html\) throw new Error\(site\.error \?\? "Não foi possível carregar o site"\);\n      const blob = new Blob\(\[site\.html\], \{ type: "text/html;charset=utf-8" \}\);')
replacement = dedent('''
      const siteRes = await resilientFetch(`/api/tenants/${tenantId}/site-generator/${latest.id}/preview?format=html`, { headers: { ...headers(token), Accept: "text/html" }, cache: "no-store" });
      const siteHtml = await siteRes.text();
      if (!siteRes.ok || !siteHtml.trim()) throw new Error(`Não foi possível carregar o site (${siteRes.status})`);
      const blob = new Blob([siteHtml], { type: "text/html;charset=utf-8" });
''').rstrip()
text, count = pattern.subn(replacement, text, count=1)
assert count == 1, f"previewLatest replacements={count}"
frontend.write_text(text, encoding="utf-8")
